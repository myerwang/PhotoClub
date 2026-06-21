import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openTarget, resolveCodexExecutable } from '../../web/lib/platform.mjs';

export class BootstrapError extends Error {
  constructor(stage, message, details = {}) {
    super(message);
    this.name = 'BootstrapError';
    this.stage = stage;
    this.details = details;
  }
}

export function assertSupportedNode(version = process.versions.node) {
  const major = Number.parseInt(String(version).split('.')[0], 10);
  if (!Number.isInteger(major) || major < 18) {
    throw new BootstrapError('runtime', `Codex bundled Node.js 18 or newer is required; detected ${version}.`);
  }
  return version;
}

export function projectRootFromScript(scriptUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(scriptUrl)), '..', '..');
}

export function buildInstallInvocation(pnpmPath, rootDir) {
  return {
    command: pnpmPath,
    args: ['install', '--frozen-lockfile'],
    options: { cwd: rootDir },
  };
}

async function isReadable(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function runChild(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr, stdout }));
  });
}

export async function ensureDependencies({
  rootDir,
  pnpmPath,
  dependencies,
  readable = isReadable,
  runImpl = runChild,
}) {
  const missing = [];
  for (const dependency of dependencies) {
    const manifest = path.join(rootDir, 'node_modules', ...dependency.split('/'), 'package.json');
    if (!await readable(manifest)) missing.push(dependency);
  }
  if (missing.length === 0) return { installed: false, missing: [] };
  if (!pnpmPath) {
    throw new BootstrapError('dependencies', 'Codex bundled pnpm path is required to install project dependencies.', { missing });
  }

  const invocation = buildInstallInvocation(pnpmPath, rootDir);
  const result = await runImpl(invocation.command, invocation.args, invocation.options);
  if (result.code !== 0) {
    throw new BootstrapError(
      'dependencies',
      `Project dependency installation failed: ${(result.stderr || result.stdout || `exit ${result.code}`).trim()}`,
      { missing, exitCode: result.code },
    );
  }
  for (const dependency of dependencies) {
    const manifest = path.join(rootDir, 'node_modules', ...dependency.split('/'), 'package.json');
    if (!await readable(manifest)) {
      throw new BootstrapError('dependencies', `Dependency remains unavailable after installation: ${dependency}`);
    }
  }
  return { installed: true, missing };
}

export function buildServerEnvironment({
  env = process.env,
  codexPath,
  nativeBin,
  nodeBin,
}) {
  const result = { ...env, PHOTO_CODEX_PATH: codexPath };
  delete result.OPENAI_API_KEY;
  const prefixes = [nodeBin, nativeBin].filter(Boolean);
  result.PATH = [...prefixes, env.PATH ?? env.Path ?? ''].filter(Boolean).join(path.delimiter);
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForHealth(url, {
  attempts = 40,
  intervalMs = 250,
  fetchImpl = fetch,
  sleepImpl = sleep,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${url}/api/health`);
      if (response.ok) return { attempts: attempt };
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleepImpl(intervalMs);
  }
  throw new BootstrapError('health', `PhotoClub health check failed for ${url}.`, {
    cause: lastError?.message,
  });
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

async function declaredDependencies(rootDir) {
  const manifest = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  return Object.keys(manifest.dependencies ?? {});
}

function waitForStartup(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => fail(new BootstrapError('server', `Server startup timed out. ${stderr}`.trim())), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('error', onError);
      child.off('close', onClose);
    };
    const finish = (callback, value) => {
      cleanup();
      callback(value);
    };
    const fail = (error) => finish(reject, error);
    const onStdout = (chunk) => {
      stdout += chunk;
      const lineEnd = stdout.indexOf('\n');
      if (lineEnd < 0) return;
      try {
        finish(resolve, JSON.parse(stdout.slice(0, lineEnd)));
      } catch {
        fail(new BootstrapError('server', 'Server returned an invalid startup record.'));
      }
    };
    const onStderr = (chunk) => { stderr += chunk; };
    const onError = (error) => fail(new BootstrapError('server', `Server could not start: ${error.message}`));
    const onClose = (code) => fail(new BootstrapError('server', `Server exited during startup (${code}): ${stderr}`.trim()));
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('error', onError);
    child.once('close', onClose);
  });
}

async function runServerCommand({ rootDir, args, env }) {
  const result = await runChild(process.execPath, [path.join(rootDir, 'web', 'server.mjs'), '--root', rootDir, ...args], { cwd: rootDir, env });
  if (result.code !== 0) throw new BootstrapError('server', (result.stderr || result.stdout || 'Server command failed.').trim());
  process.stdout.write(result.stdout);
}

export async function bootstrap(args = process.argv.slice(2), env = process.env) {
  assertSupportedNode();
  const rootDir = path.resolve(optionValue(args, '--root', projectRootFromScript()));
  const pnpmPath = optionValue(args, '--pnpm', env.PHOTO_PNPM_PATH);
  const dependencies = await declaredDependencies(rootDir);
  const dependencyResult = await ensureDependencies({ rootDir, pnpmPath, dependencies });
  const codexPath = await resolveCodexExecutable({
    env: { ...env, PHOTO_CODEX_PATH: optionValue(args, '--codex', env.PHOTO_CODEX_PATH) },
  }).catch((error) => {
    throw new BootstrapError('codex', error.message);
  });
  const serverEnv = buildServerEnvironment({
    env,
    codexPath,
    nativeBin: optionValue(args, '--native-bin', env.PHOTO_NATIVE_BIN),
    nodeBin: path.dirname(process.execPath),
  });

  if (args.includes('--check')) {
    const result = { ok: true, stage: 'ready', rootDir, nodePath: process.execPath, pnpmPath, codexPath, dependencies: dependencyResult };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  }
  if (args.includes('--stop') || args.includes('--release')) {
    await runServerCommand({ rootDir, args: args.includes('--stop') ? ['--stop'] : ['--release'], env: serverEnv });
    return;
  }

  const serverArgs = [path.join(rootDir, 'web', 'server.mjs'), '--root', rootDir, '--port', optionValue(args, '--port', '0')];
  if (args.includes('--lan')) serverArgs.push('--lan');
  const child = spawn(process.execPath, serverArgs, {
    cwd: rootDir,
    env: serverEnv,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  try {
    const address = await waitForStartup(child);
    const health = await waitForHealth(address.url);
    if (args.includes('--open')) await openTarget(address.url);
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    const result = { ok: true, stage: 'running', ...address, health, dependencies: dependencyResult, codexPath };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  } catch (error) {
    child.kill();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  bootstrap().catch((error) => {
    const safe = error instanceof BootstrapError
      ? error
      : new BootstrapError('bootstrap', error?.message ?? String(error));
    process.stderr.write(`${JSON.stringify({ ok: false, stage: safe.stage, error: safe.message, details: safe.details })}\n`);
    process.exitCode = 1;
  });
}

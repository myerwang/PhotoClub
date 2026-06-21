import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  BootstrapError,
  assertSupportedNode,
  buildInstallInvocation,
  buildServerEnvironment,
  ensureDependencies,
  projectRootFromScript,
  waitForHealth,
} from '../../system/tools/bootstrap.mjs';

test('requires a Node runtime compatible with locked dependencies', () => {
  assert.doesNotThrow(() => assertSupportedNode('18.0.0'));
  assert.throws(
    () => assertSupportedNode('17.9.1'),
    (error) => error instanceof BootstrapError && error.stage === 'runtime',
  );
});

test('resolves the repository root relative to the bootstrap script', () => {
  const script = process.platform === 'win32'
    ? 'file:///C:/PhotoClub/system/tools/bootstrap.mjs'
    : 'file:///home/me/PhotoClub/system/tools/bootstrap.mjs';
  assert.equal(path.basename(projectRootFromScript(script)), 'PhotoClub');
});

test('builds a locked project-local pnpm install invocation', () => {
  assert.deepEqual(buildInstallInvocation('/runtime/pnpm', '/repo'), {
    command: '/runtime/pnpm',
    args: ['install', '--frozen-lockfile'],
    options: { cwd: '/repo' },
  });
});

test('installs dependencies only when the declared packages are unavailable', async () => {
  const calls = [];
  const missing = new Set(['/repo/node_modules/jimp/package.json']);
  const result = await ensureDependencies({
    rootDir: '/repo', pnpmPath: '/runtime/pnpm', dependencies: ['jimp'],
    readable: async (candidate) => !missing.has(candidate),
    runImpl: async (command, args, options) => {
      calls.push({ command, args, options });
      missing.clear();
      return { code: 0 };
    },
  });
  assert.equal(result.installed, true);
  assert.deepEqual(calls[0], {
    command: '/runtime/pnpm', args: ['install', '--frozen-lockfile'], options: { cwd: '/repo' },
  });

  const second = await ensureDependencies({
    rootDir: '/repo', pnpmPath: '/runtime/pnpm', dependencies: ['jimp'],
    readable: async () => true,
    runImpl: async () => { throw new Error('must not install'); },
  });
  assert.equal(second.installed, false);
});

test('dependency installation failure has a structured stage', async () => {
  await assert.rejects(
    ensureDependencies({
      rootDir: '/repo', pnpmPath: '/runtime/pnpm', dependencies: ['jimp'],
      readable: async () => false,
      runImpl: async () => ({ code: 1, stderr: 'network unavailable' }),
    }),
    (error) => error instanceof BootstrapError
      && error.stage === 'dependencies'
      && /network unavailable/.test(error.message),
  );
});

test('builds a task environment without an API key', () => {
  const env = buildServerEnvironment({
    env: { PATH: '/bin', OPENAI_API_KEY: 'secret' },
    codexPath: '/runtime/codex',
    nativeBin: '/runtime/bin',
    nodeBin: '/runtime/node/bin',
  });
  assert.equal(env.PHOTO_CODEX_PATH, '/runtime/codex');
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.PATH.split(path.delimiter)[0], '/runtime/node/bin');
  assert.equal(env.PATH.split(path.delimiter)[1], '/runtime/bin');
});

test('health check retries until the server is ready', async () => {
  let attempts = 0;
  let sleeps = 0;
  const result = await waitForHealth('http://127.0.0.1:1234', {
    attempts: 3,
    fetchImpl: async () => ({ ok: ++attempts === 3 }),
    sleepImpl: async () => { sleeps += 1; },
  });
  assert.equal(result.attempts, 3);
  assert.equal(sleeps, 2);
});

test('health timeout has a structured stage', async () => {
  await assert.rejects(
    waitForHealth('http://127.0.0.1:1234', {
      attempts: 2, fetchImpl: async () => ({ ok: false }), sleepImpl: async () => {},
    }),
    (error) => error instanceof BootstrapError && error.stage === 'health',
  );
});

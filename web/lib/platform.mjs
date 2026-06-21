import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function openCommand(target, { platform = process.platform } = {}) {
  if (platform === 'darwin') return { command: 'open', args: [target] };
  if (platform === 'win32') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', target] };
  }
  return { command: 'xdg-open', args: [target] };
}

function spawnOpen(command, args, spawnImpl) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.removeListener('error', reject);
      child.unref?.();
      resolve(child);
    });
  });
}

export async function openTarget(target, {
  platform = process.platform,
  spawnImpl = spawn,
} = {}) {
  const { command, args } = openCommand(target, { platform });
  try {
    return await spawnOpen(command, args, spawnImpl);
  } catch (error) {
    if (platform !== 'linux' || error?.code !== 'ENOENT') throw error;
    return spawnOpen('gio', ['open', target], spawnImpl);
  }
}

function pathEntries(env, platform) {
  const delimiter = platform === 'win32' ? ';' : ':';
  return (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
}

export function codexCandidates({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
} = {}) {
  const executable = platform === 'win32' ? 'codex.exe' : 'codex';
  const candidates = [env.PHOTO_CODEX_PATH, env.CODEX_PATH];
  candidates.push(...pathEntries(env, platform).map((entry) => path.join(entry, executable)));

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Codex.app/Contents/Resources/codex',
      path.join(homeDir, 'Applications', 'Codex.app', 'Contents', 'Resources', 'codex'),
    );
  } else if (platform === 'win32') {
    for (const base of [env.LOCALAPPDATA, env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean)) {
      candidates.push(
        path.win32.join(base, 'Programs', 'Codex', 'resources', 'codex.exe'),
        path.win32.join(base, 'Codex', 'resources', 'codex.exe'),
        path.win32.join(base, 'Codex', 'codex.exe'),
      );
    }
  } else {
    candidates.push(
      '/usr/bin/codex',
      '/usr/local/bin/codex',
      '/opt/Codex/resources/codex',
      '/opt/codex/resources/codex',
      path.join(homeDir, '.local', 'bin', 'codex'),
    );
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function isExecutable(candidate) {
  try {
    await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveCodexExecutable(options = {}) {
  const executable = options.executable ?? isExecutable;
  for (const candidate of codexCandidates(options)) {
    if (await executable(candidate)) return candidate;
  }
  throw new Error('Codex CLI executable was not found. Start PhotoClub from Codex Desktop so its bundled CLI can be detected.');
}

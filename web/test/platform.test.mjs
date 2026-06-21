import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  codexCandidates,
  openCommand,
  openTarget,
  resolveCodexExecutable,
} from '../lib/platform.mjs';

function childThat(event, value) {
  const child = new EventEmitter();
  child.unref = () => {};
  queueMicrotask(() => child.emit(event, value));
  return child;
}

test('builds the native open command for each desktop platform', () => {
  assert.deepEqual(openCommand('https://localhost:3000', { platform: 'darwin' }), {
    command: 'open', args: ['https://localhost:3000'],
  });
  assert.deepEqual(openCommand('C:\\PhotoClub\\output', { platform: 'win32' }), {
    command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', 'C:\\PhotoClub\\output'],
  });
  assert.deepEqual(openCommand('/home/me/PhotoClub/output', { platform: 'linux' }), {
    command: 'xdg-open', args: ['/home/me/PhotoClub/output'],
  });
});

test('Linux opening falls back to gio when xdg-open is unavailable', async () => {
  const calls = [];
  await openTarget('/home/me/output', {
    platform: 'linux',
    spawnImpl: (command, args) => {
      calls.push({ command, args });
      return command === 'xdg-open'
        ? childThat('error', Object.assign(new Error('missing'), { code: 'ENOENT' }))
        : childThat('spawn');
    },
  });
  assert.deepEqual(calls, [
    { command: 'xdg-open', args: ['/home/me/output'] },
    { command: 'gio', args: ['open', '/home/me/output'] },
  ]);
});

test('prefers an explicit Codex executable and then PATH', async () => {
  const executable = async (candidate) => candidate === '/opt/codex-custom' || candidate === '/usr/local/bin/codex';
  assert.equal(await resolveCodexExecutable({
    env: { PHOTO_CODEX_PATH: '/opt/codex-custom', PATH: '/usr/local/bin:/usr/bin' },
    platform: 'linux', executable,
  }), '/opt/codex-custom');
  assert.equal(await resolveCodexExecutable({
    env: { PATH: '/usr/local/bin:/usr/bin' }, platform: 'linux', executable,
  }), '/usr/local/bin/codex');
});

test('includes known Codex Desktop locations for every platform', () => {
  assert.match(codexCandidates({ platform: 'darwin', env: {}, homeDir: '/Users/me' }).join('\n'), /Codex\.app/);
  assert.match(codexCandidates({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, homeDir: 'C:\\Users\\me' }).join('\n'), /Codex/);
  assert.match(codexCandidates({ platform: 'linux', env: {}, homeDir: '/home/me' }).join('\n'), /codex/i);
});

test('reports a missing Codex Desktop executable', async () => {
  await assert.rejects(
    resolveCodexExecutable({ env: { PATH: '' }, platform: 'linux', homeDir: '/home/me', executable: async () => false }),
    /Codex CLI/,
  );
});

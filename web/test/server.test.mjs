import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createControlServer } from '../server.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'photo-server-'));
  for (const directory of ['profiles/mama', 'input/mama', 'styles', 'system/rules', 'output']) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  await writeFile(path.join(root, 'profiles/mama/multiview_reference.png'), 'profile');
  await writeFile(path.join(root, 'input/mama/a.jpg'), 'input');
  await writeFile(path.join(root, 'styles/sticker.png'), 'style');
  await writeFile(path.join(root, 'styles/sticker.md'), '---\nstyle_id: sticker\nname: 贴纸\nthumbnail: sticker.png\n---\n');
  await writeFile(path.join(root, 'system/rules/output_formats.md'), '### `jp_l`\n- Status: active\n- Label: 7-Eleven L\n- Pixel size: `1051 x 1500`\n');
  await writeFile(path.join(root, 'output/result.png'), 'result');
  return root;
}

async function running(options = {}) {
  const rootDir = options.rootDir ?? await fixture();
  const app = createControlServer({ rootDir, runTaskImpl: async () => ({}) , ...options });
  const address = await app.listen({ port: 0, lan: false });
  return { app, rootDir, base: address.url };
}

async function acquire(base, clientId = 'test-browser') {
  const response = await fetch(`${base}/api/lease/acquire`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId }),
  });
  const body = await response.json();
  return { clientId, token: body.token };
}

function auth(owner) {
  return { 'content-type': 'application/json', 'x-client-id': owner.clientId, 'x-lease-token': owner.token };
}

test('health and catalog return JSON', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const catalog = await (await fetch(`${base}/api/catalog`)).json();
  assert.equal(catalog.profiles[0].id, 'mama');
  assert.equal(catalog.styles[0].id, 'sticker');
});

test('job creation requires the active lease', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const response = await fetch(`${base}/api/jobs/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 423);
  assert.equal((await response.json()).error.code, 'LEASE_REQUIRED');
});

test('generation validates profile style and format IDs', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/jobs/generate`, {
    method: 'POST', headers: auth(owner),
    body: JSON.stringify({ profileIds: ['missing'], styleId: 'sticker', formatId: 'jp_l', extraPrompt: '', quantity: 1 }),
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'SELECTION_INVALID');
});

test('generation accepts multiple profiles and a bounded quantity', async (t) => {
  const rootDir = await fixture();
  await mkdir(path.join(rootDir, 'profiles/baba'), { recursive: true });
  await writeFile(path.join(rootDir, 'profiles/baba/multiview_reference.png'), 'profile');
  const prompts = [];
  const { app, base } = await running({ rootDir, runTaskImpl: async ({ prompt }) => { prompts.push(prompt); return {}; } });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/jobs/generate`, {
    method: 'POST', headers: auth(owner),
    body: JSON.stringify({ profileIds: ['mama', 'baba'], styleId: 'sticker', formatId: 'jp_l', orientation: 'landscape', extraPrompt: '合照', quantity: 2 }),
  });
  assert.equal(response.status, 202);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(prompts[0], /mama/);
  assert.match(prompts[0], /baba/);
  assert.match(prompts[0], /2 张/);
  assert.match(prompts[0], /横向/);
  assert.match(prompts[0], /1500 x 1051/);
});

test('generation rejects empty profiles and invalid quantity', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const owner = await acquire(base);
  for (const body of [
    { profileIds: [], styleId: 'sticker', formatId: 'jp_l', extraPrompt: '', quantity: 1 },
    { profileIds: ['mama'], styleId: 'sticker', formatId: 'jp_l', extraPrompt: '', quantity: 0 },
    { profileIds: ['mama'], styleId: 'sticker', formatId: 'jp_l', extraPrompt: '', quantity: 21 },
    { profileIds: ['mama'], styleId: 'sticker', formatId: 'jp_l', orientation: 'diagonal', extraPrompt: '', quantity: 1 },
  ]) {
    const response = await fetch(`${base}/api/jobs/generate`, { method: 'POST', headers: auth(owner), body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
});

test('profile jobs validate an input directory ID', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/jobs/profile`, {
    method: 'POST', headers: auth(owner), body: JSON.stringify({ inputId: '../mama' }),
  });
  assert.equal(response.status, 400);
});

test('prompt profile jobs let the task name an unnamed character', async (t) => {
  const rootDir = await fixture();
  const prompts = [];
  const { app, base } = await running({
    rootDir,
    runTaskImpl: async ({ prompt }) => {
      prompts.push(prompt);
      const manifestPath = /写入 ([^\n]+\.json)/.exec(prompt)?.[1];
      const stagingPath = /临时路径 ([^，\n]+\.png)/.exec(prompt)?.[1];
      await writeFile(stagingPath, 'profile');
      await writeFile(manifestPath, JSON.stringify({ profileId: '星澜' }));
      return {};
    },
  });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/jobs/profile-prompt`, {
    method: 'POST', headers: auth(owner), body: JSON.stringify({ description: '一位虚构外星人' }),
  });
  assert.equal(response.status, 202);
  const body = await response.json();
  for (let attempt = 0; attempt < 20 && app.queue.snapshot().jobs.find((job) => job.id === body.id)?.status !== 'succeeded'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.match(prompts[0], /一位虚构外星人/);
  assert.match(prompts[0], /自行确定一个简短、明确的名称/);
  const completed = app.queue.snapshot().jobs.find((job) => job.id === body.id);
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.result.profileId, '星澜');
  assert.match(completed.result.outputUrl, /profiles\/%E6%98%9F%E6%BE%9C\/multiview_reference\.png/);
});

test('prompt profile jobs validate names and descriptions', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const owner = await acquire(base);
  for (const requestBody of [
    { description: '' },
    { name: '../bad', description: '人物' },
    { name: 'a'.repeat(41), description: '人物' },
  ]) {
    const response = await fetch(`${base}/api/jobs/profile-prompt`, {
      method: 'POST', headers: auth(owner), body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 400);
  }
});

test('deleting a profile removes only its multiview and preserves input photos', async (t) => {
  const { app, base, rootDir } = await running();
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/profiles/mama`, { method: 'DELETE', headers: auth(owner) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true, profileId: 'mama' });
  await assert.rejects(access(path.join(rootDir, 'profiles/mama/multiview_reference.png')));
  await access(path.join(rootDir, 'input/mama/a.jpg'));
  const catalog = await (await fetch(`${base}/api/catalog`)).json();
  assert.equal(catalog.profiles.some((profile) => profile.id === 'mama'), false);
});

test('deleting an unknown profile returns a structured error', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/profiles/missing`, { method: 'DELETE', headers: auth(owner) });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'PROFILE_NOT_FOUND');
});

test('media only serves scanned profile style and output images', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  assert.equal((await fetch(`${base}/media/profiles/mama/multiview_reference.png`)).status, 200);
  assert.equal((await fetch(`${base}/media/styles/sticker.png`)).status, 200);
  assert.equal((await fetch(`${base}/media/output/result.png`)).status, 200);
  assert.equal((await fetch(`${base}/media/input/mama/a.jpg`)).status, 404);
  assert.equal((await fetch(`${base}/media/output/../styles/sticker.md`)).status, 404);
});

test('open-output cannot accept a caller supplied path', async (t) => {
  const calls = [];
  const { app, base, rootDir } = await running({ openImpl: (command, args) => calls.push({ command, args }) });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/open-output`, {
    method: 'POST', headers: auth(owner), body: JSON.stringify({ path: '/etc' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], { command: '/usr/bin/open', args: [path.join(rootDir, 'output')] });
});

test('open-input only opens the fixed project input directory', async (t) => {
  const calls = [];
  const { app, base, rootDir } = await running({ openImpl: (command, args) => calls.push({ command, args }) });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/open-input`, {
    method: 'POST', headers: auth(owner), body: JSON.stringify({ path: '/etc' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], { command: '/usr/bin/open', args: [path.join(rootDir, 'input')] });
});

test('SSE streams job state events', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const stream = await fetch(`${base}/api/events`);
  const reader = stream.body.getReader();
  app.queue.enqueue({ id: 'event-job', type: 'generate', payload: {} });
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /event-job/);
  await reader.cancel();
});

test('network mode restarts the listener without losing queue state', async (t) => {
  const { app } = await running();
  t.after(() => app.close());
  app.queue.enqueue({ id: 'keep-job', type: 'generate', payload: {} });
  const address = await app.setNetworkMode(true);
  assert.equal(address.host, '0.0.0.0');
  assert.equal(app.queue.snapshot().jobs[0].id, 'keep-job');
});

test('page reload reacquires during shutdown grace without stopping the server', async (t) => {
  const { app, base } = await running({ releaseDelayMs: 20 });
  t.after(() => app.close());
  const owner = await acquire(base, 'before-reload');
  const released = await fetch(`${base}/api/lease/release`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...owner, shutdown: true }),
  });
  assert.equal(released.status, 200);
  const replacement = await acquire(base, 'after-reload');
  assert.ok(replacement.token);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

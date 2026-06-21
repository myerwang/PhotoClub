import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AppError } from '../lib/errors.mjs';
import {
  buildGenerateBatchDefinitions,
  createControlServer,
  createProfileJobDefinition,
  contentType,
  readServableFile,
  resolveMediaPath,
  resolveStyleSelectionPath,
  safeDecodePathSegment,
} from '../server.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'photo-server-'));
  for (const directory of ['profiles/mama', 'input/mama', 'styles', 'system/rules', 'output']) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  await writeFile(path.join(root, 'profiles/mama/multiview_reference.png'), 'profile');
  await writeFile(path.join(root, 'input/mama/a.jpg'), 'input');
  await writeFile(path.join(root, 'styles/sticker.png'), 'style');
  await writeFile(path.join(root, 'styles/sticker.md'), '---\nstyle_id: sticker\nname: 贴纸\n---\n\n- Apply `system/rules/style_base.md`.\n');
  await writeFile(path.join(root, 'styles/film.png'), 'style');
  await writeFile(path.join(root, 'styles/film.md'), '---\nstyle_id: film\nname: 胶片\n---\n\n- Apply `system/rules/style_base.md`.\n');
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

async function writeGenerateOutputs(prompt) {
  const section = prompt.split('最终路径按顺序保存：\n')[1] ?? '';
  const outputPaths = [...section.matchAll(/^\d+\.\s(.+\.png)$/gm)].map((match) => match[1]);
  await Promise.all(outputPaths.map((outputPath) => writeFile(outputPath, `generated:${path.basename(outputPath)}`)));
  return outputPaths;
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

async function waitForJob(app, jobId, message = `expected job ${jobId} to finish`) {
  await waitFor(() => {
    const job = app.queue.snapshot().jobs.find((item) => item.id === jobId);
    return job && ['succeeded', 'failed', 'cancelled'].includes(job.status);
  }, message);
  return app.queue.snapshot().jobs.find((item) => item.id === jobId);
}

function jobOutput(rootDir, fileName) {
  return {
    outputPath: path.join(rootDir, 'output', fileName),
    outputUrl: `/media/output/${fileName}`,
  };
}

test('unit: batch cancel aborts the running task, cancels waiting work, and lets later batches continue', async (t) => {
  const rootDir = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  let firstStarted;
  const started = [];
  const app = createControlServer({
    rootDir,
    runTaskImpl: async ({ prompt, signal }) => {
      started.push(prompt);
      if (prompt === 'first-style') {
        firstStarted?.();
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      await writeFile(path.join(rootDir, 'output', `${prompt}.png`), prompt);
      return { stdout: 'ignored' };
    },
    syncStylePreviewImpl: async () => ({ preview: 'styles/previews/film.jpg', secret: 'ignored' }),
  });
  const firstRunning = new Promise((resolve) => {
    firstStarted = resolve;
  });
  t.after(() => app.close());

  const first = jobOutput(rootDir, 'first-style.png');
  const second = jobOutput(rootDir, 'second-style.png');
  const third = jobOutput(rootDir, 'third-style.png');
  app.queue.enqueue({ id: 'a1', type: 'generate', batchId: 'batch-a', styleId: 'sticker', batchIndex: 0, batchSize: 2, payload: { prompt: 'first-style', outputPaths: [first.outputPath], outputUrls: [first.outputUrl] } });
  app.queue.enqueue({ id: 'a2', type: 'generate', batchId: 'batch-a', styleId: 'film', batchIndex: 1, batchSize: 2, payload: { prompt: 'second-style', outputPaths: [second.outputPath], outputUrls: [second.outputUrl] } });
  app.queue.enqueue({ id: 'b1', type: 'generate', batchId: 'batch-b', styleId: 'film', batchIndex: 0, batchSize: 1, payload: { prompt: 'third-style', outputPaths: [third.outputPath], outputUrls: [third.outputUrl] } });

  await firstRunning;
  assert.equal(app.queue.cancelBatch('batch-a'), 2);

  const firstJob = await waitForJob(app, 'a1');
  const secondJob = await waitForJob(app, 'a2');
  const thirdJob = await waitForJob(app, 'b1');
  assert.deepEqual(started, ['first-style', 'third-style']);
  assert.equal(firstJob.status, 'cancelled');
  assert.equal(secondJob.status, 'cancelled');
  assert.equal(thirdJob.status, 'succeeded');
});

test('unit: generate job results are whitelisted in snapshots and events', async (t) => {
  const rootDir = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const events = [];
  const app = createControlServer({
    rootDir,
    runTaskImpl: async () => {
      await writeFile(path.join(rootDir, 'output', 'whitelist.png'), 'generated');
      return { stdout: 'drop', stderr: 'drop', secret: true };
    },
    syncStylePreviewImpl: async () => ({ preview: 'styles/previews/sticker.jpg', sourcePath: 'drop', secret: true }),
  });
  t.after(() => app.close());
  app.queue.onEvent((event) => {
    if (event.job.id === 'whitelist-generate' && event.job.status === 'succeeded') events.push(event);
  });
  const { outputPath, outputUrl } = jobOutput(rootDir, 'whitelist.png');
  app.queue.enqueue({
    id: 'whitelist-generate',
    type: 'generate',
    styleId: 'sticker',
    payload: { prompt: 'ignored', outputPaths: [outputPath], outputUrls: [outputUrl] },
  });

  const job = await waitForJob(app, 'whitelist-generate');
  assert.deepEqual(job.result, {
    styleId: 'sticker',
    outputUrl,
    outputUrls: [outputUrl],
    preview: 'styles/previews/sticker.jpg',
  });
  assert.deepEqual(events[0].job.result, job.result);
});

test('unit: profile job results are whitelisted in snapshots and events', async (t) => {
  const rootDir = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const events = [];
  const manifestPath = path.join(rootDir, '.control', 'profile.json');
  const stagingPath = path.join(rootDir, '.control', 'profile.png');
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const app = createControlServer({
    rootDir,
    runTaskImpl: async () => {
      await writeFile(stagingPath, 'profile');
      await writeFile(manifestPath, JSON.stringify({ profileId: '星澜' }));
      return { stdout: 'drop', secret: true };
    },
  });
  t.after(() => app.close());
  app.queue.onEvent((event) => {
    if (event.job.id === 'whitelist-profile' && event.job.status === 'succeeded') events.push(event);
  });
  app.queue.enqueue({
    id: 'whitelist-profile',
    type: 'profile',
    payload: { prompt: 'ignored', profileManifestPath: manifestPath, profileStagingPath: stagingPath, existingProfileIds: [] },
  });

  const job = await waitForJob(app, 'whitelist-profile');
  assert.deepEqual(job.result, {
    profileId: '星澜',
    outputUrl: '/media/profiles/%E6%98%9F%E6%BE%9C/multiview_reference.png',
    outputUrls: ['/media/profiles/%E6%98%9F%E6%BE%9C/multiview_reference.png'],
  });
  assert.deepEqual(events[0].job.result, job.result);
});

test('unit: generate output validation rejects directories and symlinks', async (t) => {
  for (const mode of ['directory', 'symlink']) {
    const rootDir = await fixture();
    t.after(() => rm(rootDir, { recursive: true, force: true }));
    const targetPath = path.join(rootDir, 'output', `${mode}.png`);
    if (mode === 'directory') {
      await mkdir(targetPath, { recursive: true });
    } else {
      const realFile = path.join(rootDir, 'output', 'real.png');
      await writeFile(realFile, 'real');
      await symlink(realFile, targetPath);
    }
    const app = createControlServer({
      rootDir,
      runTaskImpl: async () => ({ secret: true }),
    });
    t.after(() => app.close());
    app.queue.enqueue({
      id: `bad-output-${mode}`,
      type: 'generate',
      styleId: 'sticker',
      payload: { prompt: 'ignored', outputPaths: [targetPath], outputUrls: [`/media/output/${mode}.png`] },
    });
    const job = await waitForJob(app, `bad-output-${mode}`);
    assert.equal(job.status, 'failed');
    assert.equal(job.error.code, 'OUTPUT_MISSING');
  }
});

test('unit: profile staging validation rejects directories and symlinks', async (t) => {
  for (const mode of ['directory', 'symlink']) {
    const rootDir = await fixture();
    t.after(() => rm(rootDir, { recursive: true, force: true }));
    const manifestPath = path.join(rootDir, '.control', `${mode}.json`);
    const stagingPath = path.join(rootDir, '.control', `${mode}.png`);
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, JSON.stringify({ profileId: mode === 'directory' ? '星河' : '星澜' }));
    if (mode === 'directory') {
      await mkdir(stagingPath, { recursive: true });
    } else {
      const realFile = path.join(rootDir, '.control', 'real.png');
      await writeFile(realFile, 'real');
      await symlink(realFile, stagingPath);
    }
    const app = createControlServer({
      rootDir,
      runTaskImpl: async () => ({ stdout: 'ignored' }),
    });
    t.after(() => app.close());
    app.queue.enqueue({
      id: `bad-profile-${mode}`,
      type: 'profile',
      payload: { prompt: 'ignored', profileManifestPath: manifestPath, profileStagingPath: stagingPath, existingProfileIds: [] },
    });
    const job = await waitForJob(app, `bad-profile-${mode}`);
    assert.equal(job.status, 'failed');
    assert.equal(job.error.code, 'OUTPUT_MISSING');
  }
});

test('unit: buildGenerateBatchDefinitions fails before any enqueueable batch is returned', () => {
  assert.throws(() => buildGenerateBatchDefinitions({
    rootDir: '/tmp/photo-root',
    profileIds: ['mama'],
    styleIds: ['sticker', 'film'],
    format: { id: 'jp_l', width: 1051, height: 1500 },
    orientation: 'portrait',
    extraPrompt: '',
    quantity: 1,
    buildGeneratePromptImpl({ styleId }) {
      if (styleId === 'film') throw new AppError('PROMPT_BUILD_FAILED', 'prompt failed', 500);
      return 'ok';
    },
  }), (error) => error instanceof AppError && error.code === 'PROMPT_BUILD_FAILED');
});

test('unit: resolveMediaPath returns null for malformed percent-encoding', async (t) => {
  const rootDir = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const target = await resolveMediaPath({ rootDir, pathname: '/media/style-previews/%E0%A4%A.jpg' });
  assert.equal(target, null);
});

test('unit: cancelling during preview sync aborts the job and prevents sync side effects', async (t) => {
  const rootDir = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const sideEffects = [];
  let syncEntered;
  const syncStarted = new Promise((resolve) => {
    syncEntered = resolve;
  });
  const { outputPath, outputUrl } = jobOutput(rootDir, 'sync-cancel.png');
  const app = createControlServer({
    rootDir,
    runTaskImpl: async () => {
      await writeFile(outputPath, 'generated');
      return { stdout: 'ignored' };
    },
    syncStylePreviewImpl: ({ signal }) => new Promise((resolve, reject) => {
      syncEntered();
      const timer = setTimeout(() => {
        sideEffects.push('committed');
        resolve({ preview: 'styles/previews/sticker.jpg' });
      }, 50);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason);
      }, { once: true });
    }),
  });
  t.after(() => app.close());
  app.queue.enqueue({
    id: 'sync-cancel',
    type: 'generate',
    styleId: 'sticker',
    payload: { prompt: 'ignored', outputPaths: [outputPath], outputUrls: [outputUrl] },
  });
  await syncStarted;
  assert.equal(app.queue.cancel('sync-cancel'), true);
  const job = await waitForJob(app, 'sync-cancel');
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(job.status, 'cancelled');
  assert.deepEqual(sideEffects, []);
});

test('unit: cancelling after preview sync commits still succeeds and keeps committed side effects', async (t) => {
  const rootDir = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const sideEffects = [];
  let syncEntered;
  const syncStarted = new Promise((resolve) => {
    syncEntered = resolve;
  });
  const { outputPath, outputUrl } = jobOutput(rootDir, 'sync-committed.png');
  const app = createControlServer({
    rootDir,
    runTaskImpl: async () => {
      await writeFile(outputPath, 'generated');
      return { stdout: 'ignored' };
    },
    syncStylePreviewImpl: () => new Promise((resolve) => {
      syncEntered();
      setTimeout(() => {
        sideEffects.push('committed');
        resolve({ preview: 'styles/previews/sticker.jpg' });
      }, 50);
    }),
  });
  t.after(() => app.close());
  app.queue.enqueue({
    id: 'sync-committed',
    type: 'generate',
    styleId: 'sticker',
    payload: { prompt: 'ignored', outputPaths: [outputPath], outputUrls: [outputUrl] },
  });
  await syncStarted;
  assert.equal(app.queue.cancel('sync-committed'), true);
  const job = await waitForJob(app, 'sync-committed');
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(job.status, 'succeeded');
  assert.deepEqual(job.result, {
    styleId: 'sticker',
    outputUrl,
    outputUrls: [outputUrl],
    preview: 'styles/previews/sticker.jpg',
  });
  assert.deepEqual(sideEffects, ['committed']);
});

test('unit: direct profile job definitions use per-job staging paths instead of final output paths', () => {
  const rootDir = '/tmp/photo-root';
  const directJob = createProfileJobDefinition({
    rootDir,
    profileId: 'mama',
    imagePaths: ['/tmp/photo-root/input/mama/a.jpg'],
    kind: 'input',
    inputId: 'mama',
  });
  const namedPromptJob = createProfileJobDefinition({
    rootDir,
    profileId: '星澜',
    description: '一位虚构外星人',
    kind: 'prompt',
  });

  assert.match(directJob.payload.profileStagingPath, /\/\.control\/profile-[^/]+\.png$/);
  assert.match(namedPromptJob.payload.profileStagingPath, /\/\.control\/profile-[^/]+\.png$/);
  assert.notEqual(directJob.payload.profileStagingPath, namedPromptJob.payload.profileStagingPath);
  assert.match(directJob.payload.prompt, new RegExp(directJob.payload.profileStagingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(namedPromptJob.payload.prompt, new RegExp(namedPromptJob.payload.profileStagingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(directJob.payload.prompt, /profiles\/mama\/multiview_reference\.png/);
  assert.doesNotMatch(namedPromptJob.payload.prompt, /profiles\/%E6%98%9F%E6%BE%9C\/multiview_reference\.png/);
});

test('unit: direct profile jobs fail without staging output and preserve an existing final file', async (t) => {
  const rootDir = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const finalPath = path.join(rootDir, 'profiles', 'mama', 'multiview_reference.png');
  await writeFile(finalPath, 'original-final');
  const app = createControlServer({
    rootDir,
    runTaskImpl: async () => ({ stdout: 'ignored' }),
  });
  t.after(() => app.close());
  app.queue.enqueue(createProfileJobDefinition({
    rootDir,
    jobId: 'direct-missing-staging',
    profileId: 'mama',
    imagePaths: [path.join(rootDir, 'input', 'mama', 'a.jpg')],
    kind: 'input',
    inputId: 'mama',
  }));
  const job = await waitForJob(app, 'direct-missing-staging');
  assert.equal(job.status, 'failed');
  assert.equal(job.error.code, 'OUTPUT_MISSING');
  assert.equal(await readFile(finalPath, 'utf8'), 'original-final');
});

test('unit: direct profile jobs overwrite an existing final file from staging on success', async (t) => {
  const rootDir = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const finalPath = path.join(rootDir, 'profiles', 'mama', 'multiview_reference.png');
  await mkdir(path.join(rootDir, '.control'), { recursive: true });
  await writeFile(finalPath, 'original-final');
  const jobDefinition = createProfileJobDefinition({
    rootDir,
    jobId: 'direct-overwrite',
    profileId: 'mama',
    imagePaths: [path.join(rootDir, 'input', 'mama', 'a.jpg')],
    kind: 'input',
    inputId: 'mama',
  });
  const app = createControlServer({
    rootDir,
    runTaskImpl: async () => {
      await writeFile(jobDefinition.payload.profileStagingPath, 'new-final');
      return { stdout: 'ignored' };
    },
  });
  t.after(() => app.close());
  app.queue.enqueue(jobDefinition);
  const job = await waitForJob(app, 'direct-overwrite');
  assert.equal(job.status, 'succeeded');
  assert.equal(await readFile(finalPath, 'utf8'), 'new-final');
  await assert.rejects(access(jobDefinition.payload.profileStagingPath));
});

test('unit: direct profile jobs cancelled before commit keep the old final file intact', async (t) => {
  const rootDir = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const finalPath = path.join(rootDir, 'profiles', 'mama', 'multiview_reference.png');
  await mkdir(path.join(rootDir, '.control'), { recursive: true });
  await writeFile(finalPath, 'original-final');
  let releaseCommitGate;
  const commitGate = new Promise((resolve) => {
    releaseCommitGate = resolve;
  });
  const jobDefinition = createProfileJobDefinition({
    rootDir,
    jobId: 'direct-pre-abort',
    profileId: 'mama',
    imagePaths: [path.join(rootDir, 'input', 'mama', 'a.jpg')],
    kind: 'input',
    inputId: 'mama',
  });
  const app = createControlServer({
    rootDir,
    runTaskImpl: async () => {
      await writeFile(jobDefinition.payload.profileStagingPath, 'new-final');
      return {};
    },
    beforeProfileCommitImpl: async () => {
      await commitGate;
    },
  });
  t.after(() => app.close());
  app.queue.enqueue(jobDefinition);
  await waitFor(() => app.queue.snapshot().jobs.find((item) => item.id === 'direct-pre-abort')?.status === 'running', 'expected direct profile to be running');
  assert.equal(app.queue.cancel('direct-pre-abort'), true);
  releaseCommitGate();
  const job = await waitForJob(app, 'direct-pre-abort');
  assert.equal(job.status, 'cancelled');
  assert.equal(await readFile(finalPath, 'utf8'), 'original-final');
  await assert.rejects(access(jobDefinition.payload.profileStagingPath));
});

test('unit: readServableFile rejects symlinks and directories but allows regular files', async (t) => {
  const rootDir = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const regular = path.join(rootDir, 'styles', 'regular.jpg');
  const target = path.join(rootDir, 'styles', 'target.jpg');
  const linked = path.join(rootDir, 'styles', 'linked.jpg');
  const directory = path.join(rootDir, 'styles', 'folder.jpg');
  await writeFile(regular, 'regular');
  await writeFile(target, 'target');
  await symlink(target, linked);
  await mkdir(directory, { recursive: true });

  const data = await readServableFile(regular);
  assert.equal(data.toString('utf8'), 'regular');
  await assert.rejects(readServableFile(linked), (error) => error instanceof AppError && error.code === 'NOT_FOUND');
  await assert.rejects(readServableFile(directory), (error) => error instanceof AppError && error.code === 'NOT_FOUND');
});

test('unit: safeDecodePathSegment maps malformed batch ids to a structured not-found error', () => {
  assert.throws(
    () => safeDecodePathSegment('%E0%A4%A', { code: 'BATCH_NOT_FOUND', message: '批次不存在或已结束', status: 404 }),
    (error) => error instanceof AppError && error.code === 'BATCH_NOT_FOUND' && error.status === 404,
  );
});

test('health and catalog return JSON', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const catalog = await (await fetch(`${base}/api/catalog`)).json();
  assert.equal(catalog.profiles[0].id, 'mama');
  assert.deepEqual(catalog.styles.map((style) => style.id), ['film', 'sticker']);
});

test('serves the browser translation module as JavaScript', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const response = await fetch(`${base}/i18n.mjs`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/javascript/);
  assert.match(await response.text(), /export function translate/);
});

test('serves the style selection helper over HTTP as JavaScript', async (t) => {
  try {
    const { app, base } = await running();
    t.after(() => app.close());
    const response = await fetch(`${base}/style-selection.mjs`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.match(await response.text(), /export function setStyleChecked/);
  } catch (error) {
    if (error?.code === 'EPERM') {
      t.skip('sandbox cannot bind the local HTTP listener');
      return;
    }
    throw error;
  }
});

test('style selection module is wired as a fixed JavaScript asset path', async () => {
  const assetPath = resolveStyleSelectionPath('/style-selection.mjs');
  assert.equal(assetPath, path.resolve('web/style-selection.mjs'));
  assert.equal(contentType(assetPath), 'text/javascript; charset=utf-8');
  const asset = await readServableFile(assetPath);
  assert.match(asset.toString('utf8'), /export function setStyleChecked/);
  assert.equal(resolveStyleSelectionPath('/control.js'), null);
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
    body: JSON.stringify({ profileIds: ['missing'], styleIds: ['sticker'], formatId: 'jp_l', extraPrompt: '', quantity: 1 }),
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'SELECTION_INVALID');
});

test('generation accepts ordered style batches, deduplicates duplicate style ids, and ignores malformed custom payloads on preset formats', async (t) => {
  const rootDir = await fixture();
  await mkdir(path.join(rootDir, 'profiles/baba'), { recursive: true });
  await writeFile(path.join(rootDir, 'profiles/baba/multiview_reference.png'), 'profile');
  const prompts = [];
  const { app, base } = await running({
    rootDir,
    runTaskImpl: async ({ prompt }) => {
      prompts.push(prompt);
      await writeGenerateOutputs(prompt);
      return {};
    },
    syncStylePreviewImpl: async ({ styleId, outputPaths }) => ({ styleId, preview: `styles/previews/${styleId}.jpg`, sourcePath: outputPaths.at(-1) }),
  });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/jobs/generate`, {
    method: 'POST', headers: auth(owner),
    body: JSON.stringify({
      profileIds: ['mama', 'baba'],
      styleIds: ['film', 'sticker', 'film'],
      formatId: 'jp_l',
      orientation: 'landscape',
      extraPrompt: '合照',
      quantity: 2,
      customFormat: 'not-an-object',
    }),
  });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.ok(body.batchId);
  assert.equal(body.jobs.length, 2);
  assert.deepEqual(body.jobs.map((job) => job.styleId), ['film', 'sticker']);
  assert.deepEqual(body.jobs.map((job) => job.batchIndex), [0, 1]);
  assert.deepEqual(body.jobs.map((job) => job.batchSize), [2, 2]);
  assert.equal(body.jobs.every((job) => job.batchId === body.batchId), true);
  await waitFor(() => app.queue.snapshot().jobs.every((job) => job.status === 'succeeded'), 'expected style batch jobs to finish');
  assert.match(prompts[0], /mama/);
  assert.match(prompts[0], /baba/);
  assert.match(prompts[0], /2 张/);
  assert.match(prompts[0], /横向/);
  assert.match(prompts[0], /1500 x 1051/);
  assert.match(prompts[0], /styles\/film\.md/);
  assert.match(prompts[1], /styles\/sticker\.md/);
  assert.doesNotMatch(prompts[0], /custom_/);
});

test('generation rejects empty profiles and invalid quantity', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const owner = await acquire(base);
  for (const body of [
    { profileIds: [], styleIds: ['sticker'], formatId: 'jp_l', extraPrompt: '', quantity: 1 },
    { profileIds: ['mama'], styleIds: ['sticker'], formatId: 'jp_l', extraPrompt: '', quantity: 0 },
    { profileIds: ['mama'], styleIds: ['sticker'], formatId: 'jp_l', extraPrompt: '', quantity: 21 },
    { profileIds: ['mama'], styleIds: ['sticker'], formatId: 'jp_l', orientation: 'diagonal', extraPrompt: '', quantity: 1 },
  ]) {
    const response = await fetch(`${base}/api/jobs/generate`, { method: 'POST', headers: auth(owner), body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
});

test('generation validates styleIds before enqueue and never partially enqueues an invalid batch', async (t) => {
  let runs = 0;
  const { app, base } = await running({
    runTaskImpl: async () => {
      runs += 1;
      return {};
    },
  });
  t.after(() => app.close());
  const owner = await acquire(base);

  for (const testCase of [
    {
      status: 400,
      code: 'STYLES_INVALID',
      body: { profileIds: ['mama'], styleIds: [], formatId: 'jp_l', extraPrompt: '', quantity: 1 },
    },
    {
      status: 400,
      code: 'STYLES_INVALID',
      body: { profileIds: ['mama'], styleIds: 'sticker', formatId: 'jp_l', extraPrompt: '', quantity: 1 },
    },
    {
      status: 400,
      code: 'INVALID_ID',
      body: { profileIds: ['mama'], styleIds: ['../bad'], formatId: 'jp_l', extraPrompt: '', quantity: 1 },
    },
    {
      status: 422,
      code: 'SELECTION_INVALID',
      body: { profileIds: ['mama'], styleIds: ['sticker', 'missing'], formatId: 'jp_l', extraPrompt: '', quantity: 1 },
    },
  ]) {
    const response = await fetch(`${base}/api/jobs/generate`, {
      method: 'POST',
      headers: auth(owner),
      body: JSON.stringify(testCase.body),
    });
    assert.equal(response.status, testCase.status);
    assert.equal((await response.json()).error.code, testCase.code);
  }

  assert.equal(app.queue.snapshot().jobs.length, 0);
  assert.equal(runs, 0);
});

test('generation validates custom formats and unknown presets', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const owner = await acquire(base);

  for (const testCase of [
    {
      status: 400,
      code: 'CUSTOM_FORMAT_REQUIRED',
      body: { profileIds: ['mama'], styleIds: ['sticker'], formatId: 'custom', extraPrompt: '', quantity: 1 },
    },
    {
      status: 400,
      code: 'CUSTOM_FORMAT_INVALID',
      body: {
        profileIds: ['mama'],
        styleIds: ['sticker'],
        formatId: 'custom',
        customFormat: { shortEdge: 1800, longEdge: 1200 },
        extraPrompt: '',
        quantity: 1,
      },
    },
    {
      status: 422,
      code: 'SELECTION_INVALID',
      body: {
        profileIds: ['mama'],
        styleIds: ['sticker'],
        formatId: 'missing',
        customFormat: { shortEdge: 1200, longEdge: 1800 },
        extraPrompt: '',
        quantity: 1,
      },
    },
  ]) {
    const response = await fetch(`${base}/api/jobs/generate`, {
      method: 'POST',
      headers: auth(owner),
      body: JSON.stringify(testCase.body),
    });
    assert.equal(response.status, testCase.status);
    assert.equal((await response.json()).error.code, testCase.code);
  }
});

test('generation builds custom landscape prompts for every style in the batch', async (t) => {
  const prompts = [];
  const { app, base } = await running({
    runTaskImpl: async ({ prompt }) => {
      prompts.push(prompt);
      await writeGenerateOutputs(prompt);
      return {};
    },
    syncStylePreviewImpl: async ({ styleId }) => ({ styleId, preview: `styles/previews/${styleId}.jpg` }),
  });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/jobs/generate`, {
    method: 'POST',
    headers: auth(owner),
    body: JSON.stringify({
      profileIds: ['mama'],
      styleIds: ['sticker', 'film'],
      formatId: 'custom',
      customFormat: { shortEdge: 1200, longEdge: 1800 },
      orientation: 'landscape',
      extraPrompt: '',
      quantity: 1,
    }),
  });
  assert.equal(response.status, 202);
  await waitFor(() => app.queue.snapshot().jobs.every((job) => job.status === 'succeeded'), 'expected custom-format jobs to finish');
  assert.equal(prompts.length, 2);
  for (const prompt of prompts) {
    assert.match(prompt, /custom_1200x1800/);
    assert.match(prompt, /1800 x 1200/);
    assert.match(prompt, /横向/);
  }
});

test('generation syncs each successful style preview once with the full output path list', async (t) => {
  const rootDir = await fixture();
  const syncCalls = [];
  const { app, base } = await running({
    rootDir,
    runTaskImpl: async ({ prompt }) => {
      await writeGenerateOutputs(prompt);
      return {};
    },
    syncStylePreviewImpl: async (args) => {
      syncCalls.push(args);
      return { styleId: args.styleId, preview: `styles/previews/${args.styleId}.jpg`, sourcePath: args.outputPaths.at(-1) };
    },
  });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/jobs/generate`, {
    method: 'POST',
    headers: auth(owner),
    body: JSON.stringify({
      profileIds: ['mama'],
      styleIds: ['sticker', 'film'],
      formatId: 'jp_l',
      extraPrompt: '',
      quantity: 2,
    }),
  });
  assert.equal(response.status, 202);
  await waitFor(() => app.queue.snapshot().jobs.every((job) => job.status === 'succeeded'), 'expected preview sync jobs to finish');
  assert.equal(syncCalls.length, 2);
  for (const call of syncCalls) {
    assert.equal(call.rootDir, rootDir);
    assert.equal(call.outputPaths.length, 2);
    assert.match(call.outputPaths[0], /-1\.png$/);
    assert.match(call.outputPaths[1], /-2\.png$/);
    assert.equal(call.sourcePath, undefined);
  }
  const jobs = app.queue.snapshot().jobs;
  assert.equal(jobs.every((job) => job.result?.styleId === job.styleId), true);
});

test('sync preview failure only fails that style job and later styles still run', async (t) => {
  const runOrder = [];
  const { app, base } = await running({
    runTaskImpl: async ({ prompt }) => {
      const styleId = /styles\/([^/]+)\.md/.exec(prompt)?.[1];
      runOrder.push(styleId);
      await writeGenerateOutputs(prompt);
      return {};
    },
    syncStylePreviewImpl: async ({ styleId }) => {
      if (styleId === 'sticker') throw new AppError('STYLE_PREVIEW_SYNC_FAILED', 'preview failed', 500);
      return { styleId, preview: `styles/previews/${styleId}.jpg` };
    },
  });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/jobs/generate`, {
    method: 'POST',
    headers: auth(owner),
    body: JSON.stringify({
      profileIds: ['mama'],
      styleIds: ['sticker', 'film'],
      formatId: 'jp_l',
      extraPrompt: '',
      quantity: 1,
    }),
  });
  assert.equal(response.status, 202);
  await waitFor(
    () => app.queue.snapshot().jobs.every((job) => ['succeeded', 'failed', 'cancelled'].includes(job.status)),
    'expected sync failure batch to reach terminal states',
  );
  const jobs = app.queue.snapshot().jobs;
  assert.deepEqual(runOrder, ['sticker', 'film']);
  assert.equal(jobs.find((job) => job.styleId === 'sticker').status, 'failed');
  assert.equal(jobs.find((job) => job.styleId === 'film').status, 'succeeded');
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

test('media only serves scanned profile preview and output images', async (t) => {
  const rootDir = await fixture();
  await mkdir(path.join(rootDir, 'styles/previews'), { recursive: true });
  await mkdir(path.join(rootDir, '.control'), { recursive: true });
  await writeFile(path.join(rootDir, 'styles/previews/sticker.jpg'), 'preview');
  await writeFile(path.join(rootDir, '.control/style-history.json'), `${JSON.stringify({
    sticker: {
      styleId: 'sticker',
      generatedAt: '2026-06-20T00:00:00.000Z',
      jobId: 'job-sticker',
      sourcePath: path.join(rootDir, 'output/result.png'),
      preview: 'styles/previews/sticker.jpg',
    },
  }, null, 2)}\n`);
  const { app, base } = await running({ rootDir });
  t.after(() => app.close());
  assert.equal((await fetch(`${base}/media/profiles/mama/multiview_reference.png`)).status, 200);
  assert.equal((await fetch(`${base}/media/style-previews/sticker.jpg`)).status, 200);
  assert.equal((await fetch(`${base}/media/output/result.png`)).status, 200);
  assert.equal((await fetch(`${base}/media/input/mama/a.jpg`)).status, 404);
  assert.equal((await fetch(`${base}/media/styles/sticker.png`)).status, 404);
  assert.equal((await fetch(`${base}/media/style-previews/film.jpg`)).status, 404);
  assert.equal((await fetch(`${base}/media/style-previews/%2e%2e%2fstyles%2fsticker.png`)).status, 404);
  assert.equal((await fetch(`${base}/media/output/../styles/sticker.md`)).status, 404);
});

test('authenticated batch cancel only cancels matching batch jobs and leaves later batches runnable', async (t) => {
  let releaseFirst;
  const started = [];
  const { app, base } = await running({
    runTaskImpl: async ({ prompt, signal }) => {
      const styleId = /styles\/([^/]+)\.md/.exec(prompt)?.[1];
      started.push(styleId);
      if (started.length === 1) {
        return new Promise((resolve, reject) => {
          releaseFirst = async () => {
            await writeGenerateOutputs(prompt);
            resolve({});
          };
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      await writeGenerateOutputs(prompt);
      return {};
    },
    syncStylePreviewImpl: async ({ styleId }) => ({ styleId, preview: `styles/previews/${styleId}.jpg` }),
  });
  t.after(() => app.close());
  const owner = await acquire(base);
  const batchAResponse = await fetch(`${base}/api/jobs/generate`, {
    method: 'POST',
    headers: auth(owner),
    body: JSON.stringify({
      profileIds: ['mama'],
      styleIds: ['sticker', 'film'],
      formatId: 'jp_l',
      extraPrompt: '',
      quantity: 1,
    }),
  });
  assert.equal(batchAResponse.status, 202);
  const batchA = await batchAResponse.json();
  const batchBResponse = await fetch(`${base}/api/jobs/generate`, {
    method: 'POST',
    headers: auth(owner),
    body: JSON.stringify({
      profileIds: ['mama'],
      styleIds: ['film'],
      formatId: 'jp_l',
      extraPrompt: '',
      quantity: 1,
    }),
  });
  assert.equal(batchBResponse.status, 202);
  const batchB = await batchBResponse.json();
  const cancelResponse = await fetch(`${base}/api/batches/${batchA.batchId}`, {
    method: 'DELETE',
    headers: auth(owner),
  });
  assert.equal(cancelResponse.status, 200);
  assert.deepEqual(await cancelResponse.json(), { cancelled: 2 });
  await waitFor(
    () => app.queue.snapshot().jobs.find((job) => job.id === batchB.jobs[0].id)?.status === 'succeeded',
    'expected later batch to finish after cancelling the first batch',
  );
  const jobs = app.queue.snapshot().jobs;
  assert.equal(jobs.find((job) => job.id === batchA.jobs[0].id).status, 'cancelled');
  assert.equal(jobs.find((job) => job.id === batchA.jobs[1].id).status, 'cancelled');
  assert.equal(jobs.find((job) => job.id === batchB.jobs[0].id).status, 'succeeded');
  const secondCancelResponse = await fetch(`${base}/api/batches/${batchA.batchId}`, {
    method: 'DELETE',
    headers: auth(owner),
  });
  assert.equal(secondCancelResponse.status, 404);
  assert.equal((await secondCancelResponse.json()).error.code, 'BATCH_NOT_FOUND');
  assert.equal(typeof releaseFirst, 'function');
});

test('open-output cannot accept a caller supplied path', async (t) => {
  const calls = [];
  const { app, base, rootDir } = await running({ openImpl: (target) => calls.push(target) });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/open-output`, {
    method: 'POST', headers: auth(owner), body: JSON.stringify({ path: '/etc' }),
  });
  assert.equal(response.status, 200);
  assert.equal(calls[0], path.join(rootDir, 'output'));
});

test('open-input only opens the fixed project input directory', async (t) => {
  const calls = [];
  const { app, base, rootDir } = await running({ openImpl: (target) => calls.push(target) });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/open-input`, {
    method: 'POST', headers: auth(owner), body: JSON.stringify({ path: '/etc' }),
  });
  assert.equal(response.status, 200);
  assert.equal(calls[0], path.join(rootDir, 'input'));
});

test('creates a canonical style from a staged Codex result', async (t) => {
  const rootDir = await fixture();
  const { app, base } = await running({
    rootDir,
    runTaskImpl: async ({ prompt }) => {
      const stagingPath = /JSON 写入 (.+?)，验证/u.exec(prompt)?.[1];
      await writeFile(stagingPath, JSON.stringify({
        id: 'rainfilm', name: '雨夜胶片', englishName: 'Rain Film', sourcePrompt: '雨夜胶片人像',
        adaptations: ['删除固定人物'], visualRules: ['细腻胶片颗粒'],
        composition: ['平视人像'], lighting: ['柔和霓虹灯'],
      }));
      return {};
    },
  });
  t.after(() => app.close());
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/jobs/style`, {
    method: 'POST', headers: auth(owner), body: JSON.stringify({ prompt: '雨夜胶片人像' }),
  });
  assert.equal(response.status, 202);
  const job = await response.json();
  const finished = await waitForJob(app, job.id);
  assert.equal(finished.status, 'succeeded');
  assert.equal(finished.result.styleId, 'rainfilm');
  assert.match(await readFile(path.join(rootDir, 'styles', 'rainfilm.md'), 'utf8'), /source_type: user/);
});

test('style deletion removes only the plugin MD', async (t) => {
  const { app, base, rootDir } = await running();
  t.after(() => app.close());
  await mkdir(path.join(rootDir, '.control'), { recursive: true });
  await mkdir(path.join(rootDir, 'styles', 'previews'), { recursive: true });
  await writeFile(path.join(rootDir, '.control', 'style-history.json'), '{}');
  await writeFile(path.join(rootDir, 'styles', 'previews', 'film.jpg'), 'preview');
  const owner = await acquire(base);
  const response = await fetch(`${base}/api/styles/film`, { method: 'DELETE', headers: auth(owner) });
  assert.equal(response.status, 200);
  await assert.rejects(access(path.join(rootDir, 'styles', 'film.md')));
  await access(path.join(rootDir, '.control', 'style-history.json'));
  await access(path.join(rootDir, 'styles', 'previews', 'film.jpg'));
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

test('page reload releases and reacquires without stopping the server', async (t) => {
  const { app, base } = await running();
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

test('releasing a page never closes the service automatically', async (t) => {
  const { app, base } = await running();
  t.after(() => app.close());
  const owner = await acquire(base, 'closing-page');
  const released = await fetch(`${base}/api/lease/release`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...owner, shutdown: true }),
  });
  assert.equal(released.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('an owner can explicitly shut down the service', async () => {
  const { app, base } = await running();
  const unauthorized = await fetch(`${base}/api/shutdown`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(unauthorized.status, 423);
  const owner = await acquire(base, 'shutdown-page');
  const response = await fetch(`${base}/api/shutdown`, {
    method: 'POST', headers: auth(owner), body: '{}',
  });
  assert.equal(response.status, 202);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await assert.rejects(fetch(`${base}/api/health`));
  await app.close();
});

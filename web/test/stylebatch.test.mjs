import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  applyResult,
  auditBatch,
  completePage,
  enqueueResults,
  initializeBatch,
  nextResult,
} from '../../system/lib/stylebatch.mjs';

const execFileAsync = promisify(execFile);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'stylebatch-'));
  await mkdir(path.join(root, 'styles'), { recursive: true });
  await initializeBatch(root);
  return root;
}

const googleResults = [
  { rank: 1, page: 1, title: 'Portrait prompts', url: 'https://example.com/prompts?utm_source=google' },
  { rank: 2, page: 1, title: 'More prompts', url: 'https://other.example/people/' },
];

test('queues Google results in rank order and deduplicates normalized URLs', async () => {
  const root = await fixture();
  const queued = await enqueueResults(root, [googleResults[1], googleResults[0], { ...googleResults[0], rank: 3, url: 'https://example.com/prompts' }]);
  assert.equal(queued.added, 2);
  assert.deepEqual((await nextResult(root)).rank, 1);
});

test('applies one accepted result and writes a sourced formal style', async () => {
  const root = await fixture();
  await enqueueResults(root, googleResults);
  const result = await applyResult(root, {
    rank: 1,
    status: 'accepted',
    reason: 'Distinct portrait lighting prompt in page body.',
    promptLocation: 'Section: Studio portrait example',
    styles: [{
      id: 'rimlight', name: '轮廓光', englishName: 'Rim Light Portrait',
      sourcePrompt: 'A studio portrait with a strong rim light and deep neutral backdrop.',
      adaptations: ['Replace the fixed subject with the selected character reference.'],
      visualRules: ['Use a strong rim light against a deep neutral backdrop.'],
      composition: ['Frame the person as a studio portrait.'],
      lighting: ['Strong edge light with restrained frontal fill.'],
    }],
  }, { now: () => new Date('2026-06-19T10:00:00Z') });
  assert.deepEqual(result.created, ['rimlight']);
  const markdown = await readFile(path.join(root, 'styles/rimlight.md'), 'utf8');
  assert.match(markdown, /source_url: https:\/\/example\.com\/prompts\?utm_source=google/);
  assert.match(markdown, /thumbnail: rimlight\.png/);
  assert.match(markdown, /Apply `system\/rules\/style_base\.md`/);
  assert.equal((await nextResult(root)).rank, 2);
});

test('refuses out-of-order results and existing style files', async () => {
  const root = await fixture();
  await enqueueResults(root, googleResults);
  await assert.rejects(applyResult(root, { rank: 2, status: 'rejected', reason: 'Not a person prompt.', styles: [] }), /next queued result is 1/);
  await writeFile(path.join(root, 'styles/taken.md'), 'existing');
  await assert.rejects(applyResult(root, {
    rank: 1, status: 'accepted', reason: 'Portrait prompt.', promptLocation: 'Example',
    styles: [{ id: 'taken', name: '占用', englishName: 'Taken', sourcePrompt: 'Portrait prompt', adaptations: ['Replace subject'], visualRules: ['Portrait'], composition: ['Close-up'], lighting: ['Soft light'] }],
  }), /already exists/);
});

test('completes after three fully processed pages without new styles', async () => {
  const root = await fixture();
  for (let page = 1; page <= 3; page += 1) {
    const rank = page;
    await enqueueResults(root, [{ rank, page, title: `Page ${page}`, url: `https://example.com/${page}` }]);
    await applyResult(root, { rank, status: 'rejected', reason: 'No suitable person prompt.', styles: [] });
    await completePage(root, page);
  }
  const state = JSON.parse(await readFile(path.join(root, 'work/styles/state.json'), 'utf8'));
  assert.equal(state.status, 'complete');
  assert.equal(state.empty_quality_pages, 3);
  assert.match(state.stop_reason, /3 consecutive/i);
});

test('settling the same page twice does not increment empty-page progress twice', async () => {
  const root = await fixture();
  await enqueueResults(root, [{ rank: 1, page: 1, title: 'Page 1', url: 'https://example.com/1' }]);
  await applyResult(root, { rank: 1, status: 'rejected', reason: 'No suitable person prompt.', styles: [] });
  await completePage(root, 1);
  const repeated = await completePage(root, 1);
  assert.equal(repeated.emptyQualityPages, 1);
});

test('audit treats missing thumbnails as expected but reports missing source files', async () => {
  const root = await fixture();
  await enqueueResults(root, googleResults.slice(0, 1));
  await applyResult(root, {
    rank: 1, status: 'accepted', reason: 'Portrait prompt.', promptLocation: 'Example',
    styles: [{ id: 'softbox', name: '柔光箱', englishName: 'Softbox Portrait', sourcePrompt: 'A portrait under a broad softbox.', adaptations: ['Replace subject'], visualRules: ['Broad soft light'], composition: ['Portrait crop'], lighting: ['Large softbox'] }],
  });
  const first = await auditBatch(root);
  assert.deepEqual(first.errors, []);
  assert.match(first.warnings[0], /thumbnail missing/i);
  await writeFile(path.join(root, 'styles/softbox.md'), 'broken');
  const second = await auditBatch(root);
  assert.match(second.errors[0], /invalid style metadata/i);
});

test('CLI returns machine-readable status for an initialized batch', async () => {
  const root = await fixture();
  const cli = path.resolve('system/tools/stylebatch.mjs');
  const { stdout } = await execFileAsync(process.execPath, [cli, 'status', '--root', root]);
  const status = JSON.parse(stdout);
  assert.equal(status.state.status, 'ready');
  assert.equal(status.next, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createGenerationBatch, readGenerationHistory, reconcileGenerationBatch, updateGenerationBatch } from '../lib/generationhistory.mjs';

test('persists batches and reconciles completed output files after restart', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'photo-history-'));
  const outputPath = path.join(rootDir, 'output', 'one.png');
  await createGenerationBatch(rootDir, { id: 'batch1', status: 'running', total: 2, items: [
    { id: 'one', outputPath, status: 'pending' },
    { id: 'two', outputPath: path.join(rootDir, 'output', 'two.png'), status: 'pending' },
  ] });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, 'image');
  const batch = await reconcileGenerationBatch(rootDir, 'batch1');
  assert.equal(batch.completed, 1);
  assert.equal(batch.status, 'interrupted');
  assert.deepEqual(batch.items.map((item) => item.status), ['completed', 'pending']);

  await updateGenerationBatch(rootDir, 'batch1', (current) => ({ ...current, status: 'paused_quota' }));
  const history = await readGenerationHistory(rootDir);
  assert.equal(history.batches[0].status, 'paused_quota');
});

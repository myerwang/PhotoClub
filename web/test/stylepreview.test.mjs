import test from 'node:test';
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AppError } from '../lib/errors.mjs';
import { readStyleHistory, syncStylePreview } from '../lib/stylepreview.mjs';

async function createRoot() {
  return mkdtemp(path.join(tmpdir(), 'style-preview-'));
}

async function writeOutput(rootDir, name, content) {
  const outputPath = path.join(rootDir, 'output', name);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);
  return outputPath;
}

async function expectAppErrorCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof AppError && error.code === code);
}

test('readStyleHistory returns an empty object when history is missing', async () => {
  const rootDir = await createRoot();
  assert.deepEqual(await readStyleHistory(rootDir), {});
});

test('readStyleHistory rejects malformed and non-object history', async () => {
  const rootDir = await createRoot();
  const historyPath = path.join(rootDir, '.control', 'style-history.json');
  await mkdir(path.dirname(historyPath), { recursive: true });

  await writeFile(historyPath, '{ not json');
  await expectAppErrorCode(readStyleHistory(rootDir), 'STYLE_HISTORY_INVALID');

  await writeFile(historyPath, '[]');
  await expectAppErrorCode(readStyleHistory(rootDir), 'STYLE_HISTORY_INVALID');
});

test('syncStylePreview uses the last output path and preserves existing history', async () => {
  const rootDir = await createRoot();
  const firstOutput = await writeOutput(rootDir, 'first.txt', 'first');
  const lastOutput = await writeOutput(rootDir, 'last.txt', 'last');
  const historyPath = path.join(rootDir, '.control', 'style-history.json');
  await mkdir(path.dirname(historyPath), { recursive: true });
  const existingRecord = {
    styleId: 'other',
    generatedAt: '2026-06-19T11:00:00.000Z',
    jobId: 'job-old',
    sourcePath: '/gone/other.png',
    preview: 'styles/previews/other.jpg',
  };
  await writeFile(historyPath, JSON.stringify({ other: existingRecord }));

  const calls = [];
  const record = await syncStylePreview({
    rootDir,
    styleId: 'sticker',
    outputPaths: [firstOutput, lastOutput],
    jobId: 'job-1',
    generatedAt: '2026-06-19T12:00:00.000Z',
    resizeImpl: async (sourcePath, targetPath) => {
      calls.push([sourcePath, targetPath]);
      await copyFile(sourcePath, targetPath);
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], lastOutput);
  assert.equal(path.dirname(calls[0][1]), path.join(rootDir, 'styles', 'previews'));
  assert.match(path.basename(calls[0][1]), /^\.sticker\.[^.]+\.jpg$/u);
  assert.notEqual(calls[0][1], path.join(rootDir, 'styles', 'previews', 'sticker.jpg'));
  assert.deepEqual(record, {
    styleId: 'sticker',
    generatedAt: '2026-06-19T12:00:00.000Z',
    jobId: 'job-1',
    sourcePath: lastOutput,
    preview: 'styles/previews/sticker.jpg',
  });
  assert.equal(await readFile(path.join(rootDir, 'styles', 'previews', 'sticker.jpg'), 'utf8'), 'last');

  const history = await readStyleHistory(rootDir);
  assert.deepEqual(history.other, existingRecord);
  assert.deepEqual(history.sticker, record);
});

test('syncStylePreview rejects unsafe ids and empty inputs', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: '../bad',
      outputPaths: [sourcePath],
      jobId: 'job-1',
      resizeImpl: async () => {},
    }),
    'STYLE_PREVIEW_INPUT_INVALID',
  );

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [],
      jobId: 'job-1',
      resizeImpl: async () => {},
    }),
    'STYLE_PREVIEW_INPUT_INVALID',
  );

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [sourcePath],
      jobId: '',
      resizeImpl: async () => {},
    }),
    'STYLE_PREVIEW_INPUT_INVALID',
  );
});

test('syncStylePreview leaves no success history behind when resize fails', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [sourcePath],
      jobId: 'job-1',
      resizeImpl: async () => {
        throw new Error('resize failed');
      },
    }),
    'STYLE_PREVIEW_SYNC_FAILED',
  );

  assert.deepEqual(await readStyleHistory(rootDir), {});
  await assert.rejects(readFile(path.join(rootDir, 'styles', 'previews', 'sticker.jpg'), 'utf8'));
});

test('syncStylePreview rejects unreadable source paths', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');
  let accessMode;

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [sourcePath],
      jobId: 'job-1',
      accessImpl: async (_path, mode) => {
        accessMode = mode;
        const error = new Error('permission denied');
        error.code = 'EACCES';
        throw error;
      },
      resizeImpl: async () => {
        throw new Error('should not run');
      },
    }),
    'STYLE_PREVIEW_SYNC_FAILED',
  );

  assert.equal(accessMode, constants.R_OK);
  assert.deepEqual(await readStyleHistory(rootDir), {});
});

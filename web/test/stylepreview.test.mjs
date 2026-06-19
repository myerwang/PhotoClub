import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  copyFile,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

function createLockTiming() {
  let nowMs = Date.now();
  const sleepers = [];
  const timers = new Set();
  let unrefCount = 0;

  return {
    options: {
      heartbeatMs: 10,
      nowImpl: () => new Date(nowMs),
      retryMs: 5,
      sleepImpl: async () => {
        const sleeper = deferred();
        sleepers.push(sleeper);
        await sleeper.promise;
      },
      staleMs: 30,
      timeoutMs: 500,
      setIntervalImpl(callback) {
        const timer = {
          callback,
          unref() {
            unrefCount += 1;
          },
        };
        timers.add(timer);
        return timer;
      },
      clearIntervalImpl(timer) {
        timers.delete(timer);
      },
    },
    advance(ms) {
      nowMs += ms;
    },
    async heartbeatAll() {
      await Promise.all([...timers].map((timer) => timer.callback()));
      await new Promise((resolve) => setImmediate(resolve));
    },
    releaseNextSleep() {
      const sleeper = sleepers.shift();
      assert.ok(sleeper, 'expected a pending lock retry');
      sleeper.resolve();
    },
    get pendingSleeps() {
      return sleepers.length;
    },
    get timerCount() {
      return timers.size;
    },
    get nowMs() {
      return nowMs;
    },
    get unrefCount() {
      return unrefCount;
    },
  };
}

async function replaceLockOwner(rootDir, ownerToken, pid = process.pid) {
  const lockFilePath = path.join(rootDir, '.control', 'style-history.lock');
  const lockStats = await stat(lockFilePath);

  if (lockStats.isDirectory()) {
    const entries = await readdir(lockFilePath);
    await Promise.all(entries.map((entry) => unlink(path.join(lockFilePath, entry))));
    await rmdir(lockFilePath);
    await mkdir(lockFilePath);
    await writeFile(
      path.join(lockFilePath, `${ownerToken}.json`),
      JSON.stringify({ ownerToken, pid }),
      { flag: 'wx' },
    );
    return;
  }

  await unlink(lockFilePath);
  await writeFile(lockFilePath, JSON.stringify({ ownerToken, pid }), { flag: 'wx' });
}

async function readLockLease(rootDir) {
  const lockDirectory = path.join(rootDir, '.control', 'style-history.lock');
  const [entry] = await readdir(lockDirectory);
  return JSON.parse(await readFile(path.join(lockDirectory, entry), 'utf8'));
}

async function writeLockLease(rootDir, ownerToken, pid) {
  const lockDirectory = path.join(rootDir, '.control', 'style-history.lock');
  await mkdir(lockDirectory, { recursive: true });
  await writeFile(
    path.join(lockDirectory, `${ownerToken}.json`),
    JSON.stringify({ ownerToken, pid }),
  );
}

async function runNodeModule(source) {
  const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  return { exitCode, stderr, stdout };
}

async function readLockOwner(rootDir) {
  const lockFilePath = path.join(rootDir, '.control', 'style-history.lock');
  const lockStats = await stat(lockFilePath);
  if (lockStats.isDirectory()) {
    const [entry] = await readdir(lockFilePath);
    return JSON.parse(await readFile(path.join(lockFilePath, entry), 'utf8')).ownerToken;
  }
  return JSON.parse(await readFile(lockFilePath, 'utf8')).ownerToken;
}

async function removeLock(rootDir) {
  const lockFilePath = path.join(rootDir, '.control', 'style-history.lock');
  const lockStats = await stat(lockFilePath);
  if (lockStats.isDirectory()) {
    const entries = await readdir(lockFilePath);
    await Promise.all(entries.map((entry) => unlink(path.join(lockFilePath, entry))));
    await rmdir(lockFilePath);
    return;
  }
  await unlink(lockFilePath);
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

test('syncStylePreview stores the local process pid in its lease', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');
  let lease;

  await syncStylePreview({
    rootDir,
    styleId: 'sticker',
    outputPaths: [sourcePath],
    jobId: 'job-1',
    resizeImpl: async (_sourcePath, targetPath) => {
      lease = await readLockLease(rootDir);
      await writeFile(targetPath, 'preview');
    },
  });

  assert.equal(lease.pid, process.pid);
  assert.equal(typeof lease.ownerToken, 'string');
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
  const timing = createLockTiming();

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [sourcePath],
      jobId: 'job-1',
      lockOptions: timing.options,
      resizeImpl: async (_sourcePath, targetPath) => {
        await writeFile(targetPath, 'partial');
        throw new Error('resize failed');
      },
    }),
    'STYLE_PREVIEW_SYNC_FAILED',
  );

  assert.deepEqual(await readStyleHistory(rootDir), {});
  const previewDir = path.join(rootDir, 'styles', 'previews');
  const controlDir = path.join(rootDir, '.control');
  assert.deepEqual(await readdir(previewDir), []);
  assert.deepEqual(await readdir(controlDir), []);
  assert.equal(timing.timerCount, 0);
  assert.equal(timing.unrefCount, 1);
});

test('syncStylePreview keeps the old preview readable until resize completes', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');
  const previewPath = path.join(rootDir, 'styles', 'previews', 'sticker.jpg');
  const historyPath = path.join(rootDir, '.control', 'style-history.json');
  const events = [];
  await mkdir(path.dirname(previewPath), { recursive: true });
  await writeFile(previewPath, 'old-preview');

  await syncStylePreview({
    rootDir,
    styleId: 'sticker',
    outputPaths: [sourcePath],
    jobId: 'job-1',
    resizeImpl: async (_sourcePath, targetPath) => {
      events.push('resize');
      assert.equal(await readFile(previewPath, 'utf8'), 'old-preview');
      assert.deepEqual(await readdir(path.dirname(previewPath)), ['sticker.jpg']);
      await writeFile(targetPath, 'new-preview');
    },
    copyFileImpl: async (from, to) => {
      events.push('backup');
      assert.equal(await readFile(previewPath, 'utf8'), 'old-preview');
      await copyFile(from, to);
    },
    renameImpl: async (from, to) => {
      events.push(to === previewPath ? 'install' : to === historyPath ? 'commit' : 'rename');
      await rename(from, to);
    },
  });

  assert.deepEqual(events, ['resize', 'backup', 'install', 'commit']);
  assert.equal(await readFile(previewPath, 'utf8'), 'new-preview');
});

test('syncStylePreview rejects ownership loss before installing the final preview', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');
  const previewPath = path.join(rootDir, 'styles', 'previews', 'sticker.jpg');
  await mkdir(path.dirname(previewPath), { recursive: true });
  await writeFile(previewPath, 'old-preview');

  let caught;
  try {
    await syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [sourcePath],
      jobId: 'job-1',
      resizeImpl: async (_sourcePath, targetPath) => {
        await writeFile(targetPath, 'new-preview');
        await replaceLockOwner(rootDir, 'replacement-before-install');
      },
    });
  } catch (error) {
    caught = error;
  }

  try {
    assert.ok(caught instanceof AppError);
    assert.equal(caught.code, 'STYLE_PREVIEW_SYNC_FAILED');
    assert.equal(await readFile(previewPath, 'utf8'), 'old-preview');
    assert.deepEqual(await readStyleHistory(rootDir), {});
    assert.deepEqual(await readdir(path.dirname(previewPath)), ['sticker.jpg']);
    assert.equal(await readLockOwner(rootDir), 'replacement-before-install');
  } finally {
    await removeLock(rootDir);
  }
});

test('syncStylePreview rejects ownership loss before history commit and rolls back', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');
  const previewPath = path.join(rootDir, 'styles', 'previews', 'sticker.jpg');
  const historyPath = path.join(rootDir, '.control', 'style-history.json');
  const oldRecord = {
    styleId: 'sticker',
    generatedAt: '2026-06-19T11:00:00.000Z',
    jobId: 'job-old',
    sourcePath: '/gone/old.png',
    preview: 'styles/previews/sticker.jpg',
  };
  let historyCommits = 0;
  await mkdir(path.dirname(previewPath), { recursive: true });
  await mkdir(path.dirname(historyPath), { recursive: true });
  await writeFile(previewPath, 'old-preview');
  await writeFile(historyPath, JSON.stringify({ sticker: oldRecord }));

  let caught;
  try {
    await syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [sourcePath],
      jobId: 'job-1',
      resizeImpl: async (_sourcePath, targetPath) => {
        await writeFile(targetPath, 'new-preview');
      },
      renameImpl: async (from, to) => {
        await rename(from, to);
        if (to === previewPath) {
          await replaceLockOwner(rootDir, 'replacement-before-commit');
        } else if (to === historyPath) {
          historyCommits += 1;
        }
      },
    });
  } catch (error) {
    caught = error;
  }

  try {
    assert.ok(caught instanceof AppError);
    assert.equal(caught.code, 'STYLE_PREVIEW_SYNC_FAILED');
    assert.equal(historyCommits, 0);
    assert.equal(await readFile(previewPath, 'utf8'), 'old-preview');
    assert.deepEqual(await readStyleHistory(rootDir), { sticker: oldRecord });
    assert.deepEqual(await readdir(path.dirname(previewPath)), ['sticker.jpg']);
    assert.equal(await readLockOwner(rootDir), 'replacement-before-commit');
  } finally {
    await removeLock(rootDir);
  }
});

test('syncStylePreview restores the previous preview when history commit fails', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');
  const previewPath = path.join(rootDir, 'styles', 'previews', 'sticker.jpg');
  const historyPath = path.join(rootDir, '.control', 'style-history.json');
  let backupPath;
  await mkdir(path.dirname(previewPath), { recursive: true });
  await mkdir(path.dirname(historyPath), { recursive: true });
  await writeFile(previewPath, 'old-preview');
  const existingHistory = {
    sticker: {
      styleId: 'sticker',
      generatedAt: '2026-06-19T11:00:00.000Z',
      jobId: 'job-old',
      sourcePath: '/gone/old.png',
      preview: 'styles/previews/sticker.jpg',
    },
  };
  await writeFile(historyPath, JSON.stringify(existingHistory));

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [sourcePath],
      jobId: 'job-1',
      resizeImpl: async (_sourcePath, targetPath) => {
        await writeFile(targetPath, 'new-preview');
      },
      copyFileImpl: async (from, to) => {
        backupPath = to;
        await copyFile(from, to);
      },
      renameImpl: async (from, to) => {
        if (to === historyPath) {
          throw new Error('history rename failed');
        }
        await rename(from, to);
      },
    }),
    'STYLE_PREVIEW_SYNC_FAILED',
  );

  assert.equal(await readFile(previewPath, 'utf8'), 'old-preview');
  assert.deepEqual(await readStyleHistory(rootDir), existingHistory);
  assert.deepEqual(await readdir(path.join(rootDir, 'styles', 'previews')), ['sticker.jpg']);
  assert.deepEqual(await readdir(path.join(rootDir, '.control')), ['style-history.json']);
  await assert.rejects(readFile(backupPath, 'utf8'));
});

test('syncStylePreview preserves backup when restoration fails', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');
  const previewPath = path.join(rootDir, 'styles', 'previews', 'sticker.jpg');
  const historyPath = path.join(rootDir, '.control', 'style-history.json');
  let backupPath;
  await mkdir(path.dirname(previewPath), { recursive: true });
  await mkdir(path.dirname(historyPath), { recursive: true });
  await writeFile(previewPath, 'old-preview');
  await writeFile(historyPath, JSON.stringify({
    sticker: {
      styleId: 'sticker',
      generatedAt: '2026-06-19T11:00:00.000Z',
      jobId: 'job-old',
      sourcePath: '/gone/old.png',
      preview: 'styles/previews/sticker.jpg',
    },
  }));

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [sourcePath],
      jobId: 'job-1',
      resizeImpl: async (_sourcePath, targetPath) => {
        await writeFile(targetPath, 'new-preview');
      },
      copyFileImpl: async (from, to) => {
        backupPath = to;
        await copyFile(from, to);
      },
      renameImpl: async (from, to) => {
        if (to === historyPath) {
          throw new Error('history rename failed');
        }
        if (from === backupPath && to === previewPath) {
          throw new Error('restore failed');
        }
        await rename(from, to);
      },
    }),
    'STYLE_PREVIEW_SYNC_FAILED',
  );

  assert.equal(await readFile(previewPath, 'utf8'), 'new-preview');
  assert.equal(await readFile(backupPath, 'utf8'), 'old-preview');
  assert.deepEqual(await readStyleHistory(rootDir), {
    sticker: {
      styleId: 'sticker',
      generatedAt: '2026-06-19T11:00:00.000Z',
      jobId: 'job-old',
      sourcePath: '/gone/old.png',
      preview: 'styles/previews/sticker.jpg',
    },
  });
  assert.deepEqual((await readdir(path.join(rootDir, 'styles', 'previews'))).sort(), [path.basename(backupPath), 'sticker.jpg'].sort());
});

test('syncStylePreview removes a newly installed preview when history commit fails', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');
  const previewPath = path.join(rootDir, 'styles', 'previews', 'sticker.jpg');
  const historyPath = path.join(rootDir, '.control', 'style-history.json');

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [sourcePath],
      jobId: 'job-1',
      resizeImpl: async (_sourcePath, targetPath) => {
        await writeFile(targetPath, 'new-preview');
      },
      renameImpl: async (from, to) => {
        if (to === historyPath) throw new Error('history rename failed');
        await rename(from, to);
      },
    }),
    'STYLE_PREVIEW_SYNC_FAILED',
  );

  await assert.rejects(readFile(previewPath, 'utf8'));
  assert.deepEqual(await readStyleHistory(rootDir), {});
  assert.deepEqual(await readdir(path.dirname(previewPath)), []);
  assert.deepEqual(await readdir(path.dirname(historyPath)), []);
});

test('syncStylePreview ignores backup cleanup failure after a successful commit', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.txt', 'source');
  const previewPath = path.join(rootDir, 'styles', 'previews', 'sticker.jpg');
  const historyPath = path.join(rootDir, '.control', 'style-history.json');
  let backupPath;
  await mkdir(path.dirname(previewPath), { recursive: true });
  await mkdir(path.dirname(historyPath), { recursive: true });
  await writeFile(previewPath, 'old-preview');
  await writeFile(historyPath, JSON.stringify({
    other: {
      styleId: 'other',
      generatedAt: '2026-06-19T11:00:00.000Z',
      jobId: 'job-old',
      sourcePath: '/gone/other.png',
      preview: 'styles/previews/other.jpg',
    },
  }));

  const record = await syncStylePreview({
    rootDir,
    styleId: 'sticker',
    outputPaths: [sourcePath],
    jobId: 'job-1',
    resizeImpl: async (_sourcePath, targetPath) => {
      await writeFile(targetPath, 'new-preview');
    },
    copyFileImpl: async (from, to) => {
      backupPath = to;
      await copyFile(from, to);
    },
    unlinkImpl: async (targetPath) => {
      if (targetPath === backupPath) {
        throw new Error('backup cleanup failed');
      }
      await unlink(targetPath);
    },
  });

  assert.equal(record.styleId, 'sticker');
  assert.equal(await readFile(previewPath, 'utf8'), 'new-preview');
  const history = await readStyleHistory(rootDir);
  assert.deepEqual(history.other.styleId, 'other');
  assert.deepEqual(history.sticker, record);
  assert.equal(await readFile(backupPath, 'utf8'), 'old-preview');
});

test('syncStylePreview release never deletes a replacement owner lock', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.png', 'source');
  const timing = createLockTiming();
  const releaseObserved = deferred();
  const allowRelease = deferred();
  let blocked = false;

  const operation = syncStylePreview({
    rootDir,
    styleId: 'alpha',
    outputPaths: [sourcePath],
    jobId: 'job-a',
    lockOptions: {
      ...timing.options,
      unlinkImpl: async (targetPath) => {
        if (!blocked && targetPath.includes('style-history.lock')) {
          blocked = true;
          releaseObserved.resolve();
          await allowRelease.promise;
        }
        await unlink(targetPath);
      },
    },
    resizeImpl: async (_sourcePath, targetPath) => {
      await writeFile(targetPath, 'alpha');
    },
  });

  await releaseObserved.promise;
  await replaceLockOwner(rootDir, 'replacement-owner');
  allowRelease.resolve();
  await operation;

  assert.equal(await readLockOwner(rootDir), 'replacement-owner');
  assert.equal(timing.timerCount, 0);
  assert.equal(timing.unrefCount, 1);
  await removeLock(rootDir);
});

test('syncStylePreview reclaims an abandoned same-process lease after release unlink fails', async () => {
  const rootDir = await createRoot();
  const firstSource = await writeOutput(rootDir, 'first.png', 'first');
  const secondSource = await writeOutput(rootDir, 'second.png', 'second');
  const timing = createLockTiming();
  let releaseFailures = 0;
  let processChecks = 0;

  const firstRecord = await syncStylePreview({
    rootDir,
    styleId: 'alpha',
    outputPaths: [firstSource],
    jobId: 'job-a',
    lockOptions: {
      unlinkImpl: async () => {
        releaseFailures += 1;
        const error = new Error('release unlink failed');
        error.code = 'EACCES';
        throw error;
      },
    },
    resizeImpl: async (_sourcePath, targetPath) => {
      await writeFile(targetPath, 'alpha');
    },
  });

  const abandoned = await readLockLease(rootDir);
  assert.equal(abandoned.pid, process.pid);
  assert.equal(releaseFailures, 1);

  const secondRecord = await syncStylePreview({
    rootDir,
    styleId: 'beta',
    outputPaths: [secondSource],
    jobId: 'job-b',
    lockOptions: {
      ...timing.options,
      timeoutMs: 0,
      statImpl: async (targetPath) => ({
        ...await stat(targetPath),
        mtimeMs: 0,
      }),
      processAliveImpl: async () => {
        processChecks += 1;
        return true;
      },
    },
    resizeImpl: async (_sourcePath, targetPath) => {
      await writeFile(targetPath, 'beta');
    },
  });

  assert.equal(firstRecord.styleId, 'alpha');
  assert.equal(secondRecord.styleId, 'beta');
  assert.equal(processChecks, 0);
  assert.deepEqual(Object.keys(await readStyleHistory(rootDir)).sort(), ['alpha', 'beta']);
  assert.deepEqual(await readdir(path.join(rootDir, '.control')), ['style-history.json']);
  assert.equal(timing.timerCount, 0);
});

test('syncStylePreview lets another process reclaim a released marker while owner pid is alive', async () => {
  const rootDir = await createRoot();
  const firstSource = await writeOutput(rootDir, 'first.png', 'first');
  const secondSource = await writeOutput(rootDir, 'second.png', 'second');
  let cleanupFailures = 0;

  await syncStylePreview({
    rootDir,
    styleId: 'alpha',
    outputPaths: [firstSource],
    jobId: 'job-a',
    lockOptions: {
      unlinkImpl: async (targetPath) => {
        if (targetPath.includes('style-history.lock')) {
          cleanupFailures += 1;
          const error = new Error('released marker cleanup failed');
          error.code = 'EACCES';
          throw error;
        }
        await unlink(targetPath);
      },
    },
    resizeImpl: async (_sourcePath, targetPath) => {
      await writeFile(targetPath, 'alpha');
    },
  });

  const moduleUrl = new URL('../lib/stylepreview.mjs', import.meta.url).href;
  const childSource = `
    import { writeFile } from 'node:fs/promises';
    import { syncStylePreview } from ${JSON.stringify(moduleUrl)};
    const record = await syncStylePreview({
      rootDir: ${JSON.stringify(rootDir)},
      styleId: 'beta',
      outputPaths: [${JSON.stringify(secondSource)}],
      jobId: 'job-b',
      lockOptions: {
        staleMs: 1,
        timeoutMs: 0,
        nowImpl: () => new Date(Date.now() + 60_000),
      },
      resizeImpl: async (_sourcePath, targetPath) => {
        await writeFile(targetPath, 'beta');
      },
    });
    process.stdout.write(JSON.stringify(record));
  `;
  const child = await runNodeModule(childSource);

  assert.equal(child.exitCode, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).styleId, 'beta');
  assert.equal(cleanupFailures, 1);
  assert.deepEqual(Object.keys(await readStyleHistory(rootDir)).sort(), ['alpha', 'beta']);
  assert.deepEqual(await readdir(path.join(rootDir, '.control')), ['style-history.json']);
});

test('syncStylePreview publishes releasedAt when marker rename fails for cross-process reclaim', async () => {
  const rootDir = await createRoot();
  const firstSource = await writeOutput(rootDir, 'first.png', 'first');
  const secondSource = await writeOutput(rootDir, 'second.png', 'second');
  let markerRenameFailures = 0;
  let cleanupFailures = 0;

  await syncStylePreview({
    rootDir,
    styleId: 'alpha',
    outputPaths: [firstSource],
    jobId: 'job-a',
    lockOptions: {
      renameImpl: async (from, to) => {
        if (to.endsWith('.released.json')) {
          markerRenameFailures += 1;
          const error = new Error('marker rename failed');
          error.code = 'EACCES';
          throw error;
        }
        await rename(from, to);
      },
      unlinkImpl: async (targetPath) => {
        if (targetPath.includes('style-history.lock')) {
          cleanupFailures += 1;
          const error = new Error('released state cleanup failed');
          error.code = 'EACCES';
          throw error;
        }
        await unlink(targetPath);
      },
    },
    resizeImpl: async (_sourcePath, targetPath) => {
      await writeFile(targetPath, 'alpha');
    },
  });

  const releasedLease = await readLockLease(rootDir);
  assert.equal(releasedLease.pid, process.pid);
  assert.equal(typeof releasedLease.releasedAt, 'string');

  const moduleUrl = new URL('../lib/stylepreview.mjs', import.meta.url).href;
  const childSource = `
    import { writeFile } from 'node:fs/promises';
    import { syncStylePreview } from ${JSON.stringify(moduleUrl)};
    const record = await syncStylePreview({
      rootDir: ${JSON.stringify(rootDir)},
      styleId: 'beta',
      outputPaths: [${JSON.stringify(secondSource)}],
      jobId: 'job-b',
      lockOptions: { timeoutMs: 0 },
      resizeImpl: async (_sourcePath, targetPath) => {
        await writeFile(targetPath, 'beta');
      },
    });
    process.stdout.write(JSON.stringify(record));
  `;
  const child = await runNodeModule(childSource);

  assert.equal(child.exitCode, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).styleId, 'beta');
  assert.equal(markerRenameFailures, 1);
  assert.equal(cleanupFailures, 1);
  assert.deepEqual(Object.keys(await readStyleHistory(rootDir)).sort(), ['alpha', 'beta']);
  assert.deepEqual(await readdir(path.join(rootDir, '.control')), ['style-history.json']);
});

test('syncStylePreview surfaces release failure when marker and releasedAt publication both fail', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.png', 'source');
  let fallbackWrites = 0;
  let caught;

  try {
    await syncStylePreview({
      rootDir,
      styleId: 'alpha',
      outputPaths: [sourcePath],
      jobId: 'job-a',
      lockOptions: {
        renameImpl: async (_from, to) => {
          if (to.endsWith('.released.json')) {
            const error = new Error('marker rename failed');
            error.code = 'EACCES';
            throw error;
          }
        },
        writeFileImpl: async (targetPath, data, options) => {
          if (options?.flag === 'wx') {
            await writeFile(targetPath, data, options);
            return;
          }
          fallbackWrites += 1;
          const error = new Error('releasedAt write failed');
          error.code = 'EACCES';
          throw error;
        },
      },
      resizeImpl: async (_sourcePath, targetPath) => {
        await writeFile(targetPath, 'alpha');
      },
    });
  } catch (error) {
    caught = error;
  }

  try {
    assert.ok(caught instanceof AppError);
    assert.equal(caught.code, 'STYLE_PREVIEW_SYNC_FAILED');
    assert.equal(fallbackWrites, 1);
    assert.equal((await readStyleHistory(rootDir)).alpha.styleId, 'alpha');
  } finally {
    await removeLock(rootDir);
  }
});

test('syncStylePreview stale takeover cannot remove a changed owner', async () => {
  const rootDir = await createRoot();
  const secondSource = await writeOutput(rootDir, 'second.png', 'second');
  const thirdSource = await writeOutput(rootDir, 'third.png', 'third');
  const timing = createLockTiming();
  const staleRemovalObserved = deferred();
  const allowStaleRemoval = deferred();
  const thirdStarted = deferred();
  const thirdCanFinish = deferred();
  let secondStarted = false;
  let removalBlocked = false;
  let deadProcessChecks = 0;
  await writeLockLease(rootDir, 'stale-owner', 424_242);

  const second = syncStylePreview({
    rootDir,
    styleId: 'beta',
    outputPaths: [secondSource],
    jobId: 'job-b',
    lockOptions: {
      ...timing.options,
      statImpl: async (targetPath) => ({
        ...await stat(targetPath),
        mtimeMs: 0,
      }),
      processAliveImpl: async (pid) => {
        assert.equal(pid, 424_242);
        deadProcessChecks += 1;
        return false;
      },
      unlinkImpl: async (targetPath) => {
        if (!removalBlocked && targetPath.includes('style-history.lock')) {
          removalBlocked = true;
          staleRemovalObserved.resolve();
          await allowStaleRemoval.promise;
        }
        await unlink(targetPath);
      },
    },
    resizeImpl: async (_sourcePath, targetPath) => {
      secondStarted = true;
      await writeFile(targetPath, 'beta');
    },
  });
  await staleRemovalObserved.promise;

  await removeLock(rootDir);

  const third = syncStylePreview({
    rootDir,
    styleId: 'gamma',
    outputPaths: [thirdSource],
    jobId: 'job-c',
    lockOptions: timing.options,
    resizeImpl: async (_sourcePath, targetPath) => {
      thirdStarted.resolve();
      await writeFile(targetPath, 'gamma');
      await thirdCanFinish.promise;
    },
  });
  await thirdStarted.promise;

  allowStaleRemoval.resolve();
  await waitFor(
    () => secondStarted || timing.pendingSleeps > 0,
    'stale contender neither entered the operation nor retried',
  );
  const enteredWhileReplacementOwned = secondStarted;

  thirdCanFinish.resolve();
  await third;
  if (!secondStarted) timing.releaseNextSleep();
  await second;

  assert.equal(enteredWhileReplacementOwned, false);
  const history = await readStyleHistory(rootDir);
  assert.deepEqual(Object.keys(history).sort(), ['beta', 'gamma']);
  assert.deepEqual(await readdir(path.join(rootDir, '.control')), ['style-history.json']);
  assert.equal(timing.timerCount, 0);
  assert.equal(timing.unrefCount, 2);
  assert.ok(deadProcessChecks >= 1);
});

test('syncStylePreview protects an active same-process token even if process liveness reports dead', async () => {
  const rootDir = await createRoot();
  const firstSource = await writeOutput(rootDir, 'first.png', 'first');
  const secondSource = await writeOutput(rootDir, 'second.png', 'second');
  const timing = createLockTiming();
  const firstStarted = deferred();
  const firstCanFinish = deferred();
  const secondCanFinish = deferred();
  let secondStarted = false;
  let processChecks = 0;

  const first = syncStylePreview({
    rootDir,
    styleId: 'alpha',
    outputPaths: [firstSource],
    jobId: 'job-a',
    lockOptions: timing.options,
    resizeImpl: async (_sourcePath, targetPath) => {
      firstStarted.resolve();
      await writeFile(targetPath, 'alpha');
      await firstCanFinish.promise;
    },
  });
  await firstStarted.promise;
  timing.advance(40);

  const second = syncStylePreview({
    rootDir,
    styleId: 'beta',
    outputPaths: [secondSource],
    jobId: 'job-b',
    lockOptions: {
      ...timing.options,
      statImpl: async (targetPath) => ({
        ...await stat(targetPath),
        mtimeMs: 0,
      }),
      processAliveImpl: async () => {
        processChecks += 1;
        return false;
      },
    },
    resizeImpl: async (_sourcePath, targetPath) => {
      secondStarted = true;
      await writeFile(targetPath, 'beta');
      await secondCanFinish.promise;
    },
  });

  await waitFor(
    () => secondStarted || timing.pendingSleeps > 0,
    'contender did not evaluate the stale active lease',
  );
  const overlapped = secondStarted;

  firstCanFinish.resolve();
  let firstError;
  try {
    await first;
  } catch (error) {
    firstError = error;
  }
  if (!secondStarted) timing.releaseNextSleep();
  await waitFor(() => secondStarted, 'second writer did not acquire after release');
  secondCanFinish.resolve();
  await second;

  assert.equal(firstError, undefined);
  assert.equal(overlapped, false);
  assert.equal(processChecks, 0);
  assert.deepEqual(Object.keys(await readStyleHistory(rootDir)).sort(), ['alpha', 'beta']);
  assert.deepEqual(await readdir(path.join(rootDir, '.control')), ['style-history.json']);
  assert.equal(timing.timerCount, 0);
});

test('syncStylePreview keeps a long-running lock alive while later writers wait', async () => {
  const rootDir = await createRoot();
  const firstSource = await writeOutput(rootDir, 'first.png', 'first');
  const secondSource = await writeOutput(rootDir, 'second.png', 'second');
  const thirdSource = await writeOutput(rootDir, 'third.png', 'third');
  const timing = createLockTiming();
  const starts = [];
  const firstCanFinish = deferred();
  const secondCanFinish = deferred();
  const firstStarted = deferred();
  const secondStarted = deferred();
  const thirdStarted = deferred();

  const first = syncStylePreview({
    rootDir,
    styleId: 'alpha',
    outputPaths: [firstSource],
    jobId: 'job-a',
    lockOptions: timing.options,
    resizeImpl: async (_sourcePath, targetPath) => {
      starts.push('alpha');
      firstStarted.resolve();
      await writeFile(targetPath, 'alpha');
      await firstCanFinish.promise;
    },
  });
  await firstStarted.promise;

  timing.advance(40);
  await timing.heartbeatAll();

  const second = syncStylePreview({
    rootDir,
    styleId: 'beta',
    outputPaths: [secondSource],
    jobId: 'job-b',
    lockOptions: timing.options,
    resizeImpl: async (_sourcePath, targetPath) => {
      starts.push('beta');
      secondStarted.resolve();
      await writeFile(targetPath, 'beta');
      await secondCanFinish.promise;
    },
  });
  await waitFor(() => timing.pendingSleeps === 1, 'second writer did not wait for the active lease');

  const third = syncStylePreview({
    rootDir,
    styleId: 'gamma',
    outputPaths: [thirdSource],
    jobId: 'job-c',
    lockOptions: timing.options,
    resizeImpl: async (_sourcePath, targetPath) => {
      starts.push('gamma');
      thirdStarted.resolve();
      await writeFile(targetPath, 'gamma');
    },
  });

  await waitFor(() => timing.pendingSleeps === 2, 'third writer did not wait for the active lease');
  assert.deepEqual(starts, ['alpha']);
  firstCanFinish.resolve();
  await first;
  timing.releaseNextSleep();
  await secondStarted.promise;
  assert.deepEqual(starts, ['alpha', 'beta']);
  secondCanFinish.resolve();
  await second;
  timing.releaseNextSleep();
  await thirdStarted.promise;
  await third;

  const history = await readStyleHistory(rootDir);
  assert.equal(history.alpha.styleId, 'alpha');
  assert.equal(history.beta.styleId, 'beta');
  assert.equal(history.gamma.styleId, 'gamma');
  assert.equal(Object.keys(history).length, 3);
  assert.deepEqual(await readdir(path.join(rootDir, '.control')), ['style-history.json']);
  assert.equal(timing.timerCount, 0);
  assert.equal(timing.unrefCount, 3);
});

test('syncStylePreview quarantines and recovers a stale partially written lock', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.png', 'source');
  const lockDirectory = path.join(rootDir, '.control', 'style-history.lock');
  const timing = createLockTiming();
  let quarantinePath;
  let removedQuarantine;
  await mkdir(lockDirectory, { recursive: true });
  await writeFile(path.join(lockDirectory, 'partial.json'), '{"ownerToken":');

  const record = await syncStylePreview({
    rootDir,
    styleId: 'sticker',
    outputPaths: [sourcePath],
    jobId: 'job-1',
    lockOptions: {
      ...timing.options,
      timeoutMs: 0,
      statImpl: async (targetPath) => ({
        ...await stat(targetPath),
        mtimeMs: 0,
      }),
      renameImpl: async (from, to) => {
        if (from === lockDirectory) {
          quarantinePath = to;
          assert.equal(path.dirname(to), path.dirname(lockDirectory));
          assert.match(path.basename(to), /^style-history\.lock\.quarantine\./u);
        }
        await rename(from, to);
      },
      rmImpl: async (targetPath, options) => {
        removedQuarantine = targetPath;
        assert.deepEqual(options, { force: true, recursive: true });
        await rm(targetPath, options);
      },
    },
    resizeImpl: async (_sourcePath, targetPath) => {
      await writeFile(targetPath, 'preview');
    },
  });

  assert.equal(record.styleId, 'sticker');
  assert.equal(removedQuarantine, quarantinePath);
  assert.deepEqual(await readdir(path.join(rootDir, '.control')), ['style-history.json']);
  assert.equal(timing.timerCount, 0);
});

test('syncStylePreview quarantines a stale malformed lock with unexpected entries', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.png', 'source');
  const lockDirectory = path.join(rootDir, '.control', 'style-history.lock');
  const timing = createLockTiming();
  let quarantineCount = 0;
  await mkdir(lockDirectory, { recursive: true });
  await writeFile(path.join(lockDirectory, 'one.json'), 'not-json');
  await writeFile(path.join(lockDirectory, 'unexpected.tmp'), 'partial');

  await syncStylePreview({
    rootDir,
    styleId: 'sticker',
    outputPaths: [sourcePath],
    jobId: 'job-1',
    lockOptions: {
      ...timing.options,
      timeoutMs: 0,
      statImpl: async (targetPath) => ({
        ...await stat(targetPath),
        mtimeMs: 0,
      }),
      renameImpl: async (from, to) => {
        if (from === lockDirectory) quarantineCount += 1;
        await rename(from, to);
      },
      rmImpl: rm,
    },
    resizeImpl: async (_sourcePath, targetPath) => {
      await writeFile(targetPath, 'preview');
    },
  });

  assert.equal(quarantineCount, 1);
  assert.deepEqual(await readdir(path.join(rootDir, '.control')), ['style-history.json']);
  assert.equal(timing.timerCount, 0);
});

test('syncStylePreview never quarantines a fresh partially written lock', async () => {
  const rootDir = await createRoot();
  const sourcePath = await writeOutput(rootDir, 'source.png', 'source');
  const lockDirectory = path.join(rootDir, '.control', 'style-history.lock');
  const timing = createLockTiming();
  let quarantineCount = 0;
  await mkdir(lockDirectory, { recursive: true });
  await writeFile(path.join(lockDirectory, 'partial.json'), '{"ownerToken":');

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: 'sticker',
      outputPaths: [sourcePath],
      jobId: 'job-1',
      lockOptions: {
        ...timing.options,
        timeoutMs: 0,
        statImpl: async (targetPath) => ({
          ...await stat(targetPath),
          mtimeMs: timing.nowMs,
        }),
        renameImpl: async (from, to) => {
          quarantineCount += 1;
          await rename(from, to);
        },
        rmImpl: rm,
      },
      resizeImpl: async () => {
        throw new Error('fresh lock must not be acquired');
      },
    }),
    'STYLE_PREVIEW_SYNC_FAILED',
  );

  assert.equal(quarantineCount, 0);
  assert.deepEqual(await readdir(lockDirectory), ['partial.json']);
  await removeLock(rootDir);
});

test('syncStylePreview bounds lock retries using injected timing', async () => {
  const rootDir = await createRoot();
  const firstSource = await writeOutput(rootDir, 'first.png', 'first');
  const secondSource = await writeOutput(rootDir, 'second.png', 'second');
  const firstTiming = createLockTiming();
  const firstStarted = deferred();
  const firstCanFinish = deferred();
  let nowMs = Date.now();
  let sleepCalls = 0;

  const first = syncStylePreview({
    rootDir,
    styleId: 'alpha',
    outputPaths: [firstSource],
    jobId: 'job-a',
    lockOptions: firstTiming.options,
    resizeImpl: async (_sourcePath, targetPath) => {
      firstStarted.resolve();
      await writeFile(targetPath, 'alpha');
      await firstCanFinish.promise;
    },
  });
  await firstStarted.promise;

  await expectAppErrorCode(
    syncStylePreview({
      rootDir,
      styleId: 'beta',
      outputPaths: [secondSource],
      jobId: 'job-b',
      lockOptions: {
        heartbeatMs: 10,
        nowImpl: () => new Date(nowMs),
        retryMs: 5,
        sleepImpl: async (ms) => {
          sleepCalls += 1;
          nowMs += ms;
        },
        staleMs: 1_000,
        timeoutMs: 12,
      },
      resizeImpl: async () => {
        throw new Error('contender must not acquire the lock');
      },
    }),
    'STYLE_PREVIEW_SYNC_FAILED',
  );

  firstCanFinish.resolve();
  await first;
  assert.equal(sleepCalls, 3);
  assert.equal(firstTiming.timerCount, 0);
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

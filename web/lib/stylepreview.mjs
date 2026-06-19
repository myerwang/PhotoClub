import { constants } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  stat,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as childProcess from 'node:child_process';

import { AppError } from './errors.mjs';

const SAFE_STYLE_ID = /^[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]+$/u;
const DEFAULT_LOCK_OPTIONS = {
  retryMs: 100,
  timeoutMs: 5_000,
  staleMs: 60_000,
};

function inputInvalid(message) {
  return new AppError('STYLE_PREVIEW_INPUT_INVALID', message, 400);
}

function syncFailed(message) {
  return new AppError('STYLE_PREVIEW_SYNC_FAILED', message, 500);
}

function isMissingError(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT';
}

function isEEXIST(error) {
  return error && typeof error === 'object' && error.code === 'EEXIST';
}

function isNotEmptyError(error) {
  return error && typeof error === 'object' && error.code === 'ENOTEMPTY';
}

function isHistoryShape(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertStyleId(styleId) {
  if (typeof styleId !== 'string' || !SAFE_STYLE_ID.test(styleId)) {
    throw inputInvalid('风格标识无效');
  }
  return styleId;
}

function assertJobId(jobId) {
  if (typeof jobId !== 'string' || jobId.trim().length === 0) {
    throw inputInvalid('任务标识无效');
  }
  return jobId;
}

function assertOutputPaths(outputPaths) {
  if (!Array.isArray(outputPaths) || outputPaths.length === 0) {
    throw inputInvalid('输出路径无效');
  }
  return outputPaths;
}

function historyPath(rootDir) {
  return path.join(rootDir, '.control', 'style-history.json');
}

function previewDir(rootDir) {
  return path.join(rootDir, 'styles', 'previews');
}

function previewPath(rootDir, styleId) {
  return path.join(previewDir(rootDir), `${styleId}.jpg`);
}

function lockPath(rootDir) {
  return path.join(rootDir, '.control', 'style-history.lock');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLockOptions(lockOptions = {}) {
  const staleMs = Number.isFinite(lockOptions.staleMs) && lockOptions.staleMs > 0
    ? lockOptions.staleMs
    : DEFAULT_LOCK_OPTIONS.staleMs;
  const heartbeatMs = Number.isFinite(lockOptions.heartbeatMs) && lockOptions.heartbeatMs > 0
    ? lockOptions.heartbeatMs
    : Math.max(1, Math.floor(staleMs / 3));

  return {
    retryMs: Number.isFinite(lockOptions.retryMs) && lockOptions.retryMs > 0
      ? lockOptions.retryMs
      : DEFAULT_LOCK_OPTIONS.retryMs,
    timeoutMs: Number.isFinite(lockOptions.timeoutMs) && lockOptions.timeoutMs >= 0
      ? lockOptions.timeoutMs
      : DEFAULT_LOCK_OPTIONS.timeoutMs,
    staleMs,
    heartbeatMs,
    sleepImpl: lockOptions.sleepImpl ?? sleep,
    setIntervalImpl: lockOptions.setIntervalImpl ?? setInterval,
    clearIntervalImpl: lockOptions.clearIntervalImpl ?? clearInterval,
    readFileImpl: lockOptions.readFileImpl ?? readFile,
    writeFileImpl: lockOptions.writeFileImpl ?? writeFile,
    unlinkImpl: lockOptions.unlinkImpl ?? unlink,
    mkdirImpl: lockOptions.mkdirImpl ?? mkdir,
    readdirImpl: lockOptions.readdirImpl ?? readdir,
    rmdirImpl: lockOptions.rmdirImpl ?? rmdir,
    statImpl: lockOptions.statImpl ?? stat,
    utimesImpl: lockOptions.utimesImpl ?? utimes,
    nowImpl: lockOptions.nowImpl ?? (() => new Date()),
  };
}

function lockNow(fsOps) {
  const value = fsOps.nowImpl();
  return value instanceof Date ? value : new Date(value);
}

async function removeIfExists(filePath, unlinkImpl = unlink) {
  if (!filePath) return;
  try {
    await unlinkImpl(filePath);
  } catch (error) {
    if (!isMissingError(error)) throw error;
  }
}

async function unlinkIfExists(filePath, unlinkImpl) {
  try {
    await unlinkImpl(filePath);
    return true;
  } catch (error) {
    if (isMissingError(error)) return false;
    throw error;
  }
}

async function readLockState(lockDirectory, fsOps) {
  try {
    const entries = await fsOps.readdirImpl(lockDirectory);
    if (entries.length !== 1 || !entries[0].endsWith('.json')) {
      const stats = await fsOps.statImpl(lockDirectory);
      return { ownerToken: null, leasePath: null, mtimeMs: stats.mtimeMs };
    }

    const leasePath = path.join(lockDirectory, entries[0]);
    const [raw, stats] = await Promise.all([
      fsOps.readFileImpl(leasePath, 'utf8'),
      fsOps.statImpl(leasePath),
    ]);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.ownerToken !== 'string') {
      return { ownerToken: null, leasePath: null, mtimeMs: stats.mtimeMs };
    }
    return { ownerToken: parsed.ownerToken, leasePath, mtimeMs: stats.mtimeMs };
  } catch (error) {
    if (isMissingError(error)) return null;
    return null;
  }
}

function startHeartbeat(leasePath, ownerToken, fsOps) {
  let stopped = false;
  let inFlight = null;
  let timer;

  const stopTimer = () => {
    if (stopped) return false;
    stopped = true;
    fsOps.clearIntervalImpl(timer);
    return true;
  };

  const tick = async () => {
    if (stopped) return;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const parsed = JSON.parse(await fsOps.readFileImpl(leasePath, 'utf8'));
        if (!parsed || parsed.ownerToken !== ownerToken) {
          stopTimer();
          return;
        }
        const now = lockNow(fsOps);
        await fsOps.utimesImpl(leasePath, now, now);
      } catch {
        stopTimer();
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  };

  timer = fsOps.setIntervalImpl(tick, fsOps.heartbeatMs);
  timer.unref?.();
  return {
    async stop() {
      stopTimer();
      if (inFlight) await inFlight;
    },
  };
}

async function removeLockDirectoryIfEmpty(lockDirectory, fsOps) {
  try {
    await fsOps.rmdirImpl(lockDirectory);
    return true;
  } catch (error) {
    if (isMissingError(error) || isNotEmptyError(error) || isEEXIST(error)) return false;
    throw error;
  }
}

async function removeObservedLease(lockDirectory, observed, fsOps) {
  const confirmed = await readLockState(lockDirectory, fsOps);
  if (
    !confirmed
    || !confirmed.leasePath
    || confirmed.ownerToken !== observed.ownerToken
    || confirmed.leasePath !== observed.leasePath
    || lockNow(fsOps).getTime() - confirmed.mtimeMs <= fsOps.staleMs
  ) {
    return false;
  }

  const removed = await unlinkIfExists(confirmed.leasePath, fsOps.unlinkImpl);
  if (!removed) return false;
  await removeLockDirectoryIfEmpty(lockDirectory, fsOps);
  return true;
}

async function acquireStyleHistoryLock(rootDir, lockOptions) {
  const fsOps = normalizeLockOptions(lockOptions);
  const lockDirectory = lockPath(rootDir);
  const ownerToken = randomUUID();
  const leasePath = path.join(lockDirectory, `${ownerToken}.json`);
  const deadline = lockNow(fsOps).getTime() + fsOps.timeoutMs;

  while (true) {
    try {
      await fsOps.mkdirImpl(lockDirectory);
      const createdAt = lockNow(fsOps).toISOString();
      try {
        await fsOps.writeFileImpl(leasePath, JSON.stringify({ ownerToken, createdAt }), { flag: 'wx' });
      } catch (error) {
        await removeLockDirectoryIfEmpty(lockDirectory, fsOps).catch(() => {});
        throw error;
      }

      const heartbeat = startHeartbeat(leasePath, ownerToken, fsOps);
      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        await heartbeat.stop();
        try {
          const removed = await unlinkIfExists(leasePath, fsOps.unlinkImpl);
          if (removed) await removeLockDirectoryIfEmpty(lockDirectory, fsOps);
        } catch {
          // Best effort; stale recovery can clean up if needed.
        }
      };
      return { ownerToken, release };
    } catch (error) {
      if (!isEEXIST(error)) {
        throw syncFailed('风格历史锁获取失败');
      }
    }

    const observed = await readLockState(lockDirectory, fsOps);
    if (observed && lockNow(fsOps).getTime() - observed.mtimeMs > fsOps.staleMs) {
      try {
        if (observed.ownerToken && observed.leasePath) {
          if (await removeObservedLease(lockDirectory, observed, fsOps)) continue;
        } else if (await removeLockDirectoryIfEmpty(lockDirectory, fsOps)) {
          continue;
        }
      } catch {
        throw syncFailed('风格历史锁获取失败');
      }
    }

    if (lockNow(fsOps).getTime() >= deadline) break;
    await fsOps.sleepImpl(fsOps.retryMs);
  }

  throw syncFailed('风格历史锁超时');
}

export async function readStyleHistory(rootDir) {
  const filePath = historyPath(rootDir);

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isHistoryShape(parsed)) {
      throw new AppError('STYLE_HISTORY_INVALID', '风格历史无效', 422, { filePath });
    }
    return parsed;
  } catch (error) {
    if (isMissingError(error)) return {};
    if (error instanceof AppError && error.code === 'STYLE_HISTORY_INVALID') throw error;
    if (error instanceof SyntaxError) {
      throw new AppError('STYLE_HISTORY_INVALID', '风格历史无效', 422, { filePath });
    }
    throw error;
  }
}

export async function resizeWithSips(sourcePath, targetPath) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn('/usr/bin/sips', [
      '-s', 'format', 'jpeg',
      '-Z', '480',
      sourcePath,
      '--out', targetPath,
    ], { stdio: 'ignore' });

    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(syncFailed('风格代表图缩放失败'));
    };

    child.once('error', fail);
    child.once('close', (code) => {
      if (code === 0) {
        if (!settled) resolve();
        settled = true;
        return;
      }
      fail();
    });
  });
}

export async function syncStylePreview({
  rootDir,
  styleId,
  outputPaths,
  jobId,
  generatedAt = new Date().toISOString(),
  resizeImpl = resizeWithSips,
  accessImpl = access,
  renameImpl = rename,
  copyFileImpl = copyFile,
  unlinkImpl = unlink,
  lockOptions = {},
}) {
  const safeStyleId = assertStyleId(styleId);
  const outputs = assertOutputPaths(outputPaths);
  const safeJobId = assertJobId(jobId);
  const sourcePath = outputs.at(-1);
  if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
    throw inputInvalid('源路径无效');
  }

  const previewDirectory = previewDir(rootDir);
  const controlDirectory = path.join(rootDir, '.control');
  const finalPreviewPath = previewPath(rootDir, safeStyleId);
  const historyFilePath = historyPath(rootDir);
  let tempPreviewPath;
  let tempHistoryPath;
  let backupPath;
  let lock;
  let preserveBackup = false;
  let backupCreated = false;
  let finalInstalled = false;
  let historyCommitted = false;

  try {
    await accessImpl(sourcePath, constants.R_OK);
    await mkdir(previewDirectory, { recursive: true });
    await mkdir(controlDirectory, { recursive: true });
    lock = await acquireStyleHistoryLock(rootDir, lockOptions);

    tempPreviewPath = path.join(previewDirectory, `.${safeStyleId}.${randomUUID()}.jpg`);
    tempHistoryPath = path.join(controlDirectory, `.style-history.${randomUUID()}.json`);
    backupPath = path.join(previewDirectory, `.${safeStyleId}.${randomUUID()}.bak.jpg`);

    const history = await readStyleHistory(rootDir);

    try {
      await resizeImpl(sourcePath, tempPreviewPath);

      try {
        await accessImpl(finalPreviewPath, constants.F_OK);
        await copyFileImpl(finalPreviewPath, backupPath);
        backupCreated = true;
      } catch (error) {
        if (!isMissingError(error)) {
          throw syncFailed('风格代表图同步失败');
        }
      }

      await renameImpl(tempPreviewPath, finalPreviewPath);
      finalInstalled = true;

      const record = {
        styleId: safeStyleId,
        generatedAt,
        jobId: safeJobId,
        sourcePath,
        preview: `styles/previews/${safeStyleId}.jpg`,
      };
      const nextHistory = { ...history, [safeStyleId]: record };

      await writeFile(tempHistoryPath, `${JSON.stringify(nextHistory, null, 2)}\n`);
      await renameImpl(tempHistoryPath, historyFilePath);
      historyCommitted = true;

      await removeIfExists(backupPath, unlinkImpl).catch(() => {});
      return record;
    } catch (error) {
      if (!historyCommitted) {
        await Promise.allSettled([
          tempPreviewPath ? removeIfExists(tempPreviewPath, unlinkImpl) : Promise.resolve(),
          tempHistoryPath ? removeIfExists(tempHistoryPath, unlinkImpl) : Promise.resolve(),
        ]);

        if (finalInstalled && backupCreated) {
          try {
            await renameImpl(backupPath, finalPreviewPath);
            backupCreated = false;
          } catch {
            preserveBackup = true;
          }
        } else if (finalInstalled) {
          await removeIfExists(finalPreviewPath, unlinkImpl).catch(() => {});
        } else if (backupCreated) {
          await removeIfExists(backupPath, unlinkImpl).catch(() => {});
          backupCreated = false;
        }
      }

      if (error instanceof AppError) throw error;
      throw syncFailed('风格代表图同步失败');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw syncFailed('风格代表图同步失败');
  } finally {
    if (lock) {
      await lock.release();
    }

    await Promise.allSettled([
      tempPreviewPath ? removeIfExists(tempPreviewPath, unlinkImpl) : Promise.resolve(),
      tempHistoryPath ? removeIfExists(tempHistoryPath, unlinkImpl) : Promise.resolve(),
      backupPath && !preserveBackup ? removeIfExists(backupPath, unlinkImpl) : Promise.resolve(),
    ]);
  }
}

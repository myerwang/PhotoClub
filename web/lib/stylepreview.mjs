import { constants } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
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
const activeLeaseTokens = new Set();

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

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ESRCH') return false;
    return true;
  }
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
    renameImpl: lockOptions.renameImpl ?? rename,
    rmImpl: lockOptions.rmImpl ?? rm,
    statImpl: lockOptions.statImpl ?? stat,
    utimesImpl: lockOptions.utimesImpl ?? utimes,
    processAliveImpl: lockOptions.processAliveImpl ?? processAlive,
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
    const directoryStats = await fsOps.statImpl(lockDirectory);
    let mtimeMs = directoryStats.mtimeMs;
    const validLeases = [];

    for (const entry of entries) {
      const leasePath = path.join(lockDirectory, entry);
      const stats = await fsOps.statImpl(leasePath);
      mtimeMs = Math.max(mtimeMs, stats.mtimeMs);

      try {
        const parsed = JSON.parse(await fsOps.readFileImpl(leasePath, 'utf8'));
        if (
          parsed
          && typeof parsed === 'object'
          && typeof parsed.ownerToken === 'string'
          && parsed.ownerToken.length > 0
          && isPositiveInteger(parsed.pid)
        ) {
          validLeases.push({
            ownerToken: parsed.ownerToken,
            pid: parsed.pid,
            leasePath,
            mtimeMs: stats.mtimeMs,
          });
        }
      } catch {
        // A partial lease is handled as malformed once it is stale.
      }
    }

    if (
      entries.length === 1
      && validLeases.length === 1
      && entries[0] === `${validLeases[0].ownerToken}.json`
    ) {
      return { kind: 'lease', ...validLeases[0] };
    }

    return {
      kind: 'malformed',
      mtimeMs,
      validOwners: validLeases.map(({ ownerToken, pid }) => ({ ownerToken, pid })),
    };
  } catch (error) {
    if (isMissingError(error)) return null;
    return null;
  }
}

function sameLease(left, right) {
  return Boolean(
    left
    && right
    && left.kind === 'lease'
    && right.kind === 'lease'
    && left.ownerToken === right.ownerToken
    && left.pid === right.pid
    && left.leasePath === right.leasePath
  );
}

function startHeartbeat(lockDirectory, leasePath, ownerToken, pid, fsOps) {
  let stopped = false;
  let compromised = false;
  let inFlight = null;
  let timer;

  const stopTimer = () => {
    if (stopped) return false;
    stopped = true;
    if (timer) fsOps.clearIntervalImpl(timer);
    return true;
  };

  const markCompromised = () => {
    compromised = true;
    activeLeaseTokens.delete(ownerToken);
    stopTimer();
  };

  const checkOwnership = async () => {
    const state = await readLockState(lockDirectory, fsOps);
    const owned = Boolean(
      state
      && state.kind === 'lease'
      && state.ownerToken === ownerToken
      && state.pid === pid
      && state.leasePath === leasePath
    );
    if (!owned) markCompromised();
    return owned;
  };

  const tick = async () => {
    if (stopped) return;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        if (!await checkOwnership()) return;
        const now = lockNow(fsOps);
        await fsOps.utimesImpl(leasePath, now, now);
      } catch {
        markCompromised();
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  };

  timer = fsOps.setIntervalImpl(tick, fsOps.heartbeatMs);
  timer.unref?.();
  return {
    async assertOwned() {
      if (inFlight) await inFlight;
      if (compromised || !await checkOwnership()) {
        throw syncFailed('风格历史锁所有权已丢失');
      }
    },
    async stop() {
      stopTimer();
      if (inFlight) await inFlight;
    },
  };
}

async function processIsAlive(fsOps, pid) {
  try {
    return await fsOps.processAliveImpl(pid) !== false;
  } catch {
    return true;
  }
}

async function recordedOwnerIsActive(fsOps, { ownerToken, pid }) {
  if (pid === process.pid) return activeLeaseTokens.has(ownerToken);
  return processIsAlive(fsOps, pid);
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
  if (!isPositiveInteger(observed.pid) || await recordedOwnerIsActive(fsOps, observed)) {
    return false;
  }

  const confirmed = await readLockState(lockDirectory, fsOps);
  if (
    !sameLease(confirmed, observed)
    || lockNow(fsOps).getTime() - confirmed.mtimeMs <= fsOps.staleMs
    || await recordedOwnerIsActive(fsOps, confirmed)
  ) {
    return false;
  }

  const finalState = await readLockState(lockDirectory, fsOps);
  if (
    !sameLease(finalState, confirmed)
    || lockNow(fsOps).getTime() - finalState.mtimeMs <= fsOps.staleMs
  ) {
    return false;
  }

  const removed = await unlinkIfExists(finalState.leasePath, fsOps.unlinkImpl);
  if (!removed) return false;
  await removeLockDirectoryIfEmpty(lockDirectory, fsOps);
  return true;
}

async function hasLiveRecordedProcess(state, fsOps) {
  for (const owner of state.validOwners ?? []) {
    if (await recordedOwnerIsActive(fsOps, owner)) return true;
  }
  return false;
}

async function quarantineMalformedLock(lockDirectory, observed, fsOps) {
  if (observed.kind !== 'malformed' || await hasLiveRecordedProcess(observed, fsOps)) {
    return false;
  }

  const confirmed = await readLockState(lockDirectory, fsOps);
  if (
    !confirmed
    || confirmed.kind !== 'malformed'
    || lockNow(fsOps).getTime() - confirmed.mtimeMs <= fsOps.staleMs
    || await hasLiveRecordedProcess(confirmed, fsOps)
  ) {
    return false;
  }

  const quarantinePath = `${lockDirectory}.quarantine.${randomUUID()}`;
  try {
    await fsOps.renameImpl(lockDirectory, quarantinePath);
  } catch (error) {
    if (isMissingError(error) || isEEXIST(error)) return false;
    throw error;
  }

  const quarantined = await readLockState(quarantinePath, fsOps);
  if (quarantined && await hasLiveRecordedProcess(quarantined, fsOps)) {
    await fsOps.renameImpl(quarantinePath, lockDirectory).catch(() => {});
    return false;
  }

  await fsOps.rmImpl(quarantinePath, { force: true, recursive: true });
  return true;
}

async function acquireStyleHistoryLock(rootDir, lockOptions) {
  const fsOps = normalizeLockOptions(lockOptions);
  const lockDirectory = lockPath(rootDir);
  const ownerToken = randomUUID();
  const pid = process.pid;
  const leasePath = path.join(lockDirectory, `${ownerToken}.json`);
  const deadline = lockNow(fsOps).getTime() + fsOps.timeoutMs;

  while (true) {
    try {
      await fsOps.mkdirImpl(lockDirectory);
      const createdAt = lockNow(fsOps).toISOString();
      try {
        await fsOps.writeFileImpl(leasePath, JSON.stringify({ ownerToken, pid, createdAt }), { flag: 'wx' });
      } catch (error) {
        await removeIfExists(leasePath, fsOps.unlinkImpl).catch(() => {});
        await removeLockDirectoryIfEmpty(lockDirectory, fsOps).catch(() => {});
        throw error;
      }

      const heartbeat = startHeartbeat(lockDirectory, leasePath, ownerToken, pid, fsOps);
      activeLeaseTokens.add(ownerToken);
      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        activeLeaseTokens.delete(ownerToken);
        try {
          await heartbeat.stop();
          const removed = await unlinkIfExists(leasePath, fsOps.unlinkImpl);
          if (removed) await removeLockDirectoryIfEmpty(lockDirectory, fsOps);
        } catch {
          // Best effort; stale recovery can clean up if needed.
        } finally {
          activeLeaseTokens.delete(ownerToken);
        }
      };
      return { assertOwned: heartbeat.assertOwned, ownerToken, pid, release };
    } catch (error) {
      if (!isEEXIST(error)) {
        throw syncFailed('风格历史锁获取失败');
      }
    }

    const observed = await readLockState(lockDirectory, fsOps);
    if (observed && lockNow(fsOps).getTime() - observed.mtimeMs > fsOps.staleMs) {
      try {
        if (observed.kind === 'lease') {
          if (await removeObservedLease(lockDirectory, observed, fsOps)) continue;
        } else if (await quarantineMalformedLock(lockDirectory, observed, fsOps)) {
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

      await lock.assertOwned();
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
      await lock.assertOwned();
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

import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as childProcess from 'node:child_process';

import { AppError } from './errors.mjs';

const SAFE_STYLE_ID = /^[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]+$/u;
const LOCK_RETRY_MS = 100;
const LOCK_MAX_ATTEMPTS = 200;
const LOCK_STALE_MS = 60_000;

function inputInvalid(message) {
  return new AppError('STYLE_PREVIEW_INPUT_INVALID', message, 400);
}

function syncFailed(message) {
  return new AppError('STYLE_PREVIEW_SYNC_FAILED', message, 500);
}

function isMissingError(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT';
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

async function acquireStyleHistoryLock(rootDir) {
  const filePath = lockPath(rootDir);
  for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt += 1) {
    try {
      await writeFile(filePath, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { flag: 'wx' });
      return filePath;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') {
        throw syncFailed('风格历史锁获取失败');
      }

      try {
        const stats = await stat(filePath);
        if (Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
          await unlink(filePath).catch(() => {});
          continue;
        }
      } catch (statError) {
        if (isMissingError(statError)) {
          continue;
        }
        throw syncFailed('风格历史锁获取失败');
      }

      await sleep(LOCK_RETRY_MS);
    }
  }

  throw syncFailed('风格历史锁超时');
}

async function removeIfExists(filePath) {
  if (!filePath) {
    return;
  }

  await unlink(filePath).catch((error) => {
    if (!isMissingError(error)) {
      throw error;
    }
  });
}

async function restorePreview(renameImpl, backupPath, finalPath) {
  await removeIfExists(finalPath);
  await renameImpl(backupPath, finalPath);
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
    if (isMissingError(error)) {
      return {};
    }
    if (error instanceof AppError && error.code === 'STYLE_HISTORY_INVALID') {
      throw error;
    }
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
    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    child.once('error', fail);
    child.once('close', (code) => {
      if (code === 0) {
        succeed();
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
  let tempBackupPath;
  let lockFilePath;

  try {
    await accessImpl(sourcePath, constants.R_OK);
    await mkdir(previewDirectory, { recursive: true });
    await mkdir(controlDirectory, { recursive: true });
    lockFilePath = await acquireStyleHistoryLock(rootDir);

    tempPreviewPath = path.join(previewDirectory, `.${safeStyleId}.${randomUUID()}.jpg`);
    tempHistoryPath = path.join(controlDirectory, `.style-history.${randomUUID()}.json`);
    tempBackupPath = path.join(previewDirectory, `.${safeStyleId}.${randomUUID()}.bak.jpg`);

    const history = await readStyleHistory(rootDir);
    let hasBackup = false;
    let finalPreviewCreated = false;

    try {
      try {
        await accessImpl(finalPreviewPath, constants.F_OK);
        await renameImpl(finalPreviewPath, tempBackupPath);
        hasBackup = true;
      } catch (error) {
        if (!isMissingError(error)) {
          throw syncFailed('风格代表图同步失败');
        }
      }

      await resizeImpl(sourcePath, tempPreviewPath);
      await renameImpl(tempPreviewPath, finalPreviewPath);
      finalPreviewCreated = true;

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

      await removeIfExists(tempBackupPath);
      return record;
    } catch (error) {
      if (tempPreviewPath) {
        await removeIfExists(tempPreviewPath);
      }
      if (hasBackup) {
        await restorePreview(renameImpl, tempBackupPath, finalPreviewPath);
      } else if (finalPreviewCreated) {
        await removeIfExists(finalPreviewPath);
      }
      if (error instanceof AppError) {
        throw error;
      }
      throw syncFailed('风格代表图同步失败');
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw syncFailed('风格代表图同步失败');
  } finally {
    await Promise.allSettled([
      removeIfExists(lockFilePath),
      tempPreviewPath ? unlink(tempPreviewPath) : Promise.resolve(),
      tempHistoryPath ? unlink(tempHistoryPath) : Promise.resolve(),
      tempBackupPath ? unlink(tempBackupPath) : Promise.resolve(),
    ]);
  }
}

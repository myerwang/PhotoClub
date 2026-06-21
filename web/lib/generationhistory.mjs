import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const locks = new Map();

function historyPath(rootDir) { return path.join(rootDir, '.control', 'generation-history.json'); }

async function withLock(rootDir, action) {
  const previous = locks.get(rootDir) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  locks.set(rootDir, next);
  try { return await next; } finally { if (locks.get(rootDir) === next) locks.delete(rootDir); }
}

async function readUnsafe(rootDir) {
  try {
    const parsed = JSON.parse(await readFile(historyPath(rootDir), 'utf8'));
    return parsed && Array.isArray(parsed.batches) ? parsed : { version: 1, batches: [] };
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, batches: [] };
    throw error;
  }
}

async function writeUnsafe(rootDir, history) {
  const target = historyPath(rootDir);
  const temp = `${target}.${process.pid}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temp, `${JSON.stringify(history, null, 2)}\n`);
  await rename(temp, target);
}

export async function readGenerationHistory(rootDir) { return withLock(rootDir, () => readUnsafe(rootDir)); }

export async function createGenerationBatch(rootDir, batch) {
  return withLock(rootDir, async () => {
    const history = await readUnsafe(rootDir);
    const now = new Date().toISOString();
    const stored = { completed: 0, ...batch, createdAt: batch.createdAt ?? now, updatedAt: now };
    history.batches.unshift(stored);
    await writeUnsafe(rootDir, history);
    return stored;
  });
}

export async function updateGenerationBatch(rootDir, batchId, update) {
  return withLock(rootDir, async () => {
    const history = await readUnsafe(rootDir);
    const index = history.batches.findIndex((batch) => batch.id === batchId);
    if (index < 0) return null;
    const next = { ...update(history.batches[index]), updatedAt: new Date().toISOString() };
    history.batches[index] = next;
    await writeUnsafe(rootDir, history);
    return next;
  });
}

export async function reconcileGenerationBatch(rootDir, batchId) {
  return updateGenerationBatch(rootDir, batchId, (batch) => {
    const items = batch.items.map((item) => ({ ...item }));
    return { ...batch, items };
  }).then(async (batch) => {
    if (!batch) return null;
    const items = await Promise.all(batch.items.map(async (item) => {
      try { await access(item.outputPath); return { ...item, status: 'completed' }; }
      catch { return { ...item, status: 'pending' }; }
    }));
    const completed = items.filter((item) => item.status === 'completed').length;
    return updateGenerationBatch(rootDir, batchId, (current) => ({
      ...current, items, completed,
      status: completed === current.total ? 'completed' : current.status === 'paused_quota' ? 'paused_quota' : 'interrupted',
    }));
  });
}

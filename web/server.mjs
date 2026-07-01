import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertSafeId, loadCatalog } from './lib/catalog.mjs';
import { AppError, asAppError, errorPayload } from './lib/errors.mjs';
import { LeaseManager } from './lib/lease.mjs';
import { CUSTOM_FORMAT_ID, orientFormat, resolveCustomFormat } from './lib/outputformat.mjs';
import { commitJobResult, SerialJobQueue } from './lib/queue.mjs';
import { buildGeneratePrompt, buildProfilePrompt, buildPromptProfilePrompt, buildStylePrompt, runCodexTask } from './lib/runner.mjs';
import { syncStylePreview } from './lib/stylepreview.mjs';
import { openTarget } from './lib/platform.mjs';
import { publishStyleDraft } from './lib/styleplugin.mjs';
import { createGenerationBatch, enrichGenerationBatch, markGenerationItemsFailed, readGenerationHistory, reconcileGenerationBatch, summarizeGenerationBatch, updateGenerationBatch } from './lib/generationhistory.mjs';

const WEB_DIR = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.heic']);

function sendJson(response, status, body) {
  const data = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) });
  response.end(data);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) throw new AppError('BODY_TOO_LARGE', '请求内容过大', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError('JSON_INVALID', '请求 JSON 格式无效', 400);
  }
}

export function contentType(filePath) {
  return ({
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  })[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export function resolveStyleSelectionPath(pathname) {
  return pathname === '/style-selection.mjs' ? path.join(WEB_DIR, 'style-selection.mjs') : null;
}

async function serveFile(response, filePath) {
  try {
    const data = await readServableFile(filePath);
    response.writeHead(200, { 'content-type': contentType(filePath), 'content-length': data.length, 'cache-control': 'no-store' });
    response.end(data);
  } catch {
    sendJson(response, 404, errorPayload(new AppError('NOT_FOUND', '资源不存在', 404)));
  }
}

export async function readServableFile(filePath) {
  try {
    const stats = await lstat(filePath);
    if (!stats.isFile()) {
      throw new AppError('NOT_FOUND', '资源不存在', 404);
    }
    return await readFile(filePath);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NOT_FOUND', '资源不存在', 404);
  }
}

export function safeDecodePathSegment(segment, { code = 'NOT_FOUND', message = '资源不存在', status = 404 } = {}) {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    if (error instanceof URIError) {
      throw new AppError(code, message, status);
    }
    throw error;
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason ?? new AppError('JOB_CANCELLED', '任务已取消', 499);
  }
}

async function assertReadableFile(filePath, message) {
  try {
    await access(filePath, constants.R_OK);
    const stats = await lstat(filePath);
    if (!stats.isFile()) throw new Error('not a regular file');
  } catch {
    throw new AppError('OUTPUT_MISSING', message, 500);
  }
}

function sanitizeProfileResult({ profileId, outputUrl, outputUrls }) {
  return { profileId, outputUrl, outputUrls };
}

function sanitizeGenerateResult({ styleId, outputUrl, outputUrls, preview, usage }) {
  return {
    styleId,
    outputUrl,
    outputUrls,
    ...(preview === undefined ? {} : { preview }),
    ...(usage === undefined ? {} : { usage }),
  };
}

export function buildGenerateBatchDefinitions({
  rootDir,
  profileIds,
  styleIds,
  styleFingerprints = {},
  format,
  orientation,
  extraPrompt,
  quantity,
  buildGeneratePromptImpl = buildGeneratePrompt,
}) {
  return styleIds.map((styleId, batchIndex) => {
    const id = randomUUID();
    const baseName = `${profileIds.join('+')}-${styleId}-${id.slice(0, 8)}`;
    const fileNames = Array.from({ length: quantity }, (_, index) => `${baseName}-${index + 1}.png`);
    const outputPaths = fileNames.map((fileName) => path.join(rootDir, 'output', fileName));
    const outputUrls = fileNames.map((fileName) => `/media/output/${fileName}`);
    const prompt = buildGeneratePromptImpl({
      rootDir,
      profileIds,
      styleId,
      format,
      orientation,
      extraPrompt,
      quantity,
      outputPaths,
    });
    return {
      id,
      type: 'generate',
      styleId,
      batchIndex,
      batchSize: styleIds.length,
      payload: { prompt, outputPaths, outputUrls, styleFingerprint: styleFingerprints[styleId] },
    };
  });
}

async function removeStaleGeneratedOutputs(rootDir, profileIds, styleIds) {
  const outputDir = path.join(rootDir, 'output');
  let entries;
  try {
    entries = await readdir(outputDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const prefixes = new Set(styleIds.map((styleId) => `${profileIds.join('+')}-${styleId}-`));
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.png') && [...prefixes].some((prefix) => entry.name.startsWith(prefix)))
    .map((entry) => unlink(path.join(outputDir, entry.name)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    })));
}

export function createProfileJobDefinition({
  rootDir,
  jobId = randomUUID(),
  profileId,
  kind,
  inputId,
  imagePaths,
  description,
  buildProfilePromptImpl = buildProfilePrompt,
  buildPromptProfilePromptImpl = buildPromptProfilePrompt,
}) {
  const safeProfileId = assertSafeId(profileId, '人物');
  const controlDir = path.join(rootDir, '.control');
  const profileStagingPath = path.join(controlDir, `profile-${jobId}.png`);
  const profileFinalPath = path.join(rootDir, 'profiles', safeProfileId, 'multiview_reference.png');
  const prompt = kind === 'input'
    ? buildProfilePromptImpl({ rootDir, inputId, imagePaths, outputPath: profileStagingPath })
    : buildPromptProfilePromptImpl({ rootDir, profileId: safeProfileId, description, outputPath: profileStagingPath });
  return {
    id: jobId,
    type: 'profile',
    payload: {
      prompt,
      profileId: safeProfileId,
      profileFinalPath,
      profileStagingPath,
      outputUrl: `/media/profiles/${encodeURIComponent(safeProfileId)}/multiview_reference.png`,
    },
  };
}

export async function resolveMediaPath({
  rootDir,
  pathname,
  loadCatalogImpl = loadCatalog,
}) {
  let parts;
  try {
    parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
  const catalog = await loadCatalogImpl(rootDir);
  if (parts[1] === 'profiles' && parts.length === 4 && parts[3] === 'multiview_reference.png') {
    const profile = catalog.profiles.find((item) => item.id === parts[2]);
    return profile ? path.join(rootDir, 'profiles', profile.id, 'multiview_reference.png') : null;
  }
  if (parts[1] === 'style-previews' && parts.length === 3) {
    const match = /^(.+)\.jpg$/u.exec(parts[2]);
    if (!match) return null;
    const style = catalog.styles.find((item) => item.id === match[1]);
    const expectedUrl = style ? `/media/style-previews/${encodeURIComponent(style.id)}.jpg` : null;
    if (!style || !style.previewUrl || style.previewUrl !== expectedUrl || pathname !== expectedUrl) return null;
    return path.join(rootDir, 'styles', 'previews', `${style.id}.jpg`);
  }
  if (parts[1] === 'output' && parts.length === 3 && path.basename(parts[2]) === parts[2] && IMAGE_EXTENSIONS.has(path.extname(parts[2]).toLowerCase())) {
    return path.join(rootDir, 'output', parts[2]);
  }
  return null;
}

export function createControlServer({
  rootDir,
  runTaskImpl = runCodexTask,
  syncStylePreviewImpl = syncStylePreview,
  beforeProfileCommitImpl = async () => {},
  openImpl = openTarget,
  now = Date.now,
  adminToken = randomUUID(),
  onClose = async () => {},
} = {}) {
  if (!rootDir) throw new TypeError('rootDir is required');
  const lease = new LeaseManager({ now });
  const clients = new Set();
  let server = null;
  let current = null;
  let closed = false;
  const reservedProfileIds = new Set();
  const profileJobIds = new Map();

  const queue = new SerialJobQueue({
    runJob: async (job, signal) => {
      let result;
      try {
        result = await runTaskImpl({ prompt: job.payload.prompt, rootDir, signal });
      } catch (error) {
        if (job.payload.profileManifestPath) await unlink(job.payload.profileManifestPath).catch(() => {});
        if (job.payload.profileStagingPath) await unlink(job.payload.profileStagingPath).catch(() => {});
        if (job.payload.styleStagingPath) await unlink(job.payload.styleStagingPath).catch(() => {});
        if (job.type === 'generate' && job.batchId && error?.code === 'CODEX_QUOTA_EXHAUSTED') {
          await reconcileGenerationBatch(rootDir, job.batchId).catch(() => {});
          await updateGenerationBatch(rootDir, job.batchId, (batch) => ({ ...batch, status: 'paused_quota', error: { code: error.code, message: error.message } })).catch(() => {});
          queue.cancelWaitingBatch(job.batchId);
        } else if (job.type === 'generate' && job.batchId) {
          const outputPaths = job.payload.outputPaths ?? [job.payload.outputPath];
          await markGenerationItemsFailed(rootDir, job.batchId, outputPaths, error).catch(() => {});
        }
        throw error;
      }
      if (job.type === 'style') {
        try {
          throwIfAborted(signal);
          const published = await publishStyleDraft({ rootDir, stagingPath: job.payload.styleStagingPath });
          return commitJobResult({ styleId: published.styleId });
        } finally {
          await unlink(job.payload.styleStagingPath).catch(() => {});
        }
      }
      if (job.type === 'profile') {
        try {
          let profileId = job.payload.profileId;
          if (job.payload.profileManifestPath) {
            let manifest;
            try {
              manifest = JSON.parse(await readFile(job.payload.profileManifestPath, 'utf8'));
            } catch {
              throw new AppError('PROFILE_NAME_RESULT_MISSING', '任务完成但没有返回有效人物名称', 500);
            } finally {
              await unlink(job.payload.profileManifestPath).catch(() => {});
            }
            profileId = assertSafeId(manifest?.profileId, '人物');
            if (job.payload.existingProfileIds.includes(profileId)) {
              throw new AppError('PROFILE_NAME_CONFLICT', 'AI 生成的人物名称与现有人物冲突', 409);
            }
          } else {
            profileId = assertSafeId(profileId, '人物');
          }
          const outputPath = job.payload.profileFinalPath ?? path.join(rootDir, 'profiles', profileId, 'multiview_reference.png');
          await assertReadableFile(job.payload.profileStagingPath, '任务完成但没有找到人物多视图图片');
          if (job.payload.profileManifestPath) {
            try {
              await access(outputPath);
              throw new AppError('PROFILE_NAME_CONFLICT', 'AI 生成的人物名称与现有人物冲突', 409);
            } catch (error) {
              if (error instanceof AppError) throw error;
              if (error.code !== 'ENOENT') throw error;
            }
          }
          await beforeProfileCommitImpl({
            job,
            signal,
            profileId,
            outputPath,
            profileStagingPath: job.payload.profileStagingPath,
          });
          throwIfAborted(signal);
          await mkdir(path.dirname(outputPath), { recursive: true });
          throwIfAborted(signal);
          await rename(job.payload.profileStagingPath, outputPath);
          const outputUrl = `/media/profiles/${encodeURIComponent(profileId)}/multiview_reference.png`;
          return commitJobResult(sanitizeProfileResult({ profileId, outputUrl, outputUrls: [outputUrl] }));
        } catch (error) {
          await unlink(job.payload.profileStagingPath).catch(() => {});
          if (job.payload.profileManifestPath) await unlink(job.payload.profileManifestPath).catch(() => {});
          throw error;
        }
      }
      const outputPaths = job.payload.outputPaths ?? [job.payload.outputPath];
      try {
        for (const outputPath of outputPaths) {
          await assertReadableFile(outputPath, '任务完成但没有找到全部输出图片');
        }
      } catch (error) {
        if (job.type === 'generate' && job.batchId) {
          await markGenerationItemsFailed(rootDir, job.batchId, outputPaths, error).catch(() => {});
        }
        throw error;
      }
      const outputUrls = job.payload.outputUrls ?? [job.payload.outputUrl];
      const generatedAt = new Date(now()).toISOString();
      let preview;
      if (job.type === 'generate' && job.styleId) {
        throwIfAborted(signal);
        const synced = await syncStylePreviewImpl({
          rootDir,
          styleId: job.styleId,
          styleFingerprint: job.payload.styleFingerprint,
          outputPaths,
          jobId: job.id,
          generatedAt,
          signal,
        });
        preview = synced?.preview;
      }
      return job.type === 'generate'
        ? commitJobResult(sanitizeGenerateResult({ styleId: job.styleId, outputUrl: outputUrls[0], outputUrls, preview, usage: result?.usage }))
        : sanitizeGenerateResult({ styleId: job.styleId, outputUrl: outputUrls[0], outputUrls, preview });
    },
  });

  queue.onEvent((event) => {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const response of clients) response.write(line);
    if (['succeeded', 'failed', 'cancelled'].includes(event.job.status)) {
      if (event.job.type === 'generate' && event.job.batchId) {
        reconcileGenerationBatch(rootDir, event.job.batchId).then((batch) => {
          if (!batch || batch.status === 'paused_quota') return;
          if (event.job.result?.usage) {
            const usage = event.job.result.usage;
            return updateGenerationBatch(rootDir, batch.id, (currentBatch) => ({
              ...currentBatch,
              usage: {
                inputTokens: (currentBatch.usage?.inputTokens ?? 0) + (usage.inputTokens ?? 0),
                outputTokens: (currentBatch.usage?.outputTokens ?? 0) + (usage.outputTokens ?? 0),
                totalTokens: (currentBatch.usage?.totalTokens ?? 0) + (usage.totalTokens ?? 0),
              },
            })).then(() => reconcileGenerationBatch(rootDir, batch.id));
          }
          return batch;
        }).then((batch) => {
          if (!batch || batch.status === 'paused_quota') return;
          const related = queue.snapshot().jobs.filter((job) => job.batchId === event.job.batchId);
          if (related.length && related.every((job) => ['succeeded', 'failed', 'cancelled'].includes(job.status))) {
            const status = batch.completed === batch.total ? 'completed' : related.some((job) => job.status === 'failed') ? 'failed' : 'cancelled';
            return updateGenerationBatch(rootDir, batch.id, (currentBatch) => ({ ...currentBatch, status }));
          }
        }).catch(() => {});
      }
      const profileId = profileJobIds.get(event.job.id);
      if (profileId) {
        reservedProfileIds.delete(profileId);
        profileJobIds.delete(event.job.id);
      }
    }
  });

  function requireOwner(request) {
    const clientId = request.headers['x-client-id'];
    const token = request.headers['x-lease-token'];
    if (!lease.isOwner(clientId, token)) throw new AppError('LEASE_REQUIRED', '当前页面没有控制权', 423);
  }

  async function mediaPath(pathname) {
    return resolveMediaPath({ rootDir, pathname });
  }

  async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost');
    const { pathname } = url;

    if (request.method === 'GET' && pathname === '/api/health') {
      return sendJson(response, 200, { ok: true, pid: process.pid, network: current?.lan ? 'lan' : 'local' });
    }
    if (request.method === 'GET' && pathname === '/api/catalog') {
      return sendJson(response, 200, await loadCatalog(rootDir));
    }
    if (request.method === 'POST' && pathname === '/api/lease/acquire') {
      return sendJson(response, 200, lease.acquire((await readJson(request)).clientId));
    }
    if (request.method === 'POST' && pathname === '/api/lease/heartbeat') {
      const body = await readJson(request);
      return sendJson(response, 200, lease.heartbeat(body.clientId, body.token));
    }
    if (request.method === 'POST' && pathname === '/api/lease/release') {
      const body = await readJson(request);
      const released = lease.release(body.clientId, body.token);
      sendJson(response, released ? 200 : 403, released ? { released: true } : errorPayload(new AppError('LEASE_INVALID', '租约无效', 403)));
      return;
    }
    if (request.method === 'POST' && pathname === '/api/shutdown') {
      requireOwner(request);
      sendJson(response, 202, { shuttingDown: true });
      setImmediate(() => api.close().catch(() => {}));
      return;
    }
    if (request.method === 'POST' && pathname === '/api/admin/release') {
      if (request.headers['x-control-token'] !== adminToken) throw new AppError('ADMIN_REQUIRED', '管理命令无效', 403);
      lease.forceRelease();
      return sendJson(response, 200, { released: true });
    }
    if (request.method === 'GET' && pathname === '/api/jobs') {
      return sendJson(response, 200, queue.snapshot());
    }
    if (request.method === 'GET' && pathname === '/api/generation-history') {
      const history = await readGenerationHistory(rootDir);
      for (const batch of history.batches.filter((item) => item.status === 'running')) await reconcileGenerationBatch(rootDir, batch.id);
      const fresh = await readGenerationHistory(rootDir);
      return sendJson(response, 200, { ...fresh, batches: fresh.batches.map(enrichGenerationBatch) });
    }
    if (request.method === 'GET' && pathname === '/api/events') {
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
      response.flushHeaders();
      clients.add(response);
      request.on('close', () => clients.delete(response));
      return;
    }
    if (request.method === 'POST' && pathname === '/api/jobs/generate') {
      requireOwner(request);
      const body = await readJson(request);
      if (!Array.isArray(body.profileIds) || body.profileIds.length < 1 || body.profileIds.length > 10) {
        throw new AppError('PROFILES_INVALID', '至少选择一个人物，最多选择 10 人', 400);
      }
      const profileIds = [...new Set(body.profileIds.map((profileId) => assertSafeId(profileId, '人物')))];
      if (!Array.isArray(body.styleIds) || body.styleIds.length < 1) {
        throw new AppError('STYLES_INVALID', '至少选择一个风格', 400);
      }
      const styleIds = [];
      const seenStyleIds = new Set();
      for (const styleId of body.styleIds) {
        const safeStyleId = assertSafeId(styleId, '风格');
        if (seenStyleIds.has(safeStyleId)) continue;
        seenStyleIds.add(safeStyleId);
        styleIds.push(safeStyleId);
      }
      if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 20) {
        throw new AppError('QUANTITY_INVALID', '生成数量必须是 1 到 20 的整数', 400);
      }
      const orientation = body.orientation ?? 'portrait';
      if (!['portrait', 'landscape'].includes(orientation)) {
        throw new AppError('ORIENTATION_INVALID', '照片方向必须是纵向或横向', 400);
      }
      if (typeof body.extraPrompt !== 'string' || body.extraPrompt.length > 4_000) throw new AppError('PROMPT_INVALID', '额外要求最多 4000 字', 400);
      const formatId = typeof body.formatId === 'string' ? body.formatId.trim() : '';
      const catalog = await loadCatalog(rootDir);
      const profiles = profileIds.map((profileId) => catalog.profiles.find((item) => item.id === profileId));
      const styles = styleIds.map((styleId) => catalog.styles.find((item) => item.id === styleId));
      if (profiles.some((profile) => !profile) || styles.some((style) => !style)) {
        throw new AppError('SELECTION_INVALID', '人物、风格或输出格式不可用', 422);
      }
      let format;
      if (formatId === CUSTOM_FORMAT_ID) {
        format = resolveCustomFormat(body.customFormat, orientation);
      } else {
        const preset = catalog.formats.find((item) => item.id === formatId);
        if (!preset) throw new AppError('SELECTION_INVALID', '人物、风格或输出格式不可用', 422);
        format = orientFormat(preset, orientation);
      }
      const batchId = randomUUID();
      await mkdir(path.join(rootDir, 'output'), { recursive: true });
      await removeStaleGeneratedOutputs(rootDir, profileIds, styleIds);
      const jobDefinitions = buildGenerateBatchDefinitions({
        rootDir,
        profileIds,
        styleIds,
        styleFingerprints: Object.fromEntries(styles.map((style) => [style.id, style.fingerprint])),
        format,
        orientation,
        extraPrompt: body.extraPrompt,
        quantity: body.quantity,
      });
      await createGenerationBatch(rootDir, {
        id: batchId,
        status: 'running',
        total: jobDefinitions.reduce((sum, job) => sum + job.payload.outputPaths.length, 0),
        completed: 0,
        profileIds,
        styles: styles.map((style) => ({ id: style.id, fingerprint: style.fingerprint })),
        format,
        orientation,
        extraPrompt: body.extraPrompt,
        quantity: body.quantity,
        items: jobDefinitions.flatMap((job) => job.payload.outputPaths.map((outputPath, index) => ({
          id: `${job.id}:${index}`,
          styleId: job.styleId,
          styleFingerprint: job.payload.styleFingerprint,
          outputPath,
          outputUrl: job.payload.outputUrls[index],
          status: 'pending',
        }))),
      });
      const jobs = jobDefinitions.map((job) => queue.enqueue({ ...job, batchId }));
      return sendJson(response, 202, { batchId, jobs, batch: { completed: 0, total: jobDefinitions.reduce((sum, job) => sum + job.payload.outputPaths.length, 0) } });
    }
    const resumeMatch = request.method === 'POST' && /^\/api\/generation-history\/([^/]+)\/resume$/u.exec(pathname);
    if (resumeMatch) {
      requireOwner(request);
      const batchId = safeDecodePathSegment(resumeMatch[1], { code: 'BATCH_NOT_FOUND', message: '生成记录不存在' });
      const batch = await reconcileGenerationBatch(rootDir, batchId);
      if (!batch || !['paused_quota', 'interrupted', 'failed'].includes(batch.status)) throw new AppError('BATCH_NOT_RESUMABLE', '该生成记录不可继续', 409);
      const catalog = await loadCatalog(rootDir);
      if (!batch.profileIds.every((id) => catalog.profiles.some((profile) => profile.id === id))) throw new AppError('RESUME_INPUT_CHANGED', '人物设定已变化或不存在', 409);
      const pendingStyleIds = new Set(batch.items.filter((item) => item.status === 'pending').map((item) => item.styleId));
      for (const style of batch.styles) {
        if (pendingStyleIds.has(style.id) && !catalog.styles.some((item) => item.id === style.id && item.fingerprint === style.fingerprint)) throw new AppError('RESUME_INPUT_CHANGED', '风格已变化或不存在', 409);
      }
      const definitions = [];
      for (const style of batch.styles) {
        const items = batch.items.filter((item) => item.styleId === style.id && item.status === 'pending');
        if (!items.length) continue;
        const id = randomUUID();
        definitions.push({
          id, type: 'generate', styleId: style.id, batchIndex: definitions.length, batchSize: 0,
          payload: {
            outputPaths: items.map((item) => item.outputPath),
            outputUrls: items.map((item) => item.outputUrl),
            styleFingerprint: style.fingerprint,
            prompt: buildGeneratePrompt({ rootDir, profileIds: batch.profileIds, styleId: style.id, format: batch.format, orientation: batch.orientation, extraPrompt: batch.extraPrompt, quantity: items.length, outputPaths: items.map((item) => item.outputPath) }),
          },
        });
      }
      for (const definition of definitions) definition.batchSize = definitions.length;
      if (!definitions.length) throw new AppError('BATCH_ALREADY_COMPLETE', '该生成记录没有需要继续的缺失输出', 409);
      const summary = summarizeGenerationBatch(batch);
      await updateGenerationBatch(rootDir, batchId, (currentBatch) => ({ ...currentBatch, status: 'running', error: null }));
      const jobs = definitions.map((job) => queue.enqueue({ ...job, batchId }));
      return sendJson(response, 202, { batchId, jobs, resume: { ...summary, total: batch.total, jobCount: jobs.length }, batch: { completed: summary.completed, total: batch.total } });
    }
    if (request.method === 'POST' && pathname === '/api/jobs/style') {
      requireOwner(request);
      const body = await readJson(request);
      if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4_000) {
        throw new AppError('STYLE_PROMPT_INVALID', '风格提示词不能为空且最多 4000 字', 400);
      }
      const id = randomUUID();
      const styleStagingPath = path.join(rootDir, '.control', `style-${id}.json`);
      await mkdir(path.dirname(styleStagingPath), { recursive: true });
      return sendJson(response, 202, queue.enqueue({
        id,
        type: 'style',
        payload: {
          prompt: buildStylePrompt({ rootDir, description: body.prompt.trim(), stagingPath: styleStagingPath }),
          styleStagingPath,
        },
      }));
    }
    if (request.method === 'POST' && pathname === '/api/jobs/profile') {
      requireOwner(request);
      const body = await readJson(request);
      assertSafeId(body.inputId, '人物');
      const catalog = await loadCatalog(rootDir);
      if (!catalog.inputs.some((item) => item.id === body.inputId)) throw new AppError('INPUT_INVALID', '人物输入目录不存在', 422);
      const inputDir = path.join(rootDir, 'input', body.inputId);
      const names = await readdir(inputDir, { withFileTypes: true });
      const imagePaths = names.filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())).map((entry) => path.join(inputDir, entry.name)).sort();
      if (!imagePaths.length) throw new AppError('INPUT_IMAGES_MISSING', '人物输入目录没有可用图片', 422);
      const job = createProfileJobDefinition({ rootDir, profileId: body.inputId, kind: 'input', inputId: body.inputId, imagePaths });
      await mkdir(path.join(rootDir, '.control'), { recursive: true });
      return sendJson(response, 202, queue.enqueue(job));
    }
    if (request.method === 'POST' && pathname === '/api/jobs/profile-prompt') {
      requireOwner(request);
      const body = await readJson(request);
      if (typeof body.description !== 'string' || !body.description.trim() || body.description.length > 4_000) {
        throw new AppError('PROFILE_PROMPT_INVALID', '人物描述不能为空且最多 4000 字', 400);
      }
      if (body.name !== undefined && typeof body.name !== 'string') {
        throw new AppError('PROFILE_NAME_INVALID', '人物名称无效', 400);
      }
      const requestedName = body.name?.trim() || '';
      if (requestedName.length > 40) throw new AppError('PROFILE_NAME_INVALID', '人物名称最多 40 字', 400);
      const profileId = requestedName ? assertSafeId(requestedName, '人物') : '';
      const id = randomUUID();
      if (profileId) {
        await mkdir(path.join(rootDir, '.control'), { recursive: true });
        const jobDefinition = createProfileJobDefinition({
          rootDir,
          jobId: id,
          profileId,
          kind: 'prompt',
          description: body.description.trim(),
        });
        reservedProfileIds.add(profileId);
        profileJobIds.set(id, profileId);
        const job = queue.enqueue(jobDefinition);
        return sendJson(response, 202, { ...job, profileId });
      }
      const catalog = await loadCatalog(rootDir);
      const existingProfileIds = catalog.profiles.map((profile) => profile.id);
      const controlDir = path.join(rootDir, '.control');
      const manifestPath = path.join(controlDir, `profile-${id}.json`);
      const stagingPath = path.join(controlDir, `profile-${id}.png`);
      await mkdir(controlDir, { recursive: true });
      const prompt = buildPromptProfilePrompt({ rootDir, description: body.description.trim(), stagingPath, manifestPath, existingProfileIds });
      const job = queue.enqueue({ id, type: 'profile', payload: { prompt, profileManifestPath: manifestPath, profileStagingPath: stagingPath, existingProfileIds } });
      return sendJson(response, 202, job);
    }
    const profileDeleteMatch = request.method === 'DELETE' && /^\/api\/profiles\/([^/]+)$/.exec(pathname);
    if (profileDeleteMatch) {
      requireOwner(request);
      const profileId = assertSafeId(decodeURIComponent(profileDeleteMatch[1]), '人物');
      const catalog = await loadCatalog(rootDir);
      if (!catalog.profiles.some((profile) => profile.id === profileId)) {
        throw new AppError('PROFILE_NOT_FOUND', '人物设定不存在', 404);
      }
      const profileDir = path.join(rootDir, 'profiles', profileId);
      await unlink(path.join(profileDir, 'multiview_reference.png'));
      try {
        await rmdir(profileDir);
      } catch (error) {
        if (!['ENOTEMPTY', 'ENOENT'].includes(error.code)) throw error;
      }
      return sendJson(response, 200, { deleted: true, profileId });
    }
    const styleDeleteMatch = request.method === 'DELETE' && /^\/api\/styles\/([^/]+)$/.exec(pathname);
    if (styleDeleteMatch) {
      requireOwner(request);
      const styleId = assertSafeId(safeDecodePathSegment(styleDeleteMatch[1]), '风格');
      const catalog = await loadCatalog(rootDir);
      if (!catalog.styles.some((item) => item.id === styleId)) throw new AppError('STYLE_NOT_FOUND', '风格不存在', 404);
      await unlink(path.join(rootDir, 'styles', `${styleId}.md`));
      return sendJson(response, 200, { deleted: true, styleId });
    }
    const cancelMatch = request.method === 'DELETE' && /^\/api\/jobs\/([^/]+)$/.exec(pathname);
    if (cancelMatch) {
      requireOwner(request);
      const cancelled = queue.cancel(cancelMatch[1]);
      return sendJson(response, cancelled ? 200 : 404, cancelled ? { cancelled: true } : errorPayload(new AppError('JOB_NOT_FOUND', '任务不存在或已结束', 404)));
    }
    const cancelBatchMatch = request.method === 'DELETE' && /^\/api\/batches\/([^/]+)$/.exec(pathname);
    if (cancelBatchMatch) {
      requireOwner(request);
      const batchId = safeDecodePathSegment(cancelBatchMatch[1], { code: 'BATCH_NOT_FOUND', message: '批次不存在或已结束', status: 404 });
      const cancelled = queue.cancelBatch(batchId);
      return sendJson(
        response,
        cancelled ? 200 : 404,
        cancelled ? { cancelled } : errorPayload(new AppError('BATCH_NOT_FOUND', '批次不存在或已结束', 404)),
      );
    }
    if (request.method === 'POST' && pathname === '/api/open-output') {
      requireOwner(request);
      await readJson(request);
      openImpl(path.join(rootDir, 'output'));
      return sendJson(response, 200, { opened: true });
    }
    if (request.method === 'POST' && pathname === '/api/open-input') {
      requireOwner(request);
      await readJson(request);
      openImpl(path.join(rootDir, 'input'));
      return sendJson(response, 200, { opened: true });
    }
    if (request.method === 'POST' && pathname === '/api/network') {
      requireOwner(request);
      const body = await readJson(request);
      sendJson(response, 202, { switching: true, lan: Boolean(body.lan) });
      setImmediate(() => api.setNetworkMode(Boolean(body.lan)));
      return;
    }
    if (request.method === 'GET' && pathname.startsWith('/media/')) {
      const target = await mediaPath(pathname);
      if (target) return serveFile(response, target);
      return sendJson(response, 404, errorPayload(new AppError('NOT_FOUND', '资源不存在', 404)));
    }
    if (request.method === 'GET' && (pathname === '/' || pathname === '/control.html')) return serveFile(response, path.join(WEB_DIR, 'control.html'));
    if (request.method === 'GET' && pathname === '/control.css') return serveFile(response, path.join(WEB_DIR, 'control.css'));
    if (request.method === 'GET' && pathname === '/control.js') return serveFile(response, path.join(WEB_DIR, 'control.js'));
    if (request.method === 'GET' && pathname === '/i18n.mjs') return serveFile(response, path.join(WEB_DIR, 'i18n.mjs'));
    if (request.method === 'GET' && pathname === '/layout-columns.mjs') return serveFile(response, path.join(WEB_DIR, 'layout-columns.mjs'));
    const styleSelectionPath = resolveStyleSelectionPath(pathname);
    if (request.method === 'GET' && styleSelectionPath) return serveFile(response, styleSelectionPath);
    return sendJson(response, 404, errorPayload(new AppError('NOT_FOUND', '接口不存在', 404)));
  }

  function newServer() {
    return http.createServer((request, response) => {
      handle(request, response).catch((error) => {
        if (response.headersSent) return response.end();
        const safe = asAppError(error);
        sendJson(response, safe.status, errorPayload(safe));
      });
    });
  }

  async function listen({ port = 0, lan = false } = {}) {
    closed = false;
    const host = lan ? '0.0.0.0' : '127.0.0.1';
    server = newServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
    const address = server.address();
    current = { host, port: address.port, lan, url: `http://127.0.0.1:${address.port}` };
    return current;
  }

  const api = {
    queue,
    lease,
    listen,
    address: () => current,
    async setNetworkMode(lan) {
      const oldPort = current?.port ?? 0;
      if (server?.listening) await new Promise((resolve) => server.close(resolve));
      return listen({ port: oldPort, lan });
    },
    async close() {
      if (closed) return;
      closed = true;
      queue.cancelWaiting();
      queue.terminateActive();
      for (const response of clients) response.end();
      clients.clear();
      if (server?.listening) await new Promise((resolve) => server.close(resolve));
      await onClose();
    },
  };
  return api;
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const rootDir = path.resolve(optionValue(args, '--root', path.resolve(WEB_DIR, '..')));
  const statePath = path.join(rootDir, '.control', 'server.json');
  if (args.includes('--stop') || args.includes('--release')) {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    if (args.includes('--stop')) {
      process.kill(state.pid, 'SIGTERM');
      process.stdout.write(`${JSON.stringify({ stopped: true, pid: state.pid })}\n`);
      return;
    }
    const response = await fetch(`${state.url}/api/admin/release`, { method: 'POST', headers: { 'x-control-token': state.adminToken } });
    if (!response.ok) throw new Error('force release failed');
    process.stdout.write(`${JSON.stringify({ released: true })}\n`);
    return;
  }
  const port = Number(optionValue(args, '--port', '0'));
  const adminToken = randomUUID();
  const app = createControlServer({ rootDir, adminToken, onClose: () => unlink(statePath).catch(() => {}) });
  const address = await app.listen({ port, lan: args.includes('--lan') });
  await mkdir(path.join(rootDir, '.control'), { recursive: true });
  await writeFile(statePath, JSON.stringify({ pid: process.pid, adminToken, ...address }, null, 2), { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ pid: process.pid, ...address })}\n`);
  if (args.includes('--open')) {
    await openTarget(address.url);
  }
  const stop = async () => {
    await app.close();
    await unlink(statePath).catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exit(1);
  });
}

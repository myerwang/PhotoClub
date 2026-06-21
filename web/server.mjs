import http from 'node:http';
import { spawn } from 'node:child_process';
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
import { buildGeneratePrompt, buildProfilePrompt, buildPromptProfilePrompt, runCodexTask } from './lib/runner.mjs';
import { syncStylePreview } from './lib/stylepreview.mjs';

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

function sanitizeGenerateResult({ styleId, outputUrl, outputUrls, preview }) {
  return {
    styleId,
    outputUrl,
    outputUrls,
    ...(preview === undefined ? {} : { preview }),
  };
}

export function buildGenerateBatchDefinitions({
  rootDir,
  profileIds,
  styleIds,
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
      payload: { prompt, outputPaths, outputUrls },
    };
  });
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
  openImpl = (command, args) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.unref();
  },
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
        throw error;
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
      for (const outputPath of outputPaths) {
        await assertReadableFile(outputPath, '任务完成但没有找到全部输出图片');
      }
      const outputUrls = job.payload.outputUrls ?? [job.payload.outputUrl];
      const generatedAt = new Date(now()).toISOString();
      let preview;
      if (job.type === 'generate' && job.styleId) {
        throwIfAborted(signal);
        const synced = await syncStylePreviewImpl({
          rootDir,
          styleId: job.styleId,
          outputPaths,
          jobId: job.id,
          generatedAt,
          signal,
        });
        preview = synced?.preview;
      }
      return job.type === 'generate'
        ? commitJobResult(sanitizeGenerateResult({ styleId: job.styleId, outputUrl: outputUrls[0], outputUrls, preview }))
        : sanitizeGenerateResult({ styleId: job.styleId, outputUrl: outputUrls[0], outputUrls, preview });
    },
  });

  queue.onEvent((event) => {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const response of clients) response.write(line);
    if (['succeeded', 'failed', 'cancelled'].includes(event.job.status)) {
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
      const jobDefinitions = buildGenerateBatchDefinitions({
        rootDir,
        profileIds,
        styleIds,
        format,
        orientation,
        extraPrompt: body.extraPrompt,
        quantity: body.quantity,
      });
      const jobs = jobDefinitions.map((job) => queue.enqueue({ ...job, batchId }));
      return sendJson(response, 202, { batchId, jobs });
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
      openImpl('/usr/bin/open', [path.join(rootDir, 'output')]);
      return sendJson(response, 200, { opened: true });
    }
    if (request.method === 'POST' && pathname === '/api/open-input') {
      requireOwner(request);
      await readJson(request);
      openImpl('/usr/bin/open', [path.join(rootDir, 'input')]);
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
    const child = spawn('/usr/bin/open', [address.url], { stdio: 'ignore', detached: true });
    child.unref();
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

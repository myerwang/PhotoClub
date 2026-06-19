import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertSafeId, loadCatalog } from './lib/catalog.mjs';
import { AppError, asAppError, errorPayload } from './lib/errors.mjs';
import { LeaseManager } from './lib/lease.mjs';
import { SerialJobQueue } from './lib/queue.mjs';
import { buildGeneratePrompt, buildProfilePrompt, buildPromptProfilePrompt, runCodexTask } from './lib/runner.mjs';

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

function contentType(filePath) {
  return ({
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  })[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function serveFile(response, filePath) {
  try {
    const data = await readFile(filePath);
    response.writeHead(200, { 'content-type': contentType(filePath), 'content-length': data.length, 'cache-control': 'no-store' });
    response.end(data);
  } catch {
    sendJson(response, 404, errorPayload(new AppError('NOT_FOUND', '资源不存在', 404)));
  }
}

export function createControlServer({
  rootDir,
  runTaskImpl = runCodexTask,
  openImpl = (command, args) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.unref();
  },
  now = Date.now,
  adminToken = randomUUID(),
  releaseDelayMs = 1_500,
} = {}) {
  if (!rootDir) throw new TypeError('rootDir is required');
  const lease = new LeaseManager({ now });
  const clients = new Set();
  let server = null;
  let current = null;
  let leaseTimer = null;
  let releaseTimer = null;
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
      if (job.payload.profileManifestPath) {
        let manifest;
        try {
          manifest = JSON.parse(await readFile(job.payload.profileManifestPath, 'utf8'));
        } catch {
          await unlink(job.payload.profileStagingPath).catch(() => {});
          throw new AppError('PROFILE_NAME_RESULT_MISSING', '任务完成但没有返回有效人物名称', 500);
        } finally {
          await unlink(job.payload.profileManifestPath).catch(() => {});
        }
        let profileId;
        try {
          profileId = assertSafeId(manifest?.profileId, '人物');
        } catch (error) {
          await unlink(job.payload.profileStagingPath).catch(() => {});
          throw error;
        }
        if (job.payload.existingProfileIds.includes(profileId)) {
          await unlink(job.payload.profileStagingPath).catch(() => {});
          throw new AppError('PROFILE_NAME_CONFLICT', 'AI 生成的人物名称与现有人物冲突', 409);
        }
        const outputPath = path.join(rootDir, 'profiles', profileId, 'multiview_reference.png');
        try {
          await access(job.payload.profileStagingPath);
        } catch {
          throw new AppError('OUTPUT_MISSING', '任务完成但没有找到人物多视图图片', 500);
        }
        try {
          await access(outputPath);
          await unlink(job.payload.profileStagingPath).catch(() => {});
          throw new AppError('PROFILE_NAME_CONFLICT', 'AI 生成的人物名称与现有人物冲突', 409);
        } catch (error) {
          if (error instanceof AppError) throw error;
          if (error.code !== 'ENOENT') throw error;
        }
        await mkdir(path.dirname(outputPath), { recursive: true });
        await rename(job.payload.profileStagingPath, outputPath);
        const outputUrl = `/media/profiles/${encodeURIComponent(profileId)}/multiview_reference.png`;
        return { ...result, profileId, outputUrl, outputUrls: [outputUrl] };
      }
      const outputPaths = job.payload.outputPaths ?? [job.payload.outputPath];
      if (runTaskImpl === runCodexTask) {
        for (const outputPath of outputPaths) {
          try {
            await access(outputPath);
          } catch {
            throw new AppError('OUTPUT_MISSING', '任务完成但没有找到全部输出图片', 500);
          }
        }
      }
      const outputUrls = job.payload.outputUrls ?? [job.payload.outputUrl];
      return { ...result, outputUrl: outputUrls[0], outputUrls };
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
    const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const catalog = await loadCatalog(rootDir);
    if (parts[1] === 'profiles' && parts.length === 4 && parts[3] === 'multiview_reference.png') {
      const profile = catalog.profiles.find((item) => item.id === parts[2]);
      return profile ? path.join(rootDir, 'profiles', profile.id, 'multiview_reference.png') : null;
    }
    if (parts[1] === 'styles' && parts.length === 3) {
      const style = catalog.styles.find((item) => decodeURIComponent(item.thumbnailUrl.split('/').at(-1)) === parts[2]);
      return style ? path.join(rootDir, 'styles', parts[2]) : null;
    }
    if (parts[1] === 'output' && parts.length === 3 && path.basename(parts[2]) === parts[2] && IMAGE_EXTENSIONS.has(path.extname(parts[2]).toLowerCase())) {
      return path.join(rootDir, 'output', parts[2]);
    }
    return null;
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
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = null;
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
      if (released && body.shutdown) {
        if (releaseTimer) clearTimeout(releaseTimer);
        releaseTimer = setTimeout(() => {
          releaseTimer = null;
          if (lease.snapshot().status === 'free') api.close();
        }, releaseDelayMs);
        releaseTimer.unref?.();
      }
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
      if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 20) {
        throw new AppError('QUANTITY_INVALID', '生成数量必须是 1 到 20 的整数', 400);
      }
      const orientation = body.orientation ?? 'portrait';
      if (!['portrait', 'landscape'].includes(orientation)) {
        throw new AppError('ORIENTATION_INVALID', '照片方向必须是纵向或横向', 400);
      }
      assertSafeId(body.styleId, '风格');
      if (typeof body.extraPrompt !== 'string' || body.extraPrompt.length > 4_000) throw new AppError('PROMPT_INVALID', '额外要求最多 4000 字', 400);
      const catalog = await loadCatalog(rootDir);
      const profiles = profileIds.map((profileId) => catalog.profiles.find((item) => item.id === profileId));
      const style = catalog.styles.find((item) => item.id === body.styleId);
      const format = catalog.formats.find((item) => item.id === body.formatId);
      if (profiles.some((profile) => !profile) || !style || !format) throw new AppError('SELECTION_INVALID', '人物、风格或输出格式不可用', 422);
      const shortEdge = Math.min(format.width, format.height);
      const longEdge = Math.max(format.width, format.height);
      const orientedFormat = {
        ...format,
        width: orientation === 'landscape' ? longEdge : shortEdge,
        height: orientation === 'landscape' ? shortEdge : longEdge,
      };
      const id = randomUUID();
      const baseName = `${profileIds.join('+')}-${body.styleId}-${id.slice(0, 8)}`;
      const fileNames = Array.from({ length: body.quantity }, (_, index) => `${baseName}-${index + 1}.png`);
      const outputPaths = fileNames.map((fileName) => path.join(rootDir, 'output', fileName));
      const outputUrls = fileNames.map((fileName) => `/media/output/${fileName}`);
      await mkdir(path.join(rootDir, 'output'), { recursive: true });
      const prompt = buildGeneratePrompt({ rootDir, profileIds, styleId: body.styleId, format: orientedFormat, orientation, extraPrompt: body.extraPrompt, quantity: body.quantity, outputPaths });
      return sendJson(response, 202, queue.enqueue({ id, type: 'generate', payload: { prompt, outputPaths, outputUrls } }));
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
      const id = randomUUID();
      const outputPath = path.join(rootDir, 'profiles', body.inputId, 'multiview_reference.png');
      await mkdir(path.dirname(outputPath), { recursive: true });
      const prompt = buildProfilePrompt({ rootDir, inputId: body.inputId, imagePaths, outputPath });
      return sendJson(response, 202, queue.enqueue({ id, type: 'profile', payload: { prompt, outputPath, outputUrl: `/media/profiles/${body.inputId}/multiview_reference.png` } }));
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
        const outputPath = path.join(rootDir, 'profiles', profileId, 'multiview_reference.png');
        await mkdir(path.dirname(outputPath), { recursive: true });
        const prompt = buildPromptProfilePrompt({ profileId, description: body.description.trim(), outputPath });
        reservedProfileIds.add(profileId);
        profileJobIds.set(id, profileId);
        const job = queue.enqueue({ id, type: 'profile', payload: { prompt, outputPath, outputUrl: `/media/profiles/${encodeURIComponent(profileId)}/multiview_reference.png` } });
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
    if (!leaseTimer) {
      leaseTimer = setInterval(() => {
        if (lease.expireIfNeeded()) {
          queue.cancelWaiting();
          queue.terminateActive();
          api.close();
        }
      }, 5_000);
      leaseTimer.unref?.();
    }
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
      if (leaseTimer) clearInterval(leaseTimer);
      leaseTimer = null;
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = null;
      queue.cancelWaiting();
      queue.terminateActive();
      for (const response of clients) response.end();
      clients.clear();
      if (server?.listening) await new Promise((resolve) => server.close(resolve));
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
  const app = createControlServer({ rootDir, adminToken });
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

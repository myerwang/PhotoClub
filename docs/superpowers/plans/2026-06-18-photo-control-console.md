# 照片生成控制台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个由系统默认浏览器打开的本地照片生成控制台，通过独立 Codex CLI 任务完成人物设定与最终图片生成。

**Architecture:** 使用 Node.js 标准库提供静态页面、JSON API、SSE、单客户端租约和串行任务队列。目录解析、任务提示构造、Codex 子进程和生命周期分别封装，前端只提交稳定 ID，不提交任意路径。

**Tech Stack:** Node.js 24、原生 HTML/CSS/JavaScript、Node `node:test`、Codex CLI、内置 `image_gen`、macOS `open`。

**Repository note:** `/Users/yohji/photo` 当前没有 `.git`，因此本计划不包含 Git 提交步骤。

---

## 文件结构

```text
web/
  control.html
  control.css
  control.js
  server.mjs
  lib/
    catalog.mjs
    errors.mjs
    lease.mjs
    queue.mjs
    runner.mjs
    lifecycle.mjs
  test/
    catalog.test.mjs
    lease.test.mjs
    queue.test.mjs
    runner.test.mjs
    server.test.mjs
system/skills/control/
  SKILL.md
styles/
  sticker.md
  sticker.png
package.json
```

### Task 1: 建立 Node 测试与错误协议

**Files:**
- Create: `package.json`
- Create: `web/lib/errors.mjs`
- Create: `web/test/errors.test.mjs`

- [ ] **Step 1: 写失败测试**

测试 `AppError` 必须序列化为稳定 JSON：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, errorPayload } from '../lib/errors.mjs';

test('serializes a safe structured error', () => {
  const payload = errorPayload(new AppError('STYLE_INVALID', '风格配置无效', 422, { styleId: 'sticker' }));
  assert.deepEqual(payload, {
    error: { code: 'STYLE_INVALID', message: '风格配置无效', details: { styleId: 'sticker' } }
  });
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `node --test web/test/errors.test.mjs`

Expected: FAIL，提示 `web/lib/errors.mjs` 不存在。

- [ ] **Step 3: 实现错误协议和测试脚本**

`package.json`：

```json
{
  "name": "photo-control",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test web/test/*.test.mjs",
    "start": "node web/server.mjs"
  }
}
```

`errors.mjs` 导出 `AppError`、`errorPayload`、`asAppError`。未知错误统一映射为 `INTERNAL_ERROR`，不得把堆栈发给客户端。

- [ ] **Step 4: 验证测试通过**

Run: `npm test`

Expected: PASS。

### Task 2: 目录扫描、风格元数据与缩略图规则

**Files:**
- Create: `web/lib/catalog.mjs`
- Create: `web/test/catalog.test.mjs`
- Modify: `styles/sticker.md`
- Modify: `docs/CONTRIBUTING_STYLES.md`
- Modify: `system/skills/profile/SKILL.md`
- Create: `styles/sticker.png`

- [ ] **Step 1: 写目录夹具测试**

测试必须覆盖：

```js
test('lists only profiles with readable multiview files', async () => {});
test('lists direct input directories for profile generation', async () => {});
test('parses style_id name and thumbnail from YAML frontmatter', async () => {});
test('rejects a style with missing thumbnail file', async () => {});
test('parses registered output formats and exact dimensions', async () => {});
test('rejects path traversal identifiers', () => {});
```

临时目录中创建 `profiles/mama/multiview_reference.png`、`input/mama/`、有效与无效风格文件，断言返回对象结构：

```js
{
  profiles: [{ id: 'mama', imageUrl: '/media/profiles/mama/multiview_reference.png' }],
  inputs: [{ id: 'mama' }],
  styles: [{ id: 'sticker', name: '贴纸', thumbnailUrl: '/media/styles/sticker.png' }],
  formats: [{ id: 'jp_711_photo_l_1051x1500', width: 1051, height: 1500 }]
}
```

- [ ] **Step 2: 运行并确认失败**

Run: `node --test web/test/catalog.test.mjs`

Expected: FAIL，导入目标不存在。

- [ ] **Step 3: 实现安全目录扫描器**

`catalog.mjs` 导出：

```js
export async function loadCatalog(rootDir) {}
export function assertSafeId(value, field) {}
export function parseStyleFrontmatter(markdown, fileName) {}
export function parseOutputFormats(markdown) {}
```

只接受 `/^[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]+$/u` 的单段 ID；媒体 URL 只能由扫描结果构造。

- [ ] **Step 4: 更新风格协议**

在 `styles/sticker.md` 顶部加入：

```yaml
---
style_id: sticker
name: 贴纸
thumbnail: sticker.png
---
```

在贡献规则与 profile skill 中明确每个风格必须指定名称和 L 比例代表图，推荐 `420 x 600`。

- [ ] **Step 5: 生成风格代表图**

使用内置 `image_gen` 创建不绑定真实人物身份的贴纸风格代表图，后处理为 `420 x 600`，保存为 `styles/sticker.png`。图像内容仅表达白底、独立贴纸岛、白边、浅灰裁切线和默认 `3 x 5` 布局。

- [ ] **Step 6: 验证扫描器和图片**

Run: `npm test && sips -g pixelWidth -g pixelHeight styles/sticker.png`

Expected: 测试 PASS；图片为 `420 x 600`。

### Task 3: 单客户端租约与页面关闭生命周期

**Files:**
- Create: `web/lib/lease.mjs`
- Create: `web/lib/lifecycle.mjs`
- Create: `web/test/lease.test.mjs`

- [ ] **Step 1: 写时钟可控的失败测试**

```js
test('first client acquires the lease and second client is rejected', () => {});
test('heartbeat extends the lease', () => {});
test('lease expires after 30 seconds without heartbeat', () => {});
test('release ignores the wrong token', () => {});
test('lifecycle requests shutdown after lease expiry', async () => {});
```

测试使用注入的 `now()`，不得等待真实 30 秒。

- [ ] **Step 2: 运行并确认失败**

Run: `node --test web/test/lease.test.mjs`

Expected: FAIL。

- [ ] **Step 3: 实现租约**

`LeaseManager` API：

```js
new LeaseManager({ ttlMs: 30000, now, randomToken })
lease.acquire(clientId)
lease.heartbeat(clientId, token)
lease.release(clientId, token)
lease.snapshot()
lease.expireIfNeeded()
```

返回状态只含 `owned | occupied | free`，不得泄露令牌。

- [ ] **Step 4: 实现关闭协调器**

`ShutdownCoordinator` 在租约超时后依次调用：清空等待队列、终止当前任务、关闭监听器。终止函数先 `SIGTERM`，5 秒后调用进程树强制终止回调。

- [ ] **Step 5: 验证测试通过**

Run: `node --test web/test/lease.test.mjs`

Expected: PASS。

### Task 4: 串行队列与 Codex 任务运行器

**Files:**
- Create: `web/lib/queue.mjs`
- Create: `web/lib/runner.mjs`
- Create: `web/test/queue.test.mjs`
- Create: `web/test/runner.test.mjs`

- [ ] **Step 1: 写队列失败测试**

```js
test('runs one job at a time in insertion order', async () => {});
test('cancels a waiting job without starting it', async () => {});
test('cancels the active child and advances the queue', async () => {});
test('emits queued running succeeded failed and cancelled events', async () => {});
```

- [ ] **Step 2: 写运行器失败测试**

注入假的 `spawn` 并断言：

```js
test('uses codex exec with workspace-write and never passes an API key', async () => {});
test('tries the configured mini model before default fallback', async () => {});
test('requires image_gen and gpt-image-2-or-newer in image prompts', () => {});
test('builds final jobs from profile style format and session prompt only', () => {});
test('builds profile jobs from every image in one input directory', () => {});
```

- [ ] **Step 3: 运行并确认失败**

Run: `node --test web/test/queue.test.mjs web/test/runner.test.mjs`

Expected: FAIL。

- [ ] **Step 4: 实现串行队列**

`SerialJobQueue` API：

```js
queue.enqueue({ id, type, payload })
queue.cancel(id)
queue.cancelWaiting()
queue.terminateActive()
queue.snapshot()
queue.onEvent(listener)
```

状态机只允许 `queued -> running -> succeeded|failed|cancelled`。

- [ ] **Step 5: 实现 Codex 运行器**

运行命令使用参数数组，禁止 shell 拼接：

```js
spawn(codexPath, [
  'exec', '--skip-git-repo-check', '-C', rootDir,
  '-s', 'workspace-write', '-a', 'never', '--json',
  ...(miniModel ? ['-m', miniModel] : []),
  prompt
], { env: sanitizedEnv });
```

`sanitizedEnv` 从环境复制后删除 `OPENAI_API_KEY`。mini 模型因“unknown model”失败时只回退一次默认模型；其他失败不回退。

- [ ] **Step 6: 实现提示构造器**

导出 `buildGeneratePrompt()` 与 `buildProfilePrompt()`。最终生成提示只引用多视图、风格、格式和本次要求；人物设定提示引用输入目录全部图片并声明直接覆盖固定目标。图片提示必须写明使用内置 `image_gen` 且能力不得低于 `gpt-image-2`。

- [ ] **Step 7: 验证测试通过**

Run: `node --test web/test/queue.test.mjs web/test/runner.test.mjs`

Expected: PASS。

### Task 5: HTTP、SSE、媒体白名单与系统动作

**Files:**
- Create: `web/server.mjs`
- Create: `web/test/server.test.mjs`

- [ ] **Step 1: 写 HTTP 集成失败测试**

使用临时根目录和假队列，覆盖：

```js
test('health and catalog return JSON', async () => {});
test('job creation requires the active lease', async () => {});
test('generation validates profile style and format IDs', async () => {});
test('profile jobs validate an input directory ID', async () => {});
test('media only serves scanned profile style and output images', async () => {});
test('open-output cannot accept a caller supplied path', async () => {});
test('SSE streams job state events', async () => {});
test('network mode restarts the listener without losing queue state', async () => {});
```

- [ ] **Step 2: 运行并确认失败**

Run: `node --test web/test/server.test.mjs`

Expected: FAIL。

- [ ] **Step 3: 实现服务器工厂**

`server.mjs` 导出 `createControlServer({ rootDir, spawnImpl, openImpl, now })` 供测试使用，并实现规格中的全部 API。JSON 请求体上限 32 KiB；额外提示最大 4000 字符。

- [ ] **Step 4: 实现监听切换和系统浏览器/文件夹动作**

本机模式绑定 `127.0.0.1`，局域网模式绑定 `0.0.0.0`。只允许服务端执行：

```js
spawn('/usr/bin/open', [url], { stdio: 'ignore' });
spawn('/usr/bin/open', [path.join(rootDir, 'output')], { stdio: 'ignore' });
```

不得使用 Codex 内置浏览器。

- [ ] **Step 5: 验证服务器测试**

Run: `node --test web/test/server.test.mjs`

Expected: PASS。

### Task 6: 控制页面与可访问交互

**Files:**
- Create: `web/control.html`
- Create: `web/control.css`
- Create: `web/control.js`

- [ ] **Step 1: 编写静态结构和语义控件**

页面包含：顶部连接状态、局域网复选框、人物设定按钮、打开输出文件夹按钮、人物选择、风格选择、格式分段控件、额外要求、生成按钮、任务结果区和人物设定对话框。

所有按钮使用明确中文名称、`aria-label` 和稳定 `data-testid`。不得把功能说明作为大段可见文案。

- [ ] **Step 2: 实现固定媒体比例**

```css
.profile-media { aspect-ratio: 3 / 2; }
.style-media { aspect-ratio: 1051 / 1500; }
.profile-media img,
.style-media img { width: 100%; height: 100%; object-fit: contain; }
```

网格列使用 `minmax()` 和断点，不按视口缩放字体。

- [ ] **Step 3: 实现页面状态机**

`control.js` 管理：

```js
const state = {
  lease: 'connecting',
  busy: false,
  catalog: null,
  selection: { profileId: '', styleId: '', formatId: '', prompt: '' },
  job: null,
  resultUrl: ''
};
```

首屏获取租约和 catalog；每 5 秒心跳；SSE 更新任务；`pagehide` 使用 `sendBeacon`；busy 时禁用参数控件但保留取消。

- [ ] **Step 4: 实现人物设定对话框**

下拉菜单列出 `input/` 直接子目录。提交前显示覆盖提示但不要求二次业务审核；确认后创建 profile job。任务成功后刷新 catalog 并直接显示新多视图。

- [ ] **Step 5: 实现错误展示**

错误区显示 `message`、`code`、建议动作和可展开技术日志。令牌、绝对内部命令和环境变量不得显示。

### Task 7: 启动 skill 与用户文档

**Files:**
- Create: `system/skills/control/SKILL.md`
- Modify: `docs/SYSTEM_USAGE.md`
- Modify: `.gitignore`

- [ ] **Step 1: 使用 skill-creator 和 writing-skills 编写启动 skill**

Skill 触发描述覆盖“启动控制台、本地部署、打开控制页面、停止控制台”。流程必须：检查 Node/Codex、启动服务、读取健康地址、执行系统 `open`、报告 PID/URL/停止命令，并保持服务进程受当前执行会话管理。

- [ ] **Step 2: 添加启动与停止命令**

启动：

```bash
node web/server.mjs --root /Users/yohji/photo --port 0 --open
```

强制释放与停止：

```bash
node web/server.mjs --root /Users/yohji/photo --release
node web/server.mjs --root /Users/yohji/photo --stop
```

运行时 PID、端口和令牌只保存在 `.control/`，并加入 `.gitignore`。

- [ ] **Step 3: 更新系统说明**

记录浏览器控制台入口、人物文件存在即有效、风格元数据、无 API Key、单客户端、页面关闭即停止，以及正式页面使用系统默认浏览器。

- [ ] **Step 4: 验证 skill 结构**

Run: `test -f system/skills/control/SKILL.md && rg -n "Use when|默认浏览器|OPENAI_API_KEY|停止" system/skills/control/SKILL.md`

Expected: 所有关键约束存在。

### Task 8: 端到端验证与视觉验收

**Files:**
- Modify: implementation files only when verification exposes a defect

- [ ] **Step 1: 运行完整测试**

Run: `npm test`

Expected: 全部 PASS，无未处理异步资源。

- [ ] **Step 2: 启动服务并检查健康状态**

Run: `node web/server.mjs --root /Users/yohji/photo --port 0`

Expected: 输出一行 JSON，包含 PID、本机 URL 和 tokenized URL；`GET /api/health` 返回 200。

- [ ] **Step 3: 使用浏览器验证桌面和移动端**

使用 Playwright 检查 `1440 x 900`、`1024 x 768`、`390 x 844`：无重叠、文字不溢出、人物 `3:2`、风格 L 比例、结果图完整显示。

- [ ] **Step 4: 验证租约和锁定**

打开第二浏览器上下文，确认第二客户端只显示占用状态。创建假任务，确认生成中参数锁定、取消可用、任务结束后恢复。

- [ ] **Step 5: 验证关闭清理**

关闭唯一控制页面，确认 30 秒后等待队列清空、假 Codex 子进程收到 `SIGTERM`、5 秒宽限后服务端口关闭。

- [ ] **Step 6: 验证真实 Codex 烟雾任务**

执行一个只读取 catalog 的独立 Codex 任务，确认使用本机登录身份且环境中不传递 `OPENAI_API_KEY`。实际图片任务只在该烟雾测试成功后启用。

- [ ] **Step 7: 验证系统默认浏览器启动**

运行 control skill，确认通过 `/usr/bin/open` 打开外部默认浏览器，不创建 Codex 内置浏览器标签页。

- [ ] **Step 8: 最终清理**

停止测试服务，确认不存在遗留 `web/server.mjs` 或测试 Codex 子进程；保留正式输出和 `styles/sticker.png`。

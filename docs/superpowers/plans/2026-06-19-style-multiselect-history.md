# Style Multiselect And History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PhotoClub 按选择顺序批量执行多个风格，为每个风格生成 `n` 张，并以永久本地历史和最近结果代表图驱动风格列表。

**Architecture:** 浏览器提交有序 `styleIds`，服务端把每个风格展开为一个带批次元数据的独立串行任务。`web/lib/stylepreview.mjs` 负责原子维护 `.control/style-history.json` 和 `styles/previews/<styleId>.jpg`；目录接口合并 Markdown 风格定义与本地历史，前端通过纯函数模块维护有序选择、全选反选和未生成筛选。

**Tech Stack:** Node.js ESM、原生 HTTP/SSE、原生浏览器 JavaScript/CSS、`node:test`、macOS `/usr/bin/sips`、Git。

---

## File Map

- Create `web/lib/stylepreview.mjs`: 读取永久历史、缩放最近结果、原子替换代表图和历史。
- Create `system/tools/syncstylepreview.mjs`: 本地命令行入口，调用共享同步模块。
- Create `web/test/stylepreview.test.mjs`: 覆盖最后一张选择、缩放、历史、非法输入和失败原子性。
- Create `web/style-selection.mjs`: 浏览器可用的有序多选、全选反选和筛选纯函数。
- Create `web/test/style-selection.test.mjs`: 无 DOM 测试前端选择语义。
- Create `styles/previews/README.md`: 说明本地生成目录和 Git 隐私规则。
- Modify `.gitignore`: 忽略所有风格图片和 `styles/previews/` 派生图。
- Modify `web/lib/catalog.mjs`: 不再要求预制缩略图，合并历史状态和代表图。
- Modify `web/lib/queue.mjs`: 暴露批次元数据并支持按批次取消。
- Modify `web/server.mjs`: 接收 `styleIds`、创建批次任务、成功后同步代表图、提供安全媒体路由与批次取消。
- Modify `web/control.html`: 增加全选和未生成筛选控件。
- Modify `web/control.js`: 风格多选、批次跟踪、累计结果、批次取消。
- Modify `web/control.css`: 紧凑风格卡片、无图占位和工具栏状态。
- Modify `web/i18n.mjs`: 中日英批次与筛选文案。
- Modify `web/test/catalog.test.mjs`, `web/test/queue.test.mjs`, `web/test/server.test.mjs`, `web/test/i18n.test.mjs`: 对应回归覆盖。

### Task 1: Permanent History And Preview Sync

**Files:**
- Create: `web/lib/stylepreview.mjs`
- Create: `web/test/stylepreview.test.mjs`

- [ ] **Step 1: Write failing tests for history and last-result preview selection**

Add tests using a temporary project and an injected resize function:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readStyleHistory, syncStylePreview } from '../lib/stylepreview.mjs';

test('syncs the last output and permanently records the style', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'style-preview-'));
  await mkdir(path.join(rootDir, 'output'), { recursive: true });
  const first = path.join(rootDir, 'output', 'first.png');
  const last = path.join(rootDir, 'output', 'last.png');
  await writeFile(first, 'first');
  await writeFile(last, 'last');
  const calls = [];

  const record = await syncStylePreview({
    rootDir, styleId: 'sticker', outputPaths: [first, last], jobId: 'job1',
    generatedAt: '2026-06-19T12:00:00.000Z',
    resizeImpl: async (source, target) => { calls.push(source); await copyFile(source, target); },
  });

  assert.deepEqual(calls, [last]);
  assert.equal(await readFile(path.join(rootDir, 'styles/previews/sticker.jpg'), 'utf8'), 'last');
  assert.equal(record.sourcePath, last);
  assert.deepEqual((await readStyleHistory(rootDir)).sticker, record);
});

test('rejects unsafe ids without writing history', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'style-preview-'));
  await assert.rejects(
    syncStylePreview({ rootDir, styleId: '../bad', outputPaths: ['/tmp/a.png'], jobId: 'job1' }),
    /invalid style id/i,
  );
  assert.deepEqual(await readStyleHistory(rootDir), {});
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test web/test/stylepreview.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/lib/stylepreview.mjs`.

- [ ] **Step 3: Implement atomic preview and history storage**

Create exports with these contracts:

```js
export async function readStyleHistory(rootDir) { /* ENOENT => {}; malformed JSON => STYLE_HISTORY_INVALID */ }

export async function resizeWithSips(sourcePath, targetPath) {
  // spawn /usr/bin/sips with: -s format jpeg -Z 480 sourcePath --out targetPath
}

export async function syncStylePreview({
  rootDir, styleId, outputPaths, jobId,
  generatedAt = new Date().toISOString(), resizeImpl = resizeWithSips,
}) {
  // validate a single safe style id and non-empty outputPaths
  // use outputPaths.at(-1), verify it is readable
  // mkdir styles/previews and .control
  // resize into styles/previews/.<styleId>-<uuid>.jpg
  // rename temp preview to styles/previews/<styleId>.jpg
  // atomically write .control/style-history.json via temp JSON + rename
  // return { styleId, generatedAt, jobId, sourcePath, preview: `styles/previews/${styleId}.jpg` }
}
```

Use `AppError` codes `STYLE_HISTORY_INVALID`, `STYLE_PREVIEW_INPUT_INVALID`, and `STYLE_PREVIEW_SYNC_FAILED`. Always remove temporary files in `finally`; never write history before the final preview exists.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test web/test/stylepreview.test.mjs`

Expected: all style preview tests PASS.

- [ ] **Step 5: Commit the shared storage module**

```bash
git add web/lib/stylepreview.mjs web/test/stylepreview.test.mjs
git commit -m "feat: store local style generation history"
```

### Task 2: Local CLI And Git Privacy

**Files:**
- Create: `system/tools/syncstylepreview.mjs`
- Create: `styles/previews/README.md`
- Modify: `.gitignore`
- Modify: `package.json`
- Test: `web/test/stylepreview.test.mjs`
- Remove from Git index: `styles/sticker.png`

- [ ] **Step 1: Write a failing CLI integration test**

Add a test that invokes the CLI with a temporary root and two source files:

```js
test('CLI uses the last supplied output path', async () => {
  const child = spawn(process.execPath, [
    'system/tools/syncstylepreview.mjs', '--root', rootDir, '--style', 'sticker',
    '--job', 'job2', '--output', first, '--output', last,
  ]);
  assert.equal(await exitCode(child), 0);
  assert.equal((await readStyleHistory(rootDir)).sticker.sourcePath, last);
});
```

Use a real tiny JPEG fixture generated once by `/usr/bin/sips` in test setup; skip only when `/usr/bin/sips` is unavailable.

- [ ] **Step 2: Run the CLI test and verify RED**

Run: `node --test web/test/stylepreview.test.mjs`

Expected: FAIL because `system/tools/syncstylepreview.mjs` does not exist.

- [ ] **Step 3: Implement the CLI and privacy rules**

CLI syntax and behavior:

```text
npm run stylepreview -- --style sticker --job <job-id> --output output/a.png --output output/b.png
```

Parse repeated `--output`, default `--root` to the repository root, call `syncStylePreview`, print one JSON result, and exit nonzero with a concise error on failure.

Add:

```json
"stylepreview": "node system/tools/syncstylepreview.mjs"
```

Add Git rules:

```gitignore
styles/*.png
styles/*.jpg
styles/*.jpeg
styles/*.webp
styles/previews/*
!styles/previews/README.md
```

Document that `styles/previews/` is generated locally and never committed. Run `git rm --cached styles/sticker.png` so the existing local file remains but leaves repository tracking.

- [ ] **Step 4: Verify CLI and ignore behavior**

Run: `node --test web/test/stylepreview.test.mjs`

Expected: all tests PASS.

Run: `git check-ignore styles/example.png styles/previews/example.jpg`

Expected: both paths are reported as ignored.

- [ ] **Step 5: Commit the CLI and privacy boundary**

```bash
git add .gitignore package.json system/tools/syncstylepreview.mjs styles/previews/README.md web/test/stylepreview.test.mjs
git add -u styles/sticker.png
git commit -m "feat: add local style preview sync tool"
```

### Task 3: Catalog Without Prebuilt Thumbnails

**Files:**
- Modify: `web/lib/catalog.mjs`
- Modify: `web/test/catalog.test.mjs`

- [ ] **Step 1: Replace thumbnail-dependent tests with history-aware failing tests**

Update the fixture so style Markdown contains only the still-compatible metadata, but no image file. Add `.control/style-history.json` and a preview only for one generated style:

```js
test('lists styles without prebuilt thumbnails and merges permanent history', async () => {
  const root = await fixture();
  await mkdir(path.join(root, '.control'), { recursive: true });
  await mkdir(path.join(root, 'styles/previews'), { recursive: true });
  await writeFile(path.join(root, 'styles/previews/sticker.jpg'), 'jpg');
  await writeFile(path.join(root, '.control/style-history.json'), JSON.stringify({
    sticker: { styleId: 'sticker', generatedAt: '2026-06-19T12:00:00.000Z', jobId: 'j1', sourcePath: '/gone.png', preview: 'styles/previews/sticker.jpg' },
  }));

  const catalog = await loadCatalog(root);
  assert.deepEqual(catalog.styles[0], {
    id: 'sticker', name: '贴纸', generated: true,
    generatedAt: '2026-06-19T12:00:00.000Z',
    previewUrl: '/media/style-previews/sticker.jpg',
  });
});
```

Also assert that a style without history returns `generated: false`, `generatedAt: null`, and `previewUrl: null`; malformed history adds `STYLE_HISTORY_INVALID` to `issues` while keeping all styles available.

- [ ] **Step 2: Run catalog tests and verify RED**

Run: `node --test web/test/catalog.test.mjs`

Expected: FAIL because the catalog still rejects missing thumbnail files and lacks history fields.

- [ ] **Step 3: Implement history-aware catalog loading**

Change `parseStyleFrontmatter` to require only `style_id` and `name`; parse but do not validate or depend on legacy `thumbnail`. In `loadCatalog`, call `readStyleHistory(rootDir)` once, catch its structured error into `issues`, and map every valid Markdown file to:

```js
{
  id: style.id,
  name: style.name,
  generated: Boolean(history[style.id]),
  generatedAt: history[style.id]?.generatedAt ?? null,
  previewUrl: previewExists ? `/media/style-previews/${encodeURIComponent(style.id)}.jpg` : null,
}
```

If history exists but the preview file was manually removed, keep `generated: true`, set `previewUrl: null`, and append `STYLE_PREVIEW_MISSING` to `issues`.

- [ ] **Step 4: Run catalog tests and verify GREEN**

Run: `node --test web/test/catalog.test.mjs`

Expected: all catalog tests PASS.

- [ ] **Step 5: Commit catalog changes**

```bash
git add web/lib/catalog.mjs web/test/catalog.test.mjs
git commit -m "feat: derive style previews from local history"
```

### Task 4: Queue Batch Metadata And Cancellation

**Files:**
- Modify: `web/lib/queue.mjs`
- Modify: `web/test/queue.test.mjs`

- [ ] **Step 1: Write failing queue batch tests**

```js
test('exposes batch metadata and cancels only one batch', async () => {
  const queue = new SerialJobQueue({ runJob: async () => new Promise(() => {}) });
  const first = queue.enqueue({ id: 'a1', type: 'generate', batchId: 'batch-a', styleId: 'one', batchIndex: 0, batchSize: 2, payload: {} });
  queue.enqueue({ id: 'a2', type: 'generate', batchId: 'batch-a', styleId: 'two', batchIndex: 1, batchSize: 2, payload: {} });
  queue.enqueue({ id: 'b1', type: 'generate', batchId: 'batch-b', styleId: 'three', batchIndex: 0, batchSize: 1, payload: {} });

  assert.equal(first.batchId, 'batch-a');
  assert.equal(queue.cancelBatch('batch-a'), 2);
  assert.equal(queue.snapshot().jobs.find((job) => job.id === 'b1').status, 'queued');
});
```

- [ ] **Step 2: Run queue tests and verify RED**

Run: `node --test web/test/queue.test.mjs`

Expected: FAIL because public jobs lack batch metadata and `cancelBatch` is undefined.

- [ ] **Step 3: Implement batch fields and cancellation**

Persist and expose `batchId`, `styleId`, `batchIndex`, and `batchSize` as top-level job fields. Add:

```js
cancelBatch(batchId) {
  let count = 0;
  for (const job of this.jobs) {
    if (job.batchId === batchId && this.cancel(job.id)) count += 1;
  }
  return count;
}
```

Do not expose `payload`, controller, or abort internals.

- [ ] **Step 4: Run queue tests and verify GREEN**

Run: `node --test web/test/queue.test.mjs`

Expected: all queue tests PASS.

- [ ] **Step 5: Commit queue support**

```bash
git add web/lib/queue.mjs web/test/queue.test.mjs
git commit -m "feat: track generation batches in job queue"
```

### Task 5: Multi-Style Server Batch And Automatic Preview Sync

**Files:**
- Modify: `web/server.mjs`
- Modify: `web/test/server.test.mjs`

- [ ] **Step 1: Write failing server tests for ordered batches**

Create two style Markdown fixtures and submit ordered `styleIds` with a duplicate:

```js
const response = await fetch(`${base}/api/jobs/generate`, {
  method: 'POST', headers: auth(owner),
  body: JSON.stringify({
    profileIds: ['mama'], styleIds: ['second', 'sticker', 'second'],
    formatId: 'jp_l', orientation: 'portrait', extraPrompt: '', quantity: 2,
  }),
});
const batch = await response.json();
assert.equal(response.status, 202);
assert.deepEqual(batch.jobs.map((job) => job.styleId), ['second', 'sticker']);
assert.equal(batch.jobs[0].batchId, batch.batchId);
assert.equal(batch.jobs[0].batchSize, 2);
```

Inject `syncStylePreviewImpl` and assert it is called once per successful style with `outputPaths.at(-1)` represented by the array passed to it. Add tests for empty `styleIds`, unknown IDs, safe media access at `/media/style-previews/sticker.jpg`, and `DELETE /api/batches/:batchId` cancelling only that batch.

- [ ] **Step 2: Run server tests and verify RED**

Run: `node --test web/test/server.test.mjs`

Expected: FAIL because the API accepts only `styleId` and has no batch endpoint or preview route.

- [ ] **Step 3: Implement ordered batch creation**

Add `syncStylePreviewImpl = syncStylePreview` to `createControlServer` dependencies. Validate `body.styleIds` as a non-empty array, call `assertSafeId` for each, then deduplicate with first occurrence preserved:

```js
const styleIds = [...new Set(body.styleIds.map((id) => assertSafeId(id, '风格')))];
```

Validate every style before enqueueing anything. Generate one `batchId`, then enqueue one job per style in array order. Each job gets its own UUID, prompt, `quantity` output paths, and top-level batch metadata. Return:

```js
sendJson(response, 202, { batchId, jobs });
```

- [ ] **Step 4: Trigger preview sync after each successful style task**

After all generated output paths are verified, call:

```js
const preview = job.styleId
  ? await syncStylePreviewImpl({
      rootDir, styleId: job.styleId, outputPaths,
      jobId: job.id, generatedAt: new Date().toISOString(),
    })
  : null;
return { ...result, styleId: job.styleId, outputUrl: outputUrls[0], outputUrls, preview };
```

Because `SerialJobQueue` catches each failure independently, a sync or generation failure marks only that style failed and the queue proceeds to the next style.

- [ ] **Step 5: Add safe preview media and batch cancellation routes**

Resolve `/media/style-previews/<styleId>.jpg` only when the catalog contains that exact style and its `previewUrl` matches. Add authenticated `DELETE /api/batches/<batchId>` returning `{ cancelled: count }`, with 404 when no active or queued job matched.

- [ ] **Step 6: Run server tests and verify GREEN**

Run: `node --test web/test/server.test.mjs`

Expected: all server tests PASS.

- [ ] **Step 7: Commit server batch behavior**

```bash
git add web/server.mjs web/test/server.test.mjs
git commit -m "feat: queue ordered multi-style generation batches"
```

### Task 6: Testable Frontend Selection Semantics

**Files:**
- Create: `web/style-selection.mjs`
- Create: `web/test/style-selection.test.mjs`
- Modify: `web/server.mjs`

- [ ] **Step 1: Write failing pure-function tests**

```js
import { setStyleChecked, toggleAllVisible, visibleStyles } from '../style-selection.mjs';

test('keeps first-selection order and reselected styles move to the end', () => {
  let selected = setStyleChecked([], 'b', true);
  selected = setStyleChecked(selected, 'a', true);
  selected = setStyleChecked(selected, 'b', false);
  selected = setStyleChecked(selected, 'b', true);
  assert.deepEqual(selected, ['a', 'b']);
});

test('select all toggles only visible styles', () => {
  assert.deepEqual(toggleAllVisible(['hidden'], ['a', 'b']), ['hidden', 'a', 'b']);
  assert.deepEqual(toggleAllVisible(['hidden', 'a', 'b'], ['a', 'b']), ['hidden']);
});

test('filters permanently generated styles', () => {
  assert.deepEqual(visibleStyles([{ id: 'a', generated: true }, { id: 'b', generated: false }], true).map((style) => style.id), ['b']);
});
```

- [ ] **Step 2: Run selection tests and verify RED**

Run: `node --test web/test/style-selection.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the three pure functions**

Each function returns a new array, preserves existing hidden selections, deduplicates IDs, and never mutates arguments. Export the same module to the browser by adding explicit server routing for `/style-selection.mjs` with JavaScript content type.

- [ ] **Step 4: Run focused and route tests**

Run: `node --test web/test/style-selection.test.mjs web/test/server.test.mjs`

Expected: all tests PASS, including a route assertion that `/style-selection.mjs` returns JavaScript.

- [ ] **Step 5: Commit frontend state helpers**

```bash
git add web/style-selection.mjs web/test/style-selection.test.mjs web/server.mjs web/test/server.test.mjs
git commit -m "feat: add ordered style selection helpers"
```

### Task 7: Console UI For Multi-Style Batches

**Files:**
- Modify: `web/control.html`
- Modify: `web/control.js`
- Modify: `web/control.css`
- Modify: `web/i18n.mjs`
- Modify: `web/test/i18n.test.mjs`

- [ ] **Step 1: Write failing i18n assertions**

For `zh`, `ja`, and `en`, assert non-fallback translations exist for:

```js
[
  'button.selectAllStyles', 'button.clearVisibleStyles', 'button.onlyUngenerated',
  'style.neverGenerated', 'summary.styleCount', 'loading.batchProgress',
  'task.batchComplete', 'task.batchPartialFailure', 'error.STYLES_INVALID',
]
```

- [ ] **Step 2: Run i18n tests and verify RED**

Run: `node --test web/test/i18n.test.mjs`

Expected: FAIL because the new keys are absent.

- [ ] **Step 3: Add controls and translated copy**

In the style section heading add two compact buttons:

```html
<button id="style-select-all" type="button" class="compact-button" data-i18n="button.selectAllStyles">全选</button>
<button id="style-only-new" type="button" class="compact-button" aria-pressed="false" data-i18n="button.onlyUngenerated">只显示未生成过</button>
```

Update help text to state that quantity applies once per selected style and execution follows selection order. Add complete Chinese, Japanese, and English strings and remove obsolete thumbnail-missing user guidance.

- [ ] **Step 4: Convert style rendering and submission to ordered multi-select**

Import the pure helpers. Change state to:

```js
selection: { profileIds: [], styleIds: [], formatId: '', orientation: 'portrait', prompt: '', quantity: 1 },
onlyUngenerated: false,
batch: null,
```

Render style inputs as checkboxes. Cards with `previewUrl` show the latest local image; cards without one render a fixed-aspect placeholder with `style.neverGenerated`. `style-select-all` calls `toggleAllVisible`, and `style-only-new` toggles filtering without deleting hidden selections.

Submit `{ ...selection, styleIds, quantity }`. Store returned state as:

```js
state.batch = {
  id: response.batchId,
  jobIds: response.jobs.map((job) => job.id),
  terminalIds: [],
  resultUrls: [],
  failedStyleIds: [],
};
```

- [ ] **Step 5: Track the whole batch and accumulate results**

For an SSE job matching `state.batch.id`, ignore duplicate terminal events, append successful `outputUrls`, append failed `styleId` to the failure list, and keep `state.busy` true until every batch job is terminal. Show `batchIndex + 1 / batchSize` in the overlay. Refresh the catalog after each successful style so its card immediately adopts the new representative image.

Keep profile jobs on the existing single-job path. Change cancellation to call `DELETE /api/batches/<batchId>` for a generation batch and `DELETE /api/jobs/<id>` for a profile task.

- [ ] **Step 6: Apply compact stable styling**

Keep the three-column console layout. Use a fixed `aspect-ratio: 1051 / 1500` for style media, `object-fit: cover` for generated previews, a neutral no-image placeholder, and compact name/footer rows. Style `aria-pressed="true"` distinctly without changing button dimensions. Ensure long names wrap without resizing the grid tracks.

- [ ] **Step 7: Run i18n and full automated tests**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 8: Commit UI behavior**

```bash
git add web/control.html web/control.js web/control.css web/i18n.mjs web/test/i18n.test.mjs
git commit -m "feat: add multi-style batch controls"
```

### Task 8: End-To-End Verification And Publication

**Files:**
- Verify all modified files
- Update only if verification finds a defect

- [ ] **Step 1: Run fresh automated verification**

Run:

```bash
npm test
npm run stylebatch -- audit
git diff --check
```

Expected: all tests pass; style audit has zero errors; missing legacy thumbnails may remain expected warnings until the audit is updated to stop treating thumbnails as required; diff check prints nothing.

- [ ] **Step 2: Update style batch audit for the new no-thumbnail rule if needed**

If `stylebatch -- audit` still emits thumbnail warnings, first add a failing assertion in `web/test/stylebatch.test.mjs` that a sourced style without a thumbnail image produces no warning. Then remove only the thumbnail existence warning from `system/lib/stylebatch.mjs`; retain metadata, source URL, duplicate prompt, and required section validation. Re-run:

```bash
node --test web/test/stylebatch.test.mjs
npm run stylebatch -- audit
```

Expected: focused tests pass and audit reports `errors: []`, `warnings: []`.

- [ ] **Step 3: Start PhotoClub and verify browser workflows**

Run: `npm start`

Verify in the browser at the printed local URL:

1. select multiple styles in a non-alphabetical order;
2. toggle all visible styles on and off;
3. enable “only ungenerated” without losing hidden selections;
4. submit quantity `2` and confirm task progress advances in selection order;
5. confirm results accumulate and each completed style card uses its second result;
6. cancel a test batch and confirm its current and waiting jobs stop;
7. reload and confirm generated filtering persists through `.control/style-history.json`;
8. move an original output image away and confirm the style remains generated with its copied preview.

- [ ] **Step 4: Verify privacy and repository state**

Run:

```bash
git status --short --ignored
git ls-files 'styles/*.png' 'styles/*.jpg' 'styles/previews/*'
git check-ignore styles/example.png styles/previews/example.jpg .control/style-history.json
```

Expected: generated images and history are ignored; `git ls-files` returns only `styles/previews/README.md` from the preview directory and no style image.

- [ ] **Step 5: Commit any verification-only corrections**

```bash
git add system/lib/stylebatch.mjs web/test/stylebatch.test.mjs
git commit -m "test: align style audit with local previews"
```

Skip this commit when Step 2 required no code change.

- [ ] **Step 6: Push the completed feature**

Run: `git push origin main`

Expected: local `main` and `origin/main` resolve to the same final commit.

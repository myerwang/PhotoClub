# Print Formats And Custom Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Japanese and international print presets plus a validated one-time custom pixel size to PhotoClub.

**Architecture:** Presets remain authoritative Markdown entries parsed by the existing catalog. A focused server module validates custom short/long edges and resolves preset/custom requests into one oriented internal format; the browser controls selection and immediate feedback without persisting custom values.

**Tech Stack:** Node.js ESM, native HTTP, browser JavaScript/CSS, Markdown registry, `node:test`.

---

## File Map

- Modify `system/rules/output_formats.md`, `system/rules/output_ratio.md`, `system/skills/profile/SKILL.md` for the expanded registry.
- Create `web/lib/outputformat.mjs` and `web/test/outputformat.test.mjs` for custom validation and orientation.
- Modify `web/server.mjs` and `web/test/server.test.mjs` for API integration.
- Modify `web/control.html`, `web/control.js`, `web/control.css`, `web/i18n.mjs`, and `web/test/i18n.test.mjs` for UI and translations.
- Modify `web/test/catalog.test.mjs` for exact preset coverage.

### Task 1: Register Common Print Presets

**Files:**
- Modify: `system/rules/output_formats.md`
- Modify: `system/rules/output_ratio.md`
- Modify: `system/skills/profile/SKILL.md`
- Modify: `web/test/catalog.test.mjs`

- [ ] **Step 1: Write the failing registry test**

Assert `parseOutputFormats()` returns these exact additional entries while preserving existing L and 2L IDs:

```js
[
  { id: 'jp_photo_dsc_1051x1406', label: 'DSC', width: 1051, height: 1406 },
  { id: 'jp_photo_kg_1205x1795', label: 'KG', width: 1205, height: 1795 },
  { id: 'jp_photo_mutsugiri_2398x3000', label: '六切', width: 2398, height: 3000 },
  { id: 'iso_a4_2480x3508', label: 'A4', width: 2480, height: 3508 },
  { id: 'intl_photo_4x6_1200x1800', label: '4 x 6 inch', width: 1200, height: 1800 },
  { id: 'intl_photo_5x7_1500x2100', label: '5 x 7 inch', width: 1500, height: 2100 },
  { id: 'intl_photo_8x10_2400x3000', label: '8 x 10 inch', width: 2400, height: 3000 },
]
```

- [ ] **Step 2: Run RED**

Run: `node --test web/test/catalog.test.mjs`

Expected: FAIL because the production registry lacks the seven entries.

- [ ] **Step 3: Add registry sections and update compatibility docs**

Each format section must include active status, label, physical size, exact pixel size, selectable orientation, 300 DPI basis, source rationale, and exact-size/native-composition rules. Use the IDs and dimensions above exactly. Keep `jp_711_photo_l_1051x1500` and `jp_711_photo_2l_1500x2102` unchanged. Replace stale two-format lists in compatibility/skill files with the complete authoritative list or a direct registry reference.

- [ ] **Step 4: Run GREEN**

Run: `node --test web/test/catalog.test.mjs`

Expected: all catalog tests PASS.

- [ ] **Step 5: Commit**

```bash
git add system/rules/output_formats.md system/rules/output_ratio.md system/skills/profile/SKILL.md web/test/catalog.test.mjs
git commit -m "feat: add common photo print formats"
```

### Task 2: Validate And Resolve Custom Pixel Sizes

**Files:**
- Create: `web/lib/outputformat.mjs`
- Create: `web/test/outputformat.test.mjs`

- [ ] **Step 1: Write failing pure-function tests**

```js
test('resolves portrait and landscape custom dimensions', () => {
  assert.deepEqual(resolveCustomFormat({ shortEdge: 1200, longEdge: 1800 }, 'portrait'), {
    id: 'custom_1200x1800', label: 'Custom 1200 x 1800', width: 1200, height: 1800,
  });
  assert.equal(resolveCustomFormat({ shortEdge: 1200, longEdge: 1800 }, 'landscape').width, 1800);
});

test('rejects invalid custom dimensions', () => {
  for (const value of [undefined, { shortEdge: 255, longEdge: 1800 },
    { shortEdge: 1200.5, longEdge: 1800 }, { shortEdge: 2000, longEdge: 1800 },
    { shortEdge: 5000, longEdge: 8192 }]) {
    assert.throws(() => resolveCustomFormat(value, 'portrait'));
  }
});
```

- [ ] **Step 2: Run RED**

Run: `node --test web/test/outputformat.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the resolver**

```js
export const CUSTOM_FORMAT_ID = 'custom';

export function orientFormat(format, orientation) {
  const shortEdge = Math.min(format.width, format.height);
  const longEdge = Math.max(format.width, format.height);
  return { ...format,
    width: orientation === 'landscape' ? longEdge : shortEdge,
    height: orientation === 'landscape' ? shortEdge : longEdge };
}

export function resolveCustomFormat(customFormat, orientation) {
  if (!customFormat || customFormat.shortEdge === undefined || customFormat.longEdge === undefined) {
    throw new AppError('CUSTOM_FORMAT_REQUIRED', '自定义尺寸必须填写短边和长边', 400);
  }
  const { shortEdge, longEdge } = customFormat;
  if (!Number.isInteger(shortEdge) || !Number.isInteger(longEdge)
      || shortEdge < 256 || longEdge > 8192 || shortEdge > longEdge
      || shortEdge * longEdge > 40_000_000) {
    throw new AppError('CUSTOM_FORMAT_INVALID', '自定义尺寸无效', 400);
  }
  return orientFormat({ id: `custom_${shortEdge}x${longEdge}`,
    label: `Custom ${shortEdge} x ${longEdge}`, width: shortEdge, height: longEdge }, orientation);
}
```

- [ ] **Step 4: Run GREEN**

Run: `node --test web/test/outputformat.test.mjs`

Expected: all tests PASS, including min/max, area boundary, integer, order, and non-mutation cases.

- [ ] **Step 5: Commit**

```bash
git add web/lib/outputformat.mjs web/test/outputformat.test.mjs
git commit -m "feat: validate custom print dimensions"
```

### Task 3: Integrate The Generation API

**Files:**
- Modify: `web/server.mjs`
- Modify: `web/test/server.test.mjs`

- [ ] **Step 1: Write failing API tests**

Submit:

```js
{
  profileIds: ['mama'], styleId: 'sticker', formatId: 'custom',
  customFormat: { shortEdge: 1200, longEdge: 1800 },
  orientation: 'landscape', extraPrompt: '', quantity: 1,
}
```

Assert the prompt contains `custom_1200x1800`, `1800 x 1200`, and `横向`. Add cases for missing custom data (`CUSTOM_FORMAT_REQUIRED`), invalid range/order/area (`CUSTOM_FORMAT_INVALID`), unknown preset (`SELECTION_INVALID`), and a valid preset ignoring malformed extra custom data.

- [ ] **Step 2: Run RED**

Run: `node --test web/test/server.test.mjs`

Expected: custom request returns `SELECTION_INVALID`.

- [ ] **Step 3: Resolve preset or custom format**

```js
const selectedFormat = catalog.formats.find((item) => item.id === body.formatId);
if (profiles.some((profile) => !profile) || !style
    || (body.formatId !== CUSTOM_FORMAT_ID && !selectedFormat)) {
  throw new AppError('SELECTION_INVALID', '人物、风格或输出格式不可用', 422);
}
const orientedFormat = body.formatId === CUSTOM_FORMAT_ID
  ? resolveCustomFormat(body.customFormat, orientation)
  : orientFormat(selectedFormat, orientation);
```

Do not persist `customFormat`. Keep existing profile, style, quantity, prompt, and orientation validation.

- [ ] **Step 4: Run GREEN**

Run: `node --test web/test/server.test.mjs web/test/runner.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/server.mjs web/test/server.test.mjs
git commit -m "feat: accept custom generation dimensions"
```

### Task 4: Add Custom Controls And Translations

**Files:**
- Modify: `web/control.html`
- Modify: `web/control.js`
- Modify: `web/control.css`
- Modify: `web/i18n.mjs`
- Modify: `web/test/i18n.test.mjs`

- [ ] **Step 1: Write failing i18n tests**

For `zh`, `ja`, and `en`, assert non-fallback translations for:

```js
['format.custom', 'field.shortEdge', 'field.longEdge', 'field.pixels',
 'hint.customFormat', 'error.CUSTOM_FORMAT_REQUIRED', 'error.CUSTOM_FORMAT_INVALID']
```

- [ ] **Step 2: Run RED**

Run: `node --test web/test/i18n.test.mjs`

Expected: FAIL because the keys are absent.

- [ ] **Step 3: Add the custom option and inputs**

Add a virtual `custom` format after catalog formats. Show this block only when selected:

```html
<div id="custom-format" class="custom-format" hidden>
  <label><span data-i18n="field.shortEdge">短边</span><input id="custom-short-edge" type="number" min="256" max="8192" step="1" value="1200"></label>
  <span aria-hidden="true">×</span>
  <label><span data-i18n="field.longEdge">长边</span><input id="custom-long-edge" type="number" min="256" max="8192" step="1" value="1800"></label>
  <span data-i18n="field.pixels">像素</span>
  <p data-i18n="hint.customFormat">每边 256–8192，总像素不超过 4000 万</p>
</div>
```

Validate integer/range/order/area before submission. Send `customFormat` only when `formatId === 'custom'`. Keep entered values during page-session format switching.

- [ ] **Step 4: Add translations and stable CSS**

Provide complete Chinese, Japanese, and English labels/errors. Use fixed-width compact numeric inputs that wrap below format segments on small screens without changing the three-column layout.

- [ ] **Step 5: Verify GREEN and browser behavior**

Run: `npm test`

Expected: all tests PASS.

Run: `npm start`, then verify preset/custom switching, validation, orientation swapping, and all three languages in the browser.

- [ ] **Step 6: Commit**

```bash
git add web/control.html web/control.js web/control.css web/i18n.mjs web/test/i18n.test.mjs
git commit -m "feat: add custom print size controls"
```

### Task 5: Final Verification And Publication

- [ ] **Step 1: Run fresh verification**

Run: `npm test`

Run: `npm run stylebatch -- audit`

Run: `git diff --check`

Expected: zero test failures, zero audit errors, and no whitespace errors.

- [ ] **Step 2: Inspect final registry and Git state**

Run: `git status --short`

Run: `node -e "import('./web/lib/catalog.mjs').then(async ({loadCatalog}) => console.log((await loadCatalog(process.cwd())).formats))"`

Expected: nine exact presets and no unintended files.

- [ ] **Step 3: Push**

Run: `git push origin main`

Expected: local `main` and `origin/main` point to the same final commit.

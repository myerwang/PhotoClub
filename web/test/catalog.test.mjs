import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  assertSafeId,
  loadCatalog,
  parseOutputFormats,
  parseStyleFrontmatter,
} from '../lib/catalog.mjs';
import { styleFingerprint } from '../lib/styleplugin.mjs';

const FIXTURE_STYLE = `---\nstyle_id: sticker\nname: 贴纸\n---\n# Sticker\n\n## Subject Boundary\n\n- Apply \`system/rules/style_base.md\`.\n`;

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'photo-catalog-'));
  await mkdir(path.join(root, 'profiles', 'mama'), { recursive: true });
  await mkdir(path.join(root, 'profiles', 'empty'), { recursive: true });
  await mkdir(path.join(root, 'input', 'mama'), { recursive: true });
  await mkdir(path.join(root, 'input', 'baby'), { recursive: true });
  await mkdir(path.join(root, 'styles'), { recursive: true });
  await mkdir(path.join(root, 'system', 'rules'), { recursive: true });
  await writeFile(path.join(root, 'profiles', 'mama', 'multiview_reference.png'), 'png');
  await writeFile(path.join(root, 'styles', 'sticker.md'), FIXTURE_STYLE);
  await writeFile(path.join(root, 'system', 'rules', 'output_formats.md'), `
### \`jp_711_photo_l_1051x1500\`
- Status: active
- Label: 7-Eleven L
- Pixel size: \`1051 x 1500\`

### \`disabled_1x1\`
- Status: disabled
- Label: Disabled
- Pixel size: \`1 x 1\`
`);
  return root;
}

test('lists only profiles with readable multiview files', async () => {
  const catalog = await loadCatalog(await fixture());
  assert.deepEqual(catalog.profiles, [{
    id: 'mama',
    imageUrl: '/media/profiles/mama/multiview_reference.png',
  }]);
});

test('lists direct input directories for profile generation', async () => {
  const catalog = await loadCatalog(await fixture());
  assert.deepEqual(catalog.inputs, [{ id: 'baby' }, { id: 'mama' }]);
});

test('ignores legacy thumbnail metadata and returns only the style identity', () => {
  const style = parseStyleFrontmatter(`---\nstyle_id: sticker\nname: 贴纸\nthumbnail: sticker.png\n---\n`, 'sticker.md');
  assert.deepEqual(style, { id: 'sticker', name: '贴纸' });
});

test('production styles do not declare legacy pre-generated thumbnails', async () => {
  const stylesDir = path.resolve('styles');
  const styleFiles = (await readdir(stylesDir)).filter((fileName) => fileName.endsWith('.md'));
  assert.ok(styleFiles.length > 0);
  for (const fileName of styleFiles) {
    const markdown = await readFile(path.join(stylesDir, fileName), 'utf8');
    assert.doesNotMatch(markdown, /^thumbnail:/m, fileName);
  }
});

test('production style source prompts contain no fixed subject or face-obscuring cues', async () => {
  const stylesDir = path.resolve('styles');
  const styleFiles = (await readdir(stylesDir)).filter((fileName) => fileName.endsWith('.md'));
  const forbidden = /\b(?:censor(?:ed)?|obscur(?:e|ed|ing)|blur(?:red)?|mosaic|redacted|face block|block over (?:the )?face|eyes?|nose|mouth|lips?|jawline|cheeks?|face shape|facial features?|skin tone|young|older|elderly|teenage?|middle-aged|East Asian|Asian|Japanese|Korean|Chinese|South Asian|Russian|woman|man|girl|boy|female|male|actor|actress|model|idol|alien)\b/iu;
  for (const fileName of styleFiles) {
    const markdown = await readFile(path.join(stylesDir, fileName), 'utf8');
    const sourcePrompt = /## Source Prompt\n\n([\s\S]*?)(?=\n\n## |$)/u.exec(markdown)?.[1] ?? '';
    assert.doesNotMatch(sourcePrompt, forbidden, fileName);
  }
});

test('parses style frontmatter without thumbnail', () => {
  const style = parseStyleFrontmatter(`---\nstyle_id: sticker\nname: 贴纸\n---\n`, 'sticker.md');
  assert.deepEqual(style, { id: 'sticker', name: '贴纸' });
});

test('loadCatalog returns styles without prebuilt thumbnails', async () => {
  const catalog = await loadCatalog(await fixture());
  assert.deepEqual(catalog.styles, [{
    id: 'sticker',
    name: '贴纸',
    fingerprint: styleFingerprint(FIXTURE_STYLE),
    generated: false,
    generatedAt: null,
    previewUrl: null,
  }]);
  assert.deepEqual(catalog.issues, []);
});

test('loadCatalog marks history-backed styles as generated and uses readable previews', async () => {
  const root = await fixture();
  await mkdir(path.join(root, '.control'), { recursive: true });
  await mkdir(path.join(root, 'styles', 'previews'), { recursive: true });
  await writeFile(path.join(root, '.control', 'style-history.json'), JSON.stringify({
    'sticker': {
      styleId: 'sticker',
      generatedAt: '2026-06-19T12:00:00.000Z',
      jobId: 'job-1',
      sourcePath: '/gone/old-output.png',
      preview: 'styles/previews/sticker.jpg',
    },
  }));
  await writeFile(path.join(root, 'styles', 'previews', 'sticker.jpg'), 'preview');
  const catalog = await loadCatalog(root);
  assert.deepEqual(catalog.styles, [{
    id: 'sticker',
    name: '贴纸',
    fingerprint: styleFingerprint(FIXTURE_STYLE),
    generated: true,
    generatedAt: '2026-06-19T12:00:00.000Z',
    previewUrl: '/media/style-previews/sticker.jpg',
  }]);
  assert.deepEqual(catalog.issues, []);
});

test('loadCatalog ignores history and preview from another style incarnation', async () => {
  const root = await fixture();
  await mkdir(path.join(root, '.control'), { recursive: true });
  await mkdir(path.join(root, 'styles', 'previews'), { recursive: true });
  await writeFile(path.join(root, '.control', 'style-history.json'), JSON.stringify({
    sticker: {
      styleId: 'sticker', styleFingerprint: '0'.repeat(64),
      generatedAt: '2026-06-19T12:00:00.000Z', jobId: 'job-1',
      sourcePath: '/gone.png', preview: 'styles/previews/sticker.jpg',
    },
  }));
  await writeFile(path.join(root, 'styles', 'previews', 'sticker.jpg'), 'stale');
  const catalog = await loadCatalog(root);
  assert.equal(catalog.styles[0].generated, false);
  assert.equal(catalog.styles[0].previewUrl, null);
});

test('loadCatalog keeps history-backed styles when the preview is missing', async () => {
  const root = await fixture();
  await mkdir(path.join(root, '.control'), { recursive: true });
  await writeFile(path.join(root, '.control', 'style-history.json'), JSON.stringify({
    'sticker': {
      styleId: 'sticker',
      generatedAt: '2026-06-19T12:00:00.000Z',
      jobId: 'job-1',
      sourcePath: '/gone/old-output.png',
      preview: 'styles/previews/sticker.jpg',
    },
  }));
  const catalog = await loadCatalog(root);
  assert.deepEqual(catalog.styles, [{
    id: 'sticker',
    name: '贴纸',
    fingerprint: styleFingerprint(FIXTURE_STYLE),
    generated: true,
    generatedAt: '2026-06-19T12:00:00.000Z',
    previewUrl: null,
  }]);
  assert.equal(catalog.issues.length, 1);
  assert.equal(catalog.issues[0].code, 'STYLE_PREVIEW_MISSING');
  assert.equal(catalog.issues[0].details.styleId, 'sticker');
});

test('loadCatalog reports invalid style history without hiding styles', async () => {
  const root = await fixture();
  await mkdir(path.join(root, '.control'), { recursive: true });
  await writeFile(path.join(root, '.control', 'style-history.json'), '{ not json');
  const catalog = await loadCatalog(root);
  assert.deepEqual(catalog.styles, [{
    id: 'sticker',
    name: '贴纸',
    fingerprint: styleFingerprint(FIXTURE_STYLE),
    generated: false,
    generatedAt: null,
    previewUrl: null,
  }]);
  assert.equal(catalog.issues.length, 1);
  assert.equal(catalog.issues[0].code, 'STYLE_HISTORY_INVALID');
});

test('loadCatalog rejects malformed history records and treats all styles as ungenerated', async () => {
  const root = await fixture();
  await mkdir(path.join(root, '.control'), { recursive: true });
  await writeFile(path.join(root, '.control', 'style-history.json'), JSON.stringify({
    'sticker': null,
    '坏风格': {
      styleId: '不一致',
      generatedAt: '2026-06-19T12:00:00.000Z',
      jobId: 'job-1',
      sourcePath: '/gone/old-output.png',
      preview: 'styles/previews/坏风格.jpg',
    },
  }));

  const catalog = await loadCatalog(root);
  assert.deepEqual(catalog.styles, [{
    id: 'sticker',
    name: '贴纸',
    fingerprint: styleFingerprint(FIXTURE_STYLE),
    generated: false,
    generatedAt: null,
    previewUrl: null,
  }]);
  assert.deepEqual(catalog.issues, [{
    code: 'STYLE_HISTORY_INVALID',
    message: '风格历史无效',
    details: {
      filePath: path.join(root, '.control', 'style-history.json'),
    },
  }]);
});

test('loadCatalog treats a same-named jpg directory as missing preview', async () => {
  const root = await fixture();
  await mkdir(path.join(root, '.control'), { recursive: true });
  await writeFile(path.join(root, '.control', 'style-history.json'), JSON.stringify({
    'sticker': {
      styleId: 'sticker',
      generatedAt: '2026-06-19T12:00:00.000Z',
      jobId: 'job-1',
      sourcePath: '/gone/old-output.png',
      preview: 'styles/previews/sticker.jpg',
    },
  }));
  await mkdir(path.join(root, 'styles', 'previews', 'sticker.jpg'), { recursive: true });

  const catalog = await loadCatalog(root);
  assert.deepEqual(catalog.styles, [{
    id: 'sticker',
    name: '贴纸',
    fingerprint: styleFingerprint(FIXTURE_STYLE),
    generated: true,
    generatedAt: '2026-06-19T12:00:00.000Z',
    previewUrl: null,
  }]);
  assert.equal(catalog.issues.length, 1);
  assert.equal(catalog.issues[0].code, 'STYLE_PREVIEW_MISSING');
});

test('parses registered output formats and exact dimensions', () => {
  const formats = parseOutputFormats(`
### \`jp_711_photo_l_1051x1500\`
- Status: active
- Label: 7-Eleven L
- Pixel size: \`1051 x 1500\`
### \`jp_711_photo_2l_1500x2102\`
- Status: active
- Label: 7-Eleven 2L
- Pixel size: \`1500 x 2102\`
`);
  assert.deepEqual(formats, [
    { id: 'jp_711_photo_l_1051x1500', label: '7-Eleven L', width: 1051, height: 1500 },
    { id: 'jp_711_photo_2l_1500x2102', label: '7-Eleven 2L', width: 1500, height: 2102 },
  ]);
});

test('parses the production output format registry with all nine active formats', async () => {
  const markdown = await readFile(new URL('../../system/rules/output_formats.md', import.meta.url), 'utf8');
  const formats = parseOutputFormats(markdown);
  assert.deepEqual(formats, [
    { id: 'jp_711_photo_l_1051x1500', label: '7-Eleven photo print L size', width: 1051, height: 1500 },
    { id: 'jp_711_photo_2l_1500x2102', label: '7-Eleven photo print 2L size', width: 1500, height: 2102 },
    { id: 'jp_photo_dsc_1051x1406', label: 'DSC', width: 1051, height: 1406 },
    { id: 'jp_photo_kg_1205x1795', label: 'KG', width: 1205, height: 1795 },
    { id: 'jp_photo_mutsugiri_2398x3000', label: '六切', width: 2398, height: 3000 },
    { id: 'iso_a4_2480x3508', label: 'A4', width: 2480, height: 3508 },
    { id: 'intl_photo_4x6_1200x1800', label: '4 x 6 inch', width: 1200, height: 1800 },
    { id: 'intl_photo_5x7_1500x2100', label: '5 x 7 inch', width: 1500, height: 2100 },
    { id: 'intl_photo_8x10_2400x3000', label: '8 x 10 inch', width: 2400, height: 3000 },
  ]);
});

test('production registry preserves legacy L and 2L source metadata', async () => {
  const markdown = await readFile(new URL('../../system/rules/output_formats.md', import.meta.url), 'utf8');
  assert.match(markdown,
    /- Size source: 7-Eleven photo print supports L\/2L photo paper; Japanese L print standard is 89 x 127 mm/);
  assert.match(markdown,
    /- Size source: 7-Eleven photo print supports L\/2L photo paper; Japanese 2L print standard is 127 x 178 mm/);
});

test('new production formats declare dimensions-only textual source usage', async () => {
  const markdown = await readFile(new URL('../../system/rules/output_formats.md', import.meta.url), 'utf8');
  const newFormatIds = [
    'jp_photo_dsc_1051x1406',
    'jp_photo_kg_1205x1795',
    'jp_photo_mutsugiri_2398x3000',
    'iso_a4_2480x3508',
    'intl_photo_4x6_1200x1800',
    'intl_photo_5x7_1500x2100',
    'intl_photo_8x10_2400x3000',
  ];

  for (const id of newFormatIds) {
    const heading = '### `' + id + '`';
    const section = markdown.match(new RegExp(`${heading}([\\s\\S]*?)(?=\\n### |\\n## Adding Formats)`))?.[1];
    assert.ok(section, `missing registry section ${id}`);
    assert.match(section,
      /- Source image usage: none \(textual physical-size standard only; dimensions-only\)/,
      `${id} must explicitly declare that no source image is used`);
  }
});

test('workflow rules use the authoritative output format registry dynamically', async () => {
  const files = {
    start: '../../system/skills/start/SKILL.md',
    sticker: '../../styles/sticker.md',
    stickerBase: '../../system/rules/print_ready_sticker_base.md',
    profile: '../../system/skills/profile/SKILL.md',
    outputRatio: '../../system/rules/output_ratio.md',
  };
  const entries = await Promise.all(Object.entries(files).map(async ([name, relativePath]) => [
    name,
    await readFile(new URL(relativePath, import.meta.url), 'utf8'),
  ]));
  const documents = Object.fromEntries(entries);
  const registry = await readFile(new URL('../../system/rules/output_formats.md', import.meta.url), 'utf8');
  const activeIds = parseOutputFormats(registry).map(({ id }) => id);

  assert.equal(activeIds.length, 9);
  for (const [name, markdown] of Object.entries(documents)) {
    assert.match(markdown, /system\/rules\/output_formats\.md/,
      `${name} must name the authoritative registry`);
    assert.match(markdown, /(?:every|all) active format/i,
      `${name} must apply to every active registry format`);
    assert.match(markdown, /(?:read|derive|resolve|enumerate).*(?:at runtime|dynamically)/i,
      `${name} must instruct runtime registry lookup`);
    assert.doesNotMatch(markdown, /Current options:|Current available formats:|Supported 7-Eleven formats:/,
      `${name} must not maintain a stale current-format list`);
    for (const id of activeIds) {
      assert.doesNotMatch(markdown, new RegExp(`\\b${id}\\b`),
        `${name} must not duplicate registry entry ${id}`);
    }
  }

  assert.match(documents.start, /custom.*valid.*(?:width|dimensions)/i,
    'start must allow custom output only when valid dimensions are supplied');
  assert.match(documents.sticker, /safe-margin.*examples?/i);
  assert.match(documents.stickerBase, /safe-margin.*examples?/i);

  for (const [name, markdown] of Object.entries({
    outputFormats: registry,
    outputRatio: documents.outputRatio,
  })) {
    assert.match(markdown, /exactly two (?:allowed )?cases/i,
      `${name} must define exactly two output-format cases`);
    assert.match(markdown, /\(a\).*one active registered preset `format_id`/i,
      `${name} must allow one active registered preset`);
    assert.match(markdown, /\(b\).*one-request custom pixel format/i,
      `${name} must allow a one-request custom pixel format`);
    assert.match(markdown, /validated by (?:the )?server\/UI/i,
      `${name} must require server/UI validation for custom dimensions`);
    assert.match(markdown, /never persisted to (?:the )?registry/i,
      `${name} must prohibit persisting one-request custom formats`);
    assert.match(markdown, /registry remains (?:the )?authority for presets/i,
      `${name} must retain preset registry authority`);
  }

  assert.doesNotMatch(documents.profile, /sole authority for format availability, dimensions/i);
  assert.match(documents.profile,
    /sole authority for registered preset availability, dimensions, and orientation/i);
  assert.match(documents.profile,
    /validated one-request custom target comes from the current request/i);

  assert.doesNotMatch(documents.outputRatio,
    /output_formats\.md` as the authority for final dimensions/i);
  assert.match(documents.outputRatio,
    /output_formats\.md` as the authority for registered preset dimensions/i);
  assert.match(documents.outputRatio,
    /validated custom dimensions are authoritative only for the current request/i);
});

test('loadCatalog returns active styles and formats', async () => {
  const catalog = await loadCatalog(await fixture());
  assert.deepEqual(catalog.styles, [{
    id: 'sticker',
    name: '贴纸',
    fingerprint: styleFingerprint(FIXTURE_STYLE),
    generated: false,
    generatedAt: null,
    previewUrl: null,
  }]);
  assert.deepEqual(catalog.formats, [{
    id: 'jp_711_photo_l_1051x1500',
    label: '7-Eleven L',
    width: 1051,
    height: 1500,
  }]);
});

test('rejects path traversal identifiers', () => {
  assert.throws(() => assertSafeId('../mama', '人物'), /人物标识无效/);
  assert.equal(assertSafeId('角色1', '人物'), '角色1');
});

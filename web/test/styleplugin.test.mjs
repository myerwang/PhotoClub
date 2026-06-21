import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  parseStylePlugin,
  publishStyleDraft,
  renderUserStyle,
  styleFingerprint,
  validateStyleDraft,
} from '../lib/styleplugin.mjs';

const markdown = `---
style_id: film
name: 胶片
---

# Style: Film

## Source Prompt

Soft film portrait.

## Subject Boundary

- Apply \`system/rules/style_base.md\`.
`;

test('parses a self-contained style and fingerprints exact content', () => {
  const parsed = parseStylePlugin(markdown, 'film.md');
  assert.equal(parsed.id, 'film');
  assert.equal(parsed.name, '胶片');
  assert.equal(parsed.fingerprint, styleFingerprint(markdown));
  assert.equal(parsed.fingerprint.length, 64);
  assert.throws(() => parseStylePlugin(markdown, 'other.md'), /文件名/);
  assert.throws(() => parseStylePlugin(markdown.replace('system/rules/style_base.md', 'missing'), 'film.md'), /style_base/);
});

test('validates and renders a user style without subject restrictions', () => {
  const draft = validateStyleDraft({
    id: 'softfilm', name: '柔和胶片', englishName: 'Soft Film', sourcePrompt: 'soft film portrait',
    adaptations: ['Remove fixed identity'], visualRules: ['Fine grain'],
    composition: ['Eye-level portrait'], lighting: ['Soft window light'],
  });
  const rendered = renderUserStyle(draft);
  assert.match(rendered, /style_id: softfilm/);
  assert.match(rendered, /source_type: user/);
  assert.match(rendered, /soft film portrait/);
  assert.match(rendered, /system\/rules\/style_base\.md/);
  assert.throws(() => validateStyleDraft({ ...draft, id: 'Bad-id' }), /style id/);
});

test('publishes one canonical style atomically and refuses collisions', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'style-plugin-'));
  const stagingPath = path.join(rootDir, '.control', 'draft.json');
  await mkdir(path.dirname(stagingPath), { recursive: true });
  await writeFile(stagingPath, JSON.stringify({
    id: 'softfilm', name: '柔和胶片', englishName: 'Soft Film', sourcePrompt: 'soft film portrait',
    adaptations: ['Remove fixed identity'], visualRules: ['Fine grain'],
    composition: ['Eye-level portrait'], lighting: ['Soft window light'],
  }));
  const result = await publishStyleDraft({ rootDir, stagingPath });
  assert.equal(result.styleId, 'softfilm');
  assert.match(await readFile(path.join(rootDir, 'styles', 'softfilm.md'), 'utf8'), /source_type: user/);
  await assert.rejects(publishStyleDraft({ rootDir, stagingPath }), /已存在/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const controlPath = new URL('../../system/skills/control/SKILL.md', import.meta.url);
const startPath = new URL('../../system/skills/start/SKILL.md', import.meta.url);
const readmePath = new URL('../../README.md', import.meta.url);
const portableFiles = [
  new URL('../lib/runner.mjs', import.meta.url),
  new URL('../../system/skills/profile/SKILL.md', import.meta.url),
  new URL('../../system/rules/output_formats.md', import.meta.url),
  new URL('../../system/rules/output_ratio.md', import.meta.url),
  new URL('../../system/rules/character_identity_base.md', import.meta.url),
];

test('control skill boots through Codex Desktop bundled dependencies', async () => {
  const content = await readFile(controlPath, 'utf8');
  assert.match(content, /codex_app__load_workspace_dependencies/);
  assert.match(content, /system\/tools\/bootstrap\.mjs/);
  assert.match(content, /--pnpm/);
  assert.match(content, /\/api\/health/);
  assert.doesNotMatch(content, /\/Applications\/Codex\.app|\/usr\/bin\/open|node --version/);
});

test('startup skills contain no developer-specific absolute repository path', async () => {
  const contents = await Promise.all([controlPath, startPath].map((file) => readFile(file, 'utf8')));
  for (const content of contents) assert.doesNotMatch(content, /\/Users\/yohji\/photo/);
});

test('README names Codex Desktop as the only prerequisite', async () => {
  const content = await readFile(readmePath, 'utf8');
  assert.match(content, /唯一前提.*Codex 桌面版/);
  assert.doesNotMatch(content, /需要 macOS、Node\.js|npm start/);
});

test('automatic dependency installation stays outside version control', async () => {
  const content = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.match(content, /^node_modules\/$/m);
});

test('runtime prompts and system rules contain no developer-specific root', async () => {
  const contents = await Promise.all(portableFiles.map((file) => readFile(file, 'utf8')));
  for (const content of contents) assert.doesNotMatch(content, /\/Users\/yohji\/photo/);
});

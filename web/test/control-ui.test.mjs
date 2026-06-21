import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('custom format controls remain hidden until custom format is selected', async () => {
  const css = await readFile(path.resolve('web/control.css'), 'utf8');
  assert.match(css, /\.custom-format-block\[hidden\]\s*\{\s*display:\s*none;/u);
});

test('mobile section headings wrap toolbars onto a separate row', async () => {
  const css = await readFile(path.resolve('web/control.css'), 'utf8');
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.section-heading\s*\{[^}]*flex-wrap:\s*wrap;/u);
});

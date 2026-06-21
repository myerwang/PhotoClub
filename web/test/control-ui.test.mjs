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
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.people-column,\s*\.styles-column\s*\{[^}]*grid-column:\s*1/u);
});

test('style management and accessible desktop separators are present', async () => {
  const html = await readFile(path.resolve('web/control.html'), 'utf8');
  assert.match(html, /id="style-open"/);
  assert.match(html, /id="style-dialog"/);
  assert.match(html, /id="style-prompt"/);
  assert.equal((html.match(/role="separator"/g) ?? []).length, 2);
});

test('desktop columns default to 2:4:2 and separators hide responsively', async () => {
  const css = await readFile(path.resolve('web/control.css'), 'utf8');
  assert.match(css, /--people-track:\s*2fr/);
  assert.match(css, /--style-track:\s*4fr/);
  assert.match(css, /--output-track:\s*2fr/);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.column-separator\s*\{[^}]*display:\s*none/);
});

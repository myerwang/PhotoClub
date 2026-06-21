import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from './errors.mjs';

const STYLE_ID = /^[a-z0-9]+$/;

function required(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new AppError('STYLE_DRAFT_INVALID', `${field} is required`, 422);
  return value.trim();
}

function oneLine(value) {
  return required(value, 'text').replace(/[\r\n]+/g, ' ');
}

function list(value, field) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new AppError('STYLE_DRAFT_INVALID', `${field} must be a non-empty string array`, 422);
  }
  return value.map((item) => item.trim());
}

function bullets(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

export function styleFingerprint(markdown) {
  return createHash('sha256').update(markdown, 'utf8').digest('hex');
}

export function parseStylePlugin(markdown, fileName = 'style.md') {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match) throw new AppError('STYLE_METADATA_INVALID', '风格缺少元数据', 422, { fileName });
  const fields = Object.create(null);
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator > 0) fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  const id = fields.style_id;
  const name = fields.name;
  if (!id || !name || !STYLE_ID.test(id)) throw new AppError('STYLE_METADATA_INVALID', '风格元数据必须包含安全的 style_id 和 name', 422, { fileName });
  if (fileName !== `${id}.md`) throw new AppError('STYLE_METADATA_INVALID', '风格文件名必须与 style_id 一致', 422, { fileName, styleId: id });
  if (!markdown.includes('system/rules/style_base.md')) throw new AppError('STYLE_METADATA_INVALID', '风格必须应用 system/rules/style_base.md', 422, { fileName });
  return { id, name, fingerprint: styleFingerprint(markdown) };
}

export function validateStyleDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('STYLE_DRAFT_INVALID', '风格草稿无效', 422);
  const id = required(value.id, 'style id');
  if (!STYLE_ID.test(id)) throw new AppError('STYLE_DRAFT_INVALID', 'style id must use lowercase letters and numbers only', 422);
  if (value.rejected === true) throw new AppError('STYLE_CONTENT_REJECTED', oneLine(value.reason || '该提示词不适合作为可复用风格'), 422);
  return {
    id,
    name: oneLine(value.name),
    englishName: oneLine(value.englishName),
    sourcePrompt: required(value.sourcePrompt, 'sourcePrompt'),
    adaptations: list(value.adaptations, 'adaptations'),
    visualRules: list(value.visualRules, 'visualRules'),
    composition: list(value.composition, 'composition'),
    lighting: list(value.lighting, 'lighting'),
  };
}

export function renderUserStyle(style) {
  return `---\nstyle_id: ${style.id}\nname: ${style.name}\nsource_type: user\n---\n\n# Style: ${style.englishName}\n\n## Source Prompt\n\n${style.sourcePrompt}\n\n## Adaptation Log\n\n${bullets(style.adaptations)}\n\n## Visual Rules\n\n${bullets(style.visualRules)}\n\n## Composition\n\n${bullets(style.composition)}\n\n## Lighting And Color\n\n${bullets(style.lighting)}\n\n## Subject Boundary\n\n- Apply \`system/rules/style_base.md\`.\n- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.\n`;
}

export async function publishStyleDraft({ rootDir, stagingPath }) {
  const draft = validateStyleDraft(JSON.parse(await readFile(stagingPath, 'utf8')));
  const styleDir = path.join(rootDir, 'styles');
  const finalPath = path.join(styleDir, `${draft.id}.md`);
  await mkdir(styleDir, { recursive: true });
  try {
    await writeFile(finalPath, renderUserStyle(draft), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new AppError('STYLE_EXISTS', `风格 ${draft.id} 已存在`, 409);
    throw error;
  }
  return { styleId: draft.id, filePath: finalPath, fingerprint: styleFingerprint(renderUserStyle(draft)) };
}

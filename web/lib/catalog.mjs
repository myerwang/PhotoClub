import { constants } from 'node:fs';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { AppError, asAppError } from './errors.mjs';
import { readStyleHistory } from './stylepreview.mjs';
import { parseStylePlugin } from './styleplugin.mjs';

const SAFE_ID = /^[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]+$/u;

export function assertSafeId(value, field = '资源') {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new AppError('INVALID_ID', `${field}标识无效`, 400, { field });
  }
  return value;
}

export function parseStyleFrontmatter(markdown, fileName = 'style.md') {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match) {
    throw new AppError('STYLE_METADATA_INVALID', '风格缺少元数据', 422, { fileName });
  }

  const fields = Object.create(null);
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator > 0) {
      fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }

  const id = fields.style_id;
  const name = fields.name;
  if (!id || !name) {
    throw new AppError('STYLE_METADATA_INVALID', '风格元数据必须包含 style_id 和 name', 422, { fileName });
  }
  assertSafeId(id, '风格');

  return { id, name };
}

export function parseOutputFormats(markdown) {
  const sections = markdown.split(/^###\s+/m).slice(1);
  const formats = [];

  for (const section of sections) {
    const id = /^`([^`]+)`/.exec(section)?.[1];
    const status = /^- Status:\s*(.+)$/mi.exec(section)?.[1]?.trim();
    const label = /^- Label:\s*(.+)$/mi.exec(section)?.[1]?.trim();
    const dimensions = /^- Pixel size:\s*`(\d+)\s*x\s*(\d+)`/mi.exec(section);
    if (id && status === 'active' && label && dimensions) {
      formats.push({
        id,
        label,
        width: Number(dimensions[1]),
        height: Number(dimensions[2]),
      });
    }
  }

  return formats;
}

async function directDirectories(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && SAFE_ID.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function issueFrom(error) {
  const safe = asAppError(error);
  return {
    code: safe.code,
    message: safe.message,
    ...(safe.details === undefined ? {} : { details: safe.details }),
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStyleHistory(rootDir, history) {
  const filePath = path.join(rootDir, '.control', 'style-history.json');
  if (history === null || typeof history !== 'object' || Array.isArray(history)) {
    throw new AppError('STYLE_HISTORY_INVALID', '风格历史无效', 422, { filePath });
  }

  for (const [styleId, record] of Object.entries(history)) {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new AppError('STYLE_HISTORY_INVALID', '风格历史无效', 422, { filePath });
    }

    if (!isNonEmptyString(styleId) ||
      !isNonEmptyString(record.styleId) ||
      !isNonEmptyString(record.generatedAt) ||
      !isNonEmptyString(record.jobId) ||
      !isNonEmptyString(record.sourcePath) ||
      !isNonEmptyString(record.preview) ||
      record.styleId !== styleId ||
      (record.styleFingerprint !== undefined && !/^[a-f0-9]{64}$/u.test(record.styleFingerprint)) ||
      record.preview !== `styles/previews/${styleId}.jpg`) {
      throw new AppError('STYLE_HISTORY_INVALID', '风格历史无效', 422, { filePath });
    }
  }

  return history;
}

export async function loadCatalog(rootDir) {
  const profiles = [];
  for (const id of await directDirectories(path.join(rootDir, 'profiles'))) {
    const imagePath = path.join(rootDir, 'profiles', id, 'multiview_reference.png');
    try {
      await access(imagePath);
      profiles.push({ id, imageUrl: `/media/profiles/${encodeURIComponent(id)}/multiview_reference.png` });
    } catch {
      // A profile exists only when its final multiview image is readable.
    }
  }

  const inputs = (await directDirectories(path.join(rootDir, 'input'))).map((id) => ({ id }));
  const styles = [];
  const issues = [];
  let history = {};

  try {
    history = validateStyleHistory(rootDir, await readStyleHistory(rootDir));
  } catch (error) {
    issues.push(issueFrom(error));
    history = {};
  }

  let styleEntries = [];
  try {
    styleEntries = await readdir(path.join(rootDir, 'styles'), { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  for (const entry of styleEntries.filter((item) => item.isFile() && item.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      const markdown = await readFile(path.join(rootDir, 'styles', entry.name), 'utf8');
      const style = parseStylePlugin(markdown, entry.name);
      const historyRecord = history[style.id];
      const generated = historyRecord !== undefined
        && (historyRecord.styleFingerprint === undefined || historyRecord.styleFingerprint === style.fingerprint);
      let previewUrl = null;

      if (generated) {
        const previewPath = path.join(rootDir, 'styles', 'previews', `${style.id}.jpg`);
        try {
          await access(previewPath, constants.R_OK);
          const previewStat = await stat(previewPath);
          if (!previewStat.isFile()) {
            throw new Error('preview is not a file');
          }
          previewUrl = `/media/style-previews/${encodeURIComponent(style.id)}.jpg`;
        } catch {
          issues.push(issueFrom(new AppError('STYLE_PREVIEW_MISSING', '风格代表图预览不存在', 422, {
            styleId: style.id,
            preview: `styles/previews/${style.id}.jpg`,
          })));
        }
      }

      styles.push({
        id: style.id,
        name: style.name,
        fingerprint: style.fingerprint,
        generated,
        generatedAt: generated ? historyRecord.generatedAt ?? null : null,
        previewUrl,
      });
    } catch (error) {
      issues.push(issueFrom(error));
    }
  }

  let formats = [];
  try {
    const markdown = await readFile(path.join(rootDir, 'system', 'rules', 'output_formats.md'), 'utf8');
    formats = parseOutputFormats(markdown);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    issues.push(issueFrom(new AppError('FORMAT_REGISTRY_MISSING', '输出格式注册表不存在', 500)));
  }

  return { profiles, inputs, styles, formats, issues };
}

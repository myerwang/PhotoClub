import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RESULT_STATUSES = new Set(['accepted', 'rejected', 'blocked', 'no-prompt']);
const STYLE_ID = /^[a-z0-9]+$/;

function batchPaths(rootDir) {
  const workDir = path.join(rootDir, 'work', 'styles');
  return {
    workDir,
    state: path.join(workDir, 'state.json'),
    queue: path.join(workDir, 'queue.json'),
    records: path.join(workDir, 'records.json'),
    sources: path.join(workDir, 'sources.md'),
    styles: path.join(rootDir, 'styles'),
  };
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function atomicWrite(filePath, content) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, filePath);
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function textList(value, field) {
  if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${field} must be a non-empty string array`);
  }
  return value.map((item) => item.trim());
}

function oneLine(value) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function bulletList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function promptKey(prompt) {
  return prompt.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeUrl(value) {
  const url = new URL(requiredText(value, 'url'));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('url must use http or https');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

function initialState() {
  return {
    status: 'ready', query: 'image2 prompt', engine: 'Google', next_result: 1, next_page: 1,
    checked_results: 0, accepted_styles: 0, rejected_candidates: 0, blocked_results: 0,
    empty_quality_pages: 0, completed_pages: [], last_checked_at: null, stop_reason: null,
  };
}

function renderSources(records) {
  const entries = records.map((record) => {
    const styleIds = record.styles.map((style) => style.id).join(', ') || 'none';
    return `### Result ${record.rank}\n\n- Page: ${record.page}\n- Title: ${record.title}\n- URL: ${record.url}\n- Domain: ${new URL(record.url).hostname}\n- Checked at: ${record.checkedAt}\n- Status: ${record.status}\n- Reason: ${record.reason}\n- Styles: ${styleIds}\n- Prompt location: ${record.promptLocation || 'none'}\n`;
  }).join('\n');
  return `# 来源账本\n\n## 搜索\n\n- Engine: Google\n- Query: \`image2 prompt\`\n- Processed: ${records.length}\n\n## 结果记录\n\n${entries || '任务尚未执行。'}\n`;
}

export async function initializeBatch(rootDir) {
  const files = batchPaths(rootDir);
  await mkdir(files.workDir, { recursive: true });
  await mkdir(files.styles, { recursive: true });
  if (!await exists(files.state)) {
    await writeJson(files.state, initialState());
  } else {
    const current = await readJson(files.state, {});
    const migrated = { ...initialState(), ...current, completed_pages: Array.isArray(current.completed_pages) ? current.completed_pages : [] };
    if (JSON.stringify(current) !== JSON.stringify(migrated)) await writeJson(files.state, migrated);
  }
  if (!await exists(files.queue)) await writeJson(files.queue, { query: 'image2 prompt', results: [] });
  if (!await exists(files.records)) await writeJson(files.records, []);
  if (!await exists(files.sources)) await atomicWrite(files.sources, renderSources([]));
  return files;
}

function validateSearchResult(result) {
  if (!Number.isInteger(result?.rank) || result.rank < 1) throw new Error('rank must be a positive integer');
  if (!Number.isInteger(result.page) || result.page < 1) throw new Error('page must be a positive integer');
  return {
    rank: result.rank,
    page: result.page,
    title: oneLine(requiredText(result.title, 'title')),
    url: requiredText(result.url, 'url'),
    normalizedUrl: normalizeUrl(result.url),
  };
}

export async function enqueueResults(rootDir, results) {
  const files = await initializeBatch(rootDir);
  if (!Array.isArray(results) || !results.length) throw new Error('results must be a non-empty array');
  const queue = await readJson(files.queue, { query: 'image2 prompt', results: [] });
  const ranks = new Set(queue.results.map((item) => item.rank));
  const urls = new Set(queue.results.map((item) => item.normalizedUrl));
  let added = 0;
  for (const raw of [...results].sort((a, b) => a.rank - b.rank)) {
    const result = validateSearchResult(raw);
    if (ranks.has(result.rank)) {
      const existing = queue.results.find((item) => item.rank === result.rank);
      if (existing.normalizedUrl !== result.normalizedUrl) throw new Error(`rank ${result.rank} already has another URL`);
      continue;
    }
    if (urls.has(result.normalizedUrl)) continue;
    queue.results.push(result);
    ranks.add(result.rank);
    urls.add(result.normalizedUrl);
    added += 1;
  }
  queue.results.sort((a, b) => a.rank - b.rank);
  await writeJson(files.queue, queue);
  return { added, total: queue.results.length };
}

export async function nextResult(rootDir) {
  const files = await initializeBatch(rootDir);
  const queue = await readJson(files.queue, { results: [] });
  const records = await readJson(files.records, []);
  const processed = new Set(records.map((item) => item.rank));
  return queue.results.find((item) => !processed.has(item.rank)) ?? null;
}

function validateStyle(style) {
  const id = requiredText(style?.id, 'style.id');
  if (!STYLE_ID.test(id)) throw new Error(`invalid style id: ${id}`);
  return {
    id,
    name: oneLine(requiredText(style.name, 'style.name')),
    englishName: oneLine(requiredText(style.englishName, 'style.englishName')),
    sourcePrompt: requiredText(style.sourcePrompt, 'style.sourcePrompt'),
    adaptations: textList(style.adaptations, 'style.adaptations'),
    visualRules: textList(style.visualRules, 'style.visualRules'),
    composition: textList(style.composition, 'style.composition'),
    lighting: textList(style.lighting, 'style.lighting'),
  };
}

function renderStyle(style, result, checkedAt) {
  return `---\nstyle_id: ${style.id}\nname: ${style.name}\nsource_url: ${result.url}\nsource_title: ${oneLine(result.title)}\nsource_result: ${result.rank}\nretrieved_at: ${checkedAt}\n---\n\n# Style: ${style.englishName}\n\n## Source Prompt\n\n${style.sourcePrompt}\n\n## Adaptation Log\n\n${bulletList(style.adaptations)}\n\n## Visual Rules\n\n${bulletList(style.visualRules)}\n\n## Composition\n\n${bulletList(style.composition)}\n\n## Lighting And Color\n\n${bulletList(style.lighting)}\n\n## Subject Boundary\n\n- Apply \`system/rules/style_base.md\`.\n- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.\n`;
}

export async function applyResult(rootDir, payload, { now = () => new Date() } = {}) {
  const files = await initializeBatch(rootDir);
  const expected = await nextResult(rootDir);
  if (!expected) throw new Error('no queued result is waiting');
  if (payload?.rank !== expected.rank) throw new Error(`next queued result is ${expected.rank}`);
  if (!RESULT_STATUSES.has(payload.status)) throw new Error(`invalid result status: ${payload.status}`);
  const reason = oneLine(requiredText(payload.reason, 'reason'));
  const styles = (payload.styles ?? []).map(validateStyle);
  if (payload.status === 'accepted' && !styles.length) throw new Error('accepted result requires at least one style');
  if (payload.status !== 'accepted' && styles.length) throw new Error(`${payload.status} result cannot create styles`);
  const duplicateIds = new Set();
  for (const style of styles) {
    if (duplicateIds.has(style.id)) throw new Error(`duplicate style id in result: ${style.id}`);
    duplicateIds.add(style.id);
    if (await exists(path.join(files.styles, `${style.id}.md`))) throw new Error(`style already exists: ${style.id}`);
  }
  const records = await readJson(files.records, []);
  const knownPrompts = new Set(records.flatMap((record) => record.styles.map((style) => promptKey(style.sourcePrompt))));
  for (const style of styles) {
    const key = promptKey(style.sourcePrompt);
    if (knownPrompts.has(key)) throw new Error(`source prompt already exists for style: ${style.id}`);
    knownPrompts.add(key);
  }
  const checkedAt = now().toISOString();
  for (const style of styles) {
    await atomicWrite(path.join(files.styles, `${style.id}.md`), renderStyle(style, expected, checkedAt));
  }
  const record = {
    ...expected,
    status: payload.status,
    reason,
    promptLocation: oneLine(typeof payload.promptLocation === 'string' ? payload.promptLocation : ''),
    checkedAt,
    styles,
  };
  records.push(record);
  records.sort((a, b) => a.rank - b.rank);
  await writeJson(files.records, records);
  await atomicWrite(files.sources, renderSources(records));
  const state = await readJson(files.state, initialState());
  state.status = 'running';
  state.checked_results = records.length;
  state.accepted_styles = records.reduce((sum, item) => sum + item.styles.length, 0);
  state.rejected_candidates = records.filter((item) => ['rejected', 'no-prompt'].includes(item.status)).length;
  state.blocked_results = records.filter((item) => item.status === 'blocked').length;
  state.last_checked_at = checkedAt;
  const next = await nextResult(rootDir);
  const queue = await readJson(files.queue, { results: [] });
  state.next_result = next?.rank ?? ((queue.results.at(-1)?.rank ?? 0) + 1);
  await writeJson(files.state, state);
  return { created: styles.map((style) => style.id), record };
}

export async function completePage(rootDir, page) {
  const files = await initializeBatch(rootDir);
  if (!Number.isInteger(page) || page < 1) throw new Error('page must be a positive integer');
  const queue = await readJson(files.queue, { results: [] });
  const records = await readJson(files.records, []);
  const queued = queue.results.filter((item) => item.page === page);
  if (!queued.length) throw new Error(`page ${page} has no queued results`);
  const processed = new Set(records.map((item) => item.rank));
  const pending = queued.filter((item) => !processed.has(item.rank));
  if (pending.length) throw new Error(`page ${page} still has pending results: ${pending.map((item) => item.rank).join(', ')}`);
  const styleCount = records.filter((item) => item.page === page).reduce((sum, item) => sum + item.styles.length, 0);
  const state = await readJson(files.state, initialState());
  if (state.completed_pages.includes(page)) {
    return { page, styleCount, emptyQualityPages: state.empty_quality_pages, status: state.status };
  }
  if (page !== state.next_page) throw new Error(`next page to complete is ${state.next_page}`);
  state.empty_quality_pages = styleCount === 0 ? state.empty_quality_pages + 1 : 0;
  state.completed_pages.push(page);
  state.next_page = page + 1;
  if (state.empty_quality_pages >= 3) {
    state.status = 'complete';
    state.stop_reason = '3 consecutive complete Google result pages produced no new qualified styles.';
  }
  await writeJson(files.state, state);
  return { page, styleCount, emptyQualityPages: state.empty_quality_pages, status: state.status };
}

export async function auditBatch(rootDir) {
  const files = await initializeBatch(rootDir);
  const records = await readJson(files.records, []);
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const prompts = new Set();
  for (const record of records) {
    for (const style of record.styles) {
      if (ids.has(style.id)) errors.push(`duplicate style id: ${style.id}`);
      ids.add(style.id);
      const key = promptKey(style.sourcePrompt);
      if (prompts.has(key)) errors.push(`duplicate source prompt: ${style.id}`);
      prompts.add(key);
      const stylePath = path.join(files.styles, `${style.id}.md`);
      let markdown = '';
      try { markdown = await readFile(stylePath, 'utf8'); } catch { errors.push(`missing style file: ${style.id}.md`); continue; }
      if (!new RegExp(`^---[\\s\\S]*?style_id: ${style.id}[\\s\\S]*?source_url: https?://`, 'm').test(markdown)) {
        errors.push(`invalid style metadata: ${style.id}.md`);
      }
      if (!markdown.includes('## Source Prompt') || !markdown.includes('system/rules/style_base.md')) errors.push(`invalid style sections: ${style.id}.md`);
    }
  }
  return { errors, warnings, checkedResults: records.length, styles: ids.size };
}

export async function batchStatus(rootDir) {
  const files = await initializeBatch(rootDir);
  return {
    state: await readJson(files.state, initialState()),
    next: await nextResult(rootDir),
    audit: await auditBatch(rootDir),
  };
}

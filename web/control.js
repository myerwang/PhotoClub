import { LANGUAGE_LOCALES, normalizeLanguage, translate } from './i18n.mjs';
import { setStyleChecked, toggleAllVisible, visibleStyles } from './style-selection.mjs';
import { dragBoundary, normalizeColumnRatio } from './layout-columns.mjs';

const CUSTOM_FORMAT_ID = 'custom';
const CUSTOM_FORMAT_LIMITS = { min: 256, max: 8192, maxArea: 40_000_000 };

function savedLanguage() {
  try { return localStorage.getItem('photoclub.language'); } catch { return null; }
}

const state = {
  lease: 'connecting',
  busy: false,
  submitting: false,
  catalog: null,
  catalogBust: Date.now(),
  selection: {
    profileIds: [],
    styleIds: [],
    formatId: '',
    orientation: 'portrait',
    prompt: '',
    quantity: 1,
    onlyUngenerated: false,
  },
  styleSelectionTouched: false,
  job: null,
  batch: null,
  resultUrls: [],
  history: [],
  language: normalizeLanguage(savedLanguage()),
  columnRatio: normalizeColumnRatio((() => { try { return localStorage.getItem('photoclub.columnRatio'); } catch { return null; } })()),
};

const clientId = crypto.randomUUID();
let token = '';
let heartbeatTimer;

const $ = (id) => document.getElementById(id);
const t = (key, variables = {}, fallback = '') => translate(state.language, key, variables, fallback);

function errorMessage(error) {
  const code = error?.error?.code || error?.code || 'UNKNOWN_ERROR';
  return t(`error.${code}`, {}, error?.error?.message || error?.message || t('error.UNKNOWN_ERROR'));
}

function showError(error, suggestionKey = 'suggestion.default') {
  const node = $('error');
  const code = error?.error?.code || error?.code || 'UNKNOWN_ERROR';
  node.textContent = `${errorMessage(error)} (${code}) ${t(suggestionKey)}`;
  node.hidden = false;
}

function clearError() {
  $('error').hidden = true;
  $('error').textContent = '';
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
  if (token) {
    headers['x-client-id'] = clientId;
    headers['x-lease-token'] = token;
  }
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw body;
  return body;
}

function isTerminalStatus(status) {
  return ['succeeded', 'failed', 'cancelled'].includes(status);
}

function withBust(url) {
  if (!url) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${state.catalogBust}`;
}

function setLease(status) {
  state.lease = status;
  const node = $('connection');
  node.className = `status ${status}`;
  node.textContent = t(`connection.${status}`, {}, status);
  renderLock();
}

function renderLock() {
  const locked = state.busy || state.lease !== 'owned';
  document.body.classList.toggle('locked', locked);
  for (const element of document.querySelectorAll('input, textarea, select, button')) {
    if (['language', 'shutdown', 'cancel', 'help-open', 'help-close', 'loading-cancel'].includes(element.id)) continue;
    element.disabled = locked;
  }
  const cancellationUnavailable = !state.busy || state.submitting || state.batch?.cancelRequested;
  $('cancel').disabled = cancellationUnavailable;
  $('cancel').hidden = !state.busy;
  $('loading-cancel').disabled = cancellationUnavailable;
  $('shutdown').disabled = state.lease !== 'owned';
}

function trashIcon() {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.innerHTML = '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>';
  return icon;
}

function empty(text) {
  const node = document.createElement('div');
  node.className = 'empty';
  node.textContent = text;
  return node;
}

function styleLabel(item) {
  return t(`style.${item.id}`, {}, item.name);
}

function createProfileChoice(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'choice-wrap';

  const element = document.createElement('label');
  element.className = 'choice';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = 'profile';
  input.value = item.id;
  input.checked = state.selection.profileIds.includes(item.id);
  input.addEventListener('change', () => {
    clearError();
    state.selection.profileIds = input.checked
      ? [...new Set([...state.selection.profileIds, item.id])]
      : state.selection.profileIds.filter((profileId) => profileId !== item.id);
    renderSummary();
  });

  const media = document.createElement('span');
  media.className = 'profile-media';
  const image = document.createElement('img');
  image.src = withBust(item.imageUrl);
  image.alt = item.id;
  media.append(image);
  element.append(input, media);

  const name = document.createElement('span');
  name.className = 'choice-name';
  name.textContent = item.id;

  const footer = document.createElement('div');
  footer.className = 'choice-footer';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'profile-delete';
  remove.append(trashIcon());
  remove.title = t('aria.deleteProfile', { name: item.id });
  remove.setAttribute('aria-label', remove.title);
  remove.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    deleteProfile(item.id);
  });
  footer.append(name, remove);

  wrapper.append(element, footer);
  return wrapper;
}

function createStyleChoice(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'choice-wrap';
  const element = document.createElement('label');
  element.className = 'choice';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = 'style';
  input.value = item.id;
  input.checked = state.selection.styleIds.includes(item.id);
  input.addEventListener('change', () => {
    clearError();
    state.styleSelectionTouched = true;
    state.selection.styleIds = setStyleChecked(state.selection.styleIds, item.id, input.checked);
    renderStyleControls();
    renderSummary();
  });

  const media = document.createElement('span');
  media.className = 'style-media';
  if (item.previewUrl) {
    const image = document.createElement('img');
    image.src = withBust(item.previewUrl);
    image.alt = styleLabel(item);
    media.append(image);
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'style-placeholder';
    placeholder.textContent = t('style.neverGenerated');
    media.append(placeholder);
  }

  const name = document.createElement('span');
  name.className = 'choice-name';
  name.textContent = styleLabel(item);

  element.append(input, media);
  const footer = document.createElement('div');
  footer.className = 'choice-footer';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'style-delete';
  remove.append(trashIcon());
  remove.title = t('aria.deleteStyle', { name: styleLabel(item) });
  remove.setAttribute('aria-label', remove.title);
  remove.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    deleteStyle(item.id);
  });
  footer.append(name, remove);
  wrapper.append(element, footer);
  return wrapper;
}

function visibleStyleItems() {
  return visibleStyles(state.catalog?.styles ?? [], state.selection.onlyUngenerated);
}

function allVisibleStylesSelected() {
  const visible = visibleStyleItems();
  return visible.length > 0 && visible.every((style) => state.selection.styleIds.includes(style.id));
}

function renderStyleControls() {
  const button = $('style-select-all');
  const allSelected = allVisibleStylesSelected();
  button.textContent = t(allSelected ? 'button.clearVisibleStyles' : 'button.selectAllStyles');
  button.setAttribute('aria-pressed', String(allSelected));
  button.disabled = visibleStyleItems().length === 0;
  $('style-only-new').setAttribute('aria-pressed', String(state.selection.onlyUngenerated));
}

function renderStyles() {
  const styles = visibleStyleItems();
  $('styles').replaceChildren(...(styles.length ? styles.map((item) => createStyleChoice(item)) : [empty(t('empty.styles'))]));
  renderStyleControls();
}

function renderFormats() {
  const options = [...(state.catalog?.formats ?? []), { id: CUSTOM_FORMAT_ID, label: t('format.custom') }];
  $('formats').replaceChildren(...options.map((item) => {
    const label = document.createElement('label');
    label.className = 'segment';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'format';
    input.value = item.id;
    input.checked = item.id === state.selection.formatId;
    input.addEventListener('change', () => {
      clearError();
      state.selection.formatId = item.id;
      renderCustomFormatVisibility();
      renderSummary();
    });
    const span = document.createElement('span');
    const displayName = item.id === CUSTOM_FORMAT_ID ? item.label : t(`format.${item.id}`, {}, item.label);
    span.textContent = item.id === CUSTOM_FORMAT_ID ? displayName : `${displayName} ${item.width}×${item.height}`;
    label.append(input, span);
    return label;
  }));
  renderCustomFormatVisibility();
}

function renderCustomFormatVisibility() {
  $('custom-format-block').hidden = state.selection.formatId !== CUSTOM_FORMAT_ID;
}

function renderResults() {
  $('result').replaceChildren(...state.resultUrls.map((resultUrl, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result-preview';
    button.setAttribute('aria-label', t('aria.viewResult', { index: index + 1 }));
    const image = new Image();
    image.src = resultUrl;
    image.alt = t('result.alt', { index: index + 1 });
    button.append(image);
    button.addEventListener('click', () => {
      $('result-dialog-image').src = resultUrl;
      $('result-dialog-image').alt = t('result.previewAlt', { index: index + 1 });
      $('result-dialog').showModal();
    });
    return button;
  }));
}

function renderHistory() {
  const items = state.history.map((batch) => {
    const node = document.createElement('div');
    node.className = 'history-item';
    const row = document.createElement('div');
    row.className = 'history-item-row';
    const label = document.createElement('strong');
    label.textContent = `${new Date(batch.createdAt).toLocaleString(LANGUAGE_LOCALES[state.language])} · ${t(`history.status.${batch.status}`, {}, batch.status)}`;
    row.append(label);
    if (['paused_quota', 'interrupted', 'failed'].includes(batch.status) && batch.completed < batch.total) {
      const resume = document.createElement('button');
      resume.type = 'button';
      resume.className = 'compact-button';
      resume.textContent = t('button.resume');
      resume.addEventListener('click', () => resumeBatch(batch.id));
      row.append(resume);
    }
    const progress = document.createElement('div');
    progress.className = 'history-progress';
    const usage = batch.usage?.totalTokens ? ` · ${batch.usage.totalTokens} tokens` : '';
    progress.textContent = `${batch.completed} / ${batch.total}${usage}`;
    const details = document.createElement('div');
    details.className = 'history-progress';
    if (batch.summary?.pending) {
      const next = batch.summary.nextPending;
      details.textContent = t('history.resumeSummary', {
        pending: batch.summary.pending,
        skipped: batch.summary.skippedCompleted,
        next: next?.styleIndex ?? next?.itemIndex ?? '-',
        style: next?.styleId ?? '-',
      });
    }
    node.append(row, progress, details);
    return node;
  });
  $('generation-history').replaceChildren(...(items.length ? items : [empty(t('history.empty'))]));
}

async function refreshHistory() {
  const result = await api('/api/generation-history');
  state.history = result.batches ?? [];
  renderHistory();
}

async function resumeBatch(batchId) {
  clearError();
  try {
    const { jobs, resume } = await api(`/api/generation-history/${encodeURIComponent(batchId)}/resume`, { method: 'POST', body: '{}' });
    state.job = null;
    state.batch = createBatchState(batchId, jobs, resume);
    batchStatusMessage();
    await refreshHistory();
  } catch (error) { showError(error, 'suggestion.job'); }
}

function batchStatusMessage() {
  const batch = state.batch;
  if (!batch) return;

  const total = batch.jobIds.length;
  const terminalCount = batch.terminalIds.length;
  const statuses = batch.jobIds.map((id) => batch.statuses[id]).filter(Boolean);
  const allTerminal = total > 0 && terminalCount === total;

  $('loading-title').textContent = t('loading.generate');

  if (allTerminal) {
    state.busy = false;
    $('loading-overlay').hidden = true;
    if (statuses.every((status) => status === 'cancelled')) {
      $('task-state').textContent = `${t('task.generate')}: ${t('status.cancelled')}`;
    } else if (statuses.some((status) => status === 'failed' || status === 'cancelled')) {
      $('task-state').textContent = `${t('task.generate')}: ${t('task.batchPartialFailure')}`;
    } else {
      clearError();
      $('task-state').textContent = `${t('task.generate')}: ${t('task.batchComplete')}`;
    }
    renderLock();
    refreshHistory().catch(() => {});
    return;
  }

  const job = batch.lastJob ?? { status: 'queued', batchIndex: 0, batchSize: total };
  const progress = isTerminalStatus(job.status)
    ? t('loading.batchProgress', { current: terminalCount, total })
    : t('loading.batchProgress', { current: (job.batchIndex ?? 0) + 1, total: job.batchSize ?? total });
  const statusKey = isTerminalStatus(job.status)
    ? `status.${job.status}`
    : job.status === 'running' ? 'loading.running' : 'loading.queued';
  const label = t(statusKey, {}, job.status);

  state.busy = true;
  $('loading-overlay').hidden = false;
  $('loading-status-text').textContent = `${label} ${progress}`.trim();
  const resumeInfo = batch.resume?.pending
    ? ` · ${t('task.resumeRemaining', { pending: batch.resume.pending, skipped: batch.resume.skippedCompleted })}`
    : '';
  $('task-state').textContent = `${t('task.generate')}: ${t(`status.${job.status}`, {}, job.status)} (${progress})${resumeInfo}`;
  renderLock();
}

function renderJobStatus() {
  const job = state.job;
  if (!job) return;
  const taskKey = job.type === 'profile' ? 'task.profile' : job.type === 'style' ? 'task.style' : 'task.generate';
  $('task-state').textContent = `${t(taskKey)}: ${t(`status.${job.status}`, {}, job.status)}`;
  state.busy = ['queued', 'running'].includes(job.status);
  $('loading-overlay').hidden = !state.busy;
  $('loading-title').textContent = t(job.type === 'profile' ? 'loading.profile' : job.type === 'style' ? 'loading.style' : 'loading.generate');
  $('loading-status-text').textContent = t(job.status === 'queued' ? 'loading.queued' : 'loading.running');
  renderLock();
}

function renderSummary() {
  const styleLookup = new Map((state.catalog?.styles ?? []).map((item) => [item.id, item]));
  const styleNames = state.selection.styleIds
    .map((styleId) => styleLookup.get(styleId))
    .filter(Boolean)
    .map((item) => styleLabel(item));
  const styleSummary = styleNames.length
    ? `${t('summary.styleCount', { count: styleNames.length })} / ${t('summary.styleOrder', { order: styleNames.join(' -> ') })}`
    : t('summary.noStyle');
  const people = state.selection.profileIds.length ? state.selection.profileIds.join(' + ') : t('summary.noPeople');
  const orientation = t(state.selection.orientation === 'landscape' ? 'field.landscape' : 'field.portrait');
  $('selection-summary').textContent = `${people} / ${styleSummary} / ${orientation}`;
}

function createBatchState(batchId, jobs, resume = null) {
  return {
    id: batchId,
    jobIds: jobs.map((job) => job.id),
    terminalIds: [],
    resultUrls: [],
    failedStyleIds: [],
    cancelRequested: false,
    statuses: Object.fromEntries(jobs.map((job) => [job.id, job.status])),
    lastJob: jobs[0] ?? null,
    resume,
  };
}

function appendBatchResults(outputUrls) {
  if (!Array.isArray(outputUrls) || !outputUrls.length) return;
  const busted = outputUrls.map((outputUrl) => withBust(outputUrl));
  state.batch.resultUrls.push(...busted);
  state.resultUrls = [...state.batch.resultUrls];
  renderResults();
}

async function refreshCatalog() {
  state.catalog = await api('/api/catalog');
  state.catalogBust = Date.now();
  renderCatalog();
}

function handleSingleJob(job) {
  if (state.job && job.id !== state.job.id) return;
  state.job = job;
  renderJobStatus();
  if (job.status === 'succeeded') {
    clearError();
    const outputUrls = job.result?.outputUrls ?? (job.result?.outputUrl ? [job.result.outputUrl] : []);
    if (outputUrls.length) {
      state.resultUrls = outputUrls.map((outputUrl) => withBust(outputUrl));
      renderResults();
    }
    refreshCatalog().then(() => {
      if (job.type === 'style' && job.result?.styleId) {
        state.styleSelectionTouched = true;
        state.selection.styleIds = [job.result.styleId];
        renderCatalog();
      }
    }).catch(showError);
  } else if (job.status === 'failed') {
    showError(job.error, 'suggestion.job');
  }
}

function handleBatchJob(job) {
  if (!state.batch || job.batchId !== state.batch.id || !state.batch.jobIds.includes(job.id)) return;

  state.batch.statuses[job.id] = job.status;
  state.batch.lastJob = job;

  if (isTerminalStatus(job.status)) {
    if (state.batch.terminalIds.includes(job.id)) return;
    state.batch.terminalIds.push(job.id);
    if (job.status === 'succeeded') {
      appendBatchResults(job.result?.outputUrls ?? (job.result?.outputUrl ? [job.result.outputUrl] : []));
      refreshCatalog().catch(showError);
    } else if (job.status === 'failed') {
      if (job.styleId && !state.batch.failedStyleIds.includes(job.styleId)) {
        state.batch.failedStyleIds.push(job.styleId);
      }
      showError(job.error, 'suggestion.job');
    }
  }

  batchStatusMessage();
}

async function reconcileBatchJobs() {
  if (!state.batch) return;
  const snapshot = await api('/api/jobs');
  for (const job of snapshot.jobs ?? []) handleBatchJob(job);
}

function handleEventJob(job) {
  if (job.type === 'profile') {
    handleSingleJob(job);
    return;
  }
  if (job.type === 'style') return handleSingleJob(job);
  if (job.batchId) handleBatchJob(job);
}

function renderCatalog() {
  const { profiles, styles, formats, inputs, issues } = state.catalog;

  state.selection.profileIds = state.selection.profileIds.filter((profileId) => profiles.some((item) => item.id === profileId));
  if (!state.selection.profileIds.length && profiles.length) state.selection.profileIds = [profiles[0].id];

  state.selection.styleIds = state.selection.styleIds.filter((styleId) => styles.some((item) => item.id === styleId));
  if (!state.selection.styleIds.length && styles.length && !state.styleSelectionTouched) state.selection.styleIds = [styles[0].id];

  if (state.selection.formatId !== CUSTOM_FORMAT_ID && !formats.some((item) => item.id === state.selection.formatId)) {
    state.selection.formatId = formats[0]?.id || '';
  }
  if (!state.selection.formatId) state.selection.formatId = formats[0]?.id || CUSTOM_FORMAT_ID;

  $('profile-count').textContent = t(profiles.length === 1 ? 'count.peopleOne' : 'count.people', { count: profiles.length });
  $('style-count').textContent = t(styles.length === 1 ? 'count.stylesOne' : 'count.styles', { count: styles.length });
  $('profiles').replaceChildren(...(profiles.length ? profiles.map((item) => createProfileChoice(item)) : [empty(t('empty.profiles'))]));
  renderStyles();
  renderFormats();
  $('input-id').replaceChildren(...inputs.map((item) => new Option(item.id, item.id)));

  if (issues.length) showError({ error: issues[0] }, 'suggestion.style');
  renderSummary();
  renderLock();
}

function readCustomFormat() {
  const shortRaw = $('custom-short-edge').value.trim();
  const longRaw = $('custom-long-edge').value.trim();
  if (!shortRaw || !longRaw) return { code: 'CUSTOM_FORMAT_REQUIRED' };

  const shortEdge = Number(shortRaw);
  const longEdge = Number(longRaw);
  if (
    !Number.isInteger(shortEdge)
    || !Number.isInteger(longEdge)
    || shortEdge < CUSTOM_FORMAT_LIMITS.min
    || shortEdge > CUSTOM_FORMAT_LIMITS.max
    || longEdge < CUSTOM_FORMAT_LIMITS.min
    || longEdge > CUSTOM_FORMAT_LIMITS.max
    || shortEdge > longEdge
    || shortEdge * longEdge > CUSTOM_FORMAT_LIMITS.maxArea
  ) {
    return { code: 'CUSTOM_FORMAT_INVALID' };
  }

  return { value: { shortEdge, longEdge } };
}

async function cancelCurrentJob() {
  if (state.submitting || state.batch?.cancelRequested) return;
  try {
    if (state.batch?.id && state.busy) {
      state.batch.cancelRequested = true;
      renderLock();
      await api(`/api/batches/${encodeURIComponent(state.batch.id)}`, { method: 'DELETE' });
      await reconcileBatchJobs();
      return;
    }
    if (state.job) await api(`/api/jobs/${state.job.id}`, { method: 'DELETE' });
  } catch (error) {
    if (state.batch) {
      state.batch.cancelRequested = false;
      await reconcileBatchJobs().catch(() => {});
      if (!state.busy) return;
    }
    showError(error);
    renderLock();
  }
}

async function shutdownService() {
  if (!window.confirm(t('confirm.shutdown'))) return;
  clearInterval(heartbeatTimer);
  try {
    await api('/api/shutdown', { method: 'POST', body: '{}' });
    token = '';
    setLease('offline');
  } catch (error) {
    showError(error);
  }
}

async function submitGenerate() {
  clearError();
  const quantity = Number($('quantity').value);
  if (!state.selection.profileIds.length || !state.selection.formatId) return showError({ code: 'SELECTION_REQUIRED' });
  if (!state.selection.styleIds.length) return showError({ code: 'STYLES_INVALID' });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return showError({ code: 'QUANTITY_INVALID' });

  const payload = {
    profileIds: state.selection.profileIds,
    styleIds: state.selection.styleIds,
    formatId: state.selection.formatId,
    orientation: state.selection.orientation,
    extraPrompt: $('prompt').value,
    quantity,
  };
  if (payload.formatId === CUSTOM_FORMAT_ID) {
    const customFormat = readCustomFormat();
    if (customFormat.code) return showError({ code: customFormat.code });
    payload.customFormat = customFormat.value;
  }

  try {
    state.selection.quantity = quantity;
    state.job = null;
    state.batch = null;
    state.resultUrls = [];
    renderResults();
    state.submitting = true;
    state.busy = true;
    $('loading-overlay').hidden = false;
    $('loading-title').textContent = t('loading.generate');
    $('loading-status-text').textContent = t('loading.preparing');
    $('task-state').textContent = `${t('task.generate')}: ${t('loading.preparing')}`;
    renderLock();
    const { batchId, jobs } = await api('/api/jobs/generate', { method: 'POST', body: JSON.stringify(payload) });
    state.submitting = false;
    state.batch = createBatchState(batchId, jobs);
    batchStatusMessage();
    await reconcileBatchJobs();
  } catch (error) {
    state.submitting = false;
    if (!state.batch) {
      state.busy = false;
      $('loading-overlay').hidden = true;
      renderLock();
    }
    showError(error);
  }
}

async function submitProfile() {
  clearError();
  const method = document.querySelector('input[name="profile-method"]:checked')?.value || 'photos';
  try {
    state.batch = null;
    if (method === 'prompt') {
      const description = $('profile-prompt').value.trim();
      if (!description) return showError({ code: 'PROFILE_PROMPT_REQUIRED' });
      state.job = await api('/api/jobs/profile-prompt', {
        method: 'POST',
        body: JSON.stringify({ name: $('profile-name').value.trim(), description }),
      });
    } else {
      state.job = await api('/api/jobs/profile', { method: 'POST', body: JSON.stringify({ inputId: $('input-id').value }) });
    }
    $('profile-dialog').close();
    handleSingleJob(state.job);
  } catch (error) {
    showError(error, method === 'photos' ? 'suggestion.photos' : 'suggestion.prompt');
  }
}

async function deleteProfile(profileId) {
  clearError();
  if (!window.confirm(t('confirm.deleteProfile', { name: profileId }))) return;
  try {
    await api(`/api/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
    state.selection.profileIds = state.selection.profileIds.filter((id) => id !== profileId);
    await refreshCatalog();
    await refreshHistory();
  } catch (error) {
    showError(error, 'suggestion.refresh');
  }
}

async function deleteStyle(styleId) {
  clearError();
  if (!window.confirm(t('confirm.deleteStyle', { name: styleLabel(state.catalog.styles.find((item) => item.id === styleId) || { id: styleId, name: styleId }) }))) return;
  try {
    await api(`/api/styles/${encodeURIComponent(styleId)}`, { method: 'DELETE' });
    state.selection.styleIds = state.selection.styleIds.filter((id) => id !== styleId);
    await refreshCatalog();
  } catch (error) {
    showError(error, 'suggestion.style');
  }
}

async function submitStyle(event) {
  event.preventDefault();
  clearError();
  const prompt = $('style-prompt').value.trim();
  if (!prompt) return showError({ code: 'STYLE_PROMPT_INVALID' });
  try {
    state.batch = null;
    state.job = await api('/api/jobs/style', { method: 'POST', body: JSON.stringify({ prompt }) });
    $('style-dialog').close();
    handleSingleJob(state.job);
  } catch (error) {
    showError(error, 'suggestion.style');
  }
}

function applyColumnRatio(ratio) {
  state.columnRatio = normalizeColumnRatio(ratio);
  const root = document.documentElement;
  root.style.setProperty('--people-track', `${state.columnRatio[0]}fr`);
  root.style.setProperty('--style-track', `${state.columnRatio[1]}fr`);
  root.style.setProperty('--output-track', `${state.columnRatio[2]}fr`);
}

function saveColumnRatio() {
  try { localStorage.setItem('photoclub.columnRatio', JSON.stringify(state.columnRatio)); } catch { /* Storage can be disabled. */ }
}

function setupColumnSeparators() {
  for (const separator of document.querySelectorAll('.column-separator')) {
    const boundary = Number(separator.dataset.boundary);
    separator.addEventListener('pointerdown', (event) => {
      if (matchMedia('(max-width: 1100px)').matches) return;
      const startX = event.clientX;
      const startRatio = [...state.columnRatio];
      const width = $('profiles').closest('main').clientWidth;
      separator.setPointerCapture(event.pointerId);
      const move = (moveEvent) => applyColumnRatio(dragBoundary(startRatio, boundary, (moveEvent.clientX - startX) / width));
      separator.addEventListener('pointermove', move);
      separator.addEventListener('pointerup', () => { separator.removeEventListener('pointermove', move); saveColumnRatio(); }, { once: true });
    });
    separator.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      applyColumnRatio(dragBoundary(state.columnRatio, boundary, event.key === 'ArrowRight' ? 0.02 : -0.02));
      saveColumnRatio();
    });
  }
}

function applyLanguage(language) {
  state.language = normalizeLanguage(language);
  try { localStorage.setItem('photoclub.language', state.language); } catch { /* Storage can be disabled. */ }
  document.documentElement.lang = LANGUAGE_LOCALES[state.language];
  document.title = t('app.title');
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = t(element.dataset.i18nPlaceholder);
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  for (const element of document.querySelectorAll('[data-i18n-alt]')) element.alt = t(element.dataset.i18nAlt);
  $('language').value = state.language;
  setLease(state.lease);
  if (state.catalog) renderCatalog();
  if (state.batch) batchStatusMessage();
  else if (state.job) renderJobStatus();
  renderResults();
}

function setProfileMethod(method) {
  const photos = method === 'photos';
  $('profile-photos-fields').hidden = !photos;
  $('profile-prompt-fields').hidden = photos;
  $('open-input').hidden = !photos;
}

async function start() {
  try {
    const lease = await api('/api/lease/acquire', { method: 'POST', body: JSON.stringify({ clientId }) });
    if (lease.status !== 'owned') return setLease('occupied');
    token = lease.token;
    setLease('owned');
    await refreshCatalog();
    await refreshHistory();
    const events = new EventSource('/api/events');
    events.onopen = () => {
      if (state.batch) reconcileBatchJobs().catch((error) => showError(error, 'suggestion.job'));
    };
    events.onmessage = (event) => handleEventJob(JSON.parse(event.data).job);
    events.onerror = () => {
      if (state.lease === 'owned') $('connection').textContent = t('connection.retrying');
    };
    heartbeatTimer = setInterval(async () => {
      try {
        const result = await api('/api/lease/heartbeat', { method: 'POST', body: JSON.stringify({ clientId, token }) });
        if (result.status !== 'owned') setLease('occupied');
      } catch {
        setLease('offline');
      }
    }, 5_000);
  } catch (error) {
    setLease('offline');
    showError(error, 'suggestion.restart');
  }
}

$('language').addEventListener('change', (event) => applyLanguage(event.target.value));
$('shutdown').addEventListener('click', shutdownService);
$('generate').addEventListener('click', submitGenerate);
$('quantity').addEventListener('input', clearError);
$('custom-short-edge').addEventListener('input', clearError);
$('custom-long-edge').addEventListener('input', clearError);
$('style-select-all').addEventListener('click', () => {
  clearError();
  state.styleSelectionTouched = true;
  state.selection.styleIds = toggleAllVisible(state.selection.styleIds, visibleStyleItems().map((item) => item.id));
  renderStyles();
  renderSummary();
});
$('style-only-new').addEventListener('click', () => {
  clearError();
  state.selection.onlyUngenerated = !state.selection.onlyUngenerated;
  renderStyles();
});
$('orientations').addEventListener('change', (event) => {
  if (event.target.name === 'orientation') {
    state.selection.orientation = event.target.value;
    renderSummary();
  }
});
$('profile-open').addEventListener('click', () => $('profile-dialog').showModal());
$('style-open').addEventListener('click', () => $('style-dialog').showModal());
$('style-close').addEventListener('click', () => $('style-dialog').close());
$('style-cancel').addEventListener('click', () => $('style-dialog').close());
$('style-form').addEventListener('submit', submitStyle);
$('help-open').addEventListener('click', () => $('help-dialog').showModal());
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('profile-close').addEventListener('click', () => $('profile-dialog').close());
$('profile-cancel').addEventListener('click', () => $('profile-dialog').close());
$('profile-generate').addEventListener('click', submitProfile);
$('profile-dialog').addEventListener('change', (event) => {
  if (event.target.name === 'profile-method') setProfileMethod(event.target.value);
});
$('profile-form').addEventListener('submit', (event) => event.preventDefault());
$('cancel').addEventListener('click', cancelCurrentJob);
$('loading-cancel').addEventListener('click', cancelCurrentJob);
$('result-dialog-close').addEventListener('click', () => $('result-dialog').close());
$('result-dialog').addEventListener('click', (event) => {
  if (event.target === $('result-dialog')) $('result-dialog').close();
});
$('open-output').addEventListener('click', () => api('/api/open-output', { method: 'POST', body: '{}' }).catch(showError));
$('open-input').addEventListener('click', () => api('/api/open-input', { method: 'POST', body: '{}' }).catch(showError));
$('history-refresh').addEventListener('click', () => refreshHistory().catch(showError));
$('lan-mode').addEventListener('change', async (event) => {
  try {
    await api('/api/network', { method: 'POST', body: JSON.stringify({ lan: event.target.checked }) });
    $('connection').textContent = t('connection.switching');
  } catch (error) {
    event.target.checked = !event.target.checked;
    showError(error);
  }
});
window.addEventListener('pagehide', () => {
  clearInterval(heartbeatTimer);
  if (token) navigator.sendBeacon('/api/lease/release', JSON.stringify({ clientId, token }));
});

applyLanguage(state.language);
applyColumnRatio(state.columnRatio);
setupColumnSeparators();
start();

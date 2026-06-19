import { LANGUAGE_LOCALES, normalizeLanguage, translate } from './i18n.mjs';

function savedLanguage() {
  try { return localStorage.getItem('photoclub.language'); } catch { return null; }
}

const state = {
  lease: 'connecting', busy: false, catalog: null,
  selection: { profileIds: [], styleId: '', formatId: '', orientation: 'portrait', prompt: '', quantity: 1 },
  job: null, resultUrls: [], language: normalizeLanguage(savedLanguage()),
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

function clearError() { $('error').hidden = true; $('error').textContent = ''; }

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
  if (token) { headers['x-client-id'] = clientId; headers['x-lease-token'] = token; }
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw body;
  return body;
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
  $('cancel').disabled = !state.busy;
  $('cancel').hidden = !state.busy;
  $('loading-cancel').disabled = !state.busy;
  $('shutdown').disabled = state.lease !== 'owned';
}

function choice(kind, item, checked, mediaClass, imageUrl, label) {
  const element = document.createElement('label');
  element.className = 'choice';
  const input = document.createElement('input');
  input.type = kind === 'profile' ? 'checkbox' : 'radio'; input.name = kind; input.value = item.id; input.checked = checked;
  input.addEventListener('change', () => {
    clearError();
    if (kind === 'profile') {
      state.selection.profileIds = input.checked
        ? [...new Set([...state.selection.profileIds, item.id])]
        : state.selection.profileIds.filter((profileId) => profileId !== item.id);
    } else {
      state.selection[`${kind}Id`] = item.id;
    }
    renderSummary();
  });
  const media = document.createElement('span'); media.className = mediaClass;
  const image = document.createElement('img'); image.src = `${imageUrl}?v=${Date.now()}`; image.alt = label;
  media.append(image);
  const name = document.createElement('span'); name.className = 'choice-name'; name.textContent = label;
  if (kind !== 'profile') { element.append(input, media, name); return element; }
  element.append(input, media);
  const wrapper = document.createElement('div'); wrapper.className = 'choice-wrap';
  const footer = document.createElement('div'); footer.className = 'choice-footer';
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'profile-delete'; remove.textContent = t('button.delete');
  remove.title = t('aria.deleteProfile', { name: item.id }); remove.setAttribute('aria-label', remove.title);
  remove.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); deleteProfile(item.id); });
  footer.append(name, remove);
  wrapper.append(element, footer);
  return wrapper;
}

function renderCatalog() {
  const { profiles, styles, formats, inputs, issues } = state.catalog;
  state.selection.profileIds = state.selection.profileIds.filter((profileId) => profiles.some((item) => item.id === profileId));
  if (!state.selection.profileIds.length && profiles.length) state.selection.profileIds = [profiles[0].id];
  if (!styles.some((item) => item.id === state.selection.styleId)) state.selection.styleId = styles[0]?.id || '';
  if (!formats.some((item) => item.id === state.selection.formatId)) state.selection.formatId = formats[0]?.id || '';
  $('profile-count').textContent = t(profiles.length === 1 ? 'count.peopleOne' : 'count.people', { count: profiles.length });
  $('style-count').textContent = t(styles.length === 1 ? 'count.stylesOne' : 'count.styles', { count: styles.length });
  $('profiles').replaceChildren(...(profiles.length ? profiles.map((item) => choice('profile', item, state.selection.profileIds.includes(item.id), 'profile-media', item.imageUrl, item.id)) : [empty(t('empty.profiles'))]));
  $('styles').replaceChildren(...(styles.length ? styles.map((item) => choice('style', item, item.id === state.selection.styleId, 'style-media', item.thumbnailUrl, styleLabel(item))) : [empty(t('empty.styles'))]));
  $('formats').replaceChildren(...formats.map((item) => {
    const label = document.createElement('label'); label.className = 'segment';
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'format'; input.value = item.id; input.checked = item.id === state.selection.formatId;
    input.addEventListener('change', () => { clearError(); state.selection.formatId = item.id; renderSummary(); });
    const displayName = item.id === 'jp_711_photo_l_1051x1500'
      ? '7-Eleven L'
      : item.id === 'jp_711_photo_2l_1500x2102' ? '7-Eleven 2L' : item.label;
    const span = document.createElement('span'); span.textContent = `${displayName} ${item.width}×${item.height}`;
    label.append(input, span); return label;
  }));
  $('input-id').replaceChildren(...inputs.map((item) => new Option(item.id, item.id)));
  if (issues.length) showError({ error: issues[0] }, 'suggestion.style');
  renderSummary(); renderLock();
}

function empty(text) { const node = document.createElement('div'); node.className = 'empty'; node.textContent = text; return node; }

function styleLabel(item) { return t(`style.${item.id}`, {}, item.name); }

function renderSummary() {
  const selectedStyle = state.catalog?.styles.find((item) => item.id === state.selection.styleId);
  const style = selectedStyle ? styleLabel(selectedStyle) : t('summary.noStyle');
  const people = state.selection.profileIds.length ? state.selection.profileIds.join(' + ') : t('summary.noPeople');
  const orientation = t(state.selection.orientation === 'landscape' ? 'field.landscape' : 'field.portrait');
  $('selection-summary').textContent = `${people} / ${style} / ${orientation}`;
}

async function refreshCatalog() { state.catalog = await api('/api/catalog'); renderCatalog(); }

function handleJob(job) {
  if (state.job && job.id !== state.job.id) return;
  state.job = job;
  $('task-state').textContent = `${t(job.type === 'profile' ? 'task.profile' : 'task.generate')}: ${t(`status.${job.status}`, {}, job.status)}`;
  state.busy = ['queued', 'running'].includes(job.status);
  $('loading-overlay').hidden = !state.busy;
  $('loading-title').textContent = t(job.type === 'profile' ? 'loading.profile' : 'loading.generate');
  $('loading-status-text').textContent = t(job.status === 'queued' ? 'loading.queued' : 'loading.running');
  if (job.status === 'succeeded') {
    clearError();
    const outputUrls = job.result?.outputUrls ?? (job.result?.outputUrl ? [job.result.outputUrl] : []);
    if (outputUrls.length) {
      state.resultUrls = outputUrls.map((outputUrl) => `${outputUrl}?v=${Date.now()}`);
      $('result').replaceChildren(...state.resultUrls.map((resultUrl, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'result-preview';
        button.setAttribute('aria-label', t('aria.viewResult', { index: index + 1 }));
        const image = new Image(); image.src = resultUrl; image.alt = t('result.alt', { index: index + 1 });
        button.append(image);
        button.addEventListener('click', () => {
          $('result-dialog-image').src = resultUrl;
          $('result-dialog-image').alt = t('result.previewAlt', { index: index + 1 });
          $('result-dialog').showModal();
        });
        return button;
      }));
    }
    refreshCatalog().catch(showError);
  } else if (job.status === 'failed') showError(job.error, 'suggestion.job');
  renderLock();
}

async function cancelCurrentJob() {
  if (state.job) await api(`/api/jobs/${state.job.id}`, { method: 'DELETE' }).catch(showError);
}

async function shutdownService() {
  if (!window.confirm(t('confirm.shutdown'))) return;
  clearInterval(heartbeatTimer);
  try {
    await api('/api/shutdown', { method: 'POST', body: '{}' });
    token = '';
    setLease('offline');
  } catch (error) { showError(error); }
}

async function submitGenerate() {
  clearError();
  const quantity = Number($('quantity').value);
  if (!state.selection.profileIds.length || !state.selection.styleId || !state.selection.formatId) return showError({ code: 'SELECTION_REQUIRED' });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return showError({ code: 'QUANTITY_INVALID' });
  try {
    state.selection.quantity = quantity;
    state.job = await api('/api/jobs/generate', { method: 'POST', body: JSON.stringify({ ...state.selection, extraPrompt: $('prompt').value, quantity }) });
    state.busy = true; handleJob(state.job);
  } catch (error) { showError(error); }
}

async function submitProfile() {
  clearError();
  const method = document.querySelector('input[name="profile-method"]:checked')?.value || 'photos';
  try {
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
    $('profile-dialog').close(); state.busy = true; handleJob(state.job);
  } catch (error) { showError(error, method === 'photos' ? 'suggestion.photos' : 'suggestion.prompt'); }
}

async function deleteProfile(profileId) {
  clearError();
  if (!window.confirm(t('confirm.deleteProfile', { name: profileId }))) return;
  try {
    await api(`/api/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
    state.selection.profileIds = state.selection.profileIds.filter((id) => id !== profileId);
    await refreshCatalog();
  } catch (error) { showError(error, 'suggestion.refresh'); }
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
  if (state.job) {
    $('task-state').textContent = `${t(state.job.type === 'profile' ? 'task.profile' : 'task.generate')}: ${t(`status.${state.job.status}`, {}, state.job.status)}`;
    $('loading-title').textContent = t(state.job.type === 'profile' ? 'loading.profile' : 'loading.generate');
    $('loading-status-text').textContent = t(state.job.status === 'queued' ? 'loading.queued' : 'loading.running');
  }
  for (const [index, button] of [...document.querySelectorAll('.result-preview')].entries()) {
    button.setAttribute('aria-label', t('aria.viewResult', { index: index + 1 }));
    const image = button.querySelector('img');
    if (image) image.alt = t('result.alt', { index: index + 1 });
  }
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
    token = lease.token; setLease('owned');
    await refreshCatalog();
    const events = new EventSource('/api/events');
    events.onmessage = (event) => handleJob(JSON.parse(event.data).job);
    events.onerror = () => { if (state.lease === 'owned') $('connection').textContent = t('connection.retrying'); };
    heartbeatTimer = setInterval(async () => {
      try {
        const result = await api('/api/lease/heartbeat', { method: 'POST', body: JSON.stringify({ clientId, token }) });
        if (result.status !== 'owned') setLease('occupied');
      } catch { setLease('offline'); }
    }, 5_000);
  } catch (error) { setLease('offline'); showError(error, 'suggestion.restart'); }
}

$('language').addEventListener('change', (event) => applyLanguage(event.target.value));
$('shutdown').addEventListener('click', shutdownService);
$('generate').addEventListener('click', submitGenerate);
$('quantity').addEventListener('input', clearError);
$('orientations').addEventListener('change', (event) => {
  if (event.target.name === 'orientation') {
    state.selection.orientation = event.target.value;
    renderSummary();
  }
});
$('profile-open').addEventListener('click', () => $('profile-dialog').showModal());
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
$('result-dialog').addEventListener('click', (event) => { if (event.target === $('result-dialog')) $('result-dialog').close(); });
$('open-output').addEventListener('click', () => api('/api/open-output', { method: 'POST', body: '{}' }).catch(showError));
$('open-input').addEventListener('click', () => api('/api/open-input', { method: 'POST', body: '{}' }).catch(showError));
$('lan-mode').addEventListener('change', async (event) => {
  try { await api('/api/network', { method: 'POST', body: JSON.stringify({ lan: event.target.checked }) }); $('connection').textContent = t('connection.switching'); }
  catch (error) { event.target.checked = !event.target.checked; showError(error); }
});
window.addEventListener('pagehide', () => {
  clearInterval(heartbeatTimer);
  if (token) navigator.sendBeacon('/api/lease/release', JSON.stringify({ clientId, token }));
});

applyLanguage(state.language);
start();

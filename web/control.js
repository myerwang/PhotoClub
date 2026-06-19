const state = {
  lease: 'connecting', busy: false, catalog: null,
  selection: { profileIds: [], styleId: '', formatId: '', orientation: 'portrait', prompt: '', quantity: 1 },
  job: null, resultUrls: [],
};

const clientId = crypto.randomUUID();
let token = '';
let heartbeatTimer;
const $ = (id) => document.getElementById(id);

function errorMessage(error, fallback = '操作失败') {
  return error?.error?.message || error?.message || fallback;
}

function showError(error, suggestion = '请检查选择后重试。') {
  const node = $('error');
  const code = error?.error?.code || error?.code || 'UNKNOWN_ERROR';
  node.textContent = `${errorMessage(error)}（${code}） ${suggestion}`;
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
  node.textContent = ({ owned: '已连接，可操作', occupied: '控制台正被其他页面使用', offline: '连接已断开', connecting: '正在连接' })[status] || status;
  renderLock();
}

function renderLock() {
  const locked = state.busy || state.lease !== 'owned';
  document.body.classList.toggle('locked', locked);
  for (const element of document.querySelectorAll('input, textarea, select, button')) {
    if (['cancel', 'help-open', 'help-close', 'loading-cancel'].includes(element.id)) continue;
    element.disabled = locked;
  }
  $('cancel').disabled = !state.busy;
  $('cancel').hidden = !state.busy;
  $('loading-cancel').disabled = !state.busy;
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
  remove.type = 'button'; remove.className = 'profile-delete'; remove.textContent = '删除';
  remove.title = `删除人物 ${item.id}`; remove.setAttribute('aria-label', `删除人物 ${item.id}`);
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
  $('profile-count').textContent = `${profiles.length} 人`;
  $('style-count').textContent = `${styles.length} 种`;
  $('profiles').replaceChildren(...(profiles.length ? profiles.map((item) => choice('profile', item, state.selection.profileIds.includes(item.id), 'profile-media', item.imageUrl, item.id)) : [empty('尚无可用人物设定') ]));
  $('styles').replaceChildren(...(styles.length ? styles.map((item) => choice('style', item, item.id === state.selection.styleId, 'style-media', item.thumbnailUrl, item.name)) : [empty('尚无有效风格') ]));
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
  if (issues.length) showError({ error: issues[0] }, '对应风格已停用，请补齐配置。');
  renderSummary(); renderLock();
}

function empty(text) { const node = document.createElement('div'); node.className = 'empty'; node.textContent = text; return node; }

function renderSummary() {
  const style = state.catalog?.styles.find((item) => item.id === state.selection.styleId)?.name || '未选风格';
  const people = state.selection.profileIds.length ? state.selection.profileIds.join(' + ') : '未选人物';
  const orientation = state.selection.orientation === 'landscape' ? '横向' : '纵向';
  $('selection-summary').textContent = `${people} / ${style} / ${orientation}`;
}

async function refreshCatalog() { state.catalog = await api('/api/catalog'); renderCatalog(); }

function handleJob(job) {
  if (state.job && job.id !== state.job.id) return;
  state.job = job;
  const labels = { queued: '等待执行', running: '正在生成', succeeded: '生成完成', failed: '生成失败', cancelled: '已取消' };
  $('task-state').textContent = `${job.type === 'profile' ? '人物设定' : '照片生成'}：${labels[job.status] || job.status}`;
  state.busy = ['queued', 'running'].includes(job.status);
  $('loading-overlay').hidden = !state.busy;
  $('loading-title').textContent = job.type === 'profile' ? '正在生成人物设定' : '正在生成照片';
  $('loading-status').firstChild.textContent = job.status === 'queued' ? '等待执行' : '图像生成中';
  if (job.status === 'succeeded') {
    clearError();
    const outputUrls = job.result?.outputUrls ?? (job.result?.outputUrl ? [job.result.outputUrl] : []);
    if (outputUrls.length) {
      state.resultUrls = outputUrls.map((outputUrl) => `${outputUrl}?v=${Date.now()}`);
      $('result').replaceChildren(...state.resultUrls.map((resultUrl, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'result-preview';
        button.setAttribute('aria-label', `查看生成结果 ${index + 1} 大图`);
        const image = new Image(); image.src = resultUrl; image.alt = `生成结果 ${index + 1}`;
        button.append(image);
        button.addEventListener('click', () => {
          $('result-dialog-image').src = resultUrl;
          $('result-dialog-image').alt = `生成结果 ${index + 1} 大图预览`;
          $('result-dialog').showModal();
        });
        return button;
      }));
    }
    refreshCatalog().catch(showError);
  } else if (job.status === 'failed') showError(job.error, '展开任务状态并检查输入文件。');
  renderLock();
}

async function cancelCurrentJob() {
  if (state.job) await api(`/api/jobs/${state.job.id}`, { method: 'DELETE' }).catch(showError);
}

async function submitGenerate() {
  clearError();
  const quantity = Number($('quantity').value);
  if (!state.selection.profileIds.length || !state.selection.styleId || !state.selection.formatId) return showError({ code: 'SELECTION_REQUIRED', message: '请至少选择一个人物，并完整选择风格和格式' });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return showError({ code: 'QUANTITY_INVALID', message: '生成数量必须是 1 到 20 的整数' });
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
      if (!description) return showError({ code: 'PROFILE_PROMPT_REQUIRED', message: '请输入人物描述' });
      state.job = await api('/api/jobs/profile-prompt', {
        method: 'POST',
        body: JSON.stringify({ name: $('profile-name').value.trim(), description }),
      });
    } else {
      state.job = await api('/api/jobs/profile', { method: 'POST', body: JSON.stringify({ inputId: $('input-id').value }) });
    }
    $('profile-dialog').close(); state.busy = true; handleJob(state.job);
  } catch (error) { showError(error, method === 'photos' ? '请确认 input 目录内存在可用图片。' : '请检查人物名称和描述。'); }
}

async function deleteProfile(profileId) {
  clearError();
  if (!window.confirm(`确定删除人物“${profileId}”吗？\n只删除人物多视图，不删除 input 原始照片。`)) return;
  try {
    await api(`/api/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
    state.selection.profileIds = state.selection.profileIds.filter((id) => id !== profileId);
    await refreshCatalog();
  } catch (error) { showError(error, '请刷新人物列表后重试。'); }
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
    events.onerror = () => { if (state.lease === 'owned') $('connection').textContent = '事件连接正在重试'; };
    heartbeatTimer = setInterval(async () => {
      try {
        const result = await api('/api/lease/heartbeat', { method: 'POST', body: JSON.stringify({ clientId, token }) });
        if (result.status !== 'owned') setLease('occupied');
      } catch { setLease('offline'); }
    }, 5_000);
  } catch (error) { setLease('offline'); showError(error, '请重新启动控制台。'); }
}

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
  try { await api('/api/network', { method: 'POST', body: JSON.stringify({ lan: event.target.checked }) }); $('connection').textContent = '正在切换网络模式'; }
  catch (error) { event.target.checked = !event.target.checked; showError(error); }
});
window.addEventListener('pagehide', () => {
  clearInterval(heartbeatTimer);
  if (token) navigator.sendBeacon('/api/lease/release', JSON.stringify({ clientId, token, shutdown: true }));
});

start();

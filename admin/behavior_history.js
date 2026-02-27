const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'behavior_history_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';

const loginCard = document.getElementById('loginCard');
const loginOut = document.getElementById('loginOut');
const appShell = document.getElementById('appShell');
const viewerPill = document.getElementById('viewerPill');
const rolePill = document.getElementById('rolePill');
const summaryText = document.getElementById('summaryText');
const countPill = document.getElementById('countPill');
const resultsEl = document.getElementById('results');
const emptyStateEl = document.getElementById('emptyState');
const filtersForm = document.getElementById('filtersForm');
const qInput = document.getElementById('qInput');
const eventFilter = document.getElementById('eventFilter');
const actorFilterWrap = document.getElementById('actorFilterWrap');
const actorFilter = document.getElementById('actorFilter');
const deletedFilter = document.getElementById('deletedFilter');
const dateFromInput = document.getElementById('dateFrom');
const dateToInput = document.getElementById('dateTo');
const applyBtn = document.getElementById('applyBtn');
const resetBtn = document.getElementById('resetBtn');
const refreshBtn = document.getElementById('refreshBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMessageEl = document.getElementById('loadingMessage');
const loadingDetailEl = document.getElementById('loadingDetail');

let ACCESS = null;
let LAST_DATA = null;
let BUSY = false;

function show(el){ if (el) el.style.display = ''; }
function hide(el){ if (el) el.style.display = 'none'; }

function escapeHtml_(v){
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtDateTime(iso){
  const s = String(iso || '').trim();
  if (!s) return '—';
  try{
    return new Date(s).toLocaleString([], {
      year:'numeric', month:'short', day:'numeric',
      hour:'numeric', minute:'2-digit'
    });
  }catch{
    return s;
  }
}

function fmtDate(iso){
  const s = String(iso || '').trim();
  if (!s) return '—';
  return s;
}

function setControlLock(disabled){
  const root = appShell;
  if (!root) return;
  root.querySelectorAll('button, input, select, textarea').forEach(el => {
    if (disabled) {
      if (!el.hasAttribute('data-prev-disabled')) {
        el.setAttribute('data-prev-disabled', el.disabled ? '1' : '0');
      }
      el.disabled = true;
    } else {
      const prev = el.getAttribute('data-prev-disabled');
      if (prev == null) return;
      el.disabled = prev === '1';
      el.removeAttribute('data-prev-disabled');
    }
  });
}

function setBusy(isBusy, opts = {}){
  BUSY = !!isBusy;
  const message = String(opts?.message || 'Loading behaviors…').trim() || 'Loading behaviors…';
  const detail = String(opts?.detail || 'Filters and actions are temporarily locked until the refresh finishes.').trim()
    || 'Filters and actions are temporarily locked until the refresh finishes.';

  if (loadingMessageEl) loadingMessageEl.textContent = message;
  if (loadingDetailEl) loadingDetailEl.textContent = detail;
  if (loadingOverlay) loadingOverlay.setAttribute('aria-hidden', BUSY ? 'false' : 'true');
  if (appShell) appShell.setAttribute('aria-busy', BUSY ? 'true' : 'false');
  document.body.dataset.busy = BUSY ? '1' : '0';

  setControlLock(BUSY);
}

function getStoredAdminSessionSid(){
  try{
    return String(sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY) || '').trim();
  }catch{}
  return '';
}

function setStoredAdminSessionSid(sid){
  const v = String(sid || '').trim();
  if (!v) return;
  try{ sessionStorage.setItem(ADMIN_SESSION_KEY, v); }catch{}
  try{ localStorage.setItem(ADMIN_SESSION_KEY, v); }catch{}
}

function clearStoredAdminSessionSid(){
  try{ sessionStorage.removeItem(ADMIN_SESSION_KEY); }catch{}
  try{ localStorage.removeItem(ADMIN_SESSION_KEY); }catch{}
}

function stashAdminSessionFromResponse(resp){
  try{
    const sid = String(
      resp?.headers?.get(ADMIN_SESSION_HEADER) ||
      resp?.headers?.get('X-Admin-Session') ||
      ''
    ).trim();
    if (sid) setStoredAdminSessionSid(sid);
  }catch{}
}

async function adminFetch(pathOrUrl, init = {}){
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  const headers = new Headers(init.headers || {});
  const sid = getStoredAdminSessionSid();
  if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);

  const resp = await fetch(u, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store'
  });

  stashAdminSessionFromResponse(resp);

  if (resp.status === 401) {
    try {
      const j = await resp.clone().json().catch(() => null);
      const err = String(j?.error || '').toLowerCase();
      if (err === 'expired' || err === 'bad_session') clearStoredAdminSessionSid();
    } catch {}
  }
  return resp;
}

function fillSelect(el, items, placeholder, selected){
  if (!el) return;
  const prev = String(selected ?? '').trim();
  el.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholder || 'All';
  el.appendChild(ph);

  (items || []).forEach(item => {
    const opt = document.createElement('option');
    if (typeof item === 'string') {
      opt.value = item;
      opt.textContent = item;
    } else {
      opt.value = String(item?.value ?? item?.key ?? '');
      opt.textContent = String(item?.label ?? item?.value ?? item?.key ?? '');
    }
    el.appendChild(opt);
  });

  if (prev) el.value = prev;
}

function currentFilters(){
  const deleted = String(deletedFilter?.value || 'active').trim();
  return {
    q: String(qInput?.value || '').trim(),
    event_key: String(eventFilter?.value || '').trim(),
    actor_email: ACCESS?.viewer?.is_admin ? String(actorFilter?.value || '').trim() : '',
    include_deleted: (deleted === 'all') ? '1' : '',
    deleted_only: (deleted === 'deleted') ? '1' : '',
    date_from: String(dateFromInput?.value || '').trim(),
    date_to: String(dateToInput?.value || '').trim()
  };
}

function updateViewerUi(){
  const email = ACCESS?.email || ACCESS?.viewer?.email || '—';
  const role = ACCESS?.role || ACCESS?.viewer?.role || '—';
  viewerPill.textContent = email;
  rolePill.textContent = role;
  if (ACCESS?.role === 'admin') {
    show(actorFilterWrap);
  } else {
    hide(actorFilterWrap);
  }
}

function renderSummary(data){
  const counts = data?.counts || {};
  const viewer = data?.viewer || ACCESS || {};
  const isAdmin = !!viewer?.is_admin || String(viewer?.role || '').toLowerCase() === 'admin';
  const accessible = Number(counts.accessible || 0);
  const matched = Number(counts.matched || 0);
  const deletedMatched = Number(counts.deleted_matched || 0);
  const activeMatched = Number(counts.active_matched || 0);

  summaryText.textContent = isAdmin
    ? `Showing ${matched} matched behavior log${matched === 1 ? '' : 's'} across staff.`
    : `Showing your ${matched} matched behavior log${matched === 1 ? '' : 's'}.`;

  countPill.textContent = `${activeMatched} active • ${deletedMatched} deleted • ${accessible} accessible`;
}

function renderFilters(data){
  const opts = data?.filter_options || {};
  const eventItems = (opts.event_types || []).map(x => ({
    value: String(x?.key || ''),
    label: x?.label ? `${x.label}` : String(x?.key || '')
  }));
  fillSelect(eventFilter, eventItems, 'All behavior types', eventFilter.value);

  if ((ACCESS?.role || data?.viewer?.role) === 'admin') {
    const actors = (opts.actor_emails || []).map(x => ({ value: String(x || ''), label: String(x || '') }));
    fillSelect(actorFilter, actors, 'All staff emails', actorFilter.value);
  }
}

function cardMetaLine(row){
  const bits = [];
  if (row?.room) bits.push(`Room ${row.room}`);
  if (row?.period_local) bits.push(`Period ${row.period_local}`);
  if (row?.source) bits.push(row.source);
  if (row?.meta?.submenu) bits.push(`Menu: ${row.meta.submenu}`);
  if (row?.meta?.option) bits.push(`Option: ${row.meta.option}`);
  return bits.join(' • ');
}

function makeBadge(text, variant=''){
  const cls = `pill${variant ? ` pill--${variant}` : ''}`;
  return `<span class="${cls}">${escapeHtml_(text)}</span>`;
}

function renderRows(rows){
  resultsEl.innerHTML = '';
  const list = Array.isArray(rows) ? rows : [];
  emptyStateEl.style.display = list.length ? 'none' : '';

  list.forEach(row => {
    const card = document.createElement('article');
    card.className = 'behaviorCard' + (row?.is_deleted ? ' behaviorCard--deleted' : '');

    const deletedInfo = row?.is_deleted
      ? `<div class="deletedNote">Marked deleted ${escapeHtml_(fmtDateTime(row.deleted_at_iso))} by ${escapeHtml_(row.deleted_by_email || '—')}</div>`
      : '';

    card.innerHTML = `
      <div class="behaviorTop">
        <div>
          <div class="behaviorTitle">${escapeHtml_(row?.event_label || row?.event_key || 'Behavior')}</div>
          <div class="behaviorSub">${escapeHtml_(row?.student_name || 'Unknown Student')} <span class="mono">(${escapeHtml_(row?.osis || '—')})</span></div>
        </div>
        <div class="behaviorBadges">
          ${makeBadge(fmtDate(row?.date || ''))}
          ${row?.is_deleted ? makeBadge('Deleted', 'deleted') : makeBadge('Active', 'active')}
        </div>
      </div>

      <div class="metaRow">
        <div><strong>Logged:</strong> ${escapeHtml_(fmtDateTime(row?.when_iso || row?.logged_at_iso || ''))}</div>
        <div><strong>By:</strong> ${escapeHtml_(row?.actor_email || '—')}</div>
      </div>

      <div class="metaRow metaRow--single">${escapeHtml_(cardMetaLine(row) || '—')}</div>
      ${deletedInfo}

      <label class="notesLabel" for="notes_${escapeHtml_(row.behavior_id)}">Notes</label>
      <textarea class="notesBox" id="notes_${escapeHtml_(row.behavior_id)}" data-behavior-id="${escapeHtml_(row.behavior_id)}" rows="3" placeholder="Add notes to this behavior...">${escapeHtml_(row?.notes || '')}</textarea>

      <div class="cardActions">
        <button type="button" class="btn btn--primary" data-act="save" data-behavior-id="${escapeHtml_(row.behavior_id)}">Save notes</button>
        <button type="button" class="btn ${row?.is_deleted ? 'btn--ghost' : 'btn--warn'}" data-act="${row?.is_deleted ? 'restore' : 'delete'}" data-behavior-id="${escapeHtml_(row.behavior_id)}">
          ${row?.is_deleted ? 'Restore' : 'Mark deleted'}
        </button>
      </div>
    `;

    resultsEl.appendChild(card);
  });
}

function applyBehaviorData(data){
  LAST_DATA = data;
  renderFilters(data);
  renderSummary(data);
  renderRows(data.rows || []);
}

async function fetchBehaviors(){
  const filters = currentFilters();
  const u = new URL('/admin/behavior/list', API_BASE);
  Object.entries(filters).forEach(([k,v]) => {
    if (v) u.searchParams.set(k, v);
  });
  u.searchParams.set('limit', '400');

  const r = await adminFetch(u, { method:'GET' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) {
    throw new Error(data?.error || `behavior/list HTTP ${r.status}`);
  }
  return data;
}

async function loadBehaviors(opts = {}){
  const useBusy = opts?.withBusy !== false;
  if (useBusy) {
    setBusy(true, {
      message: opts?.message || 'Loading filtered behaviors…',
      detail: opts?.detail || 'Filters and actions are temporarily locked until the refresh finishes.'
    });
  }

  try{
    const data = await fetchBehaviors();
    applyBehaviorData(data);
  }catch(e){
    resultsEl.innerHTML = '';
    emptyStateEl.style.display = '';
    emptyStateEl.textContent = `Could not load behaviors: ${e?.message || e}`;
  }finally{
    if (useBusy) setBusy(false);
  }
}

async function updateBehavior(payload){
  const r = await adminFetch('/admin/behavior/update', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify(payload || {})
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) {
    throw new Error(data?.error || `behavior/update HTTP ${r.status}`);
  }
  return data;
}

function rowByBehaviorId(id){
  const rows = LAST_DATA?.rows || [];
  return rows.find(r => String(r?.behavior_id || '') === String(id || '')) || null;
}

async function onResultsClick(ev){
  if (BUSY) return;

  const btn = ev.target?.closest?.('button[data-act]');
  if (!btn) return;

  const behaviorId = String(btn.getAttribute('data-behavior-id') || '').trim();
  const act = String(btn.getAttribute('data-act') || '').trim();
  if (!behaviorId || !act) return;

  const textarea = document.querySelector(`textarea[data-behavior-id="${CSS.escape(behaviorId)}"]`);

  btn.disabled = true;
  try{
    if (act === 'delete') {
      const ok = window.confirm('Mark this behavior as deleted? It will stay stored and can be restored later.');
      if (!ok) return;
    }

    const busyMap = {
      save: {
        message: 'Saving notes…',
        detail: 'Please wait while the behavior note is saved and the list refreshes.'
      },
      delete: {
        message: 'Marking behavior deleted…',
        detail: 'Please wait while this entry is moved out of the active view.'
      },
      restore: {
        message: 'Restoring behavior…',
        detail: 'Please wait while this deleted entry is restored.'
      }
    };

    setBusy(true, busyMap[act] || {
      message: 'Updating behavior…',
      detail: 'Please wait while the behavior list refreshes.'
    });

    if (act === 'save') {
      await updateBehavior({
        behaviorId,
        notes: String(textarea?.value || '')
      });
    } else if (act === 'delete') {
      await updateBehavior({
        behaviorId,
        isDeleted: true,
        deleteReason: 'ui_delete'
      });
    } else if (act === 'restore') {
      await updateBehavior({
        behaviorId,
        isDeleted: false
      });
    }

    await loadBehaviors({ withBusy:false });
  } catch (e) {
    alert(e?.message || String(e));
  } finally {
    setBusy(false);
    btn.disabled = false;
  }
}

async function waitForGoogle(timeoutMs = 15000){
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) throw new Error('Google Identity Services did not load in time.');
    await new Promise(r => setTimeout(r, 50));
  }
  return window.google.accounts.id;
}

async function renderLogin(){
  hide(appShell);
  show(loginCard);

  if (!GOOGLE_CLIENT_ID) {
    loginOut.textContent = 'Missing google-client-id meta.';
    return;
  }

  try{
    const gsi = await waitForGoogle();
    const wrap = document.getElementById('g_id_signin');
    if (wrap) wrap.innerHTML = '';
    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true
    });
    gsi.renderButton(document.getElementById('g_id_signin'), { theme:'outline', size:'large' });
    loginOut.textContent = '—';
  }catch(err){
    loginOut.textContent = `Google init failed: ${err?.message || err}`;
  }
}

async function onGoogleCredential(resp){
  try{
    loginOut.textContent = 'Signing in...';
    const r = await adminFetch('/admin/session/login_google', {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString()
    });

    const data = await r.json().catch(() => ({}));
    const sidFromHeader = (r.headers.get('x-admin-session') || r.headers.get('X-Admin-Session') || '').trim();
    const sidFromBody = typeof data?.sid === 'string' ? data.sid.trim() : '';
    if (sidFromBody) setStoredAdminSessionSid(sidFromBody);
    else if (sidFromHeader) setStoredAdminSessionSid(sidFromHeader);

    if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);

    await bootBehaviorHistory();
  }catch(e){
    hide(appShell);
    show(loginCard);
    loginOut.textContent = `Login failed: ${e?.message || e}`;
  }
}

async function bootBehaviorHistory(){
  try{
    const r = await adminFetch('/admin/access', { method:'GET' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);

    ACCESS = data;
    updateViewerUi();
    hide(loginCard);
    show(appShell);
    await loadBehaviors();
  }catch(e){
    clearStoredAdminSessionSid();
    await renderLogin();
  }
}

filtersForm?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  await loadBehaviors();
});

resetBtn?.addEventListener('click', async () => {
  if (qInput) qInput.value = '';
  if (eventFilter) eventFilter.value = '';
  if (actorFilter) actorFilter.value = '';
  if (deletedFilter) deletedFilter.value = 'active';
  if (dateFromInput) dateFromInput.value = '';
  if (dateToInput) dateToInput.value = '';
  await loadBehaviors();
});

refreshBtn?.addEventListener('click', async () => {
  await loadBehaviors();
});

resultsEl?.addEventListener('click', onResultsClick);

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => bootBehaviorHistory().catch(console.error));
} else {
  bootBehaviorHistory().catch(console.error);
}

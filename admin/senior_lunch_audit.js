const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'senior_lunch_audit_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';

const loginCard = document.getElementById('loginCard');
const loginOut = document.getElementById('loginOut');
const appShell = document.getElementById('appShell');
const viewerPill = document.getElementById('viewerPill');
const datePill = document.getElementById('datePill');
const subtitle = document.getElementById('subtitle');
const blockedCount = document.getElementById('blockedCount');
const violationsCount = document.getElementById('violationsCount');
const outCount = document.getElementById('outCount');
const blockedWrap = document.getElementById('blockedWrap');
const violationsWrap = document.getElementById('violationsWrap');
const outWrap = document.getElementById('outWrap');
const refreshBtn = document.getElementById('refreshBtn');
const errorCard = document.getElementById('errorCard');
const errorOut = document.getElementById('errorOut');

let ACCESS = null;
let REFRESH_TIMER = null;
let FORGIVING_OSIS = '';

function show(el){ if (el) el.style.display = ''; }
function hide(el){ if (el) el.style.display = 'none'; }

function getStoredAdminSessionSid(){
  try{
    return String(sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY) || '').trim();
  }catch{}
  return '';
}

function setStoredAdminSessionSid(sid){
  const v = String(sid || '').trim();
  if (!v) return;
  try { sessionStorage.setItem(ADMIN_SESSION_KEY, v); } catch {}
  try { localStorage.setItem(ADMIN_SESSION_KEY, v); } catch {}
}

function clearStoredAdminSessionSid(){
  try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch {}
  try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch {}
}

function stashAdminSessionFromResponse(resp){
  try{
    const sid = String(resp?.headers?.get(ADMIN_SESSION_HEADER) || resp?.headers?.get('X-Admin-Session') || '').trim();
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
      const data = await resp.clone().json().catch(() => null);
      const err = String(data?.error || '').toLowerCase();
      if (err === 'expired' || err === 'no_session' || err === 'bad_session') clearStoredAdminSessionSid();
    } catch {}
  }
  return resp;
}

function esc(v){
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtDate(iso){
  const s = String(iso || '').trim();
  return s || '—';
}

function fmtDateTime(iso){
  const s = String(iso || '').trim();
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString([], {
      year:'numeric', month:'short', day:'numeric',
      hour:'numeric', minute:'2-digit'
    });
  } catch {
    return s;
  }
}

function fmtMin(min){
  const n = Number(min);
  if (!Number.isFinite(n)) return '—';
  const h = Math.floor(n / 60);
  const m = n % 60;
  const hh = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function labelForViolation(value){
  const v = String(value || '').trim().toLowerCase();
  if (v === 'missing_scan_back') return 'Missing Scan Back';
  if (v === 'late_return') return 'Late Return';
  if (v === 'penalty_pending' || v === 'late_return_penalty') return 'Penalty Pending';
  return v ? v.replaceAll('_', ' ') : '—';
}

function tag(text, kind){
  return `<span class="tag ${esc(kind)}">${esc(text)}</span>`;
}

function setError(message){
  const text = String(message || '').trim();
  if (!text) {
    hide(errorCard);
    if (errorOut) errorOut.textContent = '';
    return;
  }
  if (errorOut) errorOut.textContent = text;
  show(errorCard);
}

function tableHtml(rows, columns, emptyText){
  if (!Array.isArray(rows) || !rows.length) return `<div class="empty">${esc(emptyText)}</div>`;
  const head = columns.map(col => `<th>${esc(col.label)}</th>`).join('');
  const body = rows.map(row => {
    const cells = columns.map(col => `<td>${col.render(row)}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function canForgivePenalty(row){
  return String(ACCESS?.role || '').toLowerCase() === 'admin' && !!row && (!!row.block_status || !!row.penalty_pending);
}

function forgiveButtonHtml(row){
  if (!canForgivePenalty(row)) return '';
  const osis = String(row.osis || '').trim();
  const busy = FORGIVING_OSIS === osis;
  return `<button class="btn forgiveBtn" type="button" data-osis="${esc(osis)}"${busy ? ' disabled' : ''}>${busy ? 'Forgiving…' : 'Forgive'}</button>`;
}

function renderBlocked(rows){
  blockedWrap.innerHTML = tableHtml(rows, [
    { label:'Student', render:r => `<div><strong>${esc(r.name || '—')}</strong></div><div class="mono muted">${esc(r.osis || '')}</div>` },
    { label:'Reason', render:r => tag(labelForViolation(r.block_reason), 'bad') },
    { label:'Status', render:r => tag(r.block_status === 'active_today' ? 'Blocked Today' : 'Pending Next Attempt Day', 'warn') },
    { label:'Last Violation', render:r => `<div>${esc(labelForViolation(r.last_violation_type))}</div><div class="mono muted">${esc(fmtDate(r.last_violation_date))}</div>` },
    { label:'Scheduled Now', render:r => `<div>${esc(r.current_period_local || '—')}</div><div class="mono muted">${esc(r.current_room || '—')}${r.current_room_is_caf ? ' • Caf' : ''}</div>` },
    { label:'Live State', render:r => `<div>${esc(r.live_zone || '—')}</div><div class="mono muted">${esc(r.live_label || '—')}</div>` },
    { label:'Action', render:r => forgiveButtonHtml(r) || '<span class="muted">—</span>' }
  ], 'No students are blocked today.');
}

function renderViolations(rows){
  violationsWrap.innerHTML = tableHtml(rows, [
    { label:'Student', render:r => `<div><strong>${esc(r.name || '—')}</strong></div><div class="mono muted">${esc(r.osis || '')}</div>` },
    { label:'Violation', render:r => tag(labelForViolation(r.violation_type), r.violation_type === 'missing_scan_back' ? 'bad' : (r.violation_type === 'late_return' ? 'warn' : 'info')) },
    { label:'When', render:r => `<div>${esc(fmtDate(r.violation_date))}</div><div class="mono muted">${esc(fmtDateTime(r.violation_at))}</div>` },
    { label:'Penalty', render:r => r.penalty_pending ? tag('Pending', 'bad') : tag('Cleared', 'good') },
    { label:'Scheduled Now', render:r => `<div>${esc(r.current_period_local || '—')}</div><div class="mono muted">${esc(r.current_room || '—')}${r.current_room_is_caf ? ' • Caf' : ''}</div>` },
    { label:'Live State', render:r => `<div>${esc(r.live_zone || '—')}</div><div class="mono muted">${esc(r.live_label || '—')}</div>` },
    { label:'Action', render:r => forgiveButtonHtml(r) || '<span class="muted">—</span>' }
  ], 'No late returns or missing scan-backs recorded.');
}

function renderCurrentlyOut(rows){
  outWrap.innerHTML = tableHtml(rows, [
    { label:'Student', render:r => `<div><strong>${esc(r.name || '—')}</strong></div><div class="mono muted">${esc(r.osis || '')}</div>` },
    { label:'Out Since', render:r => `<div>${esc(fmtDateTime(r.out_since))}</div><div class="mono muted">${esc(r.out_period_id || '—')}</div>` },
    { label:'Expected Back', render:r => `<div>${esc(fmtMin(r.out_period_end_min))}</div><div>${r.return_overdue ? tag('Overdue', 'bad') : tag('Still In Window', 'info')}</div>` },
    { label:'Scheduled Now', render:r => `<div>${esc(r.current_period_local || '—')}</div><div class="mono muted">${esc(r.current_room || '—')}${r.current_room_is_caf ? ' • Caf' : ''}</div>` },
    { label:'Live State', render:r => `<div>${esc(r.live_zone || '—')}</div><div class="mono muted">${esc(r.live_label || '—')}</div>` }
  ], 'No students are currently out for senior lunch.');
}

async function fetchAccess(){
  const resp = await adminFetch('/admin/access', { method:'GET' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.ok) throw new Error(data?.error || `access HTTP ${resp.status}`);
  return data;
}

async function fetchAudit(){
  const resp = await adminFetch('/admin/senior_outin_audit', { method:'GET' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.ok) throw new Error(data?.error || `senior_outin_audit HTTP ${resp.status}`);
  return data;
}

async function forgivePenalty(osis){
  const code = String(osis || '').trim();
  if (!code) return;
  FORGIVING_OSIS = code;
  setError('');
  try {
    const resp = await adminFetch('/admin/senior_outin_forgive', {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ osis: code }).toString()
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) throw new Error(data?.error || `senior_outin_forgive HTTP ${resp.status}`);
    await refreshAudit();
  } catch (err) {
    setError(err?.message || err);
  } finally {
    FORGIVING_OSIS = '';
  }
}

function renderAudit(data){
  viewerPill.textContent = `${ACCESS?.email || '—'}${ACCESS?.role ? ` (${ACCESS.role})` : ''}`;
  datePill.textContent = data?.date || '—';
  subtitle.textContent = data?.scheduled_period_local
    ? `Schedule context: ${data.scheduled_kind === 'next' ? 'next' : 'current'} period ${data.scheduled_period_local}.`
    : 'No active lunch-period schedule context right now.';
  blockedCount.textContent = String(data?.counts?.blocked_today || 0);
  violationsCount.textContent = String(data?.counts?.last_violations || 0);
  outCount.textContent = String(data?.counts?.currently_out || 0);
  renderBlocked(data?.blocked_today || []);
  renderViolations(data?.last_violations || []);
  renderCurrentlyOut(data?.currently_out || []);
}

async function refreshAudit(){
  setError('');
  refreshBtn.disabled = true;
  subtitle.textContent = 'Refreshing…';
  try {
    if (!ACCESS) ACCESS = await fetchAccess();
    const data = await fetchAudit();
    renderAudit(data);
  } catch (err) {
    setError(err?.message || err);
    subtitle.textContent = 'Refresh failed.';
  } finally {
    refreshBtn.disabled = false;
  }
}

function startPolling(){
  if (REFRESH_TIMER) clearInterval(REFRESH_TIMER);
  REFRESH_TIMER = setInterval(refreshAudit, 30000);
}

async function onGoogleCredential(resp){
  try {
    loginOut.textContent = 'Signing in…';
    const r = await adminFetch('/admin/session/login_google', {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString()
    });
    const data = await r.json().catch(() => ({}));
    if (data?.sid) setStoredAdminSessionSid(String(data.sid));
    if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    hide(loginCard);
    show(appShell);
    ACCESS = await fetchAccess();
    await refreshAudit();
    startPolling();
  } catch (err) {
    show(loginCard);
    hide(appShell);
    loginOut.textContent = `Login failed: ${err?.message || err}`;
  }
}

async function tryBootstrapSession(){
  try {
    const r = await adminFetch('/admin/session/check', { method:'GET' });
    if (!r.ok) return false;
    const data = await r.json().catch(() => null);
    if (!data?.ok) return false;
    hide(loginCard);
    show(appShell);
    ACCESS = await fetchAccess();
    await refreshAudit();
    startPolling();
    return true;
  } catch {
    return false;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  refreshBtn?.addEventListener('click', refreshAudit);
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.forgiveBtn');
    if (!btn) return;
    const osis = String(btn.getAttribute('data-osis') || '').trim();
    if (!osis) return;
    forgivePenalty(osis);
  });
  if (await tryBootstrapSession()) return;
  if (!GOOGLE_CLIENT_ID) {
    show(loginCard);
    hide(appShell);
    loginOut.textContent = 'Missing google-client-id meta.';
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      const started = Date.now();
      (function waitForGoogle(){
        if (window.google?.accounts?.id) return resolve();
        if (Date.now() - started > 8000) return reject(new Error('Google script failed to load'));
        setTimeout(waitForGoogle, 50);
      })();
    });
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true
    });
    google.accounts.id.renderButton(document.getElementById('g_id_signin'), { theme:'outline', size:'large' });
    show(loginCard);
    hide(appShell);
    loginOut.textContent = '—';
  } catch (err) {
    show(loginCard);
    hide(appShell);
    loginOut.textContent = `Google init failed: ${err?.message || err}`;
  }
});

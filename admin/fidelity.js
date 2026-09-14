const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY = 'teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';

const loginCard = document.getElementById('loginCard');
const loginOut = document.getElementById('loginOut');
const appShell = document.getElementById('appShell');
const dateInput = document.getElementById('dateInput');
const loadBtn = document.getElementById('loadBtn');
const todayBtn = document.getElementById('todayBtn');
const refreshBtn = document.getElementById('refreshBtn');
const statusText = document.getElementById('statusText');
const summaryCards = document.getElementById('summaryCards');
const roomPeriodBody = document.getElementById('roomPeriodBody');
const teacherHealthBody = document.getElementById('teacherHealthBody');
const deviceBody = document.getElementById('deviceBody');
const exceptionBody = document.getElementById('exceptionBody');
const kioskHealthSummary = document.getElementById('kioskHealthSummary');
const errorBox = document.getElementById('errorBox');
let expectedKioskVersion = '';
let refreshTimer = null;
let googleIdentityScriptPromise = null;

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function localTodayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString([], {month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function getStoredAdminSessionSid() {
  try { return String(sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY) || sessionStorage.getItem(ADMIN_SESSION_LEGACY_KEY) || localStorage.getItem(ADMIN_SESSION_LEGACY_KEY) || '').trim(); } catch { return ''; }
}
function setStoredAdminSessionSid(sid) {
  const value = String(sid || '').trim();
  try {
    for (const key of [ADMIN_SESSION_KEY, ADMIN_SESSION_LEGACY_KEY]) {
      if (value) { sessionStorage.setItem(key, value); localStorage.setItem(key, value); }
      else { sessionStorage.removeItem(key); localStorage.removeItem(key); }
    }
  } catch {}
}
async function adminFetch(pathOrUrl, init = {}) {
  const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  const headers = new Headers(init.headers || {});
  const sid = getStoredAdminSessionSid();
  if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
  const resp = await fetch(url, {...init, headers, credentials:'include', cache:'no-store'});
  const nextSid = String(resp.headers.get('x-admin-session') || '').trim();
  if (nextSid) setStoredAdminSessionSid(nextSid);
  if (resp.status === 401) {
    try { const j = await resp.clone().json(); if (j?.error === 'expired' || j?.error === 'no_session') setStoredAdminSessionSid(''); } catch {}
  }
  return resp;
}
function setError(message='') {
  const text = String(message || '').trim();
  errorBox.textContent = text;
  errorBox.style.display = text ? 'block' : 'none';
}
function setBusy(on, message='') {
  for (const el of [dateInput, loadBtn, todayBtn, refreshBtn]) if (el) el.disabled = !!on;
  statusText.textContent = message || (on ? 'Loading…' : 'Ready');
}
function chip(text, kind='') { return `<span class="chip ${kind}">${esc(text)}</span>`; }
function statusChip(status) {
  if (status === 'healthy') return chip('Healthy','ok');
  if (status === 'missing_evidence') return chip('Missing evidence','bad');
  if (status === 'needs_attention') return chip('Needs attention','warn');
  return chip('Observed','info');
}
function renderSummary(counts={}, selectedDate='') {
  const historical = !!selectedDate && selectedDate !== localTodayKey();
  const cards = [
    [
      historical ? 'Devices observed' : 'Devices active',
      historical ? (counts.devices ?? 0) : (counts.devices_active ?? 0),
      historical ? 'seen on selected date' : `${counts.devices_stale ?? 0} stale`
    ],
    ['Pending queues', counts.devices_with_pending ?? 0, 'devices with unsent scans'],
    ['Healthy periods', counts.healthy_room_periods ?? 0, `${counts.expected_room_periods ?? 0} expected`],
    ['Need attention', counts.needs_attention_room_periods ?? 0, 'partial / error evidence'],
    ['Missing evidence', counts.missing_evidence_room_periods ?? 0, 'no scans + no attendance'],
    ['Teachers clear', counts.healthy_teachers ?? 0, `${counts.teachers ?? 0} scheduled teachers`],
    ['Teacher follow-up', counts.teachers_needing_attention ?? 0, counts.unassigned_teacher_periods ? `${counts.unassigned_teacher_periods} expected periods unassigned` : 'missing attendance / fidelity flags'],
    ['Exceptions', counts.exceptions ?? 0, 'for selected date']
  ];
  summaryCards.innerHTML = cards.map(([title,big,small]) => `<div class="card"><h2>${esc(title)}</h2><div class="big">${esc(big)}</div><div class="small">${esc(small)}</div></div>`).join('');
}
function renderRoomPeriods(rows=[]) {
  roomPeriodBody.innerHTML = rows.length ? rows.map(row => {
    const teachers = (row.teachers || []).join(', ') || '—';
    const sections = (row.sections || []).map(x => x?.code || x?.name || '').filter(Boolean).join(', ') || '—';
    return `<tr><td class="mono">${esc(row.period_local || '')}</td><td>${esc(row.room || '')}</td><td>${esc(teachers)}</td><td>${esc(sections)}</td><td>${esc(row.expected_students ?? 0)}</td><td>${esc(row.scan_success_count ?? 0)}${row.manual_scan_count ? `<div class="muted">${esc(row.manual_scan_count)} manual</div>`:''}</td><td>${esc(row.teacher_submit_count ?? 0)}</td><td>${statusChip(row.status)}</td><td>${(row.flags||[]).length ? (row.flags||[]).map(x=>chip(x,/no |not |error/i.test(x)?'warn':'info')).join('') : chip('None','ok')}</td></tr>`;
  }).join('') : `<tr><td colspan="9" class="empty">No room/period health rows for this date yet.</td></tr>`;
}

function renderTeacherHealth(rows=[]) {
  teacherHealthBody.innerHTML = rows.length ? rows.map(row => {
    const periods = Array.isArray(row.periods) ? row.periods : [];
    const followUp = periods.filter(period =>
      Number(period.teacher_submit_count || 0) <= 0 ||
      Number(period.teacher_submit_error_count || 0) > 0 ||
      Number(period.scan_success_count || 0) <= 0 ||
      Number(period.scan_error_count || 0) > 0
    );

    const followUpHtml = followUp.length ? followUp.map(period => {
      const sections = (period.sections || []).join(', ');
      const reasons = [];
      if (Number(period.teacher_submit_count || 0) <= 0) reasons.push('attendance');
      if (Number(period.teacher_submit_error_count || 0) > 0) reasons.push('submit error');
      if (Number(period.scan_success_count || 0) <= 0) reasons.push('no scans');
      if (Number(period.scan_error_count || 0) > 0) reasons.push('scan error');
      const label = `${period.period_local || '—'} • ${period.room || '—'}${sections ? ` • ${sections}` : ''} — ${reasons.join(', ')}`;
      return chip(label, reasons.some(reason => /error|attendance/.test(reason)) ? 'warn' : 'info');
    }).join('') : chip('None','ok');

    const attendancePct = Number(row.attendance_coverage_pct || 0);
    const scanPct = Number(row.scan_coverage_pct || 0);

    return `<tr>
      <td><strong>${esc(row.teacher_name || '—')}</strong></td>
      <td>${esc(row.assigned_periods ?? 0)}</td>
      <td>${esc(row.periods_with_attendance ?? 0)} / ${esc(row.assigned_periods ?? 0)}<div class="muted">${esc(attendancePct)}%</div></td>
      <td>${Number(row.missing_attendance_periods || 0) > 0 ? chip(`${row.missing_attendance_periods} missing`,'bad') : chip('0','ok')}${Number(row.teacher_submit_error_count || 0) > 0 ? `<div class="muted">${esc(row.teacher_submit_error_count)} submit errors</div>` : ''}</td>
      <td>${esc(row.periods_with_scan_evidence ?? 0)} / ${esc(row.assigned_periods ?? 0)}<div class="muted">${esc(scanPct)}% • ${esc(row.scan_success_count ?? 0)} scans</div></td>
      <td>${esc(row.expected_student_periods ?? 0)}</td>
      <td>${statusChip(row.status)}</td>
      <td>${followUpHtml}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="8" class="empty">No scheduled teacher responsibility rows for this date yet.</td></tr>`;
}

function versionChip(row) {
  const reported = String(row.service_worker_version || '').trim();
  if (!reported) return chip('Not reporting','warn');
  if (!expectedKioskVersion) return chip(reported,'info');
  return reported === expectedKioskVersion ? chip('Current','ok') : chip('Old / mismatch','bad');
}
function renderDevices(rows=[], meta={}) {
  const staleAfter = Number(meta.stale_after_minutes || 20);
  const historical = !!meta.date && String(meta.date) !== localTodayKey();
  const stale = historical ? 0 : rows.filter(x => x.active_now === false).length;
  const pending = rows.filter(x => Number(x.pending_scan_count || 0) > 0).length;
  kioskHealthSummary.textContent = historical
    ? `${rows.length} device${rows.length===1?'':'s'} observed on selected date • ${pending} with pending scans${expectedKioskVersion ? ` • expected ${expectedKioskVersion}`:''}`
    : `${rows.length} device${rows.length===1?'':'s'} • ${stale} stale >${staleAfter}m • ${pending} with pending scans${expectedKioskVersion ? ` • expected ${expectedKioskVersion}`:''}`;
  deviceBody.innerHTML = rows.length ? rows.map(row => {
    const location = row.last_bound_location || row.last_reported_location || '—';
    const age = Number(row.last_seen_minutes_ago);
    const ageText = historical ? 'last seen that day' : (Number.isFinite(age) ? (age < 1 ? 'just now' : `${Math.round(age)}m ago`) : '—');
    const online = historical
      ? (row.online === false ? chip('Reported offline','bad') : row.online === true ? chip('Reported online','ok') : chip('Observed','info'))
      : (row.active_now === false ? chip('Stale','bad') : row.online === false ? chip('Offline','bad') : row.online === true ? chip('Online','ok') : chip('Unknown','warn'));
    const clock = Number.isFinite(Number(row.clock_offset_ms)) ? `${Number(row.clock_offset_ms)>0?'+':''}${Math.round(Number(row.clock_offset_ms))}ms` : '—';
    return `<tr><td><div class="mono">${esc(row.device_id || '')}</div>${row.kiosk_locked===true?'<div class="muted">Locked</div>':''}</td><td>${esc(location)}${row.current_period?`<div class="muted">Period ${esc(row.current_period)}</div>`:''}</td><td>${esc(fmtDateTime(row.last_heartbeat_at_iso || row.last_seen_at_iso))}<div class="muted">${esc(ageText)}</div></td><td>${versionChip(row)}</td><td>${online}</td><td>${esc(row.pending_scan_count || 0)}</td><td>${row.clock_skew_warning ? chip(clock,'bad') : chip(clock,'info')}</td><td>${esc(row.scan_success_count || 0)} success<div class="muted">${esc(row.scan_error_count || 0)} errors</div></td><td>${(row.flags||[]).length ? (row.flags||[]).map(x=>chip(x,/offline|stale|error|mismatch|clock/i.test(x)?'bad':'warn')).join('') : chip('Healthy','ok')}</td></tr>`;
  }).join('') : `<tr><td colspan="9" class="empty">No D1 kiosk health data for this date yet.</td></tr>`;
}
function renderExceptions(rows=[]) {
  exceptionBody.innerHTML = rows.length ? rows.map(row => `<tr><td>${esc(fmtDateTime(row.occurred_at_iso))}</td><td>${chip(row.severity || 'medium', row.severity==='high'?'bad':row.severity==='info'?'info':'warn')}</td><td class="mono">${esc(row.exception_type || '')}</td><td>${esc(row.device_id || row.room || '—')}<div class="muted">${esc(row.room || '')}</div></td><td class="mono">${esc(row.period_local || '—')}</td><td>${esc(row.message || '')}</td></tr>`).join('') : `<tr><td colspan="6" class="empty">No exceptions for this date.</td></tr>`;
}
async function fetchExpectedKioskSwVersion(force=false) {
  if (expectedKioskVersion && !force) return expectedKioskVersion;
  try {
    const u = new URL('../sw.js', window.location.href); u.searchParams.set('fidelity_health_check', String(Date.now()));
    const r = await fetch(u,{cache:'no-store'}); if (!r.ok) return expectedKioskVersion;
    const text = await r.text(); const m = text.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
    expectedKioskVersion = m ? String(m[1]||'').trim() : '';
  } catch {}
  return expectedKioskVersion;
}
async function fetchKioskHealth(date='') {
  const u = new URL('/admin/kiosk_health', API_BASE); if (date) u.searchParams.set('date',date);
  const r = await adminFetch(u,{method:'GET'}); const data = await r.json().catch(()=>null);
  if (!r.ok || !data?.ok) throw new Error(data?.detail || data?.error || `HTTP ${r.status}`);
  return data;
}
async function fetchDashboard(date='') {
  const u = new URL('/admin/fidelity_dashboard', API_BASE); if (date) u.searchParams.set('date',date);
  const r = await adminFetch(u,{method:'GET'}); const data = await r.json().catch(()=>null);
  if (!r.ok || !data?.ok) throw new Error(data?.detail || data?.error || `HTTP ${r.status}`);
  return data;
}
async function loadDashboard(date='') {
  setError(''); setBusy(true,'Loading D1 operational health…');
  try {
    await fetchExpectedKioskSwVersion();
    const data = await fetchDashboard(date || localTodayKey());
    dateInput.value = data.date || date || localTodayKey();
    renderSummary(data.counts || {}, data.date || date || localTodayKey());
    renderRoomPeriods(data.room_periods || []);
    renderTeacherHealth(data.teacher_health || []);
    renderDevices(data.devices || [], data);
    renderExceptions(data.exceptions || []);
    statusText.textContent = `D1 • ${data.date || ''} • updated ${new Date(data.generated_at_iso || Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
    return data;
  } catch (error) {
    setError(error?.message || String(error));
    statusText.textContent = 'Error';
    return null;
  } finally { setBusy(false, statusText.textContent); }
}
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!document.hidden && String(dateInput.value || '') === localTodayKey()) loadDashboard(localTodayKey()).catch(()=>{});
  }, 5 * 60 * 1000);
}
function show(el){if(el)el.style.display='block'} function hide(el){if(el)el.style.display='none'}
function loadGoogleIdentityScript(){if(window.google?.accounts?.id)return Promise.resolve();if(googleIdentityScriptPromise)return googleIdentityScriptPromise;googleIdentityScriptPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.onload=resolve;s.onerror=()=>reject(new Error('Google script failed to load'));document.head.appendChild(s)});return googleIdentityScriptPromise}
async function waitForGoogle(){await loadGoogleIdentityScript();const start=Date.now();while(!window.google?.accounts?.id){if(Date.now()-start>8000)throw new Error('Google script failed to load');await new Promise(r=>setTimeout(r,50))}return window.google.accounts.id}
async function onGoogleCredential(resp){try{loginOut.textContent='Signing in…';const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:resp.credential}).toString()});const data=await r.json().catch(()=>({}));if(data?.sid)setStoredAdminSessionSid(data.sid);if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);hide(loginCard);show(appShell);await loadDashboard(localTodayKey());startAutoRefresh()}catch(e){show(loginCard);hide(appShell);loginOut.textContent=`Login failed: ${e?.message||e}`}}
async function tryBootstrapSession(){try{const r=await adminFetch('/admin/session/check',{method:'GET'});if(!r.ok)return false;const j=await r.json().catch(()=>null);if(!j?.ok)return false;hide(loginCard);show(appShell);await loadDashboard(localTodayKey());startAutoRefresh();return true}catch{return false}}
window.addEventListener('DOMContentLoaded',async()=>{dateInput.value=localTodayKey();if(await tryBootstrapSession())return;try{if(!GOOGLE_CLIENT_ID)throw new Error('Missing google-client-id meta.');const gsi=await waitForGoogle();gsi.initialize({client_id:GOOGLE_CLIENT_ID,callback:onGoogleCredential,ux_mode:'popup',use_fedcm_for_prompt:true});gsi.renderButton(document.getElementById('g_id_signin'),{theme:'outline',size:'large'});show(loginCard);loginOut.textContent='—'}catch(e){show(loginCard);loginOut.textContent=e?.message||String(e)}});
loadBtn?.addEventListener('click',()=>loadDashboard(String(dateInput.value||'').trim()).catch(()=>{}));
todayBtn?.addEventListener('click',()=>{dateInput.value=localTodayKey();loadDashboard(localTodayKey()).catch(()=>{})});
refreshBtn?.addEventListener('click',()=>loadDashboard(String(dateInput.value||localTodayKey()).trim()).catch(()=>{}));

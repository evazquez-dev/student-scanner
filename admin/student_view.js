/* admin/student_view.js — Student Lookup Phase 2 */

function meta(name){ return document.querySelector(`meta[name="${name}"]`)?.content || ''; }
const API_BASE = (meta('api-base') || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = meta('google-client-id') || '';
const ADMIN_SESSION_KEY = 'ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY = 'teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';
const BEHAVIOR_MENU_ENDPOINT = '/admin/behavior/menu';
const BEHAVIOR_LOG_ENDPOINT = '/admin/behavior/log';
const RECENT_SCAN_DAYS = 7;

const $ = (id) => document.getElementById(id);
const loginCard = $('loginCard');
const loginOut = $('loginOut');
const app = $('app');
const qEl = $('q');
const menuEl = $('menu');
const searchStatus = $('searchStatus');
const studentCard = $('studentCard');
const emptyState = $('emptyState');
const tabsShell = $('tabsShell');
const studentName = $('studentName');
const studentMeta = $('studentMeta');
const readOnlyNote = $('readOnlyNote');
const actionStatus = $('actionStatus');
const logBehaviorBtn = $('logBehaviorBtn');
const logCommunicationBtn = $('logCommunicationBtn');
const refreshStudentBtn = $('refreshStudentBtn');

const locZone = $('locZone');
const locLabel = $('locLabel');
const locUpdated = $('locUpdated');
const currentClass = $('currentClass');
const currentClassMeta = $('currentClassMeta');
const scheduleMode = $('scheduleMode');
const currentAttendance = $('currentAttendance');
const currentAttendanceMeta = $('currentAttendanceMeta');
const attendanceTodayMeta = $('attendanceTodayMeta');
const currentMovement = $('currentMovement');
const currentMovementMeta = $('currentMovementMeta');
const scheduleList = $('scheduleList');
const attendanceSummary = $('attendanceSummary');
const attendanceList = $('attendanceList');

const scansList = $('scansList');
const scansMeta = $('scansMeta');
const scansCount = $('scansCount');
const behaviorList = $('behaviorList');
const behaviorMeta = $('behaviorMeta');
const behaviorCount = $('behaviorCount');
const communicationsList = $('communicationsList');
const communicationsMeta = $('communicationsMeta');
const communicationsCount = $('communicationsCount');

const behaviorBackdrop = $('behaviorBackdrop');
const behaviorStudent = $('behaviorStudent');
const behaviorContext = $('behaviorContext');
const behaviorSubmenu = $('behaviorCategory');
const behaviorOption = $('behaviorOption');
const behaviorRoom = $('behaviorRoom');
const behaviorPeriod = $('behaviorPeriod');
const behaviorError = $('behaviorError');
const saveBehavior = $('saveBehavior');

let access = null;
let selected = null; // { osis, name, email }
let dashboard = null;
let behaviorMenu = null;
let searchSequence = 0;
let selectionSequence = 0;
let debounceTimer = null;
let activeTab = 'overview';
let showDeletedCommunications = false; // COMMUNICATION_SOFT_DELETE_V1
let tabLoads = makeEmptyTabLoads();

function makeEmptyTabLoads(){
  return {
    scans:{ loaded:false, loading:false },
    behavior:{ loaded:false, loading:false },
    communications:{ loaded:false, loading:false }
  };
}

function esc(value){
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

function getStoredAdminSessionSid(){
  try{
    return String(
      sessionStorage.getItem(ADMIN_SESSION_KEY) ||
      localStorage.getItem(ADMIN_SESSION_KEY) ||
      sessionStorage.getItem(ADMIN_SESSION_LEGACY_KEY) ||
      localStorage.getItem(ADMIN_SESSION_LEGACY_KEY) ||
      ''
    ).trim();
  }catch{ return ''; }
}

function setStoredAdminSessionSid(sid){
  const value = String(sid || '').trim();
  try{
    if (!value) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_SESSION_KEY);
      sessionStorage.removeItem(ADMIN_SESSION_LEGACY_KEY);
      localStorage.removeItem(ADMIN_SESSION_LEGACY_KEY);
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, value);
    localStorage.setItem(ADMIN_SESSION_KEY, value);
    sessionStorage.setItem(ADMIN_SESSION_LEGACY_KEY, value);
    localStorage.setItem(ADMIN_SESSION_LEGACY_KEY, value);
  }catch{}
}

function clearStoredAdminSessionSid(){ setStoredAdminSessionSid(''); }

function stashAdminSessionFromResponse(resp){
  try{
    const sid = String(resp?.headers?.get('x-admin-session') || resp?.headers?.get('X-Admin-Session') || '').trim();
    if (sid) setStoredAdminSessionSid(sid);
  }catch{}
}

async function adminFetch(pathOrUrl, init = {}){
  const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  const headers = new Headers(init.headers || {});
  const sid = getStoredAdminSessionSid();
  if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);

  const resp = await fetch(url, {
    ...init,
    headers,
    credentials:'include',
    cache:'no-store'
  });
  stashAdminSessionFromResponse(resp);

  if (resp.status === 401) {
    try{
      const data = await resp.clone().json().catch(() => null);
      const error = String(data?.error || '').toLowerCase();
      if (error === 'expired' || error === 'no_session' || error === 'bad_session') clearStoredAdminSessionSid();
    }catch{}
  }
  return resp;
}

async function waitForGoogle(timeoutMs = 8000){
  const started = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - started > timeoutMs) throw new Error('Google script failed to load');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.google.accounts.id;
}

async function getAccess(){
  const r = await adminFetch('/admin/access', { method:'GET' });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  return data?.ok ? data : null;
}

async function doLogin(idToken){
  const r = await adminFetch('/admin/session/login_google', {
    method:'POST',
    headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
    body:new URLSearchParams({ id_token:idToken }).toString()
  });
  const data = await r.json().catch(() => null);
  if (data?.sid) setStoredAdminSessionSid(String(data.sid));
  stashAdminSessionFromResponse(r);
  if (!r.ok || !data?.ok) throw new Error(data?.error || `login_http_${r.status}`);
}

function isViewAsReadOnly(){
  return access?.view_as?.active === true || access?.view_as?.read_only === true;
}

function isAdminLike(){
  const role = String(access?.role || '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

// STUDENT_LOOKUP_BEHAVIOR_DELETE_V1
function isSuperAdmin(){
  return String(access?.role || '').trim().toLowerCase() === 'super_admin';
}

function canDeleteBehavior(row){
  if (isViewAsReadOnly() || row?.is_deleted) return false;
  const actor = String(row?.actor_email || '').trim().toLowerCase();
  const viewer = String(access?.email || '').trim().toLowerCase();
  return isSuperAdmin() || actor === viewer;
}

async function deleteBehaviorFromLookup(row, button){
  const behaviorId = String(row?.behavior_id || '').trim();
  if (!behaviorId || !canDeleteBehavior(row)) return;

  const entered = prompt(
    'Mark this behavior deleted? It will disappear from normal behavior views. Optional reason:',
    ''
  );
  if (entered === null) return;

  if (button) button.disabled = true;
  try {
    const r = await adminFetch('/admin/behavior/update', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({
        behaviorId,
        isDeleted:true,
        deleteReason:String(entered || '').trim()
      })
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok) throw new Error(data?.error || `behavior/update HTTP ${r.status}`);

    tabLoads.behavior.loaded = false;
    setActionStatus('Behavior marked deleted.', 'good');
    await loadBehaviorHistory(true, selectionSequence);
  } catch (e) {
    setActionStatus(`Could not delete behavior: ${e?.message || e}`, 'bad');
    if (button) button.disabled = false;
  }
}

function setActionStatus(message = '', kind = ''){
  actionStatus.textContent = String(message || '');
  actionStatus.className = `actionStatus small${kind ? ` ${kind}` : ''}`;
}

function updateActionState(){
  const hasStudent = !!selected?.osis;
  const readOnly = isViewAsReadOnly();
  logBehaviorBtn.disabled = !hasStudent || readOnly;
  logCommunicationBtn.disabled = !hasStudent || readOnly;
  refreshStudentBtn.disabled = !hasStudent;
  readOnlyNote.hidden = !readOnly;
  if (readOnly) {
    logBehaviorBtn.title = 'View As is read-only';
    logCommunicationBtn.title = 'View As is read-only';
  } else {
    logBehaviorBtn.title = '';
    logCommunicationBtn.title = '';
  }
}

function showMenu(items){
  menuEl.replaceChildren();
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    menuEl.style.display = 'none';
    return;
  }
  for (const item of rows) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'option');
    const name = String(item?.name || '—').trim() || '—';
    const osis = String(item?.osis || '').trim();
    const email = String(item?.email || '').trim();
    button.innerHTML = `<strong>${esc(name)}</strong> <span class="muted">(${esc(osis || '—')})</span>${email ? `<div class="small muted">${esc(email)}</div>` : ''}`;
    button.addEventListener('click', () => selectStudent(item));
    menuEl.appendChild(button);
  }
  menuEl.style.display = 'block';
}

async function searchStudents(raw){
  const q = String(raw || '').trim();
  const seq = ++searchSequence;
  if (q.length < 2) {
    showMenu([]);
    searchStatus.textContent = 'Type at least 2 characters to search.';
    return;
  }
  searchStatus.textContent = 'Searching…';
  try{
    const r = await adminFetch(`/admin/roster/search?q=${encodeURIComponent(q)}`, { method:'GET' });
    const data = await r.json().catch(() => null);
    if (seq !== searchSequence) return;
    if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    const results = Array.isArray(data.results) ? data.results : [];
    searchStatus.textContent = `${results.length} match${results.length === 1 ? '' : 'es'}`;
    showMenu(results);
  }catch(e){
    if (seq !== searchSequence) return;
    showMenu([]);
    searchStatus.textContent = `Search failed: ${e?.message || e}`;
  }
}

function fmtClock(iso){
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
}

function fmtDateTime(iso){
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso || '—');
  return d.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

function attendanceLabel(att){
  if (!att) return 'No record';
  const code = String(att.overrideLetter || att.codeLetter || '').trim().toUpperCase();
  const status = String(att.status || att.scanStatus || '').trim();
  if (code) return code;
  if (status) return status;
  return 'Recorded';
}

function attendanceLine(att){
  if (!att) return 'No attendance record';
  const code = String(att.overrideLetter || att.codeLetter || '').trim().toUpperCase();
  const status = String(att.status || att.scanStatus || '').trim();
  const first = att.firstISO ? fmtClock(att.firstISO) : '—';
  const last = att.lastISO ? fmtClock(att.lastISO) : '—';
  if (code) return `${code} (override) • first ${first} • last ${last}`;
  if (status) return `${status} • first ${first} • last ${last}`;
  return `Recorded • first ${first} • last ${last}`;
}

function attendancePillClass(att){
  const raw = `${att?.overrideLetter || att?.codeLetter || ''} ${att?.status || att?.scanStatus || ''}`.toLowerCase();
  if (/absent|\ba\b/.test(raw)) return 'bad';
  if (/late|\bl\b/.test(raw)) return 'warn';
  if (/present|\bp\b/.test(raw)) return 'good';
  return 'info';
}

function outInLine(session){
  if (!session) return '—';
  const firstIn = session.firstInISO ? fmtClock(session.firstInISO) : null;
  const out = session.out || null;
  const isOut = !!out?.isOut;
  const since = out?.outSinceISO ? fmtClock(out.outSinceISO) : '—';
  const reason = String(out?.reason || '').trim();
  if (!firstIn && !isOut) return '—';
  return `${firstIn ? `first-in ${firstIn}` : 'no first-in'} • ${isOut ? `OUT since ${since}${reason ? ` (${reason})` : ''}` : 'IN'}`;
}

function getNYDateISO(){
  try{
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }catch{
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
}

function addDaysToDateKey(dateKey, days){
  const d = new Date(`${String(dateKey)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return dateKey;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function dateKeyNY(iso){
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  try{
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }catch{ return String(iso || '').slice(0,10); }
}

function currentPeriodId(){
  return String(dashboard?.schedule?.now?.periodLocal || '').trim();
}

function scheduleModeLabel(mode){
  const m = String(mode || '').toLowerCase();
  if (m === 'in_class') return 'Class is currently in session';
  if (m === 'transition') return 'Passing time / upcoming class';
  if (m === 'after_school') return 'After-school window';
  return 'No active class period right now';
}

function renderOverview(){
  const data = dashboard || {};
  const loc = data.location || null;
  locLabel.textContent = String(loc?.location_label || loc?.locLabel || loc?.loc || '—');
  locZone.textContent = String(loc?.zone || 'No location zone');
  locUpdated.textContent = loc?.updated_at ? `Updated ${fmtDateTime(loc.updated_at)}` : 'Updated —';

  const cur = data.schedule?.now || null;
  currentClass.textContent = cur?.course || (cur?.periodLocal ? `Period ${cur.periodLocal}` : '—');
  currentClassMeta.textContent = cur
    ? `${cur.periodLocal || '—'} • ${cur.room ? `Room ${cur.room}` : 'Room —'}${cur.range ? ` • ${cur.range}` : ''}`
    : 'No current/upcoming assigned class.';
  scheduleMode.textContent = scheduleModeLabel(data.schedule?.mode);

  const att = data.attendance || null;
  currentAttendance.textContent = attendanceLabel(att);
  currentAttendanceMeta.textContent = attendanceLine(att);
  const today = Array.isArray(data.attendance_today) ? data.attendance_today : [];
  const recorded = today.filter((row) => row?.attendance).length;
  attendanceTodayMeta.textContent = `${recorded} of ${today.length} assigned period${today.length === 1 ? '' : 's'} currently have an attendance record.`;

  const session = data.session || null;
  const isOut = !!session?.out?.isOut;
  currentMovement.textContent = session ? (isOut ? 'OUT' : 'IN') : '—';
  currentMovementMeta.textContent = outInLine(session);
}

function renderSchedule(){
  const rows = Array.isArray(dashboard?.schedule?.day) ? dashboard.schedule.day : [];
  const current = currentPeriodId();
  if (!rows.length) {
    scheduleList.innerHTML = '<div class="emptyState">No assigned schedule periods were found for today.</div>';
    return;
  }
  let html = '<div class="scheduleGrid scheduleHead"><div>Period</div><div>Time</div><div>Course</div><div>Room</div></div>';
  for (const row of rows) {
    const isCurrent = current && String(row.periodLocal) === current;
    html += `<div class="scheduleGrid scheduleRow${isCurrent ? ' current' : ''}">
      <div><strong>${esc(row.periodLocal || '—')}</strong>${isCurrent ? '<div class="small"><span class="pill info">CURRENT</span></div>' : ''}</div>
      <div class="muted small">${esc(row.range || '—')}</div>
      <div><strong>${esc(row.course || '—')}</strong></div>
      <div>${row.room ? `Room ${esc(row.room)}` : '—'}</div>
    </div>`;
  }
  scheduleList.innerHTML = html;
}

function renderAttendance(){
  const rows = Array.isArray(dashboard?.attendance_today) ? dashboard.attendance_today : [];
  const current = currentPeriodId();
  if (!rows.length) {
    attendanceSummary.replaceChildren();
    attendanceList.innerHTML = '<div class="emptyState">No assigned periods are available for today.</div>';
    return;
  }
  const recorded = rows.filter((row) => row?.attendance).length;
  const noRecord = rows.length - recorded;
  attendanceSummary.innerHTML = `
    <div class="summaryChip"><strong>${rows.length}</strong> assigned</div>
    <div class="summaryChip"><strong>${recorded}</strong> recorded</div>
    <div class="summaryChip"><strong>${noRecord}</strong> no record yet</div>`;

  attendanceList.innerHTML = rows.map((row) => {
    const isCurrent = current && String(row.periodLocal) === current;
    const att = row.attendance || null;
    return `<article class="listItem${isCurrent ? ' current' : ''}">
      <div class="listTop">
        <div>
          <div class="listTitle">${esc(row.periodLocal || '—')} • ${esc(row.course || '—')}</div>
          <div class="listMeta">${esc(row.range || '—')}${row.room ? ` • Room ${esc(row.room)}` : ''}</div>
        </div>
        <span class="pill ${attendancePillClass(att)}">${esc(attendanceLabel(att))}</span>
      </div>
      <div class="listBody small">${esc(attendanceLine(att))}</div>
    </article>`;
  }).join('');
}

function resetLazyTabs(){
  tabLoads = makeEmptyTabLoads();
  scansCount.textContent = '';
  behaviorCount.textContent = '';
  communicationsCount.textContent = '';
  scansMeta.textContent = 'Recent 7-day scanner history loads when this tab is opened.';
  behaviorMeta.textContent = 'Shows behavior logs you currently have permission to view.';
  communicationsMeta.textContent = 'Recent communications logged for this student.';
  scansList.innerHTML = '<div class="loadingState">Open this tab to load recent scans.</div>';
  behaviorList.innerHTML = '<div class="loadingState">Open this tab to load behavior history.</div>';
  communicationsList.innerHTML = '<div class="loadingState">Open this tab to load communication history.</div>';
}

function applyScanCorrections(rows, corrections){
  const source = Array.isArray(rows) ? rows.slice() : [];
  const cutoffByDate = new Map();
  for (const row of source) {
    if (String(row?.allowed || '').toLowerCase() !== 'correction_reset_off_campus') continue;
    const key = dateKeyNY(row?.whenISO);
    if (!key) continue;
    const prev = cutoffByDate.get(key);
    if (!prev || String(row?.whenISO || '') > String(prev.whenISO || '')) cutoffByDate.set(key, row);
  }
  for (const correction of Array.isArray(corrections) ? corrections : []) {
    const whenISO = String(correction?.whenISO || '').trim();
    const key = String(correction?.date || '').trim() || dateKeyNY(whenISO);
    if (!key || !whenISO) continue;
    const prev = cutoffByDate.get(key);
    if (!prev || whenISO > String(prev.whenISO || '')) cutoffByDate.set(key, { whenISO });
  }
  if (!cutoffByDate.size) return source;
  return source.filter((row) => {
    const key = dateKeyNY(row?.whenISO);
    const cutoff = cutoffByDate.get(key);
    if (!cutoff) return true;
    if (String(row?.allowed || '').toLowerCase() === 'correction_reset_off_campus') return false;
    return String(row?.whenISO || '') >= String(cutoff.whenISO || '');
  });
}

function scanResultLabel(row){
  const allowed = String(row?.allowed || '').trim();
  if (!allowed) return 'Scan';
  return allowed.replaceAll('_', ' ');
}

async function loadScans(force = false, seq = selectionSequence){
  if (!selected?.osis) return;
  if (tabLoads.scans.loading || (tabLoads.scans.loaded && !force)) return;
  tabLoads.scans.loading = true;
  scansList.innerHTML = '<div class="loadingState">Loading recent scans…</div>';
  const end = getNYDateISO();
  const start = addDaysToDateKey(end, -(RECENT_SCAN_DAYS - 1));
  scansMeta.textContent = `${start} through ${end}`;
  try{
    const url = new URL('/admin/scans_query', API_BASE);
    url.searchParams.set('osis', selected.osis);
    url.searchParams.set('start', start);
    url.searchParams.set('end', end);
    url.searchParams.set('max', '100');
    const r = await adminFetch(url, { method:'GET' });
    const data = await r.json().catch(() => null);
    if (seq !== selectionSequence) return;
    if (!r.ok || !data?.ok) throw new Error(data?.error || `scans_query HTTP ${r.status}`);
    const rows = applyScanCorrections(data.rows || [], data.corrections || [])
      .sort((a,b) => String(b?.whenISO || '').localeCompare(String(a?.whenISO || '')));
    scansCount.textContent = rows.length ? String(rows.length) : '';
    scansMeta.textContent = `${rows.length} scan${rows.length === 1 ? '' : 's'} from ${start} through ${end}${data.truncated ? ' • result limit reached' : ''}`;
    scansList.innerHTML = rows.length ? rows.map((row) => `<article class="listItem">
      <div class="listTop">
        <div><div class="listTitle">${esc(row.location || 'Unknown location')}</div><div class="listMeta">${esc(fmtDateTime(row.whenISO))}${row.periodId ? ` • Period ${esc(row.periodId)}` : ''}</div></div>
        <span class="pill info">${esc(scanResultLabel(row))}</span>
      </div>
      <div class="listBody small">${row.source ? `Source: ${esc(row.source)}` : ''}${(row.device || row.deviceId) ? `${row.source ? ' • ' : ''}Device: ${esc(row.device || row.deviceId)}` : ''}</div>
    </article>`).join('') : '<div class="emptyState">No scanner activity was found in the recent 7-day window.</div>';
    tabLoads.scans.loaded = true;
  }catch(e){
    if (seq !== selectionSequence) return;
    scansList.innerHTML = `<div class="errorState">Could not load recent scans: ${esc(e?.message || e)}</div>`;
  }finally{
    if (seq === selectionSequence) tabLoads.scans.loading = false;
  }
}

async function loadBehaviorHistory(force = false, seq = selectionSequence){
  if (!selected?.osis) return;
  if (tabLoads.behavior.loading || (tabLoads.behavior.loaded && !force)) return;
  tabLoads.behavior.loading = true;
  behaviorList.innerHTML = '<div class="loadingState">Loading behavior history…</div>';
  try{
    const url = new URL('/admin/behavior/list', API_BASE);
    url.searchParams.set('q', selected.osis);
    url.searchParams.set('limit', '50');
    const r = await adminFetch(url, { method:'GET' });
    const data = await r.json().catch(() => null);
    if (seq !== selectionSequence) return;
    if (!r.ok || !data?.ok) throw new Error(data?.error || `behavior/list HTTP ${r.status}`);
    const rows = (Array.isArray(data.rows) ? data.rows : [])
      .filter((row) => String(row?.osis || '').trim() === selected.osis && !row?.is_deleted)
      .sort((a,b) => String(b?.when_iso || b?.logged_at_iso || '').localeCompare(String(a?.when_iso || a?.logged_at_iso || '')));
    behaviorCount.textContent = rows.length ? String(rows.length) : '';
    behaviorMeta.textContent = isAdminLike()
      ? `${rows.length} active behavior log${rows.length === 1 ? '' : 's'} available for this student.`
      : `${rows.length} active behavior log${rows.length === 1 ? '' : 's'} available to you for this student.`;
    behaviorList.innerHTML = rows.length ? rows.map((row) => {
      const where = [row.room ? `Room ${row.room}` : '', row.period_local ? `Period ${row.period_local}` : ''].filter(Boolean).join(' • ');
      const deleteButton = canDeleteBehavior(row)
        ? `<button type="button" class="btn secondary small" data-behavior-delete-id="${esc(row.behavior_id || '')}">Mark deleted</button>`
        : '';
      return `<article class="listItem">
        <div class="listTop">
          <div><div class="listTitle">${esc(row.event_label || row.event_key || 'Behavior')}</div><div class="listMeta">${esc(fmtDateTime(row.when_iso || row.logged_at_iso))}${where ? ` • ${esc(where)}` : ''}</div></div>
          <span class="pill warn">Behavior</span>
        </div>
        ${row.notes ? `<div class="listBody">${esc(row.notes)}</div>` : ''}
        <div class="listMeta">Logged by ${esc(row.actor_email || '—')}${row.source ? ` • ${esc(row.source)}` : ''}</div>
        ${deleteButton ? `<div class="inlineActions" style="margin-top:.55rem;">${deleteButton}</div>` : ''}
      </article>`;
    }).join('') : '<div class="emptyState">No active behavior logs are available to you for this student.</div>';

    behaviorList.querySelectorAll('[data-behavior-delete-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const behaviorId = String(button.getAttribute('data-behavior-delete-id') || '').trim();
        const row = rows.find((item) => String(item?.behavior_id || '').trim() === behaviorId);
        if (row) deleteBehaviorFromLookup(row, button);
      });
    });

    tabLoads.behavior.loaded = true;
  }catch(e){
    if (seq !== selectionSequence) return;
    behaviorList.innerHTML = `<div class="errorState">Could not load behavior history: ${esc(e?.message || e)}</div>`;
  }finally{
    if (seq === selectionSequence) tabLoads.behavior.loading = false;
  }
}

function isCommunicationAdmin(){
  const role=String(access?.role||'').trim().toLowerCase();
  return role==='admin'||role==='super_admin';
}

function canDeleteCommunication(row){
  if(access?.view_as?.active||row?.is_deleted)return false;
  if(isCommunicationAdmin())return true;
  return String(row?.actor_email||'').trim().toLowerCase()===String(access?.email||'').trim().toLowerCase();
}

function canRestoreCommunication(row){
  return !access?.view_as?.active&&isCommunicationAdmin()&&row?.is_deleted===true;
}

async function setCommunicationDeleted(row,deleted,button){
  if(!row?.communication_id)return;
  let reason='';
  if(deleted){
    const entered=prompt('Mark this communication deleted? It will disappear from normal staff views. Optional reason:','');
    if(entered===null)return;
    reason=entered.trim();
  }else if(!confirm('Restore this deleted communication to normal staff views?'))return;
  if(button)button.disabled=true;
  try{
    const endpoint=deleted?'/admin/communications/delete':'/admin/communications/restore';
    const r=await adminFetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({communication_id:row.communication_id,student_number:row.student_number||selected?.osis||'',reason})});
    const j=await r.json().catch(()=>null);
    if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);
    tabLoads.communications.loaded=false;
    await loadCommunications(true,selectionSequence);
  }catch(e){
    setActionStatus(`Could not ${deleted?'delete':'restore'} communication: ${e?.message||e}`,'bad');
    if(button)button.disabled=false;
  }
}

function ensureDeletedCommunicationToggle(){
  if(!isCommunicationAdmin()||document.getElementById('studentViewShowDeletedCommunications'))return;
  const host=document.querySelector('#panelCommunications .inlineActions');
  const refresh=document.getElementById('refreshCommunicationsBtn');
  if(!host||!refresh)return;
  const toggle=document.createElement('button');
  toggle.id='studentViewShowDeletedCommunications';
  toggle.type='button';
  toggle.className='btn secondary small';
  toggle.textContent='Show deleted';
  toggle.addEventListener('click',async()=>{
    showDeletedCommunications=!showDeletedCommunications;
    toggle.textContent=showDeletedCommunications?'Hide deleted':'Show deleted';
    tabLoads.communications.loaded=false;
    await loadCommunications(true,selectionSequence);
  });
  host.insertBefore(toggle,refresh);
}

async function loadCommunications(force = false, seq = selectionSequence){
  if (!selected?.osis) return;
  if (tabLoads.communications.loading || (tabLoads.communications.loaded && !force)) return;
  tabLoads.communications.loading = true;
  communicationsList.innerHTML = '<div class="loadingState">Loading communication history…</div>';
  try{
    const url = new URL('/admin/communications/student', API_BASE);
    url.searchParams.set('student_number', selected.osis);
    url.searchParams.set('limit', '50');
    if(isCommunicationAdmin()&&showDeletedCommunications)url.searchParams.set('show_deleted','1');
    const r = await adminFetch(url, { method:'GET' });
    const data = await r.json().catch(() => null);
    if (seq !== selectionSequence) return;
    if (!r.ok || !data?.ok) throw new Error(data?.error || `communications/student HTTP ${r.status}`);
    const rows = (Array.isArray(data.rows) ? data.rows : [])
      .filter((row) => !row?.student_number || String(row.student_number).trim() === selected.osis)
      .sort((a,b) => String(b?.contact_at_iso || b?.created_at_iso || '').localeCompare(String(a?.contact_at_iso || a?.created_at_iso || '')));
    communicationsCount.textContent = rows.length ? String(rows.length) : '';
    communicationsMeta.textContent = `${rows.length} recent communication${rows.length === 1 ? '' : 's'} loaded${showDeletedCommunications ? ' (including deleted)' : ''}.`;
    communicationsList.innerHTML = rows.length ? rows.map((row) => {
      const follow = row.follow_up_needed
        ? (row.follow_up_resolved_at_iso
          ? `Follow-up resolved ${fmtDateTime(row.follow_up_resolved_at_iso)}${row.follow_up_resolved_by_email ? ` by ${row.follow_up_resolved_by_email}` : ''}`
          : `Follow-up ${row.follow_up_at_iso ? fmtDateTime(row.follow_up_at_iso) : 'needed'}${row.follow_up_owner_email ? ` • ${row.follow_up_owner_email}` : ''}`)
        : '';
      const deletedMeta=row.is_deleted?`Deleted${row.deleted_by_email?` by ${row.deleted_by_email}`:''}${row.deleted_at_iso?` on ${fmtDateTime(row.deleted_at_iso)}`:''}${row.delete_reason?` • ${row.delete_reason}`:''}`:'';
      const actions=[];
      if(canDeleteCommunication(row))actions.push(`<button class="btn secondary small communicationDelete" type="button" data-id="${esc(row.communication_id||'')}">Mark deleted</button>`);
      if(canRestoreCommunication(row))actions.push(`<button class="btn secondary small communicationRestore" type="button" data-id="${esc(row.communication_id||'')}">Restore</button>`);
      return `<article class="listItem"${row.is_deleted?' style="opacity:.72"':''}>
        <div class="listTop">
          <div><div class="listTitle">${esc(row.contact_display_name || 'General / No specific contact')}</div><div class="listMeta">${esc(fmtDateTime(row.contact_at_iso || row.created_at_iso))} • ${esc(row.method || '—')} • ${esc(row.direction || '—')} • ${esc(row.category || '—')}</div></div>
          <span class="pill ${row.is_deleted?'warn':'info'}">${esc(row.is_deleted?'Deleted':(row.outcome || 'Logged'))}</span>
        </div>
        ${row.notes ? `<div class="listBody">${esc(row.notes)}</div>` : ''}
        ${follow ? `<div class="listMeta" style="margin-top:8px">${esc(follow)}</div>` : ''}
        ${deletedMeta?`<div class="listMeta" style="margin-top:8px">${esc(deletedMeta)}</div>`:''}
        <div class="listMeta">Logged by ${esc(row.actor_email || '—')}${row.related_incident_id ? ` • Incident ${esc(row.related_incident_id)}` : ''}</div>
        ${actions.length?`<div class="inlineActions" style="margin-top:10px">${actions.join('')}</div>`:''}
      </article>`;
    }).join('') : '<div class="emptyState">No communications have been logged for this student yet.</div>';
    communicationsList.querySelectorAll('.communicationDelete').forEach((button)=>button.addEventListener('click',()=>{
      const row=rows.find((item)=>String(item?.communication_id||'')===String(button.dataset.id||''));
      if(row)setCommunicationDeleted(row,true,button);
    }));
    communicationsList.querySelectorAll('.communicationRestore').forEach((button)=>button.addEventListener('click',()=>{
      const row=rows.find((item)=>String(item?.communication_id||'')===String(button.dataset.id||''));
      if(row)setCommunicationDeleted(row,false,button);
    }));
    tabLoads.communications.loaded = true;
  }catch(e){
    if (seq !== selectionSequence) return;
    communicationsList.innerHTML = `<div class="errorState">Could not load communication history: ${esc(e?.message || e)}</div>`;
  }finally{
    if (seq === selectionSequence) tabLoads.communications.loading = false;
  }
}

function setActiveTab(name, { focus = false } = {}){
  const requested = String(name || 'overview').toLowerCase();
  const button = document.querySelector(`.tab[data-tab="${CSS.escape(requested)}"]`);
  if (!button) return;
  activeTab = requested;
  document.querySelectorAll('.tab[role="tab"]').forEach((tab) => {
    const active = tab === button;
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.tabPanel').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== requested;
  });
  if (focus) button.focus();

  const seq = selectionSequence;
  if (requested === 'scans') loadScans(false, seq);
  if (requested === 'behavior') loadBehaviorHistory(false, seq);
  if (requested === 'communications') loadCommunications(false, seq);
}

function onTabKeydown(event){
  const tabs = [...document.querySelectorAll('.tab[role="tab"]')];
  const index = tabs.indexOf(event.currentTarget);
  if (index < 0) return;
  let next = null;
  if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
  if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
  if (event.key === 'Home') next = tabs[0];
  if (event.key === 'End') next = tabs[tabs.length - 1];
  if (!next) return;
  event.preventDefault();
  setActiveTab(next.dataset.tab, { focus:true });
}

function currentBehaviorContext(){
  const current = dashboard?.schedule?.now || {};
  const loc = dashboard?.location || {};
  return {
    date:String(dashboard?.date || getNYDateISO()),
    room:String(current?.room || loc?.location_label || loc?.locLabel || loc?.loc || '').trim(),
    periodLocal:String(current?.periodLocal || '').trim()
  };
}

async function loadDashboard(osis, seq = selectionSequence){
  const r = await adminFetch(`/admin/student/dashboard?osis=${encodeURIComponent(osis)}`, { method:'GET' });
  const data = await r.json().catch(() => null);
  if (seq !== selectionSequence) return false;
  if (!r.ok || !data?.ok) throw new Error(data?.error || `dash_http_${r.status}`);
  dashboard = data;

  if (data.student) {
    selected = {
      osis:String(data.student.osis || selected?.osis || osis),
      name:String(data.student.name || selected?.name || ''),
      email:String(data.student.email || selected?.email || ''),
      grade:String(data.student.grade || '')
    };
  }

  studentName.textContent = selected?.name || 'Unknown Student';
  const studentBits = [`OSIS ${selected?.osis || '—'}`];
  if (selected?.grade) studentBits.push(`Grade ${selected.grade}`);
  if (selected?.email) studentBits.push(selected.email);
  studentMeta.textContent = studentBits.join(' • ');
  renderOverview();
  renderSchedule();
  renderAttendance();
  updateActionState();
  return true;
}

async function selectStudent(item){
  const osis = String(item?.osis || '').trim();
  if (!osis) return;
  const seq = ++selectionSequence;
  selected = { osis, name:String(item?.name || ''), email:String(item?.email || ''), grade:'' };
  dashboard = null;
  resetLazyTabs();
  setActiveTab('overview');
  showMenu([]);
  qEl.value = selected.name || selected.osis;
  qEl.blur();
  setActionStatus('');
  searchStatus.textContent = 'Loading student…';

  studentCard.hidden = false;
  emptyState.hidden = true;
  tabsShell.hidden = false;
  studentName.textContent = selected.name || 'Loading student…';
  studentMeta.textContent = `OSIS ${selected.osis}`;
  locLabel.textContent = '…'; locZone.textContent = '…'; locUpdated.textContent = 'Updated …';
  currentClass.textContent = '…'; currentClassMeta.textContent = '…'; scheduleMode.textContent = '…';
  currentAttendance.textContent = '…'; currentAttendanceMeta.textContent = '…'; attendanceTodayMeta.textContent = '…';
  currentMovement.textContent = '…'; currentMovementMeta.textContent = '…';
  scheduleList.innerHTML = '<div class="loadingState">Loading schedule…</div>';
  attendanceSummary.replaceChildren();
  attendanceList.innerHTML = '<div class="loadingState">Loading attendance…</div>';
  updateActionState();

  const url = new URL(location.href);
  url.searchParams.set('osis', selected.osis);
  url.searchParams.delete('name');
  history.replaceState(null, '', url.toString());

  try{
    const loaded = await loadDashboard(selected.osis, seq);
    if (!loaded || seq !== selectionSequence) return;
    searchStatus.textContent = '';
  }catch(e){
    if (seq !== selectionSequence) return;
    searchStatus.textContent = `Student load failed: ${e?.message || e}`;
    setActionStatus('Could not load this student.', 'bad');
    scheduleList.innerHTML = `<div class="errorState">${esc(e?.message || e)}</div>`;
    attendanceList.innerHTML = `<div class="errorState">${esc(e?.message || e)}</div>`;
  }
}

async function refreshSelected(){
  if (!selected?.osis) return;
  const seq = selectionSequence;
  refreshStudentBtn.disabled = true;
  setActionStatus('Refreshing student…');
  try{
    await loadDashboard(selected.osis, seq);
    if (seq !== selectionSequence) return;
    setActionStatus('Student refreshed.', 'good');
    if (activeTab === 'scans') await loadScans(true, seq);
    if (activeTab === 'behavior') await loadBehaviorHistory(true, seq);
    if (activeTab === 'communications') await loadCommunications(true, seq);
  }catch(e){
    if (seq === selectionSequence) setActionStatus(`Refresh failed: ${e?.message || e}`, 'bad');
  }finally{
    updateActionState();
  }
}

function slugifyBehaviorPart(value){
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function makeBehaviorEventKey(submenu, option){
  const sub = slugifyBehaviorPart(submenu || 'behavior');
  const opt = slugifyBehaviorPart(option || submenu || 'event');
  if (!sub && !opt) return 'behavior_event';
  if (!sub) return opt;
  if (!opt) return sub;
  return `${sub}__${opt}`;
}

function normalizeBehaviorMenu(data){
  const optionsRaw = data?.options_by_submenu && typeof data.options_by_submenu === 'object'
    ? data.options_by_submenu : {};
  const incidentLabel = String(data?.incident_creator?.label || 'Incident Creator').trim().toLowerCase();
  const categories = [];
  const seen = new Set();
  const add = (value) => {
    const label = String(value || '').trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (key === incidentLabel || key === 'incident creator' || seen.has(key)) return;
    seen.add(key);
    categories.push(label);
  };
  (Array.isArray(data?.submenus) ? data.submenus : []).forEach(add);
  Object.keys(optionsRaw).forEach(add);

  const optionsByCategory = {};
  for (const category of categories) {
    const key = Object.keys(optionsRaw).find((candidate) => String(candidate).trim().toLowerCase() === category.toLowerCase());
    const raw = key ? optionsRaw[key] : [];
    const values = [];
    const optionSeen = new Set();
    for (const item of Array.isArray(raw) ? raw : []) {
      const label = String(item || '').trim();
      const lower = label.toLowerCase();
      if (!label || optionSeen.has(lower)) continue;
      optionSeen.add(lower);
      values.push(label);
    }
    optionsByCategory[category] = values;
  }
  return { categories, optionsByCategory };
}

async function loadBehaviorMenu(){
  if (behaviorMenu?.categories?.length) return behaviorMenu;
  const r = await adminFetch(BEHAVIOR_MENU_ENDPOINT, { method:'GET' });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) throw new Error(data?.error || `behavior/menu HTTP ${r.status}`);
  behaviorMenu = normalizeBehaviorMenu(data);
  if (!behaviorMenu.categories.length) throw new Error('No loggable behaviors are configured.');
  return behaviorMenu;
}

function fillBehaviorOptions(){
  const category = String(behaviorSubmenu.value || '').trim();
  const options = behaviorMenu?.optionsByCategory?.[category] || [];
  behaviorOption.replaceChildren();
  if (!options.length) {
    behaviorOption.appendChild(new Option(category || 'Behavior', category || 'Behavior'));
    return;
  }
  for (const option of options) behaviorOption.appendChild(new Option(option, option));
}

function closeBehaviorModal(){
  behaviorBackdrop.hidden = true;
  behaviorError.textContent = '';
}

async function openBehaviorModal(){
  if (!selected?.osis || isViewAsReadOnly()) return;
  behaviorBackdrop.hidden = false;
  behaviorStudent.textContent = `${selected.name || 'Unknown Student'} • OSIS ${selected.osis}`;
  behaviorError.textContent = '';
  saveBehavior.disabled = true;
  behaviorSubmenu.disabled = true;
  behaviorOption.disabled = true;

  const ctx = currentBehaviorContext();
  behaviorRoom.value = ctx.room;
  behaviorPeriod.value = ctx.periodLocal;
  behaviorContext.textContent = `Current context: ${ctx.date}${ctx.periodLocal ? ` • Period ${ctx.periodLocal}` : ''}${ctx.room ? ` • ${ctx.room}` : ''}. You can edit location or period before logging.`;

  try{
    const menu = await loadBehaviorMenu();
    behaviorSubmenu.replaceChildren();
    for (const category of menu.categories) behaviorSubmenu.appendChild(new Option(category, category));
    fillBehaviorOptions();
    behaviorSubmenu.disabled = false;
    behaviorOption.disabled = false;
    saveBehavior.disabled = false;
    behaviorSubmenu.focus();
  }catch(e){
    behaviorError.textContent = `Could not load behavior menu: ${e?.message || e}`;
  }
}

async function submitBehavior(){
  if (!selected?.osis || isViewAsReadOnly()) return;
  const submenu = String(behaviorSubmenu.value || '').trim();
  const option = String(behaviorOption.value || submenu).trim();
  if (!submenu || !option) {
    behaviorError.textContent = 'Choose a behavior.';
    return;
  }

  const ctx = currentBehaviorContext();
  const payload = {
    date:ctx.date || getNYDateISO(),
    room:String(behaviorRoom.value || ctx.room || '').trim(),
    periodLocal:String(behaviorPeriod.value || ctx.periodLocal || '').trim(),
    osis:selected.osis,
    name:selected.name || dashboard?.student?.name || '',
    eventKey:makeBehaviorEventKey(submenu, option),
    eventLabel:option,
    source:'student_lookup',
    whenISO:new Date().toISOString(),
    meta:{ ui:'student_lookup', ver:2, submenu, option }
  };

  saveBehavior.disabled = true;
  behaviorError.textContent = '';
  try{
    const r = await adminFetch(BEHAVIOR_LOG_ENDPOINT, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify(payload)
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok) throw new Error(data?.error || `behavior/log HTTP ${r.status}`);
    closeBehaviorModal();
    tabLoads.behavior.loaded = false;
    behaviorCount.textContent = '';
    setActionStatus(`Behavior logged: ${option}`, 'good');
    if (activeTab === 'behavior') await loadBehaviorHistory(true, selectionSequence);
  }catch(e){
    behaviorError.textContent = `Could not log behavior: ${e?.message || e}`;
  }finally{
    if (!behaviorBackdrop.hidden) saveBehavior.disabled = false;
  }
}

function contactsUrl(){
  if (!selected?.osis) return null;
  const url = new URL('./student_contacts.html', location.href);
  url.searchParams.set('osis', selected.osis);
  if (selected.name) url.searchParams.set('name', selected.name);
  url.searchParams.set('source', 'student_lookup');
  return url;
}

function openCommunication(){
  if (!selected?.osis || isViewAsReadOnly()) return;
  const url = contactsUrl();
  if (url) location.href = url.toString();
}

function openContacts(){
  const url = contactsUrl();
  if (url) location.href = url.toString();
}

async function boot(){
  qEl.addEventListener('input', (event) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchStudents(event.target.value), 180);
  });
  qEl.addEventListener('focus', () => {
    if (menuEl.children.length) menuEl.style.display = 'block';
  });
  document.addEventListener('click', (event) => {
    if (!menuEl.contains(event.target) && event.target !== qEl) showMenu([]);
  });

  document.querySelectorAll('.tab[role="tab"]').forEach((tab) => {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    tab.addEventListener('keydown', onTabKeydown);
  });

  refreshStudentBtn.addEventListener('click', refreshSelected);
  $('refreshScansBtn').addEventListener('click', () => loadScans(true, selectionSequence));
  $('refreshBehaviorBtn').addEventListener('click', () => loadBehaviorHistory(true, selectionSequence));
  $('refreshCommunicationsBtn').addEventListener('click', () => loadCommunications(true, selectionSequence));
  $('openContactsBtn').addEventListener('click', openContacts);

  logBehaviorBtn.addEventListener('click', openBehaviorModal);
  logCommunicationBtn.addEventListener('click', openCommunication);
  behaviorSubmenu.addEventListener('change', fillBehaviorOptions);
  $('closeBehavior').addEventListener('click', closeBehaviorModal);
  $('cancelBehavior').addEventListener('click', closeBehaviorModal);
  saveBehavior.addEventListener('click', submitBehavior);
  behaviorBackdrop.addEventListener('click', (event) => {
    if (event.target === behaviorBackdrop) closeBehaviorModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !behaviorBackdrop.hidden) closeBehaviorModal();
  });

  access = await getAccess();
  if (!access) {
    loginOut.textContent = 'Please sign in.';
    const gsi = await waitForGoogle();
    gsi.initialize({
      client_id:GOOGLE_CLIENT_ID,
      ux_mode:'popup',
      callback:async (response) => {
        try{
          loginOut.textContent = 'Signing in…';
          await doLogin(response.credential);
          location.reload();
        }catch(e){
          loginOut.textContent = `Login failed: ${e?.message || e}`;
        }
      }
    });
    gsi.renderButton($('g_id_signin'), { theme:'outline', size:'large' });
    return;
  }

  // Student Lookup is intentionally available to every authenticated EagleNEST staff account.
  loginCard.hidden = true;
  app.hidden = false;
  ensureDeletedCommunicationToggle();
  updateActionState();

  const url = new URL(location.href);
  const osis = String(url.searchParams.get('osis') || '').trim();
  if (osis) await selectStudent({ osis, name:String(url.searchParams.get('name') || ''), email:'' });
}

boot().catch((e) => {
  loginOut.textContent = String(e?.message || e);
});

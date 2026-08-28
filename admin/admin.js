// admin/admin.js — Admin UI with bathroom cap helpers (ALL / M / F)

/* ===============================
 * BASE + ELEMENTS
 * =============================== */
const _metaApiBase = (document.querySelector('meta[name="api-base"]')?.content || '').trim();
const API_BASE = ((_metaApiBase ? _metaApiBase.replace(/\/*$/, '') : window.location.origin) + '/');

// ---- iOS cross-origin session fallback (Option 2) ----
const ADMIN_SESSION_HEADER = 'x-admin-session';
const ADMIN_SESSION_KEYS = [
  'admin_session_v1',
  'ss_admin_session_sid_v1',
  'teacher_att_admin_session_v1',
  'staff_pull_admin_session_v1',
  'phone_pass_admin_session_v1',
  'student_scans_admin_session_v1'
];

function getStoredAdminSessionSid(){
  try{
    for (const k of ADMIN_SESSION_KEYS){
      const v = String(sessionStorage.getItem(k) || localStorage.getItem(k) || '').trim();
      if (v) return v;
    }
  }catch{}
  return '';
}

function setStoredAdminSessionSid(sid){
  const v = String(sid || '').trim();
  if (!v) return;
  try{
    for (const k of ADMIN_SESSION_KEYS){
      sessionStorage.setItem(k, v);
      localStorage.setItem(k, v);
    }
  }catch{}
}

function clearStoredAdminSessionSid(){
  try{
    for (const k of ADMIN_SESSION_KEYS){
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    }
  }catch{}
}

function stashAdminSessionFromResponse(resp, data){
  try{
    const sidFromHeader = String(
      resp?.headers?.get(ADMIN_SESSION_HEADER) ||
      resp?.headers?.get('X-Admin-Session') ||
      ''
    ).trim();
    const sidFromBody = String(data?.sid || '').trim();
    const sid = sidFromBody || sidFromHeader;
    if (sid) setStoredAdminSessionSid(sid);
  }catch{}
}

const apiBaseEl = document.getElementById('apiBase');
if (apiBaseEl) apiBaseEl.textContent = API_BASE;

// Cards / outputs
const loginCard = document.getElementById('loginCard');
const loginOut  = document.getElementById('loginOut');
const diagOut   = document.getElementById('diagOut');
const syncOut   = document.getElementById('syncOut');

// Locations UI
const locationsOut        = document.getElementById('locationsOut');
const locationsTbody      = document.getElementById('locationsTbody');
const locationsCountLabel = document.getElementById('locationsCountLabel');

// Bathroom + other cards
const bathOut      = document.getElementById('bathOut');
const bathTableOut = document.getElementById('bathTableOut');
const bindOut      = document.getElementById('bindOut');
const scheduleOut  = document.getElementById('scheduleOut');

// Overviews (read-only)
const bindingsOut         = document.getElementById('bindingsOut');
const bindingsTbody       = document.getElementById('bindingsTbody');
const bindingsCountLabel  = document.getElementById('bindingsCountLabel');

const bellOut             = document.getElementById('bellOut');
const bellTbody           = document.getElementById('bellTbody');
const bellCountLabel      = document.getElementById('bellCountLabel');
const bellMeta            = document.getElementById('bellMeta');
const bellWarning         = document.getElementById('bellWarning');

const periodMapOut        = document.getElementById('periodMapOut');
const periodMapTbody      = document.getElementById('periodMapTbody');
const periodMapCountLabel = document.getElementById('periodMapCountLabel');
const periodMapMeta       = document.getElementById('periodMapMeta');

const classesSummaryOut        = document.getElementById('classesSummaryOut');
const classesSummaryTbody      = document.getElementById('classesSummaryTbody');
const classesSummaryCountLabel = document.getElementById('classesSummaryCountLabel');
const classesSummaryMeta       = document.getElementById('classesSummaryMeta');

const teacherAssignmentsOut            = document.getElementById('teacherAssignmentsOut');
const teacherAssignmentsSummaryTbody   = document.getElementById('teacherAssignmentsSummaryTbody');
const teacherAssignmentsMatchedTbody   = document.getElementById('teacherAssignmentsMatchedTbody');
const teacherAssignmentsUnmatchedTbody = document.getElementById('teacherAssignmentsUnmatchedTbody');
const teacherAssignmentsCountLabel     = document.getElementById('teacherAssignmentsCountLabel');
const teacherAssignmentsMeta           = document.getElementById('teacherAssignmentsMeta');

const regentsOut          = document.getElementById('regentsOut');
const regentsByLunchTbody = document.getElementById('regentsByLunchTbody');
const regentsCountLabel   = document.getElementById('regentsCountLabel');
const regentsMeta         = document.getElementById('regentsMeta');

const staffPullOut        = document.getElementById('staffPullOut');
const staffPullRolesTbody = document.getElementById('staffPullRolesTbody');
const staffPullCountLabel = document.getElementById('staffPullCountLabel');
const staffPullMeta       = document.getElementById('staffPullMeta');

// In-memory copy of last loaded locations (full meta)
let lastLoadedLocations = [];

// Quick-set controls
const bathSelect = document.getElementById('bathSelect');
const capAllInp  = document.getElementById('bathCapAll');
const capMInp    = document.getElementById('bathCapM');
const capFInp    = document.getElementById('bathCapF');
const bathTbody  = document.getElementById('bathTbody');

// Attendance controls
const attOut     = document.getElementById('attOut');
const attLateInp = document.getElementById('attLateMinutes');
const campusOutModeSel = document.getElementById('campusOutMode');
const sendToPowerSchoolInp = document.getElementById('sendToPowerSchool');
const regentsPrepExitGateInp = document.getElementById('regentsPrepExitGate');
const chairsReminderEnabledInp = document.getElementById('chairsReminderEnabled');
const webappScheduleModeSel = document.getElementById('webappScheduleMode');

// Shell / inner
const appShell = document.getElementById('appShell');
const appInner = document.getElementById('appInner');

// External nav links
const externalLinksRows = document.getElementById('externalLinksRows');
const externalLinksOut = document.getElementById('externalLinksOut');
const btnAddExternalLink = document.getElementById('btnAddExternalLink');
const btnSaveExternalLinks = document.getElementById('btnSaveExternalLinks');

// Super Admin read-only View as Teacher
const viewAsStaffSelect = document.getElementById('viewAsStaffSelect');
const viewAsEmail = document.getElementById('viewAsEmail');
const viewAsStaffDetail = document.getElementById('viewAsStaffDetail');
const viewAsOut = document.getElementById('viewAsOut');
const btnStartViewAs = document.getElementById('btnStartViewAs');
let viewAsStaffRows = [];

// Persistent academic roster / DOW settings
const academicRosterStatus = document.getElementById('academicRosterStatus');
const academicRosterMeta = document.getElementById('academicRosterMeta');
const academicRosterCounts = document.getElementById('academicRosterCounts');
const academicRosterIssuesTbody = document.getElementById('academicRosterIssuesTbody');
const academicCourseMapRows = document.getElementById('academicCourseMapRows');
const academicRosterOut = document.getElementById('academicRosterOut');
const btnAcademicHealth = document.getElementById('btnAcademicHealth');
const btnAcademicRebuild = document.getElementById('btnAcademicRebuild');
const btnAddCourseMap = document.getElementById('btnAddCourseMap');
const btnSaveCourseMap = document.getElementById('btnSaveCourseMap');

/* ===============================
 * SMALL HELPERS
 * =============================== */
function showBlock(el){ if (el) el.style.display = 'block'; }
function show(el){ if (el) el.style.display = ''; }
function hide(el){ if (el) el.style.display = 'none'; }

function esc(s){
  return String(s).replace(/[&<>"']/g, m=>(
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
  ));
}
function isBathroom(name){
  return String(name||'').toLowerCase().startsWith('bathroom (');
}
function parseBellTimeToMinutes(raw){
  const s = String(raw || '').trim().toUpperCase();
  let m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (m) {
    let hh = Number(m[1]);
    const mm = Number(m[2]);
    const ap = m[3];
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
    if (ap === 'AM') {
      if (hh === 12) hh = 0;
    } else if (hh !== 12) {
      hh += 12;
    }
    return hh * 60 + mm;
  }
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}
function validateBellPeriods(periods){
  const issues = [];
  const parsed = [];
  for (const p of periods){
    const id = String(p?.id || '').trim() || '(blank)';
    const startRaw = String(p?.start || '').trim();
    const endRaw = String(p?.end || '').trim();
    const startMin = parseBellTimeToMinutes(startRaw);
    const endMin = parseBellTimeToMinutes(endRaw);
    if (!startRaw || !endRaw || startMin == null || endMin == null) {
      issues.push(`Invalid time format in ${id}: ${startRaw || '—'} -> ${endRaw || '—'}`);
      continue;
    }
    if (endMin <= startMin) {
      issues.push(`End is not after start in ${id}: ${startRaw} -> ${endRaw}`);
    }
    parsed.push({ id, startRaw, endRaw, startMin, endMin });
  }
  parsed.sort((a,b) => a.startMin - b.startMin || a.endMin - b.endMin || a.id.localeCompare(b.id));
  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1];
    const cur = parsed[i];
    if (cur.startMin < prev.endMin) {
      issues.push(`Overlap: ${prev.id} (${prev.startRaw} - ${prev.endRaw}) overlaps ${cur.id} (${cur.startRaw} - ${cur.endRaw})`);
    }
  }
  return issues;
}

/* ===============================
 * SESSION + LOGIN FLOW
 * =============================== */
async function checkSession(){
  const r = await adminFetch('/admin/session/check', { method:'GET' });
  const data = await r.json().catch(()=>({ ok:false }));
  stashAdminSessionFromResponse(r, data); // important
  if (!r.ok || !data?.ok) return { ok:false };
  return data;
}

function showLogin(msg) {
  showBlock(appShell);   // shell always visible
  hide(appInner);
  showBlock(loginCard);
  if (loginOut && msg != null) loginOut.textContent = msg;
}

function showApp() {
  showBlock(appShell);
  hide(loginCard);
  showBlock(appInner);
}

async function afterLoginBoot() {
  showApp();
  await loadSystemMode();
  await loadEsasStatus();
  await loadExternalNavLinks();
  await loadAcademicRosterSettings();
  await loadViewAsStaffSettings();

  // Auto-run diag, load locations, and hydrate bathroom UI
  document.getElementById('btnDiag')?.click();
  await loadLocationsToEditor();
  await hydrateBathrooms();
  await loadAttendanceCfg();
  await refreshOverviews();
}

// --- Google Sign-In init ---
async function waitForGoogle(timeoutMs = 8000) {
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise(r => setTimeout(r, 50));
  }
  return window.google.accounts.id;
}

window.addEventListener('DOMContentLoaded', async () => {
  // Shell always present; decide whether to show login or app
  showBlock(appShell);
  hide(loginCard);
  hide(appInner);

  // ✅ Session first
  let sess = { ok:false };
  try {
    sess = await checkSession();
  } catch (e) {
    console.warn('session check failed', e);
    sess = { ok:false };
  }
  if (sess.ok) {
    if (String(sess.role || '') !== 'super_admin') {
      showLogin(`Signed in as ${sess.email || 'unknown'} but not authorized for Super Admin Dashboard.`);
      return;
    }
    await afterLoginBoot();
    return;
  }

  // ❌ Not logged in → init GSI
  try {
    const clientId = document.querySelector('meta[name="google-client-id"]')?.content || '';
    if (!clientId) {
      showLogin('Missing google-client-id meta.');
      return;
    }

    const gsi = await waitForGoogle();
    gsi.initialize({
      client_id: clientId,
      callback: onGoogleCredential,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true
    });
    gsi.renderButton(document.getElementById('g_id_signin'), { theme: 'outline', size: 'large' });

    showLogin('Please sign in…');
  } catch (e) {
    showLogin(`Google init failed: ${e.message || e}`);
  }
});

async function onGoogleCredential(resp) {
  try {
    if (loginOut) loginOut.textContent = 'Signing in...';

    const r = await adminFetch('/admin/session/login_google', {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString()
    });
    const data = await r.json().catch(()=>({}));
    stashAdminSessionFromResponse(r, data);
    if (data?.sid) setStoredAdminSessionSid(String(data.sid));
    if(!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);

    if (String(data.role || '') !== 'super_admin') {
      showLogin(`Signed in as ${data.email || 'unknown'} but not authorized for Super Admin Dashboard.`);
      return;
    }

    await afterLoginBoot();
  } catch (e) {
    showLogin(`Login failed: ${e.message || e}`);
  }
}

// Helper fetch that always includes cookies (session)
async function adminFetch(path, init = {}) {
  const u = new URL(path, API_BASE);
  const headers = new Headers(init.headers || {});
  const sid = getStoredAdminSessionSid();
  if (sid && !headers.has(ADMIN_SESSION_HEADER)) {
    headers.set(ADMIN_SESSION_HEADER, sid);
  }

  const resp = await fetch(u, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store'
  });

  // store refreshed sid from headers (if present)
  stashAdminSessionFromResponse(resp, null);
  return resp;
}


/* ===============================
 * GLOBAL SYSTEM MODE
 * =============================== */
let currentSystemMode = null;
const systemModeStatus = document.getElementById('systemModeStatus');
const systemModeDetail = document.getElementById('systemModeDetail');
const systemModeOut = document.getElementById('systemModeOut');
const btnToggleSystemMode = document.getElementById('btnToggleSystemMode');

function renderSystemModeAdmin(data){
  currentSystemMode = data || null;
  const practice = data?.practice === true || String(data?.mode || '').toLowerCase() === 'practice';
  if (systemModeStatus) {
    systemModeStatus.textContent = practice ? '🧪 PRACTICE MODE' : '🟢 LIVE MODE';
    systemModeStatus.style.color = practice ? 'var(--warn)' : 'var(--ok)';
  }
  if (systemModeDetail) {
    systemModeDetail.textContent = practice
      ? 'Non-Visitor operational actions stay in date-scoped Cloudflare practice storage and are never exported. Visitor Management remains LIVE.'
      : 'Normal persistence is enabled. Non-Visitor operational actions can write to connected systems.';
  }
  if (btnToggleSystemMode) {
    btnToggleSystemMode.disabled = !data?.ok;
    btnToggleSystemMode.textContent = practice ? 'Return to LIVE' : 'Enable PRACTICE';
    btnToggleSystemMode.classList.toggle('primary', !practice);
  }
  if (systemModeOut) systemModeOut.textContent = JSON.stringify(data || {}, null, 2);
}

async function loadSystemMode(){
  try{
    const r = await adminFetch('/admin/system_mode', { method:'GET' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    renderSystemModeAdmin(j);
    return j;
  }catch(e){
    if (systemModeStatus) systemModeStatus.textContent = 'MODE CHECK FAILED — WRITES FAIL CLOSED';
    if (systemModeDetail) systemModeDetail.textContent = 'The Worker could not confirm LIVE mode. Operational writes should be treated as Practice/blocked until mode can be read.';
    if (systemModeOut) systemModeOut.textContent = String(e?.message || e);
    if (btnToggleSystemMode) btnToggleSystemMode.disabled = true;
    return null;
  }
}

btnToggleSystemMode?.addEventListener('click', async () => {
  const practice = currentSystemMode?.practice === true || String(currentSystemMode?.mode || '').toLowerCase() === 'practice';
  const next = practice ? 'live' : 'practice';
  const msg = practice
    ? 'Return EagleNEST to LIVE mode? All remaining non-Visitor practice activity for today will be permanently discarded. Nothing from Practice Mode will be exported. Visitor records are unaffected.'
    : 'Enable PRACTICE mode? Real roster/schedules/contacts remain available, but non-Visitor operational activity will stay temporary in Cloudflare and will NOT be sent to PowerSchool or Google Sheets. Visitor Management remains LIVE.';
  if (!confirm(msg)) return;
  btnToggleSystemMode.disabled = true;
  if (systemModeOut) systemModeOut.textContent = `Changing system mode to ${next.toUpperCase()}…`;
  try{
    const r = await adminFetch('/admin/system_mode', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ mode:next })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    renderSystemModeAdmin(j);
    try{ window.dispatchEvent(new CustomEvent('eaglenest-system-mode', { detail:j })); }catch{}
    setTimeout(() => location.reload(), 500);
  }catch(e){
    if (systemModeOut) systemModeOut.textContent = `Mode change failed: ${e?.message || e}`;
    btnToggleSystemMode.disabled = false;
  }
});


/* ===============================
 * ESAS — EMERGENCY STUDENT ACCOUNTABILITY
 * =============================== */
let currentEsasStatus = null;
const esasKind = document.getElementById('esasKind');
const esasLabel = document.getElementById('esasLabel');
const esasStatus = document.getElementById('esasStatus');
const esasDetail = document.getElementById('esasDetail');
const esasOut = document.getElementById('esasOut');
const btnActivateEsas = document.getElementById('btnActivateEsas');
const btnEndEsas = document.getElementById('btnEndEsas');

function renderEsasAdmin(data){
  currentEsasStatus = data || null;
  const active = data?.active === true && data?.incident;
  if (esasStatus) {
    esasStatus.textContent = active
      ? `🚨 ESAS ACTIVE — ${String(data.incident.kind || '').toUpperCase()}`
      : 'ESAS INACTIVE';
    esasStatus.style.color = active ? 'var(--warn)' : 'var(--ok)';
  }
  if (esasDetail) {
    const counts = data?.incident?.counts || {};
    const countText = active && Number.isFinite(Number(counts.expected))
      ? ` • Expected ${Number(counts.expected) || 0} • Accounted ${Number(counts.accounted) || 0} • Unaccounted ${Number(counts.unaccounted) || 0}`
      : '';
    esasDetail.textContent = active
      ? `${data.incident.label || 'Emergency'} • Started ${data.incident.started_at_iso || '—'}${countText} • ${data.incident.incident_id || ''}`
      : 'No emergency accountability incident is active.';
  }
  if (btnActivateEsas) btnActivateEsas.disabled = !data?.ok || active || data?.can_manage !== true;
  if (btnEndEsas) btnEndEsas.disabled = !data?.ok || !active || data?.can_manage !== true;
  if (esasKind) esasKind.disabled = !!active;
  if (esasLabel) esasLabel.disabled = !!active;
  if (esasOut) esasOut.textContent = JSON.stringify(data || {}, null, 2);
}

async function loadEsasStatus(){
  try{
    const r = await adminFetch('/admin/esas/status', { method:'GET' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    renderEsasAdmin(j);
    return j;
  }catch(e){
    if (esasStatus) esasStatus.textContent = 'ESAS STATUS UNAVAILABLE';
    if (esasDetail) esasDetail.textContent = String(e?.message || e);
    if (esasOut) esasOut.textContent = String(e?.message || e);
    if (btnActivateEsas) btnActivateEsas.disabled = true;
    if (btnEndEsas) btnEndEsas.disabled = true;
    return null;
  }
}

btnActivateEsas?.addEventListener('click', async () => {
  const kind = String(esasKind?.value || '').trim().toLowerCase();
  const label = String(esasLabel?.value || '').trim();
  const typeLabel = kind === 'emergency' ? 'LIVE EMERGENCY' : 'DRILL';
  const warning = kind === 'emergency'
    ? `Activate ESAS as a ${typeLabel} right now? This is a LIVE control-plane action even if EagleNEST is in Practice Mode.`
    : `Activate ESAS as a ${typeLabel} right now? This creates a live ESAS incident for testing/drill accountability.`;
  if (!confirm(warning)) return;
  btnActivateEsas.disabled = true;
  try{
    const r = await adminFetch('/admin/esas/activate', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ kind, label })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await loadEsasStatus();
  }catch(e){
    if (esasOut) esasOut.textContent = `ESAS activation failed: ${e?.message || e}`;
    await loadEsasStatus();
  }
});

btnEndEsas?.addEventListener('click', async () => {
  const incidentId = String(currentEsasStatus?.incident?.incident_id || '').trim();
  if (!incidentId) return;
  const label = String(currentEsasStatus?.incident?.label || incidentId);
  if (!confirm(`END the active ESAS incident “${label}”? Stage 1 will archive the incident lifecycle record.`)) return;
  btnEndEsas.disabled = true;
  try{
    const r = await adminFetch('/admin/esas/end', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ incident_id: incidentId })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await loadEsasStatus();
  }catch(e){
    if (esasOut) esasOut.textContent = `ESAS end failed: ${e?.message || e}`;
    await loadEsasStatus();
  }
});

/* ===============================
 * EXTERNAL NAVIGATION LINKS
 * =============================== */
function addExternalLinkRow(link = {}){
  if (!externalLinksRows) return;
  const row = document.createElement('div');
  row.className = 'externalLinkRow';

  const label = document.createElement('input');
  label.type = 'text';
  label.maxLength = 80;
  label.placeholder = 'Label (example: PowerSchool)';
  label.setAttribute('aria-label', 'External link label');
  label.value = String(link?.label || '');

  const url = document.createElement('input');
  url.type = 'url';
  url.maxLength = 2048;
  url.placeholder = 'https://example.com/';
  url.setAttribute('aria-label', 'External link URL');
  url.value = String(link?.url || link?.href || '');

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn ghost';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => row.remove());

  row.append(label, url, remove);
  externalLinksRows.appendChild(row);
}

function renderExternalNavLinks(links){
  if (!externalLinksRows) return;
  externalLinksRows.replaceChildren();
  const rows = Array.isArray(links) ? links : [];
  for (const link of rows) addExternalLinkRow(link);
  if (!rows.length) addExternalLinkRow();
}

function collectExternalNavLinks(){
  const links = [];
  for (const row of externalLinksRows?.querySelectorAll('.externalLinkRow') || []) {
    const inputs = row.querySelectorAll('input');
    const label = String(inputs[0]?.value || '').trim();
    const url = String(inputs[1]?.value || '').trim();
    if (!label && !url) continue;
    if (!label || !url) throw new Error('Every external link row needs both a label and a link.');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error(`Invalid URL for “${label}”.`); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`“${label}” must use an http:// or https:// link.`);
    }
    links.push({ label, url: parsed.href });
  }
  return links;
}

function academicPrettyDate(value){
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toLocaleString([], { dateStyle:'medium', timeStyle:'short' });
}

function academicLabel(key){
  const labels = {
    students:'Students', enrollments:'Enrollments', courses:'Courses', sections:'Sections',
    teacher_assignments:'Teacher assignments', teacher_assignment_labels:'Teacher labels',
    mapped_teachers:'Mapped teachers', staff:'Staff'
  };
  return labels[key] || String(key || '').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

function renderAcademicCourseMappings(mappings){
  if (!academicCourseMapRows) return;
  academicCourseMapRows.replaceChildren();
  const rows = Array.isArray(mappings) ? mappings : [];
  if (!rows.length) addAcademicCourseMapRow();
  else rows.forEach(addAcademicCourseMapRow);
}

function viewAsStaffOptionLabel(row){
  const name = String(row?.name || row?.email || '').trim();
  const email = String(row?.email || '').trim();
  const match = String(row?.teacher_assignment_match || '').trim();
  return `${name}${email && email !== name ? ` — ${email}` : ''}${match ? ` [${match}]` : ''}`;
}
function renderViewAsStaffDetail(){
  if (!viewAsStaffDetail) return;
  const email = String(viewAsEmail?.value || '').trim().toLowerCase();
  const row = viewAsStaffRows.find((x) => String(x?.email || '').toLowerCase() === email);
  if (!row) {
    viewAsStaffDetail.textContent = email ? 'Enter an email from All HS Staff.' : 'Staff choices come from the persistent All HS Staff academic-roster feed.';
    return;
  }
  const match = String(row.teacher_assignment_match || '').trim() || 'not assigned';
  const status = String(row.mapping_status || 'unknown').replaceAll('_',' ');
  viewAsStaffDetail.textContent = `${row.name || row.email} · Teacher Assignments Match: ${match} · Mapping status: ${status}`;
}
async function loadViewAsStaffSettings(){
  if (!viewAsStaffSelect) return;
  if (viewAsOut) viewAsOut.textContent = 'Loading All HS Staff…';
  try {
    const r = await adminFetch('/admin/view_as/staff', { method:'GET' });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    viewAsStaffRows = Array.isArray(j.staff) ? j.staff : [];
    viewAsStaffSelect.replaceChildren(new Option('Select from All HS Staff…',''));
    for (const row of viewAsStaffRows) {
      const opt = new Option(viewAsStaffOptionLabel(row), String(row.email || ''));
      viewAsStaffSelect.appendChild(opt);
    }
    if (viewAsOut) viewAsOut.textContent = `Loaded ${viewAsStaffRows.length} staff email(s). Choose a person or type an email address.`;
    renderViewAsStaffDetail();
  } catch (e) {
    if (viewAsOut) viewAsOut.textContent = `Could not load staff list: ${e?.message || e}`;
  }
}
async function startViewAsTeacher(){
  const email = String(viewAsEmail?.value || '').trim().toLowerCase();
  if (!email) {
    if (viewAsOut) viewAsOut.textContent = 'Choose a person or enter an email address first.';
    return;
  }
  btnStartViewAs.disabled = true;
  if (viewAsOut) viewAsOut.textContent = `Starting read-only view as ${email}…`;
  try {
    const r = await adminFetch('/admin/session/view_as', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ email })
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j?.ok) throw new Error(j?.message || j?.error || `HTTP ${r.status}`);
    location.href = './my_schedule.html';
  } catch (e) {
    if (viewAsOut) viewAsOut.textContent = `Could not start View as Teacher: ${e?.message || e}`;
    btnStartViewAs.disabled = false;
  }
}
viewAsStaffSelect?.addEventListener('change', () => {
  if (viewAsEmail) viewAsEmail.value = String(viewAsStaffSelect.value || '');
  renderViewAsStaffDetail();
});
viewAsEmail?.addEventListener('input', () => {
  const email = String(viewAsEmail.value || '').trim().toLowerCase();
  if (viewAsStaffSelect && viewAsStaffRows.some((x) => String(x.email || '').toLowerCase() === email)) viewAsStaffSelect.value = email;
  else if (viewAsStaffSelect) viewAsStaffSelect.value = '';
  renderViewAsStaffDetail();
});
btnStartViewAs?.addEventListener('click', startViewAsTeacher);

function addAcademicCourseMapRow(mapping = {}){
  if (!academicCourseMapRows) return;
  const tr = document.createElement('tr');
  tr.className = 'academicCourseMapRow';
  const source = String(mapping?.source_code || '').trim();
  const target = String(mapping?.target_code || '').trim();
  const note = String(mapping?.note || '').trim();
  tr.innerHTML = `
    <td><input class="academic-map-source mono" maxlength="120" placeholder="e.g. PE1001" value="${esc(source)}"></td>
    <td><input class="academic-map-target mono" maxlength="120" placeholder="e.g. PE" value="${esc(target)}"></td>
    <td><input class="academic-map-note" maxlength="240" placeholder="Optional note" value="${esc(note)}"></td>
    <td><button class="btn ghost academic-map-remove" type="button">Remove</button></td>`;
  tr.querySelector('.academic-map-remove')?.addEventListener('click', () => {
    tr.remove();
    if (!academicCourseMapRows.querySelector('.academicCourseMapRow')) addAcademicCourseMapRow();
  });
  academicCourseMapRows.appendChild(tr);
}

function collectAcademicCourseMappings(){
  const rows = [];
  const seen = new Set();
  for (const tr of academicCourseMapRows?.querySelectorAll('.academicCourseMapRow') || []) {
    const source_code = String(tr.querySelector('.academic-map-source')?.value || '').trim().toUpperCase().replace(/\s+/g,'');
    const target_code = String(tr.querySelector('.academic-map-target')?.value || '').trim().toUpperCase().replace(/\s+/g,'');
    const note = String(tr.querySelector('.academic-map-note')?.value || '').trim();
    if (!source_code && !target_code && !note) continue;
    if (!source_code || !target_code) throw new Error('Every dictionary row needs both a source code and a target code.');
    if (source_code === target_code) throw new Error(`Mapping ${source_code} points to itself; remove that row instead.`);
    if (seen.has(source_code)) throw new Error(`Duplicate source mapping: ${source_code}`);
    seen.add(source_code);
    rows.push({ source_code, target_code, note });
  }
  return rows;
}

function renderAcademicRosterHealth(data){
  const configured = data?.configured !== false;
  const health = data?.health || {};
  const status = configured ? String(health.status || 'unknown') : 'missing';
  if (academicRosterStatus) {
    academicRosterStatus.dataset.status = status;
    academicRosterStatus.textContent = status === 'ok' ? '✓ Academic roster healthy'
      : status === 'error' ? `✕ Academic roster has ${Number(health.error_count || 0)} error(s)`
      : status === 'warning' ? `⚠ Academic roster has ${Number(health.issue_count || 0)} issue(s)`
      : 'Academic roster has not been built yet';
  }
  if (academicRosterMeta) {
    const src = health.source_generated_at_iso || data?.source_generated_at_iso || '';
    const built = data?.generated_at_iso || health.generated_at_iso || '';
    academicRosterMeta.textContent = configured
      ? `Full-roster source: ${academicPrettyDate(src)} · Compiled: ${academicPrettyDate(built)} · Dictionary entries: ${Number(data?.mapping_count ?? health.mappings ?? 0)}`
      : 'Push the persistent academic roster from the Student Scanner Apps Script to initialize this feature.';
  }
  if (academicRosterCounts) {
    academicRosterCounts.replaceChildren();
    const counts = health.counts || {};
    const order = ['students','enrollments','courses','sections','mapped_teachers','teacher_assignment_labels'];
    for (const key of order) {
      const div = document.createElement('div');
      div.className = 'academicRosterCount';
      div.innerHTML = `<span class="muted">${esc(academicLabel(key))}</span><strong>${Number(counts[key] || 0).toLocaleString()}</strong>`;
      academicRosterCounts.appendChild(div);
    }
  }
  if (academicRosterIssuesTbody) {
    academicRosterIssuesTbody.replaceChildren();
    const issues = Array.isArray(health.issues) ? health.issues : [];
    if (!issues.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3">${configured ? '✓ No roster health issues.' : 'No compiled roster yet.'}</td>`;
      academicRosterIssuesTbody.appendChild(tr);
    } else {
      for (const issue of issues) {
        const tr = document.createElement('tr');
        const sev = String(issue?.severity || 'warning').toLowerCase();
        tr.innerHTML = `<td><span class="academicIssueSeverity ${sev === 'error' ? 'error' : 'warning'}">${esc(sev)}</span></td><td class="mono">${esc(issue?.type || 'issue')}</td><td>${esc(issue?.message || '')}</td>`;
        academicRosterIssuesTbody.appendChild(tr);
      }
    }
  }
}

async function loadAcademicRosterSettings(){
  if (!academicRosterStatus) return;
  if (academicRosterOut) academicRosterOut.textContent = 'Loading persistent academic roster…';
  try {
    const r = await adminFetch('/admin/academic_roster_health', { method:'GET' });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`);
    renderAcademicRosterHealth(j);
    renderAcademicCourseMappings(j.mappings || []);
    if (academicRosterOut) academicRosterOut.textContent = j.configured === false
      ? 'No persistent academic roster has been compiled yet.'
      : `Loaded. ${Number(j.health?.issue_count || 0)} health issue(s).`;
  } catch (e) {
    if (academicRosterStatus) {
      academicRosterStatus.dataset.status = 'error';
      academicRosterStatus.textContent = 'Could not load academic roster health';
    }
    if (academicRosterOut) academicRosterOut.textContent = `Load failed: ${e?.message || e}`;
  }
}

async function saveAcademicCourseMappings(){
  if (!btnSaveCourseMap) return;
  try {
    const mappings = collectAcademicCourseMappings();
    btnSaveCourseMap.disabled = true;
    if (academicRosterOut) academicRosterOut.textContent = 'Saving dictionary and rebuilding academic roster…';
    const r = await adminFetch('/admin/academic_course_map', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ mappings })
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j?.ok) throw new Error(j?.detail || j?.error || `HTTP ${r.status}`);
    renderAcademicCourseMappings(j.mappings || mappings);
    if (j.roster) renderAcademicRosterHealth({ ...j.roster, mappings:j.mappings, mapping_count:j.count });
    if (academicRosterOut) academicRosterOut.textContent = j.rebuild_error
      ? `Dictionary saved, but rebuild failed: ${j.rebuild_error}. The previous compiled roster remains available.`
      : `Saved ${Number(j.count || 0)} mapping(s) and rebuilt from the last stored full-roster source.`;
    await loadAcademicRosterSettings();
  } catch (e) {
    if (academicRosterOut) academicRosterOut.textContent = `Save failed: ${e?.message || e}`;
  } finally {
    btnSaveCourseMap.disabled = false;
  }
}

async function rebuildAcademicRoster(){
  if (!btnAcademicRebuild) return;
  try {
    btnAcademicRebuild.disabled = true;
    if (academicRosterOut) academicRosterOut.textContent = 'Rebuilding from the last known full-roster source…';
    const r = await adminFetch('/admin/academic_roster_rebuild', { method:'POST' });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    renderAcademicRosterHealth(j);
    if (academicRosterOut) academicRosterOut.textContent = `Rebuilt successfully. ${Number(j.health?.issue_count || 0)} health issue(s).`;
  } catch (e) {
    if (academicRosterOut) academicRosterOut.textContent = `Rebuild failed: ${e?.message || e}`;
  } finally {
    btnAcademicRebuild.disabled = false;
  }
}

btnAcademicHealth?.addEventListener('click', loadAcademicRosterSettings);
btnAcademicRebuild?.addEventListener('click', rebuildAcademicRoster);
btnAddCourseMap?.addEventListener('click', () => addAcademicCourseMapRow());
btnSaveCourseMap?.addEventListener('click', saveAcademicCourseMappings);

async function loadExternalNavLinks(){
  if (!externalLinksRows) return;
  if (externalLinksOut) externalLinksOut.textContent = 'Loading…';
  try{
    const r = await adminFetch('/admin/nav_external_links', { method:'GET' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    renderExternalNavLinks(j.links || []);
    if (externalLinksOut) externalLinksOut.textContent = `${Number(j.count || 0)} external link(s) configured.`;
  }catch(e){
    renderExternalNavLinks([]);
    if (externalLinksOut) externalLinksOut.textContent = `Load failed: ${e?.message || e}`;
  }
}

btnAddExternalLink?.addEventListener('click', () => addExternalLinkRow());

btnSaveExternalLinks?.addEventListener('click', async () => {
  btnSaveExternalLinks.disabled = true;
  try{
    const links = collectExternalNavLinks();
    if (externalLinksOut) externalLinksOut.textContent = 'Saving…';
    const r = await adminFetch('/admin/nav_external_links', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ links })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.detail || j?.error || `HTTP ${r.status}`);
    renderExternalNavLinks(j.links || []);
    if (externalLinksOut) externalLinksOut.textContent = `Saved ${Number(j.count || 0)} external link(s). Open/reload another EagleNEST page to see the updated nav.`;
  }catch(e){
    if (externalLinksOut) externalLinksOut.textContent = `Save failed: ${e?.message || e}`;
  }finally{
    btnSaveExternalLinks.disabled = false;
  }
});

/* ===============================
 * SY2627 FIRST-DAY PREFLIGHT
 * =============================== */
const preflightOut = document.getElementById('preflightOut');
const preflightStatus = document.getElementById('preflightStatus');

document.getElementById('btnPreflight')?.addEventListener('click', async () => {
  if (preflightStatus) preflightStatus.textContent = 'Checking…';
  if (preflightOut) preflightOut.textContent = 'Loading release readiness…';
  try {
    const r = await adminFetch('/admin/diag', { method: 'GET' });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    const rel = j.release || {};
    const checks = Array.isArray(rel.checks) ? rel.checks : [];
    const glyph = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
    const lines = checks.map(c => `${glyph[c.status] || c.status}: ${c.label} — ${c.detail}`);
    if (preflightStatus) {
      preflightStatus.textContent = rel.ready
        ? `READY — ${rel.schoolYear || 'SY2627'}`
        : `NOT READY — ${rel.failCount || 0} blocking check(s)`;
    }
    if (preflightOut) {
      preflightOut.textContent = [
        `Status: ${rel.status || 'UNKNOWN'}`,
        `School year: ${rel.schoolYear || '2026-27'}`,
        '',
        ...lines,
        '',
        'Note: Daily Attendance and Meeting Attendance GAS each have their own local preflight function for Script Properties.'
      ].join('\n');
    }
  } catch (e) {
    if (preflightStatus) preflightStatus.textContent = 'CHECK FAILED';
    if (preflightOut) preflightOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * DIAGNOSTICS
 * =============================== */
document.getElementById('btnPing')?.addEventListener('click', async () => {
  if (diagOut) diagOut.textContent = 'Pinging...';
  try {
    const r = await fetch(API_BASE, { method: 'POST', body: new URLSearchParams({ action: 'ping' }) });
    const text = await r.text();
    if (diagOut) diagOut.textContent = `HTTP ${r.status}\n\n${text}`;
  } catch (e) {
    if (diagOut) diagOut.textContent = `Error: ${e.message || e}`;
  }
});

document.getElementById('btnDiag')?.addEventListener('click', async () => {
  if (diagOut) diagOut.textContent = 'Loading /admin/diag...';
  try {
    const r = await adminFetch('/admin/diag', { method: 'GET' });
    if (diagOut) diagOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    if (diagOut) diagOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * ROSTER SYNC
 * =============================== */
document.getElementById('btnSync')?.addEventListener('click', async () => {
  if (syncOut) syncOut.textContent = 'Syncing...';
  try {
    const r = await adminFetch('/admin/sync', { method: 'POST' });
    if (syncOut) syncOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    if (syncOut) syncOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * SCHEDULE + CLASSES PUSH
 * =============================== */
document.getElementById('btnPushSchedule')?.addEventListener('click', async () => {
  if (scheduleOut) scheduleOut.textContent = 'Pushing bell schedule + classes…';
  try {
    const r = await adminFetch('/admin/push_schedule', { method: 'POST' });
    const text = await r.text();
    if (scheduleOut) scheduleOut.textContent = `HTTP ${r.status}\n\n${text}`;
  } catch (e) {
    if (scheduleOut) scheduleOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * DATA OVERVIEWS (read-only)
 * =============================== */
function fmtTs(ts){
  const n = Number(ts);
  if (!Number.isFinite(n) || !n) return '';
  try { return new Date(n).toLocaleString(); } catch { return String(ts); }
}
function fmtPct(p){
  const n = Number(p);
  if (!Number.isFinite(n)) return '';
  return (n * 100).toFixed(1) + '%';
}
function periodSortValue(period){
  const s = String(period || '').trim().toUpperCase();
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  const lch = s.match(/^LCH(\d+)$/);
  if (lch) return 4 + Number(lch[1]) / 10;
  return 99;
}

async function getAdminJson(path) {
  const r = await adminFetch(path, { method: 'GET' });
  const ct = r.headers.get('content-type') || '';
  const text = await r.text();
  if (!ct.includes('application/json')) {
    return { ok:false, status:r.status, text, data:null };
  }
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { ok: !!data, status:r.status, text, data };
}

async function loadBindings() {
  if (bindingsOut) bindingsOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/bindings?limit=1000');
    if (!res.ok) {
      if (bindingsOut) bindingsOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const rows = Array.isArray(data.rows) ? data.rows : [];

    if (bindingsCountLabel) bindingsCountLabel.textContent = rows.length ? `(${rows.length})` : '(0)';

    if (bindingsTbody) {
      bindingsTbody.innerHTML = rows.map(r => {
        const device = esc(r?.device_id || '');
        const loc = esc(r?.location || '');
        return `<tr><td class="mono">${device}</td><td>${loc}</td></tr>`;
      }).join('') || '<tr><td colspan="2" class="muted">No bound devices.</td></tr>';
    }

    const tail = data?.cursor ? `\nnext cursor: ${data.cursor}` : '';
    if (bindingsOut) bindingsOut.textContent = `HTTP ${res.status}\n\nOK. ${rows.length} binding(s).${tail}`;
  } catch (e) {
    if (bindingsOut) bindingsOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadBellSchedule() {
  if (bellOut) bellOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/bell_schedule');
    if (!res.ok) {
      if (bellOut) bellOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const periods = Array.isArray(data.periods) ? data.periods : [];
    const issues = validateBellPeriods(periods);
    if (bellCountLabel) bellCountLabel.textContent = periods.length ? `(${periods.length})` : '(0)';
    if (bellMeta) bellMeta.textContent = [data.date, data.tz, (data.ts ? ('ts: ' + fmtTs(data.ts)) : '')].filter(Boolean).join(' • ');
    if (bellWarning) {
      if (issues.length) {
        bellWarning.style.display = 'block';
        bellWarning.textContent =
          'WARNING: Bell schedule problems detected.\n' +
          issues.map(x => `- ${x}`).join('\n');
      } else {
        bellWarning.style.display = 'none';
        bellWarning.textContent = '';
      }
    }

    if (bellTbody) {
      bellTbody.innerHTML = periods.map(p => {
        const id = esc(p?.id || '');
        const s  = esc(p?.start || '');
        const e  = esc(p?.end || '');
        return `<tr><td class="mono">${id}</td><td class="mono">${s}</td><td class="mono">${e}</td></tr>`;
      }).join('') || '<tr><td colspan="3" class="muted">No schedule stored.</td></tr>';
    }

    if (bellOut) bellOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (bellOut) bellOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadPeriodMap() {
  if (periodMapOut) periodMapOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/period_map_legacy');
    if (!res.ok) {
      if (periodMapOut) periodMapOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const periods = (data.periods && typeof data.periods === 'object') ? data.periods : {};
    const keys = Object.keys(periods).sort((a,b)=>String(a).localeCompare(String(b), undefined, { sensitivity:'base' }));

    if (periodMapCountLabel) periodMapCountLabel.textContent = keys.length ? `(${keys.length})` : '(0)';
    if (periodMapMeta) periodMapMeta.textContent = data.ts ? ('ts: ' + fmtTs(data.ts)) : '';

    if (periodMapTbody) {
      periodMapTbody.innerHTML = keys.map(local => {
        const cfg = periods[local] || {};
        const abbrs = Array.isArray(cfg.abbrs) ? cfg.abbrs : [];
        const send = (cfg.send === true);
        return `<tr><td class="mono">${esc(local)}</td><td class="mono">${esc(abbrs.join(', '))}</td><td class="mono">${send ? 'yes' : 'no'}</td></tr>`;
      }).join('') || '<tr><td colspan="3" class="muted">No period_map stored.</td></tr>';
    }

    if (periodMapOut) periodMapOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (periodMapOut) periodMapOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadClassesSummary() {
  if (classesSummaryOut) classesSummaryOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/student_classes_summary');
    if (!res.ok) {
      if (classesSummaryOut) classesSummaryOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const periods = Array.isArray(data.periods) ? data.periods : [];
    const rosterTotal = Number(data.roster_total || 0) || 0;
    const studentsInMap = Number(data.students_in_map || 0) || 0;

    if (classesSummaryCountLabel) classesSummaryCountLabel.textContent = periods.length ? `(${periods.length})` : '(0)';
    if (classesSummaryMeta) {
      const bits = [];
      if (data.date) bits.push(data.date);
      if (data.ts) bits.push('ts: ' + fmtTs(data.ts));
      if (rosterTotal) bits.push(`roster: ${rosterTotal}`);
      if (studentsInMap) bits.push(`in map: ${studentsInMap}`);
      classesSummaryMeta.textContent = bits.join(' • ');
    }

    if (classesSummaryTbody) {
      classesSummaryTbody.innerHTML = periods.map(row => {
        const pid = esc(row?.period || '');
        const filled = Number(row?.filled || 0) || 0;
        const denom = rosterTotal || studentsInMap || 0;
        const fillText = denom ? `${filled}/${denom}` : String(filled);
        const pct = fmtPct(row?.pct);
        const uniq = Number(row?.unique_rooms || 0) || 0;
        const sample = Array.isArray(row?.sample_rooms) ? row.sample_rooms.join(', ') : '';
        return `<tr>
          <td class="mono">${pid}</td>
          <td class="mono">${esc(fillText)}</td>
          <td class="mono">${esc(pct)}</td>
          <td class="mono">${esc(String(uniq))}</td>
          <td class="mono">${esc(sample)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="muted">No Student_Period_Room_Map stored.</td></tr>';
    }

    if (classesSummaryOut) classesSummaryOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (classesSummaryOut) classesSummaryOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadTeacherAssignments() {
  if (teacherAssignmentsOut) teacherAssignmentsOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/teacher_assignments?full=1');
    if (!res.ok) {
      if (teacherAssignmentsOut) teacherAssignmentsOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const store = (data.data && typeof data.data === 'object') ? data.data : {};
    const configured = data.configured !== false;
    const assignments = Number(data.assignments || 0) || 0;
    const teachers = Number(data.teachers || 0) || 0;
    const sections = Number(data.sections || 0) || 0;
    const matchedSections = Number(data.matched_sections || 0) || 0;
    const roomPeriods = Number(data.room_periods || 0) || 0;
    const unmatched = Array.isArray(data.unmatched_sections) ? data.unmatched_sections : [];
    const byRoomPeriod = (store.by_room_period && typeof store.by_room_period === 'object') ? store.by_room_period : {};
    const matchedRows = Object.values(byRoomPeriod).sort((a, b) => {
      const ap = periodSortValue(a?.period_local);
      const bp = periodSortValue(b?.period_local);
      if (ap !== bp) return ap - bp;
      const ar = String(a?.room || '');
      const br = String(b?.room || '');
      return ar.localeCompare(br, undefined, { numeric:true, sensitivity:'base' });
    });

    if (teacherAssignmentsCountLabel) {
      teacherAssignmentsCountLabel.textContent = configured ? `(${assignments})` : '(not configured)';
    }
    if (teacherAssignmentsMeta) {
      const bits = [];
      if (data.date) bits.push(data.date);
      if (data.ts) bits.push('ts: ' + fmtTs(data.ts));
      if (store.source?.spreadsheet_id) bits.push('source configured');
      if (unmatched.length) bits.push(`${unmatched.length} unmatched/not active today shown`);
      teacherAssignmentsMeta.textContent = bits.join(' • ');
    }

    if (teacherAssignmentsSummaryTbody) {
      const summaryRows = [
        ['Configured', configured ? 'Yes' : 'No'],
        ['Assignments', assignments],
        ['Teacher last names', teachers],
        ['Unique sections', sections],
        ['Matched active sections', matchedSections],
        ['Matched room/periods', roomPeriods],
        ['Rendered room/period rows', matchedRows.length],
        ['Unmatched/not active today', unmatched.length]
      ];
      teacherAssignmentsSummaryTbody.innerHTML = summaryRows.map(([label, value]) => {
        return `<tr><td>${esc(label)}</td><td class="mono">${esc(value)}</td></tr>`;
      }).join('');
    }

    if (teacherAssignmentsMatchedTbody) {
      teacherAssignmentsMatchedTbody.innerHTML = matchedRows.map(row => {
        const teacherNames = Array.isArray(row?.teacher_last_names) ? row.teacher_last_names.join(', ') : '';
        const sectionNames = Array.isArray(row?.sections)
          ? row.sections.map(s => s?.section_name || '').filter(Boolean).join(', ')
          : '';
        return `<tr>
          <td class="mono">${esc(row?.room || '')}</td>
          <td class="mono">${esc(row?.period_local || '')}</td>
          <td class="mono">${esc(teacherNames)}</td>
          <td class="mono">${esc(sectionNames)}</td>
          <td class="mono">${esc(row?.student_count || 0)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="muted">No matched teacher room/periods reported.</td></tr>';
    }

    if (teacherAssignmentsUnmatchedTbody) {
      teacherAssignmentsUnmatchedTbody.innerHTML = unmatched.map(row => {
        const section = row?.section_name || row?.section_key || '';
        const teachersForSection = Array.isArray(row?.teacher_last_names)
          ? row.teacher_last_names.join(', ')
          : '';
        return `<tr>
          <td class="mono">${esc(section)}</td>
          <td class="mono">${esc(teachersForSection)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="2" class="muted">No unmatched teacher sections reported.</td></tr>';
    }

    if (teacherAssignmentsOut) teacherAssignmentsOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (teacherAssignmentsOut) teacherAssignmentsOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadRegentsSummary() {
  if (regentsOut) regentsOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/regents_students_summary');
    if (!res.ok) {
      if (regentsOut) regentsOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const total = Number(data.total_students || 0) || 0;
    const cnt   = Number(data.regents_students || 0) || 0;
    const by = (data.by_lunch && typeof data.by_lunch === 'object') ? data.by_lunch : {};

    if (regentsCountLabel) regentsCountLabel.textContent = total ? `(${cnt}/${total})` : `(${cnt})`;
    if (regentsMeta) {
      const bits = [];
      if (data.roster_ts) bits.push('roster ts: ' + fmtTs(data.roster_ts));
      if (typeof data.pct === 'number') bits.push('pct: ' + fmtPct(data.pct));
      regentsMeta.textContent = bits.join(' • ');
    }

    const lunchRows = Object.entries(by).map(([l, c]) => ({ lunch: l, count: Number(c || 0) || 0 }))
      .sort((a,b) => (b.count - a.count) || String(a.lunch).localeCompare(String(b.lunch), undefined, { sensitivity:'base' }));

    if (regentsByLunchTbody) {
      regentsByLunchTbody.innerHTML = lunchRows.map(r => {
        return `<tr><td class="mono">${esc(r.lunch)}</td><td class="mono">${esc(String(r.count))}</td></tr>`;
      }).join('') || '<tr><td colspan="2" class="muted">No Regents_Prep students flagged.</td></tr>';
    }

    if (regentsOut) regentsOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (regentsOut) regentsOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadStaffPullRoles() {
  if (staffPullOut) staffPullOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/staff_pull_roles');
    if (!res.ok) {
      if (staffPullOut) staffPullOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const rows = Array.isArray(data.rows) ? data.rows : [];

    if (staffPullCountLabel) staffPullCountLabel.textContent = rows.length ? `(${rows.length})` : '(0)';
    if (staffPullMeta) staffPullMeta.textContent = data.ts ? ('ts: ' + fmtTs(data.ts)) : '';

    if (staffPullRolesTbody) {
      staffPullRolesTbody.innerHTML = rows.map(r => {
        return `<tr><td class="mono">${esc(r?.email || '')}</td><td class="mono">${esc(r?.title || '')}</td></tr>`;
      }).join('') || '<tr><td colspan="2" class="muted">No staff_pull allowlist stored.</td></tr>';
    }

    if (staffPullOut) staffPullOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (staffPullOut) staffPullOut.textContent = `Error: ${e.message || e}`;
  }
}

async function refreshOverviews() {
  await Promise.all([
    loadBindings(),
    loadBellSchedule(),
    loadPeriodMap(),
    loadClassesSummary(),
    loadTeacherAssignments(),
    loadRegentsSummary(),
    loadStaffPullRoles()
  ]);
}

document.getElementById('btnRefreshOverviews')?.addEventListener('click', refreshOverviews);
document.getElementById('btnLoadBindings')?.addEventListener('click', loadBindings);
document.getElementById('btnLoadBell')?.addEventListener('click', loadBellSchedule);
document.getElementById('btnLoadPeriodMap')?.addEventListener('click', loadPeriodMap);
document.getElementById('btnLoadClassesSummary')?.addEventListener('click', loadClassesSummary);
document.getElementById('btnLoadTeacherAssignments')?.addEventListener('click', loadTeacherAssignments);
document.getElementById('btnLoadRegentsSummary')?.addEventListener('click', loadRegentsSummary);
document.getElementById('btnLoadStaffPullRoles')?.addEventListener('click', loadStaffPullRoles);

/* ===============================
 * LOCATIONS
 * =============================== */
// Render table rows from a list of location objects:
// { name, type, mode, visible }
function renderLocationsTable(rows) {
  if (!locationsTbody) return;

  locationsTbody.innerHTML = '';
  (rows || []).forEach((rec, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.index = String(idx);

    const name   = rec?.name   || '';
    const type   = rec?.type   || '';
    const mode   = rec?.mode   || '';
    const vis    = (rec?.visible !== false); // default true

    tr.innerHTML = `
      <td><input type="text" class="loc-name" value="${esc(name)}" /></td>
      <td><input type="text" class="loc-type" value="${esc(type)}" /></td>
      <td><input type="text" class="loc-mode" value="${esc(mode)}" /></td>
      <td style="text-align:center;">
        <input type="checkbox" class="loc-visible"${vis ? ' checked' : ''}>
      </td>
      <td style="text-align:center;">
        <button type="button" class="btn ghost btnLocDelete" style="padding:4px 8px;font-size:11px;">✕</button>
      </td>
    `;
    locationsTbody.appendChild(tr);
  });

  if (locationsCountLabel) {
    locationsCountLabel.textContent =
      rows && rows.length ? `${rows.length} locations (including hidden/class)` : 'No locations loaded yet.';
  }
}

// Collect current table state into objects we can POST
function gatherLocationsFromUI() {
  const out = [];
  if (!locationsTbody) return out;

  locationsTbody.querySelectorAll('tr').forEach(tr => {
    const nameInput = tr.querySelector('.loc-name');
    if (!nameInput) return;

    const name = nameInput.value.trim();
    if (!name) return;

    const typeInput = tr.querySelector('.loc-type');
    const modeInput = tr.querySelector('.loc-mode');
    const visInput  = tr.querySelector('.loc-visible');

    out.push({
      name,
      type: (typeInput?.value || '').trim(),
      mode: (modeInput?.value || '').trim(),
      visible: !!(visInput && visInput.checked)
    });
  });
  return out;
}

// Load locations (including hidden/class) from Worker
async function loadLocationsToEditor() {
  if (locationsOut) locationsOut.textContent = 'Loading locations...';
  try {
    // Public action is fine (origin-restricted by Worker)
    const r = await fetch(API_BASE, {
      method: 'POST',
      body: new URLSearchParams({ action: 'locations' }),
    });

    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      if (locationsOut) locationsOut.textContent = `Non-JSON:\n${await r.text()}`;
      return [];
    }

    const data = await r.json();
    const visibleNames = Array.isArray(data.locations) ? data.locations : [];
    const meta = Array.isArray(data.meta) ? data.meta : [];

    const recs = meta.length
      ? meta
      : visibleNames.map(name => ({ name, type: '', mode: '', visible: true }));

    lastLoadedLocations = recs;
    renderLocationsTable(recs);
    if (locationsOut) locationsOut.textContent = `Loaded ${recs.length} locations (meta + visibility).`;
    return recs;
  } catch (e) {
    if (locationsOut) locationsOut.textContent = `Error: ${e.message || e}`;
    return [];
  }
}

document.getElementById('btnLoadLocations')?.addEventListener('click', loadLocationsToEditor);

document.getElementById('btnPushLocations')?.addEventListener('click', async () => {
  try {
    if (locationsOut) locationsOut.textContent = 'Pushing...';

    const arr = gatherLocationsFromUI();
    const r = await adminFetch('/admin/push_locations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locations: arr })
    });

    if (locationsOut) locationsOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
    lastLoadedLocations = arr.slice();

    await hydrateBathrooms();
  } catch (e) {
    if (locationsOut) locationsOut.textContent = `Error: ${e.message || e}`;
  }
});

document.getElementById('btnResetLocations')?.addEventListener('click', () => {
  if (!lastLoadedLocations.length) {
    if (locationsOut) locationsOut.textContent = 'Nothing to reset — load locations first.';
    return;
  }
  if (confirm('Reset to last loaded locations from Worker?')) {
    renderLocationsTable(lastLoadedLocations);
    if (locationsOut) locationsOut.textContent = 'Editor reset to last loaded locations.';
  }
});

document.getElementById('btnAddLocation')?.addEventListener('click', () => {
  const rows = gatherLocationsFromUI();
  rows.push({ name: '', type: '', mode: '', visible: true });
  lastLoadedLocations = rows.slice();
  renderLocationsTable(rows);
});

locationsTbody?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.btnLocDelete');
  if (!btn) return;
  const tr = btn.closest('tr');
  if (!tr) return;

  const rows = gatherLocationsFromUI();
  const idx = Array.prototype.indexOf.call(locationsTbody.children, tr);
  if (idx >= 0 && idx < rows.length) rows.splice(idx, 1);

  lastLoadedLocations = rows.slice();
  renderLocationsTable(rows);
});

/* ===============================
 * BATHROOM CAPS (helpers)
 * =============================== */
async function getCap(location, gender /* 'M'|'F'|undefined */, useSession = true) {
  const body = new URLSearchParams({ location });
  if (gender) body.set('gender', gender);

  const fetcher = useSession ? adminFetch : fetch;
  const r = await fetcher('/admin/bath_cap', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString()
  });

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return { ok:false, error:'non_json', status:r.status, text:await r.text() };
  }
  return await r.json().catch(() => ({}));
}

async function setCap(location, cap, gender /* optional */) {
  const body = new URLSearchParams({ location, cap: String(cap) });
  if (gender) body.set('gender', gender);

  const r = await adminFetch('/admin/bath_cap', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString()
  });

  const ct = r.headers.get('content-type') || '';
  const text = await r.text();
  return { ok: r.ok && ct.includes('application/json'), status: r.status, text };
}

/* ===============================
 * ATTENDANCE CFG
 * =============================== */
async function getAttendanceCfg() {
  const r = await adminFetch('/admin/attendance_cfg', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams().toString()
  });

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return { ok:false, error:'non_json', status:r.status, text: await r.text() };
  }
  return await r.json().catch(() => ({}));
}

function normalizeCampusOutMode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'manual_scan_out' || v === 'manual') return 'manual_scan_out';
  return 'auto_flush';
}

function campusOutModeLabel(mode) {
  return normalizeCampusOutMode(mode) === 'manual_scan_out'
    ? 'Manual student scan-out'
    : 'Automatic flush';
}

function normalizeSendToPowerSchool(raw) {
  if (typeof raw === 'boolean') return raw;
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  return true;
}

function powerSchoolSyncLabel(enabled) {
  return normalizeSendToPowerSchool(enabled) ? 'On' : 'Off';
}

function normalizeWebappScheduleMode(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'original' ? 'original' : 'special';
}

function webappScheduleModeLabel(mode) {
  return normalizeWebappScheduleMode(mode) === 'original' ? 'Original' : 'Special';
}

async function saveAttendanceCfg({ lateMin, campusOutMode, sendToPowerSchool, chairsReminderEnabled, webappScheduleMode }) {
  const body = new URLSearchParams();
  body.set('late_min', String(lateMin));
  body.set('campus_out_mode', normalizeCampusOutMode(campusOutMode));
  body.set('send_to_powerschool', normalizeSendToPowerSchool(sendToPowerSchool) ? 'true' : 'false');
  body.set('regents_prep_exit_gate', regentsPrepExitGateInp?.checked ? 'true' : 'false');
  body.set('chairs_reminder_enabled', chairsReminderEnabled === false ? 'false' : 'true');
  body.set('webapp_schedule_mode', normalizeWebappScheduleMode(webappScheduleMode));

  const r = await adminFetch('/admin/attendance_cfg', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString()
  });

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return { ok:false, error:'non_json', status:r.status, text: await r.text() };
  }
  return await r.json().catch(() => ({}));
}

async function loadAttendanceCfg() {
  if (!attOut || !attLateInp || !campusOutModeSel || !sendToPowerSchoolInp || !regentsPrepExitGateInp || !chairsReminderEnabledInp || !webappScheduleModeSel) return;
  attOut.textContent = 'Loading…';
  try {
    const cfg = await getAttendanceCfg();
    if (!cfg.ok) throw new Error(cfg.error || 'Unknown error');
    attLateInp.value = Number(cfg.late_min) || '';
    campusOutModeSel.value = normalizeCampusOutMode(
      cfg.campus_out_mode || cfg.campusOutMode || cfg.dismissal_mode
    );
    sendToPowerSchoolInp.checked = normalizeSendToPowerSchool(
      cfg.send_to_powerschool ?? cfg.sendToPowerSchool ?? cfg.push_to_powerschool
    );
    regentsPrepExitGateInp.checked = !!(cfg.regents_prep_exit_gate ?? cfg.regentsPrepExitGate);
    chairsReminderEnabledInp.checked = (cfg.chairs_reminder_enabled ?? cfg.chairsReminderEnabled) !== false;
    webappScheduleModeSel.value = normalizeWebappScheduleMode(
      cfg.webapp_schedule_mode ?? cfg.webappScheduleMode
    );
    attOut.textContent =
      `Current Late threshold: ${cfg.late_min} minute(s). ` +
      `Campus-out dismissal: ${campusOutModeLabel(campusOutModeSel.value)}. ` +
      `PowerSchool sync: ${powerSchoolSyncLabel(sendToPowerSchoolInp.checked)}. ` +
      `Regents Prep exit gate: ${regentsPrepExitGateInp.checked ? 'On' : 'Off'}. ` +
      `Chair reminder: ${chairsReminderEnabledInp.checked ? 'On' : 'Off'}. ` +
      `Web app lunch/advisory schedule: ${webappScheduleModeLabel(webappScheduleModeSel.value)}.`;
  } catch (e) {
    attOut.textContent = `Error: ${e.message || e}`;
  }
}

document.getElementById('btnAttLoad')?.addEventListener('click', loadAttendanceCfg);

document.getElementById('btnAttSave')?.addEventListener('click', async () => {
  if (!attOut || !attLateInp || !campusOutModeSel || !sendToPowerSchoolInp || !regentsPrepExitGateInp || !chairsReminderEnabledInp || !webappScheduleModeSel) return;

  const raw = attLateInp.value.trim();
  const n = Number(raw);

  if (!Number.isFinite(n) || n <= 0 || n >= 120) {
    attOut.textContent = 'Enter a number between 1 and 119.';
    return;
  }

  attOut.textContent = 'Saving…';
  try {
    const cfg = await saveAttendanceCfg({
      lateMin: n,
      campusOutMode: campusOutModeSel.value,
      sendToPowerSchool: sendToPowerSchoolInp.checked,
      chairsReminderEnabled: chairsReminderEnabledInp.checked,
      webappScheduleMode: webappScheduleModeSel.value
    });
    if (!cfg.ok) throw new Error(cfg.error || 'Unknown error');
    const savedMode = normalizeCampusOutMode(
      cfg.campus_out_mode || cfg.campusOutMode || cfg.dismissal_mode || campusOutModeSel.value
    );
    const sendToPowerSchool = normalizeSendToPowerSchool(
      cfg.send_to_powerschool ?? cfg.sendToPowerSchool ?? cfg.push_to_powerschool ?? sendToPowerSchoolInp.checked
    );
    const regentsPrepExitGate = !!(cfg.regents_prep_exit_gate ?? cfg.regentsPrepExitGate ?? regentsPrepExitGateInp.checked);
    const chairsReminderEnabled = (cfg.chairs_reminder_enabled ?? cfg.chairsReminderEnabled ?? chairsReminderEnabledInp.checked) !== false;
    const webappScheduleMode = normalizeWebappScheduleMode(
      cfg.webapp_schedule_mode ?? cfg.webappScheduleMode ?? webappScheduleModeSel.value
    );
    campusOutModeSel.value = savedMode;
    sendToPowerSchoolInp.checked = sendToPowerSchool;
    regentsPrepExitGateInp.checked = regentsPrepExitGate;
    chairsReminderEnabledInp.checked = chairsReminderEnabled;
    webappScheduleModeSel.value = webappScheduleMode;
    attOut.textContent =
      `Saved. Late after ${cfg.late_min} minute(s). ` +
      `Campus-out dismissal: ${campusOutModeLabel(savedMode)}. ` +
      `PowerSchool sync: ${powerSchoolSyncLabel(sendToPowerSchool)}. ` +
      `Regents Prep exit gate: ${regentsPrepExitGate ? 'On' : 'Off'}. ` +
      `Chair reminder: ${chairsReminderEnabled ? 'On' : 'Off'}. ` +
      `Web app lunch/advisory schedule: ${webappScheduleModeLabel(webappScheduleMode)}.`;
  } catch (e) {
    attOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * BATHROOM UI — hydrate, quick set, table
 * =============================== */
async function hydrateBathrooms() {
  try {
    const r = await adminFetch('/admin/state', { method: 'GET' });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.includes('application/json')) {
      await hydrateFromPublicLocations();
      return;
    }

    const data = await r.json().catch(() => ({}));
    const rawList = Array.isArray(data?.locations?.list) ? data.locations.list : [];

    const names = rawList
      .map(loc => (loc && typeof loc === 'object') ? String(loc.name || '').trim() : String(loc || '').trim())
      .filter(Boolean);

    const bathrooms = names.filter(isBathroom).sort((a,b)=>a.localeCompare(b));

    if (bathSelect) {
      bathSelect.innerHTML =
        '<option value="">Select bathroom…</option>' +
        bathrooms.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
    }

    await loadBathTable(bathrooms);
  } catch {
    await hydrateFromPublicLocations();
  }
}

async function hydrateFromPublicLocations() {
  const locs = await loadLocationsToEditor();

  const names = (locs || [])
    .map(rec => String(rec?.name || '').trim())
    .filter(Boolean);

  const bathrooms = names.filter(isBathroom).sort((a,b)=>a.localeCompare(b));

  if (bathSelect) {
    bathSelect.innerHTML =
      '<option value="">Select bathroom…</option>' +
      bathrooms.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  }

  await loadBathTable(bathrooms);
}

async function loadBathTable(bathrooms /* optional */) {
  if (bathTableOut) bathTableOut.textContent = 'Loading caps…';

  try {
    if (!bathrooms) {
      const r = await adminFetch('/admin/state', { method: 'GET' });
      const data = await r.json().catch(()=> ({}));
      const rawList = Array.isArray(data?.locations?.list) ? data.locations.list : [];

      const names = rawList
        .map(loc => (loc && typeof loc === 'object') ? String(loc.name || '').trim() : String(loc || '').trim())
        .filter(Boolean);

      bathrooms = names.filter(isBathroom).sort((a,b)=>a.localeCompare(b));
    }

    if (bathTbody) bathTbody.innerHTML = '';

    for (const loc of (bathrooms || [])) {
      const [all, m, f] = await Promise.all([ getCap(loc), getCap(loc,'M'), getCap(loc,'F') ]);

      const tr = document.createElement('tr');
      tr.dataset.loc = loc;

      const allVal = Number(all?.cap) || '';
      const mVal   = Number(m?.cap)   || '';
      const fVal   = Number(f?.cap)   || '';

      tr.innerHTML = `
        <td class="mono">${esc(loc)}</td>
        <td><input type="number" min="1" class="cap cap-all" value="${esc(allVal)}" placeholder="—" /></td>
        <td><input type="number" min="1" class="cap cap-m"   value="${esc(mVal)}"   placeholder="—" /></td>
        <td><input type="number" min="1" class="cap cap-f"   value="${esc(fVal)}"   placeholder="—" /></td>
        <td class="rowBtns">
          <button class="btn btnRowSaveAll">Save ALL</button>
          <button class="btn btnRowSaveM">M</button>
          <button class="btn btnRowSaveF">F</button>
          <button class="btn ghost btnRowRefresh">↻</button>
        </td>
      `;

      bathTbody?.appendChild(tr);
      wireBathRow(tr);
    }

    if (bathTableOut) bathTableOut.textContent = `Loaded ${bathTbody?.children?.length || 0} bathrooms.`;
  } catch (e) {
    if (bathTableOut) bathTableOut.textContent = `Error: ${e.message || e}`;
  }
}

function wireBathRow(tr) {
  const loc = tr.dataset.loc;
  const allInp = tr.querySelector('.cap-all');
  const mInp   = tr.querySelector('.cap-m');
  const fInp   = tr.querySelector('.cap-f');

  tr.querySelector('.btnRowSaveAll')?.addEventListener('click', async () => {
    if (!allInp?.value) return alert('Enter ALL cap');
    const res = await setCap(loc, Number(allInp.value));
    toastRowResult(tr, res);
  });

  tr.querySelector('.btnRowSaveM')?.addEventListener('click', async () => {
    if (!mInp?.value) return alert('Enter M cap');
    const res = await setCap(loc, Number(mInp.value), 'M');
    toastRowResult(tr, res);
  });

  tr.querySelector('.btnRowSaveF')?.addEventListener('click', async () => {
    if (!fInp?.value) return alert('Enter F cap');
    const res = await setCap(loc, Number(fInp.value), 'F');
    toastRowResult(tr, res);
  });

  tr.querySelector('.btnRowRefresh')?.addEventListener('click', async () => {
    const [all, m, f] = await Promise.all([ getCap(loc), getCap(loc,'M'), getCap(loc,'F') ]);
    if (allInp) allInp.value = Number(all?.cap) || '';
    if (mInp)   mInp.value   = Number(m?.cap)   || '';
    if (fInp)   fInp.value   = Number(f?.cap)   || '';
  });
}

function toastRowResult(tr, res) {
  tr.classList.remove('row-ok','row-bad');
  if (res.ok) {
    tr.classList.add('row-ok');
    setTimeout(()=> tr.classList.remove('row-ok'), 800);
  } else {
    tr.classList.add('row-bad');
    setTimeout(()=> tr.classList.remove('row-bad'), 1200);
  }
  if (bathTableOut) bathTableOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
}

/* Quick-set buttons */
document.getElementById('btnBathGetSelected')?.addEventListener('click', async () => {
  try {
    const loc = bathSelect?.value?.trim() || '';
    if (!loc) throw new Error('Select a bathroom first');
    if (bathOut) bathOut.textContent = 'Fetching caps...';

    const [all, m, f] = await Promise.all([ getCap(loc), getCap(loc,'M'), getCap(loc,'F') ]);

    if (capAllInp) capAllInp.value = Number(all?.cap) || '';
    if (capMInp)   capMInp.value   = Number(m?.cap)   || '';
    if (capFInp)   capFInp.value   = Number(f?.cap)   || '';

    if (bathOut) bathOut.textContent = `Loaded caps for "${loc}".`;
  } catch (e) {
    if (bathOut) bathOut.textContent = `Error: ${e.message || e}`;
  }
});

document.getElementById('btnBathSetAll')?.addEventListener('click', async () => {
  const loc = bathSelect?.value?.trim() || '';
  const cap = capAllInp?.value?.trim() || '';
  if (!loc || !cap) return (bathOut && (bathOut.textContent = 'Select bathroom and enter ALL cap.'));
  if (bathOut) bathOut.textContent = 'Setting ALL...';

  const res = await setCap(loc, Number(cap));
  if (bathOut) bathOut.textContent = `HTTP ${res.status}\n\n${res.text}`;

  const row = [...(bathTbody?.children || [])].find(tr => tr.dataset.loc === loc);
  row?.querySelector('.cap-all') && (row.querySelector('.cap-all').value = Number(cap));
});

document.getElementById('btnBathSetM')?.addEventListener('click', async () => {
  const loc = bathSelect?.value?.trim() || '';
  const cap = capMInp?.value?.trim() || '';
  if (!loc || !cap) return (bathOut && (bathOut.textContent = 'Select bathroom and enter M cap.'));
  if (bathOut) bathOut.textContent = 'Setting M...';

  const res = await setCap(loc, Number(cap), 'M');
  if (bathOut) bathOut.textContent = `HTTP ${res.status}\n\n${res.text}`;

  const row = [...(bathTbody?.children || [])].find(tr => tr.dataset.loc === loc);
  row?.querySelector('.cap-m') && (row.querySelector('.cap-m').value = Number(cap));
});

document.getElementById('btnBathSetF')?.addEventListener('click', async () => {
  const loc = bathSelect?.value?.trim() || '';
  const cap = capFInp?.value?.trim() || '';
  if (!loc || !cap) return (bathOut && (bathOut.textContent = 'Select bathroom and enter F cap.'));
  if (bathOut) bathOut.textContent = 'Setting F...';

  const res = await setCap(loc, Number(cap), 'F');
  if (bathOut) bathOut.textContent = `HTTP ${res.status}\n\n${res.text}`;

  const row = [...(bathTbody?.children || [])].find(tr => tr.dataset.loc === loc);
  row?.querySelector('.cap-f') && (row.querySelector('.cap-f').value = Number(cap));
});

document.getElementById('btnBathLoadTable')?.addEventListener('click', async () => {
  if (bathTableOut) bathTableOut.textContent = 'Reloading locations…';
  await hydrateBathrooms();
});

/* ===============================
 * DEVICE BIND / UNBIND
 * =============================== */
document.getElementById('btnBind')?.addEventListener('click', async () => {
  try {
    const dev = document.getElementById('bindDeviceId')?.value?.trim() || '';
    const loc = document.getElementById('bindLocation')?.value?.trim() || '';
    if (!dev || !loc) throw new Error('device + location required');

    if (bindOut) bindOut.textContent = 'Binding...';

    const r = await adminFetch('/admin/bind', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ device_id: dev, location: loc }).toString()
    });

    if (bindOut) bindOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    if (bindOut) bindOut.textContent = `Error: ${e.message || e}`;
  }
});

document.getElementById('btnUnbind')?.addEventListener('click', async () => {
  try {
    const dev = document.getElementById('bindDeviceId')?.value?.trim() || '';
    if (!dev) throw new Error('device required');

    if (bindOut) bindOut.textContent = 'Unbinding...';

    const r = await adminFetch('/admin/unbind', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ device_id: dev }).toString()
    });

    if (bindOut) bindOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    if (bindOut) bindOut.textContent = `Error: ${e.message || e}`;
  }
});

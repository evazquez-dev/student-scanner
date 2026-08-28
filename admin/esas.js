const META_API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').trim();
const API_BASE = (META_API_BASE ? META_API_BASE.replace(/\/*$/, '') : location.origin) + '/';
const GOOGLE_CLIENT_ID = (document.querySelector('meta[name="google-client-id"]')?.content || '').trim();

const ADMIN_SESSION_HEADER = 'x-admin-session';
const SESSION_KEYS = [
  'esas_admin_session_v1',
  'ss_admin_session_sid_v1',
  'teacher_att_admin_session_v1',
  'my_schedule_admin_session_v1',
  'hallway_admin_session_v1',
  'admin_session_v1',
  'admin_session_sid'
];

const POLL_MS = 4000;
const SEARCH_DEBOUNCE_MS = 260;

const $ = (id) => document.getElementById(id);

const loginCard = $('loginCard');
const loginOut = $('loginOut');
const appShell = $('appShell');
const incidentHeader = $('incidentHeader');
const incidentKind = $('incidentKind');
const incidentTitle = $('incidentTitle');
const incidentMeta = $('incidentMeta');
const countGrid = $('countGrid');
const expectedCount = $('expectedCount');
const accountedCount = $('accountedCount');
const unaccountedCount = $('unaccountedCount');
const syncBar = $('syncBar');
const syncText = $('syncText');
const inactiveCard = $('inactiveCard');
const activeApp = $('activeApp');
const contextStrip = $('contextStrip');
const refreshBtn = $('refreshBtn');

const tabRoster = $('tabRoster');
const tabSearch = $('tabSearch');
const tabOps = $('tabOps');
const panelRoster = $('panelRoster');
const panelSearch = $('panelSearch');
const panelOps = $('panelOps');
const rosterBadge = $('rosterBadge');
const opsBadge = $('opsBadge');

const rosterHint = $('rosterHint');
const rosterProgress = $('rosterProgress');
const rosterList = $('rosterList');
const rosterEmpty = $('rosterEmpty');

const studentSearch = $('studentSearch');
const clearSearchBtn = $('clearSearchBtn');
const searchStatus = $('searchStatus');
const searchList = $('searchList');

const opsFilter = $('opsFilter');
const clearOpsFilterBtn = $('clearOpsFilterBtn');
const opsStatus = $('opsStatus');
const opsList = $('opsList');
const opsEmpty = $('opsEmpty');

const toast = $('toast');

let SESSION = null;
let ESAS_STATUS = null;
let MY_ROSTER = [];
let OPS_UNACCOUNTED = [];
let SEARCH_RESULTS = [];
let ACTIVE_VIEW = 'roster';
let POLL_TIMER = null;
let REFRESH_IN_FLIGHT = false;
let LAST_SYNC_MS = 0;
let SEARCH_TIMER = null;
let SEARCH_SEQ = 0;
let TOAST_TIMER = null;
const PENDING_OSIS = new Set();

function esc(value){
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function cleanEmail(value){
  return String(value || '').trim().toLowerCase();
}

function getStoredAdminSessionSid(){
  try{
    for (const key of SESSION_KEYS){
      const sid = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
      if (sid) return sid;
    }
  }catch{}
  return '';
}

function setStoredAdminSessionSid(sid){
  const value = String(sid || '').trim();
  if (!value) return;
  try{
    for (const key of SESSION_KEYS){
      sessionStorage.setItem(key, value);
      localStorage.setItem(key, value);
    }
  }catch{}
}

function clearStoredAdminSessionSid(){
  try{
    for (const key of SESSION_KEYS){
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  }catch{}
}

function stashSessionFromResponse(response, data){
  try{
    const headerSid = String(
      response?.headers?.get(ADMIN_SESSION_HEADER) ||
      response?.headers?.get('X-Admin-Session') ||
      ''
    ).trim();
    const bodySid = String(data?.sid || '').trim();
    const sid = bodySid || headerSid;
    if (sid) setStoredAdminSessionSid(sid);
  }catch{}
}

async function adminFetch(path, init = {}){
  const headers = new Headers(init.headers || {});
  const sid = getStoredAdminSessionSid();
  if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
  const response = await fetch(new URL(path, API_BASE), {
    ...init,
    headers,
    credentials:'include',
    cache:'no-store'
  });
  stashSessionFromResponse(response, null);
  return response;
}

async function getJson(path, init = {}){
  const response = await adminFetch(path, init);
  const data = await response.json().catch(() => ({}));
  stashSessionFromResponse(response, data);
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.message || data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data?.error || '';
    error.data = data;
    throw error;
  }
  return data;
}

function showToast(message){
  if (!toast) return;
  toast.textContent = String(message || 'Something went wrong.');
  toast.hidden = false;
  if (TOAST_TIMER) clearTimeout(TOAST_TIMER);
  TOAST_TIMER = setTimeout(() => { toast.hidden = true; }, 5000);
}

function setSync(mode, text){
  syncBar.classList.remove('sync-bar--ok','sync-bar--checking','sync-bar--error');
  syncBar.classList.add(`sync-bar--${mode}`);
  syncText.textContent = text;
}

function syncAgeText(){
  if (!LAST_SYNC_MS) return 'Not yet synced';
  const sec = Math.max(0, Math.round((Date.now() - LAST_SYNC_MS) / 1000));
  return sec <= 1 ? 'Synced just now' : `Synced ${sec}s ago`;
}

function isActive(){
  return ESAS_STATUS?.active === true && !!ESAS_STATUS?.incident;
}

function canManage(){
  return ESAS_STATUS?.can_manage === true;
}

function actorEmail(){
  return cleanEmail(SESSION?.email);
}

function isViewAsReadOnly(){
  return SESSION?.view_as?.active === true;
}

function formatStarted(iso){
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
}

function scheduleText(incident){
  const context = incident?.context || {};
  const period = String(context.period_local || '').trim();
  const mode = String(context.schedule_mode || '').replaceAll('_', ' ').trim();
  if (period) return `Period ${period}${mode ? ` · ${mode}` : ''}`;
  return mode || 'No current period';
}

function renderIncident(){
  const active = isActive();
  const incident = ESAS_STATUS?.incident || null;

  incidentHeader.classList.remove('incident-header--inactive','incident-header--drill','incident-header--emergency');
  if (!active) {
    incidentHeader.classList.add('incident-header--inactive');
    incidentKind.textContent = 'ESAS';
    incidentTitle.textContent = 'Emergency Accountability';
    incidentMeta.textContent = 'No active drill or emergency.';
    countGrid.hidden = true;
    activeApp.hidden = true;
    inactiveCard.hidden = false;
    tabOps.hidden = true;
    return;
  }

  const kind = String(incident.kind || 'emergency').toLowerCase();
  incidentHeader.classList.add(kind === 'drill' ? 'incident-header--drill' : 'incident-header--emergency');
  incidentKind.textContent = kind === 'drill' ? 'DRILL ACTIVE' : 'EMERGENCY ACTIVE';
  incidentTitle.textContent = incident.label || (kind === 'drill' ? 'ESAS Drill' : 'Emergency Accountability');

  const started = formatStarted(incident.started_at_iso);
  incidentMeta.textContent = `${scheduleText(incident)}${started ? ` · Started ${started}` : ''}`;

  const counts = incident.counts || {};
  expectedCount.textContent = Number(counts.expected || 0).toLocaleString();
  accountedCount.textContent = Number(counts.accounted || 0).toLocaleString();
  unaccountedCount.textContent = Number(counts.unaccounted || 0).toLocaleString();
  countGrid.hidden = false;

  const warningText = Array.isArray(incident.warnings) && incident.warnings.length
    ? ` · ${incident.warnings.join(' · ')}`
    : '';
  contextStrip.innerHTML =
    `<strong>Frozen snapshot:</strong> ${esc(scheduleText(incident))}` +
    `${incident.context?.classes_date ? ` · Classes ${esc(incident.context.classes_date)}` : ''}` +
    `${warningText ? `<span class="student-status--warn">${esc(warningText)}</span>` : ''}`;

  inactiveCard.hidden = true;
  activeApp.hidden = false;
  tabOps.hidden = !canManage();

  if (canManage() && ACTIVE_VIEW === 'roster' && !tabOps.dataset.seenManager) {
    ACTIVE_VIEW = 'ops';
    tabOps.dataset.seenManager = '1';
  }
  if (!canManage() && ACTIVE_VIEW === 'ops') ACTIVE_VIEW = 'roster';
  renderTabs();
}

function renderTabs(){
  const mapping = {
    roster:[tabRoster,panelRoster],
    search:[tabSearch,panelSearch],
    ops:[tabOps,panelOps]
  };
  for (const [key, [tab, panel]] of Object.entries(mapping)) {
    const active = key === ACTIVE_VIEW && !(key === 'ops' && !canManage());
    tab?.classList.toggle('is-active', active);
    if (panel) panel.hidden = !active;
  }
}

function studentSecondary(student){
  const bits = [];
  if (student.grade) bits.push(`Grade ${student.grade}`);
  if (student.osis) bits.push(`OSIS ${student.osis}`);
  if (student.expected_room) bits.push(`Room ${student.expected_room}`);
  if (student.expected_course) bits.push(student.expected_course);
  return bits;
}

function canUndoStudent(student){
  if (!student?.accounted) return false;
  if (canManage()) return true;
  return cleanEmail(student.accounted_by) === actorEmail() && !!actorEmail();
}

function studentStatusHtml(student){
  if (student.accounted) {
    const by = String(student.accounted_by || '').trim();
    const at = formatStarted(student.accounted_at_iso);
    return `<div class="student-status student-status--ok">✓ Accounted${by ? ` by ${esc(by)}` : ''}${at ? ` · ${esc(at)}` : ''}</div>`;
  }
  if (student.initial_expected === false || student.off_campus_snapshot === true) {
    const why = student.off_campus_label || student.off_campus_source || 'explicit off-campus state';
    return `<div class="student-status student-status--warn">Initially excluded as off campus: ${esc(why)}. If physically present, accounting them will add them to Expected.</div>`;
  }
  return `<div class="student-status student-status--bad">Not yet accounted for</div>`;
}

function studentActionHtml(student, source){
  const osis = String(student.osis || '');
  const pending = PENDING_OSIS.has(osis);
  if (isViewAsReadOnly()) {
    return `<button class="account-btn account-btn--undo" type="button" disabled>Read Only</button>`;
  }
  if (pending) {
    return `<button class="account-btn" type="button" disabled>Saving…</button>`;
  }

  if (!student.accounted) {
    return `<button class="account-btn" type="button" data-account-osis="${esc(osis)}" data-account-source="${esc(source)}">✓ Account Here</button>`;
  }

  if (canUndoStudent(student)) {
    return `<button class="account-btn account-btn--undo" type="button" data-unaccount-osis="${esc(osis)}" data-account-source="${esc(source)}">Undo</button>`;
  }

  return `<div class="accounted-mark" aria-label="Accounted">✓</div>`;
}

function studentCardHtml(student, source){
  const meta = studentSecondary(student).map((x) => `<span>${esc(x)}</span>`).join('');
  const expectedTeachers = Array.isArray(student.expected_teacher_names) && student.expected_teacher_names.length
    ? `<span>Teacher ${esc(student.expected_teacher_names.join(', '))}</span>`
    : '';
  const classes = [
    'student-card',
    student.accounted ? 'student-card--accounted' : '',
    student.initial_expected === false ? 'student-card--offcampus' : '',
    PENDING_OSIS.has(String(student.osis || '')) ? 'student-card--pending' : ''
  ].filter(Boolean).join(' ');

  return `<article class="${classes}" data-student-osis="${esc(student.osis || '')}">
    <div class="student-main">
      <div class="student-name">${esc(student.name || 'Student')}</div>
      <div class="student-meta">${meta}${expectedTeachers}</div>
      ${studentStatusHtml(student)}
    </div>
    ${studentActionHtml(student, source)}
  </article>`;
}

function wireStudentActions(container){
  container.querySelectorAll('[data-account-osis]').forEach((button) => {
    button.addEventListener('click', () => {
      setStudentAccounted(button.dataset.accountOsis, true, button.dataset.accountSource || 'manual').catch(() => {});
    });
  });
  container.querySelectorAll('[data-unaccount-osis]').forEach((button) => {
    button.addEventListener('click', () => {
      setStudentAccounted(button.dataset.unaccountOsis, false, button.dataset.accountSource || 'manual').catch(() => {});
    });
  });
}

function renderRoster(){
  const students = Array.isArray(MY_ROSTER) ? MY_ROSTER : [];
  const accounted = students.filter((s) => s.accounted === true).length;
  rosterBadge.textContent = String(students.length);
  rosterProgress.textContent = `${accounted} / ${students.length}`;
  rosterHint.textContent = ESAS_STATUS?.incident?.context?.period_local
    ? `Frozen assignment for Period ${ESAS_STATUS.incident.context.period_local}. Students may be accounted by any staff member.`
    : 'No current period was available when this incident was activated. Use Search to account a student physically with you.';

  if (!students.length) {
    rosterList.innerHTML = '';
    rosterEmpty.hidden = false;
    rosterEmpty.textContent = ESAS_STATUS?.incident?.context?.period_local
      ? 'No students were assigned to your current frozen ESAS roster.'
      : 'No teacher roster is available for this incident because there was no current/next period at activation. Student Search remains available.';
    return;
  }
  rosterEmpty.hidden = true;
  rosterList.innerHTML = students.map((s) => studentCardHtml(s, 'roster')).join('');
  wireStudentActions(rosterList);
}

function renderSearch(){
  if (!SEARCH_RESULTS.length) {
    searchList.innerHTML = '';
    return;
  }
  searchList.innerHTML = SEARCH_RESULTS.map((s) => studentCardHtml(s, 'search')).join('');
  wireStudentActions(searchList);
}

function filteredOpsStudents(){
  const q = String(opsFilter.value || '').trim().toLowerCase();
  if (!q) return OPS_UNACCOUNTED;
  return OPS_UNACCOUNTED.filter((s) => {
    const hay = [
      s.name, s.osis, s.grade, s.expected_room, s.expected_course,
      ...(Array.isArray(s.expected_teacher_names) ? s.expected_teacher_names : [])
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function renderOps(){
  if (!canManage()) {
    opsList.innerHTML = '';
    opsEmpty.hidden = true;
    return;
  }
  const all = Array.isArray(OPS_UNACCOUNTED) ? OPS_UNACCOUNTED : [];
  const filtered = filteredOpsStudents();
  opsBadge.textContent = String(all.length);
  opsStatus.textContent = opsFilter.value.trim()
    ? `Showing ${filtered.length} of ${all.length} unaccounted students`
    : `${all.length} student${all.length === 1 ? '' : 's'} still unaccounted`;

  if (!filtered.length) {
    opsList.innerHTML = '';
    opsEmpty.hidden = false;
    opsEmpty.textContent = all.length
      ? 'No unaccounted students match this filter.'
      : 'All currently expected students are accounted for.';
    return;
  }
  opsEmpty.hidden = true;
  opsList.innerHTML = filtered.map((s) => studentCardHtml(s, 'ops')).join('');
  wireStudentActions(opsList);
}

function mergeStudentIntoLists(student){
  if (!student?.osis) return;
  const replace = (list) => list.map((row) => String(row.osis) === String(student.osis) ? { ...row, ...student } : row);
  MY_ROSTER = replace(MY_ROSTER);
  SEARCH_RESULTS = replace(SEARCH_RESULTS);
}

async function setStudentAccounted(osis, accounted, source){
  const incidentId = String(ESAS_STATUS?.incident?.incident_id || '').trim();
  const studentOsis = String(osis || '').trim();
  if (!incidentId || !studentOsis || PENDING_OSIS.has(studentOsis)) return;

  PENDING_OSIS.add(studentOsis);
  renderRoster();
  renderSearch();
  renderOps();

  try{
    const result = await getJson('/admin/esas/account', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        incident_id: incidentId,
        osis: studentOsis,
        accounted: accounted === true,
        source
      })
    });

    // Deliberately update the visual accounting state only after the Worker confirms the write.
    if (result.student) {
      mergeStudentIntoLists(result.student);
      if (canManage()) {
        if (result.student.accounted === true) {
          OPS_UNACCOUNTED = OPS_UNACCOUNTED.filter((row) => String(row.osis) !== String(result.student.osis));
        } else if (result.student.expected === true && !OPS_UNACCOUNTED.some((row) => String(row.osis) === String(result.student.osis))) {
          OPS_UNACCOUNTED = [...OPS_UNACCOUNTED, result.student];
        }
      }
    }
    if (result.incident) {
      ESAS_STATUS = { ...(ESAS_STATUS || {}), ok:true, active:true, incident:result.incident };
    }
    LAST_SYNC_MS = Date.now();
    setSync('ok', syncAgeText());
  }catch(error){
    const message = error?.code === 'account_undo_not_allowed'
      ? 'You can only undo your own accounting action. Ops/Admin can correct any student.'
      : `Accountability update failed: ${error?.message || error}`;
    showToast(message);
    setSync('error', `Not synced — ${message}`);
    throw error;
  }finally{
    PENDING_OSIS.delete(studentOsis);
    renderIncident();
    renderRoster();
    renderSearch();
    renderOps();
  }

  await refreshAll({ silent:true });
}

async function refreshAll({ silent = false } = {}){
  if (REFRESH_IN_FLIGHT) return;
  REFRESH_IN_FLIGHT = true;
  refreshBtn.disabled = true;
  if (!silent) setSync('checking', 'Syncing ESAS…');

  try{
    const status = await getJson('/admin/esas/status', { method:'GET' });
    ESAS_STATUS = status;
    renderIncident();

    if (!isActive()) {
      MY_ROSTER = [];
      OPS_UNACCOUNTED = [];
      SEARCH_RESULTS = [];
      renderRoster();
      renderSearch();
      renderOps();
      LAST_SYNC_MS = Date.now();
      setSync('ok', syncAgeText());
      return;
    }

    const requests = [
      getJson('/admin/esas/my_roster', { method:'GET' })
    ];
    if (canManage()) requests.push(getJson('/admin/esas/unaccounted', { method:'GET' }));

    const results = await Promise.all(requests);
    const roster = results[0] || {};
    MY_ROSTER = Array.isArray(roster.students) ? roster.students : [];

    if (canManage()) {
      const ops = results[1] || {};
      OPS_UNACCOUNTED = Array.isArray(ops.students) ? ops.students : [];
    } else {
      OPS_UNACCOUNTED = [];
    }

    renderRoster();
    renderOps();
    if (ACTIVE_VIEW === 'search' && String(studentSearch.value || '').trim().length >= 2) {
      await runSearch();
    }
    LAST_SYNC_MS = Date.now();
    setSync('ok', syncAgeText());
  }catch(error){
    if (error?.status === 401) {
      stopPolling();
      clearStoredAdminSessionSid();
      appShell.hidden = true;
      loginCard.hidden = false;
      loginOut.textContent = 'Your EagleNEST session expired. Sign in again.';
      await initGoogleLogin();
      return;
    }
    setSync('error', `Sync failed — last known data may be stale (${error?.message || error})`);
    if (!silent) showToast(`ESAS refresh failed: ${error?.message || error}`);
  }finally{
    REFRESH_IN_FLIGHT = false;
    refreshBtn.disabled = false;
  }
}

async function runSearch(){
  const query = String(studentSearch.value || '').trim();
  const seq = ++SEARCH_SEQ;
  if (query.length < 2) {
    SEARCH_RESULTS = [];
    searchStatus.textContent = 'Enter at least 2 characters.';
    renderSearch();
    return;
  }
  if (!isActive()) {
    SEARCH_RESULTS = [];
    searchStatus.textContent = 'No active ESAS incident.';
    renderSearch();
    return;
  }

  searchStatus.textContent = 'Searching frozen incident snapshot…';
  try{
    const result = await getJson(`/admin/esas/search?q=${encodeURIComponent(query)}`, { method:'GET' });
    if (seq !== SEARCH_SEQ) return;
    SEARCH_RESULTS = Array.isArray(result.results) ? result.results : [];
    searchStatus.textContent = `${SEARCH_RESULTS.length} result${SEARCH_RESULTS.length === 1 ? '' : 's'}`;
    renderSearch();
  }catch(error){
    if (seq !== SEARCH_SEQ) return;
    SEARCH_RESULTS = [];
    searchStatus.textContent = `Search failed: ${error?.message || error}`;
    renderSearch();
  }
}

function scheduleSearch(){
  if (SEARCH_TIMER) clearTimeout(SEARCH_TIMER);
  SEARCH_TIMER = setTimeout(() => runSearch().catch(() => {}), SEARCH_DEBOUNCE_MS);
}

function setView(view){
  if (view === 'ops' && !canManage()) return;
  ACTIVE_VIEW = view;
  if (view === 'ops') tabOps.dataset.seenManager = '1';
  renderTabs();
  if (view === 'search') setTimeout(() => studentSearch.focus(), 0);
}

function startPolling(){
  stopPolling();
  POLL_TIMER = setInterval(() => refreshAll({ silent:true }), POLL_MS);
}

function stopPolling(){
  if (POLL_TIMER) clearInterval(POLL_TIMER);
  POLL_TIMER = null;
}

async function waitForGoogle(timeoutMs = 8000){
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) throw new Error('Google sign-in failed to load');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.google.accounts.id;
}

async function onGoogleCredential(payload){
  try{
    loginOut.textContent = 'Signing in…';
    const response = await adminFetch('/admin/session/login_google', {
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body:new URLSearchParams({ id_token:payload.credential }).toString()
    });
    const data = await response.json().catch(() => ({}));
    stashSessionFromResponse(response, data);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    SESSION = data;
    loginCard.hidden = true;
    appShell.hidden = false;
    await refreshAll();
    startPolling();
  }catch(error){
    loginOut.textContent = `Sign-in failed: ${error?.message || error}`;
  }
}

async function initGoogleLogin(){
  try{
    if (!GOOGLE_CLIENT_ID) throw new Error('Missing Google OAuth client ID.');
    const googleId = await waitForGoogle();
    googleId.initialize({
      client_id:GOOGLE_CLIENT_ID,
      callback:onGoogleCredential,
      ux_mode:'popup',
      use_fedcm_for_prompt:true
    });
    const target = $('g_id_signin');
    target.replaceChildren();
    googleId.renderButton(target, { theme:'outline', size:'large', shape:'pill' });
  }catch(error){
    loginOut.textContent = `Google sign-in unavailable: ${error?.message || error}`;
  }
}

async function boot(){
  tabRoster.addEventListener('click', () => setView('roster'));
  tabSearch.addEventListener('click', () => setView('search'));
  tabOps.addEventListener('click', () => setView('ops'));
  refreshBtn.addEventListener('click', () => refreshAll());

  studentSearch.addEventListener('input', scheduleSearch);
  clearSearchBtn.addEventListener('click', () => {
    studentSearch.value = '';
    ++SEARCH_SEQ;
    SEARCH_RESULTS = [];
    searchStatus.textContent = 'Enter at least 2 characters.';
    renderSearch();
    studentSearch.focus();
  });

  opsFilter.addEventListener('input', renderOps);
  clearOpsFilterBtn.addEventListener('click', () => {
    opsFilter.value = '';
    renderOps();
    opsFilter.focus();
  });

  setInterval(() => {
    if (LAST_SYNC_MS && !syncBar.classList.contains('sync-bar--error') && !REFRESH_IN_FLIGHT) {
      setSync('ok', syncAgeText());
    }
  }, 1000);

  try{
    const response = await adminFetch('/admin/session/check', { method:'GET' });
    const data = await response.json().catch(() => ({}));
    stashSessionFromResponse(response, data);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    SESSION = data;
    loginCard.hidden = true;
    appShell.hidden = false;
    await refreshAll();
    startPolling();
  }catch{
    appShell.hidden = true;
    loginCard.hidden = false;
    loginOut.textContent = 'Sign in with your school account.';
    await initGoogleLogin();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => boot().catch(console.error));
} else {
  boot().catch(console.error);
}

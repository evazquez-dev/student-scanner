/* admin/student_view.js — Student Lookup Phase 1 */

function meta(name){ return document.querySelector(`meta[name="${name}"]`)?.content || ''; }
const API_BASE = (meta('api-base') || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = meta('google-client-id') || '';
const ADMIN_SESSION_KEY = 'ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY = 'teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';
const BEHAVIOR_MENU_ENDPOINT = '/admin/behavior/menu';
const BEHAVIOR_LOG_ENDPOINT = '/admin/behavior/log';

const loginCard = document.getElementById('loginCard');
const loginOut = document.getElementById('loginOut');
const app = document.getElementById('app');
const qEl = document.getElementById('q');
const menuEl = document.getElementById('menu');
const searchStatus = document.getElementById('searchStatus');
const studentCard = document.getElementById('studentCard');
const emptyCard = document.getElementById('emptyCard');
const studentDetails = document.getElementById('studentDetails');
const studentName = document.getElementById('studentName');
const studentMeta = document.getElementById('studentMeta');
const viewAsNote = document.getElementById('viewAsNote');
const actionStatus = document.getElementById('actionStatus');
const logBehaviorBtn = document.getElementById('logBehaviorBtn');
const logCommunicationBtn = document.getElementById('logCommunicationBtn');
const locZone = document.getElementById('locZone');
const locLabel = document.getElementById('locLabel');
const locUpdated = document.getElementById('locUpdated');
const schedEl = document.getElementById('sched');
const attEl = document.getElementById('att');
const oiEl = document.getElementById('oi');
const metaEl = document.getElementById('meta');

const behaviorBackdrop = document.getElementById('behaviorBackdrop');
const behaviorStudent = document.getElementById('behaviorStudent');
const behaviorContext = document.getElementById('behaviorContext');
const behaviorSubmenu = document.getElementById('behaviorSubmenu');
const behaviorOption = document.getElementById('behaviorOption');
const behaviorRoom = document.getElementById('behaviorRoom');
const behaviorPeriod = document.getElementById('behaviorPeriod');
const behaviorError = document.getElementById('behaviorError');
const saveBehavior = document.getElementById('saveBehavior');

let access = null;
let selected = null; // { osis, name, email }
let dashboard = null;
let behaviorMenu = null;
let searchSequence = 0;
let debounceTimer = null;

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

function setActionStatus(message = '', kind = ''){
  actionStatus.textContent = String(message || '');
  actionStatus.className = `actionStatus small${kind ? ` ${kind}` : ''}`;
}

function updateActionState(){
  const hasStudent = !!selected?.osis;
  const readOnly = isViewAsReadOnly();
  logBehaviorBtn.disabled = !hasStudent || readOnly;
  logCommunicationBtn.disabled = !hasStudent || readOnly;
  viewAsNote.hidden = !readOnly;
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
    const name = String(item?.name || '—').trim() || '—';
    const osis = String(item?.osis || '').trim();
    const email = String(item?.email || '').trim();
    button.textContent = `${name} (${osis || '—'})${email ? ` — ${email}` : ''}`;
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

function attendanceLine(att){
  if (!att) return '—';
  const code = String(att.overrideLetter || '').trim().toUpperCase();
  const status = String(att.status || att.scanStatus || '').trim();
  const first = att.firstISO ? fmtClock(att.firstISO) : '—';
  const last = att.lastISO ? fmtClock(att.lastISO) : '—';
  if (code) return `${code} (override) • first ${first} • last ${last}`;
  if (status) return `${status} • first ${first} • last ${last}`;
  return '—';
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

function currentBehaviorContext(){
  const current = dashboard?.schedule?.now || {};
  const loc = dashboard?.location || {};
  return {
    date:String(dashboard?.date || getNYDateISO()),
    room:String(current?.room || loc?.location_label || loc?.locLabel || loc?.loc || '').trim(),
    periodLocal:String(current?.periodLocal || '').trim()
  };
}

async function loadDashboard(osis){
  const r = await adminFetch(`/admin/student/dashboard?osis=${encodeURIComponent(osis)}`, { method:'GET' });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) throw new Error(data?.error || `dash_http_${r.status}`);
  dashboard = data;

  if (data.student) {
    selected = {
      osis:String(data.student.osis || selected?.osis || osis),
      name:String(data.student.name || selected?.name || ''),
      email:String(data.student.email || selected?.email || '')
    };
  }

  studentName.textContent = selected?.name || 'Unknown Student';
  studentMeta.textContent = `OSIS ${selected?.osis || '—'}${selected?.email ? ` • ${selected.email}` : ''}`;

  const loc = data.location || null;
  locZone.textContent = String(loc?.zone || '—');
  locLabel.textContent = String(loc?.location_label || loc?.locLabel || loc?.loc || '—');
  locUpdated.textContent = loc?.updated_at ? fmtClock(loc.updated_at) : '—';

  const schedule = data.schedule?.now || null;
  const period = String(schedule?.periodLocal || '').trim();
  const room = String(schedule?.room || '').trim();
  const range = String(schedule?.range || '').trim();
  schedEl.textContent = (period || room || range) ? `${period || '—'} • ${room || '—'}${range ? ` • ${range}` : ''}` : '—';
  attEl.textContent = attendanceLine(data.attendance || null);
  oiEl.textContent = outInLine(data.session || null);
  metaEl.textContent = `date=${data.date} • selected=${selected?.name || '—'} (${selected?.osis || osis})`;
  updateActionState();
}

async function selectStudent(item){
  const osis = String(item?.osis || '').trim();
  if (!osis) return;
  selected = { osis, name:String(item?.name || ''), email:String(item?.email || '') };
  dashboard = null;
  showMenu([]);
  qEl.value = selected.name || selected.osis;
  qEl.blur();
  setActionStatus('');

  studentCard.hidden = false;
  emptyCard.hidden = true;
  studentDetails.hidden = false;
  studentName.textContent = selected.name || 'Loading student…';
  studentMeta.textContent = `OSIS ${selected.osis}`;
  locZone.textContent = '…'; locLabel.textContent = '…'; locUpdated.textContent = '…';
  schedEl.textContent = '…'; attEl.textContent = '…'; oiEl.textContent = '…';
  metaEl.textContent = 'Loading student…';
  updateActionState();

  const url = new URL(location.href);
  url.searchParams.set('osis', selected.osis);
  url.searchParams.delete('name');
  history.replaceState(null, '', url.toString());

  try{
    await loadDashboard(selected.osis);
  }catch(e){
    studentDetails.hidden = true;
    metaEl.textContent = `Student load failed: ${e?.message || e}`;
    setActionStatus('Could not load this student.', 'bad');
  }
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
    meta:{
      ui:'student_lookup',
      ver:1,
      submenu,
      option
    }
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
    setActionStatus(`Behavior logged: ${option}`, 'good');
  }catch(e){
    behaviorError.textContent = `Could not log behavior: ${e?.message || e}`;
  }finally{
    if (!behaviorBackdrop.hidden) saveBehavior.disabled = false;
  }
}

function openCommunication(){
  if (!selected?.osis || isViewAsReadOnly()) return;
  const url = new URL('./student_contacts.html', location.href);
  url.searchParams.set('osis', selected.osis);
  if (selected.name) url.searchParams.set('name', selected.name);
  url.searchParams.set('action', 'log-communication');
  url.searchParams.set('source', 'student_lookup');
  location.href = url.toString();
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

  logBehaviorBtn.addEventListener('click', openBehaviorModal);
  logCommunicationBtn.addEventListener('click', openCommunication);
  behaviorSubmenu.addEventListener('change', fillBehaviorOptions);
  document.getElementById('closeBehavior').addEventListener('click', closeBehaviorModal);
  document.getElementById('cancelBehavior').addEventListener('click', closeBehaviorModal);
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
    gsi.renderButton(document.getElementById('g_id_signin'), { theme:'outline', size:'large' });
    return;
  }

  // Student Lookup is intentionally available to every authenticated EagleNEST staff account.
  loginCard.hidden = true;
  app.hidden = false;
  updateActionState();

  const url = new URL(location.href);
  const osis = String(url.searchParams.get('osis') || '').trim();
  if (osis) await selectStudent({ osis, name:String(url.searchParams.get('name') || ''), email:'' });
}

boot().catch((e) => {
  loginOut.textContent = String(e?.message || e);
});

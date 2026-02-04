// Phone Pass page (cellphone locker)
// Auth: same cookie-based admin session as teacher_attendance
// Worker endpoints used:
//  - GET  /admin/session/check
//  - GET  /admin/phone_pass/options
//  - GET  /admin/phone_pass/context?osis=...
//  - GET  /admin/phone_pass/mine
//  - POST /admin/phone_pass/grant
//  - POST /admin/phone_pass/return

const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';

const THEME_KEY = 'ss_theme_v1';
const themeToggleBtn = document.getElementById('themeToggleBtn');

function getTheme(){
  const t = String(document.documentElement?.dataset?.theme || '').trim().toLowerCase();
  return (t === 'light') ? 'light' : 'dark';
}
function setTheme(theme){
  const t = (String(theme || '').toLowerCase() === 'light') ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try{ localStorage.setItem(THEME_KEY, t); }catch{}
  updateThemeToggleUI();
}
function updateThemeToggleUI(){
  if(!themeToggleBtn) return;
  const t = getTheme();
  themeToggleBtn.textContent = (t === 'light') ? '☀️ Light' : '🌙 Dark';
  themeToggleBtn.title = (t === 'light') ? 'Switch to dark mode' : 'Switch to light mode';
  themeToggleBtn.setAttribute('aria-pressed', String(t === 'light'));
}
function initThemeToggle(){
  if(!themeToggleBtn) return;
  updateThemeToggleUI();
  themeToggleBtn.addEventListener('click', () => setTheme(getTheme() === 'light' ? 'dark' : 'light'));
}

const loginCard  = document.getElementById('loginCard');
const loginOut   = document.getElementById('loginOut');
const appShell   = document.getElementById('appShell');

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dateText   = document.getElementById('dateText');
const whoText    = document.getElementById('whoText');
const refreshText= document.getElementById('refreshText');
const currentPeriodText = document.getElementById('currentPeriodText');

const studentSearch = document.getElementById('studentSearch');
const studentSelect = document.getElementById('studentSelect');

const selectedMeta = document.getElementById('selectedMeta');
const errBox = document.getElementById('errBox');

const curBox = document.getElementById('curBox');
const schedBox = document.getElementById('schedBox');

const grantBtn = document.getElementById('grantBtn');
const noteInput = document.getElementById('noteInput');
const phoneBox = document.getElementById('phoneBox');

const mineList = document.getElementById('mineList');
const mineCount = document.getElementById('mineCount');

const layout = document.getElementById('layout');
const grantCard = document.getElementById('grantCard');
const mineCard = document.getElementById('mineCard');
const activeCard = document.getElementById('activeCard');
const activeList = document.getElementById('activeList');
const activeCount = document.getElementById('activeCount');


let WHO = null;
let CAPS = { can_grant:false, can_return:false };
let ALL = []; // [{osis,name}]
let SELECTED_OSIS = '';
let lastRefreshTs = 0;

function show(el){ if(el) el.style.display='block'; }
function hide(el){ if(el) el.style.display='none'; }
function setStatus(ok, msg){
  statusDot.className = 'pill-dot ' + (ok ? 'pill-dot--ok' : 'pill-dot--bad');
  statusText.textContent = msg;
}
function setErr(msg){
  if(!errBox) return;
  const m = String(msg || '').trim();
  errBox.style.display = m ? 'block' : 'none';
  errBox.textContent = m;
}

async function waitForGoogle(timeoutMs = 8000){
  const start = Date.now();
  while(!window.google?.accounts?.id){
    if(Date.now()-start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise(r=>setTimeout(r,50));
  }
  return window.google.accounts.id;
}

// Always include cookies for admin requests
async function adminFetch(pathOrUrl, init = {}){
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  return fetch(u, { ...init, credentials:'include' });
}

function fmtClock(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function fmtMDTimeNY(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

let _CURPER_TIMER = null;

async function fetchTeacherOptionsForPill_(){
  const r = await adminFetch('/admin/teacher_att/options', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok){
    throw new Error(data?.error || `teacher_att/options HTTP ${r.status}`);
  }
  return data;
}

function renderCurrentPeriodPill_(opts){
  if(!currentPeriodText) return;

  const cur = String(opts?.current_period_local || '').trim();
  if(!cur){
    currentPeriodText.textContent = 'Current: —';
    return;
  }

  // Prefer pretty label from period_options (e.g. "4 (10:48 AM - 11:42 AM)")
  let label = cur;
  const po = opts?.period_options;
  if(Array.isArray(po)){
    const found = po.find(x => String(x?.value) === cur);
    if(found?.label) label = String(found.label);
  }

  currentPeriodText.textContent = `Current: ${label}`;
}

function startCurrentPeriodTicker_(){
  if(_CURPER_TIMER) return;

  _CURPER_TIMER = setInterval(async () => {
    if(document.hidden) return;
    try{
      const opts = await fetchTeacherOptionsForPill_();
      renderCurrentPeriodPill_(opts);
    }catch(_){}
  }, 60000);
}

async function initCurrentPeriodPill_(){
  if(!currentPeriodText) return;

  currentPeriodText.textContent = 'Current: —';

  // Small retry (cookie races / transient fetch)
  let opts = null;
  for(let i=0;i<3;i++){
    try{
      opts = await fetchTeacherOptionsForPill_();
      break;
    }catch(e){
      if(i===2) throw e;
      await new Promise(r => setTimeout(r, 200*(i+1)));
    }
  }

  renderCurrentPeriodPill_(opts);
  startCurrentPeriodTicker_();
}

function nycDateISO(){
  // YYYY-MM-DD in America/New_York
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());

  const y = parts.find(p => p.type === 'year')?.value || '';
  const m = parts.find(p => p.type === 'month')?.value || '';
  const d = parts.find(p => p.type === 'day')?.value || '';
  return `${y}-${m}-${d}`;
}

function isoToNycDate(iso){
  if(!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(dt);

  const y = parts.find(p => p.type === 'year')?.value || '';
  const m = parts.find(p => p.type === 'month')?.value || '';
  const d = parts.find(p => p.type === 'day')?.value || '';
  return `${y}-${m}-${d}`;
}

function isStateFromToday(st){
  const today = nycDateISO();

  const d = String(st?.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d === today;

  const u = String(st?.updated_at || '').trim();
  if (u) return isoToNycDate(u) === today;

  return false;
}

function zoneToChipClass(zone){
  switch(String(zone || '')){
    case 'hallway':      return 'zone-chip--hall';
    case 'bathroom':     return 'zone-chip--bath';
    case 'class':
    case 'after_school': return 'zone-chip--class';
    case 'lunch':        return 'zone-chip--lunch';
    case 'with_staff':   return 'zone-chip--staff';
    case 'off_campus':   return 'zone-chip--off';
    default:             return 'zone-chip--off';
  }
}

function zoneToCardClass(zone){
  switch(String(zone || '')){
    case 'hallway':      return 'locCard--hall';
    case 'bathroom':     return 'locCard--bath';
    case 'class':
    case 'after_school': return 'locCard--class';
    case 'lunch':        return 'locCard--lunch';
    case 'with_staff':   return 'locCard--staff';
    case 'off_campus':   return 'locCard--off';
    default:             return 'locCard--off';
  }
}

function fmtDateTimeShort(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  // local display is fine here; “today” logic uses NYC date above
  return d.toLocaleString([], { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function renderCurrentLocation(st){
  const fromToday = isStateFromToday(st);

  // Capture "last known" from whatever we received, even if it's stale
  const lkLabel = String(st?.location_label || st?.loc || '').trim();
  const lkZone  = String(st?.zone || '').trim();
  const lkTs    = st?.updated_at ? (fmtMDTimeNY(st.updated_at) || fmtDateTimeShort(st.updated_at)) : '';
  const lastKnownLine = (lkLabel || lkZone || lkTs)
    ? `Last known: ${lkLabel || '—'}${lkZone ? ` (${lkZone.replace(/_/g,' ')})` : ''}${lkTs ? ` • ${lkTs}` : ''}`
    : '';

  // If stale (or missing), force Off Campus messaging
  const zone  = (!st || !fromToday) ? 'off_campus' : String(st.zone || '');
  const label = (!st || !fromToday) ? 'Off Campus' : String(st.location_label || st.loc || '—');

  const updatedText = st?.updated_at
    ? ((!st || !fromToday)
        ? `Last update: ${lkTs || fmtDateTimeShort(st.updated_at)}`
        : `Updated: ${fmtClock(st.updated_at)}`)
    : ((!st || !fromToday) ? '' : 'Updated: —');

  // Reset + base card
  curBox.innerHTML = '';
  curBox.className = `locCard ${zoneToCardClass(zone)}`;

  // Title
  const title = document.createElement('div');
  title.className = 'locTitle';
  title.textContent = label || '—';

  // Meta row (zone chip + updated pill)
  const meta = document.createElement('div');
  meta.className = 'locMetaRow';

  const chip = document.createElement('span');
  chip.className = `zone-chip ${zoneToChipClass(zone)}`;
  chip.textContent = String(zone || 'off_campus').replace(/_/g,' ');
  meta.appendChild(chip);

  if (updatedText){
    const upd = document.createElement('span');
    upd.className = 'locPill';
    upd.innerHTML = `<span class="locPillDot"></span><span>${updatedText}</span>`;
    meta.appendChild(upd);
  }

  // Main subline
  const sub = document.createElement('div');
  sub.className = 'locSub';

  if(!st || !fromToday){
    sub.textContent = 'They have not entered the building today.';
  } else {
    const bits = [];
    const heldBy = String(st.held_by_title || st.held_by_email || '').trim();
    const heldSince = st.held_by_since ? fmtClock(st.held_by_since) : '';
    if (heldBy) bits.push(`With: ${heldBy}`);
    if (heldSince) bits.push(`since ${heldSince}`);
    sub.textContent = bits.join(' • ') || '—';
  }

  // Append
  curBox.appendChild(title);
  curBox.appendChild(meta);
  curBox.appendChild(sub);

  // Stale extra line: "Last known: ..."
  if ((!st || !fromToday) && lastKnownLine){
    const sub2 = document.createElement('div');
    sub2.className = 'locSub locSub--minor';
    sub2.textContent = lastKnownLine;
    curBox.appendChild(sub2);
  }

  return fromToday;
}

function clearEl(el){
  if(!el) return;
  while(el.firstChild) el.removeChild(el.firstChild);
}

function renderScheduleTable(sch){
  if(!schedBox) return;

  clearEl(schedBox);

  if(!sch || !sch.now){
    schedBox.textContent = 'No bell/schedule context right now.';
    return;
  }

  const rowsRaw = (Array.isArray(sch.window) && sch.window.length)
    ? sch.window
    : [sch.prev, sch.now, sch.next].filter(Boolean);

  // one before + focus + one after
  const rows = rowsRaw.slice(0, 3);
  const focusPid = String(sch.now?.periodLocal || '');

  const wrap = document.createElement('div');
  wrap.className = 'schedTableWrap';

  const tbl = document.createElement('table');
  tbl.className = 'schedTable';

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const h of ['Period','Time','Room','Course']){
    const th = document.createElement('th');
    th.textContent = h;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');

  for (const r of rows){
    if(!r) continue;

    const tr = document.createElement('tr');
    const isFocus = (focusPid && String(r.periodLocal) === focusPid);
    if(isFocus) tr.classList.add('schedRow--current');

    // Period
    const tdP = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = 'schedPill';

    const dot = document.createElement('span');
    dot.className = 'schedDot';

    const pid = String(r.periodLocal ?? '—');
    const pLabel = (/^\d+$/.test(pid) ? `P${pid}` : pid);

    const ptxt = document.createElement('span');
    ptxt.textContent = pLabel;

    pill.appendChild(dot);
    pill.appendChild(ptxt);
    tdP.appendChild(pill);

    // Time
    const tdT = document.createElement('td');
    tdT.textContent = String(r.range || '').trim() || '—';

    // Room
    const tdR = document.createElement('td');
    tdR.textContent = String(r.room || '').trim() || '—';

    // Course
    const tdC = document.createElement('td');
    tdC.textContent = String(r.course || '').trim() || '—';

    tr.appendChild(tdP);
    tr.appendChild(tdT);
    tr.appendChild(tdR);
    tr.appendChild(tdC);

    tbody.appendChild(tr);
  }

  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  schedBox.appendChild(wrap);
}

function fillResults(filterText){
  const q = String(filterText || '').trim().toLowerCase();
  const max = 80;

  const items = !q
    ? ALL.slice(0, max)
    : ALL.filter(s => (s.name||'').toLowerCase().includes(q) || String(s.osis||'').includes(q)).slice(0, max);

  studentSelect.innerHTML = '';
  for(const s of items){
    const opt = document.createElement('option');
    opt.value = String(s.osis);
    opt.textContent = `${s.name} — ${s.osis}`;
    studentSelect.appendChild(opt);
  }

  // preserve selection if still present
  if (SELECTED_OSIS && items.some(x => String(x.osis) === SELECTED_OSIS)){
    studentSelect.value = SELECTED_OSIS;
  }
}

async function loadOptions(){
  const r = await adminFetch('/admin/phone_pass/options', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `phone_pass/options HTTP ${r.status}`);

  WHO = data.who || WHO;
  CAPS = { can_grant: !!data.can_grant, can_return: !!data.can_return };
  ALL = Array.isArray(data.students) ? data.students : [];

  // Gate UI
  if(!CAPS.can_grant){
    grantCard?.classList.add('hide');
    mineCard?.classList.add('hide');
  }
  if(!CAPS.can_return){
    activeCard?.classList.add('hide');
  }
  if(CAPS.can_return && !CAPS.can_grant){
    layout?.classList.add('opsOnly');
  }
}


async function loadMine(){
  if(!CAPS.can_grant) return;
  const r = await adminFetch('/admin/phone_pass/mine', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `phone_pass/mine HTTP ${r.status}`);

  const list = Array.isArray(data.mine) ? data.mine : [];
  mineCount.textContent = String(list.length || 0);
  mineList.innerHTML = '';

  if(!list.length){
    const e = document.createElement('div');
    e.className = 'muted';
    e.textContent = '—';
    mineList.appendChild(e);
    return;
  }

  for(const s of list){
    const row = document.createElement('div');
    row.className = 'row';

    const left = document.createElement('div');

    const nm = document.createElement('div');
    nm.className = 'row-title';
    nm.textContent = `${s.name || '—'} (${s.osis})`;

    const sub = document.createElement('div');
    sub.className = 'row-sub';
    const since = s.phone_out_since ? `since ${fmtClock(s.phone_out_since)}` : '';
    const loc = s.cur_label ? `@ ${s.cur_label}` : (s.cur_loc ? `@ ${s.cur_loc}` : '');
    sub.textContent = [since, loc].filter(Boolean).join(' • ') || '—';

    left.appendChild(nm);
    left.appendChild(sub);

    row.appendChild(left);
    mineList.appendChild(row);
  }
}


async function loadSelectedContext(){
  if(!CAPS.can_grant || !SELECTED_OSIS){
    selectedMeta.textContent = '—';
    phoneBox.textContent = '—';
    curBox.textContent = '—';
    schedBox.textContent = '—';
    grantBtn.disabled = true;
    return;
  }

  const u = new URL('/admin/phone_pass/context', API_BASE);
  u.searchParams.set('osis', SELECTED_OSIS);
  const r = await adminFetch(u, { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `phone_pass/context HTTP ${r.status}`);

  const st = data.state || null;
  const sch = data.schedule || null;

  // Phone status
  const out = st?.phone_out === true;
  const since = st?.phone_out_since ? fmtClock(st.phone_out_since) : '';
  const by = st?.phone_out_by_title || st?.phone_out_by_email || '';
  phoneBox.textContent = out
    ? `OUT — picked up ${since ? ('@ ' + since) : ''}${by ? (' • by ' + by) : ''}`
    : 'IN — in locker';

  // Current location
  renderCurrentLocation(st);

  // Schedule
  renderScheduleTable(sch);

  selectedMeta.textContent = SELECTED_OSIS;

  // Enable button (only if not already out)
  grantBtn.disabled = !CAPS.can_grant || !SELECTED_OSIS || out;
}


async function grantPhone(osis){
  const note = String(noteInput?.value || '').trim();
  const r = await adminFetch('/admin/phone_pass/grant', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ osis, note })
  });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `phone_pass/grant HTTP ${r.status}`);
  if(noteInput) noteInput.value = '';
}


async function returnPhone(osis){
  const r = await adminFetch('/admin/phone_pass/return', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ osis })
  });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `phone_pass/return HTTP ${r.status}`);
}


function tickRefreshLabel(){
  if(!lastRefreshTs){
    refreshText.textContent = 'Never';
    return;
  }
  const diffSec = Math.round((Date.now()-lastRefreshTs)/1000);
  refreshText.textContent = `Refreshed ${diffSec}s ago`;
}

async function boot(){
  initThemeToggle();
  setErr('');
  setStatus(true, 'Connecting…');

  // Try session first
  try{
    const r = await adminFetch('/admin/session/check', { method:'GET' });
    const data = await r.json().catch(()=>({}));
    if(!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);

    // No role gate here.
    // The Worker enforces Staff Pull membership via KV (STAFF_PULL_ROLES_KEY).
    const role = String(data.role || '').trim();
    WHO = { email: data.email || '', role };
    hide(loginCard);
    show(appShell);
    setStatus(true, 'Live');
    
  }catch(e){
    // Need login
    hide(appShell);
    show(loginCard);

    try{
      if(!GOOGLE_CLIENT_ID){
        loginOut.textContent = 'Missing google-client-id meta.';
        return;
      }
      const gsi = await waitForGoogle();
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

  // If we are authed, load UI data
  if(appShell.style.display !== 'none'){
    dateText.textContent = new Date().toLocaleDateString();

    await loadOptions();
    whoText.textContent = WHO?.email ? `${WHO.email} (${WHO.role})` : '—';
    try{ await initCurrentPeriodPill_(); }catch(_){}

    // Initial lists
    if(CAPS.can_grant) fillResults('');
    await loadMine();
    await loadActive();

    // wire controls
    if(CAPS.can_grant){
      studentSearch.addEventListener('input', () => fillResults(studentSearch.value));
    }
    if(CAPS.can_grant) studentSelect.addEventListener('change', async () => {
      SELECTED_OSIS = String(studentSelect.value || '').trim();
      await loadSelectedContext().catch(e => setErr(e?.message || e));
    });

    if(CAPS.can_grant) grantBtn.addEventListener('click', async () => {
      if(!SELECTED_OSIS) return;
      grantBtn.disabled = true;
      try{
        await grantPhone(SELECTED_OSIS);
        await Promise.all([loadMine(), loadSelectedContext()]);
        setErr('');
      }catch(e){
        setErr(e?.message || e);
      }finally{
        grantBtn.disabled = false;
      }
    });

    // Auto refresh mine list (and selected context)
    setInterval(async () => {
      if(document.hidden) return;
      if(window.__refreshingMine) return;
      window.__refreshingMine = true;
      try{
        lastRefreshTs = Date.now();
        tickRefreshLabel();
        await loadMine();
    await loadActive();
        if(SELECTED_OSIS) await loadSelectedContext().catch(()=>{});
      }finally{
        window.__refreshingMine = false;
      }
    }, 8000);

    setInterval(tickRefreshLabel, 1000);
  }
}

async function onGoogleCredential(resp){
  try{
    loginOut.textContent = 'Signing in...';
    const r = await fetch(new URL('/admin/session/login_google', API_BASE), {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString(),
      credentials:'include'
    });
    const data = await r.json().catch(()=>({}));
    if(!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);

    const role = String(data.role || '').trim();
    WHO = { email: data.email || '', role };

    hide(loginCard);
    show(appShell);
    setStatus(true, 'Live');
    await boot(); // re-run boot to load data
  }catch(e){
    hide(appShell);
    show(loginCard);
    loginOut.textContent = `Login failed: ${e?.message || e}`;
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => boot().catch(console.error));
} else {
  boot().catch(console.error);
}
async function loadActive(){
  if(!CAPS.can_return) return;
  const r = await adminFetch('/admin/phone_pass/active', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `phone_pass/active HTTP ${r.status}`);

  const list = Array.isArray(data.active) ? data.active : [];
  activeCount.textContent = String(list.length || 0);
  activeList.innerHTML = '';

  if(!list.length){
    const e = document.createElement('div');
    e.className = 'muted';
    e.textContent = '—';
    activeList.appendChild(e);
    return;
  }

  for(const s of list){
    const row = document.createElement('div');
    row.className = 'row';

    const left = document.createElement('div');

    const nm = document.createElement('div');
    nm.className = 'row-title';
    nm.textContent = `${s.name || '—'} (${s.osis})`;

    const sub = document.createElement('div');
    sub.className = 'row-sub';
    const by = s.phone_out_by_title ? String(s.phone_out_by_title) : (s.phone_out_by_email ? String(s.phone_out_by_email) : '');
    const since = s.phone_out_since ? `since ${fmtClock(s.phone_out_since)}` : '';
    const loc = s.cur_label ? `@ ${s.cur_label}` : (s.cur_loc ? `@ ${s.cur_loc}` : '');
    sub.textContent = [by ? `allowed by ${by}` : '', since, loc].filter(Boolean).join(' • ') || '—';

    left.appendChild(nm);
    left.appendChild(sub);

    row.appendChild(left);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-danger';
    btn.textContent = 'Return';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try{
        await returnPhone(String(s.osis));
        await Promise.all([loadActive(), CAPS.can_grant ? loadMine() : Promise.resolve()]);
        if(CAPS.can_grant && SELECTED_OSIS === String(s.osis)) await loadSelectedContext().catch(()=>{});
      }catch(e){
        alert(e?.message || e);
      }finally{
        btn.disabled = false;
      }
    });
    row.appendChild(btn);

    activeList.appendChild(row);
  }
}


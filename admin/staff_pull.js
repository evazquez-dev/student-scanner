// Staff Pull page (social workers)
// Auth: same cookie-based admin session as teacher_attendance
// Worker endpoints used:
//  - GET  /admin/session/check
//  - GET  /admin/staff_pull/options
//  - GET  /admin/staff_pull/context?osis=...
//  - GET  /admin/staff_pull/mine
//  - POST /admin/staff_pull/pull
//  - POST /admin/staff_pull/release

const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';

const THEME_KEY = 'staff_pull_theme';
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

const studentSearch = document.getElementById('studentSearch');
const studentSelect = document.getElementById('studentSelect');

const selectedMeta = document.getElementById('selectedMeta');
const errBox = document.getElementById('errBox');

const curBox = document.getElementById('curBox');
const schedBox = document.getElementById('schedBox');

const pullBtn = document.getElementById('pullBtn');
const releaseBtn = document.getElementById('releaseBtn');

const mineList = document.getElementById('mineList');
const mineCount = document.getElementById('mineCount');

let WHO = null;
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
  const r = await adminFetch('/admin/staff_pull/options', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `staff_pull/options HTTP ${r.status}`);
  WHO = data.who || null;
  ALL = Array.isArray(data.students) ? data.students : [];
}

async function loadMine(){
  const r = await adminFetch('/admin/staff_pull/mine', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `staff_pull/mine HTTP ${r.status}`);

  const mine = Array.isArray(data.mine) ? data.mine : [];
  mineCount.textContent = String(mine.length);

  mineList.innerHTML = '';
  if(!mine.length){
    mineList.innerHTML = '<div class="muted">No students pulled.</div>';
    return;
  }

  for(const s of mine){
    const row = document.createElement('div');
    row.className = 'row';

    const left = document.createElement('div');
    const nm = document.createElement('div');
    nm.className = 'name';
    nm.textContent = s.name || '(Unknown)';
    const sub = document.createElement('div');
    sub.className = 'subline mono';
    const from = s.from_label ? `from ${s.from_label}` : (s.from_loc ? `from ${s.from_loc}` : '');
    const since = s.held_by_since ? `since ${fmtClock(s.held_by_since)}` : '';
    sub.textContent = [from, since].filter(Boolean).join(' • ') || '—';
    left.appendChild(nm);
    left.appendChild(sub);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-danger';
    btn.textContent = 'Release';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try{
        await releaseStudent(String(s.osis));
        await Promise.all([loadMine(), SELECTED_OSIS === String(s.osis) ? loadSelectedContext() : Promise.resolve()]);
      }catch(e){
        alert(e?.message || e);
      }finally{
        btn.disabled = false;
      }
    });

    row.appendChild(left);
    row.appendChild(btn);
    mineList.appendChild(row);
  }
}

async function loadSelectedContext(){
  if(!SELECTED_OSIS){
    selectedMeta.textContent = '—';
    curBox.textContent = '—';
    schedBox.textContent = '—';
    pullBtn.disabled = true;
    releaseBtn.disabled = true;
    return;
  }

  const u = new URL('/admin/staff_pull/context', API_BASE);
  u.searchParams.set('osis', SELECTED_OSIS);
  const r = await adminFetch(u, { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `staff_pull/context HTTP ${r.status}`);

  const st = data.state || null;
  const sch = data.schedule || null;

  // Current location
  if (!st || !st.date){
    curBox.textContent = 'No location state (treat as Off Campus)';
  } else {
    const label = st.location_label || st.loc || '—';
    const zone  = st.zone || '';
    const upd   = st.updated_at ? fmtClock(st.updated_at) : '—';
    curBox.textContent = `${label}  [zone=${zone}]  (updated ${upd})`;
  }

  // Schedule
  if (!sch || !sch.now){
    schedBox.textContent = 'No bell/schedule context right now.';
  } else {
    const now = sch.now;
    const next = sch.next;
    const nowTxt = `NOW: P${now.periodLocal} ${now.range || ''} — ${now.room || '—'}` + (now.course ? ` (${now.course})` : '');
    const nextTxt = next
      ? `NEXT: P${next.periodLocal} ${next.range || ''} — ${next.room || '—'}` + (next.course ? ` (${next.course})` : '')
      : 'NEXT: —';
    schedBox.textContent = nowTxt + '\n' + nextTxt;
  }

  selectedMeta.textContent = SELECTED_OSIS;

  // Enable buttons
  pullBtn.disabled = false;
  // Release is enabled if they're currently held
  const heldBy = String(st?.held_by_email || '').toLowerCase();
  const me     = String(WHO?.email || '').toLowerCase();
  const isAdmin = String(WHO?.role || '') === 'admin';

  const canRelease = !!heldBy && (isAdmin || (me && heldBy === me));
  releaseBtn.disabled = !canRelease;
}

async function pullStudent(osis){
  const r = await adminFetch('/admin/staff_pull/pull', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ osis })
  });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `pull HTTP ${r.status}`);
  return data;
}

async function releaseStudent(osis){
  const r = await adminFetch('/admin/staff_pull/release', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ osis })
  });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `release HTTP ${r.status}`);
  return data;
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

    // Initial list
    fillResults('');
    await loadMine();

    // wire controls
    studentSearch.addEventListener('input', () => fillResults(studentSearch.value));
    studentSelect.addEventListener('change', async () => {
      SELECTED_OSIS = String(studentSelect.value || '').trim();
      await loadSelectedContext().catch(e => setErr(e?.message || e));
    });

    pullBtn.addEventListener('click', async () => {
      if(!SELECTED_OSIS) return;
      pullBtn.disabled = true;
      try{
        await pullStudent(SELECTED_OSIS);
        await Promise.all([loadMine(), loadSelectedContext()]);
        setErr('');
      }catch(e){
        setErr(e?.message || e);
      }finally{
        pullBtn.disabled = false;
      }
    });

    releaseBtn.addEventListener('click', async () => {
      if(!SELECTED_OSIS) return;
      releaseBtn.disabled = true;
      try{
        await releaseStudent(SELECTED_OSIS);
        await Promise.all([loadMine(), loadSelectedContext()]);
        setErr('');
      }catch(e){
        setErr(e?.message || e);
      }finally{
        releaseBtn.disabled = false;
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

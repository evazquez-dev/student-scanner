const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';

const THEME_KEY = 'ss_theme_v1';

const loginCard = document.getElementById('loginCard');
const loginOut  = document.getElementById('loginOut');
const appShell  = document.getElementById('appShell');

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dateText   = document.getElementById('dateText');
const whoText    = document.getElementById('whoText');
const refreshText= document.getElementById('refreshText');

const themeToggleBtn = document.getElementById('themeToggleBtn');
const btnLogout = document.getElementById('btnLogout');

// Location card
const locZone = document.getElementById('locZone');
const locLabel = document.getElementById('locLabel');
const locSource = document.getElementById('locSource');
const locUpdated = document.getElementById('locUpdated');

// Class card
const classMeta = document.getElementById('classMeta');
const schedNow  = document.getElementById('schedNow');
const attLine   = document.getElementById('attLine');
const outInLine = document.getElementById('outInLine');

let lastRefreshTs = 0;
let autoTimer = null;

function show(el, on){ if(el) el.style.display = on ? '' : 'none'; }
function setStatus(ok, msg){
  if (!statusDot || !statusText) return;
  statusDot.className = 'pill-dot ' + (ok ? 'pill-dot--ok' : 'pill-dot--bad');
  statusText.textContent = msg;
}
function tickRefreshLabel(){
  if(!refreshText) return;
  if(!lastRefreshTs){ refreshText.textContent = 'Never'; return; }
  const diffSec = Math.round((Date.now()-lastRefreshTs)/1000);
  refreshText.textContent = `Refreshed ${diffSec}s ago`;
}

function getTheme(){
  const t = String(document.documentElement?.dataset?.theme || '').trim().toLowerCase();
  return (t === 'light') ? 'light' : 'dark';
}
function setTheme(theme){
  const t = (String(theme||'').toLowerCase() === 'light') ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try{ localStorage.setItem(THEME_KEY, t); }catch{}
  if(themeToggleBtn){
    themeToggleBtn.textContent = (t === 'light') ? '☀️ Light' : '🌙 Dark';
    themeToggleBtn.setAttribute('aria-pressed', String(t === 'light'));
  }
}
function initThemeToggle(){
  if(!themeToggleBtn) return;
  // sync label
  setTheme(getTheme());
  themeToggleBtn.addEventListener('click', () => setTheme(getTheme() === 'light' ? 'dark' : 'light'));
}

async function waitForGoogle(timeoutMs = 8000){
  const start = Date.now();
  while(!window.google?.accounts?.id){
    if(Date.now()-start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise(r=>setTimeout(r,50));
  }
  return window.google.accounts.id;
}

function studentFetch(pathOrUrl, init = {}){
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  return fetch(u, { ...init, credentials:'include', cache:'no-store' });
}

async function checkSession(){
  const r = await studentFetch('/student/session/check', { method:'GET' });
  if(!r.ok) return { ok:false };
  return r.json().catch(()=>({ ok:false }));
}

async function loginWithGoogle(idToken){
  const r = await studentFetch('/student/session/login_google', {
    method:'POST',
    headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ id_token: idToken }).toString()
  });
  const j = await r.json().catch(()=>({}));
  return { ok: !!(r.ok && j?.ok), status: r.status, j };
}

async function logout(){
  await studentFetch('/student/session/logout', { method:'POST' }).catch(()=>{});
  location.reload();
}

function zoneChipHTML(zone){
  const z = String(zone||'').trim().toLowerCase();
  const cls =
    z === 'hallway' ? 'hall' :
    z === 'bathroom' ? 'bath' :
    z === 'class' ? 'class' :
    z === 'lunch' ? 'lunch' :
    z === 'with_staff' ? 'staff' :
    z === 'off_campus' ? 'off' :
    (z === 'after_school' ? 'class' : '');
  const label = z ? z.replace(/_/g,' ') : 'unknown';
  return `<span class="zone-chip zone-chip--${cls}">${label.toUpperCase()}</span>`;
}

function fmtClock(iso){
  const d = new Date(iso);
  if(!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
}

function codeLetterFromAttendanceRow(row){
  if(!row) return '';
  const override = String(row.overrideLetter || '').trim().toUpperCase();
  if(override) return override;
  const st = String(row.status || row.scanStatus || '').trim().toLowerCase();
  if(st === 'late') return 'L';
  if(st === 'present') return 'P';
  return '';
}

async function loadDashboard(){
  const r = await studentFetch('/student/dashboard', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) throw new Error(data?.error || `dashboard_http_${r.status}`);

  lastRefreshTs = Date.now();
  tickRefreshLabel();

  dateText.textContent = String(data.date || '—');

  const who = data.who || {};
  whoText.textContent = who.name ? `${who.name} (${who.osis})` : (who.osis || who.email || '—');

  // Location
  const loc = data.location || null;
  const z = String(loc?.zone || '').trim();
  locZone.innerHTML = z ? zoneChipHTML(z) : '—';
  locLabel.textContent = String(loc?.location_label || loc?.loc || '—') || '—';
  locSource.textContent = String(loc?.source || '—') || '—';
  locUpdated.textContent = loc?.updated_at ? fmtClock(loc.updated_at) : '—';

  // Scheduled now/next from schedule blob
  const sch = data.schedule || null;
  const mode = String(sch?.mode || '');
  const cur = (mode === 'transition' ? (sch?.next || sch?.now) : sch?.now) || null;

  const p = String(cur?.periodLocal || cur?.period || '').trim();
  const rm = String(cur?.room || '').trim();
  const rng = cur?.range ? String(cur.range) : '';
  classMeta.textContent = p ? `P ${p}` : '—';
  schedNow.textContent = (p || rm || rng)
    ? `${p || '—'} • ${rm || '—'}${rng ? ` • ${rng}` : ''}`
    : '—';

  // Attendance
  const att = data.attendance || null;
  const code = codeLetterFromAttendanceRow(att);
  if(att && code){
    const src = String(att.overrideLetter || '').trim() ? 'teacher' : 'scan';
    const first = att.firstISO ? fmtClock(att.firstISO) : '—';
    const last  = att.lastISO ? fmtClock(att.lastISO) : '—';
    attLine.textContent = `${code} (${src}) • first ${first} • last ${last}`;
  }else{
    attLine.textContent = '—';
  }

  // Out/In (ClassSession)
  const sess = data.session || null;
  const firstIn = sess?.firstInISO ? fmtClock(sess.firstInISO) : '';
  const out = sess?.out || null;
  const isOut = !!out?.isOut;
  const outSince = out?.outSinceISO ? fmtClock(out.outSinceISO) : '';
  outInLine.textContent =
    (firstIn || isOut)
      ? `${firstIn ? `first-in ${firstIn}` : 'no first-in'} • ${isOut ? `OUT since ${outSince || '—'}` : 'IN'}`
      : '—';

  setStatus(true, 'Live');
}

async function boot(){
  initThemeToggle();

  btnLogout?.addEventListener('click', logout);

  // guardrails
  if(!API_BASE || /YOUR-WORKER/i.test(API_BASE)){
    show(loginCard, true); show(appShell, false);
    loginOut.textContent = 'Config needed: set <meta name="api-base"> to your Worker URL.';
    return;
  }
  if(!GOOGLE_CLIENT_ID || /YOUR_GOOGLE_CLIENT_ID/i.test(GOOGLE_CLIENT_ID)){
    show(loginCard, true); show(appShell, false);
    loginOut.textContent = 'Config needed: set <meta name="google-client-id">.';
    return;
  }

  // try session
  const sess = await checkSession().catch(()=>({ok:false}));
  if(sess?.ok){
    show(loginCard, false);
    show(appShell, true);
    setStatus(true, 'Live');
    await loadDashboard();
    autoTimer = setInterval(() => loadDashboard().catch(()=>setStatus(false,'Refresh error')), 8000);
    setInterval(tickRefreshLabel, 1000);
    return;
  }

  // login
  show(loginCard, true);
  show(appShell, false);
  loginOut.textContent = '—';

  const gsi = await waitForGoogle();
  gsi.initialize({
    client_id: GOOGLE_CLIENT_ID,
    ux_mode: 'popup',
    use_fedcm_for_prompt: true,
    callback: async (resp) => {
      try{
        loginOut.textContent = 'Signing in…';
        const res = await loginWithGoogle(resp.credential);
        if(!res.ok){
          loginOut.textContent = `Login failed: ${res?.j?.error || ('http_' + res.status)}`;
          return;
        }
        location.reload();
      }catch(e){
        loginOut.textContent = `Login failed: ${e?.message || e}`;
      }
    }
  });
  gsi.renderButton(document.getElementById('g_id_signin'), { theme:'outline', size:'large' });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => (loginOut.textContent = String(e?.message || e))));
} else {
  boot().catch(e => (loginOut.textContent = String(e?.message || e)));
}
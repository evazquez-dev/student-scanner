/* admin/student_view.js */

function meta(name){ return document.querySelector(`meta[name="${name}"]`)?.content || ''; }
const API_BASE = (meta('api-base') || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = meta('google-client-id') || '';

const loginCard = document.getElementById('loginCard');
const loginOut  = document.getElementById('loginOut');
const app       = document.getElementById('app');

const qEl    = document.getElementById('q');
const menuEl = document.getElementById('menu');
const pickedEl = document.getElementById('picked');

const locZone = document.getElementById('locZone');
const locLabel = document.getElementById('locLabel');
const locUpdated = document.getElementById('locUpdated');

const schedEl = document.getElementById('sched');
const attEl   = document.getElementById('att');
const oiEl    = document.getElementById('oi');
const metaEl  = document.getElementById('meta');

let selected = null; // { osis, name, email }

async function adminFetch(path, init={}){
  const url = new URL(path, API_BASE);
  return fetch(url.toString(), { ...init, credentials:'include', cache:'no-store' });
}

async function waitForGoogle(timeoutMs=8000){
  const start = Date.now();
  while(!window.google?.accounts?.id){
    if(Date.now()-start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise(r => setTimeout(r, 50));
  }
  return window.google.accounts.id;
}

async function getAccess(){
  const r = await adminFetch('/admin/access', { method:'GET' });
  if(!r.ok) return null;
  const j = await r.json().catch(()=>null);
  return (j && j.ok) ? j : null;
}

async function doLogin(idToken){
  const r = await adminFetch('/admin/session/login_google', {
    method:'POST',
    headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ id_token: idToken }).toString(),
  });
  const j = await r.json().catch(()=>null);
  if(!r.ok || !j?.ok) throw new Error(j?.error || `login_http_${r.status}`);
  return true;
}

function showMenu(items){
  if(!items?.length){
    menuEl.style.display = 'none';
    menuEl.innerHTML = '';
    return;
  }
  menuEl.innerHTML = '';
  for(const it of items){
    const b = document.createElement('button');
    const label = `${it.name || '—'} (${it.osis})`;
    const extra = it.email ? ` — ${it.email}` : '';
    b.textContent = label + extra;
    b.addEventListener('click', () => pick(it));
    menuEl.appendChild(b);
  }
  menuEl.style.display = '';
}

let debounceT = null;
function debounce(fn, ms){
  return (...args) => {
    clearTimeout(debounceT);
    debounceT = setTimeout(() => fn(...args), ms);
  };
}

async function search(q){
  const qq = String(q || '').trim();
  if (qq.length < 2){
    showMenu([]);
    metaEl.textContent = 'Type at least 2 characters to search…';
    return;
  }

  try{
    const r = await adminFetch(`/admin/roster/search?q=${encodeURIComponent(qq)}`, { method:'GET' });
    const text = await r.text().catch(()=> '');
    let j = null; try{ j = JSON.parse(text); }catch(_){}

    if(!r.ok || !j?.ok){
      metaEl.textContent = `Roster search error: ${j?.error || `HTTP ${r.status}`} ${String(j?.detail || text).slice(0,160)}`;
      showMenu([]);
      return;
    }

    metaEl.textContent = `Matches: ${j.results?.length || 0}`;
    showMenu(j.results || []);
  }catch(e){
    metaEl.textContent = `Roster search error: ${e?.message || e}`;
    showMenu([]);
  }
}

function fmtClock(iso){
  const d = new Date(iso);
  if(!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
}

function attendanceLine(att){
  if(!att) return '—';
  const code = String(att.overrideLetter || '').trim().toUpperCase();
  const st = String(att.status || att.scanStatus || '').trim();
  const first = att.firstISO ? fmtClock(att.firstISO) : '—';
  const last  = att.lastISO ? fmtClock(att.lastISO) : '—';
  if(code) return `${code} (override) • first ${first} • last ${last}`;
  if(st) return `${st} • first ${first} • last ${last}`;
  return '—';
}

function outInLine(sess){
  if(!sess) return '—';
  const firstIn = sess.firstInISO ? fmtClock(sess.firstInISO) : null;
  const out = sess.out || null;
  const isOut = !!out?.isOut;
  const since = out?.outSinceISO ? fmtClock(out.outSinceISO) : '—';
  const reason = String(out?.reason || '').trim();
  if(!firstIn && !isOut) return '—';
  return `${firstIn ? `first-in ${firstIn}` : 'no first-in'} • ${isOut ? `OUT since ${since}${reason?` (${reason})`:''}` : 'IN'}`;
}

async function loadDashboard(osis){
  const r = await adminFetch(`/admin/student/dashboard?osis=${encodeURIComponent(osis)}`, { method:'GET' });
  const j = await r.json().catch(()=>null);
  if(!r.ok || !j?.ok) throw new Error(j?.error || `dash_http_${r.status}`);

  const loc = j.location || null;
  locZone.textContent = String(loc?.zone || '—');
  locLabel.textContent = String(loc?.location_label || loc?.locLabel || loc?.loc || '—');
  locUpdated.textContent = loc?.updated_at ? fmtClock(loc.updated_at) : '—';

  const sch = j.schedule?.now || null;
  const p = String(sch?.periodLocal || '').trim();
  const rm = String(sch?.room || '').trim();
  const range = String(sch?.range || '').trim();
  schedEl.textContent = (p || rm || range) ? `${p || '—'} • ${rm || '—'}${range?` • ${range}`:''}` : '—';

  attEl.textContent = attendanceLine(j.attendance || null);
  oiEl.textContent  = outInLine(j.session || null);

  metaEl.textContent = `date=${j.date} • selected=${j.student?.name || '—'} (${j.student?.osis || osis})`;
}

async function pick(it){
  selected = { osis: String(it.osis), name: it.name || '', email: it.email || '' };
  pickedEl.textContent = `${selected.name || '—'} (${selected.osis})${selected.email ? ` • ${selected.email}` : ''}`;
  showMenu([]);
  qEl.blur();

  // set URL for shareability
  const u = new URL(location.href);
  u.searchParams.set('osis', selected.osis);
  history.replaceState(null, '', u.toString());

  await loadDashboard(selected.osis);
}

async function boot(){
  // wire search box
  qEl.addEventListener('input', debounce((e)=>search(e.target.value), 180));
  qEl.addEventListener('focus', ()=>{ if(menuEl.innerHTML) menuEl.style.display=''; });
  document.addEventListener('click', (e)=>{
    if(!menuEl.contains(e.target) && e.target !== qEl) showMenu([]);
  });

  // already logged in?
  let access = await getAccess();
  if(!access){
    loginOut.textContent = 'Please sign in.';
    const gsi = await waitForGoogle();
    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: 'popup',
      callback: async (resp) => {
        try{
          loginOut.textContent = 'Signing in…';
          await doLogin(resp.credential);
          location.reload();
        }catch(err){
          loginOut.textContent = `Login failed: ${err?.message || err}`;
        }
      }
    });
    gsi.renderButton(document.getElementById('g_id_signin'), { theme:'outline', size:'large' });
    return;
  }

  // access OK
  loginCard.style.display = 'none';
  app.style.display = '';

  // if URL has ?osis=..., load it
  const u = new URL(location.href);
  const osis = u.searchParams.get('osis');
  if(osis){
    await pick({ osis, name:'', email:'' });
  }
}

boot().catch(e => {
  loginOut.textContent = String(e?.message || e);
});

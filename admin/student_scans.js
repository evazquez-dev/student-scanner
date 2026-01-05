/* student_scans.js */

const TZ = 'America/New_York';

function meta(name){
  return document.querySelector(`meta[name="${name}"]`)?.content || '';
}
// Match hallway.js / teacher_attendance.js: normalize base URL and read client id from meta
const API_BASE = (meta('api-base') || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = meta('google-client-id') || '';

function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function adminFetch(path, init={}){
  const url = new URL(path, API_BASE);
  return fetch(url.toString(), { ...init, credentials:'include' });
}

async function waitForGoogle(timeoutMs = 8000){
  const start = Date.now();
  while(!window.google?.accounts?.id){
    if(Date.now() - start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise(r => setTimeout(r, 50));
  }
  return window.google.accounts.id;
}

function dtParts(iso){
  // Convert ISO -> parts in America/New_York (stable even if browser TZ differs)
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
    hour12:false
  });
  const parts = fmt.formatToParts(d).reduce((a,p)=> (a[p.type]=p.value, a), {});
  return {
    y: parts.year, m: parts.month, day: parts.day,
    hh: Number(parts.hour), mm: Number(parts.minute), ss: Number(parts.second),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    timeStr: `${parts.hour}:${parts.minute}:${parts.second}`
  };
}

function minutesSinceMidnight(iso){
  const p = dtParts(iso);
  return p.hh*60 + p.mm + (p.ss/60);
}

function fmtMinToTime(min){
  const m = Math.round(min);
  const hh = String(Math.floor(m/60)).padStart(2,'0');
  const mm = String(m%60).padStart(2,'0');
  return `${hh}:${mm}`;
}

function isMorningLoc(loc){
  const s = String(loc||'');
  return /Entrance\s*\(Morning\)/i.test(s);
}

function isBathroomLoc(loc){
  const s = String(loc||'');
  return /^Bathroom\s*\(/i.test(s);
}

function allowedType(allowed){
  const a = String(allowed||'').toLowerCase();
  if (!a) return 'none';
  if (a === 'out') return 'out';
  if (a === 'manually_cleared') return 'manual_out';
  if (a === 'in' || a.startsWith('in_')) return 'in';
  if (a.startsWith('full')) return 'denied_full';
  if (a.includes('denied')) return 'denied';
  return 'other';
}

function setText(id, text){
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function show(el, on){
  if (!el) return;
  el.style.display = on ? '' : 'none';
}

async function checkSession(){
  const r = await adminFetch('/admin/session/check', { method:'GET' });
  if (!r.ok) return { ok:false };
  return r.json().catch(()=>({ok:false}));
}

async function tryBootstrapSession(){
  try{
    const sess = await checkSession();
    return Boolean(sess && sess.ok);
  }catch{
    return false;
  }
}

async function loginWithGoogle(idToken){
  // Match hallway.js / teacher_attendance.js: cookie session created by Worker
  const r = await fetch(new URL('/admin/session/login_google', API_BASE), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ id_token: idToken }).toString(),
    credentials: 'include'
  });
  const j = await r.json().catch(()=>({}));
  return { ok: Boolean(r.ok && j && j.ok), status: r.status, j };
}

async function logout(){
  await adminFetch('/admin/logout', { method:'POST' }).catch(()=>{});
}

let APP_READY = false;
async function bootAuthed(){
  if (APP_READY) return;
  APP_READY = true;

  const loginCard = document.getElementById('loginCard');
  const appCard   = document.getElementById('appCard');

  show(loginCard, false);
  show(appCard, true);

  // load roster
  setText('out', 'Loading roster...');
  let roster = [];
  try {
    roster = await loadRoster();
  } catch (e){
    setText('out', `Roster error: ${e.message || e}`);
    return;
  }

  const sel = document.getElementById('studentSelect');
  const search = document.getElementById('studentSearch');

  renderRoster(sel, roster, '');

  search?.addEventListener('input', () => renderRoster(sel, roster, search.value));
  document.getElementById('btnRun')?.addEventListener('click', runReport);
}

async function loadRoster(){
  const r = await adminFetch('/admin/roster_students', { method:'GET' });
  const j = await r.json().catch(()=>({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `roster_http_${r.status}`);
  const roster = Array.isArray(j.roster) ? j.roster : [];

  // roster items from GAS are {o,n,...} :contentReference[oaicite:8]{index=8}
  roster.sort((a,b)=> String(a.n||'').localeCompare(String(b.n||'')));

  return roster.map(x => ({
    osis: String(x.o||'').trim(),
    name: String(x.n||'').trim()
  })).filter(x => x.osis && x.name);
}

function renderRoster(selectEl, roster, filterText){
  const q = String(filterText||'').toLowerCase().trim();
  selectEl.innerHTML = '';

  const filtered = !q ? roster : roster.filter(s =>
    s.name.toLowerCase().includes(q) || s.osis.includes(q)
  );

  for (const s of filtered){
    const opt = document.createElement('option');
    opt.value = s.osis;
    opt.textContent = `${s.name} (${s.osis})`;
    selectEl.appendChild(opt);
  }
}

function computeMorning(rows){
  const byDate = new Map();
  for (const r of rows){
    if (!isMorningLoc(r.location)) continue;
    const dkey = dtParts(r.whenISO).dateKey;
    const cur = byDate.get(dkey);
    if (!cur || r.whenISO < cur.whenISO) byDate.set(dkey, r);
  }

  const days = [...byDate.keys()].sort();
  const times = days.map(d => minutesSinceMidnight(byDate.get(d).whenISO));
  const avg = times.length ? (times.reduce((a,b)=>a+b,0)/times.length) : null;

  return { days, byDate, avg };
}

function computeBathroom(rows){
  // Pair per bathroom location, in chronological order
  const sessions = [];
  const missingOut = [];
  const missingIn = [];
  const denied = [];

  const openByLoc = new Map(); // loc -> { startRow }

  for (const r of rows){
    if (!isBathroomLoc(r.location)) continue;

    const t = allowedType(r.allowed);
    if (t === 'denied_full' || t === 'denied'){
      denied.push(r);
      continue;
    }

    const loc = r.location;

    if (t === 'in'){
      if (openByLoc.has(loc)){
        // previous IN never got an OUT
        missingOut.push(openByLoc.get(loc).startRow);
      }
      openByLoc.set(loc, { startRow: r });
    } else if (t === 'out' || t === 'manual_out'){
      const open = openByLoc.get(loc);
      if (!open){
        missingIn.push(r);
        continue;
      }
      const start = open.startRow;
      openByLoc.delete(loc);

      const durMin = (new Date(r.whenISO).getTime() - new Date(start.whenISO).getTime()) / 60000;
      sessions.push({
        loc,
        start,
        end: r,
        durMin: Math.max(0, durMin),
        manual: (t === 'manual_out'),
        periodId: String(start.periodId || '')
      });
    }
  }

  // Anything still open is missing OUT
  for (const open of openByLoc.values()){
    missingOut.push(open.startRow);
  }

  // Aggregate by period
  const byPeriod = new Map();
  for (const s of sessions){
    const p = s.periodId || '(unknown)';
    const cur = byPeriod.get(p) || { periodId:p, sessions:0, total:0, manual:0 };
    cur.sessions += 1;
    cur.total += s.durMin;
    if (s.manual) cur.manual += 1;
    byPeriod.set(p, cur);
  }

  return { sessions, missingOut, missingIn, denied, byPeriod };
}

function renderKPIs(rows, morning, bath){
  const el = document.getElementById('kpiGrid');
  if (!el) return;
  el.innerHTML = '';

  const kpis = [
    { label:'Total scans', value: String(rows.length) },
    { label:'Morning days', value: String(morning.days.length) },
    { label:'Avg morning in-time', value: morning.avg == null ? '—' : fmtMinToTime(morning.avg) },
    { label:'Bathroom sessions', value: String(bath.sessions.length) },
    { label:'Bathroom minutes', value: String(Math.round(bath.sessions.reduce((a,s)=>a+s.durMin,0))) },
    { label:'Bathroom missing OUT', value: String(bath.missingOut.length) },
    { label:'Bathroom missing IN', value: String(bath.missingIn.length) },
    { label:'Bathroom denied', value: String(bath.denied.length) },
  ];

  for (const k of kpis){
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '10px';
    card.innerHTML = `<div class="small">${esc(k.label)}</div><div style="font-size:20px;font-weight:700;">${esc(k.value)}</div>`;
    el.appendChild(card);
  }
}

function renderBathByPeriod(bath){
  const tb = document.querySelector('#bathByPeriod tbody');
  if (!tb) return;
  tb.innerHTML = '';

  const periods = [...bath.byPeriod.values()].sort((a,b)=> String(a.periodId).localeCompare(String(b.periodId)));

  // Also show missing/unknown under a row
  for (const p of periods){
    const avg = p.sessions ? (p.total / p.sessions) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${esc(p.periodId)}</td>
      <td>${esc(p.sessions)}</td>
      <td>${esc(Math.round(p.total))}</td>
      <td>${esc(avg ? avg.toFixed(1) : '0')}</td>
      <td>—</td>
      <td>—</td>
      <td>${esc(p.manual)}</td>
    `;
    tb.appendChild(tr);
  }

  // Put missing rows (not perfect per-period, but still actionable)
  const tr2 = document.createElement('tr');
  tr2.innerHTML = `
    <td class="mono">(all)</td>
    <td colspan="3" class="small">Missing / anomalous bathroom events (not paired)</td>
    <td>${esc(bath.missingOut.length)}</td>
    <td>${esc(bath.missingIn.length)}</td>
    <td class="small">Manual clears counted in sessions</td>
  `;
  tb.appendChild(tr2);
}

function renderMorningTable(morning){
  const wrap = document.getElementById('morningTableWrap');
  if (!wrap) return;

  const rows = morning.days.map(d => {
    const r = morning.byDate.get(d);
    const t = dtParts(r.whenISO).timeStr.slice(0,5);
    return `<tr><td class="mono">${esc(d)}</td><td class="mono">${esc(t)}</td><td>${esc(r.location)}</td></tr>`;
  }).join('');

  wrap.innerHTML = `
    <table style="width:100%;">
      <thead><tr><th>Date</th><th>First scan time</th><th>Location</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3" class="small">No morning scans in range.</td></tr>`}</tbody>
    </table>
  `;
}

function renderRaw(rows){
  const tb = document.querySelector('#rawTable tbody');
  if (!tb) return;
  tb.innerHTML = '';

  for (const r of rows){
    const p = dtParts(r.whenISO);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${esc(p.dateKey)} ${esc(p.timeStr)}</td>
      <td>${esc(r.location)}</td>
      <td class="mono">${esc(r.allowed || '')}</td>
      <td class="mono">${esc(r.cls || '')}</td>
      <td class="mono">${esc(r.periodId || '')}</td>
      <td class="mono">${esc(r.source || '')}</td>
      <td class="mono">${esc(r.device || '')}</td>
    `;
    tb.appendChild(tr);
  }
}

async function runReport(){
  const sel = document.getElementById('studentSelect');
  const osis = sel?.value || '';
  const start = document.getElementById('startDate')?.value || '';
  const end   = document.getElementById('endDate')?.value || '';
  const outEl = document.getElementById('out');

  if (!osis || !start || !end){
    if (outEl) outEl.textContent = 'Select a student and date range.';
    return;
  }

  if (outEl) outEl.textContent = 'Loading scans...';

  const url = new URL('/admin/scans_query', API_BASE);
  url.searchParams.set('osis', osis);
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  url.searchParams.set('max', '5000');

  const r = await fetch(url.toString(), { method:'GET', credentials:'include' });
  const j = await r.json().catch(()=>({}));

  if (!r.ok || !j.ok){
    if (outEl) outEl.textContent = `Error: ${j.error || 'http_' + r.status}\n${JSON.stringify(j, null, 2)}`;
    return;
  }

  const rows = Array.isArray(j.rows) ? j.rows : [];
  const name = rows.find(x => x.name)?.name || '(name unknown)';

  document.getElementById('studentHeader').innerHTML =
    `<div style="font-weight:700;">${esc(name)} <span class="mono">(${esc(osis)})</span></div>
     <div class="small">Range: <span class="mono">${esc(start)}</span> → <span class="mono">${esc(end)}</span>${j.truncated ? ' (truncated)' : ''}</div>`;

  setText('rawMeta', `Returned ${rows.length} scan(s). Truncated=${Boolean(j.truncated)}.`);
  if (outEl) outEl.textContent = '';

  // Compute
  const morning = computeMorning(rows);
  const bath = computeBathroom(rows);

  // Render
  renderKPIs(rows, morning, bath);
  renderBathByPeriod(bath);
  renderMorningTable(morning);
  renderRaw(rows);

  const bathSummary = document.getElementById('bathSummary');
  if (bathSummary){
    bathSummary.textContent =
      `Sessions: ${bath.sessions.length}. Missing OUT: ${bath.missingOut.length}. Missing IN: ${bath.missingIn.length}. Denied: ${bath.denied.length}.`;
  }
}

async function boot(){
  const loginCard = document.getElementById('loginCard');
  const appCard   = document.getElementById('appCard');
  const loginOut  = document.getElementById('loginOut');

  // Guardrails: avoid a blank page if the meta tags still have placeholders/missing values
  const rawApiBase = (meta('api-base') || '').trim();
  if (!rawApiBase || /YOUR-WORKER|your-worker/i.test(rawApiBase)){
    show(loginCard, true);
    show(appCard, false);
    if (loginOut){
      loginOut.textContent =
        'Config needed: update the <meta name="api-base"> tag in student_scans.html to your real Worker URL.';
    }
    return;
  }
  const rawClientId = (meta('google-client-id') || '').trim();
  if (!rawClientId || /YOUR_GOOGLE_CLIENT_ID/i.test(rawClientId)){
    show(loginCard, true);
    show(appCard, false);
    if (loginOut){
      loginOut.textContent =
        'Config needed: update the <meta name="google-client-id"> tag in student_scans.html to your real Google Client ID.';
    }
    return;
  }

  let appReady = false;

  async function bootAuthed(){
    if (appReady) return;
    appReady = true;

    show(loginCard, false);
    show(appCard, true);

    // load roster
    setText('out', 'Loading roster...');
    let roster = [];
    try {
      roster = await loadRoster();
    } catch (e){
      setText('out', `Roster error: ${e.message || e}`);
      return;
    }

    const sel = document.getElementById('room');
    sel.innerHTML = `<option value="">(all rooms)</option>` + roster.rooms.map(r => `<option>${esc(r)}</option>`).join('');

    // date range default last 7 days
    const end = new Date();
    const start = new Date(end.getTime() - 7*86400*1000);
    document.getElementById('endDate').value = end.toISOString().slice(0,10);
    document.getElementById('startDate').value = start.toISOString().slice(0,10);

    // actions
    document.getElementById('btnRun')?.addEventListener('click', async () => {
      const room = sel.value || '';
      const startDate = document.getElementById('startDate').value;
      const endDate   = document.getElementById('endDate').value;
      setText('out', 'Loading scans...');
      try{
        const rows = await loadScans({ room, startDate, endDate });
        renderTable(rows);
        setText('out', `Loaded ${rows.length} scans.`);
      }catch(e){
        setText('out', `Scan load error: ${e?.message || e}`);
      }
    });

    document.getElementById('btnLogout')?.addEventListener('click', async () => {
      try{
        await adminFetch('/admin/logout', { method:'POST' });
      }catch(e){}
      // force "not authed" state
      location.reload();
    });
  }

  // auth (safe: don't crash the page if fetch fails)
  let sess = { ok:false };
  try{
    sess = await checkSession();
  }catch(e){
    // e.g. Worker down / DNS error / blocked cookies
    sess = { ok:false, error: (e?.message || String(e)) };
  }

  if (sess.ok){
    await bootAuthed();
    return;
  }

  // Not authed → show login + render Google button (same flow as hallway.js)
  show(loginCard, true);
  show(appCard, false);

  if (sess && sess.error && loginOut){
    loginOut.textContent = `Session check failed: ${sess.error}`;
  }

  if (!GOOGLE_CLIENT_ID){
    loginOut.textContent = 'Missing GOOGLE_CLIENT_ID meta tag.';
    return;
  }

  try{
    await waitForGoogle();
    const gsi = window.google.accounts.id;

    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (resp) => {
        try{
          loginOut.textContent = 'Logging in...';
          const r = await loginWithGoogle(resp.credential);
          if (!r.ok){
            loginOut.textContent = `Login failed: ${r.status} ${r.statusText}`;
            return;
          }
          const data = await r.json().catch(()=>({ok:false}));
          if (!data.ok){
            loginOut.textContent = `Login failed: ${data.error || 'unknown error'}`;
            return;
          }
          await bootAuthed();
        }catch(e){
          loginOut.textContent = `Login failed: ${e?.message || e}`;
        }
      },
      ux_mode: 'popup',
      use_fedcm_for_prompt: true
    });

    gsi.renderButton(document.getElementById('g_id_signin'), { theme:'outline', size:'large' });
    loginOut.textContent = '—';
  }catch(e){
    loginOut.textContent = `Google init failed: ${e?.message || e}`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
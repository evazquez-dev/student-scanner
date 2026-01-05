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
let ROSTER_CACHE = [];

function rosterLabel(s){
  return `${s.name} (${s.osis})`;
}

function fillStudentDatalist(roster){
  const dl = document.getElementById('studentDatalist');
  if (!dl) return;
  dl.innerHTML = roster.map(s => `<option value="${esc(rosterLabel(s))}"></option>`).join('');
}

function parseOsisFromInput(value){
  const v = String(value || '').trim();

  // If they typed just the OSIS
  if (/^\d{6,12}$/.test(v)) return v;

  // If they picked "Name (OSIS)"
  const m = v.match(/\(([^)]+)\)\s*$/);
  if (m && m[1]) return m[1].trim();

  return '';
}

function setPickedStudent(osis){
  const hidden = document.getElementById('studentOsis');
  const hint = document.getElementById('studentPickHint');
  if (hidden) hidden.value = osis || '';

  if (hint){
    if (!osis) {
      hint.textContent = '';
    } else {
      const s = ROSTER_CACHE.find(x => x.osis === osis);
      hint.textContent = s ? `Selected: ${s.name} (${s.osis})` : `Selected OSIS: ${osis}`;
    }
  }
}

async function bootAuthed(){
  if (APP_READY) return;
  APP_READY = true;

  const loginCard = document.getElementById('loginCard');
  const appCard   = document.getElementById('appCard');

  show(loginCard, false);
  show(appCard, true);

  // load roster
  setText('out', 'Loading roster...');
  try {
    ROSTER_CACHE = await loadRoster();
  } catch (e){
    setText('out', `Roster error: ${e.message || e}`);
    return;
  }

  fillStudentDatalist(ROSTER_CACHE);
  setText('out', '');

  const search = document.getElementById('studentSearch');

  // When user types / picks a suggestion, update hidden OSIS
  search?.addEventListener('input', () => {
    const osis = parseOsisFromInput(search.value);
    setPickedStudent(osis);
  });

  // If they tab/blur out, try to resolve exact match by name (optional nice-to-have)
  search?.addEventListener('change', () => {
    let osis = parseOsisFromInput(search.value);
    if (!osis){
      const v = String(search.value || '').trim().toLowerCase();
      const exact = ROSTER_CACHE.find(s => s.name.toLowerCase() === v);
      if (exact) osis = exact.osis;
    }
    setPickedStudent(osis);
  });

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

// -------- Loading / Busy UI for Run --------
let REPORT_BUSY = false;

function ensureBusyUI(){
  // 1) Inject CSS once
  if (!document.getElementById('busyStyles')) {
    const st = document.createElement('style');
    st.id = 'busyStyles';
    st.textContent = `
      .btn.is-loading{ position:relative; padding-right:34px; }
      .btn.is-loading::after{
        content:'';
        position:absolute;
        right:12px;
        top:50%;
        width:14px;height:14px;
        margin-top:-7px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,0.25);
        border-top-color: rgba(255,255,255,0.95);
        animation: spin 0.8s linear infinite;
      }
      #busyOverlay{
        position:absolute;
        inset:0;
        background: rgba(0,0,0,0.45);
        backdrop-filter: blur(2px);
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius:14px;
        z-index:50;
      }
      #busyOverlay .box{
        background: linear-gradient(135deg, rgba(15,23,42,0.95), rgba(15,23,42,0.90));
        border: 1px solid rgba(148,163,184,.18);
        box-shadow: 0 18px 60px rgba(0,0,0,.55);
        border-radius: 12px;
        padding: 14px 16px;
        display:flex;
        align-items:center;
        gap:10px;
      }
      #busyOverlay .spinner{
        width:16px;height:16px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,0.25);
        border-top-color: rgba(255,255,255,0.95);
        animation: spin 0.8s linear infinite;
      }
      #busyOverlay .msg{
        font-weight:700;
      }
      #busyOverlay .sub{
        font-size:12px;
        color: rgba(255,255,255,0.65);
        margin-top:2px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(st);
  }

  // 2) Ensure overlay element exists (created lazily)
  const appCard = document.getElementById('appCard');
  if (!appCard) return;

  if (!document.getElementById('busyOverlay')) {
    // Make sure positioning works
    if (getComputedStyle(appCard).position === 'static') {
      appCard.style.position = 'relative';
    }

    const ov = document.createElement('div');
    ov.id = 'busyOverlay';
    ov.style.display = 'none';
    ov.innerHTML = `
      <div class="box" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <div>
          <div class="msg">Running…</div>
          <div class="sub">Please wait for results to load.</div>
        </div>
      </div>
    `;
    appCard.appendChild(ov);
  }
}

function setReportBusy(on, message){
  ensureBusyUI();

  REPORT_BUSY = Boolean(on);

  const btnRun = document.getElementById('btnRun');
  const appCard = document.getElementById('appCard');
  const ov = document.getElementById('busyOverlay');

  const idsToDisable = ['studentSearch','studentSelect','startDate','endDate','btnRun','btnLogout'];
  for (const id of idsToDisable){
    const el = document.getElementById(id);
    if (!el) continue;
    el.disabled = REPORT_BUSY;
  }

  if (btnRun){
    if (!btnRun.dataset.origText) btnRun.dataset.origText = btnRun.textContent || 'Run';
    if (REPORT_BUSY){
      btnRun.classList.add('is-loading');
      btnRun.textContent = message || 'Running…';
    } else {
      btnRun.classList.remove('is-loading');
      btnRun.textContent = btnRun.dataset.origText || 'Run';
    }
  }

  if (appCard){
    appCard.setAttribute('aria-busy', REPORT_BUSY ? 'true' : 'false');
  }

  if (ov){
    if (REPORT_BUSY){
      ov.querySelector('.msg') && (ov.querySelector('.msg').textContent = message || 'Running…');
      ov.style.display = '';
    } else {
      ov.style.display = 'none';
    }
  }
}

async function runReport(){
  if (REPORT_BUSY) return;

  const searchVal = document.getElementById('studentSearch')?.value || '';
  const osis =
    (document.getElementById('studentOsis')?.value || parseOsisFromInput(searchVal) || '').trim();

  const start = document.getElementById('startDate')?.value || '';
  const end   = document.getElementById('endDate')?.value || '';
  const outEl = document.getElementById('out');

  if (!osis || !start || !end){
    if (outEl) outEl.textContent = 'Select a student and date range.';
    return;
  }

  // Clear obvious areas immediately so the user sees "something happened"
  setText('rawMeta', '');
  const kpi = document.getElementById('kpiGrid'); if (kpi) kpi.innerHTML = '';
  const bathTb = document.querySelector('#bathByPeriod tbody'); if (bathTb) bathTb.innerHTML = '';
  const morningWrap = document.getElementById('morningTableWrap'); if (morningWrap) morningWrap.innerHTML = '';
  const rawTb = document.querySelector('#rawTable tbody'); if (rawTb) rawTb.innerHTML = '';
  const bathSummary = document.getElementById('bathSummary'); if (bathSummary) bathSummary.textContent = '';

  if (outEl) outEl.textContent = 'Loading scans...';
  setReportBusy(true, 'Running…');

  try{
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

    if (bathSummary){
      bathSummary.textContent =
        `Sessions: ${bath.sessions.length}. Missing OUT: ${bath.missingOut.length}. Missing IN: ${bath.missingIn.length}. Denied: ${bath.denied.length}.`;
    }
  } catch (e){
    if (outEl) outEl.textContent = `Error: ${e?.message || e}`;
  } finally {
    setReportBusy(false);
  }
}

async function boot(){
  const loginCard = document.getElementById('loginCard');
  const appCard   = document.getElementById('appCard');
  const loginOut  = document.getElementById('loginOut');

  // Wire logout (use the Worker route that actually exists)
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try{
      await adminFetch('/admin/session/logout', { method:'POST' });
    }catch(e){}
    location.reload();
  });

  // Default date range = last 7 calendar days (including today)
  try{
    const end = new Date();
    const start = new Date(Date.now() - 6*24*3600*1000);
    const endEl = document.getElementById('endDate');
    const startEl = document.getElementById('startDate');
    if (endEl) endEl.value = end.toISOString().slice(0,10);
    if (startEl) startEl.value = start.toISOString().slice(0,10);
  }catch(e){}

  // Guardrails for missing placeholders
  const rawApiBase = (meta('api-base') || '').trim();
  if (!rawApiBase || /YOUR-WORKER|your-worker/i.test(rawApiBase)){
    show(loginCard, true);
    show(appCard, false);
    if (loginOut){
      loginOut.textContent =
        'Config needed: update <meta name="api-base"> in student_scans.html to your real Worker URL.';
    }
    return;
  }

  const rawClientId = (meta('google-client-id') || '').trim();
  if (!rawClientId || /YOUR_GOOGLE_CLIENT_ID/i.test(rawClientId)){
    show(loginCard, true);
    show(appCard, false);
    if (loginOut){
      loginOut.textContent =
        'Config needed: update <meta name="google-client-id"> in student_scans.html to your real Google Client ID.';
    }
    return;
  }

  // Try existing session first
  let sess = { ok:false };
  try{
    sess = await checkSession();
  }catch(e){
    sess = { ok:false, error: (e?.message || String(e)) };
  }

  if (sess && sess.ok){
    await bootAuthed(); // <-- use your TOP-LEVEL bootAuthed() (the good one)
    return;
  }

  // Not authed -> show login + Google button
  show(loginCard, true);
  show(appCard, false);

  if (sess && sess.error && loginOut){
    loginOut.textContent = `Session check failed: ${sess.error}`;
  } else if (loginOut){
    loginOut.textContent = '';
  }

  try{
    await waitForGoogle();
    const gsi = window.google.accounts.id;

    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true,
      callback: async (resp) => {
        try{
          if (loginOut) loginOut.textContent = 'Logging in...';
          const r = await loginWithGoogle(resp.credential);

          if (!r.ok){
            const msg = r?.j?.error ? r.j.error : `http_${r.status}`;
            if (loginOut) loginOut.textContent = `Login failed: ${msg}`;
            return;
          }

          if (loginOut) loginOut.textContent = '';
          await bootAuthed();
        }catch(e){
          if (loginOut) loginOut.textContent = `Login failed: ${e?.message || e}`;
        }
      }
    });

    gsi.renderButton(document.getElementById('g_id_signin'), {
      theme: 'outline',
      size: 'large'
    });

    // Optional: ask the browser to show the “One Tap” prompt if available
    try{ gsi.prompt(); }catch(e){}
  }catch(e){
    if (loginOut) loginOut.textContent = `Google init failed: ${e?.message || e}`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
// Teacher Attendance page
// - Auth: same cookie-based admin session flow as hallway.js
// - Data sources:
//    1) /admin/meeting/preview?room=...&period=...&when=mid|end  (scheduled + AttendanceDO evidence)
//    2) /admin/hallway_state  (names + current zone/location today)

const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';

const loginCard  = document.getElementById('loginCard');
const loginOut   = document.getElementById('loginOut');
const appShell   = document.getElementById('appShell');

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dateText   = document.getElementById('dateText');
const refreshText= document.getElementById('refreshText');

const roomInput  = document.getElementById('roomInput');
const periodInput= document.getElementById('periodInput');
const whenSelect = document.getElementById('whenSelect');
const refreshBtn = document.getElementById('refreshBtn');
const copyCsvBtn = document.getElementById('copyCsvBtn');

const errBox     = document.getElementById('errBox');
const subtitleRight = document.getElementById('subtitleRight');
const rowsEl     = document.getElementById('rows');

const DEBUG = false;
const debugEl = document.getElementById('debugLog');

let IS_AUTHED = false;

function dbg(...args){
  if(!DEBUG) return;
  const ts = new Date().toISOString();
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a, null, 2)).join(' ');
  console.log('[teacher_att]', msg);
  if (debugEl){
    debugEl.style.display = 'block';
    debugEl.textContent += `[${ts}] ${msg}\n`;
  }
}

function show(el){ if(el) el.style.display='block'; }
function hide(el){ if(el) el.style.display='none'; }
function setStatus(ok, msg){
  statusDot.className = 'pill-dot ' + (ok ? 'pill-dot--ok' : 'pill-dot--bad');
  statusText.textContent = msg;
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

async function fetchTeacherOptions(){
  const r = await adminFetch('/admin/teacher_att/options', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok){
    throw new Error(data?.error || `teacher_att/options HTTP ${r.status}`);
  }
  return data; // { periods:[...], rooms:[...], ... }
}

function fillSelect(el, items, placeholder, preferredValue){
  if(!el) return;

  el.innerHTML = '';

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholder || 'Select…';
  el.appendChild(ph);

  for(const v of (items || [])){
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = String(v);
    el.appendChild(opt);
  }

  if(preferredValue && items?.includes(preferredValue)){
    el.value = preferredValue;
  }
}

function qs(){
  return new URLSearchParams(location.search);
}

function zoneToChipClass(zone){
  switch(String(zone||'')){
    case 'hallway': return 'chip--hall';
    case 'bathroom': return 'chip--bath';
    case 'class': return 'chip--class';
    case 'lunch': return 'chip--lunch';
    case 'off_campus': return 'chip--off';
    default: return '';
  }
}

function fmtClock(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function normRoom(s){
  return String(s||'').trim();
}
function normPeriod(s){
  return String(s||'').trim();
}

function overrideKey(date, room, period){
  return `teacher_att_override:${date}:${room.toLowerCase()}:${period}`;
}

function loadOverrides(date, room, period){
  try{
    const raw = localStorage.getItem(overrideKey(date, room, period));
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? obj : {};
  }catch{
    return {};
  }
}

function saveOverrides(date, room, period, obj){
  try{
    localStorage.setItem(overrideKey(date, room, period), JSON.stringify(obj || {}));
  }catch{}
}

function setErr(msg){
  if(!msg){
    errBox.style.display='none';
    errBox.textContent='';
    return;
  }
  errBox.style.display='block';
  errBox.textContent = String(msg);
}

let lastRefreshTs = 0;
let lastMergedRows = []; // for CSV button

function tickRefreshLabel(){
  if(!lastRefreshTs){
    refreshText.textContent = 'Never';
    return;
  }
  const diffSec = Math.round((Date.now()-lastRefreshTs)/1000);
  refreshText.textContent = `Refreshed ${diffSec}s ago`;
}

async function fetchRosterSnapshotMap(){
  const r = await adminFetch('/admin/hallway_state', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) {
    const extra = data?.message ? ` — ${data.message}` : '';
    throw new Error((data?.error || `hallway_state HTTP ${r.status}`) + extra);
  }

  // Build osis->student record map
  // hallway_state groups; safest is to walk all arrays we can find
  const map = new Map();

  const byLoc = data.by_location || {};
  for(const arr of Object.values(byLoc)){
    if(!Array.isArray(arr)) continue;
    for(const s of arr){
      const osis = String(s?.osis || '').trim();
      if(!osis) continue;
      map.set(osis, s);
    }
  }

  // Also: sometimes a flat list exists; keep it if present
  if(Array.isArray(data.rows)){
    for(const s of data.rows){
      const osis = String(s?.osis || '').trim();
      if(!osis) continue;
      if(!map.has(osis)) map.set(osis, s);
    }
  }

  return { date: data.date, map };
}

async function fetchPreview(room, period, whenType){
  const u = new URL('/admin/meeting/preview', API_BASE);
  u.searchParams.set('room', room);
  u.searchParams.set('period', period);
  u.searchParams.set('when', whenType);

  const r = await adminFetch(u, { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) {
    const extra = data?.message ? ` — ${data.message}` : '';
    throw new Error((data?.error || `meeting/preview HTTP ${r.status}`) + extra);
  }
  return data;
}

function renderRows({ date, room, period, whenType, previewRows, snapshotMap }){
  rowsEl.innerHTML = '';
  lastMergedRows = [];

  const overrides = loadOverrides(date, room, period);

  // Sort by name (if known), else OSIS
  const merged = previewRows.map(pr => {
    const osis = String(pr.osis);
    const snap = snapshotMap.get(osis) || null;
    const name = snap?.name || '(Unknown)';
    const zone = snap?.zone || '';
    const locLabel = snap?.locLabel || snap?.loc || '';
    const suggested = pr.codeLetter || '';
    const evidence = pr.evidence || null;
    const scanTime = evidence?.lastISO || evidence?.firstISO || null;
    const scanStatus = evidence?.status || (suggested === 'A' ? 'Absent' : '');
    const scanRoom = evidence?.room || '';
    const chosen = overrides[osis] || suggested || 'A';

    return { osis, name, zone, locLabel, suggested, chosen, scanTime, scanStatus, scanRoom };
  });

  merged.sort((a,b) => {
    const an = String(a.name||'').toLowerCase();
    const bn = String(b.name||'').toLowerCase();
    if(an !== bn) return an.localeCompare(bn);
    return String(a.osis).localeCompare(String(b.osis));
  });

  for(const r of merged){
    const row = document.createElement('div');
    row.className = 'row';

    const c1 = document.createElement('div');
    c1.className = 'name';
    const top = document.createElement('div');
    top.className = 'top';
    const student = document.createElement('div');
    student.className = 'student';
    student.textContent = r.name;

    const chip = document.createElement('span');
    chip.className = 'chip ' + zoneToChipClass(r.zone);
    chip.textContent = r.zone ? String(r.zone).toUpperCase() : '—';

    top.appendChild(student);
    top.appendChild(chip);

    const sub = document.createElement('div');
    sub.className = 'subline';
    // Show snapshot location, plus scan room mismatch hint if any
    const parts = [];
    if(r.locLabel) parts.push(r.locLabel);
    if(r.scanRoom && r.scanRoom && r.scanRoom.toLowerCase() !== room.toLowerCase()){
      parts.push(`scan@${r.scanRoom}`);
    }
    sub.textContent = parts.join(' • ') || '—';

    c1.appendChild(top);
    c1.appendChild(sub);

    const c2 = document.createElement('div');
    c2.className = 'mono muted';
    c2.textContent = r.osis;

    const c3 = document.createElement('div');
    const sel = document.createElement('select');
    sel.className = 'codeSelect';
    for(const opt of ['P','L','A']){
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    }
    sel.value = r.chosen || 'A';
    sel.title = `Suggested: ${r.suggested || '—'}`;
    sel.addEventListener('change', () => {
      const o = loadOverrides(date, room, period);
      o[r.osis] = sel.value;
      saveOverrides(date, room, period, o);
      setStatus(true, 'Saved');
    });
    c3.appendChild(sel);

    const c4 = document.createElement('div');
    c4.className = 'hide-sm muted';
    c4.textContent = r.scanTime ? `${fmtClock(r.scanTime)} • ${r.scanStatus || ''}` : '—';

    const c5 = document.createElement('div');
    c5.className = 'hide-sm muted';
    c5.textContent = r.locLabel || '—';

    row.appendChild(c1);
    row.appendChild(c2);
    row.appendChild(c3);
    row.appendChild(c4);
    row.appendChild(c5);

    rowsEl.appendChild(row);
    lastMergedRows.push(r);
  }

  subtitleRight.textContent = `${room} • P${period} • ${whenType} • ${merged.length} students`;
}

function buildCsv(date, room, period, whenType){
  // Output includes suggested and chosen (override)
  const lines = [];
  lines.push(['date','room','period','when','osis','name','suggested','chosen','scan_time','scan_status','snapshot_zone','snapshot_loc'].join(','));

  for(const r of lastMergedRows){
    const vals = [
      date,
      room,
      period,
      whenType,
      r.osis,
      r.name,
      r.suggested,
      r.chosen,
      r.scanTime ? new Date(r.scanTime).toISOString() : '',
      r.scanStatus || '',
      r.zone || '',
      r.locLabel || ''
    ].map(v => {
      const s = String(v ?? '');
      // simple CSV quoting
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    });
    lines.push(vals.join(','));
  }

  return lines.join('\n');
}

async function refreshOnce(){
  setErr('');
  const room = normRoom(roomInput.value);
  const period = normPeriod(periodInput.value);
  const whenType = String(whenSelect.value || 'mid');

  if(!room || !period){
    setErr('Room + Period are required.');
    return;
  }

  lastRefreshTs = Date.now();
  tickRefreshLabel();
  setStatus(true, 'Loading…');

  // Parallel fetch: preview + hallway snapshot
  const [snap, prev] = await Promise.all([
    fetchRosterSnapshotMap(),
    fetchPreview(room, period, whenType),
  ]);

  dateText.textContent = snap.date || prev.date || '—';

  renderRows({
    date: snap.date || prev.date,
    room,
    period,
    whenType,
    previewRows: Array.isArray(prev.rows) ? prev.rows : [],
    snapshotMap: snap.map
  });

  setStatus(true, 'Live');
}

document.addEventListener('visibilitychange', () => {
  if (!IS_AUTHED) return;
  if (document.hidden) stopAutoRefresh();
  else startAutoRefresh();
});

// ===== LOGIN FLOW (copied structure from hallway.js) =====
window.addEventListener('DOMContentLoaded', async () => {
  // Prefill from URL (?room=316&period=3&when=mid) or localStorage
  const p = qs();
  const roomQ = p.get('room') || localStorage.getItem('teacher_att_room') || '';
  const perQ  = p.get('period') || localStorage.getItem('teacher_att_period') || '';
  const whenQ = p.get('when') || localStorage.getItem('teacher_att_when') || 'mid';
  roomInput.value = roomQ;
  periodInput.value = perQ;
  whenSelect.value = (whenQ === 'end') ? 'end' : 'mid';

  roomInput.addEventListener('change', ()=>localStorage.setItem('teacher_att_room', roomInput.value.trim()));
  periodInput.addEventListener('change', ()=>localStorage.setItem('teacher_att_period', periodInput.value.trim()));
  whenSelect.addEventListener('change', ()=>localStorage.setItem('teacher_att_when', whenSelect.value));

  refreshBtn.addEventListener('click', () => refreshOnce().catch(err => {
    console.error(err);
    setErr(err?.message || String(err));
    setStatus(false, 'Error');
  }));

  copyCsvBtn.addEventListener('click', async () => {
    const date = dateText.textContent || '';
    const room = normRoom(roomInput.value);
    const period = normPeriod(periodInput.value);
    const whenType = String(whenSelect.value || 'mid');

    const csv = buildCsv(date, room, period, whenType);
    try{
      await navigator.clipboard.writeText(csv);
      setStatus(true, 'CSV copied');
    }catch{
      // fallback
      const ta = document.createElement('textarea');
      ta.value = csv;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setStatus(true, 'CSV copied');
    }
  });

  
  try{
    const r = await adminFetch('/admin/session/check', { method:'GET' });
    const data = await r.json().catch(()=>({}));
    if(!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);

    hide(loginCard);
    show(appShell);
    IS_AUTHED = true;
    setStatus(true, 'Live');
    // Populate dropdowns (PeriodLocal + Class Rooms)
    try{
      const opts = await fetchTeacherOptions();

      const savedRoom   = localStorage.getItem('teacher_att_room') || '';
      const savedPeriod = localStorage.getItem('teacher_att_period') || '';

      fillSelect(roomInput, opts.rooms || [], 'Select room…', savedRoom);
      fillSelect(periodInput, opts.periods || [], 'Select period…', savedPeriod);

      // If nothing saved, keep them blank
    }catch(e){
      // Don’t block the page if options fail — teachers can still type if you revert to inputs later
      console.warn('options load failed', e);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAutoRefresh();
      else startAutoRefresh();
    });


    // Auto-refresh once if room+period prefilled
    if(roomInput.value.trim() && periodInput.value.trim()){
      await refreshOnce();
    }
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

  setInterval(tickRefreshLabel, 1000);
});

let autoTimer = null;

function startAutoRefresh() {
  stopAutoRefresh();
  autoTimer = setInterval(() => {
    // don’t overlap requests
    if (window.__refreshing) return;
    window.__refreshing = true;
    refreshOnce()
      .catch(err => {
        console.error(err);
        setStatus(false, 'Auto-refresh error');
      })
      .finally(() => (window.__refreshing = false));
  }, 7000); // 7s is a good default
}

function stopAutoRefresh() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
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

    hide(loginCard);
    show(appShell);
    setStatus(true, 'Live');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAutoRefresh();
      else startAutoRefresh();
    });


    if(roomInput.value.trim() && periodInput.value.trim()){
      await refreshOnce();
    }
  }catch(e){
    hide(appShell);
    show(loginCard);
    loginOut.textContent = `Login failed: ${e?.message || e}`;
  }
}

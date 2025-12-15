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
// const whenSelect = document.getElementById('whenSelect');
const refreshBtn = document.getElementById('refreshBtn');
const copyCsvBtn = document.getElementById('copyCsvBtn');
const submitBtn = document.getElementById('submitBtn');

const errBox     = document.getElementById('errBox');
const subtitleRight = document.getElementById('subtitleRight');
const rowsEl     = document.getElementById('rows');

const DEBUG = false;
const debugEl = document.getElementById('debugLog');

let IS_AUTHED = false;

function onAuthed(){
  IS_AUTHED = true;
  hide(loginCard);
  show(appShell);
  bootTeacherAttendance();
}

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

async function initLogin(){
  try {
    const gsi = await waitForGoogle();

    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (resp) => {
        loginOut.textContent = 'Verifying…';

        const r = await fetch(API_BASE + 'admin/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id_token: resp.credential })
        });

        const data = await r.json().catch(() => null);

        if (!r.ok || !data?.ok) {
          throw new Error(data?.error || 'Login failed');
        }

        loginOut.textContent = 'Signed in';
        onAuthed();
      }
    });

    gsi.renderButton(
      document.getElementById('g_id_signin'),
      { theme: 'outline', size: 'large' }
    );

    loginOut.textContent = 'Ready';
  } catch (err) {
    loginOut.textContent = 'Login unavailable';
    console.error(err);
  }
}

// Always include cookies for admin requests
async function adminFetch(pathOrUrl, init = {}){
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  return fetch(u, { ...init, credentials:'include' });
}

async function populateDropdowns(){
  const opts = await fetchTeacherOptions();

  const savedPeriod = localStorage.getItem('teacher_att_period') || '';

  // ROOM: always blank on load (no default room)
  fillSelect(roomInput, opts.rooms || [], 'Select room…', '');

  // PERIOD: always prefer Worker’s current periodLocal; fallback to savedPeriod
  const preferredPeriod = String(opts.current_period_local || '').trim() || savedPeriod;
  fillSelect(periodInput, opts.periods || [], 'Select period…', preferredPeriod);

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

function zoneToDotClass(zone){
  switch(String(zone||'')){
    case 'hallway': return 'zoneDot--hall';
    case 'bathroom': return 'zoneDot--bath';
    case 'class': return 'zoneDot--class';
    case 'lunch': return 'zoneDot--lunch';
    case 'off_campus': return 'zoneDot--off';
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

async function fetchPreview(room, period, whenType, opts = {}){
  const u = new URL('/admin/meeting/preview', API_BASE);
  u.searchParams.set('room', room);
  u.searchParams.set('period', period);
  u.searchParams.set('when', whenType);

  if (opts.date) u.searchParams.set('date', String(opts.date));
  if (opts.forceCompute) u.searchParams.set('force_compute', '1');
  if (opts.ignoreOverrides) u.searchParams.set('ignore_overrides', '1');

  const r = await adminFetch(u, { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) {
    const extra = data?.message ? ` — ${data.message}` : '';
    throw new Error((data?.error || `meeting/preview HTTP ${r.status}`) + extra);
  }
  return data;
}
function renderRows({ date, room, period, whenType, snapshotRows, computedRows, snapshotMap }){
  rowsEl.innerHTML = '';
  lastMergedRows = [];

  // Map rows by OSIS for stable snapshot + computed scan suggestion
  const snapBy = new Map();
  for (const r of (snapshotRows || [])){
    const osis = String(r?.osis || '').trim();
    if (!osis) continue;
    snapBy.set(osis, { codeLetter: String(r.codeLetter || '').trim().toUpperCase() || 'A' });
  }

  const compBy = new Map();
  for (const r of (computedRows || [])){
    const osis = String(r?.osis || '').trim();
    if (!osis) continue;
    compBy.set(osis, {
      codeLetter: String(r.codeLetter || '').trim().toUpperCase() || 'A',
      evidence: r.evidence || null
    });
  }

  // For “end”: if a final snapshot exists, that’s the baseline (what will be sent).
  // If no snapshot exists yet (current/unfinished period), baseline is the scan-computed suggestion.
  const haveSnapshot = snapBy.size > 0;

  const overrides = loadOverrides(date, room, period);

  // Union keys
  const allOsis = new Set([...snapBy.keys(), ...compBy.keys()]);
  const merged = [];
  for (const osis of allOsis){
    const snapRec = snapBy.get(osis) || null;
    const compRec = compBy.get(osis) || null;

    const snap = snapshotMap.get(osis) || null;
    const name = snap?.name || '(Unknown)';
    const zone = snap?.zone || '';
    const locLabel = snap?.locLabel || snap?.loc || '';

    const snapshotLetter = snapRec?.codeLetter || '';
    const scanSuggested  = compRec?.codeLetter || '';
    const evidence = compRec?.evidence || null;

    const scanTime = evidence?.lastISO || evidence?.firstISO || null;
    const scanStatus = evidence?.status || (scanSuggested === 'A' ? 'Absent' : '');
    const scanRoom = evidence?.room || '';

    const baseline = (haveSnapshot ? snapshotLetter : scanSuggested) || 'A';

    // UI “chosen” starts from baseline unless user previously tweaked locally
    const chosen = (overrides[osis] || baseline || 'A').toUpperCase();

    merged.push({
      osis,
      name,
      zone,
      locLabel,
      snapshotLetter,
      scanSuggested,
      baseline,
      chosen,
      scanTime,
      scanStatus,
      scanRoom
    });
  }

  // Sort by name then OSIS
  merged.sort((a,b) => {
    const an = String(a.name||'').toLowerCase();
    const bn = String(b.name||'').toLowerCase();
    if(an !== bn) return an.localeCompare(bn);
    return String(a.osis).localeCompare(String(b.osis));
  });

  // helper: refresh Submit button state
  function updateSubmitState(){
    const changes = merged.filter(r => (r.chosen || 'A') !== (r.baseline || 'A'));
    if (submitBtn){
      submitBtn.disabled = changes.length === 0;
      submitBtn.textContent = changes.length ? `Submit changes (${changes.length})` : 'Submit changes';
    }
  }

  for(const r of merged){
    const mismatch = r.snapshotLetter && r.scanSuggested && (r.snapshotLetter !== r.scanSuggested);
    const changed  = (r.chosen || 'A') !== (r.baseline || 'A');

    const row = document.createElement('div');
    row.className = 'row' + (mismatch ? ' row--mismatch' : '') + (changed ? ' row--changed' : '');

    const c1 = document.createElement('div');
    c1.className = 'name';

    const top = document.createElement('div');
    top.className = 'top';

    const student = document.createElement('div');
    student.className = 'student';
    student.textContent = r.name;

    const dot = document.createElement('span');
    dot.className = 'zoneDot ' + zoneToDotClass(r.zone);
    const label = r.zone ? String(r.zone).replace(/_/g,' ') : 'unknown';
    dot.title = label;
    dot.setAttribute('aria-label', label);

    top.appendChild(dot);      // ✅ shows on mobile (CSS)
    top.appendChild(student);

    if (r.zone) {
      const chip = document.createElement('span');
      chip.className = 'chip ' + zoneToChipClass(r.zone);
      chip.textContent = String(r.zone).replace(/_/g, ' ');
      top.appendChild(chip);   // ✅ shows on desktop (CSS)
    }

    const sub = document.createElement('div');
    sub.className = 'subline';

    const parts = [];
    if(r.locLabel) parts.push(r.locLabel);
    if(r.scanRoom && r.scanRoom.toLowerCase() !== room.toLowerCase()){
      parts.push(`scan@${r.scanRoom}`);
    }
    if (mismatch) parts.push(`mismatch (scan:${r.scanSuggested || '—'} vs snap:${r.snapshotLetter || '—'})`);
    sub.textContent = parts.join(' • ') || '—';

    c1.appendChild(top);
    c1.appendChild(sub);

    const c2 = document.createElement('div');
    c2.className = 'mono muted hide-sm';
    c2.textContent = r.osis;

    const c3 = document.createElement('div');
    const sel = document.createElement('select');
    sel.className = 'codeSelect codeSelect--' + (r.chosen || 'A');
    for(const opt of ['P','L','A']){
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    }
    sel.value = r.chosen || 'A';
    sel.title = `Baseline: ${r.baseline || '—'} • Scan: ${r.scanSuggested || '—'} • Snapshot: ${r.snapshotLetter || '—'}`;

    sel.addEventListener('change', () => {
      r.chosen = String(sel.value || 'A').toUpperCase();

      // update color
      sel.className = 'codeSelect codeSelect--' + r.chosen;

      // Save locally as “only if changed”, otherwise clear
      const obj = loadOverrides(date, room, period);
      if (r.chosen !== (r.baseline || 'A')){
        obj[r.osis] = r.chosen;
      } else {
        delete obj[r.osis];
      }
      saveOverrides(date, room, period, obj);

      // Update row styles + submit state
      row.className = 'row' + (mismatch ? ' row--mismatch' : '') + ((r.chosen || 'A') !== (r.baseline || 'A') ? ' row--changed' : '');
      updateSubmitState();
    });

    c3.style.textAlign = 'center';
    c3.appendChild(sel);

    const c4 = document.createElement('div');
    c4.className = 'hide-sm';
    c4.textContent = r.scanTime ? fmtClock(r.scanTime) : '—';

    const c5 = document.createElement('div');
    c5.className = 'hide-sm';
    c5.textContent = r.zone ? String(r.zone).replace(/_/g,' ') : '—';

    row.appendChild(c1);
    row.appendChild(c2);
    row.appendChild(c3);
    row.appendChild(c4);
    row.appendChild(c5);

    rowsEl.appendChild(row);
    lastMergedRows.push(r);
  }

  subtitleRight.textContent = `${room} • P${period} • ${whenType} • ${merged.length} students` + (haveSnapshot ? ' • (snapshot)' : ' • (live)');

  updateSubmitState();
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
      r.snapshotLetter,
      r.scanSuggested,
      r.baseline,
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

async function submitChanges(){
  setErr('');
  const room = normRoom(roomInput.value);
  const periodLocal = normPeriod(periodInput.value);
  const whenType = 'end';
  const date = dateText.textContent || '';

  if(!room || !periodLocal){
    setErr('Room + Period are required.');
    return;
  }

  // Only send rows whose CHOSEN differs from BASELINE
  const changes = (lastMergedRows || [])
    .filter(r => (String(r.chosen||'A').toUpperCase() !== String(r.baseline||'A').toUpperCase()))
    .map(r => ({ osis: String(r.osis), codeLetter: String(r.chosen||'A').toUpperCase() }));

  if (!changes.length){
    setErr('No changes to submit.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  const r = await adminFetch('/admin/teacher_att/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, room, periodLocal, whenType, changes })
  });

  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok){
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit changes';
    throw new Error(data?.error || `submit HTTP ${r.status}`);
  }

  // Clear local overrides for this bucket (they’ve been persisted server-side)
  saveOverrides(date, room, periodLocal, {});
  setStatus(true, `Submitted ${data.applied_count || changes.length} change(s)`);
  await refreshOnce();
}

async function refreshOnce(){
  setErr('');
  const room = normRoom(roomInput.value);
  const period = normPeriod(periodInput.value);
  const whenType = 'end';

  if(!room || !period){
    setErr('Room + Period are required.');
    return;
  }

  lastRefreshTs = Date.now();
  tickRefreshLabel();
  setStatus(true, 'Loading…');

  // Parallel fetch:
  // 1) hallway snapshot (names + current zone/location)
  // 2) SNAPSHOT view (stable): will return mid/final snapshot if it exists
  // 3) COMPUTED view (scan-based): force compute, and ignore teacher overrides so we can highlight mismatches
  const [snap, snapView, computed] = await Promise.all([
    fetchRosterSnapshotMap(),
    fetchPreview(room, period, whenType, { forceCompute:false }),
    fetchPreview(room, period, whenType, { forceCompute:true, ignoreOverrides:true })
  ]);

  const date = snap.date || snapView.date || computed.date || '—';
  dateText.textContent = date;

  renderRows({
    date,
    room,
    period,
    whenType,
    snapshotRows: Array.isArray(snapView.rows) ? snapView.rows : [],
    computedRows: Array.isArray(computed.rows) ? computed.rows : [],
    snapshotMap: snap.map
  });

  setStatus(true, 'Live');
}

document.addEventListener('visibilitychange', () => {
  if (!IS_AUTHED) return;
  if (document.hidden) stopAutoRefresh();
  else startAutoRefresh();
});

async function bootTeacherAttendance(){
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

  

  submitBtn?.addEventListener('click', () => submitChanges().catch(err => {
    console.error(err);
    setErr(err?.message || String(err));
    setStatus(false, 'Error');
  }));
copyCsvBtn.addEventListener('click', async () => {
    const date = dateText.textContent || '';
    const room = normRoom(roomInput.value);
    const period = normPeriod(periodInput.value);
    const whenType = 'end';

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
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => bootTeacherAttendance().catch(console.error));
} else {
  bootTeacherAttendance().catch(console.error);
}

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
    IS_AUTHED = true;
    try{
      await populateDropdowns();
    }catch(e){
      console.warn('options load failed', e);
    }
    startAutoRefresh();

    if(roomInput.value.trim() && periodInput.value.trim()){
      await refreshOnce();
    }


    if(roomInput.value.trim() && periodInput.value.trim()){
      await refreshOnce();
    }
  }catch(e){
    hide(appShell);
    show(loginCard);
    loginOut.textContent = `Login failed: ${e?.message || e}`;
  }
}

document.addEventListener('DOMContentLoaded', initLogin);
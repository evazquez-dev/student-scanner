// Teacher Attendance page
// - Auth: same cookie-based admin session flow as hallway.js
// - Data sources:
//    1) /admin/meeting/preview?room=...&period=...&when=mid|end  (scheduled + AttendanceDO evidence)
//    2) /admin/hallway_state  (names + current zone/location today)

const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';

const THEME_KEY = 'teacher_att_theme';
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
  // dataset is set early in HTML; just sync UI + wire click handler
  updateThemeToggleUI();
  themeToggleBtn.addEventListener('click', () => {
    setTheme(getTheme() === 'light' ? 'dark' : 'light');
  });
}

const loginCard  = document.getElementById('loginCard');
const loginOut   = document.getElementById('loginOut');
const appShell   = document.getElementById('appShell');

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dateText   = document.getElementById('dateText');
const refreshText= document.getElementById('refreshText');
const currentPeriodText = document.getElementById('currentPeriodText');
const tableBox = document.getElementById('tableBox');
const outInHeader = document.getElementById('outInHeader');

const roomInput  = document.getElementById('roomInput');
const periodInput= document.getElementById('periodInput');
// const whenSelect = document.getElementById('whenSelect');
const refreshBtn = document.getElementById('refreshBtn');
const submitBtn = document.getElementById('submitBtn');
const submitBtnBottom = document.getElementById('submitBtnBottom');

const selectAllCb = document.getElementById('selectAllCb');
const bulkSelectedCountEl = document.getElementById('bulkSelectedCount');
const bulkCodeSelect = document.getElementById('bulkCodeSelect');
const applySelectedBtn = document.getElementById('applySelectedBtn');

const errBox     = document.getElementById('errBox');
const subtitleRight = document.getElementById('subtitleRight');
const rowsEl     = document.getElementById('rows');

const DEBUG = false;
const debugEl = document.getElementById('debugLog');

let IS_AUTHED = false;
let CURRENT_PERIOD_LOCAL = ''; // updated by renderCurrentPeriod()

const ADVISOR_PERIODS = new Set(['LCH1','LCH2','FM1','FM2','ADV']);
let TEACHER_OPTS_CACHE = null;

const roomLabelEl = document.querySelector('label[for="roomInput"]');

function isAdvisorPeriod(p){
  return ADVISOR_PERIODS.has(String(p||'').trim().toUpperCase());
}

function applyRoomDropdownFromOpts(opts, preferredRoom = ''){
  const period = String(periodInput?.value || '').trim();

  const advisorMode = isAdvisorPeriod(period);
  const items = advisorMode
    ? (opts?.advisors_by_period?.[String(period).trim().toUpperCase()] || [])
    : (opts?.rooms || []);

  if (roomLabelEl) roomLabelEl.textContent = advisorMode ? 'Advisor' : 'Room';

  // Keep selection only if it exists in the new list
  const current = String(preferredRoom || roomInput.value || '').trim();
  const keep = current && items.some(x => String(x) === current) ? current : '';

  fillSelect(roomInput, items, advisorMode ? 'Select advisor…' : 'Select room…', keep);

  // If we had to clear it, also clear saved room so we don't “stick” wrong mode
  if (!keep) {
    try { localStorage.setItem('teacher_att_room', ''); } catch {}
  }
}

// Cosmetic labels for attendance codes (keep values as A/L/P for API payloads)
const CODE_LABELS = { P: 'Present', L: 'Late', A: 'Absent' };
function codeLabel(code){
  const c = String(code || '').trim().toUpperCase();
  return CODE_LABELS[c] || (c || '—');
}

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

// Always include cookies for admin requests
async function adminFetch(pathOrUrl, init = {}){
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  return fetch(u, { ...init, credentials:'include' });
}

async function fetchClassSessionState(date, room, periodLocal){
  const u = new URL('/admin/class_session/state', API_BASE);
  u.searchParams.set('date', String(date || ''));
  u.searchParams.set('room', String(room || ''));
  u.searchParams.set('periodLocal', String(periodLocal || ''));

  const r = await adminFetch(u, { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) {
    throw new Error(data?.error || `class_session/state HTTP ${r.status}`);
  }
  return data;
}

async function toggleClassSessionOutIn({ date, room, periodLocal, osis }){
  const r = await adminFetch('/admin/class_session/toggle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, room, periodLocal, osis })
  });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) {
    throw new Error(data?.error || `class_session/toggle HTTP ${r.status}`);
  }
  return data;
}

async function populateDropdowns(){
  const opts = await fetchTeacherOptions();

  const savedPeriod = localStorage.getItem('teacher_att_period') || '';

  // ROOM: always blank on load (no default room)
  fillSelect(roomInput, opts.rooms || [], 'Select room…', '');

  // PERIOD: always prefer Worker’s current periodLocal; fallback to savedPeriod
  const preferredPeriod = String(opts.current_period_local || '').trim() || savedPeriod;
  const periodItems = Array.isArray(opts.period_options) ? opts.period_options : (opts.periods || []);
  fillSelect(periodInput, periodItems, 'Select period…', preferredPeriod);
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

  for(const item of (items || [])){
    const opt = document.createElement('option');

    if(item && typeof item === 'object'){
      const value = (item.value ?? item.id ?? item.local ?? '');
      const label = (item.label ?? item.text ?? value);
      opt.value = String(value);
      opt.textContent = String(label);
    } else {
      opt.value = String(item);
      opt.textContent = String(item);
    }

    el.appendChild(opt);
  }

  if(preferredValue != null && String(preferredValue).trim() !== ''){
    el.value = String(preferredValue);
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
    case 'with_staff': return 'chip--staff';
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
    case 'with_staff': return 'zoneDot--staff';
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

/******************** Bulk selection + apply ********************/
let SELECTED_OSIS = new Set();
let CURRENT_OSIS_LIST = [];         // [osis,...] for current rendered view
let ROW_UI = new Map();             // osis -> { rowEl, cbEl, selEl, outInBtn }
let ROW_DATA = new Map();           // osis -> row record object

function countChanges(){
  return (lastMergedRows || [])
    .filter(r => (String(r.chosen||'A').toUpperCase() !== String(r.baseline||'A').toUpperCase()))
    .length;
}

function updateSubmitButtons(){
  const n = countChanges();
  const label = n ? `Submit changes (${n})` : 'Submit changes';

  if (submitBtn){
    submitBtn.disabled = n === 0;
    submitBtn.textContent = label;
  }
  if (submitBtnBottom){
    submitBtnBottom.disabled = n === 0;
    submitBtnBottom.textContent = label;
  }
}

function updateBulkUI(){
  const n = SELECTED_OSIS.size;

  if (bulkSelectedCountEl){
    bulkSelectedCountEl.textContent = `${n} selected`;
  }
  if (applySelectedBtn){
    applySelectedBtn.disabled = n === 0;
  }

  if (selectAllCb){
    const total = CURRENT_OSIS_LIST.length;
    if (!total){
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    } else {
      selectAllCb.checked = (n === total);
      selectAllCb.indeterminate = (n > 0 && n < total);
    }
  }
}

function clearSelection(){
  SELECTED_OSIS.clear();
  for (const osis of CURRENT_OSIS_LIST){
    const ui = ROW_UI.get(osis);
    if (ui?.cbEl) ui.cbEl.checked = false;
  }
  updateBulkUI();
}

async function applyBulkCodeToSelected(){
  setErr('');

  const room = normRoom(roomInput.value);
  const periodLocal = normPeriod(periodInput.value);
  const date = dateText.textContent || '';
  const codeLetter = String(bulkCodeSelect?.value || '').trim().toUpperCase();
  const osisList = Array.from(SELECTED_OSIS);

  if (!osisList.length) return;

  if (!room || !periodLocal){
    setErr('Room + Period are required.');
    return;
  }

  if (!['P','L','A'].includes(codeLetter)){
    setErr('Pick an attendance code (P/L/A).');
    return;
  }

  // Update local state + UI first (fast)
  const overrides = loadOverrides(date, room, periodLocal);

  for (const osis of osisList){
    const r = ROW_DATA.get(osis);
    const ui = ROW_UI.get(osis);
    if (!r || !ui) continue;

    r.chosen = codeLetter;

    if (ui.selEl){
      ui.selEl.value = codeLetter;
      ui.selEl.className = 'codeSelect codeSelect--' + codeLetter;
    }

    const mismatch = !!r._mismatch;
    const changed  = (r.chosen || 'A') !== (r.baseline || 'A');

    if (ui.rowEl){
      ui.rowEl.className =
        'row' + (mismatch ? ' row--mismatch' : '') + (changed ? ' row--changed' : '');
    }

    // Save locally as “only if changed”, otherwise clear
    if (changed) overrides[osis] = codeLetter;
    else delete overrides[osis];

    // Enable Out/In only if Present or Late
    if (ui.outInBtn){
      const canToggle = (codeLetter === 'P' || codeLetter === 'L');
      ui.outInBtn.disabled = !canToggle;
      if (canToggle) {
        ui.outInBtn.title = ui.outInBtn.dataset.toggleTitle || 'Toggle Out/In';
      } else {
        ui.outInBtn.title = 'Mark Present (P) or Late (L) to enable Out/In';
      }
    }
  }

  saveOverrides(date, room, periodLocal, overrides);
  updateSubmitButtons();

  // Persist to Worker now (AttendanceDO teacher overrides)
  if (applySelectedBtn){
    applySelectedBtn.disabled = true;
    applySelectedBtn.textContent = `Updating (${osisList.length})…`;
  }

  try{
    const r = await adminFetch('/admin/attendance/override_batch', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({
        date,
        room,
        periodLocal,
        rows: osisList.map(osis => ({ osis, codeLetter }))
      })
    });

    const data = await r.json().catch(()=>null);
    if (!r.ok || !data?.ok) throw new Error(data?.error || `override_batch HTTP ${r.status}`);

    setStatus(true, `Updated ${data.wrote ?? osisList.length} student(s)`);
    clearSelection();
  } catch(e){
    setErr(e?.message || String(e));
    setStatus(false, 'Error');
  } finally {
    if (applySelectedBtn){
      applySelectedBtn.textContent = 'Change selected';
      applySelectedBtn.disabled = (SELECTED_OSIS.size === 0);
    }
    updateBulkUI();
  }
}
/******************** End bulk selection ********************/


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
function renderRows({ date, room, period, whenType, snapshotRows, computedRows, snapshotMap, sessionState }){
  rowsEl.innerHTML = '';
  lastMergedRows = [];

  // reset selection + per-row element refs
  ROW_UI = new Map();
  ROW_DATA = new Map();
  CURRENT_OSIS_LIST = [];
  SELECTED_OSIS = new Set();
  updateBulkUI();

  // Only show Out/In for the current period (and only if current period is known)
  const cur = String(CURRENT_PERIOD_LOCAL || '').trim();
  const allowOutIn = !!cur && (String(period || '').trim() === cur);

  // Collapse the Out/In column + hide header when not allowed
  if (tableBox) tableBox.classList.toggle('noOutIn', !allowOutIn);
  if (outInHeader) outInHeader.style.display = allowOutIn ? '' : 'none';

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

  // Bulk selection context for this view
  CURRENT_OSIS_LIST = merged.map(r => r.osis);
  updateBulkUI();

  // helper: refresh Submit button state (global)
  // NOTE: updateSubmitButtons() uses lastMergedRows

  for(const r of merged){
    const mismatch = r.snapshotLetter && r.scanSuggested && (r.snapshotLetter !== r.scanSuggested);
    const changed  = (r.chosen || 'A') !== (r.baseline || 'A');

    const row = document.createElement('div');
    row.className = 'row' + (mismatch ? ' row--mismatch' : '') + (changed ? ' row--changed' : '');

    // stash mismatch flag for bulk updater
    r._mismatch = mismatch;

    // selection checkbox (left column)
    const c0 = document.createElement('div');
    c0.className = 'selCell';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = SELECTED_OSIS.has(r.osis);
    cb.addEventListener('change', () => {
      if (cb.checked) SELECTED_OSIS.add(r.osis);
      else SELECTED_OSIS.delete(r.osis);
      updateBulkUI();
    });
    c0.appendChild(cb);

    let outInBtn = null; // set only if allowOutIn column is rendered

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

    // Normalize labels so "RM 112" / "Room 112" / "112" compare cleanly
    const normRoomKey = (s) => String(s || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')
      .replace(/^rm/, '')
      .replace(/^room/, '')
      .replace(/[^a-z0-9]/g, '');

    const selectedRoomKey = normRoomKey(room);

    // Only highlight wrong-room when viewing the CURRENT period (same rule as Out/In)
    const isCurrentPeriodView = allowOutIn;

    // Determine wrong-room: student is in class zone, has a locLabel, and it doesn't match selected room
    const studentRoomKey = normRoomKey(r.locLabel);
    const isWrongRoomNow =
      isCurrentPeriodView &&
      String(r.zone || '') === 'class' &&
      !!studentRoomKey &&
      !!selectedRoomKey &&
      (studentRoomKey !== selectedRoomKey);

    // Build subline as spans so we can style only the location part
    let added = false;
    const addSep = () => {
      if (added) sub.appendChild(document.createTextNode(' • '));
      added = true;
    };
    const addTextPart = (text, className) => {
      addSep();
      const span = document.createElement('span');
      if (className) span.className = className;
      span.textContent = text;
      sub.appendChild(span);
    };

    if (r.locLabel) {
      addTextPart(r.locLabel, isWrongRoomNow ? 'sublinePart--wrongRoom' : '');
    }

    if (r.scanRoom && r.scanRoom.toLowerCase() !== room.toLowerCase()) {
      addTextPart(`scan@${r.scanRoom}`, '');
    }

    if (mismatch) {
      addTextPart(`mismatch (scan:${codeLabel(r.scanSuggested)} vs snap:${codeLabel(r.snapshotLetter)})`, '');
    }

    if (!added) sub.textContent = '—';

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
      o.textContent = codeLabel(opt);
      sel.appendChild(o);
    }
    sel.value = r.chosen || 'A';
    sel.title = `Baseline: ${codeLabel(r.baseline)} • Scan: ${codeLabel(r.scanSuggested)} • Snapshot: ${codeLabel(r.snapshotLetter)}`;

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
      updateSubmitButtons();

      // Enable Out/In only if Present or Late
      if (outInBtn){
        const canToggle = (r.chosen === 'P' || r.chosen === 'L');
        outInBtn.disabled = !canToggle;
        if (canToggle) {
          outInBtn.title = outInBtn.dataset.toggleTitle || 'Toggle Out/In';
        } else {
          outInBtn.title = 'Mark Present (P) or Late (L) to enable Out/In';
        }
      }
    });

    c3.style.textAlign = 'center';
    c3.appendChild(sel);

    // store per-row refs for bulk actions
    const uiRef = { rowEl: row, cbEl: cb, selEl: sel, outInBtn: null };
    ROW_UI.set(r.osis, uiRef);
    ROW_DATA.set(r.osis, r);

    const c4 = document.createElement('div');
    c4.className = 'hide-sm';
    c4.textContent = r.scanTime ? fmtClock(r.scanTime) : '—';

    row.appendChild(c0);
    row.appendChild(c1);
    row.appendChild(c2);
    row.appendChild(c3);
    row.appendChild(c4);

    // Out/In only if selected period matches current period
    if (allowOutIn) {
      const c5 = document.createElement('div');
      c5.className = 'hide-sm';

      const sessRec = sessionState?.students ? sessionState.students[r.osis] : null;
      const isOut = !!(sessRec?.out && sessRec.out.isOut);
      const outSinceISO = sessRec?.out?.outSinceISO || null;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-mini ' + (isOut ? 'btn-in' : 'btn-out');
      btn.textContent = isOut ? 'IN' : 'OUT';
      btn.title = (isOut && outSinceISO) ? `Out since ${outSinceISO}` : 'Toggle Out/In';

      // store "real" tooltip so we can restore after being disabled
      btn.dataset.toggleTitle = btn.title;

      // Enable Out/In only if Present or Late
      outInBtn = btn;
      try{ uiRef.outInBtn = btn; }catch{}
      const canToggleInitial = (r.chosen === 'P' || r.chosen === 'L');
      btn.disabled = !canToggleInitial;
      if (!canToggleInitial) btn.title = 'Mark Present (P) or Late (L) to enable Out/In';

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try{
          const res = await toggleClassSessionOutIn({ date, room, periodLocal: period, osis: r.osis });
          if (!sessionState) sessionState = { ok:true, students:{} };
          if (!sessionState.students) sessionState.students = {};
          sessionState.students[r.osis] = sessionState.students[r.osis] || { osis: r.osis };
          sessionState.students[r.osis].out = sessionState.students[r.osis].out || {};
          sessionState.students[r.osis].out.isOut = !!res.isOut;
          if (res.isOut && res.outSinceISO) {
            sessionState.students[r.osis].out.outSinceISO = res.outSinceISO;
          } else {
            delete sessionState.students[r.osis].out.outSinceISO;
          }

          btn.className = 'btn btn-mini ' + (res.isOut ? 'btn-in' : 'btn-out');
          btn.textContent = res.isOut ? 'IN' : 'OUT';

          // refresh "real" tooltip
          btn.dataset.toggleTitle = (res.isOut && res.outSinceISO) ? `Out since ${res.outSinceISO}` : 'Toggle Out/In';
          btn.title = btn.dataset.toggleTitle;
        } finally {
          // stay disabled if not Present/Late
          const canToggleNow = (r.chosen === 'P' || r.chosen === 'L');
          btn.disabled = !canToggleNow;
          if (!canToggleNow) {
            btn.title = 'Mark Present (P) or Late (L) to enable Out/In';
          } else {
            btn.title = btn.dataset.toggleTitle || 'Toggle Out/In';
          }
        }
      });

      c5.appendChild(btn);
      row.appendChild(c5);
    }

    rowsEl.appendChild(row);
    lastMergedRows.push(r);
  }

  subtitleRight.textContent =
    `${room} • P${period} • ${whenType} • ${merged.length} students` +
    (haveSnapshot ? ' • (snapshot)' : ' • (live)') +
    (allowOutIn ? '' : ' • (Out/In hidden)');

  updateBulkUI();
  updateSubmitButtons();
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

  if (submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }
  if (submitBtnBottom){ submitBtnBottom.disabled = true; submitBtnBottom.textContent = 'Submitting…'; }
  try{
    const r = await adminFetch('/admin/teacher_att/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date, room, periodLocal, whenType, changes })
    });

    const data = await r.json().catch(()=>null);
    if(!r.ok || !data?.ok){
      throw new Error(data?.error || `submit HTTP ${r.status}`);
    }

    // Clear local overrides for this bucket (they’ve been persisted server-side)
    saveOverrides(date, room, periodLocal, {});
    setStatus(true, `Submitted ${data.applied_count || changes.length} change(s)`);
    await refreshOnce();
  } finally {
    updateSubmitButtons();
  }
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

  let sessionState = null;
  try{
    sessionState = await fetchClassSessionState(date, room, period);
  }catch(_){
    sessionState = null;
  }

  renderRows({
    date,
    room,
    period,
    whenType,
    snapshotRows: Array.isArray(snapView.rows) ? snapView.rows : [],
    computedRows: Array.isArray(computed.rows) ? computed.rows : [],
    snapshotMap: snap.map,
    sessionState
  });

  setStatus(true, 'Live');
}

document.addEventListener('visibilitychange', () => {
  if (!IS_AUTHED) return;
  if (document.hidden) stopAutoRefresh();
  else startAutoRefresh();
});

let CURRENT_PERIOD_TIMER = null;

function renderCurrentPeriod(opts){
  if(!currentPeriodText) return;

  const cur = String(opts?.current_period_local || '').trim();
  CURRENT_PERIOD_LOCAL = cur;
  if(!cur){
    currentPeriodText.textContent = 'Current: —';
    return;
  }

  // If Worker provides pretty labels (e.g., "4 (10:48 AM - 11:42 AM)"), use them
  let label = cur;
  const po = opts?.period_options;
  if(Array.isArray(po)){
    const found = po.find(x => String(x?.value) === cur);
    if(found?.label) label = String(found.label);
  }

  currentPeriodText.textContent = `Current: ${label}`;
}

function startCurrentPeriodTicker(){
  if(CURRENT_PERIOD_TIMER) return;

  // Update periodically so it stays correct as periods change
  CURRENT_PERIOD_TIMER = setInterval(async () => {
    if(!IS_AUTHED) return;
    try{
      const opts = await fetchTeacherOptions();
      renderCurrentPeriod(opts);
    }catch(_){}
  }, 60000);
}

async function bootTeacherAttendance(){
  initThemeToggle();
  // Prefill from URL (?room=316&period=3) or localStorage
  const p = qs();
  const roomQ = p.get('room') || localStorage.getItem('teacher_att_room') || '';
  const perQ  = p.get('period') || localStorage.getItem('teacher_att_period') || '';
  roomInput.value = roomQ;
  periodInput.value = perQ;

  // Teachers always operate on END
  localStorage.removeItem('teacher_att_when');

  roomInput.addEventListener('change', ()=>localStorage.setItem('teacher_att_room', roomInput.value.trim()));  
  periodInput.addEventListener('change', ()=>{
    localStorage.setItem('teacher_att_period', periodInput.value.trim());
    if (TEACHER_OPTS_CACHE) applyRoomDropdownFromOpts(TEACHER_OPTS_CACHE);
  });

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


  submitBtnBottom?.addEventListener('click', () => submitChanges().catch(err => {
    console.error(err);
    setErr(err?.message || String(err));
    setStatus(false, 'Error');
    updateSubmitButtons();
  }));

  applySelectedBtn?.addEventListener('click', () => applyBulkCodeToSelected().catch(err => {
    console.error(err);
    setErr(err?.message || String(err));
    setStatus(false, 'Error');
  }));

  selectAllCb?.addEventListener('change', () => {
    const on = !!selectAllCb.checked;
    if (!on) {
      SELECTED_OSIS.clear();
      for (const osis of CURRENT_OSIS_LIST){
        const ui = ROW_UI.get(osis);
        if (ui?.cbEl) ui.cbEl.checked = false;
      }
    } else {
      SELECTED_OSIS = new Set(CURRENT_OSIS_LIST);
      for (const osis of CURRENT_OSIS_LIST){
        const ui = ROW_UI.get(osis);
        if (ui?.cbEl) ui.cbEl.checked = true;
      }
    }
    updateBulkUI();
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
      TEACHER_OPTS_CACHE = opts;

      // Always show current period in the header pill
      renderCurrentPeriod(opts);
      startCurrentPeriodTicker();

      const savedRoom   = localStorage.getItem('teacher_att_room') || '';
      const savedPeriod = localStorage.getItem('teacher_att_period') || '';

      // Prefer URL params if present, otherwise prefer Worker current period, otherwise fall back
      const urlRoom   = (qs().get('room')   || '').trim();
      const urlPeriod = (qs().get('period') || '').trim();

      const preferredRoom   = urlRoom || savedRoom || '';
      const preferredPeriod =
        urlPeriod ||
        String(opts.current_period_local || '').trim() ||
        savedPeriod ||
        '';

      // Support period labels with time ranges if provided by Worker
      const periodItems = Array.isArray(opts.period_options) ? opts.period_options : (opts.periods || []);

      fillSelect(periodInput, periodItems, 'Select period…', preferredPeriod);
      applyRoomDropdownFromOpts(opts, preferredRoom);
    }catch(e){
      // Don’t block the page if options fail — teachers can still type if you revert to inputs later
      console.warn('options load failed', e);
    }

    startAutoRefresh();

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

    // ✅ NOW populate period + room immediately (same logic as bootTeacherAttendance)
    try{
      // tiny yield helps some browsers commit Set-Cookie before the next fetch
      await new Promise(res => setTimeout(res, 0));

      // small retry (handles rare cookie race / transient fetch hiccup)
      let opts = null;
      for(let i=0;i<3;i++){
        try{
          opts = await fetchTeacherOptions();
          break;
        }catch(e){
          if(i===2) throw e;
          await new Promise(res => setTimeout(res, 200*(i+1)));
        }
      }

      TEACHER_OPTS_CACHE = opts;

      // Current period pill
      renderCurrentPeriod(opts);
      startCurrentPeriodTicker();

      const savedRoom   = localStorage.getItem('teacher_att_room') || '';
      const savedPeriod = localStorage.getItem('teacher_att_period') || '';

      const q = new URLSearchParams(location.search);
      const urlRoom   = (q.get('room') || '').trim();
      const urlPeriod = (q.get('period') || '').trim();

      const preferredRoom = urlRoom || savedRoom || '';
      const preferredPeriod =
        urlPeriod ||
        String(opts.current_period_local || '').trim() ||
        savedPeriod ||
        '';

      const periodItems = Array.isArray(opts.period_options) ? opts.period_options : (opts.periods || []);

      fillSelect(periodInput, periodItems, 'Select period…', preferredPeriod);
      applyRoomDropdownFromOpts(opts, preferredRoom);

      // persist + trigger any dependent UI logic
      try{ periodInput.dispatchEvent(new Event('change')); }catch{}
      try{ roomInput.dispatchEvent(new Event('change')); }catch{}
    }catch(e){
      console.warn('options load failed', e);
    }

    startAutoRefresh();

    // Auto-refresh once if room+period are set
    if(roomInput.value.trim() && periodInput.value.trim()){
      await refreshOnce();
    }
  }catch(e){
    hide(appShell);
    show(loginCard);
    loginOut.textContent = `Login failed: ${e?.message || e}`;
  }
}
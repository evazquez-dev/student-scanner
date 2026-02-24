// Attendance Status page (EagleNEST)
// - Period audit: rooms/advisors where all scheduled students are Off Campus
// - Location extractor: build OSIS column from selected locations

const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';

const ADMIN_SESSION_KEY = 'attendance_status_admin_session_v1';
const ADMIN_SESSION_LEGACY_KEYS = [
  'ss_admin_session_sid_v1',
  'teacher_att_admin_session_v1',
  'admin_session_v1'
];
const ADMIN_SESSION_HEADER = 'x-admin-session';

function getStoredAdminSessionSid() {
  try {
    const own = String(sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY) || '').trim();
    if (own) return own;
    for (const k of ADMIN_SESSION_LEGACY_KEYS) {
      const v = String(sessionStorage.getItem(k) || localStorage.getItem(k) || '').trim();
      if (v) return v;
    }
  } catch {}
  return '';
}

function setStoredAdminSessionSid(sid) {
  const v = String(sid || '').trim();
  try {
    if (!v) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, v);
    localStorage.setItem(ADMIN_SESSION_KEY, v);
  } catch {}
}

function clearStoredAdminSessionSid() { setStoredAdminSessionSid(''); }

function stashAdminSessionFromResponse(resp) {
  try {
    const sid = String(resp?.headers?.get('x-admin-session') || resp?.headers?.get('X-Admin-Session') || '').trim();
    if (sid) setStoredAdminSessionSid(sid);
  } catch {}
}

async function adminFetch(pathOrUrl, init = {}) {
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  const headers = new Headers(init.headers || {});
  const sid = getStoredAdminSessionSid();
  if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);

  const resp = await fetch(u, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store'
  });

  stashAdminSessionFromResponse(resp);

  if (resp.status === 401) {
    try {
      const j = await resp.clone().json();
      if (j?.error === 'expired' || j?.error === 'no_session') clearStoredAdminSessionSid();
    } catch {}
  }
  return resp;
}

// DOM refs
const loginCard = document.getElementById('loginCard');
const loginOut = document.getElementById('loginOut');
const appShell = document.getElementById('appShell');

const liveDot = document.getElementById('liveDot');
const liveText = document.getElementById('liveText');
const dateText = document.getElementById('dateText');
const snapshotText = document.getElementById('snapshotText');
const topMsg = document.getElementById('topMsg');

const refreshAllBtn = document.getElementById('refreshAllBtn');
const refreshSnapBtn = document.getElementById('refreshSnapBtn');

const periodSelect = document.getElementById('periodSelect');
const runAuditBtn = document.getElementById('runAuditBtn');
const stopAuditBtn = document.getElementById('stopAuditBtn');
const auditProgress = document.getElementById('auditProgress');
const auditSummary = document.getElementById('auditSummary');
const roomsMeta = document.getElementById('roomsMeta');
const advisorsMeta = document.getElementById('advisorsMeta');
const roomsBody = document.getElementById('roomsBody');
const advisorsBody = document.getElementById('advisorsBody');
const auditError = document.getElementById('auditError');

const locList = document.getElementById('locList');
const locSummary = document.getElementById('locSummary');
const locSelectAllBtn = document.getElementById('locSelectAllBtn');
const locClearBtn = document.getElementById('locClearBtn');
const buildOsisBtn = document.getElementById('buildOsisBtn');
const copyOsisBtn = document.getElementById('copyOsisBtn');
const osisOut = document.getElementById('osisOut');
const locError = document.getElementById('locError');

// State
let optionsCache = null;
let snapshotCache = null;
let selectedLocations = new Set();
let auditStopRequested = false;
let activeAuditToken = 0;

// Utilities
function show(el){
  if (!el) return;
  el.classList.remove('hidden');
  // loginCard is hidden by CSS by default
  if (el.id === 'loginCard') el.style.display = 'block';
  else el.style.display = '';
}
function hide(el){
  if (!el) return;
  el.classList.add('hidden');
  el.style.display = 'none';
}

function setLive(ok, msg) {
  liveDot.className = 'dot ' + (ok ? 'ok' : 'bad');
  liveText.textContent = msg || (ok ? 'Live' : 'Error');
}

function setTopMsg(msg) { topMsg.textContent = msg || '—'; }

function fmtTs(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return String(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

async function readJson(resp) {
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok || !j?.ok) {
    const err = j?.error || `HTTP ${resp.status}`;
    throw new Error(String(err));
  }
  return j;
}

async function fetchAccess() {
  const r = await adminFetch('/admin/access', { method: 'GET' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

async function fetchOptions() {
  const r = await adminFetch('/admin/teacher_att/options', { method: 'GET' });
  return readJson(r);
}

async function fetchSnapshot() {
  const r = await adminFetch('/admin/hallway_state', { method: 'GET' });
  return readJson(r);
}

async function waitForGoogle(timeoutMs = 8000) {
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise(r => setTimeout(r, 50));
  }
  return window.google.accounts.id;
}

// Login/bootstrap
window.addEventListener('DOMContentLoaded', async () => {
  const booted = await tryBootstrapSession();
  if (booted) return;

  try {
    if (!GOOGLE_CLIENT_ID) {
      show(loginCard); hide(appShell);
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
    show(loginCard); hide(appShell);
    loginOut.textContent = '—';
  } catch (e) {
    show(loginCard); hide(appShell);
    loginOut.textContent = `Google init failed: ${e?.message || e}`;
  }
});

async function onGoogleCredential(resp) {
  try {
    loginOut.textContent = 'Signing in...';
    const r = await adminFetch('/admin/session/login_google', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString()
    });
    const data = await r.json().catch(() => ({}));
    if (data?.sid) setStoredAdminSessionSid(String(data.sid));
    stashAdminSessionFromResponse(r);
    if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);

    hide(loginCard); show(appShell);
    await initPage();
  } catch (e) {
    show(loginCard); hide(appShell);
    loginOut.textContent = `Login failed: ${e?.message || e}`;
  }
}

async function tryBootstrapSession() {
  try {
    const r = await adminFetch('/admin/session/check', { method: 'GET' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) return false;
    hide(loginCard); show(appShell);
    await initPage();
    return true;
  } catch {
    return false;
  }
}

// Page init
async function initPage() {
  bindEvents();
  setLive(true, 'Loading…');
  setTopMsg('Loading options and live snapshot…');

  try {
    const access = await fetchAccess();
    const can = !!(access?.can?.attendance_status || access?.can?.teacher_attendance || access?.can?.admin);
    if (!can) throw new Error('forbidden');

    const [opts, snap] = await Promise.all([fetchOptions(), fetchSnapshot()]);
    optionsCache = opts;
    snapshotCache = snap;
    renderOptions();
    renderSnapshotBasics();
    renderLocationPicker();
    buildOsisOutput();
    setLive(true, 'Live');
    setTopMsg('Ready.');
  } catch (e) {
    setLive(false, 'Load failed');
    setTopMsg(`Load failed: ${e?.message || e}`);
    showError(auditError, `Load failed: ${e?.message || e}`);
  }
}

let eventsBound = false;
function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  refreshAllBtn.addEventListener('click', async () => {
    try {
      setTopMsg('Refreshing options + snapshot…');
      clearError(auditError);
      clearError(locError);
      const [opts, snap] = await Promise.all([fetchOptions(), fetchSnapshot()]);
      optionsCache = opts;
      snapshotCache = snap;
      renderOptions();
      renderSnapshotBasics();
      renderLocationPicker();
      buildOsisOutput();
      setLive(true, 'Live');
      setTopMsg('Refreshed.');
    } catch (e) {
      setLive(false, 'Refresh failed');
      setTopMsg(`Refresh failed: ${e?.message || e}`);
      showError(auditError, `Refresh failed: ${e?.message || e}`);
    }
  });

  refreshSnapBtn.addEventListener('click', async () => {
    try {
      setTopMsg('Refreshing live snapshot…');
      clearError(locError);
      const snap = await fetchSnapshot();
      snapshotCache = snap;
      renderSnapshotBasics();
      renderLocationPicker();
      buildOsisOutput();
      setLive(true, 'Live');
      setTopMsg('Snapshot refreshed.');
    } catch (e) {
      setLive(false, 'Snapshot failed');
      setTopMsg(`Snapshot failed: ${e?.message || e}`);
      showError(locError, `Snapshot failed: ${e?.message || e}`);
    }
  });

  runAuditBtn.addEventListener('click', () => runAudit());
  stopAuditBtn.addEventListener('click', () => {
    auditStopRequested = true;
    setTopMsg('Stopping audit after current requests finish…');
  });

  locSelectAllBtn.addEventListener('click', () => {
    const keys = getSortedLocationKeys();
    selectedLocations = new Set(keys);
    renderLocationPicker();
    buildOsisOutput();
  });

  locClearBtn.addEventListener('click', () => {
    selectedLocations.clear();
    renderLocationPicker();
    buildOsisOutput();
  });

  buildOsisBtn.addEventListener('click', buildOsisOutput);

  copyOsisBtn.addEventListener('click', async () => {
    try {
      osisOut.select();
      osisOut.setSelectionRange(0, osisOut.value.length);
      await navigator.clipboard.writeText(osisOut.value);
      setTopMsg(`Copied ${osisOut.value ? osisOut.value.split(/\n+/).filter(Boolean).length : 0} OSIS value(s).`);
    } catch {
      try {
        document.execCommand('copy');
        setTopMsg('Copied.');
      } catch {
        setTopMsg('Copy failed. You can copy manually from the text box.');
      }
    }
  });
}

function renderOptions() {
  const opts = optionsCache || {};
  const current = String(periodSelect.value || '');
  const list = Array.isArray(opts.period_options) ? opts.period_options : (Array.isArray(opts.periods) ? opts.periods.map(p => ({ value:String(p), label:String(p) })) : []);
  periodSelect.innerHTML = '';
  for (const p of list) {
    const opt = document.createElement('option');
    opt.value = String(p.value || '');
    opt.textContent = String(p.label || p.value || '');
    periodSelect.appendChild(opt);
  }
  if (current && Array.from(periodSelect.options).some(o => o.value === current)) {
    periodSelect.value = current;
  } else if (opts.current_period_local && Array.from(periodSelect.options).some(o => o.value === String(opts.current_period_local))) {
    periodSelect.value = String(opts.current_period_local);
  }
}

function renderSnapshotBasics() {
  const snap = snapshotCache || {};
  dateText.textContent = String(snap.date || '—');
  snapshotText.textContent = fmtTs(snap.updated_at);
}

function getSortedLocationKeys() {
  const byLoc = snapshotCache?.by_location || {};
  return Object.keys(byLoc).sort((a, b) => {
    if (a === 'Off Campus') return -1;
    if (b === 'Off Campus') return 1;
    return a.localeCompare(b, undefined, { numeric:true, sensitivity:'base' });
  });
}

function renderLocationPicker() {
  const byLoc = snapshotCache?.by_location || {};
  const keys = getSortedLocationKeys();

  // keep only valid selections after refresh
  selectedLocations = new Set([...selectedLocations].filter(k => Object.prototype.hasOwnProperty.call(byLoc, k)));

  // default selection on first load
  if (!selectedLocations.size && keys.length) {
    const defaultKeys = keys.includes('Off Campus') ? ['Off Campus'] : [keys[0]];
    selectedLocations = new Set(defaultKeys);
  }

  locList.innerHTML = '';
  if (!keys.length) {
    locList.innerHTML = '<div class="muted small">No locations in the current snapshot.</div>';
    renderLocationSummary([]);
    return;
  }

  for (const key of keys) {
    const rows = Array.isArray(byLoc[key]) ? byLoc[key] : [];
    const id = 'loc_' + key.replace(/[^a-z0-9]+/gi, '_');
    const wrap = document.createElement('div');
    wrap.className = 'loc-item';
    wrap.innerHTML = `
      <input type="checkbox" id="${esc(id)}" ${selectedLocations.has(key) ? 'checked' : ''}>
      <label for="${esc(id)}">
        <span>${esc(key)}</span>
        <span class="count">${rows.length}</span>
      </label>
    `;
    const cb = wrap.querySelector('input');
    cb.addEventListener('change', () => {
      if (cb.checked) selectedLocations.add(key);
      else selectedLocations.delete(key);
      buildOsisOutput();
      renderLocationSummary(getSelectedLocationRows());
    });
    locList.appendChild(wrap);
  }

  renderLocationSummary(getSelectedLocationRows());
}

function getSelectedLocationRows() {
  const byLoc = snapshotCache?.by_location || {};
  const out = [];
  const seen = new Set();
  for (const key of selectedLocations) {
    const rows = Array.isArray(byLoc[key]) ? byLoc[key] : [];
    for (const r of rows) {
      const osis = String(r?.osis || '').trim();
      if (!osis || seen.has(osis)) continue;
      seen.add(osis);
      out.push({
        osis,
        name: String(r?.name || ''),
        location: key,
        zone: String(r?.zone || '')
      });
    }
  }
  out.sort((a, b) => a.osis.localeCompare(b.osis, undefined, { numeric:true }));
  return out;
}

function renderLocationSummary(rows) {
  const byLoc = snapshotCache?.by_location || {};
  const selectedCount = [...selectedLocations].length;
  const totalLocations = Object.keys(byLoc).length;
  const chips = [
    { k: 'Selected Locations', v: selectedCount },
    { k: 'Total Locations', v: totalLocations },
    { k: 'Unique Students', v: rows.length }
  ];
  locSummary.innerHTML = chips.map(c => `
    <div class="summary-chip">
      <div class="k">${esc(c.k)}</div>
      <div class="v">${esc(c.v)}</div>
    </div>
  `).join('');
}

function buildOsisOutput() {
  clearError(locError);
  try {
    const rows = getSelectedLocationRows();
    osisOut.value = rows.map(r => r.osis).join('\n');
    renderLocationSummary(rows);
    setTopMsg(`OSIS column built (${rows.length} student${rows.length === 1 ? '' : 's'}).`);
  } catch (e) {
    showError(locError, `Could not build OSIS output: ${e?.message || e}`);
  }
}

function clearAuditTables() {
  roomsBody.innerHTML = '<tr><td colspan="4" class="muted">Running…</td></tr>';
  advisorsBody.innerHTML = '<tr><td colspan="5" class="muted">Running…</td></tr>';
  roomsMeta.textContent = '';
  advisorsMeta.textContent = '';
  auditSummary.innerHTML = '';
}

function renderAuditSummary(chips) {
  auditSummary.innerHTML = (chips || []).map(c => `
    <div class="summary-chip">
      <div class="k">${esc(c.k)}</div>
      <div class="v">${esc(c.v)}</div>
    </div>
  `).join('');
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = String(msg || 'Unknown error');
  show(el);
}
function clearError(el) {
  if (!el) return;
  el.textContent = '';
  hide(el);
}

function stripLunchSuffix(label) {
  return String(label || '').replace(/\s+\([^)]*\)\s*$/, '').trim();
}

async function runAudit() {
  clearError(auditError);
  if (!optionsCache || !snapshotCache) {
    showError(auditError, 'Options or snapshot not loaded yet.');
    return;
  }
  const period = String(periodSelect.value || '').trim();
  if (!period) {
    showError(auditError, 'Pick a period first.');
    return;
  }

  const offRows = Array.isArray(snapshotCache?.by_location?.['Off Campus']) ? snapshotCache.by_location['Off Campus'] : [];
  const offCampusSet = new Set(offRows.map(r => String(r?.osis || '').trim()).filter(Boolean));

  const roomTargets = [];
  const advisorTargets = [];
  const opts = optionsCache;
  const rooms = Array.isArray(opts.rooms) ? opts.rooms : [];
  for (const room of rooms) {
    const rv = String(room || '').trim();
    if (!rv) continue;
    roomTargets.push({ kind:'room', room: rv, period });
  }

  const advisorPeriods = new Set((Array.isArray(opts.advisor_periods) ? opts.advisor_periods : []).map(v => String(v)));
  const lunchUiPeriods = new Set((Array.isArray(opts.lunch_ui_periods) ? opts.lunch_ui_periods : []).map(v => String(v)));

  if (advisorPeriods.has(period)) {
    const list = Array.isArray(opts.advisors_by_period?.[period]) ? opts.advisors_by_period[period] : [];
    for (const advisor of list) {
      const a = String(advisor || '').trim();
      if (!a) continue;
      advisorTargets.push({ kind:'advisor', mode:'advisor_room', advisor: a, room: a, period });
    }
  } else if (lunchUiPeriods.has(period)) {
    const list = Array.isArray(opts.lunch_advisors_by_period?.[period]) ? opts.lunch_advisors_by_period[period] : [];
    const map = (opts.lunch_advisor_to_room && typeof opts.lunch_advisor_to_room === 'object') ? (opts.lunch_advisor_to_room[period] || {}) : {};
    for (const advisor of list) {
      const a = String(advisor || '').trim();
      if (!a) continue;
      let room = String(map[a] || '').trim();
      if (!room) room = String(map[stripLunchSuffix(a)] || '').trim();
      advisorTargets.push({ kind:'advisor', mode:'lunch', advisor: a, room, period });
    }
  }

  auditStopRequested = false;
  const myToken = ++activeAuditToken;
  clearAuditTables();

  const allTargets = [...roomTargets, ...advisorTargets];
  if (!allTargets.length) {
    roomsBody.innerHTML = '<tr><td colspan="4" class="muted">No targets found for this period.</td></tr>';
    advisorsBody.innerHTML = '<tr><td colspan="5" class="muted">No advisor groups for this period.</td></tr>';
    renderAuditSummary([
      { k:'Targets', v:0 },
      { k:'Off Campus Students', v:offCampusSet.size }
    ]);
    return;
  }

  setTopMsg(`Running audit for period ${period}…`);
  setLive(true, 'Auditing');
  auditProgress.textContent = `Queued ${allTargets.length} target(s)…`;

  let completed = 0;
  const results = [];
  const errors = [];
  const CONCURRENCY = 6;

  async function fetchTarget(t) {
    if (auditStopRequested || myToken !== activeAuditToken) return null;
    if (!t.room) {
      return { ...t, ok:false, error:'missing_room_map', rows:[] };
    }
    const url = new URL('/admin/meeting/preview', API_BASE);
    url.searchParams.set('period', t.period);
    url.searchParams.set('room', t.room);
    url.searchParams.set('when', 'end');
    url.searchParams.set('force_compute', '1');
    if (t.mode === 'lunch' && t.advisor) url.searchParams.set('advisor', t.advisor);

    try {
      const r = await adminFetch(url, { method:'GET' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        return { ...t, ok:false, error: String(j?.error || `HTTP ${r.status}`), rows: [] };
      }
      const rows = Array.isArray(j.rows) ? j.rows : [];
      const osisList = rows.map(x => String(x?.osis || '').trim()).filter(Boolean);
      const offList = osisList.filter(o => offCampusSet.has(o));
      return {
        ...t,
        ok:true,
        scheduled_count: Number(j?.scheduled_count ?? osisList.length) || osisList.length,
        will_send_count: Number(j?.will_send_count ?? rows.length) || rows.length,
        osisList,
        offList,
        offCount: offList.length,
        allOff: osisList.length > 0 && offList.length === osisList.length,
        source: j?.source || '',
      };
    } catch (e) {
      return { ...t, ok:false, error: String(e?.message || e), rows: [] };
    }
  }

  async function workerLoop(queue) {
    while (queue.length && !auditStopRequested && myToken === activeAuditToken) {
      const t = queue.shift();
      const res = await fetchTarget(t);
      completed += 1;
      auditProgress.textContent = `Processed ${completed}/${allTargets.length}…`;
      if (!res) continue;
      if (!res.ok) errors.push(res);
      else results.push(res);
    }
  }

  const queue = allTargets.slice();
  const runners = [];
  const n = Math.min(CONCURRENCY, queue.length);
  for (let i = 0; i < n; i++) runners.push(workerLoop(queue));
  await Promise.all(runners);

  if (myToken !== activeAuditToken) return; // superseded by a newer run

  // Render
  const roomResults = results.filter(r => r.kind === 'room');
  const advisorResults = results.filter(r => r.kind === 'advisor');

  const roomAllOff = roomResults.filter(r => r.allOff).sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric:true, sensitivity:'base' }));
  const advisorAllOff = advisorResults.filter(r => r.allOff).sort((a, b) => a.advisor.localeCompare(b.advisor, undefined, { sensitivity:'base' }));

  const roomWithStudents = roomResults.filter(r => r.osisList.length > 0).length;
  const advisorWithStudents = advisorResults.filter(r => r.osisList.length > 0).length;

  roomsMeta.textContent = `${roomAllOff.length} flagged / ${roomWithStudents} with scheduled students`;
  advisorsMeta.textContent = `${advisorAllOff.length} flagged / ${advisorWithStudents} with scheduled students`;

  if (roomAllOff.length) {
    roomsBody.innerHTML = roomAllOff.map(r => `
      <tr>
        <td class="mono">${esc(r.room)}</td>
        <td>${esc(r.osisList.length)}</td>
        <td>${esc(r.offCount)}</td>
        <td class="mono">${esc(r.osisList.slice(0, 6).join(', '))}</td>
      </tr>
    `).join('');
  } else {
    roomsBody.innerHTML = '<tr><td colspan="4" class="muted">No rooms matched this condition.</td></tr>';
  }

  if (advisorAllOff.length) {
    advisorsBody.innerHTML = advisorAllOff.map(r => `
      <tr>
        <td>${esc(r.advisor)}</td>
        <td class="mono">${esc(r.room || '—')}</td>
        <td>${esc(r.osisList.length)}</td>
        <td>${esc(r.offCount)}</td>
        <td class="mono">${esc(r.osisList.slice(0, 6).join(', '))}</td>
      </tr>
    `).join('');
  } else {
    advisorsBody.innerHTML = '<tr><td colspan="5" class="muted">No advisors matched this condition for this period.</td></tr>';
  }

  renderAuditSummary([
    { k:'Period', v: period },
    { k:'Targets Checked', v: completed },
    { k:'Rooms Flagged', v: roomAllOff.length },
    { k:'Advisors Flagged', v: advisorAllOff.length },
    { k:'Off Campus Students', v: offCampusSet.size },
    { k:'Errors', v: errors.length }
  ]);

  const stopMsg = auditStopRequested ? ' (stopped early)' : '';
  auditProgress.textContent = `Done. ${completed}/${allTargets.length} processed${stopMsg}.`;

  if (errors.length) {
    const sample = errors.slice(0, 8).map(e => {
      const who = e.kind === 'advisor' ? `Advisor "${e.advisor}" (room ${e.room || '?'})` : `Room ${e.room}`;
      return `• ${who}: ${e.error}`;
    }).join('\n');
    showError(auditError, `Some targets failed:\n${sample}${errors.length > 8 ? `\n… and ${errors.length - 8} more` : ''}`);
  } else {
    clearError(auditError);
  }

  setLive(true, 'Live');
  setTopMsg(`Audit complete for period ${period}.`);
}

// admin/admin.js — Admin UI with bathroom cap helpers (ALL / M / F)

/* ===============================
 * BASE + ELEMENTS
 * =============================== */
const _metaApiBase = (document.querySelector('meta[name="api-base"]')?.content || '').trim();
const API_BASE = ((_metaApiBase ? _metaApiBase.replace(/\/*$/, '') : window.location.origin) + '/');

// ---- iOS cross-origin session fallback (Option 2) ----
const ADMIN_SESSION_HEADER = 'x-admin-session';
const ADMIN_SESSION_KEYS = [
  'admin_session_v1',
  'ss_admin_session_sid_v1',
  'teacher_att_admin_session_v1',
  'staff_pull_admin_session_v1',
  'phone_pass_admin_session_v1',
  'student_scans_admin_session_v1'
];

function getStoredAdminSessionSid(){
  try{
    for (const k of ADMIN_SESSION_KEYS){
      const v = String(sessionStorage.getItem(k) || localStorage.getItem(k) || '').trim();
      if (v) return v;
    }
  }catch{}
  return '';
}

function setStoredAdminSessionSid(sid){
  const v = String(sid || '').trim();
  if (!v) return;
  try{
    for (const k of ADMIN_SESSION_KEYS){
      sessionStorage.setItem(k, v);
      localStorage.setItem(k, v);
    }
  }catch{}
}

function clearStoredAdminSessionSid(){
  try{
    for (const k of ADMIN_SESSION_KEYS){
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    }
  }catch{}
}

function stashAdminSessionFromResponse(resp, data){
  try{
    const sidFromHeader = String(
      resp?.headers?.get(ADMIN_SESSION_HEADER) ||
      resp?.headers?.get('X-Admin-Session') ||
      ''
    ).trim();
    const sidFromBody = String(data?.sid || '').trim();
    const sid = sidFromBody || sidFromHeader;
    if (sid) setStoredAdminSessionSid(sid);
  }catch{}
}

const apiBaseEl = document.getElementById('apiBase');
if (apiBaseEl) apiBaseEl.textContent = API_BASE;

// Cards / outputs
const loginCard = document.getElementById('loginCard');
const loginOut  = document.getElementById('loginOut');
const diagOut   = document.getElementById('diagOut');
const syncOut   = document.getElementById('syncOut');

// Locations UI
const locationsOut        = document.getElementById('locationsOut');
const locationsTbody      = document.getElementById('locationsTbody');
const locationsCountLabel = document.getElementById('locationsCountLabel');

// Bathroom + other cards
const bathOut      = document.getElementById('bathOut');
const bathTableOut = document.getElementById('bathTableOut');
const bindOut      = document.getElementById('bindOut');
const scheduleOut  = document.getElementById('scheduleOut');

// Overviews (read-only)
const bindingsOut         = document.getElementById('bindingsOut');
const bindingsTbody       = document.getElementById('bindingsTbody');
const bindingsCountLabel  = document.getElementById('bindingsCountLabel');

const bellOut             = document.getElementById('bellOut');
const bellTbody           = document.getElementById('bellTbody');
const bellCountLabel      = document.getElementById('bellCountLabel');
const bellMeta            = document.getElementById('bellMeta');

const periodMapOut        = document.getElementById('periodMapOut');
const periodMapTbody      = document.getElementById('periodMapTbody');
const periodMapCountLabel = document.getElementById('periodMapCountLabel');
const periodMapMeta       = document.getElementById('periodMapMeta');

const classesSummaryOut        = document.getElementById('classesSummaryOut');
const classesSummaryTbody      = document.getElementById('classesSummaryTbody');
const classesSummaryCountLabel = document.getElementById('classesSummaryCountLabel');
const classesSummaryMeta       = document.getElementById('classesSummaryMeta');

const regentsOut          = document.getElementById('regentsOut');
const regentsByLunchTbody = document.getElementById('regentsByLunchTbody');
const regentsCountLabel   = document.getElementById('regentsCountLabel');
const regentsMeta         = document.getElementById('regentsMeta');

const staffPullOut        = document.getElementById('staffPullOut');
const staffPullRolesTbody = document.getElementById('staffPullRolesTbody');
const staffPullCountLabel = document.getElementById('staffPullCountLabel');
const staffPullMeta       = document.getElementById('staffPullMeta');

// In-memory copy of last loaded locations (full meta)
let lastLoadedLocations = [];

// Quick-set controls
const bathSelect = document.getElementById('bathSelect');
const capAllInp  = document.getElementById('bathCapAll');
const capMInp    = document.getElementById('bathCapM');
const capFInp    = document.getElementById('bathCapF');
const bathTbody  = document.getElementById('bathTbody');

// Attendance controls
const attOut     = document.getElementById('attOut');
const attLateInp = document.getElementById('attLateMinutes');

// Shell / inner
const appShell = document.getElementById('appShell');
const appInner = document.getElementById('appInner');

/* ===============================
 * SMALL HELPERS
 * =============================== */
function showBlock(el){ if (el) el.style.display = 'block'; }
function show(el){ if (el) el.style.display = ''; }
function hide(el){ if (el) el.style.display = 'none'; }

function esc(s){
  return String(s).replace(/[&<>"']/g, m=>(
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
  ));
}
function isBathroom(name){
  return String(name||'').toLowerCase().startsWith('bathroom (');
}

/* ===============================
 * SESSION + LOGIN FLOW
 * =============================== */
async function checkSession(){
  const r = await adminFetch('/admin/session/check', { method:'GET' });
  const data = await r.json().catch(()=>({ ok:false }));
  stashAdminSessionFromResponse(r, data); // important
  if (!r.ok || !data?.ok) return { ok:false };
  return data;
}

function showLogin(msg) {
  showBlock(appShell);   // shell always visible
  hide(appInner);
  showBlock(loginCard);
  if (loginOut && msg != null) loginOut.textContent = msg;
}

function showApp() {
  showBlock(appShell);
  hide(loginCard);
  showBlock(appInner);
}

async function afterLoginBoot() {
  showApp();

  // Auto-run diag, load locations, and hydrate bathroom UI
  document.getElementById('btnDiag')?.click();
  await loadLocationsToEditor();
  await hydrateBathrooms();
  await loadAttendanceCfg();
  await refreshOverviews();
}

// --- Google Sign-In init ---
async function waitForGoogle(timeoutMs = 8000) {
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise(r => setTimeout(r, 50));
  }
  return window.google.accounts.id;
}

window.addEventListener('DOMContentLoaded', async () => {
  // Shell always present; decide whether to show login or app
  showBlock(appShell);
  hide(loginCard);
  hide(appInner);

  // ✅ Session first
  let sess = { ok:false };
  try {
    sess = await checkSession();
  } catch (e) {
    console.warn('session check failed', e);
    sess = { ok:false };
  }
  if (sess.ok) {
    if (String(sess.role || '') !== 'admin') {
      showLogin(`Signed in as ${sess.email || 'unknown'} but not authorized for Admin Dashboard.`);
      return;
    }
    await afterLoginBoot();
    return;
  }

  // ❌ Not logged in → init GSI
  try {
    const clientId = document.querySelector('meta[name="google-client-id"]')?.content || '';
    if (!clientId) {
      showLogin('Missing google-client-id meta.');
      return;
    }

    const gsi = await waitForGoogle();
    gsi.initialize({
      client_id: clientId,
      callback: onGoogleCredential,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true
    });
    gsi.renderButton(document.getElementById('g_id_signin'), { theme: 'outline', size: 'large' });

    showLogin('Please sign in…');
  } catch (e) {
    showLogin(`Google init failed: ${e.message || e}`);
  }
});

async function onGoogleCredential(resp) {
  try {
    if (loginOut) loginOut.textContent = 'Signing in...';

    const r = await adminFetch('/admin/session/login_google', {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString()
    });
    const data = await r.json().catch(()=>({}));
    stashAdminSessionFromResponse(r, data);
    if (data?.sid) setStoredAdminSessionSid(String(data.sid));
    if(!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);

    if (String(data.role || '') !== 'admin') {
      showLogin(`Signed in as ${data.email || 'unknown'} but not authorized for Admin Dashboard.`);
      return;
    }

    await afterLoginBoot();
  } catch (e) {
    showLogin(`Login failed: ${e.message || e}`);
  }
}

// Helper fetch that always includes cookies (session)
async function adminFetch(path, init = {}) {
  const u = new URL(path, API_BASE);
  const headers = new Headers(init.headers || {});
  const sid = getStoredAdminSessionSid();
  if (sid && !headers.has(ADMIN_SESSION_HEADER)) {
    headers.set(ADMIN_SESSION_HEADER, sid);
  }

  const resp = await fetch(u, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store'
  });

  // store refreshed sid from headers (if present)
  stashAdminSessionFromResponse(resp, null);
  return resp;
}

/* ===============================
 * DIAGNOSTICS
 * =============================== */
document.getElementById('btnPing')?.addEventListener('click', async () => {
  if (diagOut) diagOut.textContent = 'Pinging...';
  try {
    const r = await fetch(API_BASE, { method: 'POST', body: new URLSearchParams({ action: 'ping' }) });
    const text = await r.text();
    if (diagOut) diagOut.textContent = `HTTP ${r.status}\n\n${text}`;
  } catch (e) {
    if (diagOut) diagOut.textContent = `Error: ${e.message || e}`;
  }
});

document.getElementById('btnDiag')?.addEventListener('click', async () => {
  if (diagOut) diagOut.textContent = 'Loading /admin/diag...';
  try {
    const r = await adminFetch('/admin/diag', { method: 'GET' });
    if (diagOut) diagOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    if (diagOut) diagOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * ROSTER SYNC
 * =============================== */
document.getElementById('btnSync')?.addEventListener('click', async () => {
  if (syncOut) syncOut.textContent = 'Syncing...';
  try {
    const r = await adminFetch('/admin/sync', { method: 'POST' });
    if (syncOut) syncOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    if (syncOut) syncOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * SCHEDULE + CLASSES PUSH
 * =============================== */
document.getElementById('btnPushSchedule')?.addEventListener('click', async () => {
  if (scheduleOut) scheduleOut.textContent = 'Pushing bell schedule + classes…';
  try {
    const r = await adminFetch('/admin/push_schedule', { method: 'POST' });
    const text = await r.text();
    if (scheduleOut) scheduleOut.textContent = `HTTP ${r.status}\n\n${text}`;
  } catch (e) {
    if (scheduleOut) scheduleOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * DATA OVERVIEWS (read-only)
 * =============================== */
function fmtTs(ts){
  const n = Number(ts);
  if (!Number.isFinite(n) || !n) return '';
  try { return new Date(n).toLocaleString(); } catch { return String(ts); }
}
function fmtPct(p){
  const n = Number(p);
  if (!Number.isFinite(n)) return '';
  return (n * 100).toFixed(1) + '%';
}

async function getAdminJson(path) {
  const r = await adminFetch(path, { method: 'GET' });
  const ct = r.headers.get('content-type') || '';
  const text = await r.text();
  if (!ct.includes('application/json')) {
    return { ok:false, status:r.status, text, data:null };
  }
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { ok: !!data, status:r.status, text, data };
}

async function loadBindings() {
  if (bindingsOut) bindingsOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/bindings?limit=1000');
    if (!res.ok) {
      if (bindingsOut) bindingsOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const rows = Array.isArray(data.rows) ? data.rows : [];

    if (bindingsCountLabel) bindingsCountLabel.textContent = rows.length ? `(${rows.length})` : '(0)';

    if (bindingsTbody) {
      bindingsTbody.innerHTML = rows.map(r => {
        const device = esc(r?.device_id || '');
        const loc = esc(r?.location || '');
        return `<tr><td class="mono">${device}</td><td>${loc}</td></tr>`;
      }).join('') || '<tr><td colspan="2" class="muted">No bound devices.</td></tr>';
    }

    const tail = data?.cursor ? `\nnext cursor: ${data.cursor}` : '';
    if (bindingsOut) bindingsOut.textContent = `HTTP ${res.status}\n\nOK. ${rows.length} binding(s).${tail}`;
  } catch (e) {
    if (bindingsOut) bindingsOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadBellSchedule() {
  if (bellOut) bellOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/bell_schedule');
    if (!res.ok) {
      if (bellOut) bellOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const periods = Array.isArray(data.periods) ? data.periods : [];
    if (bellCountLabel) bellCountLabel.textContent = periods.length ? `(${periods.length})` : '(0)';
    if (bellMeta) bellMeta.textContent = [data.date, data.tz, (data.ts ? ('ts: ' + fmtTs(data.ts)) : '')].filter(Boolean).join(' • ');

    if (bellTbody) {
      bellTbody.innerHTML = periods.map(p => {
        const id = esc(p?.id || '');
        const s  = esc(p?.start || '');
        const e  = esc(p?.end || '');
        return `<tr><td class="mono">${id}</td><td class="mono">${s}</td><td class="mono">${e}</td></tr>`;
      }).join('') || '<tr><td colspan="3" class="muted">No schedule stored.</td></tr>';
    }

    if (bellOut) bellOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (bellOut) bellOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadPeriodMap() {
  if (periodMapOut) periodMapOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/period_map_legacy');
    if (!res.ok) {
      if (periodMapOut) periodMapOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const periods = (data.periods && typeof data.periods === 'object') ? data.periods : {};
    const keys = Object.keys(periods).sort((a,b)=>String(a).localeCompare(String(b), undefined, { sensitivity:'base' }));

    if (periodMapCountLabel) periodMapCountLabel.textContent = keys.length ? `(${keys.length})` : '(0)';
    if (periodMapMeta) periodMapMeta.textContent = data.ts ? ('ts: ' + fmtTs(data.ts)) : '';

    if (periodMapTbody) {
      periodMapTbody.innerHTML = keys.map(local => {
        const cfg = periods[local] || {};
        const abbrs = Array.isArray(cfg.abbrs) ? cfg.abbrs : [];
        const send = (cfg.send === true);
        return `<tr><td class="mono">${esc(local)}</td><td class="mono">${esc(abbrs.join(', '))}</td><td class="mono">${send ? 'yes' : 'no'}</td></tr>`;
      }).join('') || '<tr><td colspan="3" class="muted">No period_map stored.</td></tr>';
    }

    if (periodMapOut) periodMapOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (periodMapOut) periodMapOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadClassesSummary() {
  if (classesSummaryOut) classesSummaryOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/student_classes_summary');
    if (!res.ok) {
      if (classesSummaryOut) classesSummaryOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const periods = Array.isArray(data.periods) ? data.periods : [];
    const rosterTotal = Number(data.roster_total || 0) || 0;
    const studentsInMap = Number(data.students_in_map || 0) || 0;

    if (classesSummaryCountLabel) classesSummaryCountLabel.textContent = periods.length ? `(${periods.length})` : '(0)';
    if (classesSummaryMeta) {
      const bits = [];
      if (data.date) bits.push(data.date);
      if (data.ts) bits.push('ts: ' + fmtTs(data.ts));
      if (rosterTotal) bits.push(`roster: ${rosterTotal}`);
      if (studentsInMap) bits.push(`in map: ${studentsInMap}`);
      classesSummaryMeta.textContent = bits.join(' • ');
    }

    if (classesSummaryTbody) {
      classesSummaryTbody.innerHTML = periods.map(row => {
        const pid = esc(row?.period || '');
        const filled = Number(row?.filled || 0) || 0;
        const denom = rosterTotal || studentsInMap || 0;
        const fillText = denom ? `${filled}/${denom}` : String(filled);
        const pct = fmtPct(row?.pct);
        const uniq = Number(row?.unique_rooms || 0) || 0;
        const sample = Array.isArray(row?.sample_rooms) ? row.sample_rooms.join(', ') : '';
        return `<tr>
          <td class="mono">${pid}</td>
          <td class="mono">${esc(fillText)}</td>
          <td class="mono">${esc(pct)}</td>
          <td class="mono">${esc(String(uniq))}</td>
          <td class="mono">${esc(sample)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="muted">No Student_Period_Room_Map stored.</td></tr>';
    }

    if (classesSummaryOut) classesSummaryOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (classesSummaryOut) classesSummaryOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadRegentsSummary() {
  if (regentsOut) regentsOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/regents_students_summary');
    if (!res.ok) {
      if (regentsOut) regentsOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const total = Number(data.total_students || 0) || 0;
    const cnt   = Number(data.regents_students || 0) || 0;
    const by = (data.by_lunch && typeof data.by_lunch === 'object') ? data.by_lunch : {};

    if (regentsCountLabel) regentsCountLabel.textContent = total ? `(${cnt}/${total})` : `(${cnt})`;
    if (regentsMeta) {
      const bits = [];
      if (data.roster_ts) bits.push('roster ts: ' + fmtTs(data.roster_ts));
      if (typeof data.pct === 'number') bits.push('pct: ' + fmtPct(data.pct));
      regentsMeta.textContent = bits.join(' • ');
    }

    const lunchRows = Object.entries(by).map(([l, c]) => ({ lunch: l, count: Number(c || 0) || 0 }))
      .sort((a,b) => (b.count - a.count) || String(a.lunch).localeCompare(String(b.lunch), undefined, { sensitivity:'base' }));

    if (regentsByLunchTbody) {
      regentsByLunchTbody.innerHTML = lunchRows.map(r => {
        return `<tr><td class="mono">${esc(r.lunch)}</td><td class="mono">${esc(String(r.count))}</td></tr>`;
      }).join('') || '<tr><td colspan="2" class="muted">No Regents_Prep students flagged.</td></tr>';
    }

    if (regentsOut) regentsOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (regentsOut) regentsOut.textContent = `Error: ${e.message || e}`;
  }
}

async function loadStaffPullRoles() {
  if (staffPullOut) staffPullOut.textContent = 'Loading…';
  try {
    const res = await getAdminJson('/admin/staff_pull_roles');
    if (!res.ok) {
      if (staffPullOut) staffPullOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
      return;
    }
    const data = res.data || {};
    const rows = Array.isArray(data.rows) ? data.rows : [];

    if (staffPullCountLabel) staffPullCountLabel.textContent = rows.length ? `(${rows.length})` : '(0)';
    if (staffPullMeta) staffPullMeta.textContent = data.ts ? ('ts: ' + fmtTs(data.ts)) : '';

    if (staffPullRolesTbody) {
      staffPullRolesTbody.innerHTML = rows.map(r => {
        return `<tr><td class="mono">${esc(r?.email || '')}</td><td class="mono">${esc(r?.title || '')}</td></tr>`;
      }).join('') || '<tr><td colspan="2" class="muted">No staff_pull allowlist stored.</td></tr>';
    }

    if (staffPullOut) staffPullOut.textContent = `HTTP ${res.status}\n\nOK.`;
  } catch (e) {
    if (staffPullOut) staffPullOut.textContent = `Error: ${e.message || e}`;
  }
}

async function refreshOverviews() {
  await Promise.all([
    loadBindings(),
    loadBellSchedule(),
    loadPeriodMap(),
    loadClassesSummary(),
    loadRegentsSummary(),
    loadStaffPullRoles()
  ]);
}

document.getElementById('btnRefreshOverviews')?.addEventListener('click', refreshOverviews);
document.getElementById('btnLoadBindings')?.addEventListener('click', loadBindings);
document.getElementById('btnLoadBell')?.addEventListener('click', loadBellSchedule);
document.getElementById('btnLoadPeriodMap')?.addEventListener('click', loadPeriodMap);
document.getElementById('btnLoadClassesSummary')?.addEventListener('click', loadClassesSummary);
document.getElementById('btnLoadRegentsSummary')?.addEventListener('click', loadRegentsSummary);
document.getElementById('btnLoadStaffPullRoles')?.addEventListener('click', loadStaffPullRoles);

/* ===============================
 * LOCATIONS
 * =============================== */
// Render table rows from a list of location objects:
// { name, type, mode, visible }
function renderLocationsTable(rows) {
  if (!locationsTbody) return;

  locationsTbody.innerHTML = '';
  (rows || []).forEach((rec, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.index = String(idx);

    const name   = rec?.name   || '';
    const type   = rec?.type   || '';
    const mode   = rec?.mode   || '';
    const vis    = (rec?.visible !== false); // default true

    tr.innerHTML = `
      <td><input type="text" class="loc-name" value="${esc(name)}" /></td>
      <td><input type="text" class="loc-type" value="${esc(type)}" /></td>
      <td><input type="text" class="loc-mode" value="${esc(mode)}" /></td>
      <td style="text-align:center;">
        <input type="checkbox" class="loc-visible"${vis ? ' checked' : ''}>
      </td>
      <td style="text-align:center;">
        <button type="button" class="btn ghost btnLocDelete" style="padding:4px 8px;font-size:11px;">✕</button>
      </td>
    `;
    locationsTbody.appendChild(tr);
  });

  if (locationsCountLabel) {
    locationsCountLabel.textContent =
      rows && rows.length ? `${rows.length} locations (including hidden/class)` : 'No locations loaded yet.';
  }
}

// Collect current table state into objects we can POST
function gatherLocationsFromUI() {
  const out = [];
  if (!locationsTbody) return out;

  locationsTbody.querySelectorAll('tr').forEach(tr => {
    const nameInput = tr.querySelector('.loc-name');
    if (!nameInput) return;

    const name = nameInput.value.trim();
    if (!name) return;

    const typeInput = tr.querySelector('.loc-type');
    const modeInput = tr.querySelector('.loc-mode');
    const visInput  = tr.querySelector('.loc-visible');

    out.push({
      name,
      type: (typeInput?.value || '').trim(),
      mode: (modeInput?.value || '').trim(),
      visible: !!(visInput && visInput.checked)
    });
  });
  return out;
}

// Load locations (including hidden/class) from Worker
async function loadLocationsToEditor() {
  if (locationsOut) locationsOut.textContent = 'Loading locations...';
  try {
    // Public action is fine (origin-restricted by Worker)
    const r = await fetch(API_BASE, {
      method: 'POST',
      body: new URLSearchParams({ action: 'locations' }),
    });

    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      if (locationsOut) locationsOut.textContent = `Non-JSON:\n${await r.text()}`;
      return [];
    }

    const data = await r.json();
    const visibleNames = Array.isArray(data.locations) ? data.locations : [];
    const meta = Array.isArray(data.meta) ? data.meta : [];

    const recs = meta.length
      ? meta
      : visibleNames.map(name => ({ name, type: '', mode: '', visible: true }));

    lastLoadedLocations = recs;
    renderLocationsTable(recs);
    if (locationsOut) locationsOut.textContent = `Loaded ${recs.length} locations (meta + visibility).`;
    return recs;
  } catch (e) {
    if (locationsOut) locationsOut.textContent = `Error: ${e.message || e}`;
    return [];
  }
}

document.getElementById('btnLoadLocations')?.addEventListener('click', loadLocationsToEditor);

document.getElementById('btnPushLocations')?.addEventListener('click', async () => {
  try {
    if (locationsOut) locationsOut.textContent = 'Pushing...';

    const arr = gatherLocationsFromUI();
    const r = await adminFetch('/admin/push_locations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locations: arr })
    });

    if (locationsOut) locationsOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
    lastLoadedLocations = arr.slice();

    await hydrateBathrooms();
  } catch (e) {
    if (locationsOut) locationsOut.textContent = `Error: ${e.message || e}`;
  }
});

document.getElementById('btnResetLocations')?.addEventListener('click', () => {
  if (!lastLoadedLocations.length) {
    if (locationsOut) locationsOut.textContent = 'Nothing to reset — load locations first.';
    return;
  }
  if (confirm('Reset to last loaded locations from Worker?')) {
    renderLocationsTable(lastLoadedLocations);
    if (locationsOut) locationsOut.textContent = 'Editor reset to last loaded locations.';
  }
});

document.getElementById('btnAddLocation')?.addEventListener('click', () => {
  const rows = gatherLocationsFromUI();
  rows.push({ name: '', type: '', mode: '', visible: true });
  lastLoadedLocations = rows.slice();
  renderLocationsTable(rows);
});

locationsTbody?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.btnLocDelete');
  if (!btn) return;
  const tr = btn.closest('tr');
  if (!tr) return;

  const rows = gatherLocationsFromUI();
  const idx = Array.prototype.indexOf.call(locationsTbody.children, tr);
  if (idx >= 0 && idx < rows.length) rows.splice(idx, 1);

  lastLoadedLocations = rows.slice();
  renderLocationsTable(rows);
});

/* ===============================
 * BATHROOM CAPS (helpers)
 * =============================== */
async function getCap(location, gender /* 'M'|'F'|undefined */, useSession = true) {
  const body = new URLSearchParams({ location });
  if (gender) body.set('gender', gender);

  const fetcher = useSession ? adminFetch : fetch;
  const r = await fetcher('/admin/bath_cap', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString()
  });

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return { ok:false, error:'non_json', status:r.status, text:await r.text() };
  }
  return await r.json().catch(() => ({}));
}

async function setCap(location, cap, gender /* optional */) {
  const body = new URLSearchParams({ location, cap: String(cap) });
  if (gender) body.set('gender', gender);

  const r = await adminFetch('/admin/bath_cap', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString()
  });

  const ct = r.headers.get('content-type') || '';
  const text = await r.text();
  return { ok: r.ok && ct.includes('application/json'), status: r.status, text };
}

/* ===============================
 * ATTENDANCE CFG
 * =============================== */
async function getAttendanceCfg() {
  const r = await adminFetch('/admin/attendance_cfg', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams().toString()
  });

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return { ok:false, error:'non_json', status:r.status, text: await r.text() };
  }
  return await r.json().catch(() => ({}));
}

async function setAttendanceLateMin(minutes) {
  const body = new URLSearchParams({ late_min: String(minutes) });

  const r = await adminFetch('/admin/attendance_cfg', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString()
  });

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return { ok:false, error:'non_json', status:r.status, text: await r.text() };
  }
  return await r.json().catch(() => ({}));
}

async function loadAttendanceCfg() {
  if (!attOut || !attLateInp) return;
  attOut.textContent = 'Loading…';
  try {
    const cfg = await getAttendanceCfg();
    if (!cfg.ok) throw new Error(cfg.error || 'Unknown error');
    attLateInp.value = Number(cfg.late_min) || '';
    attOut.textContent = `Current Late threshold: ${cfg.late_min} minute(s).`;
  } catch (e) {
    attOut.textContent = `Error: ${e.message || e}`;
  }
}

document.getElementById('btnAttLoad')?.addEventListener('click', loadAttendanceCfg);

document.getElementById('btnAttSave')?.addEventListener('click', async () => {
  if (!attOut || !attLateInp) return;

  const raw = attLateInp.value.trim();
  const n = Number(raw);

  if (!Number.isFinite(n) || n <= 0 || n >= 120) {
    attOut.textContent = 'Enter a number between 1 and 119.';
    return;
  }

  attOut.textContent = 'Saving…';
  try {
    const cfg = await setAttendanceLateMin(n);
    if (!cfg.ok) throw new Error(cfg.error || 'Unknown error');
    attOut.textContent = `Saved. Late after ${cfg.late_min} minute(s).`;
  } catch (e) {
    attOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * BATHROOM UI — hydrate, quick set, table
 * =============================== */
async function hydrateBathrooms() {
  try {
    const r = await adminFetch('/admin/state', { method: 'GET' });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.includes('application/json')) {
      await hydrateFromPublicLocations();
      return;
    }

    const data = await r.json().catch(() => ({}));
    const rawList = Array.isArray(data?.locations?.list) ? data.locations.list : [];

    const names = rawList
      .map(loc => (loc && typeof loc === 'object') ? String(loc.name || '').trim() : String(loc || '').trim())
      .filter(Boolean);

    const bathrooms = names.filter(isBathroom).sort((a,b)=>a.localeCompare(b));

    if (bathSelect) {
      bathSelect.innerHTML =
        '<option value="">Select bathroom…</option>' +
        bathrooms.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
    }

    await loadBathTable(bathrooms);
  } catch {
    await hydrateFromPublicLocations();
  }
}

async function hydrateFromPublicLocations() {
  const locs = await loadLocationsToEditor();

  const names = (locs || [])
    .map(rec => String(rec?.name || '').trim())
    .filter(Boolean);

  const bathrooms = names.filter(isBathroom).sort((a,b)=>a.localeCompare(b));

  if (bathSelect) {
    bathSelect.innerHTML =
      '<option value="">Select bathroom…</option>' +
      bathrooms.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  }

  await loadBathTable(bathrooms);
}

async function loadBathTable(bathrooms /* optional */) {
  if (bathTableOut) bathTableOut.textContent = 'Loading caps…';

  try {
    if (!bathrooms) {
      const r = await adminFetch('/admin/state', { method: 'GET' });
      const data = await r.json().catch(()=> ({}));
      const rawList = Array.isArray(data?.locations?.list) ? data.locations.list : [];

      const names = rawList
        .map(loc => (loc && typeof loc === 'object') ? String(loc.name || '').trim() : String(loc || '').trim())
        .filter(Boolean);

      bathrooms = names.filter(isBathroom).sort((a,b)=>a.localeCompare(b));
    }

    if (bathTbody) bathTbody.innerHTML = '';

    for (const loc of (bathrooms || [])) {
      const [all, m, f] = await Promise.all([ getCap(loc), getCap(loc,'M'), getCap(loc,'F') ]);

      const tr = document.createElement('tr');
      tr.dataset.loc = loc;

      const allVal = Number(all?.cap) || '';
      const mVal   = Number(m?.cap)   || '';
      const fVal   = Number(f?.cap)   || '';

      tr.innerHTML = `
        <td class="mono">${esc(loc)}</td>
        <td><input type="number" min="1" class="cap cap-all" value="${esc(allVal)}" placeholder="—" /></td>
        <td><input type="number" min="1" class="cap cap-m"   value="${esc(mVal)}"   placeholder="—" /></td>
        <td><input type="number" min="1" class="cap cap-f"   value="${esc(fVal)}"   placeholder="—" /></td>
        <td class="rowBtns">
          <button class="btn btnRowSaveAll">Save ALL</button>
          <button class="btn btnRowSaveM">M</button>
          <button class="btn btnRowSaveF">F</button>
          <button class="btn ghost btnRowRefresh">↻</button>
        </td>
      `;

      bathTbody?.appendChild(tr);
      wireBathRow(tr);
    }

    if (bathTableOut) bathTableOut.textContent = `Loaded ${bathTbody?.children?.length || 0} bathrooms.`;
  } catch (e) {
    if (bathTableOut) bathTableOut.textContent = `Error: ${e.message || e}`;
  }
}

function wireBathRow(tr) {
  const loc = tr.dataset.loc;
  const allInp = tr.querySelector('.cap-all');
  const mInp   = tr.querySelector('.cap-m');
  const fInp   = tr.querySelector('.cap-f');

  tr.querySelector('.btnRowSaveAll')?.addEventListener('click', async () => {
    if (!allInp?.value) return alert('Enter ALL cap');
    const res = await setCap(loc, Number(allInp.value));
    toastRowResult(tr, res);
  });

  tr.querySelector('.btnRowSaveM')?.addEventListener('click', async () => {
    if (!mInp?.value) return alert('Enter M cap');
    const res = await setCap(loc, Number(mInp.value), 'M');
    toastRowResult(tr, res);
  });

  tr.querySelector('.btnRowSaveF')?.addEventListener('click', async () => {
    if (!fInp?.value) return alert('Enter F cap');
    const res = await setCap(loc, Number(fInp.value), 'F');
    toastRowResult(tr, res);
  });

  tr.querySelector('.btnRowRefresh')?.addEventListener('click', async () => {
    const [all, m, f] = await Promise.all([ getCap(loc), getCap(loc,'M'), getCap(loc,'F') ]);
    if (allInp) allInp.value = Number(all?.cap) || '';
    if (mInp)   mInp.value   = Number(m?.cap)   || '';
    if (fInp)   fInp.value   = Number(f?.cap)   || '';
  });
}

function toastRowResult(tr, res) {
  tr.classList.remove('row-ok','row-bad');
  if (res.ok) {
    tr.classList.add('row-ok');
    setTimeout(()=> tr.classList.remove('row-ok'), 800);
  } else {
    tr.classList.add('row-bad');
    setTimeout(()=> tr.classList.remove('row-bad'), 1200);
  }
  if (bathTableOut) bathTableOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
}

/* Quick-set buttons */
document.getElementById('btnBathGetSelected')?.addEventListener('click', async () => {
  try {
    const loc = bathSelect?.value?.trim() || '';
    if (!loc) throw new Error('Select a bathroom first');
    if (bathOut) bathOut.textContent = 'Fetching caps...';

    const [all, m, f] = await Promise.all([ getCap(loc), getCap(loc,'M'), getCap(loc,'F') ]);

    if (capAllInp) capAllInp.value = Number(all?.cap) || '';
    if (capMInp)   capMInp.value   = Number(m?.cap)   || '';
    if (capFInp)   capFInp.value   = Number(f?.cap)   || '';

    if (bathOut) bathOut.textContent = `Loaded caps for "${loc}".`;
  } catch (e) {
    if (bathOut) bathOut.textContent = `Error: ${e.message || e}`;
  }
});

document.getElementById('btnBathSetAll')?.addEventListener('click', async () => {
  const loc = bathSelect?.value?.trim() || '';
  const cap = capAllInp?.value?.trim() || '';
  if (!loc || !cap) return (bathOut && (bathOut.textContent = 'Select bathroom and enter ALL cap.'));
  if (bathOut) bathOut.textContent = 'Setting ALL...';

  const res = await setCap(loc, Number(cap));
  if (bathOut) bathOut.textContent = `HTTP ${res.status}\n\n${res.text}`;

  const row = [...(bathTbody?.children || [])].find(tr => tr.dataset.loc === loc);
  row?.querySelector('.cap-all') && (row.querySelector('.cap-all').value = Number(cap));
});

document.getElementById('btnBathSetM')?.addEventListener('click', async () => {
  const loc = bathSelect?.value?.trim() || '';
  const cap = capMInp?.value?.trim() || '';
  if (!loc || !cap) return (bathOut && (bathOut.textContent = 'Select bathroom and enter M cap.'));
  if (bathOut) bathOut.textContent = 'Setting M...';

  const res = await setCap(loc, Number(cap), 'M');
  if (bathOut) bathOut.textContent = `HTTP ${res.status}\n\n${res.text}`;

  const row = [...(bathTbody?.children || [])].find(tr => tr.dataset.loc === loc);
  row?.querySelector('.cap-m') && (row.querySelector('.cap-m').value = Number(cap));
});

document.getElementById('btnBathSetF')?.addEventListener('click', async () => {
  const loc = bathSelect?.value?.trim() || '';
  const cap = capFInp?.value?.trim() || '';
  if (!loc || !cap) return (bathOut && (bathOut.textContent = 'Select bathroom and enter F cap.'));
  if (bathOut) bathOut.textContent = 'Setting F...';

  const res = await setCap(loc, Number(cap), 'F');
  if (bathOut) bathOut.textContent = `HTTP ${res.status}\n\n${res.text}`;

  const row = [...(bathTbody?.children || [])].find(tr => tr.dataset.loc === loc);
  row?.querySelector('.cap-f') && (row.querySelector('.cap-f').value = Number(cap));
});

document.getElementById('btnBathLoadTable')?.addEventListener('click', async () => {
  if (bathTableOut) bathTableOut.textContent = 'Reloading locations…';
  await hydrateBathrooms();
});

/* ===============================
 * DEVICE BIND / UNBIND
 * =============================== */
document.getElementById('btnBind')?.addEventListener('click', async () => {
  try {
    const dev = document.getElementById('bindDeviceId')?.value?.trim() || '';
    const loc = document.getElementById('bindLocation')?.value?.trim() || '';
    if (!dev || !loc) throw new Error('device + location required');

    if (bindOut) bindOut.textContent = 'Binding...';

    const r = await adminFetch('/admin/bind', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ device_id: dev, location: loc }).toString()
    });

    if (bindOut) bindOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    if (bindOut) bindOut.textContent = `Error: ${e.message || e}`;
  }
});

document.getElementById('btnUnbind')?.addEventListener('click', async () => {
  try {
    const dev = document.getElementById('bindDeviceId')?.value?.trim() || '';
    if (!dev) throw new Error('device required');

    if (bindOut) bindOut.textContent = 'Unbinding...';

    const r = await adminFetch('/admin/unbind', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ device_id: dev }).toString()
    });

    if (bindOut) bindOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    if (bindOut) bindOut.textContent = `Error: ${e.message || e}`;
  }
});
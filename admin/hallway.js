// ===== Helpers similar to admin.js =====
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const SNAPSHOT_PATH = '/admin/hallway_state_monitor';

const loginCard  = document.getElementById('loginCard');
const loginOut   = document.getElementById('loginOut');
const appShell   = document.getElementById('appShell');

const statusDot   = document.getElementById('statusDot');
const statusText  = document.getElementById('statusText');
const dateText    = document.getElementById('dateText');
const refreshText = document.getElementById('refreshText');
const summaryGrid = document.getElementById('summaryGrid');
const summaryError= document.getElementById('summaryError');
const listError   = document.getElementById('listError');
const locContainer= document.getElementById('locContainer');
const summarySubtitle = document.getElementById('summarySubtitle');
const listSubtitle    = document.getElementById('listSubtitle');

const DEFAULT_ACTIVE_ZONES = new Set(['hallway', 'bathroom']); // initial behavior = what you have now
let activeZones = new Set(DEFAULT_ACTIVE_ZONES);
let lastSnapshot = null;
let userToggledZones = false;
let didAutoSetZones = false;

const POLL_MS = 10_000;
let lastRefreshTs = null;
let pollTimer = null;

// ===== DEBUGGING =====
const DEBUG = false; //change to true to output debug code
const debugEl = document.getElementById('debugLog');

function dbg(...args) {
  if(!DEBUG) return;

  const ts = new Date().toISOString();
  const msg = args
    .map(a => (typeof a === 'string' ? a : JSON.stringify(a, null, 2)))
    .join(' ');
  console.log('[hallway]', msg);
  if (debugEl) {
    debugEl.style.display = 'block';
    debugEl.textContent += `[${ts}] ${msg}\n`;
  }
}

// Global error hooks
window.addEventListener('error', (e) => {
  dbg('window error:', e.message || e, e.error && e.error.stack);
});

window.addEventListener('unhandledrejection', (e) => {
  dbg('unhandledrejection:', String(e.reason || e));
});

dbg('hallway.js loaded. API_BASE=', API_BASE, 'GOOGLE_CLIENT_ID set=', !!GOOGLE_CLIENT_ID);


function show(el){ if (el) el.style.display = 'block'; }
function hide(el){ if (el) el.style.display = 'none'; }

function setStatus(ok, msg) {
  statusDot.className = 'pill-dot ' + (ok ? 'pill-dot--ok' : 'pill-dot--bad');
  statusText.textContent = msg;
}

async function waitForGoogle(timeoutMs = 8000) {
  dbg('waitForGoogle: starting, timeoutMs=', timeoutMs);
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) {
      dbg('waitForGoogle: timed out waiting for window.google.accounts.id');
      throw new Error('Google script failed to load');
    }
    await new Promise(r => setTimeout(r, 50));
  }
  dbg('waitForGoogle: google.accounts.id is available');
  return window.google.accounts.id;
}

// ===== LOGIN FLOW (same idea as admin.js) =====
window.addEventListener('DOMContentLoaded', async () => {
  dbg('DOMContentLoaded fired.');

  // 1) ✅ Try cookie session bootstrap FIRST (same idea as teacher_attendance)
  // If session is valid, this will show appShell + startPolling and we should stop here.
  const booted = await tryBootstrapSession();
  if (booted) {
    dbg('Session bootstrap OK; skipping Google login UI.');
    return;
  }

  // 2) ❌ No valid session → fall back to Google sign-in button
  try {
    if (!GOOGLE_CLIENT_ID) {
      dbg('No GOOGLE_CLIENT_ID meta found');
      show(loginCard);
      hide(appShell);
      loginOut.textContent = 'Missing google-client-id meta.';
      return;
    }

    dbg('Calling waitForGoogle()...');
    const gsi = await waitForGoogle();
    dbg('waitForGoogle resolved, initializing GSI');

    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true
    });

    dbg('GSI initialized; rendering button...');
    gsi.renderButton(
      document.getElementById('g_id_signin'),
      { theme: 'outline', size: 'large' }
    );

    dbg('GSI button rendered, showing loginCard');
    show(loginCard);
    hide(appShell);
    loginOut.textContent = '—';
  } catch (e) {
    dbg('Google init failed:', e && (e.message || e));
    show(loginCard);
    hide(appShell);
    loginOut.textContent = `Google init failed: ${e.message || e}`;
  }
});

async function onGoogleCredential(resp) {
  try {
    dbg('onGoogleCredential: received credential response');
    loginOut.textContent = 'Signing in...';

    const r = await fetch(new URL('/admin/session/login_google', API_BASE), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString(),
      credentials: 'include'
    });

    dbg('login_google response status:', r.status);
    const data = await r.json().catch(() => ({}));
    dbg('login_google response body:', data);

    if (!r.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${r.status}`);
    }

    dbg('Login OK; hiding loginCard and showing appShell');
    hide(loginCard);
    show(appShell);
    setStatus(true, 'Live');
    startPolling();
  } catch (e) {
    dbg('Login failed:', e && (e.message || e));
    show(loginCard);
    hide(appShell);
    loginOut.textContent = `Login failed: ${e.message || e}`;
  }
}

// Always include cookies for admin requests
async function adminFetch(pathOrUrl, init = {}) {
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  return fetch(u, { ...init, credentials: 'include' });
}

async function tryBootstrapSession() {
  try {
    const r = await adminFetch('/admin/session/check', { method: 'GET' });
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    if (!j?.ok) return false;

    // session is valid → skip login UI
    hide(loginCard);
    show(appShell);
    setStatus(true, 'Live');
    startPolling();
    return true;
  } catch (e) {
    dbg('session bootstrap failed:', e?.message || e);
    return false;
  }
}

function inferFloor(locLabel, rawLoc) {
  const label = String(locLabel || '').trim();
  const lower = label.toLowerCase();
  const base = String(rawLoc || locLabel || '').trim();

  if (!label && !base) return 'Other / Unknown';

  if (lower.includes('off campus')) return 'Off Campus';

  if (lower.includes('first floor') || lower.includes('1st floor')) return 'Floor 1';
  if (lower.includes('second floor') || lower.includes('2nd floor')) return 'Floor 2';
  if (lower.includes('third floor') || lower.includes('3rd floor')) return 'Floor 3';

  // Room-style names: RM 316, 212, etc.
  const room = base.replace(/^rm\s*/i, '');
  if (/^\d{3}$/.test(room)) {
    const n = Number(room[0]);
    if (n >= 1 && n <= 9) return `Floor ${n}`;
  }

  // Cafeteria = 1st floor
  if (/^caf/i.test(base)) return 'Floor 1';

  return 'Other / Unknown';
}

function floorSortKey(label) {
  const lower = String(label || '').toLowerCase();

  if (lower.includes('off campus')) return 50;

  const m = lower.match(/(\d+)/);
  if (m) return Number(m[1]);        // Floor 1, 2, 3, etc.

  if (lower.includes('other')) return 90;

  return 80; // generic bucket
}

// ===== RENDER HELPERS =====
function fmtClock(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtShortTs(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtClock(d);
}
function fmtScheduledRoom(room, kind) {
  const r = String(room || '').trim();
  if (!r) return '—';

  const pretty = (/^\d+$/.test(r)) ? `RM ${r}` : (/^caf$/i.test(r) ? 'Caf' : r);
  return (kind === 'next') ? `→ ${pretty}` : pretty;
}

/**
 * Map zone string from API → CSS class for mini badge.
 * Matches the classes defined in hallway.html CSS.
 */
function zoneToChipClass(zone) {
  switch (zone) {
    case 'hallway':
      return 'zone-chip--hall';
    case 'bathroom':
      return 'zone-chip--bath';
    case 'class':
      return 'zone-chip--class';
    case 'after_school':
      return 'zone-chip--class';
    case 'lunch':
      return 'zone-chip--lunch';
    case 'with_staff':
      return 'zone-chip--staff';
    case 'off_campus':
      return 'zone-chip--offcampus';
    default:
      return 'zone-chip--hall'; // safe fallback
  }
}

function renderSummary(data) {
  summaryError.style.display = 'none';
  summaryGrid.innerHTML = '';

  if (!data || !data.ok) {
    summaryError.textContent = 'No data available.';
    summaryError.style.display = 'block';
    return;
  }

  const date = data.date;
  const counts = data.counts || {};
  const total = data.total || 0;

  dateText.textContent = date || '';
  summarySubtitle.textContent = total ? `Total tracked: ${total}` : '';

  const isAfterSchool = !!data.after_school_mode;

  const defs = [
    { key: 'hallway',    label: 'In Hallway',   className: 'summary-item--hallway' },
    { key: 'bathroom',   label: 'In Bathroom',  className: 'summary-item--bathroom' },

    // During after-school mode we show AFTER SCHOOL instead of IN CLASS
    ...(isAfterSchool
      ? [{ key: 'after_school', label: 'After School', className: 'summary-item--class' }]
      : [{ key: 'class',        label: 'In Class',     className: 'summary-item--class' }]),

    { key: 'lunch',      label: 'At Lunch',     className: 'summary-item--lunch' },
    { key: 'with_staff', label: 'With Staff',   className: 'summary-item--staff' },
    { key: 'off_campus', label: 'Off Campus',   className: 'summary-item--offcampus' }
  ];

  for (const def of defs) {
    const div = document.createElement('div');
    div.className = 'summary-item ' + (def.className || '');
    div.dataset.zoneKey = def.key;
    div.classList.add('summary-item--clickable');
    if (activeZones.has(def.key)) {
      div.classList.add('summary-item--active');
    }

    const label = document.createElement('div');
    label.className = 'summary-label';
    label.textContent = def.label;
    const value = document.createElement('div');
    value.className = 'summary-value';
    value.textContent = counts[def.key] ?? 0;

    div.appendChild(label);
    div.appendChild(value);
    summaryGrid.appendChild(div);
  }
}

function renderLocations(data) {
  listError.style.display = 'none';
  locContainer.innerHTML = '';

  if (!data || !data.ok) {
    listError.textContent = 'No data available.';
    listError.style.display = 'block';
    return;
  }

  const byLoc = data.by_location || {};
  const rowsByFloor = new Map();
  let totalShown = 0;

  // Flatten by_location → rows grouped by floor
  for (const [locLabel, arr] of Object.entries(byLoc)) {
    for (const s of arr) {
      if (!activeZones.has(s.zone)) continue;

      const floor = (s.zone === 'with_staff') ? 'With Staff' : inferFloor(locLabel, s.loc);
      if (!rowsByFloor.has(floor)) rowsByFloor.set(floor, []);
      rowsByFloor.get(floor).push({
        ...s,
        locLabel,
        floor
      });
      totalShown++;
    }
  }

  const zonesLabel = Array.from(activeZones).join(', ') || 'none';
  listSubtitle.textContent = totalShown
    ? `${totalShown} students in selected zones (${zonesLabel})`
    : '';

  if (!totalShown) {
    const div = document.createElement('div');
    div.className = 'loc-group';
    div.innerHTML = '<div class="loc-header"><div class="loc-name">None in selected zones</div></div>';
    locContainer.appendChild(div);
    return;
  }

  // Sort floors nicely
  const floorEntries = Array.from(rowsByFloor.entries());
  floorEntries.sort((a, b) => {
    const ka = floorSortKey(a[0]);
    const kb = floorSortKey(b[0]);
    if (ka !== kb) return ka - kb;
    return String(a[0]).localeCompare(String(b[0]));
  });

  for (const [floorLabel, rows] of floorEntries) {
    // Sort each floor by most recent first
    rows.sort((a, b) =>
      String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    );

    const group = document.createElement('div');
    group.className = 'loc-group';

    const header = document.createElement('div');
    header.className = 'loc-header';

    const left = document.createElement('div');
    const nameEl = document.createElement('span');
    nameEl.className = 'loc-name';
    nameEl.textContent = floorLabel;

    const tag = document.createElement('span');
    tag.className = 'loc-tag';
    tag.textContent = (floorLabel.toLowerCase().includes('floor') ? 'Floor' : 'Zone');

    left.appendChild(nameEl);
    left.appendChild(tag);

    const right = document.createElement('div');
    right.className = 'loc-count';
    right.textContent = `${rows.length} student${rows.length === 1 ? '' : 's'}`;

    header.appendChild(left);
    header.appendChild(right);

    const list = document.createElement('div');
    list.className = 'list';

    // Header row inside each floor
    const headerRow = document.createElement('div');
    headerRow.className = 'row row-header';

    const h1 = document.createElement('div');
    h1.className = 'row-name';
    h1.textContent = 'Student';

    const h2 = document.createElement('div');
    h2.className = 'row-bath';
    h2.textContent = 'Bathroom visits today';

    const h3 = document.createElement('div');
    h3.className = 'row-sched';
    h3.textContent = 'Scheduled';

    const h4 = document.createElement('div');
    h4.className = 'row-source';
    h4.textContent = 'Location';

    const h5 = document.createElement('div');
    h5.className = 'row-ts';
    h5.textContent = 'Last seen';

    headerRow.appendChild(h1);
    headerRow.appendChild(h2);
    headerRow.appendChild(h3);
    headerRow.appendChild(h4);
    headerRow.appendChild(h5);
    list.appendChild(headerRow);

    for (const s of rows) {
      const row = document.createElement('div');
      row.className = 'row';

      // col1: name + OSIS + zone chip
      const col1 = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'row-name';
      name.textContent = s.name || '(Unknown)';

      const osis = document.createElement('div');
      osis.className = 'row-osis';
      osis.textContent = s.osis || '';

      const chip = document.createElement('span');
      const zone = s.zone || '';
      chip.className = 'zone-chip ' + zoneToChipClass(zone);
      chip.textContent = String(zone || '').toUpperCase().replace(/_/g, ' ');

      name.appendChild(chip);
      col1.appendChild(name);
      col1.appendChild(osis);

      // col2: bathroom visits today
      const col2 = document.createElement('div');
      col2.className = 'row-bath';
      const visits = Number.isFinite(Number(s.bathroom_visits)) ? Math.max(0, Math.trunc(Number(s.bathroom_visits))) : 0;
      col2.textContent = visits;

      // col3: scheduled room (based on current/next period)
      const col3 = document.createElement('div');
      col3.className = 'row-sched';
      col3.textContent = fmtScheduledRoom(s.scheduled_room, s.scheduled_kind);

      // col4: location (plus raw source if you like)
      const col4 = document.createElement('div');
      col4.className = 'row-source';
      const locText = s.locLabel || s.loc || '';
      col4.textContent = s.source
        ? `${locText} • ${s.source}`
        : locText;

      // col5: last timestamp
      const col5 = document.createElement('div');
      col5.className = 'row-ts';
      col5.textContent = fmtShortTs(s.updated_at);

      row.appendChild(col1);
      row.appendChild(col2);
      row.appendChild(col3);
      row.appendChild(col4);
      row.appendChild(col5);
      list.appendChild(row);
    }

    group.appendChild(header);
    group.appendChild(list);
    locContainer.appendChild(group);
  }
}

// Toggle zones by clicking summary items
summaryGrid.addEventListener('click', (ev) => {
  const item = ev.target.closest('.summary-item');
  if (!item || !item.dataset.zoneKey) return;
  const key = item.dataset.zoneKey;
  userToggledZones = true;

  if (activeZones.has(key)) {
    activeZones.delete(key);
  } else {
    activeZones.add(key);
  }

  // Re-render using the last snapshot we have
  if (lastSnapshot) {
    renderSummary(lastSnapshot);
    renderLocations(lastSnapshot);
  }
});

// ===== POLLING =====
async function fetchSnapshotOnce() {
  dbg('fetchSnapshotOnce: fetching snapshot…');
  lastRefreshTs = Date.now();

  const r = await adminFetch(SNAPSHOT_PATH, { method: 'GET' });
  dbg('fetchSnapshotOnce: response status', r.status);

  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    dbg('fetchSnapshotOnce: JSON parse failed, raw text:', text);
    throw new Error(`Bad JSON from ${SNAPSHOT_PATH}`);
  }

  // Handle expired session
  if (r.status === 401) {
    dbg('fetchSnapshotOnce: unauthorized (401), showing login');
    setStatus(false, 'Unauthorized');
    hide(appShell);
    show(loginCard);
    loginOut.textContent = 'Session expired. Please sign in again.';
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    return;
  }

  if (r.status === 403) {
    dbg('fetchSnapshotOnce: forbidden (403), not authorized for hallway monitor');
    setStatus(false, 'Not authorized');
    hide(appShell);
    show(loginCard);
    loginOut.textContent = 'Not authorized for the Hallway Monitor page.';
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    return;
  }

  if (!r.ok || !data.ok) {
    dbg('fetchSnapshotOnce: error payload:', data);
    throw new Error(data?.error || `HTTP ${r.status}`);
  }

  dbg('fetchSnapshotOnce: data ok, rendering summary and locations');
  setStatus(true, 'Live');
  lastSnapshot = data;

  // AUTO-SELECT after_school zone during after-school mode (first load only)
  if (!userToggledZones && !didAutoSetZones && data.after_school_mode) {
    activeZones = new Set(['after_school']);
    didAutoSetZones = true;
  }
  renderSummary(data);
  renderLocations(data);
}

async function initApp() {
  dbg('initApp: starting');
  try {
    const r = await adminFetch('/admin/session/check', { method: 'GET' });
    dbg('session/check status:', r.status);
    const data = await r.json().catch(() => ({}));
    dbg('session/check body:', data);

    if (!r.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${r.status}`);
    }

    dbg('Session OK; showing appShell and starting polling');
    hide(loginCard);
    show(appShell);
    setStatus(true, 'Live');
    startPolling();
  } catch (e) {
    dbg('initApp: not logged in or error, showing loginCard. Reason:', e && (e.message || e));
    show(loginCard);
    hide(appShell);
    loginOut.textContent = `Login failed: ${e.message || e}`;
  }
}

function tickRefreshLabel() {
  if (!lastRefreshTs) {
    refreshText.textContent = 'Never';
    return;
  }
  const now = Date.now();
  const diffSec = Math.round((now - lastRefreshTs) / 1000);
  refreshText.textContent = `Refreshed ${diffSec}s ago`;
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);

  show(appShell);        // make sure app is visible
  hide(loginCard);

  fetchSnapshotOnce().catch(err => {
    console.error('snapshot error', err);
    summaryError.textContent = String(err.message || err);
    summaryError.style.display = 'block';
    setStatus(false, 'Error');
  });

  pollTimer = setInterval(() => {
    fetchSnapshotOnce().catch(err => {
      console.error('snapshot error', err);
      summaryError.textContent = String(err.message || err);
      summaryError.style.display = 'block';
      setStatus(false, 'Error');
    });
  }, POLL_MS);

  tickRefreshLabel();
  setInterval(tickRefreshLabel, 1000);
}
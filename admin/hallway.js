// ===== Helpers similar to admin.js =====
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const SNAPSHOT_PATH = '/admin/hallway_state';

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

const POLL_MS = 10_000;
let lastRefreshTs = null;
let pollTimer = null;

function show(el){ if (el) el.style.display = ''; }
function hide(el){ if (el) el.style.display = 'none'; }

function setStatus(ok, msg) {
  statusDot.className = 'pill-dot ' + (ok ? 'pill-dot--ok' : 'pill-dot--bad');
  statusText.textContent = msg;
}

async function waitForGoogle(timeoutMs = 8000) {
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise(r => setTimeout(r, 50));
  }
  return window.google.accounts.id;
}

// ===== LOGIN FLOW (same idea as admin.js) =====
window.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      show(loginCard);
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
    gsi.renderButton(
      document.getElementById('g_id_signin'),
      { theme: 'outline', size: 'large' }
    );
    show(loginCard);
  } catch (e) {
    show(loginCard);
    loginOut.textContent = `Google init failed: ${e.message || e}`;
  }
});

async function onGoogleCredential(resp) {
  try {
    loginOut.textContent = 'Signing in...';
    const r = await fetch(new URL('/admin/session/login_google', API_BASE), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString(),
      credentials: 'include'
    });
    const data = await r.json().catch(()=> ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);

    // Session is good → show app, start polling
    hide(loginCard);
    show(appShell);
    setStatus(true, 'Live');
    startPolling();
  } catch (e) {
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

  const defs = [
    { key: 'hallway',   label: 'In Hallway',   className: 'summary-item--hallway' },
    { key: 'bathroom',  label: 'In Bathroom',  className: 'summary-item--bathroom' },
    { key: 'class',     label: 'In Class' },
    { key: 'lunch',     label: 'At Lunch' },
    { key: 'off_campus',label: 'Off Campus',   className: 'summary-item--danger' }
  ];

  for (const def of defs) {
    const div = document.createElement('div');
    div.className = 'summary-item ' + (def.className || '');
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
  const entries = Object.entries(byLoc);

  const filtered = entries
    .map(([loc, arr]) => {
      const hallBath = arr.filter(x => x.zone === 'hallway' || x.zone === 'bathroom');
      return [loc, hallBath];
    })
    .filter(([, arr]) => arr.length > 0);

  const totalShown = filtered.reduce((sum, [, arr]) => sum + arr.length, 0);
  listSubtitle.textContent = totalShown
    ? `${totalShown} students in hallways / bathrooms`
    : '';

  if (!filtered.length) {
    const div = document.createElement('div');
    div.className = 'loc-group';
    div.innerHTML = '<div class="loc-header"><div class="loc-name">None in hallway/bathroom</div></div>';
    locContainer.appendChild(div);
    return;
  }

  for (const [loc, arr] of filtered) {
    const group = document.createElement('div');
    group.className = 'loc-group';

    const header = document.createElement('div');
    header.className = 'loc-header';

    const left = document.createElement('div');
    const nameEl = document.createElement('span');
    nameEl.className = 'loc-name';
    nameEl.textContent = loc;

    const zonesSet = new Set(arr.map(x => x.zone));
    const tag = document.createElement('span');
    tag.className = 'loc-tag';
    tag.textContent = zonesSet.has('bathroom') && !zonesSet.has('hallway')
      ? 'Bathroom'
      : (zonesSet.has('hallway') && !zonesSet.has('bathroom')
          ? 'Hallway'
          : 'Mixed');

    left.appendChild(nameEl);
    left.appendChild(tag);

    const right = document.createElement('div');
    right.className = 'loc-count';
    right.textContent = `${arr.length} student${arr.length === 1 ? '' : 's'}`;

    header.appendChild(left);
    header.appendChild(right);

    const list = document.createElement('div');
    list.className = 'list';

    for (const s of arr) {
      const row = document.createElement('div');
      row.className = 'row';

      const col1 = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'row-name';
      name.textContent = s.name || '(Unknown)';
      const osis = document.createElement('div');
      osis.className = 'row-osis';
      osis.textContent = s.osis || '';

      const chip = document.createElement('span');
      chip.className = 'zone-chip ' + (s.zone === 'bathroom'
        ? 'zone-chip--bath'
        : 'zone-chip--hall');
      chip.textContent = s.zone;

      name.appendChild(chip);
      col1.appendChild(name);
      col1.appendChild(osis);

      const col2 = document.createElement('div');
      col2.textContent = s.source || '';

      const col3 = document.createElement('div');
      col3.className = 'row-ts';
      col3.textContent = fmtShortTs(s.updated_at);

      row.appendChild(col1);
      row.appendChild(col2);
      row.appendChild(col3);
      list.appendChild(row);
    }

    group.appendChild(header);
    group.appendChild(list);
    locContainer.appendChild(group);
  }
}

// ===== POLLING =====
async function fetchSnapshotOnce() {
  lastRefreshTs = Date.now();
  const r = await adminFetch(SNAPSHOT_PATH, { method: 'GET' });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error('Bad JSON from /admin/hallway_state');
  }

  if (r.status === 401 || r.status === 403) {
    // session expired — bounce back to login
    setStatus(false, 'Unauthorized');
    hide(appShell);
    show(loginCard);
    loginOut.textContent = 'Session expired. Please sign in again.';
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    return;
  }

  if (!r.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${r.status}`);
  }

  setStatus(true, 'Live');
  renderSummary(data);
  renderLocations(data);
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

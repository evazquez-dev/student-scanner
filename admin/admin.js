// admin/admin.js — Admin UI with bathroom cap helpers (ALL / M / F)

/* ===============================
 * BASE + ELEMENTS
 * =============================== */
const API_BASE =
  (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';

document.getElementById('apiBase')?.textContent = API_BASE;

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
async function checkSession() {
  try {
    const r = await fetch(new URL('/admin/session/check', API_BASE), {
      method: 'GET',
      credentials: 'include'
    });
    const data = await r.json().catch(() => ({}));
    return !!(r.ok && data && data.ok);
  } catch {
    return false;
  }
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
  const ok = await checkSession();
  if (ok) {
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

    const r = await fetch(new URL('/admin/session/login_google', API_BASE), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString(),
      credentials: 'include'
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);

    await afterLoginBoot();
  } catch (e) {
    showLogin(`Login failed: ${e.message || e}`);
  }
}

// Helper fetch that always includes cookies (session)
async function adminFetch(pathOrUrl, init = {}) {
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  return fetch(u, { ...init, credentials: 'include' });
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
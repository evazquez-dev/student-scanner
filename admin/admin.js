// admin/admin.js — Admin UI with bathroom cap helpers (ALL / M / F)

const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/,'') + '/';
document.getElementById('apiBase').textContent = API_BASE;

// Cards / outputs
const loginCard = document.getElementById('loginCard');
const loginOut  = document.getElementById('loginOut');
const diagOut   = document.getElementById('diagOut');
const syncOut   = document.getElementById('syncOut');
const locationsEditor = document.getElementById('locationsEditor');
const locationsOut    = document.getElementById('locationsOut');
const bathOut         = document.getElementById('bathOut');
const bathTableOut    = document.getElementById('bathTableOut');
const bindOut         = document.getElementById('bindOut');

// Quick-set controls
const bathSelect = document.getElementById('bathSelect');
const capAllInp  = document.getElementById('bathCapAll');
const capMInp    = document.getElementById('bathCapM');
const capFInp    = document.getElementById('bathCapF');
const bathTbody  = document.getElementById('bathTbody');

function show(el){ el && (el.style.display = ''); }
function hide(el){ el && (el.style.display = 'none'); }
function esc(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function isBathroom(name){ return String(name||'').toLowerCase().startsWith('bathroom ('); }

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
  try {
    const clientId = document.querySelector('meta[name="google-client-id"]')?.content || '';
    if (!clientId) {
      show(loginCard);
      loginOut.textContent = 'Missing google-client-id meta.';
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
    hide(loginCard);

    // Auto-run diag, load locations, and hydrate bathroom UI
    document.getElementById('btnDiag')?.click();
    await loadLocationsToEditor();
    await hydrateBathrooms();
  } catch (e) {
    loginOut.textContent = `Login failed: ${e.message || e}`;
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
document.getElementById('btnPing').addEventListener('click', async () => {
  diagOut.textContent = 'Pinging...';
  try {
    const r = await fetch(API_BASE, { method: 'POST', body: new URLSearchParams({ action: 'ping' }) });
    const text = await r.text();
    diagOut.textContent = `HTTP ${r.status}\n\n${text}`;
  } catch (e) {
    diagOut.textContent = `Error: ${e.message || e}`;
  }
});

document.getElementById('btnDiag').addEventListener('click', async () => {
  diagOut.textContent = 'Loading /admin/diag...';
  try {
    const r = await adminFetch('/admin/diag', { method: 'GET' });
    diagOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    diagOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * ROSTER SYNC
 * =============================== */
document.getElementById('btnSync').addEventListener('click', async () => {
  syncOut.textContent = 'Syncing...';
  try {
    const r = await adminFetch('/admin/sync', { method: 'POST' });
    syncOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    syncOut.textContent = `Error: ${e.message || e}`;
  }
});

/* ===============================
 * LOCATIONS
 * =============================== */
async function loadLocationsToEditor() {
  locationsOut.textContent = 'Loading locations...';
  try {
    // Public action is fine (origin-restricted by Worker)
    const r = await fetch(API_BASE, {
      method: 'POST',
      body: new URLSearchParams({ action: 'locations' }),
    });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      locationsOut.textContent = `Non-JSON:\n${await r.text()}`;
      return [];
    }
    const data = await r.json();
    const arr = Array.isArray(data.locations) ? data.locations : [];
    locationsEditor.value = arr.join('\n');
    locationsOut.textContent = `Loaded ${arr.length} locations.`;
    return arr;
  } catch (e) {
    locationsOut.textContent = `Error: ${e.message || e}`;
    return [];
  }
}
document.getElementById('btnLoadLocations').addEventListener('click', loadLocationsToEditor);

document.getElementById('btnPushLocations').addEventListener('click', async () => {
  try {
    locationsOut.textContent = 'Pushing...';
    const arr = locationsEditor.value.split('\n').map(s => s.trim()).filter(Boolean);
    const r = await adminFetch('/admin/push_locations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locations: arr })
    });
    locationsOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
    // Rehydrate bathrooms after location push
    await hydrateBathrooms();
  } catch (e) {
    locationsOut.textContent = `Error: ${e.message || e}`;
  }
});
document.getElementById('btnResetLocations').addEventListener('click', () => {
  if (confirm('Reset editor?')) locationsEditor.value = '';
});

/* ===============================
 * BATHROOM CAPS (helpers)
 * =============================== */
async function getCap(location, gender /* 'M'|'F'|undefined */, useSession = true) {
  // Reading can be done via public path (origin restricted), but session is fine too.
  const body = new URLSearchParams({ location });
  if (gender) body.set('gender', gender);
  const fetcher = useSession ? adminFetch : fetch;
  const r = await fetcher('/admin/bath_cap', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString()
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return { ok:false, error:'non_json', status:r.status, text:await r.text() };
  const data = await r.json().catch(()=> ({}));
  return data;
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
 * BATHROOM UI — hydrate, quick set, table
 * =============================== */
async function hydrateBathrooms() {
  // Get full state to list locations (requires session)
  try {
    const r = await adminFetch('/admin/state', { method: 'GET' });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.includes('application/json')) {
      // Fallback to public locations endpoint
      await hydrateFromPublicLocations();
      return;
    }
    const data = await r.json();
    const list = Array.isArray(data?.locations?.list) ? data.locations.list : [];
    const bathrooms = list.filter(isBathroom).sort((a,b)=>a.localeCompare(b));
    // Populate select
    bathSelect.innerHTML = '<option value="">Select bathroom…</option>' +
      bathrooms.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
    // Build table
    await loadBathTable(bathrooms);
  } catch {
    await hydrateFromPublicLocations();
  }
}

async function hydrateFromPublicLocations() {
  // Public fallback if /admin/state not available
  const locs = await loadLocationsToEditor();
  const bathrooms = locs.filter(isBathroom).sort((a,b)=>a.localeCompare(b));
  bathSelect.innerHTML = '<option value="">Select bathroom…</option>' +
    bathrooms.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  await loadBathTable(bathrooms);
}

async function loadBathTable(bathrooms /* optional */) {
  bathTableOut.textContent = 'Loading caps…';
  try {
    if (!bathrooms) {
      // try refresh via state to get current location list
      const r = await adminFetch('/admin/state', { method: 'GET' });
      const data = await r.json().catch(()=> ({}));
      const list = Array.isArray(data?.locations?.list) ? data.locations.list : [];
      bathrooms = list.filter(isBathroom).sort((a,b)=>a.localeCompare(b));
    }
    bathTbody.innerHTML = '';
    for (const loc of bathrooms) {
      // Read ALL, M, F (M/F may fall back to ALL if not set on server)
      const [all, m, f] = await Promise.all([
        getCap(loc), getCap(loc, 'M'), getCap(loc, 'F')
      ]);
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
      bathTbody.appendChild(tr);
      wireBathRow(tr);
    }
    bathTableOut.textContent = `Loaded ${bathTbody.children.length} bathrooms.`;
  } catch (e) {
    bathTableOut.textContent = `Error: ${e.message || e}`;
  }
}

function wireBathRow(tr) {
  const loc = tr.dataset.loc;
  const allInp = tr.querySelector('.cap-all');
  const mInp   = tr.querySelector('.cap-m');
  const fInp   = tr.querySelector('.cap-f');

  tr.querySelector('.btnRowSaveAll')?.addEventListener('click', async () => {
    if (!allInp.value) return alert('Enter ALL cap');
    const res = await setCap(loc, Number(allInp.value));
    toastRowResult(tr, res);
  });
  tr.querySelector('.btnRowSaveM')?.addEventListener('click', async () => {
    if (!mInp.value) return alert('Enter M cap');
    const res = await setCap(loc, Number(mInp.value), 'M');
    toastRowResult(tr, res);
  });
  tr.querySelector('.btnRowSaveF')?.addEventListener('click', async () => {
    if (!fInp.value) return alert('Enter F cap');
    const res = await setCap(loc, Number(fInp.value), 'F');
    toastRowResult(tr, res);
  });
  tr.querySelector('.btnRowRefresh')?.addEventListener('click', async () => {
    const [all, m, f] = await Promise.all([ getCap(loc), getCap(loc,'M'), getCap(loc,'F') ]);
    allInp.value = Number(all?.cap) || '';
    mInp.value   = Number(m?.cap)   || '';
    fInp.value   = Number(f?.cap)   || '';
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
  bathTableOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
}

/* Quick-set buttons */
document.getElementById('btnBathGetSelected').addEventListener('click', async () => {
  try {
    const loc = bathSelect.value.trim();
    if (!loc) throw new Error('Select a bathroom first');
    bathOut.textContent = 'Fetching caps...';
    const [all, m, f] = await Promise.all([ getCap(loc), getCap(loc,'M'), getCap(loc,'F') ]);
    capAllInp.value = Number(all?.cap) || '';
    capMInp.value   = Number(m?.cap)   || '';
    capFInp.value   = Number(f?.cap)   || '';
    bathOut.textContent = `Loaded caps for "${loc}".`;
  } catch (e) {
    bathOut.textContent = `Error: ${e.message || e}`;
  }
});

document.getElementById('btnBathSetAll').addEventListener('click', async () => {
  const loc = bathSelect.value.trim();
  const cap = capAllInp.value.trim();
  if (!loc || !cap) return (bathOut.textContent = 'Select bathroom and enter ALL cap.');
  bathOut.textContent = 'Setting ALL...';
  const res = await setCap(loc, Number(cap));
  bathOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
  // update table row if present
  const row = [...bathTbody.children].find(tr => tr.dataset.loc === loc);
  if (row) row.querySelector('.cap-all').value = Number(cap);
});

document.getElementById('btnBathSetM').addEventListener('click', async () => {
  const loc = bathSelect.value.trim();
  const cap = capMInp.value.trim();
  if (!loc || !cap) return (bathOut.textContent = 'Select bathroom and enter M cap.');
  bathOut.textContent = 'Setting M...';
  const res = await setCap(loc, Number(cap), 'M');
  bathOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
  const row = [...bathTbody.children].find(tr => tr.dataset.loc === loc);
  if (row) row.querySelector('.cap-m').value = Number(cap);
});

document.getElementById('btnBathSetF').addEventListener('click', async () => {
  const loc = bathSelect.value.trim();
  const cap = capFInp.value.trim();
  if (!loc || !cap) return (bathOut.textContent = 'Select bathroom and enter F cap.');
  bathOut.textContent = 'Setting F...';
  const res = await setCap(loc, Number(cap), 'F');
  bathOut.textContent = `HTTP ${res.status}\n\n${res.text}`;
  const row = [...bathTbody.children].find(tr => tr.dataset.loc === loc);
  if (row) row.querySelector('.cap-f').value = Number(cap);
});

document.getElementById('btnBathLoadTable').addEventListener('click', async () => {
  bathTableOut.textContent = 'Reloading locations…';
  await hydrateBathrooms();
});

/* ===============================
 * DEVICE BIND / UNBIND
 * =============================== */
document.getElementById('btnBind').addEventListener('click', async () => {
  try {
    const dev = document.getElementById('bindDeviceId').value.trim();
    const loc = document.getElementById('bindLocation').value.trim();
    if (!dev || !loc) throw new Error('device + location required');
    bindOut.textContent = 'Binding...';
    const r = await adminFetch('/admin/bind', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ device_id: dev, location: loc }).toString()
    });
    bindOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) { bindOut.textContent = `Error: ${e.message || e}`; }
});

document.getElementById('btnUnbind').addEventListener('click', async () => {
  try {
    const dev = document.getElementById('bindDeviceId').value.trim();
    if (!dev) throw new Error('device required');
    bindOut.textContent = 'Unbinding...';
    const r = await adminFetch('/admin/unbind', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ device_id: dev }).toString()
    });
    bindOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) { bindOut.textContent = `Error: ${e.message || e}`; }
});

// Initial locations load (helps when browsing before sign-in completes)
loadLocationsToEditor();

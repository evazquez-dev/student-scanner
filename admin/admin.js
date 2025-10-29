// admin/admin.js — session-only admin UI (no token prompts)

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
const bindOut         = document.getElementById('bindOut');

function show(el){ el && (el.style.display = ''); }
function hide(el){ el && (el.style.display = 'none'); }

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
      document.getElementById('loginCard').style.display = '';
      document.getElementById('loginOut').textContent = 'Missing google-client-id meta.';
      return;
    }

    const gsi = await waitForGoogle(); // ← ensures the script is ready

    // Now safe to initialize
    gsi.initialize({
      client_id: clientId,
      callback: async (resp) => {
        // your existing login fetch...
      }
    });
    gsi.renderButton(document.getElementById('g_id_signin'), { theme: 'outline', size: 'large' });

    document.getElementById('loginCard').style.display = '';
  } catch (e) {
    document.getElementById('loginCard').style.display = '';
    document.getElementById('loginOut').textContent = `Google init failed: ${e.message || e}`;
  }
});

async function onGoogleCredential(resp) {
  try {
    loginOut.textContent = 'Signing in...';
    const r = await fetch(new URL('/admin/session/login_google', API_BASE), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString(),
      credentials: 'include' // receive cookie
    });
    const data = await r.json().catch(()=> ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
    hide(loginCard);
    // auto-run diag after sign-in
    document.getElementById('btnDiag')?.click();
    // also load locations
    loadLocationsToEditor();
  } catch (e) {
    loginOut.textContent = `Login failed: ${e.message || e}`;
  }
}

// Helper fetch that always includes cookies
async function adminFetch(pathOrUrl, init = {}) {
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  return fetch(u, { ...init, credentials: 'include' });
}

// --- Diagnostics ---
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

// --- Roster sync ---
document.getElementById('btnSync').addEventListener('click', async () => {
  syncOut.textContent = 'Syncing...';
  try {
    const r = await adminFetch('/admin/sync', { method: 'POST' });
    syncOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) {
    syncOut.textContent = `Error: ${e.message || e}`;
  }
});

// --- Locations: load & push ---
async function loadLocationsToEditor() {
  locationsOut.textContent = 'Loading locations...';
  try {
    // Public action is fine (server enforces origin)
    const r = await fetch(API_BASE, {
      method: 'POST',
      body: new URLSearchParams({ action: 'locations' }),
    });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      locationsOut.textContent = `Non-JSON:\n${await r.text()}`;
      return;
    }
    const data = await r.json();
    const arr = Array.isArray(data.locations) ? data.locations : [];
    locationsEditor.value = arr.join('\n');
    locationsOut.textContent = `Loaded ${arr.length} locations.`;
  } catch (e) {
    locationsOut.textContent = `Error: ${e.message || e}`;
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
  } catch (e) {
    locationsOut.textContent = `Error: ${e.message || e}`;
  }
});
document.getElementById('btnResetLocations').addEventListener('click', () => {
  if (confirm('Reset editor?')) locationsEditor.value = '';
});

// --- Bathroom caps ---
document.getElementById('btnSetBathCap').addEventListener('click', async () => {
  try {
    const loc = document.getElementById('bathLocation').value.trim();
    const cap = document.getElementById('bathCap').value.trim();
    if (!loc || !cap) throw new Error('location + cap required');
    bathOut.textContent = 'Setting...';
    const r = await adminFetch('/admin/bath_cap', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ location: loc, cap: String(Number(cap)) }).toString()
    });
    bathOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) { bathOut.textContent = `Error: ${e.message || e}`; }
});

document.getElementById('btnGetBathCap').addEventListener('click', async () => {
  try {
    const loc = document.getElementById('bathLocation').value.trim();
    if (!loc) throw new Error('Specify location');
    bathOut.textContent = 'Fetching...';
    const r = await fetch(API_BASE, {
      method: 'POST',
      body: new URLSearchParams({ action: 'bath_cap', location: loc }),
    });
    bathOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) { bathOut.textContent = `Error: ${e.message || e}`; }
});

// --- Device bind/unbind ---
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

// Kick things off
loadLocationsToEditor();

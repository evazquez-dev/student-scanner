// admin/admin.js — small, dependency-free admin UI
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/,'') + '/';
const diagOut = document.getElementById('diagOut');
const syncOut = document.getElementById('syncOut');
const locationsEditor = document.getElementById('locationsEditor');
const locationsOut = document.getElementById('locationsOut');
const bathOut = document.getElementById('bathOut');
const bindOut = document.getElementById('bindOut');

document.getElementById('apiBase').textContent = API_BASE;

// admin/admin.js (session version)
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/,'') + '/';
document.getElementById('apiBase').textContent = API_BASE;

const loginCard = document.getElementById('loginCard');
const loginOut  = document.getElementById('loginOut');

function show(el){ el && (el.style.display=''); }
function hide(el){ el && (el.style.display='none'); }

// Initialize Google button and session detection
window.addEventListener('DOMContentLoaded', async () => {
  // Render Google button
  const clientId = document.querySelector('meta[name="google-client-id"]')?.content || '';
  if (!clientId) {
    show(loginCard);
    loginOut.textContent = 'Missing google-client-id meta.';
    return;
  }
  show(loginCard);
  google.accounts.id.initialize({
    client_id: clientId,
    callback: async (resp) => {
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
        hide(loginCard); // show main UI now
        // Optionally: fetch state immediately
        document.getElementById('btnDiag')?.click();
      } catch (e) {
        loginOut.textContent = `Login failed: ${e.message || e}`;
      }
    }
  });
  google.accounts.id.renderButton(
    document.getElementById('g_id_signin'),
    { theme: 'outline', size: 'large', type: 'standard' }
  );
});

// Helper fetch that includes cookies
async function adminFetch(pathOrUrl, init={}) {
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  const r = await fetch(u, { ...init, credentials: 'include' });
  return r;
}

// --- Diagnostics buttons (now use credentials) ---
const diagOut = document.getElementById('diagOut');
document.getElementById('btnPing').addEventListener('click', async ()=>{
  diagOut.textContent = 'Pinging...';
  try {
    const r = await fetch(API_BASE, { method:'POST', body:new URLSearchParams({action:'ping'}), credentials:'include' });
    const txt = await r.text();
    diagOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (e) { diagOut.textContent = `Error: ${e.message||e}`; }
});
document.getElementById('btnDiag').addEventListener('click', async ()=>{
  try {
    diagOut.textContent = 'Loading /admin/diag...';
    const r = await adminFetch('/admin/diag', { method:'GET' });
    const txt = await r.text();
    diagOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (e) { diagOut.textContent = `Error: ${e.message||e}`; }
});

// --- Roster sync ---
const syncOut = document.getElementById('syncOut');
document.getElementById('btnSync').addEventListener('click', async ()=>{
  try {
    syncOut.textContent = 'Syncing...';
    const r = await adminFetch('/admin/sync', { method:'POST' });
    const txt = await r.text();
    syncOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (e) { syncOut.textContent = `Error: ${e.message||e}`; }
});

// --- Locations load/push (use credentials) ---
const locationsEditor = document.getElementById('locationsEditor');
const locationsOut = document.getElementById('locationsOut');

async function loadLocationsToEditor() {
  locationsOut.textContent = 'Loading locations...';
  try {
    const r = await fetch(API_BASE, { method:'POST', body:new URLSearchParams({action:'locations'}), credentials:'include' });
    const ct = r.headers.get('content-type')||'';
    if (!ct.includes('application/json')) { locationsOut.textContent = await r.text(); return; }
    const data = await r.json();
    const arr = Array.isArray(data.locations) ? data.locations : [];
    locationsEditor.value = arr.join('\n');
    locationsOut.textContent = `Loaded ${arr.length} locations.`;
  } catch (e) { locationsOut.textContent = `Error: ${e.message||e}`; }
}
document.getElementById('btnLoadLocations').addEventListener('click', loadLocationsToEditor);
document.getElementById('btnPushLocations').addEventListener('click', async ()=>{
  try {
    const arr = locationsEditor.value.split('\n').map(s=>s.trim()).filter(Boolean);
    locationsOut.textContent = 'Pushing...';
    const r = await adminFetch('/admin/push_locations', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ locations: arr })
    });
    const txt = await r.text();
    locationsOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (e) { locationsOut.textContent = `Error: ${e.message||e}`; }
});
document.getElementById('btnResetLocations').addEventListener('click', ()=>{ if (confirm('Reset editor?')) locationsEditor.value=''; });

// --- Bathroom caps ---
const bathOut = document.getElementById('bathOut');
document.getElementById('btnSetBathCap').addEventListener('click', async ()=>{
  try {
    const loc = document.getElementById('bathLocation').value.trim();
    const cap = document.getElementById('bathCap').value.trim();
    if (!loc || !cap) throw new Error('location + cap required');
    bathOut.textContent = 'Setting...';
    const r = await adminFetch('/admin/bath_cap', {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ location: loc, cap: String(Number(cap)) }).toString()
    });
    bathOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) { bathOut.textContent = `Error: ${e.message||e}`; }
});
document.getElementById('btnGetBathCap').addEventListener('click', async ()=>{
  try {
    const loc = document.getElementById('bathLocation').value.trim();
    bathOut.textContent = 'Fetching...';
    const r = await fetch(API_BASE, {
      method:'POST',
      body:new URLSearchParams({ action:'bath_cap', location: loc }),
      credentials:'include'
    });
    bathOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) { bathOut.textContent = `Error: ${e.message||e}`; }
});

// --- Bind/unbind ---
const bindOut = document.getElementById('bindOut');
document.getElementById('btnBind').addEventListener('click', async ()=>{
  try {
    const dev = document.getElementById('bindDeviceId').value.trim();
    const loc = document.getElementById('bindLocation').value.trim();
    if (!dev || !loc) throw new Error('device + location required');
    bindOut.textContent = 'Binding...';
    const r = await adminFetch('/admin/bind', {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ device_id: dev, location: loc }).toString()
    });
    bindOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) { bindOut.textContent = `Error: ${e.message||e}`; }
});
document.getElementById('btnUnbind').addEventListener('click', async ()=>{
  try {
    const dev = document.getElementById('bindDeviceId').value.trim();
    if (!dev) throw new Error('device required');
    bindOut.textContent = 'Unbinding...';
    const r = await adminFetch('/admin/unbind', {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ device_id: dev }).toString()
    });
    bindOut.textContent = `HTTP ${r.status}\n\n${await r.text()}`;
  } catch (e) { bindOut.textContent = `Error: ${e.message||e}`; }
});

// Auto-load locations on entry
loadLocationsToEditor();

function safeText(x){ try { return typeof x === 'string' ? x : JSON.stringify(x, null, 2); } catch (e) { return String(x); } }

// --- diagnostics / ping ---
document.getElementById('btnPing').addEventListener('click', async ()=>{
  diagOut.textContent = 'Pinging...';
  try {
    const r = await fetch(API_BASE, { method: 'POST', body: new URLSearchParams({ action:'ping' })});
    const text = await r.text();
    diagOut.textContent = `HTTP ${r.status}\n\n${text}`;
  } catch (err) {
    diagOut.textContent = `Error: ${err.message || err}`;
  }
});

document.getElementById('btnDiag').addEventListener('click', async ()=>{
  try {
    const token = requireTokenPrompt();
    diagOut.textContent = 'Fetching /admin/diag...';
    const r = await fetch(new URL('/admin/diag', API_BASE), { method:'GET', headers: { 'x-admin-token': token }});
    const txt = await r.text();
    diagOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (err) { diagOut.textContent = `Error: ${err.message || err}`; }
});

// --- roster sync ---
document.getElementById('btnSync').addEventListener('click', async ()=>{
  try {
    const token = requireTokenPrompt();
    syncOut.textContent = 'Syncing...';
    const r = await fetch(new URL('/admin/sync', API_BASE), { method:'POST', headers: { 'x-admin-token': token }});
    const txt = await r.text();
    syncOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (err) { syncOut.textContent = `Error: ${err.message || err}`; }
});

// --- locations: load & push ---
async function loadLocationsToEditor() {
  locationsOut.textContent = 'Loading locations (falling back to static if needed)...';
  try {
    // Use public action=locations first (falls back to static list server-side)
    const r = await fetch(API_BASE, { method: 'POST', body: new URLSearchParams({ action:'locations' }) });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (!ct.includes('application/json')) {
      const t = await r.text();
      locationsOut.textContent = `Non-JSON response:\n${t}`;
      return;
    }
    const data = await r.json();
    if (!data || !Array.isArray(data.locations)) throw new Error('No locations array');
    locationsEditor.value = data.locations.join('\n');
    locationsOut.textContent = `Loaded ${data.locations.length} locations.`;
  } catch (err) {
    locationsOut.textContent = `Error loading locations: ${err.message || err}`;
  }
}
document.getElementById('btnLoadLocations').addEventListener('click', loadLocationsToEditor);

document.getElementById('btnPushLocations').addEventListener('click', async ()=>{
  try {
    const token = requireTokenPrompt();
    locationsOut.textContent = 'Pushing locations...';
    const arr = locationsEditor.value.split('\n').map(s=>s.trim()).filter(Boolean);
    const r = await fetch(new URL('/admin/push_locations', API_BASE), {
      method: 'POST',
      headers: { 'x-admin-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ locations: arr })
    });
    const txt = await r.text();
    locationsOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (err) { locationsOut.textContent = `Error: ${err.message || err}`; }
});

document.getElementById('btnResetLocations').addEventListener('click', ()=>{
  if (confirm('Reset the editor to empty?')) locationsEditor.value = '';
});

// --- bath cap get/set ---
document.getElementById('btnSetBathCap').addEventListener('click', async ()=>{
  try {
    const token = requireTokenPrompt();
    const loc = document.getElementById('bathLocation').value.trim();
    const cap = document.getElementById('bathCap').value.trim();
    if (!loc) throw new Error('Specify location');
    if (!cap) throw new Error('Specify cap');
    bathOut.textContent = 'Setting cap...';
    const body = new URLSearchParams({ location: loc, cap: String(Number(cap)) });
    const r = await fetch(new URL('/admin/bath_cap', API_BASE), {
      method: 'POST',
      headers: { 'x-admin-token': token, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString()
    });
    const txt = await r.text();
    bathOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (err) { bathOut.textContent = `Error: ${err.message || err}`; }
});

document.getElementById('btnGetBathCap').addEventListener('click', async ()=>{
  try {
    const loc = document.getElementById('bathLocation').value.trim();
    if (!loc) throw new Error('Specify location');
    bathOut.textContent = 'Fetching cap...';
    const r = await fetch(API_BASE, { method: 'POST', body: new URLSearchParams({ action:'bath_cap', location: loc }) });
    const txt = await r.text();
    bathOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (err) { bathOut.textContent = `Error: ${err.message || err}`; }
});

// --- bind/unbind device ---
document.getElementById('btnBind').addEventListener('click', async ()=>{
  try {
    const token = requireTokenPrompt();
    const dev = document.getElementById('bindDeviceId').value.trim();
    const loc = document.getElementById('bindLocation').value.trim();
    if (!dev || !loc) throw new Error('device_id and location required');
    bindOut.textContent = 'Binding...';
    const body = new URLSearchParams({ device_id: dev, location: loc });
    const r = await fetch(new URL('/admin/bind', API_BASE), {
      method: 'POST',
      headers: { 'x-admin-token': token, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString()
    });
    const txt = await r.text();
    bindOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (err) { bindOut.textContent = `Error: ${err.message || err}`; }
});

document.getElementById('btnUnbind').addEventListener('click', async ()=>{
  try {
    const token = requireTokenPrompt();
    const dev = document.getElementById('bindDeviceId').value.trim();
    if (!dev) throw new Error('device_id required');
    bindOut.textContent = 'Unbinding...';
    const body = new URLSearchParams({ device_id: dev });
    const r = await fetch(new URL('/admin/unbind', API_BASE), {
      method: 'POST',
      headers: { 'x-admin-token': token, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString()
    });
    const txt = await r.text();
    bindOut.textContent = `HTTP ${r.status}\n\n${txt}`;
  } catch (err) { bindOut.textContent = `Error: ${err.message || err}`; }
});

// On load, populate editor from KV/GAS
loadLocationsToEditor();

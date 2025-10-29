// admin/admin.js — small, dependency-free admin UI
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/,'') + '/';
const diagOut = document.getElementById('diagOut');
const syncOut = document.getElementById('syncOut');
const locationsEditor = document.getElementById('locationsEditor');
const locationsOut = document.getElementById('locationsOut');
const bathOut = document.getElementById('bathOut');
const bindOut = document.getElementById('bindOut');

document.getElementById('apiBase').textContent = API_BASE;

// small helper: prompt for admin token (stored in-memory)
let ADMIN_TOKEN = null;
function requireTokenPrompt() {
  if (ADMIN_TOKEN) return ADMIN_TOKEN;
  const t = prompt('Admin token (x-admin-token) — will be kept in memory for this tab only (leave blank to cancel):', '');
  if (!t) throw new Error('Admin token required');
  ADMIN_TOKEN = t.trim();
  return ADMIN_TOKEN;
}

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

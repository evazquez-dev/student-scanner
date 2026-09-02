(function () {
  const API_BASE = 'https://red-cake-77d5.evazquez-3e0.workers.dev/';
  const CONFIG_PATH = '/kiosk/scanner_config_card';
  const LOC_KEY = 'scannerLocationV1';
  let ACTIVE_CONFIG_CODE = '';
  let ACTIVE_CONFIG_STATE = null;
  let RFID_TEST_ARMED = false;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function currentDeviceId() {
    try { return String(localStorage.getItem('scannerDeviceId') || '').trim(); }
    catch { return ''; }
  }

  function currentLocation() {
    try {
      if (typeof window.getLocation === 'function') return String(window.getLocation() || '').trim();
      return String(localStorage.getItem(LOC_KEY) || '').trim();
    } catch { return ''; }
  }

  function setLocalLocation(value) {
    try { localStorage.setItem(LOC_KEY, String(value || '').trim()); } catch {}
  }

  function resultMessage(title, detail = '', good = true) {
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    const now = new Date().toLocaleTimeString();
    if (result) {
      result.innerHTML = `<div class="${good ? 'ok' : 'err'}">${esc(title)}</div>` +
        (detail ? `<div class="muted">${esc(detail)}</div>` : '') +
        `<div class="muted">${esc(now)}</div>`;
    }
    if (status) status.textContent = detail || title;
    try { (good ? window.beepGood : window.beepBad)?.(); } catch {}
  }

  async function configRequest(configAction = 'menu', extra = {}) {
    const response = await fetch(new URL(CONFIG_PATH, API_BASE), {
      method: 'POST',
      body: new URLSearchParams({
        code: ACTIVE_CONFIG_CODE,
        device_id: currentDeviceId(),
        location: currentLocation(),
        config_action: configAction,
        ...extra
      })
    });
    const data = await response.json().catch(() => null);
    if (!data?.matched) throw new Error('Config card authorization expired or was not recognized. Scan the config card again.');
    if (!response.ok || data?.ok === false) {
      const err = new Error(data?.error || `HTTP ${response.status}`);
      err.data = data || {};
      throw err;
    }
    ACTIVE_CONFIG_STATE = data;
    return data;
  }

  async function fetchAllLocations() {
    const response = await fetch(API_BASE, {
      method: 'POST',
      body: new URLSearchParams({ action: 'locations' }),
      cache: 'no-store'
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `Locations HTTP ${response.status}`);
    const raw = Array.isArray(data.meta) && data.meta.length ? data.meta : (Array.isArray(data.locations) ? data.locations : []);
    const seen = new Set();
    const rows = [];
    for (const item of raw) {
      const rec = typeof item === 'string'
        ? { name: item, visible: true, type: '', mode: '' }
        : {
            name: String(item?.name || '').trim(),
            visible: item?.visible !== false,
            type: String(item?.type || '').trim(),
            mode: String(item?.mode || '').trim()
          };
      if (!rec.name || seen.has(rec.name.toLowerCase())) continue;
      seen.add(rec.name.toLowerCase());
      rows.push(rec);
    }
    return rows;
  }

  function installStyles() {
    if (document.getElementById('scannerConfigMenuStyles')) return;
    const style = document.createElement('style');
    style.id = 'scannerConfigMenuStyles';
    style.textContent = `
      #scannerConfigMenuBackdrop{position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.72);display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
      #scannerConfigMenu{width:min(620px,96vw);max-height:92vh;overflow:auto;background:#fff;color:#111827;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.4);padding:20px;box-sizing:border-box}
      #scannerConfigMenu h2{margin:0 0 5px;font-size:1.45rem}
      #scannerConfigMenu .cfg-sub{color:#64748b;font-size:.93rem;margin-bottom:14px}
      #scannerConfigMenu .cfg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #scannerConfigMenu .cfg-btn{min-height:58px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;color:#0f172a;font-weight:800;font-size:1rem;padding:11px 12px;text-align:left;cursor:pointer;touch-action:manipulation}
      #scannerConfigMenu .cfg-btn:hover{background:#eef2ff}
      #scannerConfigMenu .cfg-btn.primary{background:#0b57d0;color:#fff;border-color:#0b57d0}
      #scannerConfigMenu .cfg-btn.warn{background:#fff7ed;border-color:#fdba74;color:#9a3412}
      #scannerConfigMenu .cfg-btn:disabled{opacity:.55;cursor:not-allowed}
      #scannerConfigMenu .cfg-full{grid-column:1/-1}
      #scannerConfigMenu .cfg-status{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#f1f5f9;color:#334155;white-space:pre-wrap;word-break:break-word;font-size:.92rem}
      #scannerConfigMenu .cfg-status.err{background:#fef2f2;color:#991b1b}
      #scannerConfigMenu .cfg-status.ok{background:#f0fdf4;color:#166534}
      #scannerConfigMenu .cfg-select{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:1rem;margin:8px 0 12px}
      #scannerConfigMenu .cfg-info{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(0,1.8fr);gap:7px 12px;font-size:.92rem;margin:12px 0}
      #scannerConfigMenu .cfg-info dt{font-weight:800;color:#475569}
      #scannerConfigMenu .cfg-info dd{margin:0;word-break:break-word}
      #scannerConfigMenu .cfg-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
      @media(max-width:520px){#scannerConfigMenu .cfg-grid{grid-template-columns:1fr}#scannerConfigMenu .cfg-full{grid-column:auto}#scannerConfigMenu .cfg-info{grid-template-columns:1fr;gap:2px}#scannerConfigMenu .cfg-info dd{margin-bottom:8px}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    installStyles();
    let backdrop = document.getElementById('scannerConfigMenuBackdrop');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'scannerConfigMenuBackdrop';
    backdrop.innerHTML = '<div id="scannerConfigMenu" role="dialog" aria-modal="true" aria-label="Scanner configuration menu"></div>';
    backdrop.addEventListener('click', (ev) => {
      if (ev.target === backdrop) closeMenu();
    });
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function modalBody() {
    ensureModal();
    return document.getElementById('scannerConfigMenu');
  }

  function menuOpen() {
    return !!window.__SCANNER_CONFIG_MENU_OPEN;
  }

  function closeMenu() {
    const backdrop = document.getElementById('scannerConfigMenuBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    window.__SCANNER_CONFIG_MENU_OPEN = false;
    ACTIVE_CONFIG_CODE = '';
    ACTIVE_CONFIG_STATE = null;
    try { document.getElementById('manualInput')?.focus({ preventScroll: true }); } catch {}
  }

  function showModalHtml(html) {
    const backdrop = ensureModal();
    const body = modalBody();
    body.innerHTML = html;
    backdrop.style.display = 'flex';
    window.__SCANNER_CONFIG_MENU_OPEN = true;
  }

  function stateLabel(state = ACTIVE_CONFIG_STATE) {
    const local = currentLocation() || 'Not set';
    if (state?.locked) return `Current: ${local} • Locked${state.locked_location ? ` to ${state.locked_location}` : ''}`;
    return `Current: ${local} • Unlocked`;
  }

  function setModalStatus(text, kind = '') {
    const el = document.getElementById('scannerConfigMenuStatus');
    if (!el) return;
    el.className = `cfg-status${kind ? ` ${kind}` : ''}`;
    el.textContent = text;
  }

  function renderMainMenu(state = ACTIVE_CONFIG_STATE) {
    showModalHtml(`
      <h2>Scanner Configuration</h2>
      <div class="cfg-sub">Config card authenticated. ${esc(stateLabel(state))}</div>
      <div class="cfg-grid">
        <button class="cfg-btn primary" id="cfgChangeLocation">Change tablet location</button>
        <button class="cfg-btn" id="cfgDeviceInfo">Display device information</button>
        <button class="cfg-btn" id="cfgLockLocation" ${state?.locked ? 'disabled' : ''}>Lock current location</button>
        <button class="cfg-btn" id="cfgUnlockLocation" ${state?.locked ? '' : 'disabled'}>Unlock current location</button>
        <button class="cfg-btn" id="cfgRetryJournal">Retry unsynced scans</button>
        <button class="cfg-btn" id="cfgRefreshData">Refresh scanner data</button>
        <button class="cfg-btn" id="cfgRfidTest">Test RFID reader — next card</button>
        <button class="cfg-btn" id="cfgUpdateReload">Check for app update & reload</button>
      </div>
      <div id="scannerConfigMenuStatus" class="cfg-status">No setting changes until you tap an action.</div>
      <div class="cfg-footer"><button class="cfg-btn" id="cfgClose" style="min-height:42px">Close</button></div>
    `);

    document.getElementById('cfgClose').onclick = closeMenu;
    document.getElementById('cfgChangeLocation').onclick = () => renderLocationPicker().catch((e) => setModalStatus(`Could not load locations: ${e?.message || e}`, 'err'));
    document.getElementById('cfgDeviceInfo').onclick = () => renderDeviceInfo().catch((e) => setModalStatus(`Device info failed: ${e?.message || e}`, 'err'));
    document.getElementById('cfgLockLocation').onclick = () => runBindingAction('lock');
    document.getElementById('cfgUnlockLocation').onclick = () => runBindingAction('unlock');
    document.getElementById('cfgRetryJournal').onclick = retryUnsyncedScans;
    document.getElementById('cfgRefreshData').onclick = refreshScannerData;
    document.getElementById('cfgRfidTest').onclick = armRfidTest;
    document.getElementById('cfgUpdateReload').onclick = checkForUpdateAndReload;
  }

  async function renderLocationPicker() {
    setModalStatus('Loading every configured scanner location…');
    const locations = await fetchAllLocations();
    if (!locations.length) throw new Error('No locations were returned by EagleNEST.');
    const current = currentLocation();
    const options = locations.map((rec) => {
      const meta = [rec.visible === false ? 'hidden' : '', rec.mode, rec.type].filter(Boolean).join(' • ');
      return `<option value="${esc(rec.name)}"${rec.name === current ? ' selected' : ''}>${esc(rec.name)}${meta ? ` — ${esc(meta)}` : ''}</option>`;
    }).join('');
    showModalHtml(`
      <h2>Change Tablet Location</h2>
      <div class="cfg-sub">All configured locations are shown, including hidden/debug locations. If this tablet is locked, its lock will move to the new location too.</div>
      <select id="cfgLocationSelect" class="cfg-select">${options}</select>
      <div id="scannerConfigMenuStatus" class="cfg-status">Current location: ${esc(current || 'Not set')}</div>
      <div class="cfg-footer">
        <button class="cfg-btn" id="cfgBack" style="min-height:42px">Back</button>
        <button class="cfg-btn primary" id="cfgApplyLocation" style="min-height:42px">Apply location</button>
      </div>
    `);
    document.getElementById('cfgBack').onclick = () => renderMainMenu(ACTIVE_CONFIG_STATE);
    document.getElementById('cfgApplyLocation').onclick = async () => {
      const target = String(document.getElementById('cfgLocationSelect')?.value || '').trim();
      if (!target) return setModalStatus('Choose a location first.', 'err');
      setModalStatus(`Changing this tablet to ${target}…`);
      try {
        const data = await configRequest('change_location', { target_location: target });
        setLocalLocation(target);
        setModalStatus(`Location changed to ${target}.${data.locked ? ' Lock moved with it.' : ''} Reloading…`, 'ok');
        resultMessage('Scanner location changed', `${target}${data.locked ? ' (locked)' : ''}`);
        setTimeout(() => window.location.reload(), 550);
      } catch (e) {
        setModalStatus(`Location change failed: ${e?.message || e}`, 'err');
      }
    };
  }

  async function runBindingAction(action) {
    if (action === 'lock' && !currentLocation()) {
      setModalStatus('This tablet has no location selected. Use Change tablet location first.', 'err');
      return;
    }
    setModalStatus(action === 'lock' ? 'Locking current location…' : 'Unlocking current location…');
    try {
      const data = await configRequest(action);
      const loc = currentLocation() || data.location || '';
      if (action === 'lock') resultMessage('Scanner locked', `Location: ${loc}`);
      else resultMessage('Scanner unlocked', `Location remains ${loc || 'unset'}.`);
      setModalStatus(action === 'lock' ? `Locked to ${loc}. Reloading…` : 'Location unlocked. Reloading…', 'ok');
      setTimeout(() => window.location.reload(), 550);
    } catch (e) {
      const detail = e?.data?.error === 'location_required_before_lock'
        ? 'Choose a location before locking.'
        : (e?.message || e);
      setModalStatus(`Action failed: ${detail}`, 'err');
    }
  }

  async function getServiceWorkerVersion() {
    if (!('serviceWorker' in navigator)) return null;
    try { await navigator.serviceWorker.ready; } catch {}
    if (!navigator.serviceWorker.controller) return null;
    return await new Promise((resolve) => {
      const ch = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 1200);
      ch.port1.onmessage = (ev) => {
        clearTimeout(timer);
        resolve(ev?.data?.type === 'SW_VERSION' ? (ev.data.version || null) : null);
      };
      try { navigator.serviceWorker.controller.postMessage({ type: 'GET_SW_VERSION' }, [ch.port2]); }
      catch { clearTimeout(timer); resolve(null); }
    });
  }

  async function collectDiagnostics(serverState) {
    const debug = window.EAGLENEST_KIOSK_DEBUG;
    let kiosk = {};
    try { kiosk = debug?.getDiagnostics ? await debug.getDiagnostics() : {}; } catch {}
    let storage = null;
    try { storage = await navigator.storage?.estimate?.(); } catch {}
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const swVersion = kiosk.service_worker_version || await getServiceWorkerVersion() || 'no-sw';
    const pending = Number(kiosk.pending_scan_count || 0);
    const oldest = kiosk.oldest_pending_scan_at || '';
    return {
      device_id: currentDeviceId(),
      local_location: currentLocation() || 'Not set',
      server_locked: !!serverState?.locked,
      server_locked_location: String(serverState?.locked_location || '') || '—',
      service_worker: swVersion,
      online: navigator.onLine,
      pending_scans: pending,
      oldest_pending_scan: oldest || '—',
      clock_offset_ms: kiosk.clock_offset_ms ?? '—',
      clock_sample_age_ms: kiosk.clock_sample_age_ms ?? '—',
      clock_rtt_ms: kiosk.clock_rtt_ms ?? '—',
      network: conn ? [conn.effectiveType, conn.downlink != null ? `${conn.downlink} Mbps` : '', conn.rtt != null ? `${conn.rtt} ms RTT` : ''].filter(Boolean).join(' • ') : (navigator.onLine ? 'Online' : 'Offline'),
      display: `${screen.width}×${screen.height} @ ${window.devicePixelRatio || 1}x`,
      standalone: !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone),
      storage: storage ? `${Math.round((storage.usage || 0) / 1048576)} MB used / ${Math.round((storage.quota || 0) / 1048576)} MB quota` : '—',
      user_agent: navigator.userAgent || '—',
      checked_at: new Date().toISOString()
    };
  }

  function diagnosticsText(d) {
    return [
      `EagleNEST Scanner Diagnostics`,
      `Checked: ${d.checked_at}`,
      `Device ID: ${d.device_id}`,
      `Local location: ${d.local_location}`,
      `Server lock: ${d.server_locked ? `LOCKED to ${d.server_locked_location}` : 'UNLOCKED'}`,
      `App/SW: ${d.service_worker}`,
      `Online: ${d.online ? 'yes' : 'no'}`,
      `Unsynced scans: ${d.pending_scans}`,
      `Oldest unsynced: ${d.oldest_pending_scan}`,
      `Clock offset: ${d.clock_offset_ms} ms`,
      `Clock sample age: ${d.clock_sample_age_ms} ms`,
      `Clock RTT: ${d.clock_rtt_ms} ms`,
      `Network: ${d.network}`,
      `Display: ${d.display}`,
      `Standalone/PWA: ${d.standalone ? 'yes' : 'no'}`,
      `Storage: ${d.storage}`,
      `User agent: ${d.user_agent}`
    ].join('\n');
  }

  async function renderDeviceInfo() {
    const state = await configRequest('device_info');
    const d = await collectDiagnostics(state);
    const fields = [
      ['Device ID', d.device_id],
      ['Local location', d.local_location],
      ['Server lock', d.server_locked ? `LOCKED → ${d.server_locked_location}` : 'UNLOCKED'],
      ['App / service worker', d.service_worker],
      ['Connectivity', d.network],
      ['Unsynced scans', `${d.pending_scans}${d.oldest_pending_scan !== '—' ? ` • oldest ${d.oldest_pending_scan}` : ''}`],
      ['Clock', `offset ${d.clock_offset_ms} ms • sample age ${d.clock_sample_age_ms} ms • RTT ${d.clock_rtt_ms} ms`],
      ['Display', d.display],
      ['Standalone / PWA', d.standalone ? 'Yes' : 'No'],
      ['Browser storage', d.storage],
      ['User agent', d.user_agent]
    ];
    showModalHtml(`
      <h2>Device Information</h2>
      <div class="cfg-sub">Safe diagnostics for identifying and checking this physical scanner.</div>
      <dl class="cfg-info">${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div id="scannerConfigMenuStatus" class="cfg-status">Checked ${esc(new Date().toLocaleTimeString())}</div>
      <div class="cfg-footer">
        <button class="cfg-btn" id="cfgInfoBack" style="min-height:42px">Back</button>
        <button class="cfg-btn primary" id="cfgCopyDiagnostics" style="min-height:42px">Copy diagnostics</button>
      </div>
    `);
    document.getElementById('cfgInfoBack').onclick = () => renderMainMenu(ACTIVE_CONFIG_STATE);
    document.getElementById('cfgCopyDiagnostics').onclick = async () => {
      const text = diagnosticsText(d);
      try {
        await navigator.clipboard.writeText(text);
        setModalStatus('Diagnostics copied to clipboard.', 'ok');
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); setModalStatus('Diagnostics copied to clipboard.', 'ok'); }
        catch { setModalStatus('Could not copy automatically. Device ID: ' + d.device_id, 'err'); }
        ta.remove();
      }
    };
  }

  async function retryUnsyncedScans() {
    const debug = window.EAGLENEST_KIOSK_DEBUG;
    if (!debug?.retryPendingScans) return setModalStatus('Retry tool is not available in this frontend build.', 'err');
    setModalStatus('Retrying the local scan journal in chronological order…');
    try {
      const result = await debug.retryPendingScans();
      setModalStatus(`Pending scans: ${result.before} → ${result.after}${result.blocked ? ` (${result.blocked})` : ''}`, result.after === 0 ? 'ok' : '');
    } catch (e) {
      setModalStatus(`Retry failed: ${e?.message || e}`, 'err');
    }
  }

  async function refreshScannerData() {
    const debug = window.EAGLENEST_KIOSK_DEBUG;
    if (!debug?.refreshData) return setModalStatus('Refresh tool is not available in this frontend build.', 'err');
    setModalStatus('Refreshing roster, locations, lock state, clock, and journal health…');
    try {
      const result = await debug.refreshData();
      ACTIVE_CONFIG_STATE = { ...ACTIVE_CONFIG_STATE, locked: !!result.locked, locked_location: result.locked_location || '' };
      setModalStatus(`Refresh complete. ${result.location_count} locations • ${result.roster_count} roster records • ${result.pending_scan_count} pending scans.`, 'ok');
    } catch (e) {
      setModalStatus(`Refresh failed: ${e?.message || e}`, 'err');
    }
  }

  function armRfidTest() {
    RFID_TEST_ARMED = true;
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    closeMenu();
    if (result) result.innerHTML = '<div class="checking">RFID READER TEST ARMED</div><div class="muted">Scan one card. It will be displayed only and will not run a student scan.</div>';
    if (status) status.textContent = 'RFID test armed — scan one card.';
  }

  function handleRfidTest(scanned) {
    RFID_TEST_ARMED = false;
    const raw = String(scanned || '').trim();
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    if (result) result.innerHTML = `<div class="ok">RFID READER TEST</div><div class="code">${esc(raw || '(empty)')}</div><div class="muted">Length: ${raw.length} • No student action recorded.</div>`;
    if (status) status.textContent = 'RFID reader test complete.';
    try { window.beepGood?.(); } catch {}
  }

  async function checkForUpdateAndReload() {
    setModalStatus('Checking the service worker for an updated frontend…');
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      }
      setModalStatus('Update check complete. Reloading the scanner…', 'ok');
      setTimeout(() => window.location.reload(), 450);
    } catch (e) {
      setModalStatus(`Update check failed: ${e?.message || e}`, 'err');
    }
  }

  async function tryScannerConfigCard(scanned) {
    const raw = String(scanned || '').trim();
    if (!navigator.onLine || !/^\d+$/.test(raw)) return false;
    const deviceId = currentDeviceId();
    if (!deviceId) return false;

    let response;
    let data;
    try {
      response = await fetch(new URL(CONFIG_PATH, API_BASE), {
        method: 'POST',
        body: new URLSearchParams({
          code: raw,
          device_id: deviceId,
          location: currentLocation(),
          config_action: 'menu'
        })
      });
      data = await response.json().catch(() => null);
    } catch {
      return false;
    }

    if (!data?.matched) return false;
    if (!response.ok || data?.ok === false) {
      resultMessage('Scanner configuration unavailable', data?.error || `HTTP ${response.status}`, false);
      return true;
    }

    ACTIVE_CONFIG_CODE = raw; // memory only; never persisted to localStorage/sessionStorage.
    ACTIVE_CONFIG_STATE = data;
    renderMainMenu(data);
    resultMessage('Scanner configuration menu', 'Choose an action on this tablet.');
    return true;
  }

  function installScannerConfigCardHook() {
    if (document.body?.dataset?.module !== 'kiosk') return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (typeof window.onScan !== 'function') {
        if (attempts >= 80) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      if (window.onScan.__scannerConfigCardsWrapped) return;
      const original = window.onScan;
      const wrapped = function (scanned) {
        if (RFID_TEST_ARMED) {
          handleRfidTest(scanned);
          return;
        }
        if (menuOpen()) {
          setModalStatus('Configuration menu is open. Close it before scanning another card.', 'err');
          return;
        }
        Promise.resolve(tryScannerConfigCard(scanned))
          .then((matched) => { if (!matched) original(scanned); })
          .catch(() => original(scanned));
      };
      wrapped.__scannerConfigCardsWrapped = true;
      window.onScan = wrapped;
    }, 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installScannerConfigCardHook, { once: true });
  } else {
    installScannerConfigCardHook();
  }
})();

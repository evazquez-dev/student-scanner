(function () {
  const API_BASE = 'https://red-cake-77d5.evazquez-3e0.workers.dev/';
  const CONFIG_PATH = '/kiosk/scanner_config_card';

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
      return String(localStorage.getItem('scannerLocationV1') || '').trim();
    } catch { return ''; }
  }

  function setScannerMessage(data) {
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    const location = currentLocation();
    const now = new Date().toLocaleTimeString();

    if (!data?.ok) {
      const detail = data?.error === 'location_required_before_lock'
        ? 'Choose a scanner location before using a config card to lock this scanner.'
        : 'Scanner configuration card could not be applied.';
      if (result) result.innerHTML = `<div class="err">${esc(detail)}</div><div class="muted">${esc(now)}</div>`;
      if (status) status.textContent = 'Scanner configuration unchanged.';
      try { window.beepBad?.(); } catch {}
      return;
    }

    if (data.action === 'unlock') {
      if (result) result.innerHTML = `<div class="ok">Scanner unlocked</div><div class="muted">Location remains ${esc(location || data.location || 'unset')}.</div><div class="muted">${esc(now)}</div>`;
      if (status) status.textContent = 'Scanner location is unlocked.';
    } else {
      const loc = String(data.location || location || '').trim();
      if (result) result.innerHTML = `<div class="ok">Scanner locked</div><div class="code">Location: ${esc(loc)}</div><div class="muted">${esc(now)}</div>`;
      if (status) status.textContent = `Scanner locked to ${loc}.`;
    }
    try { window.beepGood?.(); } catch {}
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
          location: currentLocation()
        })
      });
      data = await response.json().catch(() => null);
    } catch {
      return false;
    }

    if (!data?.matched) return false;
    setScannerMessage({ ...data, ok: response.ok && data?.ok !== false });

    // The binding toggle is server-side. Reload once so the kiosk's existing
    // lock state is rebuilt by its normal device_location bootstrap.
    if (response.ok && data?.ok !== false && data?.changed !== false) {
      setTimeout(() => window.location.reload(), 650);
    }
    return true;
  }

  function installScannerConfigCardHook() {
    if (document.body?.dataset?.module !== 'kiosk') return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (typeof window.onScan !== 'function') {
        if (attempts >= 40) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      if (window.onScan.__scannerConfigCardsWrapped) return;
      const original = window.onScan;
      const wrapped = function (scanned) {
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
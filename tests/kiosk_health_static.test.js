const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const kiosk = fs.readFileSync(path.join(root, 'student-scanner', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'student-scanner', 'sw.js'), 'utf8');
const fidelityHtml = fs.readFileSync(path.join(root, 'student-scanner', 'admin', 'fidelity.html'), 'utf8');
const fidelityJs = fs.readFileSync(path.join(root, 'student-scanner', 'admin', 'fidelity.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'index.js'), 'utf8');
const healthRoute = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'routes', 'fidelity-dashboard.js'), 'utf8');
const fidelityGas = fs.readFileSync(path.join(root, 'Google Apps Script', 'clasp-projects', 'fidelity-tracking', 'Code.js'), 'utf8');
const kioskHealthGas = fs.readFileSync(path.join(root, 'Google Apps Script', 'clasp-projects', 'fidelity-tracking', 'KioskHealth.js'), 'utf8');

test('wrong-room class scan gives a clear destination', () => {
  assert.match(kiosk, /WRONG ROOM/);
  assert.match(kiosk, /GO TO ROOM/);
  assert.match(kiosk, /replace\(\/\^Expected\\s\+\/i/);
  assert.match(kiosk, /isWrongRoom = upper\.startsWith\('WRONG ROOM'\)/);
});

test('kiosk heartbeat reports software and queue health immediately', () => {
  assert.match(kiosk, /service_worker_version:\s*swVersion\s*\|\|\s*null/);
  assert.match(kiosk, /pending_scan_count:\s*pendingRows\.length/);
  assert.match(kiosk, /oldest_pending_scan_at:/);
  assert.match(kiosk, /kiosk_locked:\s*!!IS_LOCATION_LOCKED/);
  assert.match(kiosk, /sendHeartbeat\(\)\.catch/);
});

test('service worker release is bumped for kiosk-health rollout', () => {
  assert.match(sw, /v20\.9\.0-2026-09-04/);
});

test('admin fidelity page exposes a live kiosk-health table', () => {
  assert.match(fidelityHtml, /Kiosk Health \/ Devices/);
  assert.match(fidelityHtml, /Version Status/);
  assert.match(fidelityHtml, /Pending/);
  assert.match(fidelityHtml, /Clock/);
  assert.match(fidelityJs, /\/admin\/kiosk_health/);
  assert.match(fidelityJs, /fetchExpectedKioskSwVersion/);
  assert.match(fidelityJs, /expected_service_worker_version/);
});

test('worker modular route augments fidelity dashboard and exposes kiosk health', () => {
  assert.match(workerIndex, /handleFidelityDashboardRequest/);
  assert.match(workerIndex, /FIDELITY_DASHBOARD_PATHS/);
  assert.match(healthRoute, /fidelity_kiosk_health/);
  assert.match(healthRoute, /data\.devices = Array\.isArray\(health\?\.devices\)/);
});

test('fidelity GAS accepts kiosk-health reads and summarizes heartbeat metadata', () => {
  assert.match(fidelityGas, /fidelity_kiosk_health/);
  assert.match(fidelityGas, /getFidelityKioskHealth_/);
  assert.match(kioskHealthGas, /service_worker_version/);
  assert.match(kioskHealthGas, /last_heartbeat_at_iso/);
  assert.match(kioskHealthGas, /pending_scan_count/);
  assert.match(kioskHealthGas, /clock_skew_warning/);
});

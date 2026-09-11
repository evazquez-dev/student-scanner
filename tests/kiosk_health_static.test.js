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
const fidelityD1 = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'services', 'fidelity-d1.js'), 'utf8');

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

test('service worker release is present for kiosk-health version comparison', () => {
  assert.match(sw, /const\s+VERSION\s*=\s*['"][^'"]+['"]/);
});

test('admin fidelity page is the simplified operational-health view', () => {
  assert.match(fidelityHtml, /Operational Health/);
  assert.match(fidelityHtml, /Kiosk Health \/ Devices/);
  assert.match(fidelityHtml, /Room \/ Period Health/);
  assert.match(fidelityHtml, /Exceptions/);
  assert.match(fidelityJs, /\/admin\/kiosk_health/);
  assert.match(fidelityJs, /\/admin\/fidelity_dashboard/);
  assert.match(fidelityJs, /fetchExpectedKioskSwVersion/);
});

test('worker modular route serves kiosk health from D1', () => {
  assert.match(workerIndex, /handleFidelityDashboardRequest/);
  assert.match(workerIndex, /FIDELITY_DASHBOARD_PATHS/);
  assert.match(healthRoute, /listFidelityDevicesD1/);
  assert.match(healthRoute, /buildFidelityDashboardD1/);
  assert.doesNotMatch(healthRoute, /fidelity_kiosk_health|FIDELITY_GAS_URL/);
});

test('D1 fidelity service stores heartbeat metadata in compact device state', () => {
  assert.match(fidelityD1, /service_worker_version/);
  assert.match(fidelityD1, /last_heartbeat_at_iso/);
  assert.match(fidelityD1, /pending_scan_count/);
  assert.match(fidelityD1, /clock_skew_warning/);
  assert.match(fidelityD1, /ON CONFLICT\(device_id\)/);
});

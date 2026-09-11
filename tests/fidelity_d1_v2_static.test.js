const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const migration = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'migrations', '0003_fidelity_v2.sql'), 'utf8');
const service = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'services', 'fidelity-d1.js'), 'utf8');
const route = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'routes', 'fidelity-dashboard.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'index.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'student-scanner', 'admin', 'fidelity.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'student-scanner', 'admin', 'fidelity.js'), 'utf8');
const wrangler = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'wrangler.jsonc'), 'utf8');

test('fidelity v2 migration stores compact state, daily aggregates, and exceptions', () => {
  for (const table of ['fidelity_devices','fidelity_device_daily','fidelity_room_period_daily','fidelity_exceptions','fidelity_event_receipts']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test('worker fidelity sink writes to D1 rather than Fidelity GAS', () => {
  assert.match(worker, /FIDELITY_D1_V2_RUNTIME_BRIDGE/);
  assert.match(worker, /fidelityD1IngestEvents_/);
  assert.match(worker, /fidelityD1SyncExpectedRoomPeriods_/);
  assert.match(worker, /fidelityD1PruneReceipts_/);
  assert.doesNotMatch(worker, /from ['"]\.\/services\/fidelity-d1\.js['"]/);
  assert.match(index, /ingestFidelityEventsD1/);
  assert.match(index, /syncFidelityExpectedRoomPeriodsD1/);
  assert.match(index, /pruneFidelityReceiptsD1/);
  assert.match(index, /__EAGLENEST_FIDELITY_D1_V2__/);
  assert.doesNotMatch(wrangler, /FIDELITY_GAS_URL/);
});

test('fidelity routes are D1-backed and intercept legacy dashboard endpoints', () => {
  assert.match(route, /buildFidelityDashboardD1/);
  assert.match(route, /\/admin\/fidelity_range_dashboard/);
  assert.match(route, /\/admin\/fidelity_score_snapshot_meta/);
  assert.doesNotMatch(route, /FIDELITY_GAS_URL|fidelity_kiosk_health/);
});

test('fidelity service summarizes normal events instead of keeping a raw permanent ledger', () => {
  assert.match(service, /ON CONFLICT\(school_date, device_id\)/);
  assert.match(service, /ON CONFLICT\(school_date, room, period_local\)/);
  assert.match(service, /eventType === 'kiosk_scan_error'/);
  assert.match(service, /eventType === 'kiosk_heartbeat'/);
});

test('operational health frontend is smaller and uses D1 dashboard endpoints', () => {
  assert.match(html, /Operational Health/);
  assert.match(html, /Room \/ Period Health/);
  assert.match(html, /Kiosk Health \/ Devices/);
  assert.match(html, /Exceptions/);
  assert.match(js, /\/admin\/fidelity_dashboard/);
  assert.match(js, /\/admin\/kiosk_health/);
  assert.match(js, /fetchExpectedKioskSwVersion/);
  assert.doesNotMatch(js, /Fidelity_Score_Daily|fidelity_range_dashboard|fidelity_score_snapshot_meta/);
});

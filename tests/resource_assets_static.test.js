// EAGLENEST_RESOURCE_ASSET_RFID_V1
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('ChromeCart RFID assets are D1-backed and collision guarded', () => {
  const migration = read('cf-redcake/red-cake-77d5/migrations/0009_resource_asset_rfid.sql');
  const service = read('cf-redcake/red-cake-77d5/src/services/resource-assets.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/resource-assets.js');
  const index = read('cf-redcake/red-cake-77d5/src/index.js');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS resource_assets/);
  assert.match(migration, /ChromeCart B/);
  assert.match(migration, /ChromeCart C/);
  assert.match(migration, /ChromeCart D/);
  assert.match(service, /rfid_already_assigned_to_student/);
  assert.match(service, /rfid_already_assigned_to_scanner_config_card/);
  assert.match(service, /server_binding/);
  assert.match(route, /super_admin_required/);
  assert.match(index, /RESOURCE_ASSET_PATHS/);
});

test('kiosk special-card interception consumes ChromeCart cards before student scans', () => {
  const scannerRoute = read('cf-redcake/red-cake-77d5/src/routes/scanner-config-cards.js');
  const scannerService = read('cf-redcake/red-cake-77d5/src/services/scanner-config-cards.js');
  const brand = read('student-scanner/brand.js');

  assert.match(scannerRoute, /applyResourceAssetCard/);
  assert.match(scannerRoute, /Asset cards are consumed here/);
  assert.match(scannerService, /rfid_already_assigned_to_resource_asset/);
  assert.match(brand, /resource_asset/);
  assert.match(brand, /location updated/);
});

test('ChromeCart live location is joined into booking surfaces', () => {
  const bookings = read('cf-redcake/red-cake-77d5/src/services/resource-bookings.js');
  const myRoute = read('cf-redcake/red-cake-77d5/src/routes/my-schedule.js');
  const myJs = read('student-scanner/admin/my_schedule.js');
  const teacherJs = read('student-scanner/admin/teacher_attendance.js');

  assert.match(bookings, /LEFT JOIN resource_assets/);
  assert.match(bookings, /asset_location/);
  assert.match(myRoute, /asset_location_mismatch/);
  assert.match(myJs, /Last seen/);
  assert.match(teacherJs, /Last seen/);
});

test('System Administration can assign the three cart RFID cards', () => {
  const html = read('student-scanner/admin/index.html');
  const js = read('student-scanner/admin/admin.js');

  assert.match(html, /ChromeCart RFID Tracking/);
  assert.match(html, /resourceAssetsTbody/);
  assert.match(js, /loadResourceAssets/);
  assert.match(js, /\/admin\/resource_assets/);
});

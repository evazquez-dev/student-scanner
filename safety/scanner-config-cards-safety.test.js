const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/scanner-config-cards.js');
const service = read('cf-redcake/red-cake-77d5/src/services/scanner-config-cards.js');
const kiosk = read('student-scanner/brand.js');
const adminBrand = read('student-scanner/admin/brand.js');

test('SAFETY: Scanner config-card routes are intercepted before legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/scanner-config-cards\.js'/);
  const routePos = index.indexOf('SCANNER_CONFIG_CARD_PATHS.has(path)');
  const fallbackPos = index.lastIndexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(routePos >= 0, 'scanner config-card route interception missing');
  assert.ok(fallbackPos > routePos, 'scanner config-card handler must run before legacy fallback');
});

test('SAFETY: Config-card settings are Super Admin-only and mutations retain origin/View-as protection', () => {
  assert.match(route, /super_admin_required/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
});

test('SAFETY: Physical config cards cannot collide with student OSIS/RFID values', () => {
  assert.match(service, /rfid_already_assigned_to_student/);
  assert.match(service, /row\?\.o/);
  assert.match(service, /row\?\.rf/);
  assert.match(service, /rfid_cards_must_be_different/);
});

test('SAFETY: Either config card toggles only the current device binding and stays live system configuration', () => {
  assert.match(service, /DEVICE_BIND_PREFIX = 'bind:'/);
  assert.match(service, /const action = existingLocation \? 'unlock' : 'lock'/);
  assert.match(service, /env\.ROSTER\.delete\(bindKey\)/);
  assert.match(service, /env\.ROSTER\.put\(bindKey, location/);
  assert.match(service, /card_1/);
  assert.match(service, /card_2/);
  assert.match(service, /system_configuration: true/);
  assert.doesNotMatch(service, /practice:v1:/);
});

test('SAFETY: Kiosk consumes config cards before student lookup/log flow', () => {
  assert.match(kiosk, /function tryScannerConfigCard\(scanned\)/);
  assert.match(kiosk, /if \(!data\?\.matched\) return false/);
  assert.match(kiosk, /if \(!matched\) original\(scanned\)/);
  assert.match(kiosk, /\/kiosk\/scanner_config_card/);
});

test('SAFETY: System Settings exposes two equivalent scanner toggle-card fields', () => {
  assert.match(adminBrand, /Scanner Config Card 1 RFID tag/);
  assert.match(adminBrand, /Scanner Config Card 2 RFID tag/);
  assert.match(adminBrand, /Both cards do the same thing/);
  assert.match(adminBrand, /toggle scanner location lock/);
  assert.match(adminBrand, /\/admin\/scanner_config_cards/);
  assert.match(adminBrand, /rfid_already_assigned_to_student/);
});

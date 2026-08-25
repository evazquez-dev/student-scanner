const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const service = read('cf-redcake/red-cake-77d5/src/services/reflection-saved-rosters.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/reflection-hold.js');
const legacyHold = read('cf-redcake/red-cake-77d5/src/services/reflection-hold.js');

test('SAFETY: saved roster definitions are persistent personal configuration, not Practice operational state', () => {
  assert.match(service, /reflection_hold:saved_rosters:v1:/);
  assert.match(service, /encodeURIComponent/);
  assert.doesNotMatch(service, /expirationTtl/);
  assert.doesNotMatch(service, /practice:v1:/);
});

test('SAFETY: loading a saved roster uses current-mode StudentLocation and filters students not currently on campus', () => {
  assert.match(service, /studentViewOperationalDoName\(modeInfo, 'GLOBAL'\)/);
  assert.match(service, /not_present_today/);
  assert.match(service, /left_early/);
  assert.match(service, /off_campus/);
  assert.match(service, /early_dismissal/);
});

test('SAFETY: saved roster save/delete mutations retain origin and View-As read-only guards', () => {
  assert.match(route, /path === '\/admin\/reflection_hold\/saved_rosters'/);
  assert.match(route, /mutationGuard\(req, env, base\.response, base\.data\)/);
  assert.match(route, /action === 'delete'/);
});

test('SAFETY: saved roster feature does not alter core Reflection Hold service implementation', () => {
  assert.doesNotMatch(legacyHold, /SAVED_ROSTERS_KEY_PREFIX/);
  assert.doesNotMatch(legacyHold, /savedRostersKey/);
});

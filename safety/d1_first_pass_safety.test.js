const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

test('D1 communication mutations keep auth, origin, and View-As read-only guards', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/communications-d1.js');
  assert.match(route, /loadBaseAccess/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
});

test('live communication route cannot silently fall back to Google Sheets', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/communications-d1.js');
  assert.doesNotMatch(route, /BEHAVIOR_GAS_URL/);
  assert.match(route, /storage:'d1'/);
  assert.match(route, /if \(mode\.practice\) return baseWorker\.fetch/);
});

test('D1 write actor comes from authenticated access rather than request body', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/communications-d1.js');
  const service = read('cf-redcake/red-cake-77d5/src/services/communications-d1.js');
  assert.match(route, /email:access\.email/);
  assert.match(route, /role:access\.role/);
  assert.match(service, /actorEmail = d1Email\(actor\?\.email/);
});

test('behavior D1 cutover is isolated in its own guarded live route', () => {
  const communicationRoute = read('cf-redcake/red-cake-77d5/src/routes/communications-d1.js');
  const behaviorRoute = read('cf-redcake/red-cake-77d5/src/routes/behavior-d1-live.js');
  const admin = read('cf-redcake/red-cake-77d5/src/routes/d1-admin.js');
  assert.doesNotMatch(communicationRoute, /behavior\/log/);
  assert.match(behaviorRoute, /behavior\/log/);
  assert.match(behaviorRoute, /mutationOriginAllowed/);
  assert.match(behaviorRoute, /viewAsReadOnlyResponse/);
  assert.doesNotMatch(behaviorRoute, /BEHAVIOR_GAS_URL/);
  assert.match(admin, /behavior_shadow\/reconcile/);
});

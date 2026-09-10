const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

test('SAFETY: live Behavior D1 mutations retain auth, origin, and View-As guards', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/behavior-d1-live.js');
  assert.match(route, /loadBaseAccess/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(route, /email:access\.email/);
  assert.match(route, /role:access\.role/);
});

test('SAFETY: live Behavior D1 has no Google Sheet write or read fallback', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/behavior-d1-live.js');
  assert.doesNotMatch(route, /BEHAVIOR_GAS_URL/);
  assert.doesNotMatch(route, /BEHAVIOR_GAS_SECRET/);
  assert.doesNotMatch(route, /gasPostFormJson/);
  assert.match(route, /storage:'d1'/);
});

test('SAFETY: non-admin Behavior history is server-scoped to the authenticated author', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/behavior-live-d1.js');
  assert.match(service, /if \(admin\) return \{ clauses:\['1=1'\], values:\[\] \}/);
  assert.match(service, /clauses:\['actor_email = \?'\]/);
  assert.match(service, /viewer_email_required/);
});

test('SAFETY: Behavior update keeps author-or-admin ownership enforcement', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/behavior-d1.js');
  assert.match(service, /actorRole === 'admin' \|\| actorRole === 'super_admin'/);
  assert.match(service, /prior\.actor_email/);
  assert.match(service, /status: 403, error: 'forbidden'/);
  assert.match(service, /INSERT INTO behavior_audit/);
});

test('SAFETY: deleted Behavior rows never appear in Teacher Attendance recent history', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/behavior-live-d1.js');
  assert.match(service, /is_deleted = 0/);
});

test('SAFETY: Practice Behavior requests stay on isolated legacy Practice storage', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/behavior-d1-live.js');
  assert.match(route, /if \(mode\.practice\)/);
  assert.match(route, /baseWorker\.fetch/);
  assert.match(route, /fail_closed/);
});

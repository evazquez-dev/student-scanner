const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

test('Behavior D1 cutover owns all live operational Behavior endpoints', () => {
  const index = read('cf-redcake/red-cake-77d5/src/index.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/behavior-d1-live.js');
  for (const endpoint of [
    '/admin/behavior/log',
    '/admin/behavior/list',
    '/admin/behavior/update',
    '/admin/behavior/recent'
  ]) assert.match(route, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(index, /BEHAVIOR_D1_LIVE_PATHS/);
  assert.match(index, /handleBehaviorD1LiveRequest/);
  assert.doesNotMatch(route, /BEHAVIOR_GAS_URL/);
  assert.doesNotMatch(route, /gasPostFormJson/);
});

test('Behavior Practice Mode remains isolated on the existing Worker path', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/behavior-d1-live.js');
  assert.match(route, /mode\.practice/);
  assert.match(route, /baseWorker\.fetch/);
  assert.match(route, /system_mode_check_failed/);
});

test('Behavior D1 live history preserves current author/admin scoping and filters', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/behavior-live-d1.js');
  assert.match(service, /actor_email = \?/);
  assert.match(service, /isAdminRole/);
  assert.match(service, /include_deleted/);
  assert.match(service, /deleted_only/);
  assert.match(service, /event_key/);
  assert.match(service, /student_number = \?/);
  assert.match(service, /meta_json/);
});

test('Teacher Attendance recent behavior now reads active D1 rows by date-room-period', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/behavior-live-d1.js');
  assert.match(service, /school_date = \?/);
  assert.match(service, /LOWER\(room\) = LOWER\(\?\)/);
  assert.match(service, /LOWER\(period_local\) = LOWER\(\?\)/);
  assert.match(service, /is_deleted = 0/);
});

test('Behavior History frontend endpoint contracts stay unchanged during storage cutover', () => {
  const frontend = read('student-scanner/admin/behavior_history.js');
  assert.match(frontend, /\/admin\/behavior\/list/);
  assert.match(frontend, /\/admin\/behavior\/update/);
  assert.match(frontend, /include_deleted/);
  assert.match(frontend, /deleted_only/);
  assert.match(frontend, /Mark deleted/);
  assert.match(frontend, /Restore/);
});

test('legacy GAS behavior implementation remains dormant for rollback while D1 is authoritative', () => {
  const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
  const admin = read('cf-redcake/red-cake-77d5/src/routes/d1-admin.js');
  assert.match(worker, /if \(path === "\/admin\/behavior\/log"\)/);
  assert.match(worker, /if \(path === "\/admin\/behavior\/list"\)/);
  assert.match(worker, /if \(path === "\/admin\/behavior\/update"\)/);
  assert.match(admin, /production_behavior_storage:'d1'/);
  assert.match(admin, /d1_role:'authoritative'/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/supervised-lunch.js');
const service = read('cf-redcake/red-cake-77d5/src/services/supervised-lunch.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');

const ENDPOINTS = ['/admin/supervised_lunch/options', '/admin/supervised_lunch/save'];

test('SAFETY: Supervised Lunch is intercepted before legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/supervised-lunch\.js'/);
  const routePos = index.indexOf('SUPERVISED_LUNCH_PATHS.has(path)');
  const fallbackPos = index.lastIndexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(routePos >= 0, 'Supervised Lunch route interception missing');
  assert.ok(fallbackPos > routePos, 'Supervised Lunch must run before legacy fallback');
});

test('SAFETY: Supervised Lunch endpoint contracts remain modular and legacy route blocks stay removed', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(route.includes(endpoint), `modular route missing ${endpoint}`);
    assert.ok(!worker.includes(`path === \"${endpoint}\"`), `legacy route block returned ${endpoint}`);
  }
});

test('SAFETY: Supervised Lunch Save retains origin and View-as read-only protection without becoming Admin-only', () => {
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.doesNotMatch(route, /can\?\.admin/);
  assert.doesNotMatch(route, /superAdminOnly/);
  assert.doesNotMatch(route, /adminOnly/);
});

test('SAFETY: Supervised Lunch operational KV contracts remain compatible with legacy attendance consumers', () => {
  assert.match(service, /supervised_lunch_v1:/);
  assert.match(service, /supervised_lunch_last_set_v1:/);
  assert.match(worker, /loadSupervisedLunchAssignments\(env, date\)/);
  assert.match(worker, /findSupervisedLunchAssignmentForOsisPeriod_/);
  assert.match(worker, /SUPERVISED_LUNCH_CACHE\.list/);
});

test('SAFETY: Practice Supervised Lunch state and audit fail closed and remain 36-hour Practice KV', () => {
  assert.match(service, /PRACTICE_KV_PREFIX = 'practice:v1:'/);
  assert.match(service, /PRACTICE_KV_TTL_SEC = 36 \* 60 \* 60/);
  assert.match(service, /mode: SYSTEM_MODE_PRACTICE,[\s\S]{0,120}practice: true,[\s\S]{0,120}fail_closed: true/);
  assert.match(service, /supervisedLunchOperationalKey\(modeInfo, supervisedLunchKeyForDate\(d\), d\)/);
  assert.match(service, /supervisedLunchOperationalKey\(modeInfo, supervisedLunchLastSetKey\(teacher, period\)\)/);
  assert.match(service, /supervisedLunchOperationalKey\(modeInfo, liveKey\)/);
});

test('SAFETY: Practice Supervised Lunch pins requested dates to the global practice day', () => {
  assert.match(route, /const requestedDate = String\(new URL\(req\.url\)\.searchParams\.get\('date'\) \|\| getNYCDate\(\)\)\.trim\(\)/);
  assert.match(route, /modeInfo\.practice[\s\S]{0,180}modeInfo\.practice_day[\s\S]{0,180}: requestedDate/);
  assert.match(service, /function effectiveSupervisedLunchDate|export function effectiveSupervisedLunchDate/);
  assert.match(service, /if \(!modeInfo\?\.practice\) return requested/);
});

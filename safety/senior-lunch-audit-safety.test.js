const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/senior-lunch-audit.js');
const service = read('cf-redcake/red-cake-77d5/src/services/senior-lunch-audit.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');

const ENDPOINTS = ['/admin/senior_outin_audit', '/admin/senior_outin_forgive'];

test('SAFETY: Senior Lunch Audit is intercepted before legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/senior-lunch-audit\.js'/);
  const routePos = index.indexOf('SENIOR_LUNCH_AUDIT_PATHS.has(path)');
  const fallbackPos = index.lastIndexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(routePos >= 0, 'Senior Lunch route interception missing');
  assert.ok(fallbackPos > routePos, 'Senior Lunch must run before legacy fallback');
});

test('SAFETY: Senior Lunch endpoint contracts remain modular and legacy route blocks stay removed', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(route.includes(endpoint), `modular route missing ${endpoint}`);
    assert.ok(!worker.includes(`path === \"${endpoint}\"`), `legacy route block returned ${endpoint}`);
  }
});

test('SAFETY: Senior Lunch mutations retain origin and View-as read-only protection', () => {
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
  const forgiveStart = route.indexOf('async function handleForgive');
  const guardPos = route.indexOf('mutationGuard(', forgiveStart);
  const rolePos = route.indexOf('adminOnly(', forgiveStart);
  assert.ok(guardPos > forgiveStart, 'Forgive mutation guard missing');
  assert.ok(rolePos > guardPos, 'View-as/origin guard must run before Forgive role authorization');
});

test('SAFETY: Practice Senior Lunch state cannot fall through to live StudentLocationDO', () => {
  assert.match(service, /SYSTEM_MODE_KEY = 'system:mode:v1'/);
  assert.match(service, /mode: SYSTEM_MODE_PRACTICE,[\s\S]{0,120}practice: true,[\s\S]{0,120}fail_closed: true/);
  assert.match(service, /return `PRACTICE:\$\{d\}:GLOBAL`/);
  assert.match(service, /seniorLunchStudentLocationDoName\(modeInfo\)/);
  assert.match(service, /stub\.fetch\('https:\/\/student-loc\/all'\)/);
  assert.match(service, /stub\.fetch\('https:\/\/student-loc\/update'/);
});

test('SAFETY: Forgive continues to clear only Senior Lunch out/penalty state while preserving violation history', () => {
  assert.match(service, /senior_outin_out_active: false/);
  assert.match(service, /senior_outin_out_date: null/);
  assert.match(service, /senior_outin_penalty_pending: false/);
  assert.match(service, /senior_outin_penalty_date: null/);
  assert.match(service, /senior_outin_last_violation_type: seniorState\.lastViolationType \|\| seniorState\.pendingReason \|\| null/);
  assert.match(service, /senior_outin_last_forgiven_by/);
  assert.doesNotMatch(service, /gym_outin_[a-z_]+:\s*(?:false|null)/);
  assert.doesNotMatch(service, /phone_out:\s*(?:false|null)/);
});

test('SAFETY: missing Senior Lunch mode store fails closed to Practice', () => {
  assert.match(service, /if \(!env\?\.ROSTER\)/);
  assert.match(service, /mode_read_error: 'mode_store_not_bound'/);
});

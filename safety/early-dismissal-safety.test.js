const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/early-dismissal.js');
const service = read('cf-redcake/red-cake-77d5/src/services/early-dismissal.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');

const ENDPOINTS = [
  '/admin/early_dismissal_undo',
  '/admin/early_dismissals',
  '/admin/early_dismissals/undo',
  '/admin/early_dismissal'
];

test('SAFETY: Early Dismissal is intercepted before legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/early-dismissal\.js'/);
  const routePos = index.indexOf('EARLY_DISMISSAL_PATHS.has(path)');
  const fallbackPos = index.lastIndexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(routePos >= 0, 'Early Dismissal route interception missing');
  assert.ok(fallbackPos > routePos, 'Early Dismissal must run before legacy fallback');
});

test('SAFETY: endpoint contracts and dormant rollback blocks remain present', () => {
  for (const endpoint of ENDPOINTS) {
    assert.ok(route.includes(endpoint), `modular route missing ${endpoint}`);
    assert.ok(worker.includes(endpoint), `legacy rollback block missing ${endpoint}`);
  }
});

test('SAFETY: Early Dismissal preserves distinct view, undo, and trusted-token authorization', () => {
  assert.match(route, /loadBaseAccess/);
  assert.match(route, /early_dismissal_undo/);
  assert.match(route, /x-admin-token/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
});

test('SAFETY: Practice Early Dismissal state stays isolated and fail-closed', () => {
  assert.match(service, /PRACTICE_KV_PREFIX = 'practice:v1:'/);
  assert.match(service, /PRACTICE_KV_TTL_SEC = 36 \* 60 \* 60/);
  assert.match(service, /mode: 'practice',[\s\S]{0,120}practice: true,[\s\S]{0,120}fail_closed: true/);
  assert.match(service, /PRACTICE:\$\{d\}:\$\{base\}/);
  assert.match(service, /EARLY_DISMISSAL_UNDO_TTL_SEC = 36 \* 60 \* 60/);
});

test('SAFETY: Practice Early Dismissal cannot be redirected to a submitted date', () => {
  assert.match(route, /const requestedDate = String\(body\?\.date \|\| getNYCDate\(\)\)/);
  assert.match(route, /const date = modeInfo\.practice[\s\S]{0,180}modeInfo\.practice_day[\s\S]{0,180}: requestedDate/);
});

test('SAFETY: undo remains guarded against newer or changed student state', () => {
  assert.match(service, /undo_link_only_valid_today/);
  assert.match(service, /undo_link_already_used/);
  assert.match(service, /student_state_changed/);
  assert.match(service, /student_has_newer_activity/);
  assert.match(service, /class_session_changed/);
});

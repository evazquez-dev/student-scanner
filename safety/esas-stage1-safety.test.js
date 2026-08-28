const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/esas.js');
const service = read('cf-redcake/red-cake-77d5/src/services/esas.js');
const durable = read('cf-redcake/red-cake-77d5/src/durable-objects/esas.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const wrangler = read('cf-redcake/red-cake-77d5/wrangler.jsonc');
const access = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
const adminHtml = read('student-scanner/admin/index.html');
const adminJs = read('student-scanner/admin/admin.js');

const interceptPos = index.indexOf('ESAS_PATHS.has(path)');
const fallbackPos = index.indexOf('return baseWorker.fetch(req, env, ctx);');

test('SAFETY: ESAS routes are modular and intercepted before legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/esas\.js'/);
  assert.ok(interceptPos >= 0, 'ESAS intercept missing');
  assert.ok(fallbackPos > interceptPos, 'ESAS must run before legacy fallback');
  assert.doesNotMatch(route, /worker\.js|baseWorker/);
  for (const endpoint of ['/admin/esas/status', '/admin/esas/activate', '/admin/esas/end']) {
    assert.match(route, new RegExp(endpoint.replaceAll('/', '\\/')));
    assert.doesNotMatch(worker, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
});

test('SAFETY: ESAS activation/end retain origin, View-as, and Ops/Admin permission guards', () => {
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(route, /esas_manage_required/);
  assert.match(access, /esas:\s*true/);
  assert.match(access, /esas_manage:\s*isAdminLike \|\| canHallway/);
});

test('SAFETY: ESAS has a dedicated Durable Object binding and migration', () => {
  assert.match(index, /import \{ ESASDO \} from '\.\/durable-objects\/esas\.js'/);
  assert.match(index, /export \{[\s\S]*ESASDO/);
  assert.match(wrangler, /"name": "ESAS_DO"/);
  assert.match(wrangler, /"class_name": "ESASDO"/);
  assert.match(wrangler, /"tag": "v8"/);
  assert.match(wrangler, /"new_sqlite_classes": \[[\s\S]*"ESASDO"/);
  assert.match(durable, /esas_already_active/);
  assert.match(durable, /incident_mismatch/);
});

test('SAFETY: ESAS lifecycle is intentionally independent of Practice Mode and has no external student-system side effects', () => {
  assert.doesNotMatch(route + service + durable, /SYSTEM_MODE|practice:v1|pushFinalToGAS|WORKER_PUSH_URL|PowerSchool|GAS_URL/);
  assert.match(service, /ESAS_ARCHIVE_PREFIX\s*=\s*'esas:archive:v1:'/);
});

test('SAFETY: ending ESAS requires an exact incident id and archives the ended lifecycle record', () => {
  assert.match(route, /incident_id_required/);
  assert.match(durable, /requestedId !== String\(active\.incident_id/);
  assert.match(service, /ESAS_ARCHIVE_PREFIX/);
  assert.match(service, /archive_write_failed/);
});

test('SAFETY: Super Admin page exposes explicit ESAS activate/end controls without global redirect yet', () => {
  assert.match(adminHtml, /id="esasControlCard"/);
  assert.match(adminHtml, /id="btnActivateEsas"/);
  assert.match(adminHtml, /id="btnEndEsas"/);
  assert.match(adminJs, /\/admin\/esas\/status/);
  assert.match(adminJs, /\/admin\/esas\/activate/);
  assert.match(adminJs, /\/admin\/esas\/end/);
  assert.doesNotMatch(adminJs, /location\.replace\([^\n]*esas/);
});

test('SAFETY: Teacher Attendance write/finalization boundary remains untouched during ESAS Stage 1', () => {
  assert.match(worker, /path === "\/admin\/teacher_att\/submit"/);
  assert.match(worker, /path === "\/admin\/class_session\/toggle"/);
  assert.match(worker, /async function pushFinalToGAS/);
});

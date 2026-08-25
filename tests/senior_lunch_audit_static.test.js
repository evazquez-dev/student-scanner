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
const ui = read('student-scanner/admin/senior_lunch_audit.js');

test('Senior Lunch Audit routes are owned by the modular handler before legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/senior-lunch-audit\.js'/);
  const guardPos = index.indexOf('SENIOR_LUNCH_AUDIT_PATHS.has(path)');
  const fallbackPos = index.lastIndexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(guardPos >= 0, 'Senior Lunch route guard must exist');
  assert.ok(fallbackPos > guardPos, 'Senior Lunch route guard must execute before legacy fallback');
  assert.match(index, /handleSeniorLunchAuditRequest/);
});

test('Senior Lunch modular endpoint and frontend contracts remain unchanged', () => {
  for (const pathname of ['/admin/senior_outin_audit', '/admin/senior_outin_forgive']) {
    assert.ok(route.includes(pathname), `${pathname} must remain in the modular route`);
    assert.ok(ui.includes(pathname), `${pathname} must remain in the Senior Lunch frontend`);
    assert.ok(worker.includes(pathname), `${pathname} must remain physically available in legacy worker.js during bridge period`);
  }
  assert.match(ui, /application\/x-www-form-urlencoded;charset=UTF-8/);
  assert.match(ui, /new URLSearchParams\(\{ osis: code \}\)/);
});

test('Senior Lunch service retains existing roster, schedule, and state contracts', () => {
  assert.match(service, /ROSTER_KEY = 'roster_v1'/);
  assert.match(service, /BELL_KEY = 'bell_schedule_v1'/);
  assert.match(service, /CLASSES_KEY = 'student_classes_v1'/);
  assert.match(service, /ATT_CFG_KEY = 'att_cfg_v1'/);
  assert.match(service, /new Set\(\['LCH1', 'LCH2'\]\)/);
  assert.match(service, /senior_outin_penalty_pending/);
  assert.match(service, /senior_outin_last_violation_type/);
  assert.match(service, /senior_outin_last_forgiven_by/);
});

test('Senior Lunch extraction does not import the legacy monolith directly', () => {
  assert.doesNotMatch(route, /from\s+['"]\.\.\/worker\.js['"]/);
  assert.doesNotMatch(service, /from\s+['"]\.\.\/worker\.js['"]/);
});

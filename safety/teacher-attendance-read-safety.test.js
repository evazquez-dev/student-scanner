const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/teacher-attendance-read.js');
const service = read('cf-redcake/red-cake-77d5/src/services/teacher-attendance-read.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');

test('SAFETY: Teacher Attendance read paths are intercepted before legacy fallback', () => {
  assert.match(index, /TEACHER_ATTENDANCE_READ_PATHS\.has\(path\)/);
  assert.match(index, /handleTeacherAttendanceReadRequest\(req, env, ctx\)/);
  const interceptAt = index.indexOf('TEACHER_ATTENDANCE_READ_PATHS.has(path)');
  const fallbackAt = index.indexOf('return baseWorker.fetch(req, env, ctx)');
  assert.ok(interceptAt >= 0 && fallbackAt > interceptAt);
  for (const endpoint of ['/admin/teacher_att/options', '/admin/meeting/preview', '/admin/class_session/state']) {
    assert.match(route, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('SAFETY: read extraction is GET-only and does not capture Teacher Attendance mutations', () => {
  assert.match(route, /req\.method !== 'GET'\) return null/);
  for (const endpoint of ['/admin/teacher_att/submit', '/admin/class_session/toggle', '/admin/attendance/finalize_mid']) {
    assert.doesNotMatch(route, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(worker, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(service, /WORKER_PUSH_URL|pushFinalToGAS|override_batch|teacher_att\/submit/);
});

test('SAFETY: Teacher Attendance read module is independent of the legacy monolith', () => {
  assert.doesNotMatch(route, /worker\.js|baseWorker/);
  assert.doesNotMatch(service, /worker\.js|baseWorker/);
  assert.match(service, /studentViewOperationalDoName/);
  assert.match(service, /loadSupervisedLunchAssignments/);
});

test('SAFETY: legacy read blocks remain dormant for rollback during first smoke phase', () => {
  assert.match(worker, /path === "\/admin\/teacher_att\/options"/);
  assert.match(worker, /path === "\/admin\/meeting\/preview"/);
  assert.match(worker, /path === "\/admin\/class_session\/state"/);
});

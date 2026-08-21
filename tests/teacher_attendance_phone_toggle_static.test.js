const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const teacher = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/teacher_attendance.js'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');

test('Teacher Attendance behavior menu exposes state-aware phone controls', () => {
  assert.match(teacher, /PHONE_PASS_CONTEXT_ENDPOINT\s*=\s*'\/admin\/phone_pass\/context'/);
  assert.match(teacher, /PHONE_PASS_GRANT_ENDPOINT\s*=\s*'\/admin\/phone_pass\/grant'/);
  assert.match(teacher, /PHONE_PASS_SEND_BACK_ENDPOINT\s*=\s*'\/admin\/phone_pass\/send_to_return'/);
  assert.match(teacher, /Allow Phone Pickup/);
  assert.match(teacher, /Send Phone Back/);
  assert.match(teacher, /Return Requested/);
  assert.match(teacher, /source:\s*'teacher_attendance'/);
  assert.match(teacher, /loadSecretPhoneState_/);
});

test('Worker lets authenticated Teacher Attendance flow read phone state and grant/send-back without opening Phone Pass access', () => {
  assert.match(worker, /path === "\/admin\/phone_pass\/context"[\s\S]{0,550}requireAdminOrToken\(req, env\)/);
  assert.match(worker, /path === "\/admin\/phone_pass\/grant"[\s\S]{0,700}requestSource === "teacher_attendance"/);
  assert.match(worker, /viaTeacherAttendance[\s\S]{0,400}canGrantPhonePass_/);
  assert.match(worker, /path === "\/admin\/phone_pass\/send_to_return"[\s\S]{0,700}requestSource !== "teacher_attendance"/);
});

test('Teacher phone actions remain covered by View-as read-only enforcement and Ops-only final return', () => {
  assert.match(worker, /function enforceViewAsReadOnly_/);
  assert.match(worker, /error:\s*"view_as_read_only"/);
  assert.match(worker, /path === "\/admin\/phone_pass\/return"[\s\S]{0,250}requirePhonePassReturn_/);
});

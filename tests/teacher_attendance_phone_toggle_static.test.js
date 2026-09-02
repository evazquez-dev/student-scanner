const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const teacher = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/teacher_attendance.js'), 'utf8');
const route = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/phone-pass.js'), 'utf8');
const bridge = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/utils/admin-bridge.js'), 'utf8');

test('Teacher Attendance behavior menu exposes state-aware phone controls', () => {
  assert.match(teacher, /PHONE_PASS_CONTEXT_ENDPOINT\s*=\s*'\/admin\/phone_pass\/context'/);
  assert.match(teacher, /PHONE_PASS_GRANT_ENDPOINT\s*=\s*'\/admin\/phone_pass\/grant'/);
  assert.match(teacher, /PHONE_PASS_SEND_BACK_ENDPOINT\s*=\s*'\/admin\/phone_pass\/send_to_return'/);
  assert.match(teacher, /Send Student to Pick Up Phone/);
  assert.match(teacher, /Send Student to Return Phone/);
  assert.match(teacher, /Student Sent to Return Phone/);
  assert.match(teacher, /source:\s*'teacher_attendance'/);
  assert.match(teacher, /loadSecretPhoneState_/);
});

test('Modular Phone Pass lets authenticated Teacher Attendance flow read phone state and grant/send-back without standalone access', () => {
  assert.match(route, /path === '\/admin\/phone_pass\/context'/);
  assert.match(route, /any authenticated staff member/);
  assert.match(route, /requestSource === 'teacher_attendance'/);
  assert.match(route, /viaTeacherAttendance/);
  assert.match(route, /viaPhonePassPage/);
  assert.match(route, /!viaPhonePassPage/);
});

test('Teacher phone actions remain covered by View-as read-only enforcement and Ops-only final return', () => {
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(bridge, /error: 'view_as_read_only'/);
  assert.match(route, /path === '\/admin\/phone_pass\/return'/);
  assert.match(route, /canReturnPhonePass\(env, who\.email\)/);
});

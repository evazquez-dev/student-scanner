// EAGLENEST_STUDENT_LOOKUP_GRADES_ATTENDANCE_V1
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin/student_view.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'admin/student_lookup_grades_attendance.js'), 'utf8');

test('Student Lookup exposes a scoped Grades & Attendance tab', () => {
  assert.match(html, /id="tabGradesAttendance"/);
  assert.match(html, /data-tab="grades_attendance"/);
  assert.match(html, /id="panelGradesAttendance"/);
  assert.match(html, /Current course grades and current marking-period attendance/);
  assert.match(html, /student_lookup_grades_attendance\.js\?v=20261001-v1/);
});

test('Student Lookup reuses existing scoped academic endpoints', () => {
  assert.match(js, /\/admin\/grades\/student\?osis=/);
  assert.match(js, /\/admin\/grades\/attendance\/student\?osis=/);
  assert.match(js, /preset=marking_period/);
  assert.doesNotMatch(js, /school:all|group=school/);
});

test('Student Lookup preserves zero-as-not-entered grade display', () => {
  assert.match(js, /n !== 0 \? n : null/);
  assert.match(js, /Not entered/);
});

test('Student Lookup lazy-loads academic data and respects Grades permission', () => {
  assert.match(js, /tab\.addEventListener\('click', \(\) => load\(false\)\)/);
  assert.match(js, /access\?\.can\?\.grades === true/);
  assert.match(js, /student_out_of_scope/);
});

console.log('student_lookup_grades_attendance_static.test.js: PASS');

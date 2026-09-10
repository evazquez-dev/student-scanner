const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const html = read('student-scanner/admin/attendance_outreach.html');
const js = read('student-scanner/admin/attendance_outreach.js');
const nav = read('student-scanner/admin/nav.js');
const brand = read('student-scanner/admin/brand.js');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const access = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');

 test('Attendance Outreach is a dedicated branded navigation module', () => {
  assert.match(html, /data-module="attendance_outreach"/);
  assert.match(brand, /attendance_outreach:\s*'Attendance Outreach'/);
  assert.match(nav, /attendance_outreach\.html/);
  assert.match(nav, /morning calls/);
  assert.match(access, /attendance_outreach:\s*isAdminLike/);
});

test('Attendance Outreach reuses existing Contacts and Communications writes', () => {
  assert.match(js, /\/admin\/contacts\/student\?student_number=/);
  assert.match(js, /\/admin\/communications\/create/);
  assert.match(js, /category:\s*'Attendance'/);
  assert.match(js, /source:\s*'attendance_outreach'/);
  assert.match(html, /Save &amp; Next/);
  assert.match(js, /href=\"tel:/);
});

test('Attendance Outreach has a modular Worker route and does not write PowerSchool attendance', () => {
  assert.match(index, /ATTENDANCE_OUTREACH_PATHS/);
  assert.match(index, /handleAttendanceOutreachRequest/);
  assert.doesNotMatch(js, /attendance_change|excused_apply|PowerSchool/i);
});

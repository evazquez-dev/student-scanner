const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Office Staff allowlist is managed and exposed through access capabilities', () => {
  const session = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
  const service = read('cf-redcake/red-cake-77d5/src/services/access-management.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/access-management.js');
  assert.match(session, /OFFICE_STAFF_ALLOWLIST_KEY\s*=\s*'office_staff_allowlist_v1'/);
  assert.match(session, /office_staff:\s*canOfficeStaff/);
  assert.match(session, /attendance_outreach:\s*canOfficeStaff/);
  assert.match(session, /attendance_change:\s*canOfficeStaff/);
  assert.match(session, /early_dismissal_undo:\s*\(canHallway \|\| canOfficeStaff\)/);
  assert.match(service, /loadOfficeStaffEmails/);
  assert.match(route, /\/admin\/office_staff_allowlist/);
});

test('Office Staff does not inherit the whole-school Communications dashboard', () => {
  const session = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
  const dashboard = read('cf-redcake/red-cake-77d5/src/routes/communications-dashboard.js');
  assert.match(session, /communications:\s*isAdminLike \|\| !canOfficeStaff/);
  assert.match(dashboard, /if \(!access\?\.can\?\.communications\)/);
  assert.doesNotMatch(dashboard, /!access\?\.can\?\.communications && !access\?\.can\?\.student_contacts/);
});

test('Teacher Attendance presence exception endpoint and labels are present', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/teacher-attendance-read.js');
  const ui = read('student-scanner/admin/teacher_attendance.js');
  assert.match(route, /\/admin\/teacher_att\/presence_exceptions/);
  assert.match(route, /LEFT_EARLY|left_early/);
  assert.match(route, /missed_am_scan/);
  assert.match(route, /not_seen_today/);
  assert.match(ui, /LEFT EARLY/);
  assert.match(ui, /MISSED AM SCAN/);
  assert.match(ui, /NOT SEEN TODAY/);
});

test('Legacy attendance-change mutations are restricted to admin or Office Staff', () => {
  const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
  assert.match(worker, /OFFICE_STAFF_ALLOWLIST_KEY/);
  assert.match(worker, /isOfficeStaffEmail_/);
  assert.match(worker, /attendanceChangeAllowed_/);
  assert.match(worker, /\/admin\/excused\/apply/);
  assert.match(worker, /\/admin\/student\/reset_off_campus/);
});

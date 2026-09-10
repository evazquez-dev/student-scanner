const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const route = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/attendance-outreach.js'), 'utf8');
const service = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/attendance-outreach.js'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');

test('Attendance Outreach is admin-scoped and verification mutations retain origin/View-As guards', () => {
  assert.match(route, /attendance_outreach \|\| access\?\.can\?\.attendance_status \|\| isAdminLike/);
  assert.match(route, /mutationOriginAllowed\(req, env\)/);
  assert.match(route, /viewAsReadOnlyResponse\(accessResponse, access\)/);
});

test('office verification is stored separately and never mutates StudentLocation', () => {
  assert.match(service, /saveAttendanceOutreachVerification/);
  assert.match(service, /env\.ROSTER\.put\(attendanceOutreachVerificationKey/);
  assert.doesNotMatch(service, /STUDENT_LOC\.(put|delete)/);
  assert.doesNotMatch(route, /STUDENT_LOC\.(put|delete)/);
});

test('morning scans stamp durable morning-entry evidence for later outreach classification', () => {
  assert.match(worker, /morning_entry_date:\s*date/);
  assert.match(worker, /morning_entry_at:\s*whenISO/);
  assert.match(worker, /morning_entry_location:\s*location/);
});

test('live communication completion reads only Attendance-category records', () => {
  assert.match(route, /communication_dashboard_query/);
  assert.match(route, /toLowerCase\(\) === 'attendance'/);
  assert.match(route, /attendance_communications_truncated/);
});

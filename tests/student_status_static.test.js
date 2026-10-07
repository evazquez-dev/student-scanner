const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const read = (p) => fs.readFileSync(path.resolve(repo, p), 'utf8');

const route = read('cf-redcake/red-cake-77d5/src/routes/student-status.js');
const service = read('cf-redcake/red-cake-77d5/src/services/student-status.js');
const outreach = read('cf-redcake/red-cake-77d5/src/services/attendance-outreach.js');
const psSync = read('cf-redcake/red-cake-77d5/src/services/daily-attendance-powerschool-sync.js');
const gas = read('Google Apps Script/clasp-projects/daily-attendance/EagleNESTPowerSchoolSync.js');
const nav = read('student-scanner/admin/nav.js');
const page = read('student-scanner/admin/student_status.html');

test('daily suspensions are one-date-only and PowerSchool reminder is server enforced', () => {
  assert.match(route, /multi_day_not_supported/);
  assert.match(route, /powerschool_reminder_required/);
  assert.match(route, /powerschool_reminder_ack/);
  assert.match(service, /ALLOWED = new Set\(\['iss', 'oss'\]\)/);
  assert.match(page, /must also be entered in PowerSchool/i);
  assert.doesNotMatch(page, /start date|end date/i);
});

test('PowerSchool live daily status read is signed and authoritative', () => {
  assert.match(service, /powerschool_daily_status_read/);
  assert.match(service, /eaglenest-daily-ps-status-v1/);
  assert.match(gas, /powerschool_daily_status_read/);
  assert.match(gas, /readEagleNestDailyPsStatus_/);
  assert.match(route, /powerschool_suspension_conflict/);
  assert.match(route, /PowerSchool is authoritative/);
});

test('Attendance Outreach suppresses OSS but keeps ISS as context', () => {
  assert.match(outreach, /effective_status/);
  assert.match(outreach, /status = 'suspended'/);
  assert.match(outreach, /student_status/);
  assert.match(outreach, /suspended:/);
});

test('automatic PowerSchool reconciliation excludes daily suspension statuses', () => {
  assert.match(psSync, /loadDailyStudentStatusContext/);
  assert.match(psSync, /excluded\.push\(osis\)/);
});

test('shared navigation exposes Daily Suspensions through Attendance Outreach access', () => {
  assert.match(nav, /student_status/);
  assert.match(nav, /access_key:'attendance_outreach'/);
  assert.match(nav, /student_status\.html/);
});

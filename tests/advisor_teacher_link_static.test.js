const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('student scanner GAS reads and pushes StudentToAdvisorLink', () => {
  const gas = read('Google Apps Script/clasp-projects/student-scanner-gas/Code.js');
  assert.match(gas, /SHEET_ADVISOR_LINKS:\s*'StudentToAdvisorLink'/);
  assert.match(gas, /function readStudentToAdvisorLinks_\(/);
  assert.match(gas, /Teacher Name/);
  assert.match(gas, /Teacher Email/);
  assert.match(gas, /advisor_links:\s*advisorLinks\.links/);
  assert.match(gas, /advisor_links_meta/);
});

test('teacher attendance maps signed-in teacher email to advisor labels without guessing shared rooms', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/teacher-attendance-read.js');
  assert.match(service, /function advisorLinksForTeacher\(/);
  assert.match(service, /teacher_email/);
  assert.match(service, /function buildTeacherAdvisorUiMaps\(/);
  assert.match(service, /roomCandidates\.length === 1/);
  assert.match(service, /teacher_advisors_by_period/);
  assert.match(service, /teacher_advisor_to_room/);
  assert.match(service, /teacher_advisor_name/);

  const ui = read('student-scanner/admin/teacher_attendance.js');
  assert.match(ui, /teacher_advisors_by_period/);
  assert.match(ui, /qs\(\)\.get\('advisor'\)/);
});

test('My Schedule modular route enriches legacy class schedule with owned advisories', () => {
  const index = read('cf-redcake/red-cake-77d5/src/index.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/my-schedule.js');
  const ui = read('student-scanner/admin/my_schedule.js');
  assert.match(index, /MY_SCHEDULE_PATHS/);
  assert.match(index, /handleMyScheduleRequest/);
  assert.match(route, /baseWorker\.fetch/);
  assert.match(route, /teacher_advisors_by_period/);
  assert.match(route, /kind:\s*'advisory'/);
  assert.match(route, /teacher_mapping_ok = true/);
  assert.match(ui, /c\.kind==='advisory'/);
  assert.match(ui, /searchParams\.set\('advisor',advisor\)/);
});

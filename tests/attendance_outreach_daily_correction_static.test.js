const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const route = read('cf-redcake/red-cake-77d5/src/routes/attendance-outreach.js');
const correctionService = read('cf-redcake/red-cake-77d5/src/services/daily-attendance-corrections.js');
const scannerGas = read('Google Apps Script/clasp-projects/student-scanner-gas/Code.js');
const outreachUi = read('student-scanner/admin/attendance_outreach.js');
const outreachHtml = read('student-scanner/admin/attendance_outreach.html');
const scansUi = read('student-scanner/admin/student_scans.js');

test('Attendance Outreach verification applies canonical Daily Attendance Correction', () => {
  assert.match(route, /attendance_outreach_daily_correction/);
  assert.match(route, /corrected_when_iso/);
  assert.match(route, /todayPresenceEvidence/);
  assert.match(route, /recordDailyAttendanceCorrection/);
  assert.match(correctionService, /attendance_outreach_verification/);
  assert.match(correctionService, /reverseDailyAttendanceCorrection/);
});

test('Scanner GAS creates and reverses only the outreach compatibility scan', () => {
  assert.match(scannerGas, /applyAttendanceOutreachDailyCorrection_/);
  assert.match(scannerGas, /undoAttendanceOutreachDailyCorrection_/);
  assert.match(scannerGas, /rebuildAmAttOnlyForStudentDate_/);
  assert.match(scannerGas, /DAC\|/);
  assert.match(scannerGas, /attendance_outreach_verification/);
});

test('Office staff can edit the correction time before verification', () => {
  assert.match(outreachHtml, /id="verifyCorrectionTime"/);
  assert.match(outreachUi, /verifyCorrectionTime/);
  assert.match(outreachUi, /corrected_when_iso/);
  assert.match(outreachUi, /Daily Attendance set to/);
});

test('Reversed Daily Attendance Corrections are ignored by Student Scans', () => {
  assert.match(scansUi, /c\?\.active === false \|\| c\?\.reversed === true/);
});

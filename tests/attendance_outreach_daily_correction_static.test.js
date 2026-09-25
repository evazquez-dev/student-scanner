// EAGLENEST_D1_ONLY_OUTREACH_TEST_ESM_COMPAT_V1
import { createRequire as eagleCreateRequire } from 'node:module';
const require = eagleCreateRequire(import.meta.url);
import { fileURLToPath as eagleFileURLToPath } from 'node:url';
import { dirname as eagleDirname } from 'node:path';
const __dirname = eagleDirname(eagleFileURLToPath(import.meta.url));
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

test('Attendance Outreach records canonical correction and writes AM directly without Scans', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { strict: assert } = await import('node:assert');
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
  const route = readFileSync(resolve(root,
    'cf-redcake/red-cake-77d5/src/routes/attendance-outreach.js'), 'utf8');
  const scannerGas = readFileSync(resolve(root,
    'Google Apps Script/clasp-projects/student-scanner-gas/Code.js'), 'utf8');
  const bridge = readFileSync(resolve(root,
    'Google Apps Script/clasp-projects/student-scanner-gas/AMAttOnlyD1Bridge.js'), 'utf8');
  assert.match(route, /resolveAMRowFromD1/);
  assert.match(route, /action:\s*'am_att_only_direct_set'/);
  assert.match(route, /recordDailyAttendanceCorrection\(/);
  assert.match(route, /reverseDailyAttendanceCorrection\(/);
  assert.doesNotMatch(route, /action:\s*'attendance_outreach_daily_correction(?:_undo)?'/);
  assert.match(scannerGas, /action === 'am_att_only_direct_set'/);
  assert.match(bridge, /function d1AmHandleSet_\(/);
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

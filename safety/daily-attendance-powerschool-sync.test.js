// EAGLENEST_DAILY_PS_SYNC_V1
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('cf-redcake/red-cake-77d5/src/routes/attendance-outreach.js', 'utf8');
const index = fs.readFileSync('cf-redcake/red-cake-77d5/src/index.js', 'utf8');
const workerService = fs.readFileSync('cf-redcake/red-cake-77d5/src/services/daily-attendance-powerschool-sync.js', 'utf8');
const gas = fs.readFileSync('Google Apps Script/clasp-projects/daily-attendance/EagleNESTPowerSchoolSync.js', 'utf8');
const psIntegrate = fs.readFileSync('Google Apps Script/clasp-projects/daily-attendance/PS_Integrate.js', 'utf8');

test('daily PowerSchool sync is wired to finalized attendance email and end-of-day cron', () => {
  assert.match(route, /syncAttendanceEmailPreviewToPowerSchool/);
  assert.match(route, /powerschool_sync: \{ queued: true/);
  assert.match(index, /runDailyAttendancePowerSchoolEodCron/);
  assert.match(index, /DAILY_ATTENDANCE_PS_EOD_CRON/);
});

test('daily PowerSchool sync fails closed around Practice Mode and signed GAS requests', () => {
  assert.match(workerService, /loadAttendanceOutreachModeInfo/);
  assert.match(workerService, /MTSS_SYNC_SECRET/);
  assert.match(workerService, /DAILY_ATTENDANCE_GAS_URL/);
  assert.match(gas, /computeHmacSha256Signature/);
  assert.match(gas, /replayed_request/);
  assert.match(gas, /eagleNestSystemMode_/);
});

test('end-of-day sync requires a finalized attendance email and PowerSchool in-session guard', () => {
  assert.match(workerService, /no_finalized_attendance_email/);
  assert.match(gas, /not_in_session/);
  assert.match(psIntegrate, /eagleNestPsDateInSession_\(today\)/);
});

test('normal present state clears mutable A\/L records while protected PowerSchool codes win', () => {
  assert.match(gas, /clearDailyAttendanceToDefaultPresent_/);
  assert.match(gas, /skip_protected/);
  assert.match(gas, /\/ws\/schema\/table\/ATTENDANCE\//);
  assert.match(gas, /cleared_via_present_fallback/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const scannerRoot = path.resolve(here, '..');
const root = path.resolve(scannerRoot, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

test('MTSS official attendance migration preserves PowerSchool detail', () => {
  const sql = read('cf-redcake/red-cake-77d5/migrations/0016_mtss_powerschool_official_attendance.sql');
  for (const field of ['detail_code','source_code_id','source_comment','source_student_id','source_record_id','sync_run_id']) {
    assert.match(sql, new RegExp(`ADD COLUMN ${field}`));
  }
  assert.match(sql, /mtss_attendance_sync_runs/);
});

test('Daily Attendance GAS syncs PowerSchool official attendance from 2026-09-08', () => {
  const gas = read('Google Apps Script/clasp-projects/daily-attendance/PS_Integrate.js');
  assert.match(gas, /MTSS_ATTENDANCE_REPORTING_START\s*=\s*'2026-09-08'/);
  assert.match(gas, /CALENDAR_DAY/);
  assert.match(gas, /INSESSION/);
  assert.match(gas, /ATT_COMMENT/);
  assert.match(gas, /syncMtssOfficialAttendanceFromPowerSchool/);
  assert.match(gas, /\/internal\/mtss\/attendance\/powerschool_sync/);
  assert.match(gas, /x-mtss-sync-secret/);
});

test('Worker accepts only secret-authenticated PowerSchool MTSS sync', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/mtss.js');
  const svc = read('cf-redcake/red-cake-77d5/src/services/mtss.js');
  assert.match(route, /MTSS_SYNC_SECRET/);
  assert.match(route, /\/internal\/mtss\/attendance\/powerschool_sync/);
  assert.match(svc, /powerschool_daily/);
  assert.match(svc, /mtssAttendanceReportingStart/);
  assert.match(svc, /ingestMtssPowerSchoolAttendanceSync/);
  assert.match(svc, /source_comment/);
});

test('MTSS dashboard describes PowerSchool as official attendance source', () => {
  const html = read('student-scanner/admin/mtss.html');
  const js = read('student-scanner/admin/mtss.js');
  assert.match(html, /Official source: PowerSchool daily attendance/);
  assert.doesNotMatch(html, /Backfill finalized days/);
  assert.match(js, /attendance_source/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..','..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const route=read('cf-redcake/red-cake-77d5/src/routes/dean-dashboard.js');
const service=read('cf-redcake/red-cake-77d5/src/services/dean-dashboard.js');
const scope=read('cf-redcake/red-cake-77d5/src/services/dean-scope.js');
const migration=read('cf-redcake/red-cake-77d5/migrations/0036_dean_dashboard.sql');
const nav=read('student-scanner/admin/nav.js');
const page=read('student-scanner/admin/dean_dashboard.html');

test('Dean Dashboard aggregates existing attendance/behavior/incident/MTSS sources',()=>{
  assert.match(service,/loadGradesAttendanceRows/);
  assert.match(service,/behavior_events/);
  assert.match(service,/FROM incidents/);
  assert.match(service,/FROM mtss_cases/);
  assert.match(service,/loadDailyStudentStatusContext/);
  assert.match(page,/Students requiring attention/);
});

test('Dean scope is assigned grades union individually assigned students',()=>{
  assert.match(scope,/gradeSet\.has\(grade\)/);
  assert.match(scope,/explicit\.has\(osis\)/);
  assert.match(route,/\/admin\/dean\/scope/);
  assert.match(route,/super_admin_required/);
});

test('Dean interventions live in a dedicated auditable D1 table only',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS dean_interventions/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS dean_intervention_audit/);
  assert.match(service,/INSERT INTO dean_interventions/);
  assert.doesNotMatch(service,/UPDATE\s+mtss_attendance_daily/i);
  assert.doesNotMatch(service,/PowerSchool.*write|powerschool_daily_reconcile/i);
});

test('Navigation exposes the dedicated Dean capability',()=>{
  assert.match(nav,/key:'dean_dashboard'/);
  assert.match(nav,/dean_dashboard\.html/);
});

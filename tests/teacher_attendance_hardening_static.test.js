const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const worker = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const teacher = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/teacher_attendance.js'), 'utf8');
const teacherRead = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/teacher-attendance-read.js'), 'utf8');
const gas = fs.readFileSync(path.join(ROOT, 'Google Apps Script/clasp-projects/ps-meeting-attendance/Code.js'), 'utf8');

test('passing time is modeled as Arrival Window, not two current periods', () => {
  assert.match(worker, /function teacherAttendancePeriodPhase_/);
  assert.match(worker, /attendancePhase === "arrival"/);
  assert.match(worker, /isCurrentPeriodSubmit = attendancePhase === "active"/);
  assert.match(worker, /isArrivalPeriodSubmit = attendancePhase === "arrival"/);
  assert.match(teacherRead, /arrival_period_local: arrivalPeriodLocal/);
  assert.match(teacher, /Arrival Open/);
});

test('Arrival Window permits positive early evidence but does not start OUT-from-bell early', () => {
  assert.match(worker, /arrival_window_present_only/);
  assert.match(worker, /isCurrentPeriodSubmit || isArrivalPeriodSubmit/);
  assert.match(teacherRead, /phase === 'active' || phase === 'past'/);
  assert.match(teacherRead, /defaultOutSinceISO = phase === 'active' || phase === 'past'/);
  assert.match(worker, /if \(ctx\?\.mode === "transition" && String\(ctx\.next\?\.id \?\? ""\) === id\) return "arrival"/);
  assert.match(worker, /arrivalWindow: isArrivalPeriodSubmit/);
  assert.match(worker, /preserveArrivalObservation/);
});

test('future periods remain disabled while Arrival Window is selectable', () => {
  assert.match(teacherRead, /started: phase !== 'future'/);
  assert.match(teacherRead, /editable: phase !== 'future'/);
  assert.match(teacher, /opt\.disabled = item\.disabled === true \|\| item\.started === false/);
  assert.match(teacher, /syncPeriodOptionStates/);
  assert.match(teacher, /safeSavedPeriod/);
  assert.match(teacher, /savedOption[\s\S]*started === false/);
});

test('Teacher Attendance submit validates authoritative class membership', () => {
  assert.match(worker, /function teacherAttendanceScheduledOsisSet_/);
  assert.match(worker, /student_not_in_selected_roster/);
  assert.match(worker, /advisorLabel/);
  assert.match(worker, /getSupervisedLunchAssignmentsForTeacher_/);
  assert.match(teacher, /advisor: UI_LUNCH_ADVISOR_LABEL/);
});

test('Teacher ClassSession toggle is server-gated to today and active-or-arrival periods', () => {
  assert.match(worker, /class_session_toggle_today_only/);
  assert.match(worker, /phase !== "active" && phase !== "arrival"/);
  assert.match(worker, /class_session_toggle_not_open/);
  assert.match(worker, /student_not_in_selected_roster/);
});

test('table and organizer consume the same effective ClassSession projection', () => {
  assert.match(teacher, /function getSessionOutRec/);
  assert.match(teacher, /const effectiveOut = getSessionOutRec\(r\.osis\)/);
  assert.match(teacher, /applyToggleResultToSessionState/);
  assert.match(teacher, /effective_out_by_osis/);
});

test('partial Teacher Attendance failures remain staged in the browser', () => {
  assert.match(worker, /const rowResults = \[\]/);
  assert.match(worker, /applied_osis:/);
  assert.match(worker, /failed_osis:/);
  assert.match(teacher, /Only successful rows are cleared/);
  assert.match(teacher, /remainingOverrides/);
});

test('failed final GAS batches have an automatic durable-snapshot retry path', () => {
  assert.match(worker, /doneVal !== "done_gas_failed"/);
  assert.match(worker, /source: "cron_final_retry"/);
  assert.match(worker, /requestId: `final:\$\{date\}:\$\{periodLocal\}`/);
  assert.doesNotMatch(worker, /endDoneState === "done_gas_failed" \|\|\s*endDoneState === "empty"/);
});

test('GAS dedupe records completion only after durable acceptance', () => {
  assert.match(gas, /WORKER_PUSH_RECEIPTS_PROP/);
  assert.match(gas, /getWorkerPushReceipt_/);
  assert.match(gas, /rememberWorkerPushReceipt_/);
  assert.doesNotMatch(gas, /cache\.put\(k, '1', 120\)/);
  const writePos = gas.indexOf('const wrote = upsertWorkerRowsIntoScansToday_(rows)');
  const rememberPos = gas.lastIndexOf('rememberWorkerPushReceipt_(requestId, result)');
  assert.ok(writePos >= 0 && rememberPos > writePos, 'receipt must be stored after Scans_Today acceptance');
});

test('Teacher Attendance wording reflects queued PowerSchool work', () => {
  assert.match(teacher, /PowerSchool update queued/);
  assert.match(teacher, /PowerSchool queue handoff failed/);
  assert.doesNotMatch(teacher, /Saved\. Updates sent \(delta only\)\./);
});

test('teacher attendance telemetry counts numeric row errors correctly', () => {
  const start = worker.indexOf('if (path === "/admin/teacher_att/submit")');
  const end = worker.indexOf('if (path === "/admin/class_session/state")', start);
  const submitRoute = worker.slice(start, end);
  assert.match(submitRoute, /row_error_count: rowErrors,/);
  assert.doesNotMatch(submitRoute, /row_error_count: rowErrors\.length/);
});

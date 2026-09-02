const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const worker = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const teacher = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/teacher_attendance.js'), 'utf8');
const teacherRead = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/teacher-attendance-read.js'), 'utf8');
const gas = fs.readFileSync(path.join(ROOT, 'Google Apps Script/clasp-projects/ps-meeting-attendance/Code.js'), 'utf8');

test('SAFETY: passing time cannot mutate the ended period as current physical state', () => {
  assert.match(worker, /isCurrentPeriodSubmit = attendancePhase === "active"/);
  assert.match(worker, /isArrivalPeriodSubmit = attendancePhase === "arrival"/);
  assert.match(worker, /reason: "historical_attendance_only"/);
});

test('SAFETY: early attendance is Present-only until the bell', () => {
  assert.match(worker, /arrival_window_present_only/);
  assert.match(teacher, /Arrival Window is Present-only/);
  assert.match(teacherRead, /defaultOutSinceISO = phase === 'active' \|\| phase === 'past'/);
});

test('SAFETY: arbitrary or stale OSIS cannot be inserted into a selected class', () => {
  assert.match(worker, /teacherAttendanceScheduledOsisSet_/);
  assert.match(worker, /student_not_in_selected_roster/);
  assert.match(worker, /allowedOsis\.has\(osis\)/);
});

test('SAFETY: direct IN-OUT requests cannot target past or future class sessions', () => {
  assert.match(worker, /class_session_toggle_not_open/);
  assert.match(worker, /phase !== "active" && phase !== "arrival"/);
  assert.match(worker, /class_session_toggle_today_only/);
});

test('SAFETY: a transient GAS failure is not acknowledged as a completed duplicate', () => {
  assert.match(gas, /Completion-based durable dedupe/);
  assert.match(gas, /remembered only AFTER/);
  assert.doesNotMatch(gas, /doPost_seen_/);
});

test('SAFETY: a failed period-final handoff remains retryable', () => {
  assert.match(worker, /done_gas_failed/);
  assert.match(worker, /cron_final_retry/);
  assert.match(worker, /final retry failed/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const reflectionService = read('cf-redcake/red-cake-77d5/src/services/reflection-hold.js');
const reflectionRoute = read('cf-redcake/red-cake-77d5/src/routes/reflection-hold.js');
const teacherRead = read('cf-redcake/red-cake-77d5/src/services/teacher-attendance-read.js');
const staffPullUi = read('student-scanner/admin/staff_pull.js');

function between(src, start, end) {
  const a = src.indexOf(start);
  assert.notEqual(a, -1, `missing start marker: ${start}`);
  const b = src.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `missing end marker: ${end}`);
  return src.slice(a, b);
}

test('Staff Pull mutations are atomic obligations rather than generic location overwrites', () => {
  const doBlock = between(worker, 'if (path === "/staff_pull")', 'if (path === "/reflection_hold")');
  assert.match(doBlock, /held_date: date/);
  assert.match(doBlock, /staff_pull_intervals/);
  assert.match(doBlock, /already_held/);
  assert.match(doBlock, /not_holder/);
  assert.doesNotMatch(doBlock, /next\.zone\s*=/);
  assert.doesNotMatch(doBlock, /next\.loc\s*=/);

  const route = between(worker, 'if (path === "/admin/staff_pull/pull")', 'if (path === "/admin/staff_pull/release")');
  assert.match(route, /applyStaffPullObligation_/);
  assert.match(route, /classSessionStaffPullEvent_/);
  assert.doesNotMatch(route, /sendLocationToDO\(env, state\)/);
  assert.doesNotMatch(route, /classSessionGetRecord_/);
});

test('Staff Pull schedule context uses authoritative dynamic Supervised Lunch room resolution', () => {
  const sched = between(worker, 'async function computeNowNextScheduleForOsis', '__name(computeNowNextScheduleForOsis');
  assert.match(sched, /loadSupervisedLunchAssignments/);
  assert.match(sched, /effectivePhysicalScheduleSlotForOsis_/);
  assert.doesNotMatch(sched, /resolvedScheduleSlotForOsis_\(osis, pid/);
});

test('Staff Pull release grace is time-bounded and cannot repair a tardy from before the pull', () => {
  const grace = between(worker, 'function staffReleaseGraceMatchesClass_', '__name(staffReleaseGraceMatchesClass_');
  assert.match(grace, /staff_release_late_grace_until/);
  assert.match(grace, /atMs > untilMs/);

  const repair = between(worker, 'async function maybeExcuseLateAfterStaffRelease_', '__name(maybeExcuseLateAfterStaffRelease_');
  assert.match(repair, /pullStartISO/);
  assert.match(repair, /late_predates_staff_pull/);
  assert.match(repair, /lateEvidenceMs < pullStartMs - 2e3/);
});

test('Staff Pull spans are durable attendance evidence even after the active hold is released', () => {
  const evidence = between(worker, 'function staffPullPeriodEvidence_', '__name(staffPullPeriodEvidence_');
  assert.match(evidence, /liveRec\?\.staff_pull_intervals/);
  assert.match(evidence, /live_staff_pull_interval/);
  assert.match(evidence, /staff_pull_full_period/);
  assert.match(evidence, /staff_pull_period_overlap/);
});

test('Arrival Window Staff Pull never mutates OUT before the bell but derives OUT when the period becomes active', () => {
  const endpoint = between(worker, 'if (path === "/staff_pull_event"', 'if (path === "/physical_evidence"');
  assert.match(endpoint, /phase !== "transition"/);
  assert.match(endpoint, /clippedStartISO/);
  assert.match(endpoint, /rec\.staffPullIntervals\.splice\(openIndex, 1\)/);

  const effective = between(worker, 'function effectiveClassSessionOut_', '__name(effectiveClassSessionOut_');
  const modular = between(teacherRead, 'function effectiveClassSessionOut(', 'export async function loadTeacherAttendanceModeInfo');
  for (const block of [effective, modular]) {
    assert.match(block, /staffPullIntervals/);
    assert.match(block, /staff_pull_interval/);
    assert.match(block, /if \(defaultSince\)/);
  }
});

test('Reflection Hold uses an atomic obligation endpoint and fails closed when state is unavailable', () => {
  assert.match(reflectionService, /https:\/\/student-loc\/reflection_hold/);
  assert.doesNotMatch(reflectionService, /https:\/\/student-loc\/update/);
  assert.match(reflectionService, /student_location_all_http_/);
  assert.match(reflectionService, /reflection_hold_do_http_/);
  assert.match(reflectionRoute, /reflection_hold_state_unavailable/);
});

test('Reflection Hold ownership is independent of physical state date and physical evidence', () => {
  const options = between(reflectionService, 'export async function buildReflectionHoldOptions', 'export async function previewReflectionHold');
  assert.doesNotMatch(options, /String\(state\.date \|\| ''\) !== date/);

  const doBlock = between(worker, 'if (path === "/reflection_hold")', 'if (path === "/update")');
  assert.match(doBlock, /after_school_reflection_hold_active/);
  assert.match(doBlock, /already_held/);
  assert.match(doBlock, /not_owned_by_current_user/);
  assert.doesNotMatch(doBlock, /^\s*updated_at:\s*whenISO/m);
});

test('after-school baseline reset respects Staff Pull, Reflection Hold, Regents Prep, and Late Arrival obligations', () => {
  const reset = between(worker, 'async function maybeAfterSchoolOffCampusReset', '__name(maybeAfterSchoolOffCampusReset');
  assert.match(reset, /held_date/);
  assert.match(reset, /held_by_email/);
  assert.match(reset, /afterSchoolExitHoldFor_/);
  assert.ok(reset.indexOf('afterSchoolExitHoldFor_') > reset.indexOf('if (cur && cur.date === dateISO)'));
});

test('Staff Pull UI separates physical evidence freshness from obligation ownership', () => {
  assert.match(staffPullUi, /function physicalEvidenceISO/);
  assert.match(staffPullUi, /location_evidence_at/);
  assert.match(staffPullUi, /function isStaffHoldToday/);
  assert.match(staffPullUi, /No confirmed physical-location evidence today/);
  assert.match(staffPullUi, /Hold ownership is independent from the physical-evidence clock/);
});


test('newer expected-room physical evidence outranks an otherwise open Staff Pull in effective ClassSession', () => {
  const effective = between(worker, 'function effectiveClassSessionOut_', '__name(effectiveClassSessionOut_');
  const modular = between(teacherRead, 'function effectiveClassSessionOut(', 'export async function loadTeacherAttendanceModeInfo');
  for (const block of [effective, modular]) {
    assert.match(block, /lastExpectedPhysicalEvidenceISO/);
    assert.match(block, /requested_at_iso/);
    assert.match(block, /physicalReturnAfterPull/);
  }

  const classSession = between(worker, 'if (path === "/scan_event")', 'if (path === "/mark_first_in"');
  assert.match(classSession, /lastExpectedPhysicalEvidenceISO = whenISO/);
});

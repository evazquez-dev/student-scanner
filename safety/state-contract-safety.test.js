const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const worker = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const teacher = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/teacher_attendance.js'), 'utf8');
const teacherRead = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/teacher-attendance-read.js'), 'utf8');
const phone = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/phone-pass.js'), 'utf8');
const reflection = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/reflection-hold.js'), 'utf8');
const scanner = fs.readFileSync(path.join(ROOT, 'student-scanner/index.html'), 'utf8');

test('SAFETY: hold obligations cannot overwrite credible physical location', () => {
  const staffPull = worker.slice(
    worker.indexOf('if (path === "/staff_pull")'),
    worker.indexOf('if (path === "/reflection_hold")')
  );
  assert.match(staffPull, /state_zone: prev\.zone \|\| null/);
  assert.match(staffPull, /state_loc: prev\.loc \|\| null/);
  assert.doesNotMatch(staffPull, /next\.zone\s*=/);
  assert.doesNotMatch(staffPull, /next\.loc\s*=/);
  assert.doesNotMatch(worker, /zone: "hallway",\s*loc: "hallway",\s*source: "staff_release"/);
  assert.doesNotMatch(reflection, /legacyPatch = [\s\S]{0,80}zone: 'hallway'/);
  assert.match(worker, /With Staff: \$\{staffLabel\}/);
});

test('SAFETY: Teacher IN is intentional and future periods cannot be edited', () => {
  assert.match(teacher, /hasFirstIn/);
  assert.match(teacher, /Submit Present\/Late\/Excused Late first/);
  assert.match(teacher, /opt\.disabled = item\.disabled === true \|\| item\.started === false/);
  assert.match(worker, /error: "period_not_started_yet"/);
});

test('SAFETY: generic and test scanners cannot mutate production state', () => {
  assert.match(worker, /result_action: "test_scan"/);
  assert.match(worker, /result_action: "unconfigured_scan"/);
  assert.match(worker, /mode: "noop"/);
  assert.match(scanner, /SCANNER NOT CONFIGURED/);
  assert.match(scanner, /NO STATE CHANGE/);
});

test('SAFETY: denied lunch and blocked exit preserve physical hallway evidence', () => {
  assert.match(worker, /NOT ALLOWED — HALLWAY/);
  assert.match(worker, /DENIED EXIT/);
  assert.match(worker, /basePatch\("hallway", "hallway"/);
});

test('SAFETY: bathroom cross-location scans self-heal instead of rejecting newer evidence', () => {
  assert.match(worker, /auto_closed_previous_bathroom/);
  assert.match(worker, /Previous bathroom auto-closed/);
});

test('SAFETY: phone workflow separates sent-to-pickup from physical handoff', () => {
  assert.match(phone, /action = sentByTeacher \? 'send_to_pickup' : 'pickup'/);
  assert.match(phone, /location = sentByTeacher \? 'Hallway' : PHONE_LOCATION/);
  assert.match(phone, /PHONE_LOCATION/);
  assert.match(phone, /projectPhoneAwayEvidence/);
  assert.match(worker, /if \(path === "\/phone_pass"\)/);
});


test('SAFETY: LiveLocation uses a dedicated physical-evidence clock and rejects stale direct writers', () => {
  assert.match(worker, /function locationEvidenceTimestamp_/);
  assert.match(worker, /location_evidence_at/);
  assert.match(worker, /superseded_by_at: currentEvidenceAt/);
  assert.match(worker, /locationUpdateCarriesEvidence_/);
});

test('SAFETY: attendance history cannot backdate ClassSession physical state', () => {
  assert.match(worker, /ClassSession uses the actual staff[\s\S]{0,120}observation time instead/);
  assert.match(worker, /reason: "historical_attendance_only"/);
  assert.doesNotMatch(worker, /source: "teacher_override",\s*byEmail: who\.email \|\| ""\s*}\);[\s\S]{0,200}whenISO: scanISO \|\| whenISO/);
});

test('SAFETY: ClassSession toggle enforces first-in inside the Durable Object', () => {
  assert.match(worker, /if \(!rec\.firstInISO\) return jsonResponse\(\{ ok: false, error: "no_first_in", osis \}, 409\)/);
  assert.match(worker, /if \(data\.superseded\) return adminJson\(req, data, 200\)/);
});

test('SAFETY: effective OUT-from-bell semantics are server-owned', () => {
  assert.match(worker, /function effectiveClassSessionOut_/);
  assert.match(worker, /source: "derived_period_start"/);
  assert.match(worker, /data\.effective_out_by_osis/);
  assert.match(teacher, /LAST_SESSION_STATE\?\.effective_out_by_osis/);
  assert.match(teacher, /LAST_SESSION_STATE\?\.effective_default_out/);
  assert.match(teacherRead, /data\.effective_default_out = effectiveClassSessionOut\(null, defaultOutSinceISO\)/);
  assert.match(teacherRead, /data\.effective_out_by_osis\[osis\] = effectiveClassSessionOut\(rec, defaultOutSinceISO\)/);
  assert.match(teacherRead, /periodLocal\.toUpperCase\(\) === 'AFTER_SCHOOL'/);
});

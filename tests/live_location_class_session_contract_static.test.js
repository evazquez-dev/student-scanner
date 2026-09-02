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

test('LiveLocation remains physical while Staff Pull is an annotation/obligation', () => {
  assert.match(worker, /With Staff: \$\{staffLabel\}/);
  assert.doesNotMatch(worker, /zone: "hallway",\s*loc: "hallway",\s*source: "staff_release"/);
  const staffPull = worker.slice(
    worker.indexOf('if (path === "/staff_pull")'),
    worker.indexOf('if (path === "/reflection_hold")')
  );
  assert.match(staffPull, /state_zone: prev\.zone \|\| null/);
  assert.match(staffPull, /state_loc: prev\.loc \|\| null/);
  assert.doesNotMatch(staffPull, /next\.zone\s*=/);
  assert.doesNotMatch(staffPull, /next\.loc\s*=/);
  assert.doesNotMatch(reflection, /const legacyPatch = [^\n]+\? \{\s*zone: 'hallway'/s);
});

test('ClassSession derives OUT from the bell and Teacher IN stays intentional', () => {
  assert.match(teacher, /LAST_SESSION_STATE\?\.default_out_since_iso/);
  assert.match(teacher, /period_start_no_in/);
  assert.match(teacher, /const canToggle = allowOutIn && codeIsPL && hasFirstIn && !blocked/);
  assert.match(teacher, /Submit Present\/Late\/Excused Late first, or have the student scan the classroom kiosk/);
  assert.match(teacher, /opt\.disabled = item\.disabled === true \|\| item\.started === false/);
});

test('Holds do not disable teacher physical observations', () => {
  assert.match(teacher, /function zoneBlocksOutIn\(_zone\)[\s\S]*return false/);
});

test('authoritative scanner projection has explicit no-op/test, rear entrance, lunch-denied hallway and bathroom self-heal contracts', () => {
  assert.match(worker, /function scanEventIsCampusEntrance_/);
  assert.match(worker, /rear entrance|rear_entrance/i);
  assert.match(worker, /unconfigured_scan/);
  assert.match(worker, /SCANNER NOT CONFIGURED/);
  assert.match(worker, /test_scan/);
  assert.match(worker, /auto_closed_previous_bathroom/);
  assert.match(worker, /NOT ALLOWED — HALLWAY/);
  assert.match(worker, /projectClassSessionFromScanEvidence_/);
});

test('Phone Pass separates sent-to-pickup from physical pickup and both are student evidence', () => {
  assert.match(phone, /action = sentByTeacher \? 'send_to_pickup' : 'pickup'/);
  assert.match(phone, /location = sentByTeacher \? 'Hallway' : PHONE_LOCATION/);
  assert.match(phone, /https:\/\/student-loc\/phone_pass/);
  assert.match(worker, /physicalSource = "phone_pass_pickup"/);
  assert.match(worker, /targetLabel = "Cellphone Locker"/);
  assert.match(phone, /projectPhoneAwayEvidence/);
  assert.match(teacher, /Send Student to Pick Up Phone/);
  assert.match(teacher, /Send Student to Return Phone/);
});

test('Teacher Late preserves earlier real late scan evidence while teacher-only Late remains emulated', () => {
  assert.match(worker, /preservePhysicalLate/);
  assert.match(worker, /prev\?\.emulatedScan !== true/);
  assert.match(worker, /computeEmulatedScanISO/);
});


test('LiveLocation has one chronological physical-evidence clock across scanners and staff observations', () => {
  assert.match(worker, /function locationEvidenceTimestamp_/);
  assert.match(worker, /location_evidence_at/);
  assert.match(worker, /location_evidence_source/);
  assert.match(worker, /superseded_by_at: currentEvidenceAt/);
  assert.match(worker, /conservative migration barrier/);
});

test('Teacher Attendance keeps attendance scan time separate from ClassSession observation time', () => {
  assert.match(worker, /ClassSession uses the actual staff[\s\S]{0,120}observation time instead/);
  assert.match(worker, /observationISO: whenISO, attendanceScanISO: scanISO/);
  assert.match(worker, /reason: "historical_attendance_only"/);
});

test('ClassSession toggle rule is enforced in the Durable Object and stale toggles are superseded', () => {
  assert.match(worker, /if \(!rec\.firstInISO\) return jsonResponse\(\{ ok: false, error: "no_first_in", osis \}, 409\)/);
  assert.match(worker, /return jsonResponse\(\{ ok: true, osis, superseded: true, isOut:/);
  assert.match(worker, /const error = String\(data\?\.error \|\| "toggle_failed"\)/);
});

test('effective OUT-from-bell state is computed on the server and consumed by Teacher Attendance', () => {
  assert.match(worker, /function effectiveClassSessionOut_/);
  assert.match(worker, /source: "derived_period_start"/);
  assert.match(worker, /data\.effective_default_out = effectiveClassSessionOut_/);
  assert.match(worker, /data\.effective_out_by_osis\[osis\] = effectiveClassSessionOut_/);
  assert.match(teacher, /LAST_SESSION_STATE\?\.effective_out_by_osis\?\.\[key\]/);
  assert.match(teacher, /LAST_SESSION_STATE\?\.effective_default_out/);
  assert.match(teacherRead, /data\.effective_default_out = effectiveClassSessionOut\(null, defaultOutSinceISO\)/);
  assert.match(teacherRead, /data\.effective_out_by_osis\[osis\] = effectiveClassSessionOut\(rec, defaultOutSinceISO\)/);
  assert.match(teacherRead, /periodLocal\.toUpperCase\(\) === 'AFTER_SCHOOL'/);
});

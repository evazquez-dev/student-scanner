const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCANNER = path.resolve(__dirname, '..');
const ROOT = path.resolve(SCANNER, '..');
const phonePass = fs.readFileSync(path.join(SCANNER, 'admin/phone_pass.js'), 'utf8');
const phase3 = fs.readFileSync(path.join(SCANNER, 'admin/student_lookup_phase3.js'), 'utf8');
const teacher = fs.readFileSync(path.join(SCANNER, 'admin/teacher_attendance.js'), 'utf8');
const service = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/phone-pass.js'), 'utf8');

test('shared Phone Pass API projects effective locker assignment', () => {
  assert.match(service, /locker_number_effective/);
  assert.match(service, /locker_color_effective/);
  assert.match(service, /students\.push\(\{[\s\S]{0,350}locker_number_effective/);
  assert.match(service, /function publicPhoneRow[\s\S]{0,500}locker_color_effective/);
  assert.match(service, /roster:\s*rosterResponse\(roster\.byOSIS\[osis\]\)/);
});

test('dedicated Phone Pass UI shows locker location throughout the workflow', () => {
  assert.match(phonePass, /function lockerLabel/);
  assert.match(phonePass, /opt\.textContent = `\$\{s\.name\} — \$\{s\.osis\} — \$\{lockerLabel\(s\)\}`/);
  assert.match(phonePass, /\[lockerLabel\(s\), since, loc, requested\]/);
  assert.match(phonePass, /const lockerText = lockerLabel\(locker\)/);
  assert.match(phonePass, /\[lockerLabel\(s\), by \? `allowed by/);
});

test('Student Lookup phone action card shows locker location', () => {
  assert.match(phase3, /function phoneLockerLabel/);
  assert.match(phase3, /const locker = phoneLockerLabel\(data\?\.roster \|\| \{\}\)/);
  assert.match(phase3, /\[locker, since \? `Picked up/);
});

test('Teacher Attendance individual and bulk phone interactions show locker location', () => {
  assert.match(teacher, /function phoneLockerLabel_/);
  assert.match(teacher, /lockerColor:/);
  assert.match(teacher, /data\.roster \|\| null/);
  assert.match(teacher, /const lockerHtml/);
  assert.match(teacher, /phoneRosterByOsis: new Map\(\)/);
  assert.match(teacher, /locker:\s*phoneLockerLabel_\(phoneRoster\)/);
  assert.match(teacher, /escapeHtml_\(row\.locker\)/);
  assert.match(teacher, /lockerHint\.textContent = phoneLockerLabel_/);
});

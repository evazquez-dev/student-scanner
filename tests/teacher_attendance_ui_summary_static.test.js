const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/teacher_attendance.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/teacher_attendance.js'), 'utf8');

test('Teacher Attendance exposes roster and authoritative in-class counts', () => {
  assert.match(html, /id="rosterCountText"/);
  assert.match(html, /id="inClassCountText"/);
  assert.match(js, /function renderTeacherClassCounts/);
  assert.match(js, /LAST_SESSION_STATE_READY/);
  assert.match(js, /hasSessionFirstIn\(osis\) && !isStudentOut\(osis\)/);
  assert.match(js, /renderTeacherClassCounts\(\)/);
});

test('advisor-mode Teacher Attendance keeps the physical room visible', () => {
  assert.match(html, /id="physicalRoomField"/);
  assert.match(html, /id="physicalRoomText"/);
  assert.match(js, /function renderPhysicalRoomContext/);
  assert.match(js, /TEACHER_OPTS_CACHE\?\.advisor_to_room/);
  assert.match(js, /physicalRoomField\.hidden = !advisorMode/);
  assert.match(js, /renderPhysicalRoomContext\(\)/);
});

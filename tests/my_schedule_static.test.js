const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const adminSessionService = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');

test('My Schedule uses exact staff Teacher Assignments Match and daily teacher room-period data', () => {
  assert.match(worker, /async function buildMyScheduleState_/);
  assert.match(worker, /staff_mapping_by_email/);
  assert.match(worker, /teacher_assignment_match/);
  assert.match(worker, /by_room_period_section/);
  assert.match(worker, /schedule_stale/);
  assert.match(worker, /path === "\/admin\/my_schedule"/);
});

test('My Schedule page highlights current period and links directly to Teacher Attendance room and period', () => {
  const html = read('student-scanner/admin/my_schedule.html');
  const js = read('student-scanner/admin/my_schedule.js');
  const nav = read('student-scanner/admin/nav.js');
  const brand = read('student-scanner/admin/brand.js');
  assert.match(html, /data-module="my_schedule"/);
  assert.match(js, /\/admin\/my_schedule/);
  assert.match(js, /teacher_attendance\.html/);
  assert.match(js, /searchParams\.set\('room'/);
  assert.match(js, /searchParams\.set\('period'/);
  assert.match(js, /highlight_kind==='current'/);
  assert.match(js, /schedule_stale/);
  assert.match(nav, /my_schedule\.html/);
  assert.match(brand, /my_schedule:\s*'My Schedule'/);
});

test('My Schedule is available to regular staff and remains a live reference in Practice Mode', () => {
  assert.match(adminSessionService, /my_schedule:\s*true/);
  assert.match(worker, /practice:\s*isPracticeMode_\(env\)/);
  const nav = read('student-scanner/admin/nav.js');
  assert.match(nav, /my_schedule:\s*true/);
  assert.match(nav, /PRACTICE MODE/);
});

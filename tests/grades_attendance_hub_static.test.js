// EAGLENEST_GRADES_ATTENDANCE_HUB_V1
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(rel)=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const html=read('admin/grades.html');
const js=read('admin/grades.js');
const attendance=read('admin/grades_attendance.js');
const css=read('admin/grades.css');
const nav=read('admin/nav.js');
const brand=read('admin/brand.js');

test('Grades becomes Grades & Attendance with four data tabs and one shared student scope',()=>{
  assert.match(html,/Grades & Attendance/);
  assert.match(html,/data-ga-tab="overview"/);
  assert.match(html,/data-ga-tab="grades"/);
  assert.match(html,/data-ga-tab="daily"/);
  assert.match(html,/data-ga-tab="meeting"/);
  assert.match(js,/EagleNESTGradesPage/);
  assert.match(js,/scopeParams/);
  assert.match(attendance,/scopeParams\(\)/);
});

test('attendance window exposes marking period, YTD, rolling 5/10 school days, and custom range',()=>{
  assert.match(html,/value="marking_period"/);
  assert.match(html,/value="ytd"/);
  assert.match(html,/value="last_5_school_days"/);
  assert.match(html,/value="last_10_school_days"/);
  assert.match(html,/value="custom"/);
  assert.match(attendance,/attendanceWindowResolved/);
});

test('overview, daily attendance, and meeting attendance use read-only Grades attendance endpoints',()=>{
  assert.match(attendance,/\/admin\/grades\/attendance\/students/);
  assert.match(attendance,/\/admin\/grades\/attendance\/student/);
  assert.match(attendance,/\/admin\/grades\/students/);
  assert.doesNotMatch(attendance,/method\s*:\s*['"]POST['"]/);
});

test('student dialog contains Grades, Daily Attendance, and Meeting Attendance tabs',()=>{
  assert.match(html,/id="studentGradesPane"/);
  assert.match(html,/id="studentDailyPane"/);
  assert.match(html,/id="studentMeetingPane"/);
  assert.match(attendance,/renderStudentDaily/);
  assert.match(attendance,/renderStudentMeeting/);
  assert.match(attendance,/excluded for full-day absence/);
});

test('navigation and branding identify the combined hub',()=>{
  assert.match(nav,/Grades & Attendance/);
  assert.match(brand,/grades:\s*'Grades & Attendance'/);
  assert.match(css,/dataTabsCard|dataTabs/);
});

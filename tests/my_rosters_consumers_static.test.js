// EAGLENEST_MY_ROSTERS_CONSUMERS_V1
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(rel)=>fs.readFileSync(path.join(ROOT,rel),'utf8');

const gradesHtml=read('admin/grades.html');
const gradesJs=read('admin/grades.js');
const changeHtml=read('admin/attendance_change.html');
const changeJs=read('admin/attendance_change.js');
const freeHtml=read('admin/phone_free_pass.html');
const freeJs=read('admin/phone_free_pass.js');
const reflection=read('admin/reflection_saved_rosters.js');
const lunch=read('admin/supervised_lunch_saved_rosters.js');
const teacherAttendance=read('admin/teacher_attendance.js');
const esas=read('admin/esas.js');
const dow=read('admin/dreamer_of_week.js');
const injector=read('admin/scan_injector.js');

test('Grades exposes owned/shared My Rosters as reusable grade scopes',()=>{
  assert.match(gradesHtml,/id="rosterScopeCard"/);
  assert.match(gradesHtml,/My Rosters/);
  assert.match(gradesJs,/\/admin\/my_rosters/);
  assert.match(gradesJs,/roster_groups/);
  assert.match(gradesJs,/url\.searchParams\.append\('roster',row\.roster_ref\)/);
  assert.match(gradesJs,/Students outside your existing Grades permissions are excluded/);
});

test('Attendance Change can seed its existing arbitrary student selection from a roster without editing the source',()=>{
  assert.match(changeHtml,/id="myRosterSelect"/);
  assert.match(changeJs,/\/admin\/my_rosters\/detail/);
  assert.match(changeJs,/state\.selectedOsis=new Set/);
  assert.doesNotMatch(changeJs,/\/admin\/my_rosters['"]\s*,\s*\{method:\s*['"]POST/);
});

test('Free Phone Pass can seed its existing daily list builder from a roster without editing the source',()=>{
  assert.match(freeHtml,/id="myRosterSelect"/);
  assert.match(freeJs,/\/admin\/my_rosters\/detail/);
  assert.match(freeJs,/state\.selectedOsis=new Set/);
  assert.doesNotMatch(freeJs,/\/admin\/my_rosters['"]\s*,\s*\{method:\s*['"]POST/);
});

test('existing Reflection and Supervised Lunch roster consumers remain available',()=>{
  assert.match(reflection,/\/admin\/my_rosters\/detail/);
  assert.match(lunch,/\/admin\/my_rosters\/detail/);
});

test('authoritative operational rosters are not replaced by arbitrary My Rosters',()=>{
  assert.doesNotMatch(teacherAttendance,/\/admin\/my_rosters/);
  assert.doesNotMatch(esas,/\/admin\/my_rosters/);
  assert.doesNotMatch(dow,/\/admin\/my_rosters/);
  assert.doesNotMatch(injector,/\/admin\/my_rosters/);
});

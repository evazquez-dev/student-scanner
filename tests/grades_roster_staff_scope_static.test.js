// EAGLENEST_ROSTER_GRADES_ATTENDANCE_ACCESS_V1
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const html=read('admin/grades.html');
const grades=read('admin/grades.js');
const attendance=read('admin/grades_attendance.js');

test('Grades & Attendance explains roster-scoped access without implying whole-school visibility',()=>{
  assert.match(html,/staff explicitly listed in All HS Staff/);
  assert.match(html,/roster membership can include students outside their normal class\/advisory scope/);
  assert.match(html,/does not make the whole school visible/);
});

test('grade student detail carries selected My Roster refs back to the server',()=>{
  assert.match(grades,/const scope=gradesAttendanceScopeParams\(\);scope\.set\('osis',osis\)/);
  assert.match(grades,/\/admin\/grades\/student\?\$\{qs\}/);
  assert.match(grades,/\/admin\/grades\/student\/history\?\$\{qs\}/);
});

test('attendance student detail carries the same selected roster scope',()=>{
  assert.match(attendance,/const p=scopeParams\(\);p\.set\('osis',state\.studentOsis\)/);
  assert.match(attendance,/\/admin\/grades\/attendance\/student/);
});

// EAGLENEST_MY_ROSTER_SPECIAL_ACTIONS_V1
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const rosterHtml=read('admin/my_rosters.html');
const rosterJs=read('admin/my_rosters.js');
const teacherHtml=read('admin/teacher_attendance.html');
const teacherJs=read('admin/teacher_attendance.js');
const monitorHtml=read('admin/after_school_monitor.html');
const monitorJs=read('admin/after_school_monitor.js');

test('My Rosters exposes Special Actions with Club, Sports Team, and optional home room',()=>{
  assert.match(rosterHtml,/Special Actions/);
  assert.match(rosterHtml,/value="club"/);
  assert.match(rosterHtml,/value="sports_team"/);
  assert.match(rosterHtml,/specialActionHomeRoom/);
  assert.match(rosterJs,/special_action_type/);
  assert.match(rosterJs,/special_action_home_room/);
  assert.match(rosterJs,/published to the After-School activity picker/);
});

test('Teacher Attendance after-school mode separates Activity from optional Location',()=>{
  assert.match(teacherHtml,/id="afterSchoolActivityField"/);
  assert.match(teacherHtml,/id="afterSchoolActivityInput"/);
  assert.match(teacherHtml,/id="afterSchoolExtraSearch"/);
  assert.match(teacherJs,/\/admin\/after_school\/activities/);
  assert.match(teacherJs,/\/admin\/after_school\/activity\/start/);
  assert.match(teacherJs,/\/admin\/after_school\/activity\/sync/);
  assert.match(teacherJs,/\/admin\/after_school\/activity\/toggle/);
  assert.match(teacherJs,/General After-School/);
  assert.match(teacherJs,/No default location/);
});

test('activity attendance permits no room and extras do not edit the base My Roster',()=>{
  // General After-School still requires a room, but a selected activity is enough
  // to refresh/take attendance with no physical location.
  assert.match(teacherJs,/if\s*\(!room\s*&&\s*!activityId\)\s*return;/);
  // Room synchronization is optional and only runs when a room was actually chosen.
  assert.match(teacherJs,/if\s*\(room\)\s*await\s+syncAfterSchoolActivity/);
  assert.match(teacherJs,/Select an Activity to take attendance without a location/);
  assert.match(teacherJs,/Extra today/);
  assert.doesNotMatch(teacherJs,/custom_roster_students/);
  assert.doesNotMatch(teacherJs,/action:'save'.*my_rosters/s);
});

test('After-School Monitor shows Club and Sports Team activity context',()=>{
  assert.match(monitorHtml,/data-filter="club"/);
  assert.match(monitorHtml,/data-filter="sports_team"/);
  assert.match(monitorJs,/row\.activities/);
  assert.match(monitorJs,/Sports Team/);
});

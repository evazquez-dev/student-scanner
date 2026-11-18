// EAGLENEST_ENROLLMENT_AWARE_ATTENDANCE_V1
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const service=p=>read('cf-redcake/red-cake-77d5/src/services/'+p);

test('enrollment route is intercepted by Worker and restricted to Super Admin',()=>{
 const index=read('cf-redcake/red-cake-77d5/src/index.js');
 const route=read('cf-redcake/red-cake-77d5/src/routes/enrollment-attendance.js');
 assert.match(index,/ENROLLMENT_ATTENDANCE_PATHS\.has\(path\)/);
 assert.match(route,/access\.role!=='super_admin'/);
 assert.match(route,/mutationOriginAllowed/);
 assert.match(route,/viewAsReadOnlyResponse/);
 assert.match(route,/practice_mode_settings_write_blocked/);
 assert.match(route,/membershipMode:'off'/);
 assert.match(route,/membershipMode:'on'/);
});
test('Badge and shared Grades engine excludes only verified non-enrolled days',()=>{
 const badge=service('attendance-badge.js');
 const grades=service('grades-attendance.js');
 assert.match(badge,/membership_status_by_date\?\.\[date\]==='not_enrolled'/);
 assert.match(badge,/loadVerifiedEnrollmentMembership/);
 assert.match(grades,/previewAttendanceBadge/);
 assert.match(badge,/excluded_not_enrolled_dates/);
});
test('eligibility and MTSS consumers remain independent',()=>{
 const incentive=service('incentive-trips.js');
 const outside=service('outside-lunch.js');
 const mtss=service('mtss.js');
 assert.match(incentive,/enrollmentFeatureEnabled\(env,'incentive_trips'\)/);
 assert.match(outside,/enrollmentFeatureEnabled\(env,'outside_lunch_recess'\)/);
 assert.match(mtss,/enrollmentFeatureEnabled\(env,'mtss_streaks'\)/);
 assert.match(mtss,/loadVerifiedEnrollmentStreakBreaks/);
 assert.match(outside,/INSUFFICIENT_ENROLLMENT_HISTORY/);
});
test('system-admin control panel is independent of ordinary student pages',()=>{
 const page=read('student-scanner/admin/index.html');
 const ui=read('student-scanner/admin/enrollment_attendance_admin.js');
 assert.match(page,/enrollmentAttendanceAdminCard/);
 assert.match(ui,/enrollment_attendance\/settings/);
 assert.match(ui,/enrollment_attendance\/health/);
 assert.match(ui,/enrollment_attendance\/compare/);
});

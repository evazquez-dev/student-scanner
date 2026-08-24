const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nav = fs.readFileSync(path.join(root, 'admin/nav.js'), 'utf8');
const navCss = fs.readFileSync(path.join(root, 'admin/nav.css'), 'utf8');
const teacherAttendance = fs.readFileSync(path.join(root, 'admin/teacher_attendance.js'), 'utf8');

// The dedicated Phone Pass page is permission-filtered by the shared nav.
assert.match(nav, /key:'phone_pass'/);
assert.match(nav, /access\?\.can\?\.\[it\.key\]/);

// Teacher Attendance still owns the embedded phone controls, but the shared
// navigation stylesheet must hide the entire phone surface unless the same
// permission-filtered Phone Pass link is present.
assert.match(teacherAttendance, /data-act="phone"/);
assert.match(navCss, /body\[data-module="teacher_attendance"\]:not\(:has\(#ssNavDrawer \.ssNavLink\[href\$="phone_pass\.html"\]\)\) \[data-act="phone"\]/);
assert.match(navCss, /body\[data-module="teacher_attendance"\]:not\(:has\(#ssNavDrawer \.ssNavLink\[href\$="phone_pass\.html"\]\)\) \.phoneOutIcon/);
assert.match(navCss, /\[data-act="communication"\] \+ div/);
assert.match(navCss, /display:none !important/);

console.log('teacher_attendance_phone_permission_static.test.js: PASS');

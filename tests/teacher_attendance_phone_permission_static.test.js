const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nav = fs.readFileSync(path.join(root, 'admin/nav.js'), 'utf8');
const navCss = fs.readFileSync(path.join(root, 'admin/nav.css'), 'utf8');
const teacherAttendance = fs.readFileSync(path.join(root, 'admin/teacher_attendance.js'), 'utf8');

// The dedicated Phone Pass page remains permission-filtered by the shared nav.
assert.match(nav, /key:'phone_pass'/);
assert.match(nav, /access\?\.can\?\.\[it\.key\]/);

// Read-only phone status is operational context on Teacher Attendance and is
// visible to every Teacher Attendance user. Mutation controls remain gated.
assert.match(teacherAttendance, /data-act="phone"/);
assert.match(teacherAttendance, /className = 'phoneOutIcon'/);
assert.match(navCss, /not\(:has\(#ssNavDrawer \.ssNavLink\[href\$="phone_pass\.html"\]\)\) \[data-act="phone"\]/);
assert.doesNotMatch(
  navCss,
  /not\(:has\(#ssNavDrawer \.ssNavLink\[href\$="phone_pass\.html"\]\)\) \.phoneOutIcon/
);
assert.match(navCss, /\.phoneOutIcon::after\s*\{[\s\S]*content:"PHONE OUT"/);
assert.match(navCss, /\.phoneOutIcon\[aria-label\*="return requested"\]::after\s*\{[\s\S]*content:"RETURN REQUESTED"/);
assert.match(navCss, /:has\(\.phoneOutIcon:not\(\[hidden\]\)\) \.pill-row::after/);

console.log('teacher_attendance_phone_permission_static.test.js: PASS');

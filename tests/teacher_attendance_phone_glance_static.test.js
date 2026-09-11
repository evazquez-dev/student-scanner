const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const teacher = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/teacher_attendance.js'), 'utf8');
const navCss = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/nav.css'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');

test('Teacher Attendance carries live phone checkout state into roster rows', () => {
  assert.match(worker, /phone_out:\s*String\(s\.phone_state_date/);
  assert.match(worker, /phone_return_requested:/);
  assert.match(teacher, /const phoneOutActive = !!\(snap\?\.phone_out === true/);
  assert.match(teacher, /phoneOutActive,/);
  assert.match(teacher, /makePhoneIndicator_\(r\.osis, r\.phoneOutActive, r\.phoneReturnRequested\)/);
});

test('phone checkout is visible at a glance without granting Phone Pass mutation access', () => {
  assert.match(navCss, /content:"PHONE OUT"/);
  assert.match(navCss, /content:"RETURN REQUESTED"/);
  assert.match(navCss, /Phone Pass mutation controls remain permission-gated/);
  assert.match(navCss, /\[data-act="phone"\]\s*\{\s*display:none !important;/);
  assert.doesNotMatch(
    navCss,
    /not\(:has\(#ssNavDrawer \.ssNavLink\[href\$="phone_pass\.html"\]\)\) \.phoneOutIcon/
  );
});

test('Teacher Attendance raises a roster-level warning when any phone is out', () => {
  assert.match(navCss, /:has\(\.phoneOutIcon:not\(\[hidden\]\)\) \.pill-row::after/);
  assert.match(navCss, /content:"📱 Phone out in this roster"/);
});

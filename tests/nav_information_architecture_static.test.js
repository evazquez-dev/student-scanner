const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nav = fs.readFileSync(path.join(root, 'admin/nav.js'), 'utf8');
const brand = fs.readFileSync(path.join(root, 'admin/brand.js'), 'utf8');

for (const section of [
  'Attendance',
  'Student Information',
  'Student Support',
  'Recognition',
  'Movement & Operations',
  'Front Desk',
  'Account',
  'Administration'
]) {
  assert.match(nav, new RegExp(`title: '${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}'`), `Nav should contain ${section}`);
}

assert.doesNotMatch(nav, /title: 'Behavior And Admin'/, 'Behavior and administration should not share one catch-all section');
assert.doesNotMatch(nav, /title: 'Account & Device'/, 'Account settings now include more than device notifications');
assert.doesNotMatch(nav, /title: 'Passes'/, 'Movement workflows should be grouped by purpose rather than implementation');

assert.match(brand, /teacher_trace_lookup:\s*'Attendance Diagnostics'/);
assert.match(brand, /student_view:\s*'Student Snapshot'/);
assert.match(brand, /admin_roles:\s*'Roles & Access'/);
assert.match(brand, /admin:\s*'System Administration'/);
assert.match(brand, /notifications:\s*'My Settings'/);

const expectedBadges = [
  ['my_schedule', "today's classes"],
  ['teacher_attendance', 'class attendance'],
  ['attendance_status', 'period audit'],
  ['attendance_change', 'bulk changes'],
  ['student_view', 'location & attendance'],
  ['student_scans', 'scan & bathroom'],
  ['student_contacts', 'contacts & communication'],
  ['supervised_lunch', 'lunch assignments'],
  ['reflection_hold', 'after-school holds'],
  ['incident_creator', 'submit incident report'],
  ['behavior_history', 'review & edit logs'],
  ['dreamer_of_week', 'select recipients'],
  ['hallway', 'live locations'],
  ['staff_pull', 'pull & release'],
  ['phone_pass', 'grant & return'],
  ['senior_lunch_audit', 'lunch-out compliance'],
  ['after_school_monitor', 'attendance & holds'],
  ['visitor_desk', 'check-in & history'],
  ['early_dismissal', "today's dismissals"],
  ['notifications', 'alerts & links'],
  ['teacher_trace_lookup', 'submission traces'],
  ['contact_review', 'review suggestions'],
  ['fidelity_dashboard', 'historical fidelity'],
  ['admin_roles', 'permissions & access'],
  ['admin_dashboard', 'system configuration']
];

for (const [key, badge] of expectedBadges) {
  const escapedBadge = badge.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  assert.match(nav, new RegExp(`key:'${key}'[^\\n]+badge:["']${escapedBadge}["']`), `${key} should describe its user-facing purpose`);
}

console.log('nav_information_architecture_static.test.js: PASS');

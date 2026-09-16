const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nav = fs.readFileSync(path.join(root, 'admin/nav.js'), 'utf8');
const brand = fs.readFileSync(path.join(root, 'admin/brand.js'), 'utf8');

for (const section of [
  'Emergency',
  'Attendance & Today',
  'Students & Families',
  'Support & Culture',
  'Operations',
  'Administration'
]) {
  assert.match(
    nav,
    new RegExp(`title:\\s*'${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`),
    `Nav should contain ${section}`
  );
}

// Old catch-all / over-segmented section names should stay gone.
for (const oldTitle of [
  'Attendance',
  'Student Information',
  'Student Support',
  'Recognition',
  'Movement & Operations',
  'Front Desk',
  'Account',
  'Behavior And Admin',
  'Account & Device',
  'Passes'
]) {
  assert.doesNotMatch(
    nav,
    new RegExp(`title:\\s*'${oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`)
  );
}

// Core IA behavior.
assert.match(nav, /LS_SECTION_OPEN\s*=\s*'ss_nav_sections_open_v1'/);
assert.match(nav, /document\.createElement\('details'\)/);
assert.match(nav, /details\.open\s*=\s*sectionHasCurrent\s*\|\|\s*savedSectionOpen/);
assert.match(nav, /addEventListener\('toggle'/);
assert.match(nav, /details\.dataset\.sectionKey\s*=\s*'external_links'/);
assert.match(nav, /External Links/);

// Descriptors are retained as tooltips/accessibility text, not visible badges.
assert.match(nav, /a\.title\s*=\s*it\.description/);
assert.match(nav, /aria-label/);
assert.doesNotMatch(nav, /right\.className\s*=\s*'ssNavBadge'/);

// My Settings is a fixed footer destination instead of a full Account section.
assert.match(nav, /ssNavFooterLink/);
assert.match(nav, /MODULES\.notifications/);
assert.match(nav, /settingsLink\.href\s*=\s*'\.\/notifications\.html'/);

// Important page placements.
assert.match(nav, /section_key:\s*'support_culture'[\s\S]*key:'dreamer_of_week'/);
assert.match(nav, /section_key:\s*'operations'[\s\S]*key:'visitor_desk'/);
assert.match(nav, /section_key:\s*'operations'[\s\S]*key:'early_dismissal'/);
assert.match(nav, /section_key:\s*'administration'[\s\S]*key:'fidelity_dashboard'/);

// Refined page labels should match the pages' actual jobs.
assert.match(brand, /teacher_trace_lookup:\s*'Attendance Trace Lookup'/);
assert.match(brand, /student_view:\s*'Student Lookup'/);
assert.match(brand, /communications:\s*'Parent & Family Communications'/);
assert.match(brand, /mtss:\s*'MTSS Case Management'/);
assert.match(brand, /fidelity_dashboard:\s*'Operational Health'/);
assert.match(brand, /attendance_change:\s*'Attendance Corrections'/);
assert.match(brand, /admin_roles:\s*'Roles & Access'/);
assert.match(brand, /admin:\s*'System Administration'/);
assert.match(brand, /notifications:\s*'My Settings'/);

console.log('nav_information_architecture_static.test.js: PASS');

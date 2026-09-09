const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/coverage-planner.js');
const service = read('cf-redcake/red-cake-77d5/src/services/coverage-planner.js');
const access = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
const html = read('student-scanner/admin/coverage_planner.html');
const js = read('student-scanner/admin/coverage_planner.js');
const nav = read('student-scanner/admin/nav.js');
const brand = read('student-scanner/admin/brand.js');

test('Coverage Planner is a modular Admin feature routed through the Worker entry module', () => {
  assert.match(index,/COVERAGE_PLANNER_PATHS/);
  assert.match(index,/handleCoveragePlannerRequest/);
  assert.match(route,/\/admin\/coverage_planner/);
  assert.match(access,/coverage_planner: isAdminLike/);
  assert.match(nav,/key:'coverage_planner'/);
  assert.match(brand,/coverage_planner:\s*'Coverage Planner'/);
});

test('Coverage Planner reads the persistent daily Teacher Assignment and bell sources', () => {
  assert.match(service,/teacher_assignments_v1/);
  assert.match(service,/bell_schedule_v1/);
  assert.match(service,/academic_roster_v1/);
  assert.match(service,/by_room_period_section/);
  assert.match(service,/schedule_stale/);
});

test('Coverage Planner frontend supports multi-select, grade/department groups, print, and vacancy assignment selection', () => {
  assert.match(html,/Who is absent today\?/);
  assert.match(html,/vacancy_teacher/);
  assert.match(html,/Add a group/);
  assert.match(html,/Today’s Coverage Gaps/);
  assert.match(js,/SELECTED = new Set/);
  assert.match(js,/Grade Team/);
  assert.match(js,/Department/);
  assert.match(js,/window\.print\(\)/);
  assert.match(js,/\/admin\/coverage_planner/);
});

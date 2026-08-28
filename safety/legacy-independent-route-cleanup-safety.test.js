const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');

const REMOVED_INDEPENDENT_ROUTE_BLOCKS = [
  '/admin/session/login_google',
  '/admin/session/logout',
  '/admin/session/view_as',
  '/admin/view_as/staff',
  '/admin/session/check',
  '/admin/access',
  '/admin/admin_role_allowlist',
  '/admin/visitor_desk_allowlist',
  '/admin/permissions_overview',
  '/admin/staff_pull_roles',
  '/admin/hallway_group',
  '/admin/phone_pass_group',
  '/admin/academic_roster_source',
  '/admin/academic_roster_health',
  '/admin/academic_course_map',
  '/admin/academic_roster_rebuild',
  '/admin/dow/state',
  '/admin/dow/recipient',
  '/admin/dow/reset',
  '/admin/senior_outin_audit',
  '/admin/senior_outin_forgive',
  '/admin/roster/search',
  '/admin/supervised_lunch/options',
  '/admin/supervised_lunch/save',
  '/admin/reflection_hold/options',
  '/admin/reflection_hold/preview',
  '/admin/reflection_hold/confirm',
  '/admin/reflection_hold/update',
  '/admin/reflection_hold/release',
  '/admin/after_school_monitor',
  '/admin/student/dashboard',
  '/admin/roster_students',
  '/admin/scans_query'
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('SAFETY: fully modular independent endpoint blocks stay out of legacy worker.js', () => {
  for (const endpoint of REMOVED_INDEPENDENT_ROUTE_BLOCKS) {
    const routeBlock = new RegExp(`if\\s*\\(path\\s*===\\s*["']${escapeRegex(endpoint)}["']`);
    assert.doesNotMatch(worker, routeBlock, `legacy route block returned for ${endpoint}`);
  }
});

test('SAFETY: independent modular dispatch remains before legacy fallback', () => {
  for (const marker of [
    'ADMIN_SESSION_PATHS.has(path)',
    'ACCESS_MANAGEMENT_PATHS.has(path)',
    'ACADEMIC_ROSTER_PATHS.has(path)',
    'SENIOR_LUNCH_AUDIT_PATHS.has(path)',
    'SUPERVISED_LUNCH_PATHS.has(path)',
    'STUDENT_SCANS_PATHS.has(path)',
    'ROSTER_SEARCH_PATHS.has(path)',
    'STUDENT_VIEW_PATHS.has(path)',
    'REFLECTION_HOLD_PATHS.has(path)',
    'AFTER_SCHOOL_MONITOR_PATHS.has(path)',
    "path.startsWith('/admin/dow/')"
  ]) {
    assert.ok(index.includes(marker), `modular dispatch missing ${marker}`);
  }
  assert.match(index, /return baseWorker\.fetch\(req, env, ctx\)/);
});

test('SAFETY: this cleanup does not remove Teacher Attendance rollback or baseWorker-dependent surfaces', () => {
  for (const endpoint of ['/admin/teacher_att/options', '/admin/meeting/preview', '/admin/class_session/state']) {
    assert.match(worker, new RegExp(`if\\s*\\(path\\s*===\\s*"${escapeRegex(endpoint)}"`));
  }
  assert.match(worker, /path === "\/admin\/teacher_att\/submit"/);
  assert.match(worker, /path === "\/admin\/class_session\/toggle"/);
  assert.match(worker, /path === "\/admin\/early_dismissals"/);
});

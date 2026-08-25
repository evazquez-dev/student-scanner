const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('admin account/session/access layer is routed through modular source', () => {
  const entry = read('cf-redcake/red-cake-77d5/src/index.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/admin-session.js');
  const service = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
  const bridge = read('cf-redcake/red-cake-77d5/src/utils/admin-bridge.js');

  assert.match(entry, /from '\.\/routes\/admin-session\.js'/);
  assert.match(entry, /ADMIN_SESSION_PATHS/);
  for (const endpoint of [
    '/admin/session/login_google',
    '/admin/session/logout',
    '/admin/session/check',
    '/admin/session/view_as',
    '/admin/view_as/staff',
    '/admin/access'
  ]) {
    assert.match(entry, new RegExp(endpoint.replaceAll('/', '\\/')));
  }

  assert.match(route, /handleAdminSessionRequest/);
  assert.match(route, /createAdminSession/);
  assert.match(route, /resolveAdminRequest/);
  assert.match(route, /setAdminSessionViewAs/);
  assert.match(route, /buildAdminAccessData/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /x-admin-session/);
  assert.match(route, /SameSite=None/);

  assert.match(service, /verifyGoogleIdToken/);
  assert.match(service, /resolveAdminSessionBySid/);
  assert.match(service, /view_as_mode/);
  assert.match(service, /ADMIN_ROLE_ALLOWLIST_KEY\s*=\s*'admin_role_allowlist_v1'/);
  assert.match(service, /HALLWAY_MONITOR_KEY\s*=\s*'hallway_monitor_allowlist_v1'/);
  assert.match(service, /PHONE_PASS_GRANT_KEY\s*=\s*'phone_pass_grant_allowlist_v1'/);
  assert.match(service, /VISITOR_DESK_ALLOWLIST_KEY\s*=\s*'visitor_desk_allowlist_v1'/);
  assert.match(service, /ACADEMIC_ROSTER_KEY\s*=\s*'academic_roster_v1'/);

  // Extracted feature routes must no longer ask the legacy Worker to resolve
  // /admin/access. The bridge now resolves access directly from the service.
  assert.match(bridge, /from '\.\.\/services\/admin-session\.js'/);
  assert.match(bridge, /buildAdminAccessData\(req, env\)/);
  assert.doesNotMatch(bridge, /baseWorker\.fetch\(authReq/);
});

test('modular access payload retains the legacy permission surface', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
  for (const key of [
    'super_admin', 'admin', 'admin_dashboard', 'admin_roles', 'fidelity_dashboard',
    'senior_lunch_audit', 'hallway', 'after_school_monitor', 'staff_pull',
    'visitor_desk', 'phone_pass', 'phone_pass_grant', 'phone_pass_return',
    'early_dismissal', 'early_dismissal_undo', 'teacher_attendance', 'my_schedule',
    'supervised_lunch', 'reflection_hold', 'teacher_trace_lookup', 'attendance_status',
    'student_scans', 'student_view', 'student_contacts', 'communication_log',
    'contact_review', 'behavior_history', 'incident_creator', 'notifications',
    'dreamer_of_week', 'dow_manage', 'excused_apply', 'attendance_change'
  ]) {
    assert.match(service, new RegExp(`${key}:`));
  }
});

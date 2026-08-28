const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/access-management.js');
const service = read('cf-redcake/red-cake-77d5/src/services/access-management.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const rolesUi = read('student-scanner/admin/admin_roles.js');
const adminUi = read('student-scanner/admin/admin.js');

test('roles and permission-management endpoints are owned by the modular route before fallback', () => {
  assert.match(index, /from '\.\/routes\/access-management\.js'/);
  assert.match(index, /ACCESS_MANAGEMENT_PATHS\.has\(path\)/);
  assert.match(index, /handleAccessManagementRequest/);

  for (const pathname of [
    '/admin/admin_role_allowlist',
    '/admin/visitor_desk_allowlist',
    '/admin/permissions_overview',
    '/admin/staff_pull_roles',
    '/admin/hallway_group',
    '/admin/phone_pass_group'
  ]) {
    assert.ok(route.includes(pathname), `${pathname} must remain in the modular route contract`);
  }
  assert.match(route, /loadBaseAccess/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
});

test('access-management service owns permission KV writes and retains existing key contracts', () => {
  assert.match(service, /STAFF_PULL_ROLES_TS_KEY\s*=\s*'staff_pull_roles_v1_ts'/);
  assert.match(service, /HALLWAY_MONITOR_TS_KEY\s*=\s*'hallway_monitor_allowlist_v1_ts'/);
  assert.match(service, /PHONE_PASS_GRANT_TS_KEY\s*=\s*'phone_pass_grant_allowlist_v1_ts'/);
  assert.match(service, /VISITOR_DESK_ALLOWLIST_TS_KEY\s*=\s*'visitor_desk_allowlist_v1_ts'/);
  assert.match(service, /saveAdminRoleEmails/);
  assert.match(service, /saveVisitorDeskEmails/);
  assert.match(service, /saveHallwayMonitorEmails/);
  assert.match(service, /savePhonePassGrantGroup/);
  assert.match(service, /saveStaffPullRoles/);
  assert.match(service, /buildPermissionsOverview/);
});

test('Practice keeps control-plane permission data live but scopes permission-change audits', () => {
  assert.match(service, /const PRACTICE_KV_PREFIX = 'practice:v1:'/);
  assert.match(service, /const PRACTICE_KV_TTL_SEC = 36 \* 60 \* 60/);
  assert.match(service, /writeAccessManagementAudit/);
  assert.match(service, /practice \? `\$\{PRACTICE_KV_PREFIX\}\$\{date\}:\$\{liveKey\}` : liveKey/);
  assert.match(service, /practice \? \{ expirationTtl: PRACTICE_KV_TTL_SEC \} : undefined/);
});

test('existing Roles & Access and Super Admin frontend endpoint contracts remain unchanged', () => {
  assert.match(rolesUi, /\/admin\/permissions_overview/);
  assert.match(rolesUi, /\/admin\/admin_role_allowlist/);
  assert.match(rolesUi, /\/admin\/visitor_desk_allowlist/);
  assert.match(adminUi, /\/admin\/staff_pull_roles/);
});

test('legacy access-management route blocks stay removed after modular cleanup', () => {
  for (const pathname of [
    '/admin/admin_role_allowlist',
    '/admin/visitor_desk_allowlist',
    '/admin/permissions_overview',
    '/admin/staff_pull_roles',
    '/admin/hallway_group',
    '/admin/phone_pass_group'
  ]) {
    assert.ok(!worker.includes(`if (path === \"${pathname}\")`),
      `legacy worker route block returned for ${pathname}`);
  }
});

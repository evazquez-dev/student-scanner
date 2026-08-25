const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/access-management.js');
const service = read('cf-redcake/red-cake-77d5/src/services/access-management.js');
const session = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');

const ACCESS_ENDPOINTS = [
  '/admin/admin_role_allowlist',
  '/admin/visitor_desk_allowlist',
  '/admin/permissions_overview',
  '/admin/staff_pull_roles',
  '/admin/hallway_group',
  '/admin/phone_pass_group'
];

test('SAFETY: access management is intercepted before legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/access-management\.js'/);
  const guardPos = index.indexOf('ACCESS_MANAGEMENT_PATHS.has(path)');
  const fallbackPos = index.lastIndexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(guardPos >= 0, 'access-management route guard is missing');
  assert.ok(fallbackPos > guardPos, 'access-management route must execute before legacy fallback');
  assert.match(index, /handleAccessManagementRequest/);
});

test('SAFETY: all permission-management endpoint contracts remain present', () => {
  for (const pathname of ACCESS_ENDPOINTS) {
    assert.ok(route.includes(pathname), `missing access-management endpoint: ${pathname}`);
  }
  assert.match(route, /loadBaseAccess/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(route, /mutationOriginAllowed/);
});

test('SAFETY: human permission management stays Super Admin-only while trusted automation remains explicit', () => {
  assert.match(route, /function trustedAutomationOrSuperAdmin\(response, access\)/);
  assert.match(route, /access\?\._identity\?\.via === 'token'/);
  assert.match(route, /return superAdminOnly\(response, access\)/);

  const staffPullBlock = route.slice(route.indexOf('async function handleStaffPullRoles'), route.indexOf('async function handleHallwayGroup'));
  const hallwayBlock = route.slice(route.indexOf('async function handleHallwayGroup'), route.indexOf('async function handlePhonePassGroup'));
  const phoneBlock = route.slice(route.indexOf('async function handlePhonePassGroup'), route.indexOf('export async function handleAccessManagementRequest'));

  assert.match(staffPullBlock, /trustedAutomationOrSuperAdmin/);
  assert.match(hallwayBlock, /trustedAutomationOrSuperAdmin/);
  assert.match(phoneBlock, /trustedAutomationOrSuperAdmin/);

  const adminRoleBlock = route.slice(route.indexOf('async function handleAdminRoleAllowlist'), route.indexOf('async function handleVisitorDeskAllowlist'));
  const visitorBlock = route.slice(route.indexOf('async function handleVisitorDeskAllowlist'), route.indexOf('async function handlePermissionsOverview'));
  const overviewBlock = route.slice(route.indexOf('async function handlePermissionsOverview'), route.indexOf('async function handleStaffPullRoles'));

  assert.match(adminRoleBlock, /superAdminOnly/);
  assert.match(visitorBlock, /superAdminOnly/);
  assert.match(overviewBlock, /superAdminOnly/);
  assert.doesNotMatch(adminRoleBlock, /trustedAutomationOrSuperAdmin/);
  assert.doesNotMatch(visitorBlock, /trustedAutomationOrSuperAdmin/);
});

test('SAFETY: access management writes the same KV contracts consumed by admin-session', () => {
  for (const key of [
    'admin_role_allowlist_v1',
    'staff_pull_roles_v1',
    'hallway_monitor_allowlist_v1',
    'phone_pass_grant_allowlist_v1',
    'visitor_desk_allowlist_v1'
  ]) {
    assert.ok(session.includes(key), `admin-session must continue consuming ${key}`);
  }

  assert.match(service, /ADMIN_ROLE_ALLOWLIST_KEY/);
  assert.match(service, /STAFF_PULL_ROLES_KEY/);
  assert.match(service, /HALLWAY_MONITOR_KEY/);
  assert.match(service, /PHONE_PASS_GRANT_KEY/);
  assert.match(service, /VISITOR_DESK_ALLOWLIST_KEY/);
});

test('SAFETY: permission configuration remains live while permission-change audit supports Practice isolation', () => {
  assert.match(service, /writeAccessManagementAudit/);
  assert.match(service, /const PRACTICE_KV_PREFIX = 'practice:v1:'/);
  assert.match(service, /const PRACTICE_KV_TTL_SEC = 36 \* 60 \* 60/);
  assert.doesNotMatch(service, /`practice:v1:[^`]*admin_role_allowlist_v1/);
  assert.doesNotMatch(service, /`practice:v1:[^`]*visitor_desk_allowlist_v1/);
});

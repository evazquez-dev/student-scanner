const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
const serviceUrl = pathToFileURL(path.join(root, 'cf-redcake/red-cake-77d5/src/services/admin-session.js')).href;
const routeUrl = pathToFileURL(path.join(root, 'cf-redcake/red-cake-77d5/src/routes/admin-session.js')).href;

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  }
  async get(key, options) {
    const raw = this.map.get(String(key));
    if (raw == null) return null;
    if (options?.type === 'json') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  }
  async put(key, value) {
    this.map.set(String(key), String(value));
  }
  async delete(key) {
    this.map.delete(String(key));
  }
}

function req(pathname, { method = 'GET', sid = '', cookie = '', token = '', origin = '', body = null } = {}) {
  const headers = new Headers();
  if (sid) headers.set('x-admin-session', sid);
  if (cookie) headers.set('cookie', cookie);
  if (token) headers.set('x-admin-token', token);
  if (origin) headers.set('origin', origin);
  if (body != null) headers.set('content-type', 'application/json');
  return new Request(`https://worker.example${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
}

function seed() {
  const exp = Date.now() + 60 * 60 * 1000;
  return {
    'system:mode:v1': { mode: 'live' },
    'admin:sessions:teacher-sid': { email: 'teacher@school.org', role: 'editor', exp },
    'admin:sessions:super-sid': { email: 'boss@school.org', role: 'super_admin', exp },
    'admin_role_allowlist_v1': { emails: ['admin@school.org'] },
    'hallway_monitor_allowlist_v1': { emails: ['teacher@school.org'] },
    'phone_pass_grant_allowlist_v1': { emails: ['teacher@school.org'] },
    'visitor_desk_allowlist_v1': { emails: ['visitor@school.org'] },
    'staff_pull_roles_v1': { roles: { 'teacher@school.org': { title: 'Counselor', active: true } } },
    'external_nav_links_v1': { links: [{ label: 'Default Tool', url: 'https://example.org/default' }] },
    'user_external_links_v1:teacher@school.org': {
      show_defaults: true,
      links: [{ label: 'Personal Tool', url: 'https://example.org/personal' }]
    },
    'academic_roster_v1': {
      staff_mapping_by_email: {
        'teacher@school.org': { email: 'teacher@school.org', name: 'Teacher One', teacher_assignment_match: 'Teacher One', status: 'ok' },
        'admin@school.org': { email: 'admin@school.org', name: 'Admin One', teacher_assignment_match: '', status: 'not_assigned' },
        'boss@school.org': { email: 'boss@school.org', name: 'Boss One', teacher_assignment_match: '', status: 'not_assigned' }
      }
    }
  };
}

async function modules() {
  const nonce = `${Date.now()}-${Math.random()}`;
  const service = await import(`${serviceUrl}?v=${nonce}`);
  const route = await import(`${routeUrl}?v=${nonce}`);
  return { service, route };
}

test('editor access retains Hallway, Staff Pull and Phone Pass capability logic', async () => {
  const { service } = await modules();
  const env = { ROSTER: new FakeKV(seed()), ADMIN_ALLOWLIST: 'boss@school.org', ADMIN_TOKEN: 'internal-token' };
  const access = await service.buildAdminAccessData(req('/admin/access', { sid: 'teacher-sid' }), env);

  assert.equal(access.ok, true);
  assert.equal(access.email, 'teacher@school.org');
  assert.equal(access.role, 'editor');
  assert.equal(access.can.admin, false);
  assert.equal(access.can.hallway, true);
  assert.equal(access.can.staff_pull, true);
  assert.equal(access.can.phone_pass, true);
  assert.equal(access.can.phone_pass_grant, true);
  assert.equal(access.can.phone_pass_return, true);
  assert.equal(access.can.visitor_desk, false);
  assert.equal(access.can.teacher_attendance, true);
  assert.equal(access.can.student_view, false);
});

test('x-admin-session fallback wins and cookie fallback still works', async () => {
  const { service } = await modules();
  const env = { ROSTER: new FakeKV(seed()), ADMIN_ALLOWLIST: 'boss@school.org' };

  const byHeader = await service.resolveAdminRequest(req('/admin/access', { sid: 'teacher-sid' }), env);
  assert.equal(byHeader.ok, true);
  assert.equal(byHeader.via, 'header');

  const byCookie = await service.resolveAdminRequest(req('/admin/access', { cookie: 'adm_sess=teacher-sid' }), env);
  assert.equal(byCookie.ok, true);
  assert.equal(byCookie.via, 'session');
});

test('View-as preserves actor identity but applies target role and permissions read-only', async () => {
  const { service } = await modules();
  const data = seed();
  data['admin:sessions:super-sid'].view_as_email = 'teacher@school.org';
  const env = { ROSTER: new FakeKV(data), ADMIN_ALLOWLIST: 'boss@school.org' };

  const access = await service.buildAdminAccessData(req('/admin/access', { sid: 'super-sid' }), env);
  assert.equal(access.ok, true);
  assert.equal(access.email, 'teacher@school.org');
  assert.equal(access.role, 'editor');
  assert.equal(access.actor_email, 'boss@school.org');
  assert.equal(access.actor_role, 'super_admin');
  assert.equal(access.view_as.active, true);
  assert.equal(access.view_as.read_only, true);
  assert.equal(access.can.super_admin, false);
  assert.equal(access.can.admin, false);
  assert.equal(access.can.student_view, false);
});

test('modular /admin/access merges default and personal external links', async () => {
  const { route } = await modules();
  const env = {
    ROSTER: new FakeKV(seed()),
    ADMIN_ALLOWLIST: 'boss@school.org',
    ORIGIN_OK: 'https://app.example'
  };
  const response = await route.handleAdminSessionRequest(req('/admin/access', { sid: 'teacher-sid', origin: 'https://app.example' }), env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.example');
  assert.equal(data.external_links.length, 2);
  assert.equal(data.default_external_links.length, 1);
  assert.equal(data.personal_external_links.length, 1);
  assert.equal(data.show_default_external_links, true);
});

test('super admin can enter and exit View-as using the modular session route', async () => {
  const { route } = await modules();
  const store = new FakeKV(seed());
  const env = { ROSTER: store, ADMIN_ALLOWLIST: 'boss@school.org', ORIGIN_OK: 'https://app.example' };

  let response = await route.handleAdminSessionRequest(req('/admin/session/view_as', {
    method: 'POST', sid: 'super-sid', origin: 'https://app.example', body: { email: 'teacher@school.org' }
  }), env);
  let data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.view_as.active, true);
  assert.equal(data.email, 'teacher@school.org');

  let stored = await store.get('admin:sessions:super-sid', { type: 'json' });
  assert.equal(stored.view_as_email, 'teacher@school.org');

  response = await route.handleAdminSessionRequest(req('/admin/session/view_as', {
    method: 'POST', sid: 'super-sid', origin: 'https://app.example', body: { email: '' }
  }), env);
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.view_as.active, false);

  stored = await store.get('admin:sessions:super-sid', { type: 'json' });
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'view_as_email'), false);
});

test('View-as audit stays Practice-scoped while session state stays live', async () => {
  const { route } = await modules();
  const data = seed();
  data['system:mode:v1'] = { mode: 'practice' };
  const store = new FakeKV(data);
  const env = { ROSTER: store, ADMIN_ALLOWLIST: 'boss@school.org', ORIGIN_OK: 'https://app.example' };

  const response = await route.handleAdminSessionRequest(req('/admin/session/view_as', {
    method: 'POST', sid: 'super-sid', origin: 'https://app.example', body: { email: 'teacher@school.org' }
  }), env);
  assert.equal(response.status, 200);

  const session = await store.get('admin:sessions:super-sid', { type: 'json' });
  assert.equal(session.view_as_email, 'teacher@school.org');

  const auditKeys = Array.from(store.map.keys()).filter((key) => key.includes(':audit:'));
  assert.equal(auditKeys.length, 1);
  assert.match(auditKeys[0], /^practice:v1:\d{4}-\d{2}-\d{2}:audit:/);
  const audit = await store.get(auditKeys[0], { type: 'json' });
  assert.equal(audit.practice, true);
  assert.equal(audit.action, 'view_as_teacher_start');
});

test('admin token retains legacy admin identity and access level', async () => {
  const { service } = await modules();
  const env = { ROSTER: new FakeKV(seed()), ADMIN_TOKEN: 'internal-token' };
  const access = await service.buildAdminAccessData(req('/admin/access', { token: 'internal-token' }), env);
  assert.equal(access.ok, true);
  assert.equal(access.email, 'token@internal');
  assert.equal(access.role, 'admin');
  assert.equal(access.can.admin, true);
  assert.equal(access.can.super_admin, false);
});

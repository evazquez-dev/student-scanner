const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const routeUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/access-management.js')).href;
const serviceUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/access-management.js')).href;

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [
      String(key),
      typeof value === 'string' ? value : JSON.stringify(value)
    ]));
    this.puts = [];
  }

  async get(key, options) {
    const raw = this.map.get(String(key));
    if (raw == null) return null;
    if (options?.type === 'json') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  }

  async put(key, value, options) {
    this.map.set(String(key), String(value));
    this.puts.push({ key: String(key), value: String(value), options: options || null });
  }

  async delete(key) {
    this.map.delete(String(key));
  }

  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const names = Array.from(this.map.keys()).filter((key) => key.startsWith(String(prefix))).sort();
    const start = cursor ? Number(cursor) || 0 : 0;
    const slice = names.slice(start, start + limit);
    const next = start + slice.length;
    return {
      keys: slice.map((name) => ({ name })),
      list_complete: next >= names.length,
      cursor: next < names.length ? String(next) : undefined
    };
  }
}

async function modules() {
  const nonce = `${Date.now()}-${Math.random()}`;
  return {
    route: await import(`${routeUrl}?v=${nonce}`),
    service: await import(`${serviceUrl}?v=${nonce}`)
  };
}

function seedKv(extra = {}) {
  const exp = Date.now() + 60 * 60 * 1000;
  return new FakeKV({
    'admin:sessions:super': { email: 'boss@school.org', role: 'super_admin', exp },
    'admin:sessions:admin': { email: 'admin@school.org', role: 'admin', exp },
    'admin:sessions:editor': { email: 'teacher@school.org', role: 'editor', exp },
    'admin:sessions:view': {
      email: 'boss@school.org',
      role: 'super_admin',
      view_as_email: 'teacher@school.org',
      exp
    },
    academic_roster_v1: {
      staff_mapping_by_email: {
        'teacher@school.org': {
          email: 'teacher@school.org',
          name: 'Teacher One',
          teacher_assignment_match: 'TeacherOne',
          status: 'ok'
        }
      }
    },
    ...extra
  });
}

function envFor(kv, extra = {}) {
  return {
    ROSTER: kv,
    ADMIN_ALLOWLIST: 'boss@school.org',
    ADMIN_TOKEN: 'internal-secret',
    ORIGIN_OK: 'https://app.example',
    ...extra
  };
}

function request(pathname, { sid = 'super', method = 'GET', body, token, origin = 'https://app.example' } = {}) {
  const headers = new Headers();
  if (sid) headers.set('x-admin-session', sid);
  if (token) headers.set('x-admin-token', token);
  if (origin) headers.set('origin', origin);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`https://worker.example${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function json(response) {
  return response.json();
}

test('permissions overview remains Super Admin-only and preserves the combined sorted view', async () => {
  const { route } = await modules();
  const kv = seedKv({
    admin_role_allowlist_v1: { emails: ['zadmin@school.org', 'aadmin@school.org'] },
    hallway_monitor_allowlist_v1: { emails: ['z@school.org', 'a@school.org', 'a@school.org'] },
    phone_pass_grant_allowlist_v1: { emails: ['p2@school.org', 'p1@school.org'] },
    visitor_desk_allowlist_v1: { emails: ['v2@school.org', 'v1@school.org'] },
    staff_pull_roles_v1: {
      roles: {
        'z@school.org': { title: 'Counselor', active: true },
        'a@school.org': { title: 'AP', active: true },
        'off@school.org': { title: 'Inactive', active: false }
      }
    }
  });
  const env = envFor(kv);

  let response = await route.handleAccessManagementRequest(
    request('/admin/permissions_overview', { sid: 'admin' }), env, {}
  );
  assert.equal(response.status, 403);

  response = await route.handleAccessManagementRequest(
    request('/admin/permissions_overview'), env, {}
  );
  const data = await json(response);
  assert.equal(response.status, 200);
  assert.deepEqual(data.super_admins, ['boss@school.org']);
  assert.deepEqual(data.admins, ['aadmin@school.org', 'zadmin@school.org']);
  assert.deepEqual(data.hallway_monitors, ['a@school.org', 'z@school.org']);
  assert.deepEqual(data.phone_pass_grant, ['p1@school.org', 'p2@school.org']);
  assert.deepEqual(data.visitor_desk, ['v1@school.org', 'v2@school.org']);
  assert.deepEqual(data.staff_pull_roles, [
    { email: 'a@school.org', title: 'AP', active: true },
    { email: 'z@school.org', title: 'Counselor', active: true }
  ]);
});

test('Admin-role and Visitor Desk management remain human Super Admin-only', async () => {
  const { route } = await modules();
  const kv = seedKv();
  const env = envFor(kv);

  for (const pathname of ['/admin/admin_role_allowlist', '/admin/visitor_desk_allowlist']) {
    let response = await route.handleAccessManagementRequest(
      request(pathname, { sid: 'admin' }), env, {}
    );
    assert.equal(response.status, 403, `${pathname} admin GET`);

    response = await route.handleAccessManagementRequest(
      request(pathname, { sid: 'admin', method: 'POST', body: { emails: ['new@school.org'] } }), env, {}
    );
    assert.equal(response.status, 403, `${pathname} admin POST`);

    response = await route.handleAccessManagementRequest(
      request(pathname, { sid: null, token: 'internal-secret', origin: '' }), env, {}
    );
    assert.equal(response.status, 403, `${pathname} token GET`);
  }

  let response = await route.handleAccessManagementRequest(
    request('/admin/admin_role_allowlist', {
      method: 'POST', body: { emails: ['B@school.org', 'a@school.org', 'b@school.org'] }
    }), env, {}
  );
  let data = await json(response);
  assert.equal(response.status, 200);
  assert.deepEqual(data.emails, ['b@school.org', 'a@school.org']);
  assert.equal(data.count, 2);

  response = await route.handleAccessManagementRequest(
    request('/admin/visitor_desk_allowlist', {
      method: 'POST', body: { emails: ['Desk@school.org', 'desk@school.org'] }
    }), env, {}
  );
  data = await json(response);
  assert.equal(response.status, 200);
  assert.deepEqual(data.emails, ['desk@school.org']);
  assert.equal(data.count, 1);
});

test('ordinary human sessions cannot read or change Staff Pull, Hallway Monitor, or Phone Pass grants', async () => {
  const { route } = await modules();
  const kv = seedKv({
    staff_pull_roles_v1: { roles: { 'one@school.org': { title: 'AP', active: true } } },
    phone_pass_grant_allowlist_v1: { emails: ['p@school.org'] }
  });
  const env = envFor(kv);

  for (const sid of ['editor', 'admin']) {
    let response = await route.handleAccessManagementRequest(
      request('/admin/staff_pull_roles', { sid }), env, {}
    );
    assert.equal(response.status, 403, `${sid} staff-pull GET`);

    response = await route.handleAccessManagementRequest(
      request('/admin/staff_pull_roles', {
        sid, method: 'POST', body: { roles: { 'x@school.org': { title: 'AP' } } }
      }), env, {}
    );
    assert.equal(response.status, 403, `${sid} staff-pull POST`);

    response = await route.handleAccessManagementRequest(
      request('/admin/hallway_group', {
        sid, method: 'POST', body: { emails: ['x@school.org'] }
      }), env, {}
    );
    assert.equal(response.status, 403, `${sid} hallway POST`);

    response = await route.handleAccessManagementRequest(
      request('/admin/phone_pass_group', { sid }), env, {}
    );
    assert.equal(response.status, 403, `${sid} phone GET`);

    response = await route.handleAccessManagementRequest(
      request('/admin/phone_pass_group', {
        sid, method: 'POST', body: { emails: ['x@school.org'] }
      }), env, {}
    );
    assert.equal(response.status, 403, `${sid} phone POST`);
  }
});

test('Super Admin can manage Staff Pull, Hallway Monitor, and Phone Pass grant configuration', async () => {
  const { route } = await modules();
  const kv = seedKv();
  const env = envFor(kv);

  let response = await route.handleAccessManagementRequest(
    request('/admin/staff_pull_roles', {
      method: 'POST',
      body: {
        roles: {
          'Two@school.org': { title: 'Counselor', active: false },
          'One@school.org': { title: 'AP', active: true },
          'blank@school.org': { title: '   ', active: true }
        }
      }
    }), env, {}
  );
  let data = await json(response);
  assert.equal(response.status, 200);
  assert.equal(data.count, 2);

  response = await route.handleAccessManagementRequest(
    request('/admin/staff_pull_roles'), env, {}
  );
  data = await json(response);
  assert.equal(response.status, 200);
  assert.deepEqual(data.rows, [
    { email: 'one@school.org', title: 'AP', active: true }
  ]);

  response = await route.handleAccessManagementRequest(
    request('/admin/hallway_group', {
      method: 'POST', body: { emails: ['H@school.org', 'h@school.org'] }
    }), env, {}
  );
  data = await json(response);
  assert.equal(response.status, 200);
  assert.equal(data.count, 1);

  response = await route.handleAccessManagementRequest(
    request('/admin/phone_pass_group', {
      method: 'POST', body: { emails: ['P@school.org'] }
    }), env, {}
  );
  assert.equal(response.status, 200);

  response = await route.handleAccessManagementRequest(
    request('/admin/phone_pass_group'), env, {}
  );
  data = await json(response);
  assert.equal(response.status, 200);
  assert.deepEqual(data.emails, ['p@school.org']);
});

test('trusted internal ADMIN_TOKEN retains automation access to Staff Pull, Hallway, and Phone Pass management', async () => {
  const { route } = await modules();
  const kv = seedKv();
  const env = envFor(kv);
  const auth = { sid: null, token: 'internal-secret', origin: '' };

  let response = await route.handleAccessManagementRequest(
    request('/admin/staff_pull_roles', {
      ...auth,
      method: 'POST',
      body: { roles: { 'Token@school.org': { title: 'Counselor', active: true } } }
    }), env, {}
  );
  assert.equal(response.status, 200);

  response = await route.handleAccessManagementRequest(
    request('/admin/staff_pull_roles', auth), env, {}
  );
  let data = await json(response);
  assert.equal(response.status, 200);
  assert.deepEqual(data.rows, [
    { email: 'token@school.org', title: 'Counselor', active: true }
  ]);

  response = await route.handleAccessManagementRequest(
    request('/admin/hallway_group', {
      ...auth, method: 'POST', body: { emails: ['token-hall@school.org'] }
    }), env, {}
  );
  assert.equal(response.status, 200);

  response = await route.handleAccessManagementRequest(
    request('/admin/phone_pass_group', {
      ...auth, method: 'POST', body: { emails: ['token-phone@school.org'] }
    }), env, {}
  );
  assert.equal(response.status, 200);

  response = await route.handleAccessManagementRequest(
    request('/admin/phone_pass_group', auth), env, {}
  );
  data = await json(response);
  assert.equal(response.status, 200);
  assert.deepEqual(data.emails, ['token-phone@school.org']);
});

test('View-as remains read-only for every access-management mutation', async () => {
  const { route } = await modules();
  const kv = seedKv();
  const env = envFor(kv);

  const cases = [
    ['/admin/admin_role_allowlist', { emails: ['x@school.org'] }],
    ['/admin/visitor_desk_allowlist', { emails: ['x@school.org'] }],
    ['/admin/staff_pull_roles', { roles: { 'x@school.org': { title: 'AP' } } }],
    ['/admin/hallway_group', { emails: ['x@school.org'] }],
    ['/admin/phone_pass_group', { emails: ['x@school.org'] }]
  ];

  for (const [pathname, body] of cases) {
    const response = await route.handleAccessManagementRequest(
      request(pathname, { sid: 'view', method: 'POST', body }), env, {}
    );
    const data = await json(response);
    assert.equal(response.status, 403, pathname);
    assert.equal(data.error, 'view_as_read_only', pathname);
  }
});

test('Practice mode keeps permission configuration live while scoping its audit record', async () => {
  const { route, service } = await modules();
  const kv = seedKv({ 'system:mode:v1': { mode: 'practice' } });
  const env = envFor(kv);

  const response = await route.handleAccessManagementRequest(
    request('/admin/visitor_desk_allowlist', {
      method: 'POST', body: { emails: ['desk@school.org'] }
    }), env, {}
  );
  assert.equal(response.status, 200);

  assert.ok(kv.map.has('visitor_desk_allowlist_v1'));
  assert.equal(
    Array.from(kv.map.keys()).some((key) => key.startsWith('practice:v1:') && key.includes('visitor_desk_allowlist')),
    false
  );

  const auditKeys = Array.from(kv.map.keys()).filter((key) => /^practice:v1:\d{4}-\d{2}-\d{2}:audit:/.test(key));
  assert.equal(auditKeys.length, 1);
  const auditPut = kv.puts.find((put) => put.key === auditKeys[0]);
  assert.equal(auditPut.options.expirationTtl, 36 * 60 * 60);

  const mode = await service.loadAccessManagementModeInfo(env);
  assert.equal(mode.practice, true);
});

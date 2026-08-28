const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const routeUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/esas.js')).href;
const doUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/durable-objects/esas.js')).href;

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [String(key), typeof value === 'string' ? value : JSON.stringify(value)]));
    this.puts = [];
  }
  async get(key, options) {
    const raw = this.map.get(String(key));
    if (raw == null) return null;
    if (options?.type === 'json' || options === 'json') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  }
  async put(key, value, options) {
    this.map.set(String(key), typeof value === 'string' ? value : JSON.stringify(value));
    this.puts.push({ key: String(key), value, options: options || null });
  }
  async delete(key) { this.map.delete(String(key)); }
}

class FakeStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.get(String(key)); }
  async put(key, value) { this.map.set(String(key), structuredClone(value)); }
  async delete(key) { this.map.delete(String(key)); }
}

class FakeEsasNamespace {
  constructor(DoClass) {
    this.names = [];
    this.storage = new FakeStorage();
    this.instance = new DoClass({ storage: this.storage }, {});
  }
  idFromName(name) { this.names.push(String(name)); return String(name); }
  get() { return { fetch: (input, init) => this.instance.fetch(new Request(input, init)) }; }
}

function seed({ viewAs = false, hallway = [] } = {}) {
  const exp = Date.now() + 60 * 60 * 1000;
  return {
    'admin:sessions:teacher-sid': { email: 'teacher@school.org', role: 'editor', exp },
    'admin:sessions:ops-sid': { email: 'ops@school.org', role: 'editor', exp },
    'admin:sessions:admin-sid': { email: 'admin@school.org', role: 'admin', exp },
    'admin:sessions:view-sid': { email: 'boss@school.org', role: 'super_admin', view_as_email: viewAs ? 'teacher@school.org' : '', exp },
    'admin_role_allowlist_v1': { emails: ['admin@school.org'] },
    'hallway_monitor_allowlist_v1': { emails: hallway },
    'phone_pass_grant_allowlist_v1': { emails: [] },
    'visitor_desk_allowlist_v1': { emails: [] },
    'roster_v1': { rows: [{ o: '1001', n: 'Test Student', g: '9' }] },
    'academic_roster_v1': {
      staff_mapping_by_email: {
        'teacher@school.org': { email: 'teacher@school.org', name: 'Teacher' },
        'ops@school.org': { email: 'ops@school.org', name: 'Ops' },
        'admin@school.org': { email: 'admin@school.org', name: 'Admin' },
        'boss@school.org': { email: 'boss@school.org', name: 'Boss' }
      }
    }
  };
}

async function makeEnv(options = {}) {
  const { ESASDO } = await import(`${doUrl}?v=${Date.now()}-${Math.random()}`);
  return {
    ROSTER: new FakeKV(seed(options)),
    ESAS_DO: new FakeEsasNamespace(ESASDO),
    ADMIN_ALLOWLIST: 'boss@school.org',
    ORIGIN_OK: 'https://app.example'
  };
}

function req(pathname, { method = 'GET', sid = 'teacher-sid', body = null, origin = 'https://app.example' } = {}) {
  const headers = new Headers();
  if (sid) headers.set('x-admin-session', sid);
  if (origin) headers.set('origin', origin);
  if (body != null) headers.set('content-type', 'application/json');
  return new Request(`https://worker.example${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
}

async function loadRoute() {
  return import(`${routeUrl}?v=${Date.now()}-${Math.random()}`);
}

async function data(response) { return response.json().catch(() => null); }

test('ESAS status requires staff authentication and ordinary staff can read inactive status', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv();
  const denied = await handleEsasRequest(req('/admin/esas/status', { sid: '' }), env, {});
  assert.equal(denied.status, 401);

  const response = await handleEsasRequest(req('/admin/esas/status'), env, {});
  assert.equal(response.status, 200);
  const j = await data(response);
  assert.equal(j.ok, true);
  assert.equal(j.active, false);
  assert.equal(j.can_manage, false);
  assert.equal(j.incident, null);
  assert.deepEqual(env.ESAS_DO.names, ['GLOBAL']);
});

test('Ops hallway authority can activate ESAS, duplicate activation is rejected, and all staff see the same incident', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv({ hallway: ['ops@school.org'] });

  const activated = await handleEsasRequest(req('/admin/esas/activate', {
    method: 'POST', sid: 'ops-sid', body: { kind: 'drill', label: 'Fire Drill' }
  }), env, {});
  assert.equal(activated.status, 201);
  const a = await data(activated);
  assert.equal(a.ok, true);
  assert.equal(a.active, true);
  assert.equal(a.incident.kind, 'drill');
  assert.equal(a.incident.label, 'Fire Drill');
  assert.equal(a.incident.started_by, 'ops@school.org');
  assert.match(a.incident.incident_id, /^esas-\d{8}-/);

  const duplicate = await handleEsasRequest(req('/admin/esas/activate', {
    method: 'POST', sid: 'ops-sid', body: { kind: 'emergency', label: 'Second Incident' }
  }), env, {});
  assert.equal(duplicate.status, 409);
  assert.equal((await data(duplicate)).error, 'esas_already_active');

  const teacherStatus = await handleEsasRequest(req('/admin/esas/status', { sid: 'teacher-sid' }), env, {});
  const status = await data(teacherStatus);
  assert.equal(status.active, true);
  assert.equal(status.incident.incident_id, a.incident.incident_id);
  assert.equal(status.can_manage, false);
});

test('ordinary staff cannot activate ESAS and bad mutation origins are rejected', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv();

  const teacher = await handleEsasRequest(req('/admin/esas/activate', {
    method: 'POST', sid: 'teacher-sid', body: { kind: 'drill' }
  }), env, {});
  assert.equal(teacher.status, 403);
  assert.equal((await data(teacher)).error, 'esas_manage_required');

  const badOrigin = await handleEsasRequest(req('/admin/esas/activate', {
    method: 'POST', sid: 'admin-sid', origin: 'https://evil.example', body: { kind: 'drill' }
  }), env, {});
  assert.equal(badOrigin.status, 403);
  assert.equal((await data(badOrigin)).error, 'origin_forbidden');
});

test('View-as remains read-only even for a super admin actor', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv({ viewAs: true });
  const response = await handleEsasRequest(req('/admin/esas/activate', {
    method: 'POST', sid: 'view-sid', body: { kind: 'drill' }
  }), env, {});
  assert.equal(response.status, 403);
  assert.equal((await data(response)).error, 'view_as_read_only');
});

test('ending ESAS requires the current incident id and archives the ended lifecycle metadata', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv();
  const activated = await handleEsasRequest(req('/admin/esas/activate', {
    method: 'POST', sid: 'admin-sid', body: { kind: 'emergency', label: 'Evacuation' }
  }), env, {});
  const a = await data(activated);
  const incidentId = a.incident.incident_id;

  const stale = await handleEsasRequest(req('/admin/esas/end', {
    method: 'POST', sid: 'admin-sid', body: { incident_id: 'esas-stale' }
  }), env, {});
  assert.equal(stale.status, 409);
  assert.equal((await data(stale)).error, 'incident_mismatch');

  const ended = await handleEsasRequest(req('/admin/esas/end', {
    method: 'POST', sid: 'admin-sid', body: { incident_id: incidentId }
  }), env, {});
  assert.equal(ended.status, 200);
  const e = await data(ended);
  assert.equal(e.ok, true);
  assert.equal(e.active, false);
  assert.equal(e.incident.status, 'ended');
  assert.equal(e.incident.ended_by, 'admin@school.org');
  assert.ok(env.ROSTER.map.has(`esas:archive:v1:${incidentId}`));

  const status = await handleEsasRequest(req('/admin/esas/status', { sid: 'teacher-sid' }), env, {});
  assert.equal((await data(status)).active, false);
});

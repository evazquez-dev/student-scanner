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
    this.storage = new FakeStorage();
    this.instance = new DoClass({ storage: this.storage }, {});
  }
  idFromName(name) { return String(name); }
  get() { return { fetch: (input, init) => this.instance.fetch(new Request(input, init)) }; }
}

function seed() {
  const exp = Date.now() + 60 * 60 * 1000;
  return {
    'admin:sessions:teacher-sid': { email: 'teacher@school.org', role: 'editor', exp },
    'admin:sessions:admin-sid': { email: 'admin@school.org', role: 'admin', exp },
    'admin_role_allowlist_v1': { emails: ['admin@school.org'] },
    'hallway_monitor_allowlist_v1': { emails: [] },
    'phone_pass_grant_allowlist_v1': { emails: [] },
    'visitor_desk_allowlist_v1': { emails: [] },
    'roster_v1': {
      rows: [
        { o: '1001', n: 'Alice Adams', g: '9' },
        { o: '1002', n: 'Bob Brown', g: '10' }
      ]
    },
    'bell_schedule_v1': {
      tz: 'America/New_York',
      periods: [{ id: '1', start: '00:00', end: '23:59' }]
    },
    'student_classes_v1': {
      date: new Date().toISOString().slice(0, 10),
      classes: { '1001': { '1': '101' }, '1002': { '1': '101' } },
      courses: { '1001': { '1': 'ENG100.1' }, '1002': { '1': 'ENG100.1' } }
    },
    'teacher_assignments_v1': {
      date: new Date().toISOString().slice(0, 10),
      by_room_period: {
        '101||1': { room: '101', period_local: '1', teachers: [{ teacher_key: 'teacher', teacher_last_name: 'Teacher' }] }
      }
    },
    'academic_roster_v1': {
      staff_mapping_by_email: {
        'teacher@school.org': { email: 'teacher@school.org', name: 'Teacher', teacher_assignment_match: 'Teacher', status: 'ok' },
        'admin@school.org': { email: 'admin@school.org', name: 'Admin', status: 'not_assigned' }
      }
    }
  };
}

async function makeEnv() {
  const { ESASDO } = await import(`${doUrl}?v=${Date.now()}-${Math.random()}`);
  return {
    ROSTER: new FakeKV(seed()),
    ESAS_DO: new FakeEsasNamespace(ESASDO),
    ADMIN_ALLOWLIST: '',
    ORIGIN_OK: 'https://app.example'
  };
}

function req(pathname, { method = 'GET', sid = 'teacher-sid', body = null } = {}) {
  const headers = new Headers({ origin: 'https://app.example' });
  if (sid) headers.set('x-admin-session', sid);
  if (body != null) headers.set('content-type', 'application/json');
  return new Request(`https://worker.example${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
}

async function data(response) { return response.json().catch(() => null); }
async function loadRoute() { return import(`${routeUrl}?v=${Date.now()}-${Math.random()}`); }

async function activate(env, handleEsasRequest) {
  const response = await handleEsasRequest(req('/admin/esas/activate', {
    method: 'POST', sid: 'admin-sid', body: { kind: 'drill', label: 'Stage 4 Drill' }
  }), env, {});
  assert.equal(response.status, 201);
  return data(response);
}

test('Stage 4 end guard requires exact current unaccounted count and explicit force when students remain', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv();
  const active = await activate(env, handleEsasRequest);
  const id = active.incident.incident_id;
  assert.equal(active.incident.counts.unaccounted, 2);

  const missingConfirm = await handleEsasRequest(req('/admin/esas/end', {
    method: 'POST', sid: 'admin-sid', body: { incident_id: id }
  }), env, {});
  assert.equal(missingConfirm.status, 400);
  assert.equal((await data(missingConfirm)).error, 'confirm_unaccounted_required');

  const noForce = await handleEsasRequest(req('/admin/esas/end', {
    method: 'POST', sid: 'admin-sid', body: { incident_id: id, confirm_unaccounted: 2 }
  }), env, {});
  assert.equal(noForce.status, 409);
  assert.equal((await data(noForce)).error, 'unaccounted_students_remain');

  const accounted = await handleEsasRequest(req('/admin/esas/account', {
    method: 'POST', sid: 'teacher-sid', body: { incident_id: id, osis: '1001', source: 'roster' }
  }), env, {});
  assert.equal(accounted.status, 200);

  const staleCount = await handleEsasRequest(req('/admin/esas/end', {
    method: 'POST', sid: 'admin-sid', body: { incident_id: id, confirm_unaccounted: 2, force_with_unaccounted: true }
  }), env, {});
  assert.equal(staleCount.status, 409);
  const staleBody = await data(staleCount);
  assert.equal(staleBody.error, 'unaccounted_count_changed');
  assert.equal(staleBody.actual_unaccounted, 1);

  const status = await handleEsasRequest(req('/admin/esas/status', { sid: 'teacher-sid' }), env, {});
  assert.equal((await data(status)).active, true, 'failed end attempts must leave ESAS active');
});

test('Stage 4 forced end archives a manager-only final summary with unresolved students', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv();
  const active = await activate(env, handleEsasRequest);
  const id = active.incident.incident_id;

  await handleEsasRequest(req('/admin/esas/account', {
    method: 'POST', sid: 'teacher-sid', body: { incident_id: id, osis: '1001', source: 'roster' }
  }), env, {});

  const ended = await handleEsasRequest(req('/admin/esas/end', {
    method: 'POST', sid: 'admin-sid', body: {
      incident_id: id,
      confirm_unaccounted: 1,
      force_with_unaccounted: true
    }
  }), env, {});
  assert.equal(ended.status, 200);
  const endedBody = await data(ended);
  assert.equal(endedBody.ok, true);
  assert.equal(endedBody.summary.counts.expected, 2);
  assert.equal(endedBody.summary.counts.accounted, 1);
  assert.equal(endedBody.summary.counts.unaccounted, 1);
  assert.equal(endedBody.summary.final_unaccounted.length, 1);
  assert.equal(endedBody.summary.final_unaccounted[0].osis, '1002');
  assert.equal(endedBody.summary.archive_retention_days, 90);

  const teacherArchive = await handleEsasRequest(req(`/admin/esas/archive?incident_id=${encodeURIComponent(id)}`, {
    sid: 'teacher-sid'
  }), env, {});
  assert.equal(teacherArchive.status, 403);
  assert.equal((await data(teacherArchive)).error, 'esas_manage_required');

  const adminArchive = await handleEsasRequest(req(`/admin/esas/archive?incident_id=${encodeURIComponent(id)}`, {
    sid: 'admin-sid'
  }), env, {});
  assert.equal(adminArchive.status, 200);
  const archived = await data(adminArchive);
  assert.equal(archived.summary.incident_id, id);
  assert.equal(archived.summary.final_unaccounted[0].name, 'Bob Brown');

  const status = await handleEsasRequest(req('/admin/esas/status', { sid: 'teacher-sid' }), env, {});
  assert.equal((await data(status)).active, false);
});

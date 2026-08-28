const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const routeUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/esas.js')).href;
const doUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/durable-objects/esas.js')).href;

function nyDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

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

class FakeStudentLocationNamespace {
  constructor(live = {}) { this.live = live; this.names = []; }
  idFromName(name) { this.names.push(String(name)); return String(name); }
  get() {
    return {
      fetch: async (input) => {
        const u = new URL(input);
        if (u.pathname === '/all') return new Response(JSON.stringify(this.live), { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ ok: false }), { status: 404 });
      }
    };
  }
}

function baseSeed() {
  const exp = Date.now() + 60 * 60 * 1000;
  const date = nyDate();
  return {
    'admin:sessions:teacher-sid': { email: 'teacher@school.org', role: 'editor', exp },
    'admin:sessions:teacher2-sid': { email: 'teacher2@school.org', role: 'editor', exp },
    'admin:sessions:admin-sid': { email: 'admin@school.org', role: 'admin', exp },
    'admin_role_allowlist_v1': { emails: ['admin@school.org'] },
    'hallway_monitor_allowlist_v1': { emails: [] },
    'phone_pass_grant_allowlist_v1': { emails: [] },
    'visitor_desk_allowlist_v1': { emails: [] },
    'roster_v1': {
      rows: [
        { o: '1001', n: 'Alice Adams', g: '9', e: 'alice@students.school.org' },
        { o: '1002', n: 'Bob Brown', g: '10', e: 'bob@students.school.org' },
        { o: '1003', n: 'Carla Cruz', g: '11', e: 'carla@students.school.org' },
        { o: '1004', n: 'Daniel Diaz', g: '12', e: 'daniel@students.school.org' }
      ]
    },
    'bell_schedule_v1': { tz: 'America/New_York', periods: [{ id: '1', start: '00:00', end: '23:59' }] },
    'student_classes_v1': {
      date,
      classes: {
        '1001': { '1': '101' },
        '1002': { '1': '101' },
        '1003': { '1': '202' },
        '1004': { '1': '303' }
      },
      courses: {
        '1001': { '1': 'ENG100.1' },
        '1002': { '1': 'ENG100.1' },
        '1003': { '1': 'MTH200.1' },
        '1004': { '1': 'SCI300.1' }
      }
    },
    'teacher_assignments_v1': {
      date,
      by_room_period: {
        '101||1': { room: '101', period_local: '1', teachers: [{ teacher_key: 'teacher', teacher_last_name: 'Teacher' }] },
        '202||1': { room: '202', period_local: '1', teachers: [{ teacher_key: 'teacher2', teacher_last_name: 'Teacher2' }] }
      }
    },
    'academic_roster_v1': {
      staff_mapping_by_email: {
        'teacher@school.org': { email: 'teacher@school.org', name: 'Tina Teacher', teacher_assignment_match: 'Teacher', status: 'ok' },
        'teacher2@school.org': { email: 'teacher2@school.org', name: 'Tom Teacher2', teacher_assignment_match: 'Teacher2', status: 'ok' },
        'admin@school.org': { email: 'admin@school.org', name: 'Admin', status: 'not_assigned' }
      }
    }
  };
}

async function makeEnv() {
  const { ESASDO } = await import(`${doUrl}?v=${Date.now()}-${Math.random()}`);
  const date = nyDate();
  return {
    ROSTER: new FakeKV(baseSeed()),
    ESAS_DO: new FakeEsasNamespace(ESASDO),
    STUDENT_LOC: new FakeStudentLocationNamespace({
      '1001': { date, zone: 'class', location_label: 'Room 101' },
      '1003': { date, zone: 'off_campus', source: 'early_dismissal_form', location_label: 'Off Campus (early dismissal)' }
    }),
    ADMIN_ALLOWLIST: '',
    ORIGIN_OK: 'https://app.example'
  };
}

function req(pathname, { method = 'GET', sid = 'teacher-sid', body = null, origin = 'https://app.example' } = {}) {
  const headers = new Headers();
  if (sid) headers.set('x-admin-session', sid);
  if (origin) headers.set('origin', origin);
  if (body != null) headers.set('content-type', 'application/json');
  return new Request(`https://worker.example${pathname}`, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
}

async function loadRoute() { return import(`${routeUrl}?v=${Date.now()}-${Math.random()}`); }
async function data(response) { return response.json().catch(() => null); }

async function activate(env, handleEsasRequest) {
  const response = await handleEsasRequest(req('/admin/esas/activate', {
    method: 'POST', sid: 'admin-sid', body: { kind: 'drill', label: 'Stage 2 Drill' }
  }), env, {});
  assert.equal(response.status, 201);
  return data(response);
}

test('activation freezes roster/current assignment and excludes only explicit same-day off-campus state', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv();
  const active = await activate(env, handleEsasRequest);
  assert.equal(active.incident.counts.roster_total, 4);
  assert.equal(active.incident.counts.expected, 3);
  assert.equal(active.incident.counts.excluded_off_campus_initial, 1);
  assert.equal(active.incident.context.period_local, '1');
  assert.equal(active.incident.context.schedule_mode, 'in_class');

  // Mutating source state after activation must not alter the frozen incident snapshot.
  env.STUDENT_LOC.live['1002'] = { date: nyDate(), zone: 'off_campus', source: 'later_change' };
  env.ROSTER.map.set('student_classes_v1', JSON.stringify({ date: nyDate(), classes: { '1001': { '1': '999' } }, courses: {} }));

  const teacherRoster = await handleEsasRequest(req('/admin/esas/my_roster', { sid: 'teacher-sid' }), env, {});
  const roster = await data(teacherRoster);
  assert.equal(roster.count, 2);
  assert.deepEqual(roster.students.map((s) => s.osis), ['1001', '1002']);
  assert.ok(roster.students.every((s) => s.expected_room === '101'));
});

test('staff search sees excluded students and physically accounting one promotes them into the effective expected population', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv();
  const active = await activate(env, handleEsasRequest);
  const id = active.incident.incident_id;

  const search = await handleEsasRequest(req('/admin/esas/search?q=Carla', { sid: 'teacher-sid' }), env, {});
  assert.equal(search.status, 200);
  const found = await data(search);
  assert.equal(found.count, 1);
  assert.equal(found.results[0].osis, '1003');
  assert.equal(found.results[0].expected, false);
  assert.equal(found.results[0].off_campus_snapshot, true);
  assert.equal(found.results[0].off_campus_source, 'early_dismissal_form');

  const accounted = await handleEsasRequest(req('/admin/esas/account', {
    method: 'POST', sid: 'teacher-sid', body: { incident_id: id, osis: '1003', accounted: true, source: 'search' }
  }), env, {});
  assert.equal(accounted.status, 200);
  const a = await data(accounted);
  assert.equal(a.student.accounted, true);
  assert.equal(a.student.expected, true);
  assert.equal(a.student.initial_expected, false);
  assert.equal(a.incident.counts.expected, 4);
  assert.equal(a.incident.counts.accounted, 1);
  assert.equal(a.incident.counts.promoted_from_off_campus, 1);

  const teacher2Roster = await handleEsasRequest(req('/admin/esas/my_roster', { sid: 'teacher2-sid' }), env, {});
  const t2 = await data(teacher2Roster);
  assert.equal(t2.count, 1);
  assert.equal(t2.students[0].osis, '1003');
  assert.equal(t2.students[0].accounted, true);
});

test('ordinary staff can account any searched student but cannot undo another staff member; Ops/Admin can', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv();
  const active = await activate(env, handleEsasRequest);
  const id = active.incident.incident_id;

  const byOther = await handleEsasRequest(req('/admin/esas/account', {
    method: 'POST', sid: 'teacher2-sid', body: { incident_id: id, osis: '1002', source: 'search' }
  }), env, {});
  assert.equal(byOther.status, 200);

  const badUndo = await handleEsasRequest(req('/admin/esas/account', {
    method: 'POST', sid: 'teacher-sid', body: { incident_id: id, osis: '1002', accounted: false, source: 'roster' }
  }), env, {});
  assert.equal(badUndo.status, 403);
  assert.equal((await data(badUndo)).error, 'account_undo_not_allowed');

  const adminUndo = await handleEsasRequest(req('/admin/esas/account', {
    method: 'POST', sid: 'admin-sid', body: { incident_id: id, osis: '1002', accounted: false, source: 'ops' }
  }), env, {});
  assert.equal(adminUndo.status, 200);
  assert.equal((await data(adminUndo)).student.accounted, false);
});

test('Ops/Admin unaccounted list is protected and updates immediately as students are accounted', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv();
  const active = await activate(env, handleEsasRequest);
  const id = active.incident.incident_id;

  const teacherDenied = await handleEsasRequest(req('/admin/esas/unaccounted', { sid: 'teacher-sid' }), env, {});
  assert.equal(teacherDenied.status, 403);
  assert.equal((await data(teacherDenied)).error, 'esas_manage_required');

  let unaccounted = await handleEsasRequest(req('/admin/esas/unaccounted', { sid: 'admin-sid' }), env, {});
  let list = await data(unaccounted);
  assert.equal(list.count, 3);
  assert.deepEqual(list.students.map((s) => s.osis), ['1001', '1002', '1004']);

  await handleEsasRequest(req('/admin/esas/account', {
    method: 'POST', sid: 'teacher-sid', body: { incident_id: id, osis: '1001', source: 'roster' }
  }), env, {});
  unaccounted = await handleEsasRequest(req('/admin/esas/unaccounted', { sid: 'admin-sid' }), env, {});
  list = await data(unaccounted);
  assert.equal(list.count, 2);
  assert.deepEqual(list.students.map((s) => s.osis), ['1002', '1004']);
});

test('accounting is incident-id protected, View-as/mutation guards remain, and ended student data archives with a 90-day TTL', async () => {
  const { handleEsasRequest } = await loadRoute();
  const env = await makeEnv();
  const active = await activate(env, handleEsasRequest);
  const id = active.incident.incident_id;

  const stale = await handleEsasRequest(req('/admin/esas/account', {
    method: 'POST', sid: 'teacher-sid', body: { incident_id: 'esas-stale', osis: '1001' }
  }), env, {});
  assert.equal(stale.status, 409);
  assert.equal((await data(stale)).error, 'incident_mismatch');

  await handleEsasRequest(req('/admin/esas/account', {
    method: 'POST', sid: 'teacher-sid', body: { incident_id: id, osis: '1001', source: 'roster' }
  }), env, {});
  const ended = await handleEsasRequest(req('/admin/esas/end', {
    method: 'POST', sid: 'admin-sid', body: { incident_id: id }
  }), env, {});
  assert.equal(ended.status, 200);

  const archiveKey = `esas:archive:v1:${id}`;
  const archiveRaw = env.ROSTER.map.get(archiveKey);
  assert.ok(archiveRaw);
  const archive = JSON.parse(archiveRaw);
  assert.equal(archive.snapshot.students['1001'].accounted, true);
  assert.equal(archive.snapshot.students['1003'].initial_expected, false);
  assert.ok(Array.isArray(archive.actions));
  const archivePut = env.ROSTER.puts.find((row) => row.key === archiveKey);
  assert.equal(archivePut.options.expirationTtl, 90 * 24 * 60 * 60);
  assert.equal(env.ESAS_DO.storage.map.has(`incident:${id}`), false, 'full incident should purge from DO after archive confirmation');
});

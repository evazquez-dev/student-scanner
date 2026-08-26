const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const routeUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/phone-pass.js')).href;

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [String(key), typeof value === 'string' ? value : JSON.stringify(value)]));
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
  async list({ prefix = '', limit = 1000 } = {}) {
    const keys = [...this.map.keys()].filter((key) => key.startsWith(String(prefix))).slice(0, limit).map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

class FakeStudentLocationNamespace {
  constructor() {
    this.byName = new Map();
    this.names = [];
  }
  idFromName(name) {
    const key = String(name);
    this.names.push(key);
    return key;
  }
  get(name) {
    const key = String(name);
    if (!this.byName.has(key)) this.byName.set(key, new Map());
    const state = this.byName.get(key);
    return {
      async fetch(input, init = {}) {
        const url = new URL(typeof input === 'string' ? input : input.url);
        if (url.pathname === '/get') {
          const osis = String(url.searchParams.get('osis') || '');
          const row = state.get(osis) || { ok: true, found: false };
          return new Response(JSON.stringify(row), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.pathname === '/all') {
          return new Response(JSON.stringify(Object.fromEntries(state.entries())), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.pathname === '/update' && String(init.method || 'GET').toUpperCase() === 'POST') {
          const patch = JSON.parse(String(init.body || '{}'));
          const osis = String(patch.osis || '');
          const prev = state.get(osis) || {};
          state.set(osis, { ...prev, ...patch, osis });
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('not_found', { status: 404 });
      }
    };
  }
  state(name, osis) {
    return this.byName.get(String(name))?.get(String(osis)) || null;
  }
}

class FakeLogBufferNamespace {
  constructor() {
    this.rows = [];
    this.names = [];
  }
  idFromName(name) {
    const key = String(name);
    this.names.push(key);
    return key;
  }
  get(name) {
    const self = this;
    return {
      async fetch(input, init = {}) {
        const url = new URL(typeof input === 'string' ? input : input.url);
        if (url.pathname === '/enqueue' && String(init.method || 'GET').toUpperCase() === 'POST') {
          self.rows.push({ name: String(name), row: JSON.parse(String(init.body || '{}')) });
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('not_found', { status: 404 });
      }
    };
  }
}

function todayNY() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2');
}

function seed({ practice = false, teacherHallway = false, teacherPhoneGrant = false, viewAs = false } = {}) {
  const exp = Date.now() + 60 * 60 * 1000;
  return {
    'system:mode:v1': { mode: practice ? 'practice' : 'live' },
    'admin:sessions:teacher-sid': { email: 'teacher@school.org', role: 'editor', exp },
    'admin:sessions:hallway-sid': { email: 'hallway@school.org', role: 'editor', exp },
    'admin:sessions:super-sid': { email: 'boss@school.org', role: 'super_admin', exp, ...(viewAs ? { view_as_email: 'teacher@school.org' } : {}) },
    'admin_role_allowlist_v1': { emails: [] },
    'hallway_monitor_allowlist_v1': { emails: teacherHallway ? ['teacher@school.org', 'hallway@school.org'] : ['hallway@school.org'] },
    'phone_pass_grant_allowlist_v1': { emails: teacherPhoneGrant ? ['teacher@school.org'] : ['someoneelse@school.org'] },
    'staff_pull_roles_v1': { roles: {} },
    'academic_roster_v1': {
      staff_mapping_by_email: {
        'teacher@school.org': { email: 'teacher@school.org', name: 'Teacher One', teacher_assignment_match: 'Teacher One', status: 'ok' },
        'hallway@school.org': { email: 'hallway@school.org', name: 'Hallway One', teacher_assignment_match: '', status: 'not_assigned' },
        'boss@school.org': { email: 'boss@school.org', name: 'Boss One', teacher_assignment_match: '', status: 'not_assigned' }
      }
    },
    roster_v1: {
      rows: [
        { o: '123456789', n: 'Student One', g: '10', c: 'Blue', l: '101', sx: 'F' },
        { o: '987654321', n: 'Student Two', g: '11', c: 'Red', l: '202', sx: 'M' }
      ]
    },
    bell_schedule_v1: {
      tz: 'America/New_York',
      periods: [{ id: '1', start: '00:00', end: '23:59' }]
    },
    student_classes_v1: {
      classes: { '123456789': { '1': '301' }, '987654321': { '1': '302' } },
      courses: { '123456789': { '1': 'ENG100.1' }, '987654321': { '1': 'MTH100.1' } }
    },
    att_cfg_v1: { webapp_schedule_mode: 'special' }
  };
}

function makeEnv(options = {}) {
  return {
    ROSTER: new FakeKV(seed(options)),
    STUDENT_LOC: new FakeStudentLocationNamespace(),
    LOG_BUFFER: new FakeLogBufferNamespace(),
    ADMIN_ALLOWLIST: 'boss@school.org',
    ORIGIN_OK: 'https://app.example'
  };
}

function request(pathname, { method = 'GET', sid = 'teacher-sid', body = null, origin = '' } = {}) {
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

function ctxCollector() {
  const pending = [];
  return {
    ctx: { waitUntil(promise) { pending.push(Promise.resolve(promise)); } },
    async drain() { return Promise.allSettled(pending); }
  };
}

async function loadRoute() {
  return import(`${routeUrl}?v=${Date.now()}-${Math.random()}`);
}

async function json(response) {
  return response.json().catch(() => null);
}

test('Teacher Attendance can grant and request return without standalone Phone Pass grant access', async () => {
  const { handlePhonePassRequest } = await loadRoute();
  const env = makeEnv();
  const collector = ctxCollector();

  let response = await handlePhonePassRequest(request('/admin/phone_pass/grant', {
    method: 'POST',
    body: { osis: '123456789', source: 'teacher_attendance' }
  }), env, collector.ctx);
  assert.equal(response.status, 200);
  assert.equal((await json(response)).ok, true);
  assert.equal(env.STUDENT_LOC.state('GLOBAL', '123456789').phone_out, true);
  assert.equal(env.STUDENT_LOC.state('GLOBAL', '123456789').phone_out_by_email, 'teacher@school.org');

  response = await handlePhonePassRequest(request('/admin/phone_pass/send_to_return', {
    method: 'POST',
    body: { osis: '123456789', source: 'teacher_attendance' }
  }), env, collector.ctx);
  assert.equal(response.status, 200);
  const sendBack = await json(response);
  assert.equal(sendBack.ok, true);
  assert.equal(env.STUDENT_LOC.state('GLOBAL', '123456789').phone_return_requested, true);
  assert.equal(sendBack.phone_return_notification.queued, true);

  // The same editor cannot use the standalone direct-grant surface.
  response = await handlePhonePassRequest(request('/admin/phone_pass/grant', {
    method: 'POST', body: { osis: '987654321' }
  }), env, collector.ctx);
  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, 'phone_pass_grant_forbidden');
});


test("dedicated Phone Pass teacher can send their own granted phone to return but not another staff member's", async () => {
  const { handlePhonePassRequest } = await loadRoute();
  const env = makeEnv({ teacherPhoneGrant: true });
  const collector = ctxCollector();

  let response = await handlePhonePassRequest(request('/admin/phone_pass/grant', {
    method: 'POST', body: { osis: '123456789' }
  }), env, collector.ctx);
  assert.equal(response.status, 200);
  assert.equal(env.STUDENT_LOC.state('GLOBAL', '123456789').phone_out_by_email, 'teacher@school.org');

  response = await handlePhonePassRequest(request('/admin/phone_pass/send_to_return', {
    method: 'POST', body: { osis: '123456789', source: 'phone_pass' }
  }), env, collector.ctx);
  assert.equal(response.status, 200);
  assert.equal((await json(response)).ok, true);
  assert.equal(env.STUDENT_LOC.state('GLOBAL', '123456789').phone_return_requested, true);

  response = await handlePhonePassRequest(request('/admin/phone_pass/grant', {
    method: 'POST', sid: 'super-sid', body: { osis: '987654321' }
  }), env, collector.ctx);
  assert.equal(response.status, 200);
  assert.equal(env.STUDENT_LOC.state('GLOBAL', '987654321').phone_out_by_email, 'boss@school.org');

  response = await handlePhonePassRequest(request('/admin/phone_pass/send_to_return', {
    method: 'POST', body: { osis: '987654321', source: 'phone_pass' }
  }), env, collector.ctx);
  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, 'phone_pass_send_back_not_owner');
  assert.notEqual(env.STUDENT_LOC.state('GLOBAL', '987654321').phone_return_requested, true);
});

test('final Confirm Return remains Hallway/Ops-only', async () => {
  const { handlePhonePassRequest } = await loadRoute();
  const env = makeEnv();
  const collector = ctxCollector();

  await handlePhonePassRequest(request('/admin/phone_pass/grant', {
    method: 'POST', body: { osis: '123456789', source: 'teacher_attendance' }
  }), env, collector.ctx);

  let response = await handlePhonePassRequest(request('/admin/phone_pass/return', {
    method: 'POST', body: { osis: '123456789' }
  }), env, collector.ctx);
  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, 'hallway_monitor_forbidden');

  response = await handlePhonePassRequest(request('/admin/phone_pass/return', {
    method: 'POST', sid: 'hallway-sid', body: { osis: '123456789' }
  }), env, collector.ctx);
  assert.equal(response.status, 200);
  assert.equal((await json(response)).ok, true);
  assert.equal(env.STUDENT_LOC.state('GLOBAL', '123456789').phone_out, false);
  assert.equal(env.STUDENT_LOC.state('GLOBAL', '123456789').phone_return_requested, false);
});

test('context remains readable by any authenticated teacher and carries schedule context', async () => {
  const { handlePhonePassRequest } = await loadRoute();
  const env = makeEnv();
  const collector = ctxCollector();

  const response = await handlePhonePassRequest(request('/admin/phone_pass/context?osis=123456789'), env, collector.ctx);
  assert.equal(response.status, 200);
  const data = await json(response);
  assert.equal(data.ok, true);
  assert.equal(data.osis, '123456789');
  assert.equal(data.schedule.now.room, '301');
  assert.equal(data.schedule.now.course, 'ENG100.1');
});

test('View-as blocks all Phone Pass mutations', async () => {
  const { handlePhonePassRequest } = await loadRoute();
  const env = makeEnv({ viewAs: true });
  const collector = ctxCollector();
  const response = await handlePhonePassRequest(request('/admin/phone_pass/grant', {
    method: 'POST', sid: 'super-sid', body: { osis: '123456789', source: 'teacher_attendance' }
  }), env, collector.ctx);
  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, 'view_as_read_only');
});

test('Practice mode isolates state/logs and simulates return notifications', async () => {
  const { handlePhonePassRequest } = await loadRoute();
  const env = makeEnv({ practice: true });
  const collector = ctxCollector();
  const date = todayNY();

  let response = await handlePhonePassRequest(request('/admin/phone_pass/grant', {
    method: 'POST', body: { osis: '123456789', source: 'teacher_attendance' }
  }), env, collector.ctx);
  assert.equal(response.status, 200);
  assert.equal(env.STUDENT_LOC.state(`PRACTICE:${date}:GLOBAL`, '123456789').phone_out, true);
  assert.equal(env.STUDENT_LOC.state('GLOBAL', '123456789'), null);
  assert.equal(env.LOG_BUFFER.rows.at(-1).name, `PRACTICE:${date}:LOG:${date}`);
  assert.equal(env.LOG_BUFFER.rows.at(-1).row.practice, true);
  assert.ok(env.ROSTER.puts.some((put) => put.key.startsWith(`practice:v1:${date}:practice_record:scan:123456789:`)));

  response = await handlePhonePassRequest(request('/admin/phone_pass/send_to_return', {
    method: 'POST', body: { osis: '123456789', source: 'teacher_attendance' }
  }), env, collector.ctx);
  const result = await json(response);
  assert.equal(response.status, 200);
  assert.deepEqual(result.phone_return_notification, {
    queued: false, simulated: true, skipped: false, reason: 'practice_mode'
  });
  assert.equal(collector.ctx ? true : false, true);
});

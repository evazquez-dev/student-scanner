const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const routeUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/teacher-attendance-read.js')).href;

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
    this.map.set(String(key), String(value));
    this.puts.push({ key: String(key), value: String(value), options: options || null });
  }
  async list({ prefix = '', limit = 1000 } = {}) {
    const keys = [...this.map.keys()].filter((key) => key.startsWith(String(prefix))).slice(0, limit).map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

class FakeAttendanceNamespace {
  constructor(rows = []) { this.rows = rows; this.names = []; }
  idFromName(name) { this.names.push(String(name)); return String(name); }
  get(name) {
    const self = this;
    return {
      async fetch(input) {
        const url = new URL(typeof input === 'string' ? input : input.url);
        if (url.pathname === '/query') {
          return new Response(JSON.stringify({ ok: true, rows: self.rows }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('not_found', { status: 404 });
      }
    };
  }
}

class FakeClassSessionNamespace {
  constructor(state = { ok: true, students: {} }) { this.state = state; this.names = []; }
  idFromName(name) { this.names.push(String(name)); return String(name); }
  get() {
    const state = this.state;
    return {
      async fetch(input) {
        const url = new URL(typeof input === 'string' ? input : input.url);
        if (url.pathname === '/state') return new Response(JSON.stringify(state), { status: 200, headers: { 'content-type': 'application/json' } });
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

function seed({ practice = false } = {}) {
  const exp = Date.now() + 60 * 60 * 1000;
  return {
    'system:mode:v1': { mode: practice ? 'practice' : 'live' },
    'admin:sessions:teacher-sid': { email: 'teacher@school.org', role: 'editor', exp },
    'admin_role_allowlist_v1': { emails: [] },
    'academic_roster_v1': {
      staff_mapping_by_email: {
        'teacher@school.org': { email: 'teacher@school.org', name: 'Teacher One', teacher_assignment_match: 'Teacher One', status: 'ok' }
      }
    },
    bell_schedule_v1: {
      tz: 'America/New_York',
      periods: [
        { id: '1', start: '00:00', end: '24:00' },
        { id: '2', start: '00:01', end: '23:59' }
      ]
    },
    period_map_v1: {
      ts: 12345,
      periods: { '1': { send: true, abbrs: ['P1'] }, '3': { send: false, abbrs: ['P3'] } }
    },
    student_classes_v1: {
      classes: {
        '111111111': { '1': '301', '2': '302', FM1: 'Advisory Alpha' },
        '222222222': { '1': '301', FM1: 'Advisory Alpha' }
      },
      courses: {
        '111111111': { '1': 'ENG100.1', '2': 'SCI100.1', FM1: 'Advisory Alpha' },
        '222222222': { '1': 'ENG100.1', FM1: 'Advisory Alpha' }
      }
    },
    locs_v1: { locations: [
      { name: '302', type: 'class' },
      { name: '301', type: 'class' },
      { name: 'Hallway', type: 'hallway' }
    ] },
    att_cfg_v1: { chairs_reminder_enabled: true, webapp_schedule_mode: 'special' }
  };
}

function makeEnv(options = {}) {
  return {
    ROSTER: new FakeKV(seed(options)),
    ATT_FINAL_KV: new FakeKV(),
    ATTENDANCE_DO: new FakeAttendanceNamespace([
      { osis: '111111111', overrideLetter: 'L', firstISO: '2026-08-26T12:00:00.000Z' }
    ]),
    CLASS_SESSION_DO: new FakeClassSessionNamespace({ ok: true, students: { '111111111': { firstInISO: '2026-08-26T12:00:00.000Z', out: { isOut: false } } } }),
    ADMIN_ALLOWLIST: 'boss@school.org',
    ORIGIN_OK: 'https://app.example'
  };
}

function request(pathname, { sid = 'teacher-sid' } = {}) {
  const headers = new Headers();
  if (sid) headers.set('x-admin-session', sid);
  return new Request(`https://worker.example${pathname}`, { method: 'GET', headers });
}

async function loadRoute() {
  return import(`${routeUrl}?v=${Date.now()}-${Math.random()}`);
}

async function json(response) { return response.json().catch(() => null); }

test('Teacher Attendance options are served by the modular read route with period/room/advisor/current-period contracts', async () => {
  const { handleTeacherAttendanceReadRequest } = await loadRoute();
  const env = makeEnv();
  const response = await handleTeacherAttendanceReadRequest(request('/admin/teacher_att/options'), env, {});
  assert.equal(response.status, 200);
  const data = await json(response);
  assert.equal(data.ok, true);
  assert.deepEqual(data.rooms, ['301', '302']);
  assert.deepEqual(data.periods, ['1', '2']);
  assert.deepEqual(data.local_only_periods, ['2']);
  assert.equal(data.period_map_ts, 12345);
  assert.equal(data.current_period_local, '1');
  assert.equal(data.last_period_local, '2');
  assert.deepEqual(data.advisors_by_period.FM1, ['Advisory Alpha']);
  assert.equal(data.chairs_reminder_enabled, true);
});

test('meeting preview computes the same scheduled roster and attendance-code semantics without touching submit/finalization', async () => {
  const { handleTeacherAttendanceReadRequest } = await loadRoute();
  const env = makeEnv();
  const date = todayNY();
  const response = await handleTeacherAttendanceReadRequest(request(`/admin/meeting/preview?date=${date}&room=301&period=1&when=end&force_compute=1`), env, {});
  assert.equal(response.status, 200);
  const data = await json(response);
  assert.equal(data.ok, true);
  assert.equal(data.source, 'computed');
  assert.equal(data.scheduled_count, 2);
  assert.deepEqual(data.rows.map((row) => [row.osis, row.codeLetter, row.attendance_codeid]), [
    ['111111111', 'L', '1056'],
    ['222222222', 'A', '1051']
  ]);
  assert.equal(data.rows[0].source, 'teacher');
});

test('ClassSession state reads use Practice-isolated DO names and preserve the existing state payload', async () => {
  const { handleTeacherAttendanceReadRequest } = await loadRoute();
  const env = makeEnv({ practice: true });
  const date = todayNY();
  const response = await handleTeacherAttendanceReadRequest(request(`/admin/class_session/state?date=${date}&room=301&periodLocal=1`), env, {});
  assert.equal(response.status, 200);
  const data = await json(response);
  assert.equal(data.ok, true);
  assert.equal(data.students['111111111'].out.isOut, false);
  assert.equal(env.CLASS_SESSION_DO.names.at(-1), `PRACTICE:${date}:cs:${date}:301:1`);
  assert.ok(env.ROSTER.puts.some((put) => put.key.startsWith(`practice:v1:${date}:do_registry:`)));
});

test('non-GET Teacher Attendance mutation methods are not captured by the read handler', async () => {
  const { handleTeacherAttendanceReadRequest } = await loadRoute();
  const env = makeEnv();
  const req = new Request('https://worker.example/admin/teacher_att/submit', {
    method: 'POST', headers: { 'x-admin-session': 'teacher-sid', 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(await handleTeacherAttendanceReadRequest(req, env, {}), null);
});

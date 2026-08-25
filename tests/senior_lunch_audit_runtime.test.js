const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const routeUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/senior-lunch-audit.js')).href;
const serviceUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/senior-lunch-audit.js')).href;

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [
      String(key),
      typeof value === 'string' ? value : JSON.stringify(value)
    ]));
  }

  async get(key, options) {
    const raw = this.map.get(String(key));
    if (raw == null) return null;
    const wantsJson = options === 'json' || options?.type === 'json';
    if (wantsJson) {
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

class FakeStudentLoc {
  constructor(seed = {}) {
    this.byName = new Map();
    this.calls = [];
    for (const [name, states] of Object.entries(seed)) {
      this.byName.set(String(name), structuredClone(states || {}));
    }
  }

  idFromName(name) {
    return String(name);
  }

  get(name) {
    const namespace = this;
    const doName = String(name);
    return {
      async fetch(input, init = {}) {
        const url = new URL(typeof input === 'string' ? input : input.url);
        const method = String(init.method || 'GET').toUpperCase();
        namespace.calls.push({ name: doName, path: url.pathname, search: url.search, method, body: init.body || '' });
        let states = namespace.byName.get(doName);
        if (!states) {
          states = {};
          namespace.byName.set(doName, states);
        }

        if (url.pathname === '/all') {
          return Response.json(structuredClone(states));
        }
        if (url.pathname === '/get') {
          const osis = String(url.searchParams.get('osis') || '');
          const state = states[osis] || null;
          return state ? Response.json(structuredClone(state)) : new Response('', { status: 404 });
        }
        if (url.pathname === '/update' && method === 'POST') {
          const patch = JSON.parse(String(init.body || '{}'));
          const osis = String(patch.osis || '');
          states[osis] = { ...(states[osis] || {}), ...patch };
          return Response.json({ ok: true });
        }
        return new Response('', { status: 404 });
      }
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

function baseDocs(today) {
  return {
    roster_v1: {
      ts: `${today}T08:00:00.000Z`,
      rows: [
        { o: '1001', n: 'Senior One', g: '12', as: true },
        { o: '1002', n: 'Senior Two', g: '12', as: false },
        { o: '1003', n: 'Senior Three', g: '12', as: true }
      ]
    },
    bell_schedule_v1: {
      tz: 'America/New_York',
      periods: [
        { id: 'LCH1', start: '11:00', end: '11:30' },
        { id: 'LCH2', start: '12:00', end: '12:30' }
      ]
    },
    student_classes_v1: {
      classes: {
        '1001': { LCH1: 'RM Caf' },
        '1002': { LCH2: 'Caf' },
        '1003': { LCH1: '405' }
      },
      courses: {
        '1001': { LCH1: 'Lunch' },
        '1002': { LCH2: 'Lunch (Caf)' },
        '1003': { LCH1: 'Study Hall' }
      },
      lunch_dual: {
        '1003': {
          LCH1: {
            original_room: '405',
            original_label: 'Study Hall',
            special_room: 'Caf',
            special_label: 'Lunch (Caf)'
          }
        }
      }
    },
    att_cfg_v1: { webapp_schedule_mode: 'special' }
  };
}

function seedKv(today, extra = {}) {
  const exp = Date.now() + 60 * 60 * 1000;
  return new FakeKV({
    ...baseDocs(today),
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

function envFor(kv, studentLoc, extra = {}) {
  return {
    ROSTER: kv,
    STUDENT_LOC: studentLoc,
    ADMIN_ALLOWLIST: 'boss@school.org',
    ADMIN_TOKEN: 'internal-secret',
    ORIGIN_OK: 'https://app.example',
    ...extra
  };
}

function request(pathname, { sid = 'admin', method = 'GET', body, token, origin = 'https://app.example' } = {}) {
  const headers = new Headers();
  if (sid) headers.set('x-admin-session', sid);
  if (token) headers.set('x-admin-token', token);
  if (origin) headers.set('origin', origin);
  if (body !== undefined) headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
  return new Request(`https://worker.example${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : body
  });
}

test('Senior Lunch state normalization preserves missing-scan and penalty-expiry semantics', async () => {
  const { service } = await modules();
  const today = '2026-08-24';

  let state = service.normalizeSeniorOutInState({
    senior_outin_out_active: true,
    senior_outin_out_date: '2026-08-23',
    senior_outin_out_period_id: 'LCH1',
    senior_outin_out_since: '2026-08-23T16:00:00.000Z'
  }, today);
  assert.equal(state.outActive, false);
  assert.equal(state.penaltyPending, true);
  assert.equal(state.pendingReason, 'missing_scan_back');
  assert.equal(state.lastViolationType, 'missing_scan_back');
  assert.equal(state.lastViolationDate, '2026-08-23');

  state = service.normalizeSeniorOutInState({
    senior_outin_penalty_pending: true,
    senior_outin_penalty_date: '2026-08-23',
    senior_outin_last_violation_type: 'late_return'
  }, today);
  assert.equal(state.penaltyPending, false);
  assert.equal(state.penaltyDate, '');
});

test('Senior Lunch audit preserves counts, sorting, schedule context, and lunch-dual selection', async () => {
  const { service } = await modules();
  const today = '2026-08-24';
  const kv = seedKv(today);
  const loc = new FakeStudentLoc({
    GLOBAL: {
      '1001': {
        date: today,
        zone: 'off_campus',
        senior_outin_penalty_pending: true,
        senior_outin_penalty_date: today,
        senior_outin_last_violation_type: 'late_return',
        senior_outin_last_violation_date: today,
        senior_outin_last_violation_at: `${today}T15:40:00.000Z`
      },
      '1002': {
        date: today,
        zone: 'off_campus',
        senior_outin_out_active: true,
        senior_outin_out_date: today,
        senior_outin_out_period_id: 'LCH2',
        senior_outin_out_period_end_min: 750,
        senior_outin_out_since: `${today}T15:15:00.000Z`
      }
    }
  });
  const env = envFor(kv, loc);
  const result = await service.buildSeniorLunchAudit(env, {
    modeInfo: { mode: 'live', practice: false, practice_day: today },
    date: today,
    nowMin: 665
  });

  assert.equal(result.ok, true);
  assert.equal(result.scheduled_kind, 'now');
  assert.equal(result.scheduled_period_local, 'LCH1');
  assert.deepEqual(result.counts, { blocked_today: 1, last_violations: 1, currently_out: 1 });
  assert.equal(result.blocked_today[0].osis, '1001');
  assert.equal(result.blocked_today[0].block_status, 'active_today');
  assert.equal(result.blocked_today[0].lunch_period_local, 'LCH1');
  assert.equal(result.currently_out[0].osis, '1002');
  assert.equal(result.currently_out[0].return_overdue, false);

  const seniorThree = result.blocked_today.find((row) => row.osis === '1003');
  assert.equal(seniorThree, undefined);
  const specialSlot = service.resolvedSeniorLunchScheduleSlot(await kv.get('student_classes_v1', { type: 'json' }), '1003', 'LCH1', 'special');
  assert.equal(specialSlot.room, 'Caf');
  assert.equal(specialSlot.course, 'Lunch (Caf)');
});

test('Practice audit reads only the Practice StudentLocationDO namespace and fails closed on mode read errors', async () => {
  const { service } = await modules();
  const today = service.getNYCDate();
  const practiceName = `PRACTICE:${today}:GLOBAL`;
  const kv = seedKv(today, { 'system:mode:v1': { mode: 'practice', practice_day: today } });
  const loc = new FakeStudentLoc({
    GLOBAL: {
      '1001': {
        date: today,
        senior_outin_penalty_pending: true,
        senior_outin_last_violation_type: 'late_return'
      }
    },
    [practiceName]: {
      '1002': {
        date: today,
        senior_outin_penalty_pending: true,
        senior_outin_last_violation_type: 'missing_scan_back'
      }
    }
  });
  const env = envFor(kv, loc);
  const mode = await service.loadSeniorLunchModeInfo(env);
  assert.equal(mode.practice, true);
  const audit = await service.buildSeniorLunchAudit(env, { modeInfo: mode, date: today, nowMin: 665 });
  assert.deepEqual(audit.blocked_today.map((row) => row.osis), ['1002']);
  assert.equal(loc.calls.some((call) => call.name === 'GLOBAL' && call.path === '/all'), false);
  assert.equal(loc.calls.some((call) => call.name === practiceName && call.path === '/all'), true);

  const failClosed = await service.loadSeniorLunchModeInfo({
    ROSTER: { async get() { throw new Error('mode unavailable'); } }
  });
  assert.equal(failClosed.practice, true);
  assert.equal(failClosed.fail_closed, true);

  const missingStore = await service.loadSeniorLunchModeInfo({});
  assert.equal(missingStore.practice, true);
  assert.equal(missingStore.fail_closed, true);
  assert.equal(missingStore.mode_read_error, 'mode_store_not_bound');
});

test('Senior Lunch routes retain Admin/Super Admin/token access while ordinary editors are denied', async () => {
  const { route, service } = await modules();
  const today = service.getNYCDate();
  const kv = seedKv(today);
  const loc = new FakeStudentLoc({ GLOBAL: {} });
  const env = envFor(kv, loc);

  let response = await route.handleSeniorLunchAuditRequest(request('/admin/senior_outin_audit', { sid: 'editor' }), env, {});
  assert.equal(response.status, 403);

  response = await route.handleSeniorLunchAuditRequest(request('/admin/senior_outin_audit', { sid: 'admin' }), env, {});
  assert.equal(response.status, 200);

  response = await route.handleSeniorLunchAuditRequest(request('/admin/senior_outin_audit', { sid: 'super' }), env, {});
  assert.equal(response.status, 200);

  response = await route.handleSeniorLunchAuditRequest(request('/admin/senior_outin_audit', {
    sid: null,
    token: 'internal-secret',
    origin: ''
  }), env, {});
  assert.equal(response.status, 200);
});

test('Forgive preserves form contract, View-as/origin guards, and exact StudentLocation patch behavior', async () => {
  const { route, service } = await modules();
  const today = service.getNYCDate();
  const kv = seedKv(today);
  const loc = new FakeStudentLoc({
    GLOBAL: {
      '1001': {
        date: today,
        student_name: 'Senior One',
        senior_outin_out_active: true,
        senior_outin_out_date: today,
        senior_outin_out_period_id: 'LCH1',
        senior_outin_out_period_end_min: 690,
        senior_outin_out_since: `${today}T15:00:00.000Z`,
        senior_outin_penalty_pending: true,
        senior_outin_last_violation_type: 'late_return',
        senior_outin_last_violation_date: today,
        senior_outin_last_violation_at: `${today}T15:35:00.000Z`
      }
    }
  });
  const env = envFor(kv, loc);

  let response = await route.handleSeniorLunchAuditRequest(request('/admin/senior_outin_forgive', {
    sid: 'view', method: 'POST', body: 'osis=1001'
  }), env, {});
  let data = await response.json();
  assert.equal(response.status, 403);
  assert.equal(data.error, 'view_as_read_only');

  response = await route.handleSeniorLunchAuditRequest(request('/admin/senior_outin_forgive', {
    sid: 'super', method: 'POST', body: 'osis=1001', origin: 'https://evil.example'
  }), env, {});
  data = await response.json();
  assert.equal(response.status, 403);
  assert.equal(data.error, 'origin_forbidden');

  response = await route.handleSeniorLunchAuditRequest(request('/admin/senior_outin_forgive', {
    sid: 'admin', method: 'POST', body: ''
  }), env, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'missing_osis');

  response = await route.handleSeniorLunchAuditRequest(request('/admin/senior_outin_forgive', {
    sid: 'admin', method: 'POST', body: 'osis=9999'
  }), env, {});
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'student_state_not_found');

  response = await route.handleSeniorLunchAuditRequest(request('/admin/senior_outin_forgive', {
    sid: 'admin', method: 'POST', body: 'osis=1001'
  }), env, {});
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.forgiven, true);
  assert.equal(data.forgiven_by, 'admin@school.org');

  const update = loc.calls.find((call) => call.name === 'GLOBAL' && call.path === '/update');
  assert.ok(update);
  const patch = JSON.parse(update.body);
  assert.equal(patch.osis, '1001');
  assert.equal(patch.senior_outin_out_active, false);
  assert.equal(patch.senior_outin_out_date, null);
  assert.equal(patch.senior_outin_penalty_pending, false);
  assert.equal(patch.senior_outin_penalty_date, null);
  assert.equal(patch.senior_outin_last_violation_type, 'late_return');
  assert.equal(patch.senior_outin_last_forgiven_by, 'admin@school.org');
});

test('Practice Forgive writes only the Practice StudentLocationDO namespace', async () => {
  const { route, service } = await modules();
  const today = service.getNYCDate();
  const practiceName = `PRACTICE:${today}:GLOBAL`;
  const kv = seedKv(today, { 'system:mode:v1': { mode: 'practice', practice_day: today } });
  const loc = new FakeStudentLoc({
    GLOBAL: {
      '1001': { date: today, senior_outin_penalty_pending: true }
    },
    [practiceName]: {
      '1001': {
        date: today,
        senior_outin_penalty_pending: true,
        senior_outin_last_violation_type: 'late_return'
      }
    }
  });
  const env = envFor(kv, loc);

  const response = await route.handleSeniorLunchAuditRequest(request('/admin/senior_outin_forgive', {
    sid: 'admin', method: 'POST', body: 'osis=1001'
  }), env, {});
  assert.equal(response.status, 200);
  assert.equal(loc.calls.some((call) => call.name === 'GLOBAL' && call.path === '/update'), false);
  assert.equal(loc.calls.some((call) => call.name === practiceName && call.path === '/update'), true);
});

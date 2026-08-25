const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const routeUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/supervised-lunch.js')).href;
const serviceUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/supervised-lunch.js')).href;

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
    const wantsJson = options === 'json' || options?.type === 'json';
    if (wantsJson) {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  }

  async put(key, value, options = {}) {
    this.puts.push({ key: String(key), value: String(value), options: { ...(options || {}) } });
    this.map.set(String(key), String(value));
  }

  async delete(key) {
    this.map.delete(String(key));
  }
}

async function modules() {
  const nonce = `${Date.now()}-${Math.random()}`;
  return {
    route: await import(`${routeUrl}?v=${nonce}`),
    service: await import(`${serviceUrl}?v=${nonce}`)
  };
}

function baseDocs(today, scheduleMode = 'special') {
  return {
    roster_v1: {
      rows: [
        { o: '1001', n: 'Alpha Lunch', g: '9' },
        { o: '1002', n: 'Beta Lunch', g: '10' },
        { o: '1003', n: 'Gamma Dual', g: '11' },
        { o: '1004', n: 'Delta Class', g: '12' }
      ]
    },
    student_classes_v1: {
      classes: {
        '1001': { LCH1: 'RM Caf' },
        '1002': { LCH2: 'Lunch' },
        '1003': { LCH1: '405' },
        '1004': { LCH1: '410' }
      },
      courses: {
        '1001': { LCH1: 'Lunch' },
        '1002': { LCH2: 'Lunch (Caf)' },
        '1003': { LCH1: 'Study Hall' },
        '1004': { LCH1: 'ELA400.1' }
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
    att_cfg_v1: { webapp_schedule_mode: scheduleMode },
    locs_v1: {
      locations: [
        { name: '410', type: 'class' },
        { name: '306', type: 'class' },
        { name: 'Main Office', type: 'office' }
      ]
    },
    [`supervised_lunch_v1:${today}`]: {
      date: today,
      assignments: [
        {
          teacherEmail: 'teacher@school.org',
          periodLocal: 'LCH1',
          room: '306',
          label: 'Supervised Lunch (306)',
          osisList: ['1001'],
          updatedAt: `${today}T12:00:00.000Z`
        },
        {
          teacherEmail: 'other@school.org',
          periodLocal: 'LCH1',
          room: '410',
          label: 'Supervised Lunch (410)',
          osisList: ['1003'],
          updatedAt: `${today}T12:01:00.000Z`
        }
      ]
    },
    'supervised_lunch_last_set_v1:teacher@school.org|LCH1': {
      teacherEmail: 'teacher@school.org',
      periodLocal: 'LCH1',
      room: '306',
      osisList: ['1001'],
      updatedAt: `${today}T12:00:00.000Z`
    }
  };
}

function seedKv(today, scheduleMode = 'special', extra = {}) {
  const exp = Date.now() + 60 * 60 * 1000;
  return new FakeKV({
    ...baseDocs(today, scheduleMode),
    'admin:sessions:super': { email: 'boss@school.org', role: 'super_admin', exp },
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

function request(pathname, { sid = 'editor', method = 'GET', body, token, origin = 'https://app.example' } = {}) {
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

test('Supervised Lunch assignment normalization preserves legacy room, sorting, and duplicate semantics', async () => {
  const { service } = await modules();
  const rec = service.normalizeSupervisedLunchAssignmentRecord({
    teacher_email: ' Teacher@School.org ',
    period_local: 'lch1',
    room: 'RM 306',
    osis_list: ['1002', '1001', '1002']
  }, '2026-08-25T00:00:00.000Z');
  assert.deepEqual(rec, {
    teacherEmail: 'teacher@school.org',
    periodLocal: 'LCH1',
    room: '306',
    label: 'Supervised Lunch (306)',
    osisList: ['1001', '1002'],
    count: 2,
    updatedAt: '2026-08-25T00:00:00.000Z'
  });
  assert.equal(service.normalizeSupervisedLunchAssignmentRecord({
    teacherEmail: 'teacher@school.org', periodLocal: 'P1', room: '306', osisList: ['1001']
  }), null);
});

test('eligibility exactly follows Caf/Lunch resolution and original-vs-special lunch_dual mode', async () => {
  const { service } = await modules();
  const today = '2026-08-25';
  const special = baseDocs(today, 'special');
  const original = baseDocs(today, 'original');
  assert.deepEqual(
    service.supervisedLunchEligibleStudentsForPeriod(special.roster_v1, special.student_classes_v1, 'LCH1', 'special').map((x) => x.osis),
    ['1001', '1003']
  );
  assert.deepEqual(
    service.supervisedLunchEligibleStudentsForPeriod(original.roster_v1, original.student_classes_v1, 'LCH1', 'original').map((x) => x.osis),
    ['1001']
  );
  assert.deepEqual(
    service.supervisedLunchEligibleStudentsForPeriod(special.roster_v1, special.student_classes_v1, 'LCH2', 'special').map((x) => x.osis),
    ['1002']
  );
});

test('Options preserves teacher-specific assignments, class-room sorting, eligible lists, and last-used contract', async () => {
  const { service } = await modules();
  const today = '2026-08-25';
  const kv = seedKv(today);
  const result = await service.buildSupervisedLunchOptions(
    envFor(kv),
    { mode: 'live', practice: false, practice_day: today },
    'teacher@school.org',
    today
  );
  assert.equal(result.ok, true);
  assert.equal(result.teacherEmail, 'teacher@school.org');
  assert.deepEqual(result.lunch_periods, ['LCH1', 'LCH2']);
  assert.deepEqual(result.rooms, ['306', '410']);
  assert.deepEqual(result.eligible_by_period.LCH1.map((x) => x.osis), ['1001', '1003']);
  assert.deepEqual(result.eligible_by_period.LCH2.map((x) => x.osis), ['1002']);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].room, '306');
  assert.deepEqual(result.last_used_by_period.LCH1.osisList, ['1001']);
});

test('ordinary authenticated staff and internal token retain Options access', async () => {
  const { route, service } = await modules();
  const today = service.getNYCDate();
  const kv = seedKv(today);
  const env = envFor(kv);

  let response = await route.handleSupervisedLunchRequest(request('/admin/supervised_lunch/options', { sid: 'editor' }), env, {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).teacherEmail, 'teacher@school.org');

  response = await route.handleSupervisedLunchRequest(request('/admin/supervised_lunch/options', {
    sid: null,
    token: 'internal-secret',
    origin: ''
  }), env, {});
  assert.equal(response.status, 200);
});

test('Save remains available to ordinary staff but blocks View-as and disallowed origins', async () => {
  const { route, service } = await modules();
  const today = service.getNYCDate();
  const kv = seedKv(today);
  const env = envFor(kv);

  let response = await route.handleSupervisedLunchRequest(request('/admin/supervised_lunch/save', {
    sid: 'view', method: 'POST', body: { date: today, periodLocal: 'LCH1', room: '306', osisList: ['1001'] }
  }), env, {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'view_as_read_only');

  response = await route.handleSupervisedLunchRequest(request('/admin/supervised_lunch/save', {
    sid: 'editor', method: 'POST', origin: 'https://evil.example', body: { date: today, periodLocal: 'LCH1', room: '306', osisList: ['1001'] }
  }), env, {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'origin_forbidden');

  response = await route.handleSupervisedLunchRequest(request('/admin/supervised_lunch/save', {
    sid: 'editor', method: 'POST', body: { date: today, periodLocal: 'LCH1', room: '306', osisList: ['1003'] }
  }), env, {});
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.saved, true);
  assert.equal(data.teacherEmail, 'teacher@school.org');
  assert.deepEqual(data.assignment.osisList, ['1003']);
});

test('Save preserves validation and replaces only the same teacher-period-room group', async () => {
  const { service } = await modules();
  const today = '2026-08-25';
  const kv = seedKv(today);
  const env = envFor(kv);
  const mode = { mode: 'live', practice: false, practice_day: today };

  let result = await service.saveSupervisedLunchForTeacher(env, mode, 'teacher@school.org', {
    date: today, periodLocal: 'P1', room: '306', osisList: ['1001']
  });
  assert.equal(result.error, 'invalid_lunch_period');

  result = await service.saveSupervisedLunchForTeacher(env, mode, 'teacher@school.org', {
    date: today, periodLocal: 'LCH1', room: '', osisList: ['1001']
  });
  assert.equal(result.error, 'room_required');

  result = await service.saveSupervisedLunchForTeacher(env, mode, 'teacher@school.org', {
    date: today, periodLocal: 'LCH1', room: '306', osisList: ['1004']
  });
  assert.equal(result.error, 'invalid_students_for_lunch_period');
  assert.deepEqual(result.invalidOsis, ['1004']);

  result = await service.saveSupervisedLunchForTeacher(env, mode, 'teacher@school.org', {
    date: today, periodLocal: 'LCH1', room: '306', osisList: ['1003']
  });
  assert.equal(result.ok, true);
  const stored = await kv.get(`supervised_lunch_v1:${today}`, { type: 'json' });
  assert.equal(stored.assignments.length, 2);
  assert.ok(stored.assignments.some((x) => x.teacherEmail === 'other@school.org' && x.room === '410'));
  const mine = stored.assignments.find((x) => x.teacherEmail === 'teacher@school.org' && x.room === '306');
  assert.deepEqual(mine.osisList, ['1003']);
});

test('clearing a group removes the assignment but preserves the last-used set', async () => {
  const { service } = await modules();
  const today = '2026-08-25';
  const kv = seedKv(today);
  const env = envFor(kv);
  const mode = { mode: 'live', practice: false, practice_day: today };

  await service.saveSupervisedLunchForTeacher(env, mode, 'teacher@school.org', {
    date: today, periodLocal: 'LCH1', room: '306', osisList: ['1003']
  });
  const lastBefore = await kv.get('supervised_lunch_last_set_v1:teacher@school.org|LCH1', { type: 'json' });
  assert.deepEqual(lastBefore.osisList, ['1003']);

  const result = await service.saveSupervisedLunchForTeacher(env, mode, 'teacher@school.org', {
    date: today, periodLocal: 'LCH1', room: '306', osisList: []
  });
  assert.equal(result.saved, false);
  const stored = await kv.get(`supervised_lunch_v1:${today}`, { type: 'json' });
  assert.equal(stored.assignments.some((x) => x.teacherEmail === 'teacher@school.org' && x.room === '306'), false);
  const lastAfter = await kv.get('supervised_lunch_last_set_v1:teacher@school.org|LCH1', { type: 'json' });
  assert.deepEqual(lastAfter.osisList, ['1003']);
});

test('Practice Options and Save use only Practice-prefixed assignment/last-set/audit keys with 36-hour TTL', async () => {
  const { service } = await modules();
  const today = service.getNYCDate();
  const prefix = `practice:v1:${today}:`;
  const liveDocs = baseDocs(today);
  delete liveDocs[`supervised_lunch_v1:${today}`];
  delete liveDocs['supervised_lunch_last_set_v1:teacher@school.org|LCH1'];
  const kv = seedKv(today, 'special', {
    ...liveDocs,
    'system:mode:v1': { mode: 'practice' },
    [`${prefix}supervised_lunch_v1:${today}`]: {
      date: today,
      assignments: [{ teacherEmail: 'teacher@school.org', periodLocal: 'LCH1', room: '306', osisList: ['1001'] }]
    },
    [`${prefix}supervised_lunch_last_set_v1:teacher@school.org|LCH1`]: {
      teacherEmail: 'teacher@school.org', periodLocal: 'LCH1', room: '306', osisList: ['1001']
    }
  });
  const env = envFor(kv);
  const mode = await service.loadSupervisedLunchModeInfo(env);
  assert.equal(mode.practice, true);
  const opts = await service.buildSupervisedLunchOptions(env, mode, 'teacher@school.org', today);
  assert.equal(opts.assignments.length, 1);

  await service.saveSupervisedLunchForTeacher(env, mode, 'teacher@school.org', {
    date: today, periodLocal: 'LCH1', room: '306', osisList: ['1003']
  });

  const writes = kv.puts.filter((x) => x.key.includes('supervised_lunch') || x.key.includes('audit:'));
  assert.ok(writes.length >= 3);
  assert.equal(writes.every((x) => x.key.startsWith(prefix)), true);
  assert.equal(writes.every((x) => Number(x.options.expirationTtl) === 36 * 60 * 60), true);
  assert.equal(kv.puts.some((x) => x.key === `supervised_lunch_v1:${today}`), false);
});

test('mode lookup failure fails closed to Practice before Supervised Lunch operational writes', async () => {
  const { service } = await modules();
  const today = service.getNYCDate();
  const kv = seedKv(today);
  const originalGet = kv.get.bind(kv);
  kv.get = async (key, options) => {
    if (String(key) === 'system:mode:v1') throw new Error('mode unavailable');
    return originalGet(key, options);
  };
  const mode = await service.loadSupervisedLunchModeInfo(envFor(kv));
  assert.equal(mode.practice, true);
  assert.equal(mode.fail_closed, true);
  assert.equal(service.supervisedLunchOperationalKey(mode, `supervised_lunch_v1:${today}`, today), `practice:v1:${today}:supervised_lunch_v1:${today}`);
});

test('Practice Supervised Lunch ignores stale requested dates and stays on the global practice day', async () => {
  const { service } = await modules();
  const today = service.getNYCDate();
  const stale = '1999-01-01';
  const prefix = `practice:v1:${today}:`;
  const kv = seedKv(today, 'special', {
    'system:mode:v1': { mode: 'practice' },
    [`${prefix}supervised_lunch_v1:${today}`]: {
      date: today,
      assignments: [{ teacherEmail: 'teacher@school.org', periodLocal: 'LCH1', room: '306', osisList: ['1001'] }]
    }
  });
  const env = envFor(kv);
  const mode = await service.loadSupervisedLunchModeInfo(env);

  const opts = await service.buildSupervisedLunchOptions(env, mode, 'teacher@school.org', stale);
  assert.equal(opts.date, today);

  const saved = await service.saveSupervisedLunchForTeacher(env, mode, 'teacher@school.org', {
    date: stale, periodLocal: 'LCH1', room: '306', osisList: ['1003']
  });
  assert.equal(saved.date, today);
  assert.equal(kv.puts.some((x) => x.key.startsWith(`practice:v1:${stale}:`)), false);
  assert.equal(kv.puts.some((x) => x.key === `${prefix}supervised_lunch_v1:${today}`), true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
const serviceUrl = pathToFileURL(path.join(root, 'cf-redcake/red-cake-77d5/src/services/dreamer-of-week.js')).href;
const routeUrl = pathToFileURL(path.join(root, 'cf-redcake/red-cake-77d5/src/routes/dreamer-of-week.js')).href;

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
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

function academicRoster() {
  const students = {};
  for (let i = 1; i <= 9; i++) {
    const osis = `10000000${i}`;
    students[osis] = { osis, name: `Science Student ${i}`, grade: '9', email: `s${i}@school.org` };
  }
  students['200000001'] = { osis: '200000001', name: 'Math Student 1', grade: '9' };
  students['200000002'] = { osis: '200000002', name: 'Math Student 2', grade: '9' };

  return {
    v: 1,
    ts: Date.now(),
    generated_at_iso: new Date().toISOString(),
    source_generated_at_iso: new Date().toISOString(),
    source_date: '2026-08-24',
    source: {},
    health: { status: 'ok', counts: {}, issues: [], issue_count: 0, error_count: 0 },
    students_by_osis: students,
    staff_mapping_by_email: {
      'teacher1@school.org': { email: 'teacher1@school.org', name: 'Teacher One', teacher_assignment_match: 'T1', status: 'ok' },
      'teacher2@school.org': { email: 'teacher2@school.org', name: 'Teacher Two', teacher_assignment_match: 'T2', status: 'ok' }
    },
    teachers_by_email: {
      'teacher1@school.org': {
        email: 'teacher1@school.org', name: 'Teacher One', teacher_assignment_match: 'T1',
        courses: {
          SCI100: { name: 'Science', sections: ['SCI100.1'], students: ['100000001', '100000002', '100000005', '100000006', '100000007', '100000008', '100000009'] },
          MTH100: { name: 'Math', sections: ['MTH100.1'], students: ['200000001', '200000002'] }
        }
      },
      'teacher2@school.org': {
        email: 'teacher2@school.org', name: 'Teacher Two', teacher_assignment_match: 'T2',
        courses: {
          SCI100: { name: 'Science', sections: ['SCI100.2'], students: ['100000003', '100000004'] }
        }
      }
    },
    courses: {
      SCI100: { name: 'Science', students: Array.from({ length: 9 }, (_, i) => `10000000${i + 1}`) },
      MTH100: { name: 'Math', students: ['200000001', '200000002'] }
    }
  };
}

async function loadModules() {
  const nonce = `${Date.now()}-${Math.random()}`;
  return {
    service: await import(`${serviceUrl}?v=${nonce}`),
    route: await import(`${routeUrl}?v=${nonce}`)
  };
}

function liveMode() {
  return { mode: 'live', practice: false, practice_day: '2026-08-24' };
}

function practiceMode() {
  return { mode: 'practice', practice: true, practice_day: '2026-08-24' };
}

test('shared-course selections are course-wide even when teachers see only their own sections', async () => {
  const { service } = await loadModules();
  const roster = academicRoster();
  const kv = new FakeKV();
  const env = { ROSTER: kv };

  let result = await service.setDowRecipient(env, liveMode(), { email: 'teacher1@school.org', role: 'editor' }, roster, {
    band: '9_10', course_code: 'SCI100', osis: '100000001', selected: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.course_selected, 1);

  result = await service.setDowRecipient(env, liveMode(), { email: 'teacher2@school.org', role: 'editor' }, roster, {
    band: '9_10', course_code: 'SCI100', osis: '100000003', selected: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.course_selected, 2);

  const state1 = await service.buildDowState(env, liveMode(), { email: 'teacher1@school.org', role: 'editor' }, roster);
  const state2 = await service.buildDowState(env, liveMode(), { email: 'teacher2@school.org', role: 'editor' }, roster);
  assert.equal(state1.courses.find((c) => c.course_code === 'SCI100').bands['9_10'].course_selected, 2);
  assert.equal(state2.courses.find((c) => c.course_code === 'SCI100').bands['9_10'].course_selected, 2);
  assert.equal(state1.courses.find((c) => c.course_code === 'SCI100').bands['9_10'].students.length, 7);
  assert.equal(state2.courses.find((c) => c.course_code === 'SCI100').bands['9_10'].students.length, 2);
});

test('DOW refuses a ninth recipient and rejects students outside the teachers sections', async () => {
  const { service } = await loadModules();
  const roster = academicRoster();
  // Temporarily let Teacher One own the first eight for this ceiling test.
  roster.teachers_by_email['teacher1@school.org'].courses.SCI100.students = Array.from({ length: 9 }, (_, i) => `10000000${i + 1}`);
  const kv = new FakeKV();
  const env = { ROSTER: kv };

  for (let i = 1; i <= 8; i++) {
    const result = await service.setDowRecipient(env, liveMode(), { email: 'teacher1@school.org', role: 'editor' }, roster, {
      band: '9_10', course_code: 'SCI100', osis: `10000000${i}`, selected: true
    });
    assert.equal(result.ok, true);
  }
  const ninth = await service.setDowRecipient(env, liveMode(), { email: 'teacher1@school.org', role: 'editor' }, roster, {
    band: '9_10', course_code: 'SCI100', osis: '100000009', selected: true
  });
  assert.equal(ninth.ok, false);
  assert.equal(ninth.status, 409);
  assert.equal(ninth.error, 'course_recipient_limit_reached');
  assert.equal(ninth.max, 8);

  roster.teachers_by_email['teacher1@school.org'].courses.SCI100.students = ['100000001'];
  const outside = await service.setDowRecipient(env, liveMode(), { email: 'teacher1@school.org', role: 'editor' }, roster, {
    band: '9_10', course_code: 'SCI100', osis: '100000002', selected: true
  });
  assert.equal(outside.ok, false);
  assert.equal(outside.error, 'student_not_in_teachers_sections');
});

test('reset blocks incomplete courses then archives recipients and advances only the selected band', async () => {
  const { service } = await loadModules();
  const roster = academicRoster();
  const kv = new FakeKV();
  const env = { ROSTER: kv };
  const mode = liveMode();

  // Make Teacher One able to seed the two required SCI recipients for this test.
  roster.teachers_by_email['teacher1@school.org'].courses.SCI100.students = ['100000001', '100000002'];
  await service.setDowRecipient(env, mode, { email: 'teacher1@school.org', role: 'editor' }, roster, { band: '9_10', course_code: 'SCI100', osis: '100000001', selected: true });
  await service.setDowRecipient(env, mode, { email: 'teacher1@school.org', role: 'editor' }, roster, { band: '9_10', course_code: 'SCI100', osis: '100000002', selected: true });

  let reset = await service.resetDowBand(env, mode, { email: 'admin@school.org', role: 'admin' }, roster, '9_10');
  assert.equal(reset.ok, false);
  assert.equal(reset.error, 'dow_courses_incomplete');
  assert.ok(reset.incomplete_courses.some((c) => c.course_code === 'MTH100'));

  await service.setDowRecipient(env, mode, { email: 'teacher1@school.org', role: 'editor' }, roster, { band: '9_10', course_code: 'MTH100', osis: '200000001', selected: true });
  await service.setDowRecipient(env, mode, { email: 'teacher1@school.org', role: 'editor' }, roster, { band: '9_10', course_code: 'MTH100', osis: '200000002', selected: true });

  const before1112 = await service.ensureDowCycle(env, mode, '11_12');
  reset = await service.resetDowBand(env, mode, { email: 'admin@school.org', role: 'admin' }, roster, '9_10');
  assert.equal(reset.ok, true);
  assert.equal(reset.archived_recipients, 4);
  assert.equal(reset.next_cycle.sequence, 2);
  assert.equal(reset.next_cycle.previous_cycle_id, reset.closed_cycle.cycle_id);

  const history = await kv.get('dow:history_counts_v1', { type: 'json' });
  assert.equal(history.total_awards, 4);
  assert.equal(history.counts['100000001'], 1);
  assert.equal(history.counts['200000002'], 1);

  const archive = await kv.get(`dow:archive:v1:9_10:${reset.closed_cycle.cycle_id}`, { type: 'json' });
  assert.equal(archive.recipients.length, 4);
  const after1112 = await service.ensureDowCycle(env, mode, '11_12');
  assert.equal(after1112.cycle_id, before1112.cycle_id);
});

test('Practice DOW writes only Practice-prefixed operational keys with a 36-hour ceiling', async () => {
  const { service } = await loadModules();
  const roster = academicRoster();
  const kv = new FakeKV({ 'system:mode:v1': { mode: 'practice' } });
  const env = { ROSTER: kv };
  const mode = practiceMode();

  const result = await service.setDowRecipient(env, mode, { email: 'teacher1@school.org', role: 'editor' }, roster, {
    band: '9_10', course_code: 'SCI100', osis: '100000001', selected: true
  });
  assert.equal(result.ok, true);

  const keys = Array.from(kv.map.keys());
  const operationalKeys = keys.filter((key) => key.includes('dow:') || key.includes('audit:'));
  assert.ok(operationalKeys.length >= 3);
  assert.ok(operationalKeys.every((key) => key.startsWith('practice:v1:2026-08-24:')));
  assert.equal(keys.some((key) => key.startsWith('dow:cycle:')), false);
  assert.equal(keys.some((key) => key.startsWith('dow:selection:')), false);
  assert.ok(kv.puts.filter((put) => put.key.startsWith('practice:v1:2026-08-24:')).every((put) => Number(put.options?.expirationTtl) === 36 * 60 * 60));
});

test('modular DOW route allows View-as reads but blocks recipient mutation', async () => {
  const { route } = await loadModules();
  const exp = Date.now() + 60 * 60 * 1000;
  const roster = academicRoster();
  const kv = new FakeKV({
    'system:mode:v1': { mode: 'live' },
    'admin:sessions:super-sid': { email: 'boss@school.org', role: 'super_admin', view_as_email: 'teacher1@school.org', exp },
    'academic_roster_v1': roster
  });
  const env = { ROSTER: kv, ADMIN_ALLOWLIST: 'boss@school.org', ORIGIN_OK: 'https://app.example' };

  let req = new Request('https://worker.example/admin/dow/state', {
    method: 'GET', headers: { 'x-admin-session': 'super-sid', origin: 'https://app.example' }
  });
  let response = await route.handleDreamerOfWeekRequest(req, env, {});
  let data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.who.email, 'teacher1@school.org');
  assert.equal(data.teacher_mapping_ok, true);

  req = new Request('https://worker.example/admin/dow/recipient', {
    method: 'POST',
    headers: { 'x-admin-session': 'super-sid', origin: 'https://app.example', 'content-type': 'application/json' },
    body: JSON.stringify({ band: '9_10', course_code: 'SCI100', osis: '100000001', selected: true })
  });
  response = await route.handleDreamerOfWeekRequest(req, env, {});
  data = await response.json();
  assert.equal(response.status, 403);
  assert.equal(data.error, 'view_as_read_only');
});

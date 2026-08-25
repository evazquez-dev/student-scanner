const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const serviceUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/student-view.js')).href;

class FakeKV {
  constructor(seed = {}, { throwModeRead = false } = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [
      String(key),
      typeof value === 'string' ? value : JSON.stringify(value)
    ]));
    this.puts = [];
    this.throwModeRead = throwModeRead;
  }
  async get(key, options) {
    if (this.throwModeRead && String(key) === 'system:mode:v1') throw new Error('mode unavailable');
    const raw = this.map.get(String(key));
    if (raw == null) return null;
    if (options?.type === 'json' || options === 'json') return JSON.parse(raw);
    return raw;
  }
  async put(key, value, options) {
    this.puts.push({ key: String(key), value: String(value), options: options || {} });
    this.map.set(String(key), String(value));
  }
}

function fakeDO(responseFactory) {
  return {
    names: [],
    urls: [],
    idFromName(name) {
      this.names.push(String(name));
      return String(name);
    },
    get() {
      const self = this;
      return {
        async fetch(url) {
          self.urls.push(String(url));
          const payload = responseFactory(String(url));
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
      };
    }
  };
}

function baseSeed(mode = 'live', scheduleMode = 'special') {
  return {
    'system:mode:v1': { mode },
    'roster_v1': {
      ts: '2026-08-25T12:00:00.000Z',
      rows: [{ o: '123', n: 'Student One', e: 'student1@example.org' }]
    },
    'bell_schedule_v1': {
      tz: 'America/New_York',
      periods: [{ id: '1', start: '00:00', end: '23:59' }]
    },
    'student_classes_v1': {
      classes: { '123': { '1': 'RM 306' } },
      courses: { '123': { '1': 'ELA100.1' } }
    },
    'att_cfg_v1': { webapp_schedule_mode: scheduleMode }
  };
}

async function service() {
  return import(`${serviceUrl}?v=${Date.now()}-${Math.random()}`);
}

test('Student View live dashboard reads the live StudentLocation, Attendance, and ClassSession objects', async () => {
  const mod = await service();
  const kv = new FakeKV(baseSeed('live'));
  const studentLoc = fakeDO(() => ({ osis: '123', zone: 'class', loc: '306', location_label: 'Room 306' }));
  const attendance = fakeDO(() => ({ ok: true, row: { status: 'Present', firstISO: '2026-08-25T12:00:00.000Z' } }));
  const classSession = fakeDO(() => ({ ok: true, rec: { firstInISO: '2026-08-25T12:00:00.000Z', out: { isOut: false } } }));
  const env = { ROSTER: kv, STUDENT_LOC: studentLoc, ATTENDANCE_DO: attendance, CLASS_SESSION_DO: classSession };

  const modeInfo = await mod.loadStudentViewModeInfo(env);
  const result = await mod.buildStudentDashboard(env, modeInfo, '123');

  assert.equal(result.ok, true);
  assert.equal(result.student.name, 'Student One');
  assert.equal(result.schedule.now.periodLocal, '1');
  assert.equal(result.schedule.now.room, '306');
  assert.equal(result.schedule.now.course, 'ELA100.1');
  assert.equal(result.location.location_label, 'Room 306');
  assert.equal(result.attendance.status, 'Present');
  assert.equal(result.session.out.isOut, false);
  assert.deepEqual(studentLoc.names, ['GLOBAL']);
  assert.deepEqual(attendance.names, [`att:${result.date}`]);
  assert.deepEqual(classSession.names, [`cs:${result.date}:306:1`]);
  assert.equal(kv.puts.length, 0);
});

test('Student View Practice dashboard stays in Practice Durable Objects and registers its class-session read', async () => {
  const mod = await service();
  const kv = new FakeKV(baseSeed('practice'));
  const studentLoc = fakeDO(() => ({ osis: '123', zone: 'hallway', loc: 'hall', location_label: 'Hallway' }));
  const attendance = fakeDO(() => ({ ok: true, row: { status: 'Late' } }));
  const classSession = fakeDO(() => ({ ok: true, rec: { out: { isOut: true, reason: 'bathroom' } } }));
  const env = { ROSTER: kv, STUDENT_LOC: studentLoc, ATTENDANCE_DO: attendance, CLASS_SESSION_DO: classSession };

  const modeInfo = await mod.loadStudentViewModeInfo(env);
  const result = await mod.buildStudentDashboard(env, modeInfo, '123');
  const day = modeInfo.practice_day;

  assert.equal(result.ok, true);
  assert.equal(modeInfo.practice, true);
  assert.deepEqual(studentLoc.names, [`PRACTICE:${day}:GLOBAL`]);
  assert.deepEqual(attendance.names, [`PRACTICE:${day}:att:${result.date}`]);
  assert.deepEqual(classSession.names, [`PRACTICE:${day}:cs:${result.date}:306:1`]);
  assert.equal(kv.puts.length, 1);
  assert.match(kv.puts[0].key, new RegExp(`^practice:v1:${day}:do_registry:`));
  assert.equal(kv.puts[0].options.expirationTtl, 36 * 60 * 60);
});

test('Student View mode read failure fails closed to Practice for dashboard DO reads', async () => {
  const mod = await service();
  const seed = baseSeed('live');
  const kv = new FakeKV(seed, { throwModeRead: true });
  const studentLoc = fakeDO(() => ({ osis: '123' }));
  const env = {
    ROSTER: kv,
    STUDENT_LOC: studentLoc,
    ATTENDANCE_DO: fakeDO(() => ({ ok: true, row: null })),
    CLASS_SESSION_DO: fakeDO(() => ({ ok: true, rec: null }))
  };

  const modeInfo = await mod.loadStudentViewModeInfo(env);
  const result = await mod.buildStudentDashboard(env, modeInfo, '123');

  assert.equal(modeInfo.practice, true);
  assert.equal(modeInfo.fail_closed, true);
  assert.equal(result.ok, true);
  assert.deepEqual(studentLoc.names, [`PRACTICE:${modeInfo.practice_day}:GLOBAL`]);
});

test('Student View dashboard preserves validation and student-not-found behavior', async () => {
  const mod = await service();
  const kv = new FakeKV(baseSeed('live'));
  const env = { ROSTER: kv };
  const modeInfo = await mod.loadStudentViewModeInfo(env);

  let result = await mod.buildStudentDashboard(env, modeInfo, '');
  assert.equal(result.status, 400);
  assert.equal(result.error, 'osis_required');

  result = await mod.buildStudentDashboard(env, modeInfo, '999');
  assert.equal(result.status, 404);
  assert.equal(result.error, 'student_not_found');
});

test('Student View schedule keeps lunch dual special/original selection semantics', async () => {
  const mod = await service();
  const seed = baseSeed('live', 'original');
  seed['bell_schedule_v1'] = {
    tz: 'America/New_York',
    periods: [{ id: 'LCH1', start: '00:00', end: '23:59' }]
  };
  seed['student_classes_v1'] = {
    classes: { '123': { LCH1: 'Lunch' } },
    courses: { '123': { LCH1: 'Lunch' } },
    lunch_dual: {
      '123': {
        LCH1: {
          original_room: 'RM 401',
          original_label: 'Original Lunch',
          special_room: 'RM 402',
          special_label: 'Special Lunch'
        }
      }
    }
  };
  const kv = new FakeKV(seed);
  const env = { ROSTER: kv };
  const modeInfo = await mod.loadStudentViewModeInfo(env);
  const result = await mod.buildStudentDashboard(env, modeInfo, '123');

  assert.equal(result.ok, true);
  assert.equal(result.schedule.now.room, '401');
  assert.equal(result.schedule.now.course, 'Original Lunch');
});

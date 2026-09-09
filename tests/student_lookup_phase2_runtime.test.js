const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const serviceUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/student-view.js')).href;

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [String(key), typeof value === 'string' ? value : JSON.stringify(value)]));
  }
  async get(key, options) {
    const raw = this.map.get(String(key));
    if (raw == null) return null;
    if (options?.type === 'json' || options === 'json') return JSON.parse(raw);
    return raw;
  }
  async put(key, value) { this.map.set(String(key), String(value)); }
}

function fakeDO(factory) {
  return {
    names: [],
    idFromName(name) { this.names.push(String(name)); return String(name); },
    get() {
      return { fetch: async (url) => new Response(JSON.stringify(factory(String(url))), { status:200, headers:{'content-type':'application/json'} }) };
    }
  };
}

async function service() {
  return import(`${serviceUrl}?phase2=${Date.now()}-${Math.random()}`);
}

test('Phase 2 returns the assigned day and attendance rows even when no class is currently active', async () => {
  const mod = await service();
  const kv = new FakeKV({
    'system:mode:v1': { mode:'live' },
    'roster_v1': { rows:[{ o:'123', n:'Student One', e:'one@example.org', g:'10' }] },
    'bell_schedule_v1': {
      tz:'America/New_York',
      periods:[
        { id:'1', start:'01:00', end:'02:00' },
        { id:'2', start:'02:00', end:'03:00' },
        { id:'3', start:'03:00', end:'04:00' }
      ]
    },
    'student_classes_v1': {
      classes:{ '123':{ '1':'RM 201', '2':'RM 202', '3':'RM 203' } },
      courses:{ '123':{ '1':'ELA100.1', '2':'MTH200.1', '3':'SCI300.1' } }
    },
    'att_cfg_v1': { webapp_schedule_mode:'special' }
  });
  const attendance = fakeDO((url) => {
    const period = new URL(url).searchParams.get('periodLocal');
    return { ok:true, row: period === '2' ? { status:'Late' } : { status:'Present' } };
  });
  const env = {
    ROSTER:kv,
    STUDENT_LOC:fakeDO(() => ({ osis:'123', zone:'hallway', location_label:'Hallway' })),
    ATTENDANCE_DO:attendance,
    CLASS_SESSION_DO:fakeDO(() => ({ ok:true, rec:null }))
  };

  const mode = await mod.loadStudentViewModeInfo(env);
  const result = await mod.buildStudentDashboard(env, mode, '123');

  assert.equal(result.ok, true);
  assert.equal(result.student.grade, '10');
  assert.equal(result.schedule.day.length, 3);
  assert.deepEqual(result.schedule.day.map((row) => row.periodLocal), ['1','2','3']);
  assert.deepEqual(result.schedule.day.map((row) => row.room), ['201','202','203']);
  assert.equal(result.attendance_today.length, 3);
  assert.equal(result.attendance_today[1].attendance.status, 'Late');
  assert.equal(attendance.names.length, 3);
});

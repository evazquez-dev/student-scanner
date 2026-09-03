const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const workerUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js')).href;

async function loadWorkerFresh(){
  return import(workerUrl + `?morning_destination=${Date.now()}_${Math.random()}`);
}

function envFixture(){
  const bell = {
    tz:'America/New_York',
    periods:[
      { id:'0', start:'07:30', end:'08:00' },
      { id:'ADV', start:'08:00', end:'08:32' },
      { id:'1', start:'08:35', end:'09:15' },
      { id:'2', start:'09:18', end:'09:58' }
    ]
  };
  const classes = {
    classes:{
      '1001':{ 'ADV':'310', '1':'211', '2':'316' },
      '1002':{ '1':'212', '2':'317' }
    },
    courses:{
      '1001':{ 'ADV':'Advisory', '1':'English 9', '2':'Geometry' },
      '1002':{ '1':'English 9', '2':'Geometry' }
    }
  };
  const values = new Map([
    ['bell_schedule_v1', JSON.stringify(bell)],
    ['student_classes_v1', JSON.stringify(classes)],
    ['att_cfg_v1', { late_min:8, webapp_schedule_mode:'special' }]
  ]);
  return {
    LATE_MINUTES:'8',
    ROSTER:{
      async get(key, type){
        const value = values.get(String(key));
        if (value == null) return null;
        const wantsJson = type === 'json' || type?.type === 'json';
        if (wantsJson && typeof value === 'string') return JSON.parse(value);
        return value;
      }
    }
  };
}

test('before the first bell, morning guidance skips roomless Period 0 and sends the student to Advisory', async () => {
  const { currentClassForOsis, morningDestinationForOsis_ } = await loadWorkerFresh();
  const env = envFixture();
  const now = 7 * 60 + 20;
  const cls = await currentClassForOsis(env, '1001', now, '2026-09-03');
  assert.equal(cls, null);
  const destination = await morningDestinationForOsis_(env, '1001', cls, now);
  assert.equal(destination.periodId, 'ADV');
  assert.equal(destination.room, '310');
  assert.equal(destination.reason, 'next_assigned_period');
});

test('while roomless Period 0 is active, morning guidance still advances to Advisory', async () => {
  const { currentClassForOsis, morningDestinationForOsis_ } = await loadWorkerFresh();
  const env = envFixture();
  const now = 7 * 60 + 45;
  const cls = await currentClassForOsis(env, '1001', now, '2026-09-03');
  assert.equal(cls.mode, 'in_class');
  assert.equal(cls.periodId, '0');
  assert.equal(cls.room, null);
  const destination = await morningDestinationForOsis_(env, '1001', cls, now);
  assert.equal(destination.periodId, 'ADV');
  assert.equal(destination.room, '310');
  assert.equal(destination.reason, 'next_assigned_period');
});

test('while Advisory is active, morning guidance stays on the Advisory room', async () => {
  const { currentClassForOsis, morningDestinationForOsis_ } = await loadWorkerFresh();
  const env = envFixture();
  const now = 8 * 60 + 10;
  const cls = await currentClassForOsis(env, '1001', now, '2026-09-03');
  assert.equal(cls.mode, 'in_class');
  assert.equal(cls.periodId, 'ADV');
  const destination = await morningDestinationForOsis_(env, '1001', cls, now);
  assert.equal(destination.periodId, 'ADV');
  assert.equal(destination.room, '310');
  assert.equal(destination.reason, 'active_period');
});

test('a student without Advisory skips it and receives the next assigned period room', async () => {
  const { currentClassForOsis, morningDestinationForOsis_ } = await loadWorkerFresh();
  const env = envFixture();
  const now = 7 * 60 + 20;
  const cls = await currentClassForOsis(env, '1002', now, '2026-09-03');
  const destination = await morningDestinationForOsis_(env, '1002', cls, now);
  assert.equal(destination.periodId, '1');
  assert.equal(destination.room, '212');
  assert.equal(destination.reason, 'next_assigned_period');
});


test('7:45 Room 310 Advisory scan overwrites stale Period 0 response metadata with effective ADV context', async () => {
  const { kioskAccessForOsis, applyEffectiveKioskContextToResolved_ } = await loadWorkerFresh();
  const env = envFixture();
  const now = 7 * 60 + 45;

  const kioskInfo = await kioskAccessForOsis(env, '1001', '310', 30, now, '2026-09-03');
  assert.equal(kioskInfo.mode, 'in_class');
  assert.equal(kioskInfo.allowed, true);
  assert.equal(kioskInfo.periodLocal, 'ADV');
  assert.equal(kioskInfo.shouldRoom, '310');
  assert.equal(kioskInfo.course, 'Advisory');

  const resolved = {
    current_period: '0',
    current_room: null,
    current_course_section: null,
    class_now: 'Period 0'
  };
  applyEffectiveKioskContextToResolved_(resolved, kioskInfo);

  assert.equal(resolved.current_period, 'ADV');
  assert.equal(resolved.current_room, '310');
  assert.equal(resolved.current_course_section, 'Advisory');
  assert.equal(resolved.class_now, '310');
});

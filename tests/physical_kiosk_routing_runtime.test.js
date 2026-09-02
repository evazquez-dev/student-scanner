const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const workerUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js')).href;

async function loadWorkerFresh(){
  return import(workerUrl + `?physical_kiosk_routing=${Date.now()}_${Math.random()}`);
}

function envFixture(){
  const bell = {
    tz:'America/New_York',
    periods:[
      { id:'2', start:'11:00', end:'11:50' },
      { id:'LCH1', start:'12:00', end:'12:30' }
    ]
  };
  const classes = {
    classes:{ '1001':{ '2':'201', 'LCH1':'Caf' } },
    courses:{ '1001':{ '2':'Math', 'LCH1':'LUNCH' } }
  };
  const supervised = {
    assignments:[{
      teacherEmail:'teacher@example.org',
      periodLocal:'LCH1',
      room:'405',
      label:'Supervised Lunch (405)',
      osisList:['1001']
    }]
  };
  const values = new Map([
    ['bell_schedule_v1', JSON.stringify(bell)],
    ['student_classes_v1', JSON.stringify(classes)],
    ['att_cfg_v1', { late_min:8, webapp_schedule_mode:'special' }],
    ['supervised_lunch_v1:2026-09-02', supervised]
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

test('Supervised Lunch overrides Caf during the active lunch period', async () => {
  const { kioskAccessForOsis } = await loadWorkerFresh();
  const env = envFixture();

  const supervised = await kioskAccessForOsis(env, '1001', '405', 30, 12 * 60 + 5, '2026-09-02');
  const cafeteria = await kioskAccessForOsis(env, '1001', 'Caf', 30, 12 * 60 + 5, '2026-09-02');

  assert.equal(supervised.mode, 'in_class');
  assert.equal(supervised.periodLocal, 'LCH1');
  assert.equal(supervised.allowed, true);
  assert.equal(supervised.shouldRoom, '405');
  assert.equal(supervised.supervisedLunch, true);

  assert.equal(cafeteria.allowed, false);
  assert.equal(cafeteria.shouldRoom, '405');
});

test('Supervised Lunch overrides Caf during the Arrival Window before lunch', async () => {
  const { kioskAccessForOsis } = await loadWorkerFresh();
  const env = envFixture();

  // Period 2 ends 11:50, LCH1 begins 12:00. At 11:55 the next period is
  // the Arrival Window and positive Present evidence may be recorded early.
  const supervised = await kioskAccessForOsis(env, '1001', '405', 30, 11 * 60 + 55, '2026-09-02');
  const cafeteria = await kioskAccessForOsis(env, '1001', 'Caf', 30, 11 * 60 + 55, '2026-09-02');

  assert.equal(supervised.mode, 'transition');
  assert.equal(supervised.periodLocal, 'LCH1');
  assert.equal(supervised.allowed, true);
  assert.equal(supervised.shouldRoom, '405');
  assert.equal(supervised.attendance, 'Present');
  assert.equal(supervised.supervisedLunch, true);

  assert.equal(cafeteria.allowed, false);
  assert.equal(cafeteria.shouldRoom, '405');
});

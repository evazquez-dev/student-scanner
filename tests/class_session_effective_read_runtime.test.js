const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const serviceUrl = pathToFileURL(
  path.resolve(__dirname, '..', '..', 'cf-redcake', 'red-cake-77d5', 'src', 'services', 'teacher-attendance-read.js')
).href;

let servicePromise;
function loadService(){
  if (!servicePromise) servicePromise = import(serviceUrl + `?effective_class_session=${Date.now()}`);
  return servicePromise;
}

function makeEnv(stateBody){
  const bell = {
    tz:'America/New_York',
    periods:[
      { id:'1', start:'08:00', end:'08:45' },
      { id:'2', start:'08:50', end:'09:35' }
    ]
  };
  return {
    ROSTER:{
      async get(key, opts){
        if (String(key) === 'bell_schedule_v1') {
          return opts?.type === 'json' ? bell : JSON.stringify(bell);
        }
        return null;
      },
      async put(){}
    },
    CLASS_SESSION_DO:{
      idFromName(name){ return name; },
      get(){
        return {
          async fetch(){
            return {
              ok:true,
              status:200,
              async json(){ return JSON.parse(JSON.stringify(stateBody)); }
            };
          }
        };
      }
    }
  };
}

test('modular Teacher Attendance read service returns server-effective ClassSession state', async () => {
  const { loadTeacherAttendanceClassSessionState } = await loadService();
  const env = makeEnv({
    ok:true,
    students:{
      no_first:{ osis:'no_first', out:{ isOut:false } },
      in_room:{ osis:'in_room', firstInISO:'2026-09-02T12:05:00.000Z', out:{ isOut:false, source:'scan_evidence' } },
      away:{
        osis:'away',
        firstInISO:'2026-09-02T12:03:00.000Z',
        out:{ isOut:true, outSinceISO:'2026-09-02T12:20:00.000Z', reason:'bathroom', source:'scan_evidence', byEmail:'' }
      }
    }
  });

  const result = await loadTeacherAttendanceClassSessionState(
    env,
    { practice:false },
    { date:'2026-09-02', room:'101', periodLocal:'1', now_min:8 * 60 + 20 }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.default_out_since_iso, '2026-09-02T12:00:00.000Z');
  assert.deepEqual(result.body.effective_default_out, {
    isOut:true,
    outSinceISO:'2026-09-02T12:00:00.000Z',
    reason:'period_start_no_in',
    source:'derived_period_start',
    byEmail:'',
    derived:true
  });
  assert.equal(result.body.effective_out_by_osis.no_first.isOut, true);
  assert.equal(result.body.effective_out_by_osis.no_first.derived, true);
  assert.equal(result.body.effective_out_by_osis.in_room.isOut, false);
  assert.equal(result.body.effective_out_by_osis.away.isOut, true);
  assert.equal(result.body.effective_out_by_osis.away.outSinceISO, '2026-09-02T12:20:00.000Z');
  assert.equal(result.body.effective_out_by_osis.away.derived, false);
});

test('after-school read does not derive OUT before a temporary home exists', async () => {
  const { loadTeacherAttendanceClassSessionState } = await loadService();
  const env = makeEnv({ ok:true, students:{} });

  const result = await loadTeacherAttendanceClassSessionState(
    env,
    { practice:false },
    { date:'2026-09-02', room:'After School Room', periodLocal:'AFTER_SCHOOL' }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.default_out_since_iso, null);
  assert.equal(result.body.effective_default_out.isOut, false);
  assert.equal(result.body.effective_default_out.derived, false);
});

test('arrival-window read accepts early first-IN but does not derive OUT before the bell', async () => {
  const { loadTeacherAttendanceClassSessionState } = await loadService();
  const env = makeEnv({
    ok:true,
    students:{
      early_in:{ osis:'early_in', firstInISO:'2026-09-02T12:47:00.000Z', out:{ isOut:false } },
      not_arrived:{ osis:'not_arrived', out:{ isOut:false } }
    }
  });

  const result = await loadTeacherAttendanceClassSessionState(
    env,
    { practice:false },
    { date:'2026-09-02', room:'101', periodLocal:'2', now_min:8 * 60 + 47 }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.session_phase, 'arrival');
  assert.equal(result.body.default_out_since_iso, null);
  assert.equal(result.body.effective_out_by_osis.early_in.isOut, false);
  assert.equal(result.body.effective_out_by_osis.not_arrived.isOut, false);
  assert.equal(result.body.effective_out_by_osis.not_arrived.derived, false);
});

test('bell changes an unarrived student from arrival-pending to derived OUT', async () => {
  const { loadTeacherAttendanceClassSessionState } = await loadService();
  const env = makeEnv({
    ok:true,
    students:{
      not_arrived:{ osis:'not_arrived', out:{ isOut:false } }
    }
  });

  const result = await loadTeacherAttendanceClassSessionState(
    env,
    { practice:false },
    { date:'2026-09-02', room:'101', periodLocal:'2', now_min:8 * 60 + 51 }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.session_phase, 'active');
  assert.equal(result.body.default_out_since_iso, '2026-09-02T12:50:00.000Z');
  assert.equal(result.body.effective_out_by_osis.not_arrived.isOut, true);
  assert.equal(result.body.effective_out_by_osis.not_arrived.derived, true);
});


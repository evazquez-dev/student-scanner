const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const workerUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js')).href;
let workerPromise;
function loadWorker(){
  if (!workerPromise) workerPromise = import(workerUrl + `?phone_pass_hardening=${Date.now()}`);
  return workerPromise;
}
class MockStorage {
  constructor(){ this.map = new Map(); }
  async get(key){ return this.map.get(key); }
  async put(key, value){
    if (key && typeof key === 'object' && !Array.isArray(key)) {
      for (const [k,v] of Object.entries(key)) this.map.set(k,v);
    } else this.map.set(key, value);
  }
  async delete(key){ this.map.delete(key); }
  async deleteAll(){ this.map.clear(); }
  async list({prefix=''}={}){ return new Map([...this.map].filter(([k]) => String(k).startsWith(prefix))); }
  async setAlarm(){}
  async getAlarm(){ return null; }
}
function mockState(){
  const storage = new MockStorage();
  return { storage, blockConcurrencyWhile: async fn => await fn() };
}
async function doPost(obj, pathname, body){
  const r = await obj.fetch(new Request(`https://do${pathname}`, {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)
  }));
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status:r.status, ok:r.ok, text, json };
}

test('Phone Pass StudentLocation transition is atomic, idempotent, date-independent, and preserves newer physical evidence', async () => {
  const { StudentLocationDO } = await loadWorker();
  const state = mockState();
  const obj = new StudentLocationDO(state, {});

  await doPost(obj, '/update', {
    osis:'p1001', date:'2026-09-02', zone:'class', loc:'301', location_label:'301',
    location_evidence:true, location_evidence_at:'2026-09-02T15:30:00.000Z',
    updated_at:'2026-09-02T15:30:00.000Z'
  });

  let r = await doPost(obj, '/phone_pass', {
    action:'pickup', osis:'p1001', date:'2026-09-02',
    whenISO:'2026-09-02T15:20:00.000Z',
    actor_email:'ops@example.org', actor_role:'editor'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.phone_out, true);
  assert.equal(r.json.physical_applied, false);
  assert.equal(r.json.physical_superseded, true);

  let saved = await state.storage.get('s:p1001');
  assert.equal(saved.phone_state_date, '2026-09-02');
  assert.equal(saved.phone_out_since, '2026-09-02T15:20:00.000Z');
  assert.equal(saved.zone, 'class');
  assert.equal(saved.loc, '301');
  assert.equal(saved.location_evidence_at, '2026-09-02T15:30:00.000Z');

  r = await doPost(obj, '/phone_pass', {
    action:'pickup', osis:'p1001', date:'2026-09-02',
    whenISO:'2026-09-02T15:40:00.000Z',
    actor_email:'other@example.org', actor_role:'editor'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.already, true);
  saved = await state.storage.get('s:p1001');
  assert.equal(saved.phone_out_since, '2026-09-02T15:20:00.000Z');
  assert.equal(saved.phone_out_by_email, 'ops@example.org');

  await doPost(obj, '/update', {
    osis:'p1001', date:'2026-09-03', zone:'hallway', loc:'hallway', location_label:'Hallway',
    location_evidence:true, location_evidence_at:'2026-09-03T12:00:00.000Z',
    updated_at:'2026-09-03T12:00:00.000Z'
  });
  saved = await state.storage.get('s:p1001');
  assert.equal(saved.date, '2026-09-03');
  assert.equal(saved.phone_state_date, '2026-09-02');
  assert.equal(saved.phone_out, true);
});

test('Phone Pass return request and final return are idempotent and require a current-day phone-out state', async () => {
  const { StudentLocationDO } = await loadWorker();
  const state = mockState();
  const obj = new StudentLocationDO(state, {});

  let r = await doPost(obj, '/phone_pass', {
    action:'return', osis:'p2001', date:'2026-09-02',
    whenISO:'2026-09-02T15:00:00.000Z', actor_email:'ops@example.org'
  });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'phone_not_out_today');

  await doPost(obj, '/phone_pass', {
    action:'pickup', osis:'p2001', date:'2026-09-02',
    whenISO:'2026-09-02T15:05:00.000Z', actor_email:'grant@example.org'
  });
  r = await doPost(obj, '/phone_pass', {
    action:'send_to_return', osis:'p2001', date:'2026-09-02',
    whenISO:'2026-09-02T15:20:00.000Z', actor_email:'teacher@example.org'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.phone_return_requested, true);
  const firstRequestAt = r.json.whenISO;

  r = await doPost(obj, '/phone_pass', {
    action:'send_to_return', osis:'p2001', date:'2026-09-02',
    whenISO:'2026-09-02T15:21:00.000Z', actor_email:'teacher@example.org'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.already, true);
  assert.equal(r.json.whenISO, firstRequestAt);

  r = await doPost(obj, '/phone_pass', {
    action:'return', osis:'p2001', date:'2026-09-02',
    whenISO:'2026-09-02T15:25:00.000Z', actor_email:'ops@example.org'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.phone_out, false);

  r = await doPost(obj, '/phone_pass', {
    action:'return', osis:'p2001', date:'2026-09-02',
    whenISO:'2026-09-02T15:26:00.000Z', actor_email:'ops@example.org'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.already, true);
});

test('Phone Pass Arrival Window interval becomes OUT at bell, disappears if trip ends before bell, and closes on physical classroom return', async () => {
  const { ClassSessionDO, effectiveClassSessionOut_ } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  await doPost(obj, '/physical_evidence', {
    osis:'p3001', expected:true, whenISO:'2026-09-02T14:54:00.000Z', source:'scan_evidence'
  });
  let r = await doPost(obj, '/phone_pass_event', {
    osis:'p3001', action:'start',
    whenISO:'2026-09-02T14:55:00.000Z',
    periodStartISO:'2026-09-02T15:00:00.000Z',
    phase:'transition', reason:'sent_to_pick_up_phone', byEmail:'teacher@example.org'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.isOut, false);

  let raw = await state.storage.get('state');
  let rec = raw.students.p3001;
  assert.equal(rec.phonePassIntervals[0].start_at_iso, '2026-09-02T15:00:00.000Z');
  assert.equal(effectiveClassSessionOut_(rec, '').isOut, false);
  let effective = effectiveClassSessionOut_(rec, '2026-09-02T15:00:00.000Z');
  assert.equal(effective.isOut, true);
  assert.equal(effective.outSinceISO, '2026-09-02T15:00:00.000Z');
  assert.equal(effective.source, 'phone_pass_interval');

  await doPost(obj, '/physical_evidence', {
    osis:'p3001', expected:true, whenISO:'2026-09-02T14:58:00.000Z', source:'scan_evidence'
  });
  raw = await state.storage.get('state');
  rec = raw.students.p3001;
  assert.equal(rec.phonePassIntervals.some(row => !row.end_at_iso), false);
  assert.equal(effectiveClassSessionOut_(rec, '2026-09-02T15:00:00.000Z').isOut, false);

  await doPost(obj, '/phone_pass_event', {
    osis:'p3001', action:'start',
    whenISO:'2026-09-02T14:59:00.000Z',
    periodStartISO:'2026-09-02T15:00:00.000Z',
    phase:'transition', reason:'sent_to_pick_up_phone', byEmail:'teacher@example.org'
  });
  raw = await state.storage.get('state');
  rec = raw.students.p3001;
  effective = effectiveClassSessionOut_(rec, '2026-09-02T15:00:00.000Z');
  assert.equal(effective.isOut, true);

  await doPost(obj, '/physical_evidence', {
    osis:'p3001', expected:true, whenISO:'2026-09-02T15:10:00.000Z', source:'scan_evidence'
  });
  raw = await state.storage.get('state');
  rec = raw.students.p3001;
  assert.equal(effectiveClassSessionOut_(rec, '2026-09-02T15:00:00.000Z').isOut, false);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const workerUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js')).href;
let workerPromise;
function loadWorker(){
  if (!workerPromise) workerPromise = import(workerUrl + `?staff_pull_reflection=${Date.now()}`);
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
  async delete(key){
    if (Array.isArray(key)) key.forEach((k) => this.map.delete(k));
    else this.map.delete(key);
  }
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
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  }));
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status:r.status, ok:r.ok, text, json };
}

test('Staff Pull is atomic, owner-safe, idempotent, and preserves physical evidence', async () => {
  const { StudentLocationDO } = await loadWorker();
  const state = mockState();
  const obj = new StudentLocationDO(state, {});

  await doPost(obj, '/update', {
    osis:'1001',
    date:'2026-09-01',
    zone:'class',
    loc:'201',
    location_label:'201',
    location_evidence:true,
    location_evidence_at:'2026-09-01T15:00:00.000Z',
    updated_at:'2026-09-01T15:00:00.000Z'
  });

  const first = await doPost(obj, '/staff_pull', {
    action:'pull',
    date:'2026-09-02',
    osis:'1001',
    whenISO:'2026-09-02T14:00:00.000Z',
    owner_email:'a@example.org',
    owner_title:'Counselor',
    target_label:'With Counselor'
  });
  assert.equal(first.status, 200);
  assert.equal(first.json.applied, true);

  let saved = await state.storage.get('s:1001');
  assert.equal(saved.date, '2026-09-01'); // obligation does not freshen physical state
  assert.equal(saved.held_date, '2026-09-02');
  assert.equal(saved.zone, 'class');
  assert.equal(saved.loc, '201');
  assert.equal(saved.location_evidence_at, '2026-09-01T15:00:00.000Z');
  assert.equal(saved.held_by_email, 'a@example.org');

  const duplicate = await doPost(obj, '/staff_pull', {
    action:'pull',
    date:'2026-09-02',
    osis:'1001',
    whenISO:'2026-09-02T14:01:00.000Z',
    owner_email:'a@example.org',
    owner_title:'Counselor'
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.json.already, true);

  const steal = await doPost(obj, '/staff_pull', {
    action:'pull',
    date:'2026-09-02',
    osis:'1001',
    whenISO:'2026-09-02T14:02:00.000Z',
    owner_email:'b@example.org'
  });
  assert.equal(steal.status, 409);
  assert.equal(steal.json.error, 'already_held');

  const wrongRelease = await doPost(obj, '/staff_pull', {
    action:'release',
    date:'2026-09-02',
    osis:'1001',
    whenISO:'2026-09-02T14:10:00.000Z',
    owner_email:'b@example.org'
  });
  assert.equal(wrongRelease.status, 403);
  assert.equal(wrongRelease.json.error, 'not_holder');

  const release = await doPost(obj, '/staff_pull', {
    action:'release',
    date:'2026-09-02',
    osis:'1001',
    whenISO:'2026-09-02T14:10:00.000Z',
    owner_email:'a@example.org',
    grace_until:'2026-09-02T14:12:00.000Z',
    grace_period:'3',
    grace_room:'301'
  });
  assert.equal(release.status, 200);
  assert.equal(release.json.applied, true);

  saved = await state.storage.get('s:1001');
  assert.equal(saved.held_by_email, null);
  assert.equal(saved.held_date, null);
  assert.equal(saved.zone, 'class');
  assert.equal(saved.loc, '201');
  assert.equal(saved.location_evidence_at, '2026-09-01T15:00:00.000Z');
  assert.equal(saved.staff_pull_intervals.length, 1);
  assert.equal(saved.staff_pull_intervals[0].start_at_iso, '2026-09-02T14:00:00.000Z');
  assert.equal(saved.staff_pull_intervals[0].end_at_iso, '2026-09-02T14:10:00.000Z');

  const duplicateRelease = await doPost(obj, '/staff_pull', {
    action:'release',
    date:'2026-09-02',
    osis:'1001',
    whenISO:'2026-09-02T14:11:00.000Z',
    owner_email:'a@example.org'
  });
  assert.equal(duplicateRelease.status, 200);
  assert.equal(duplicateRelease.json.already, true);
  saved = await state.storage.get('s:1001');
  assert.equal(saved.staff_pull_intervals.length, 1);
});

test('Staff Pull ClassSession event clips Arrival Window evidence to the bell without pre-bell OUT', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  let r = await doPost(obj, '/staff_pull_event', {
    osis:'2001',
    action:'start',
    whenISO:'2026-09-02T14:55:00.000Z',
    periodStartISO:'2026-09-02T15:00:00.000Z',
    phase:'transition',
    byEmail:'staff@example.org'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.isOut, false);

  let raw = await state.storage.get('state');
  assert.equal(raw.students['2001'].staffPullIntervals.length, 1);
  assert.equal(raw.students['2001'].staffPullIntervals[0].start_at_iso, '2026-09-02T15:00:00.000Z');

  r = await doPost(obj, '/staff_pull_event', {
    osis:'2001',
    action:'release',
    whenISO:'2026-09-02T14:58:00.000Z',
    periodStartISO:'2026-09-02T15:00:00.000Z',
    phase:'transition',
    byEmail:'staff@example.org'
  });
  assert.equal(r.json.isOut, false);
  raw = await state.storage.get('state');
  assert.equal(raw.students['2001'].staffPullIntervals.length, 0);
});

test('Staff Pull active-period start/release keeps OUT until credible scheduled-room return evidence', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  await doPost(obj, '/physical_evidence', {
    osis:'3001', expected:true, whenISO:'2026-09-02T15:02:00.000Z', source:'scan_evidence'
  });

  let r = await doPost(obj, '/staff_pull_event', {
    osis:'3001',
    action:'start',
    whenISO:'2026-09-02T15:10:00.000Z',
    periodStartISO:'2026-09-02T15:00:00.000Z',
    phase:'in_class',
    byEmail:'staff@example.org'
  });
  assert.equal(r.json.isOut, true);
  assert.equal(r.json.outSinceISO, '2026-09-02T15:10:00.000Z');

  r = await doPost(obj, '/staff_pull_event', {
    osis:'3001',
    action:'release',
    whenISO:'2026-09-02T15:20:00.000Z',
    periodStartISO:'2026-09-02T15:00:00.000Z',
    phase:'in_class',
    byEmail:'staff@example.org',
    returnedExpected:false
  });
  assert.equal(r.json.isOut, true);
  assert.equal(r.json.outSinceISO, '2026-09-02T15:10:00.000Z');

  r = await doPost(obj, '/staff_pull_event', {
    osis:'3001',
    action:'release',
    whenISO:'2026-09-02T15:21:00.000Z',
    periodStartISO:'2026-09-02T15:00:00.000Z',
    phase:'in_class',
    byEmail:'staff@example.org',
    returnedExpected:true
  });
  assert.equal(r.json.isOut, false);
});

test('Reflection Hold ownership is atomic and never changes physical location evidence', async () => {
  const { StudentLocationDO } = await loadWorker();
  const state = mockState();
  const obj = new StudentLocationDO(state, {});

  await doPost(obj, '/update', {
    osis:'4001',
    date:'2026-08-31',
    zone:'class',
    loc:'201',
    location_label:'201',
    location_evidence:true,
    location_evidence_at:'2026-08-31T15:00:00.000Z',
    updated_at:'2026-08-31T15:00:00.000Z'
  });

  const a = await doPost(obj, '/reflection_hold', {
    action:'confirm',
    date:'2026-09-02',
    osis:'4001',
    whenISO:'2026-09-02T19:00:00.000Z',
    owner_email:'a@example.org',
    room:'405',
    hold_label:'Reflection Hold'
  });
  assert.equal(a.status, 200);
  assert.equal(a.json.applied, true);

  const b = await doPost(obj, '/reflection_hold', {
    action:'confirm',
    date:'2026-09-02',
    osis:'4001',
    whenISO:'2026-09-02T19:00:01.000Z',
    owner_email:'b@example.org',
    room:'306',
    hold_label:'Reflection Hold'
  });
  assert.equal(b.status, 409);
  assert.equal(b.json.error, 'already_held');

  const wrongRelease = await doPost(obj, '/reflection_hold', {
    action:'release',
    date:'2026-09-02',
    osis:'4001',
    whenISO:'2026-09-02T19:05:00.000Z',
    owner_email:'b@example.org'
  });
  assert.equal(wrongRelease.status, 403);

  const release = await doPost(obj, '/reflection_hold', {
    action:'release',
    date:'2026-09-02',
    osis:'4001',
    whenISO:'2026-09-02T19:05:00.000Z',
    owner_email:'a@example.org'
  });
  assert.equal(release.status, 200);

  const saved = await state.storage.get('s:4001');
  assert.equal(saved.date, '2026-08-31');
  assert.equal(saved.zone, 'class');
  assert.equal(saved.loc, '201');
  assert.equal(saved.location_evidence_at, '2026-08-31T15:00:00.000Z');
  assert.equal(saved.after_school_reflection_hold_active, false);
});

test('Staff release grace expires by time and matches only its intended class', async () => {
  const { staffReleaseGraceMatchesClass_ } = await loadWorker();
  const state = {
    date:'2026-09-02',
    staff_release_late_grace_active:true,
    staff_release_late_grace_date:'2026-09-02',
    staff_release_late_grace_at:'2026-09-02T15:10:00.000Z',
    staff_release_late_grace_until:'2026-09-02T15:12:00.000Z',
    staff_release_late_grace_period:'3',
    staff_release_late_grace_room:'301'
  };
  assert.equal(staffReleaseGraceMatchesClass_(state, {
    date:'2026-09-02', room:'301', periodLocal:'3', whenISO:'2026-09-02T15:11:30.000Z'
  }), true);
  assert.equal(staffReleaseGraceMatchesClass_(state, {
    date:'2026-09-02', room:'301', periodLocal:'3', whenISO:'2026-09-02T15:12:01.000Z'
  }), false);
  assert.equal(staffReleaseGraceMatchesClass_(state, {
    date:'2026-09-02', room:'302', periodLocal:'3', whenISO:'2026-09-02T15:11:00.000Z'
  }), false);
});

test('Staff Pull attendance history survives release and can cover or overlap later meeting computation', async () => {
  const { staffPullPeriodEvidence_ } = await loadWorker();
  const live = {
    staff_pull_intervals:[{
      date:'2026-09-02',
      start_at_iso:'2026-09-02T15:00:00.000Z',
      end_at_iso:'2026-09-02T15:50:00.000Z',
      by_email:'staff@example.org',
      source:'staff_pull'
    }]
  };
  const full = staffPullPeriodEvidence_(null, live, {
    date:'2026-09-02',
    periodStartISO:'2026-09-02T15:00:00.000Z',
    periodEndISO:'2026-09-02T15:45:00.000Z'
  });
  assert.equal(full.coversFull, true);
  assert.equal(full.method, 'live_staff_pull_interval');

  const overlap = staffPullPeriodEvidence_(null, live, {
    date:'2026-09-02',
    periodStartISO:'2026-09-02T15:40:00.000Z',
    periodEndISO:'2026-09-02T16:30:00.000Z'
  });
  assert.equal(overlap.overlaps, true);
  assert.equal(overlap.coversFull, false);
});

test('Release repair does not excuse a Late that predates the Staff Pull', async () => {
  const { AttendanceDO, maybeExcuseLateAfterStaffRelease_ } = await loadWorker();
  const state = mockState();
  const attendance = new AttendanceDO(state, {});
  const env = {
    ATTENDANCE_DO:{
      idFromName:() => 'att',
      get:() => ({ fetch:(url, init) => attendance.fetch(new Request(url, init)) })
    }
  };
  const base = { date:'2026-09-02', periodLocal:'3', osis:'7001', room:'301' };
  await doPost(attendance, '/record', {
    ...base, whenISO:'2026-09-02T15:05:00.000Z', status:'Late', codeLetter:'L'
  });

  const result = await maybeExcuseLateAfterStaffRelease_(env, {
    ...base,
    whenISO:'2026-09-02T15:25:00.000Z',
    byEmail:'staff@example.org',
    pullStartISO:'2026-09-02T15:10:00.000Z'
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'late_predates_staff_pull');

  const saved = await state.storage.get('2026-09-02|3|7001');
  assert.equal(saved.scanCodeLetter, 'L');
  assert.equal(saved.overrideLetter, undefined);
});

test('Release repair may convert Late evidence created after Staff Pull began', async () => {
  const { AttendanceDO, maybeExcuseLateAfterStaffRelease_ } = await loadWorker();
  const state = mockState();
  const attendance = new AttendanceDO(state, {});
  const env = {
    ATTENDANCE_DO:{
      idFromName:() => 'att',
      get:() => ({ fetch:(url, init) => attendance.fetch(new Request(url, init)) })
    }
  };
  const base = { date:'2026-09-02', periodLocal:'3', osis:'7002', room:'301' };
  await doPost(attendance, '/record', {
    ...base, whenISO:'2026-09-02T15:12:00.000Z', status:'Late', codeLetter:'L'
  });

  const result = await maybeExcuseLateAfterStaffRelease_(env, {
    ...base,
    whenISO:'2026-09-02T15:20:00.000Z',
    byEmail:'staff@example.org',
    pullStartISO:'2026-09-02T15:10:00.000Z'
  });
  assert.equal(result.applied, true);

  const saved = await state.storage.get('2026-09-02|3|7002');
  assert.equal(saved.overrideLetter, 'EL');
  assert.equal(saved.scanCodeLetter, 'EL');
  assert.equal(saved.firstISO, '2026-09-02T15:12:00.000Z');
});


test('open Arrival Window Staff Pull becomes effectively OUT at the bell without an extra mutation', async () => {
  const { ClassSessionDO, effectiveClassSessionOut_ } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  await doPost(obj, '/staff_pull_event', {
    osis:'8001',
    action:'start',
    whenISO:'2026-09-02T14:55:00.000Z',
    periodStartISO:'2026-09-02T15:00:00.000Z',
    phase:'transition',
    byEmail:'staff@example.org'
  });

  const raw = await state.storage.get('state');
  const rec = raw.students['8001'];
  assert.equal(rec.out.isOut, false);

  // Arrival Window: defaultOutSinceISO is intentionally empty, so no pre-bell OUT.
  const arrival = effectiveClassSessionOut_(rec, '');
  assert.equal(arrival.isOut, false);

  // At the bell, the read layer supplies the period start and the open pull is OUT.
  const active = effectiveClassSessionOut_(rec, '2026-09-02T15:00:00.000Z');
  assert.equal(active.isOut, true);
  assert.equal(active.outSinceISO, '2026-09-02T15:00:00.000Z');
  assert.equal(active.reason, 'staff_pull');
  assert.equal(active.derived, true);
});


test('physical classroom BACK scan outranks an open Staff Pull for effective ClassSession state', async () => {
  const { ClassSessionDO, effectiveClassSessionOut_ } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  await doPost(obj, '/scan_event', {
    osis:'9001', event_id:'return-first', whenISO:'2026-09-02T15:02:00.000Z'
  });
  await doPost(obj, '/staff_pull_event', {
    osis:'9001',
    action:'start',
    whenISO:'2026-09-02T15:10:00.000Z',
    periodStartISO:'2026-09-02T15:00:00.000Z',
    phase:'in_class',
    byEmail:'staff@example.org'
  });

  let raw = await state.storage.get('state');
  let effective = effectiveClassSessionOut_(raw.students['9001'], '2026-09-02T15:00:00.000Z');
  assert.equal(effective.isOut, true);

  const back = await doPost(obj, '/scan_event', {
    osis:'9001', event_id:'return-back', whenISO:'2026-09-02T15:20:00.000Z'
  });
  assert.equal(back.json.result.action, 'class_back');

  raw = await state.storage.get('state');
  assert.equal(raw.students['9001'].staffPullIntervals.some((row) => !row.end_at_iso), true);
  assert.equal(raw.students['9001'].lastExpectedPhysicalEvidenceISO, '2026-09-02T15:20:00.000Z');

  effective = effectiveClassSessionOut_(raw.students['9001'], '2026-09-02T15:00:00.000Z');
  assert.equal(effective.isOut, false);
});

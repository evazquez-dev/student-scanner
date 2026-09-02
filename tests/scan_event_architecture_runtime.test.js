const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const workerUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js')).href;
let workerModPromise;
function loadWorker(){
  if (!workerModPromise) workerModPromise = import(workerUrl + `?scan_event_runtime=${Date.now()}`);
  return workerModPromise;
}

class MockStorage {
  constructor(){ this.map = new Map(); }
  async get(key){ return this.map.get(key); }
  async put(key, value){
    if (key && typeof key === 'object' && !Array.isArray(key)) {
      for (const [k,v] of Object.entries(key)) this.map.set(k,v);
    } else {
      this.map.set(key, value);
    }
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

test('StudentLocationDO de-duplicates scan IDs and refuses an older event to rewind bathroom state', async () => {
  const { StudentLocationDO } = await loadWorker();
  const state = mockState();
  const obj = new StudentLocationDO(state, {});
  const base = { osis:'1', date:'2026-09-01', mode:'bathroom', location:'Bathroom (First Floor)', student_name:'A', sex:'M', capacity:2 };

  const first = await doPost(obj, '/scan_event', { ...base, event_id:'evt-a', whenISO:'2026-09-01T15:00:00.000Z' });
  assert.equal(first.json.result.action, 'bathroom_in');

  const duplicate = await doPost(obj, '/scan_event', { ...base, event_id:'evt-a', whenISO:'2026-09-01T15:00:00.000Z' });
  assert.equal(duplicate.json.duplicate, true);
  assert.equal(duplicate.json.result.action, 'bathroom_in');

  const second = await doPost(obj, '/scan_event', { ...base, event_id:'evt-b', whenISO:'2026-09-01T15:05:00.000Z' });
  assert.equal(second.json.result.action, 'bathroom_out');

  const stale = await doPost(obj, '/scan_event', { ...base, event_id:'evt-old', whenISO:'2026-09-01T15:02:00.000Z' });
  assert.equal(stale.json.result.action, 'superseded');
  const saved = await state.storage.get('s:1');
  assert.equal(saved.zone, 'hallway');
  assert.equal(saved.last_scan_event_id, 'evt-b');
});

test('AttendanceDO lets recovered earlier Present evidence repair Late and never the reverse', async () => {
  const { AttendanceDO } = await loadWorker();
  const state = mockState();
  const obj = new AttendanceDO(state, {});
  const base = { date:'2026-09-01', periodLocal:'1', osis:'1', room:'101' };

  await doPost(obj, '/record', { ...base, whenISO:'2026-09-01T13:40:00.000Z', status:'Late', codeLetter:'L' });
  await doPost(obj, '/record', { ...base, whenISO:'2026-09-01T13:31:00.000Z', status:'Present', codeLetter:'P' });
  let rec = await state.storage.get('2026-09-01|1|1');
  assert.equal(rec.scanCodeLetter, 'P');
  assert.equal(rec.firstISO, '2026-09-01T13:31:00.000Z');

  await doPost(obj, '/record', { ...base, whenISO:'2026-09-01T13:45:00.000Z', status:'Late', codeLetter:'L' });
  rec = await state.storage.get('2026-09-01|1|1');
  assert.equal(rec.scanCodeLetter, 'P');
});

test('ClassSessionDO makes the second class scan a two-step event and finalizes the same ID with a reason', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  const first = await doPost(obj, '/scan_event', { osis:'1', event_id:'class-1', whenISO:'2026-09-01T14:00:00.000Z' });
  assert.equal(first.json.result.action, 'class_first');

  const prompt = await doPost(obj, '/scan_event', { osis:'1', event_id:'class-2', whenISO:'2026-09-01T14:05:00.000Z' });
  assert.equal(prompt.json.result.action, 'class_needs_reason');

  const final = await doPost(obj, '/scan_event', { osis:'1', event_id:'class-2', whenISO:'2026-09-01T14:05:00.000Z', reason:'Bathroom' });
  assert.equal(final.json.result.action, 'class_out');
  assert.equal(final.json.result.reason, 'Bathroom');

  const duplicate = await doPost(obj, '/scan_event', { osis:'1', event_id:'class-2', whenISO:'2026-09-01T14:05:00.000Z', reason:'Bathroom' });
  assert.equal(duplicate.json.duplicate, true);
  assert.equal(duplicate.json.result.action, 'class_out');
});

test('LogBufferDO queues a stable log_id exactly once across retries', async () => {
  const { LogBufferDO } = await loadWorker();
  const state = mockState();
  const obj = new LogBufferDO(state, {});
  const row = { whenISO:'2026-09-01T15:00:00.000Z', code:'1', location:'Test', log_id:'stable-log-id' };

  const first = await doPost(obj, '/enqueue', row);
  assert.equal(first.json.ok, true);
  const duplicate = await doPost(obj, '/enqueue', row);
  assert.equal(duplicate.json.ok, true);
  assert.equal(duplicate.json.duplicate, true);

  const queued = await state.storage.list({prefix:'q:'});
  assert.equal(queued.size, 1);
  assert.ok(await state.storage.get('dedupe:stable-log-id'));
});


test('Bathroom state self-heals when a newer physical scan is at a different bathroom', async () => {
  const { StudentLocationDO } = await loadWorker();
  const state = mockState();
  const obj = new StudentLocationDO(state, {});
  const common = { osis:'2', date:'2026-09-01', mode:'bathroom', student_name:'B', sex:'F', capacity:2 };
  await doPost(obj, '/scan_event', { ...common, event_id:'bath-a', whenISO:'2026-09-01T15:00:00.000Z', location:'Bathroom (First Floor)' });
  const moved = await doPost(obj, '/scan_event', { ...common, event_id:'bath-b', whenISO:'2026-09-01T15:05:00.000Z', location:'Bathroom (Second Floor)' });
  assert.equal(moved.json.result.action, 'bathroom_in');
  assert.equal(moved.json.result.auto_closed_previous_bathroom, 'Bathroom (First Floor)');
  const saved = await state.storage.get('s:2');
  assert.equal(saved.zone, 'bathroom');
  assert.equal(saved.loc, 'Bathroom (Second Floor)');
  assert.equal(saved.bathroom_visits, 2);
});

test('ClassSession OUT clock starts once and later away evidence does not reset it', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});
  await doPost(obj, '/mark_first_in', { osis:'3', whenISO:'2026-09-01T14:05:00.000Z', source:'classroom' });
  let out = await doPost(obj, '/set', { osis:'3', isOut:true, whenISO:'2026-09-01T14:20:00.000Z', outSinceISO:'2026-09-01T14:20:00.000Z', reason:'bathroom' });
  assert.equal(out.json.outSinceISO, '2026-09-01T14:20:00.000Z');
  out = await doPost(obj, '/set', { osis:'3', isOut:true, whenISO:'2026-09-01T14:25:00.000Z', outSinceISO:'2026-09-01T14:25:00.000Z', reason:'hallway' });
  assert.equal(out.json.outSinceISO, '2026-09-01T14:20:00.000Z');
});


test('LiveLocation physical evidence ordering survives newer Staff Pull metadata and rejects older physical rewinds', async () => {
  const { StudentLocationDO } = await loadWorker();
  const state = mockState();
  const obj = new StudentLocationDO(state, {});

  let r = await doPost(obj, '/update', {
    osis:'4', date:'2026-09-01', zone:'class', loc:'101', location_label:'101',
    source:'teacher_att_submit', updated_at:'2026-09-01T15:10:00.000Z'
  });
  assert.equal(r.json.applied, true);
  let saved = await state.storage.get('s:4');
  assert.equal(saved.location_evidence_at, '2026-09-01T15:10:00.000Z');
  assert.equal(saved.loc, '101');

  r = await doPost(obj, '/update', {
    osis:'4', date:'2026-09-01', source:'staff_pull', updated_at:'2026-09-01T15:12:00.000Z',
    held_by_email:'staff@example.org', held_by_title:'Counselor', held_by_since:'2026-09-01T15:12:00.000Z'
  });
  assert.equal(r.json.applied, true);
  saved = await state.storage.get('s:4');
  assert.equal(saved.location_evidence_at, '2026-09-01T15:10:00.000Z');
  assert.equal(saved.loc, '101');
  assert.equal(saved.held_by_email, 'staff@example.org');

  // This physical scan happened after the last physical observation but before
  // the newer Staff Pull metadata update. The overlay must not hide it.
  r = await doPost(obj, '/scan_event', {
    osis:'4', date:'2026-09-01', mode:'bathroom', location:'Bathroom (First Floor)',
    student_name:'D', sex:'M', capacity:2, event_id:'evt-physical-1511',
    whenISO:'2026-09-01T15:11:00.000Z'
  });
  assert.equal(r.json.result.action, 'bathroom_in');
  saved = await state.storage.get('s:4');
  assert.equal(saved.zone, 'bathroom');
  assert.equal(saved.location_evidence_at, '2026-09-01T15:11:00.000Z');
  assert.equal(saved.held_by_email, 'staff@example.org');

  // An older direct physical writer is also rejected by the same evidence clock.
  r = await doPost(obj, '/update', {
    osis:'4', date:'2026-09-01', zone:'class', loc:'099', location_label:'099',
    source:'teacher_att_submit', updated_at:'2026-09-01T15:09:00.000Z'
  });
  assert.equal(r.json.superseded, true);
  assert.equal(r.json.applied, false);
  saved = await state.storage.get('s:4');
  assert.equal(saved.zone, 'bathroom');
  assert.equal(saved.loc, 'Bathroom (First Floor)');
  assert.equal(saved.location_evidence_at, '2026-09-01T15:11:00.000Z');
});

test('ClassSession observation chronology rejects backdated attendance time but accepts the later real staff observation', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  await doPost(obj, '/mark_first_in', { osis:'5', whenISO:'2026-09-01T14:05:00.000Z', source:'classroom_scan' });
  await doPost(obj, '/set', {
    osis:'5', isOut:true, whenISO:'2026-09-01T14:20:00.000Z',
    outSinceISO:'2026-09-01T14:20:00.000Z', reason:'bathroom', source:'scan_evidence', guardOrder:true
  });

  // Simulates the old bug: a teacher submits later but Attendance's emulated
  // scanISO is 14:10. Guarded ClassSession state must not rewind to that time.
  let r = await doPost(obj, '/set', {
    osis:'5', isOut:false, whenISO:'2026-09-01T14:10:00.000Z',
    reason:'teacher_present', source:'teacher_override', guardOrder:true
  });
  assert.equal(r.json.superseded, true);
  let raw = await state.storage.get('state');
  assert.equal(raw.students['5'].out.isOut, true);
  assert.equal(raw.students['5'].out.outSinceISO, '2026-09-01T14:20:00.000Z');
  assert.equal(raw.students['5'].lastEventISO, '2026-09-01T14:20:00.000Z');

  // Actual submit/observation time is later and legitimately returns the student IN.
  await doPost(obj, '/mark_first_in', { osis:'5', whenISO:'2026-09-01T14:25:00.000Z', source:'teacher_override' });
  r = await doPost(obj, '/set', {
    osis:'5', isOut:false, whenISO:'2026-09-01T14:25:00.000Z',
    reason:'teacher_present', source:'teacher_override', guardOrder:true
  });
  assert.equal(r.json.isOut, false);
  raw = await state.storage.get('state');
  assert.equal(raw.students['5'].firstInISO, '2026-09-01T14:05:00.000Z');
  assert.equal(raw.students['5'].lastEventISO, '2026-09-01T14:25:00.000Z');

  // A teacher observation with no prior room evidence starts first-in at the
  // observation time, not at a backdated attendance boundary.
  await doPost(obj, '/mark_first_in', { osis:'6', whenISO:'2026-09-01T14:25:00.000Z', source:'teacher_override' });
  raw = await state.storage.get('state');
  assert.equal(raw.students['6'].firstInISO, '2026-09-01T14:25:00.000Z');
});

test('ClassSession teacher toggle fails closed without first-in and stale toggles cannot reverse newer evidence', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  let r = await doPost(obj, '/toggle', { osis:'7', whenISO:'2026-09-01T14:10:00.000Z', source:'teacher' });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'no_first_in');
  let raw = await state.storage.get('state');
  assert.ok(!raw || !raw.students?.['7']);

  await doPost(obj, '/mark_first_in', { osis:'7', whenISO:'2026-09-01T14:12:00.000Z', source:'teacher_override' });
  r = await doPost(obj, '/toggle', { osis:'7', whenISO:'2026-09-01T14:20:00.000Z', source:'teacher' });
  assert.equal(r.status, 200);
  assert.equal(r.json.isOut, true);
  assert.equal(r.json.outSinceISO, '2026-09-01T14:20:00.000Z');

  r = await doPost(obj, '/toggle', { osis:'7', whenISO:'2026-09-01T14:15:00.000Z', source:'teacher' });
  assert.equal(r.status, 200);
  assert.equal(r.json.superseded, true);
  raw = await state.storage.get('state');
  assert.equal(raw.students['7'].out.isOut, true);
  assert.equal(raw.students['7'].out.outSinceISO, '2026-09-01T14:20:00.000Z');
});

test('effective ClassSession state derives scheduled OUT from bell but not after-school OUT before a home exists', async () => {
  const { effectiveClassSessionOut_ } = await loadWorker();
  const bell = '2026-09-01T13:30:00.000Z';

  assert.deepEqual(effectiveClassSessionOut_(null, bell), {
    isOut:true,
    outSinceISO:bell,
    reason:'period_start_no_in',
    source:'derived_period_start',
    byEmail:'',
    derived:true
  });

  const inRec = { osis:'8', firstInISO:'2026-09-01T13:35:00.000Z', out:{ isOut:false, source:'scan_evidence' } };
  const effectiveIn = effectiveClassSessionOut_(inRec, bell);
  assert.equal(effectiveIn.isOut, false);
  assert.equal(effectiveIn.derived, false);

  const outRec = {
    osis:'8', firstInISO:'2026-09-01T13:35:00.000Z',
    out:{ isOut:true, outSinceISO:'2026-09-01T13:50:00.000Z', reason:'bathroom', source:'scan_evidence', byEmail:'' }
  };
  const effectiveOut = effectiveClassSessionOut_(outRec, bell);
  assert.equal(effectiveOut.isOut, true);
  assert.equal(effectiveOut.outSinceISO, '2026-09-01T13:50:00.000Z');
  assert.equal(effectiveOut.derived, false);

  const afterSchoolMissing = effectiveClassSessionOut_(null, null);
  assert.equal(afterSchoolMissing.isOut, false);
  assert.equal(afterSchoolMissing.derived, false);
});

test('Staff Pull keeps one ClassSession OUT clock through release until positive room-return evidence', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  await doPost(obj, '/mark_first_in', { osis:'9', whenISO:'2026-09-01T14:05:00.000Z', source:'classroom_scan' });
  let r = await doPost(obj, '/set', {
    osis:'9', isOut:true, whenISO:'2026-09-01T14:20:00.000Z',
    outSinceISO:'2026-09-01T14:20:00.000Z', reason:'staff_pull', source:'staff_pull'
  });
  assert.equal(r.json.outSinceISO, '2026-09-01T14:20:00.000Z');

  r = await doPost(obj, '/set', {
    osis:'9', isOut:true, whenISO:'2026-09-01T14:25:00.000Z',
    reason:'staff_release', source:'staff_release'
  });
  assert.equal(r.json.isOut, true);
  assert.equal(r.json.outSinceISO, '2026-09-01T14:20:00.000Z');

  r = await doPost(obj, '/set', {
    osis:'9', isOut:false, whenISO:'2026-09-01T14:30:00.000Z',
    reason:'physical_location_evidence', source:'scan_evidence', guardOrder:true
  });
  assert.equal(r.json.isOut, false);
  const raw = await state.storage.get('state');
  assert.equal(raw.students['9'].out.isOut, false);
  assert.equal(raw.students['9'].staffPullIntervals.length, 1);
  assert.equal(raw.students['9'].staffPullIntervals[0].start_at_iso, '2026-09-01T14:20:00.000Z');
  assert.equal(raw.students['9'].staffPullIntervals[0].end_at_iso, '2026-09-01T14:25:00.000Z');
});


test('legacy LiveLocation rows use updated_at as a conservative migration barrier until dedicated evidence is stamped', async () => {
  const { StudentLocationDO } = await loadWorker();
  const state = mockState();
  await state.storage.put('s:10', {
    osis:'10',
    date:'2026-09-01',
    zone:'class',
    loc:'101',
    location_label:'101',
    source:'staff_pull',
    updated_at:'2026-09-01T15:12:00.000Z',
    last_scan_event_at:'2026-09-01T15:00:00.000Z',
    held_by_email:'staff@example.org',
    held_by_since:'2026-09-01T15:12:00.000Z'
  });
  const obj = new StudentLocationDO(state, {});

  // We cannot reconstruct the pre-upgrade teacher/overlay ordering perfectly,
  // so the newest legacy updated_at is intentionally the safe rollout barrier.
  let r = await doPost(obj, '/scan_event', {
    osis:'10', date:'2026-09-01', mode:'bathroom',
    location:'Bathroom (First Floor)', student_name:'Legacy', sex:'M', capacity:2,
    event_id:'legacy-old', whenISO:'2026-09-01T15:11:00.000Z'
  });
  assert.equal(r.json.result.action, 'superseded');
  let saved = await state.storage.get('s:10');
  assert.equal(saved.loc, '101');
  assert.equal(saved.location_evidence_at, undefined);

  // The next explicit physical observation establishes the dedicated clock.
  r = await doPost(obj, '/update', {
    osis:'10', date:'2026-09-01', zone:'class', loc:'102', location_label:'102',
    source:'teacher_att_submit', updated_at:'2026-09-01T15:13:00.000Z'
  });
  assert.equal(r.json.applied, true);
  saved = await state.storage.get('s:10');
  assert.equal(saved.location_evidence_at, '2026-09-01T15:13:00.000Z');

  // Once migrated, later overlay metadata no longer moves the physical clock.
  await doPost(obj, '/update', {
    osis:'10', date:'2026-09-01', source:'staff_pull_update',
    updated_at:'2026-09-01T15:14:00.000Z', held_by_title:'Counselor'
  });
  r = await doPost(obj, '/scan_event', {
    osis:'10', date:'2026-09-01', mode:'bathroom',
    location:'Bathroom (Second Floor)', student_name:'Legacy', sex:'M', capacity:2,
    event_id:'legacy-new', whenISO:'2026-09-01T15:13:30.000Z'
  });
  assert.equal(r.json.result.action, 'bathroom_in');
  saved = await state.storage.get('s:10');
  assert.equal(saved.loc, 'Bathroom (Second Floor)');
  assert.equal(saved.location_evidence_at, '2026-09-01T15:13:30.000Z');
  assert.equal(saved.held_by_email, 'staff@example.org');
});

test('AttendanceDO keeps the actual teacher observation time for Arrival Window Present', async () => {
  const { AttendanceDO } = await loadWorker();
  const state = mockState();
  const obj = new AttendanceDO(state, {});
  const whenISO = '2026-09-02T12:47:00.000Z';

  const result = await doPost(obj, '/override', {
    date:'2026-09-02',
    periodLocal:'2',
    room:'101',
    osis:'arrival-teacher',
    codeLetter:'P',
    byEmail:'teacher@example.org',
    whenISO,
    arrivalWindow:true
  });

  assert.equal(result.status, 200);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.scanISO, whenISO);
  const rec = await state.storage.get('2026-09-02|2|arrival-teacher');
  assert.equal(rec.firstISO, whenISO);
  assert.equal(rec.lastISO, whenISO);
  assert.equal(rec.scanCodeLetter, 'P');
});



test('after-school classroom home is atomically first-write-wins across kiosk rooms', async () => {
  const { StudentLocationDO } = await loadWorker();
  const state = mockState();
  const obj = new StudentLocationDO(state, {});
  const common = { osis:'after-1', date:'2026-09-02', mode:'after_school_class', student_name:'After School' };

  const first = await doPost(obj, '/scan_event', {
    ...common, event_id:'after-room-101', whenISO:'2026-09-02T19:00:00.000Z', location:'101'
  });
  assert.equal(first.json.result.action, 'after_school_in');
  assert.equal(first.json.result.after_school_home_established, true);

  const second = await doPost(obj, '/scan_event', {
    ...common, event_id:'after-room-102', whenISO:'2026-09-02T19:00:01.000Z', location:'102'
  });
  assert.equal(second.json.result.action, 'after_school_wrong_room');
  assert.equal(second.json.result.after_school_home_established, false);

  let saved = await state.storage.get('s:after-1');
  assert.equal(saved.after_school_home_room, '101');
  assert.equal(saved.loc, '102');

  const backHome = await doPost(obj, '/scan_event', {
    ...common, event_id:'after-room-101-back', whenISO:'2026-09-02T19:00:02.000Z', location:'101'
  });
  assert.equal(backHome.json.result.action, 'after_school_in');
  saved = await state.storage.get('s:after-1');
  assert.equal(saved.after_school_home_room, '101');
  assert.equal(saved.loc, '101');
});

test('ClassSession cancel finalizes the same second-scan event without creating OUT state', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  await doPost(obj, '/scan_event', {
    osis:'cancel-1', event_id:'cancel-first', whenISO:'2026-09-02T14:00:00.000Z'
  });
  const prompt = await doPost(obj, '/scan_event', {
    osis:'cancel-1', event_id:'cancel-second', whenISO:'2026-09-02T14:05:00.000Z'
  });
  assert.equal(prompt.json.result.action, 'class_needs_reason');

  const cancel = await doPost(obj, '/scan_event', {
    osis:'cancel-1', event_id:'cancel-second', whenISO:'2026-09-02T14:05:00.000Z', reason:'__CANCEL__'
  });
  assert.equal(cancel.json.result.action, 'class_cancelled');
  assert.equal(cancel.json.result.state_applied, false);

  const duplicate = await doPost(obj, '/scan_event', {
    osis:'cancel-1', event_id:'cancel-second', whenISO:'2026-09-02T14:05:00.000Z', reason:'__CANCEL__'
  });
  assert.equal(duplicate.json.duplicate, true);
  assert.equal(duplicate.json.result.action, 'class_cancelled');

  const raw = await state.storage.get('state');
  assert.equal(raw.students['cancel-1'].out.isOut, false);
  assert.equal(raw.students['cancel-1'].pendingScanPrompt, undefined);
});


test('ClassSession physical_evidence atomically derives scheduled OUT from the bell and returns IN on positive room evidence', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  let r = await doPost(obj, '/physical_evidence', {
    osis:'perf-phys-1',
    expected:false,
    whenISO:'2026-09-02T14:08:00.000Z',
    defaultOutSinceISO:'2026-09-02T14:00:00.000Z',
    reason:'morning_in',
    source:'scan_evidence'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.isOut, true);
  assert.equal(r.json.outSinceISO, '2026-09-02T14:00:00.000Z');

  r = await doPost(obj, '/physical_evidence', {
    osis:'perf-phys-1',
    expected:true,
    whenISO:'2026-09-02T14:12:00.000Z',
    reason:'physical_location_evidence',
    source:'scan_evidence'
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.isOut, false);
  assert.equal(r.json.firstInISO, '2026-09-02T14:12:00.000Z');
});

test('ClassSession physical_evidence preserves the first OUT clock and delayed positive evidence can improve firstIn without rewinding current state', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  await doPost(obj, '/physical_evidence', {
    osis:'perf-phys-2',
    expected:true,
    whenISO:'2026-09-02T14:05:00.000Z',
    source:'scan_evidence'
  });

  let r = await doPost(obj, '/physical_evidence', {
    osis:'perf-phys-2',
    expected:false,
    whenISO:'2026-09-02T14:20:00.000Z',
    defaultOutSinceISO:'2026-09-02T14:00:00.000Z',
    reason:'bathroom_in',
    source:'scan_evidence'
  });
  assert.equal(r.json.isOut, true);
  assert.equal(r.json.outSinceISO, '2026-09-02T14:20:00.000Z');

  r = await doPost(obj, '/physical_evidence', {
    osis:'perf-phys-2',
    expected:false,
    whenISO:'2026-09-02T14:25:00.000Z',
    defaultOutSinceISO:'2026-09-02T14:00:00.000Z',
    reason:'hallway',
    source:'scan_evidence'
  });
  assert.equal(r.json.outSinceISO, '2026-09-02T14:20:00.000Z');

  r = await doPost(obj, '/physical_evidence', {
    osis:'perf-phys-2',
    expected:true,
    whenISO:'2026-09-02T14:03:00.000Z',
    source:'scan_evidence'
  });
  assert.equal(r.json.superseded, true);
  assert.equal(r.json.first_in_improved, true);

  const raw = await state.storage.get('state');
  assert.equal(raw.students['perf-phys-2'].firstInISO, '2026-09-02T14:03:00.000Z');
  assert.equal(raw.students['perf-phys-2'].out.isOut, true);
  assert.equal(raw.students['perf-phys-2'].out.outSinceISO, '2026-09-02T14:20:00.000Z');
  assert.equal(raw.students['perf-phys-2'].lastEventISO, '2026-09-02T14:25:00.000Z');
});

test('after-school physical_evidence does not manufacture OUT before a home first-IN exists', async () => {
  const { ClassSessionDO } = await loadWorker();
  const state = mockState();
  const obj = new ClassSessionDO(state, {});

  let r = await doPost(obj, '/physical_evidence', {
    osis:'perf-after-1',
    expected:false,
    whenISO:'2026-09-02T19:01:00.000Z',
    defaultOutSinceISO:'2026-09-02T19:01:00.000Z',
    reason:'away_from_after_school_home',
    source:'scan_evidence',
    awayRequiresFirstIn:true
  });
  assert.equal(r.json.skipped, true);
  assert.equal(r.json.reason, 'no_first_in');

  r = await doPost(obj, '/physical_evidence', {
    osis:'perf-after-1',
    expected:true,
    whenISO:'2026-09-02T19:02:00.000Z',
    source:'scan_evidence',
    awayRequiresFirstIn:true
  });
  assert.equal(r.json.isOut, false);

  r = await doPost(obj, '/physical_evidence', {
    osis:'perf-after-1',
    expected:false,
    whenISO:'2026-09-02T19:05:00.000Z',
    defaultOutSinceISO:'2026-09-02T19:05:00.000Z',
    reason:'away_from_after_school_home',
    source:'scan_evidence',
    awayRequiresFirstIn:true
  });
  assert.equal(r.json.isOut, true);
  assert.equal(r.json.outSinceISO, '2026-09-02T19:05:00.000Z');
});

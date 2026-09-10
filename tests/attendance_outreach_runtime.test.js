const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const serviceUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/attendance-outreach.js')).href;

async function service() {
  return import(`${serviceUrl}?v=${Date.now()}-${Math.random()}`);
}

const DATE = '2026-09-10';
const MORNING = '2026-09-10T12:03:00.000Z';
const LATER = '2026-09-10T13:17:00.000Z';

test('explicit and legacy morning-entry evidence survives later location changes', async () => {
  const mod = await service();
  let row = mod.classifyAttendanceOutreachStudent({
    date: DATE,
    student: { osis:'1001', name:'Student One', grade:'10' },
    state: {
      date:DATE, zone:'class', location_label:'Room 309', source:'class_in', last_scan_event_at:LATER,
      morning_entry_date:DATE, morning_entry_at:MORNING, morning_entry_location:'Front Entrance (Morning)'
    }
  });
  assert.equal(row.status, 'confirmed');
  assert.equal(row.has_morning_entry, true);
  assert.equal(row.current_location, 'Room 309');

  row = mod.classifyAttendanceOutreachStudent({
    date: DATE,
    student: { osis:'1002', name:'Student Two', grade:'11' },
    state: {
      date:DATE, zone:'class', location_label:'Room 310', source:'class_in', last_scan_event_at:LATER,
      after_school_late_arrival_date:DATE,
      after_school_late_arrival_at:MORNING,
      after_school_late_arrival_location:'Front Entrance (Morning)'
    }
  });
  assert.equal(row.status, 'confirmed');
  assert.equal(row.morning_source, 'legacy_arrival');
});

test('other same-day scan without a morning entry is flagged for verification, not a call', async () => {
  const mod = await service();
  const row = mod.classifyAttendanceOutreachStudent({
    date: DATE,
    student: { osis:'2001', name:'Student Three', grade:'9' },
    state: {
      date:DATE, zone:'class', location_label:'Room 211', source:'class_in',
      last_scan_event_at:LATER, location_evidence_at:LATER, location_evidence_source:'class_in'
    }
  });
  assert.equal(row.status, 'needs_verification');
  assert.equal(row.has_morning_entry, false);
  assert.equal(row.has_today_evidence, true);
  assert.equal(row.evidence_kind, 'scan');
});

test('student with no same-day evidence remains in the attendance call queue', async () => {
  const mod = await service();
  const row = mod.classifyAttendanceOutreachStudent({
    date: DATE,
    student: { osis:'3001', name:'Student Four', grade:'12' },
    state: { date:'2026-09-09', last_scan_event_at:'2026-09-09T14:00:00.000Z' }
  });
  assert.equal(row.status, 'needs_call');
  assert.equal(row.has_today_evidence, false);
});

test('Attendance communication and office verification resolve their respective workflow rows', async () => {
  const mod = await service();
  const base = {
    date:DATE, zone:'class', location_label:'Room 207', source:'class_in', last_scan_event_at:LATER
  };
  const verified = mod.classifyAttendanceOutreachStudent({
    date:DATE,
    student:{ osis:'4001', name:'Student Five' },
    state:base,
    verification:{ verified:true, verified_at_iso:LATER, verified_by_email:'office@school.org' }
  });
  assert.equal(verified.status, 'verified');

  const contacted = mod.classifyAttendanceOutreachStudent({
    date:DATE,
    student:{ osis:'4001', name:'Student Five' },
    state:base,
    verification:{ verified:true },
    communication:{ student_number:'4001', category:'Attendance', outcome:'Spoke/Connected', contact_at_iso:LATER }
  });
  assert.equal(contacted.status, 'contacted');
});

test('queue summary counts only unresolved calls and verification rows as needs action', async () => {
  const mod = await service();
  const queue = mod.buildAttendanceOutreachQueue({
    date:DATE,
    roster:[
      { osis:'1', name:'A' },
      { osis:'2', name:'B' },
      { osis:'3', name:'C' }
    ],
    locations:{
      '2':{ date:DATE, last_scan_event_at:LATER, location_evidence_at:LATER, source:'class_in', location_label:'201' },
      '3':{ date:DATE, morning_entry_date:DATE, morning_entry_at:MORNING, last_scan_event_at:LATER, source:'class_in', location_label:'202' }
    }
  });
  assert.equal(queue.summary.needs_call, 1);
  assert.equal(queue.summary.needs_verification, 1);
  assert.equal(queue.summary.confirmed, 1);
  assert.equal(queue.summary.needs_action, 2);
});

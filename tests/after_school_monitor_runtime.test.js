const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const servicePath = path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/after-school-monitor.js');
let service;

test.before(async () => {
  service = await import(`${pathToFileURL(servicePath).href}?afterSchool=${Date.now()}`);
});

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function kvWith(data) {
  return {
    async get(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    }
  };
}

function studentLocBinding(states, namesSeen) {
  return {
    idFromName(name) {
      namesSeen.push(name);
      return name;
    },
    get() {
      return {
        async fetch(url) {
          assert.match(String(url), /\/all$/);
          return jsonResponse(states);
        }
      };
    }
  };
}

test('After-School Monitor preserves hold priority, counts, lockers, and location state', async () => {
  const namesSeen = [];
  const today = service.getAfterSchoolMonitorNYCDate();
  const env = {
    ROSTER: kvWith({
      roster_v1: {
        rows: [
          { o: '1001', n: 'Regents Student', g: '12', rp: true, l: '12', c: 'Blue' },
          { o: '1002', n: 'Reflection Student', g: '11' },
          { o: '1003', n: 'Late Student', g: '10' },
          { o: '1004', n: 'After School Student', g: '9', l: '44', c: 'Red' },
          { o: '1005', n: 'Not Included', g: '9' }
        ]
      }
    }),
    STUDENT_LOC: studentLocBinding({
      '1001': {
        date: today,
        zone: 'off_campus',
        loc: 'off_campus',
        location_label: 'Off Campus',
        updated_at: `${today}T15:00:00.000Z`
      },
      '1002': {
        date: today,
        zone: 'after_school',
        loc: '306',
        location_label: 'Room 306',
        student_name: 'Reflection Student',
        updated_at: `${today}T15:01:00.000Z`,
        after_school_reflection_hold_active: true,
        after_school_reflection_hold_date: today,
        after_school_reflection_hold_label: 'Reflection Hold',
        after_school_reflection_hold_room: '306',
        after_school_reflection_owner_email: 'staff@example.org',
        after_school_reflection_hold_reason: 'Practice reflection',
        after_school_reflection_hold_set_at: `${today}T14:55:00.000Z`
      },
      '1003': {
        date: today,
        zone: 'hallway',
        loc: 'hallway',
        location_label: 'Hallway',
        updated_at: `${today}T15:02:00.000Z`,
        after_school_late_hold_active: true,
        after_school_late_hold_date: today,
        after_school_late_arrival_at: `${today}T14:58:00.000Z`,
        after_school_late_by_min: 8
      },
      '1004': {
        date: today,
        zone: 'after_school',
        loc: '405',
        location_label: 'Room 405',
        updated_at: `${today}T15:03:00.000Z`
      }
    }, namesSeen)
  };

  const result = await service.buildAfterSchoolMonitorSnapshot(env, { practice: false }, today);
  assert.equal(result.ok, true);
  assert.equal(result.counts.total, 4);
  assert.equal(result.counts.in_after_school, 2);
  assert.equal(result.counts.regents_prep, 1);
  assert.equal(result.counts.reflection, 1);
  assert.equal(result.counts.late_arrival, 1);
  assert.equal(result.counts.no_phone_locker, 2);
  assert.equal(result.counts.off_campus, 1);
  assert.deepEqual(result.students.map((s) => s.osis), ['1001', '1002', '1003', '1004']);
  assert.equal(result.students[0].primary_hold.type, 'regents_prep');
  assert.equal(result.students[1].primary_hold.type, 'reflection');
  assert.equal(result.students[2].primary_hold.type, 'late_arrival');
  assert.equal(result.students[3].in_after_school, true);
  assert.equal(result.students[0].phone_locker_number, '12');
  assert.deepEqual(namesSeen, ['GLOBAL']);
});

test('After-School Monitor Practice snapshot reads only the Practice StudentLocation object', async () => {
  const namesSeen = [];
  const today = service.getAfterSchoolMonitorNYCDate();
  const env = {
    ROSTER: kvWith({
      roster_v1: { rows: [{ o: '2001', n: 'Practice Student' }] }
    }),
    STUDENT_LOC: studentLocBinding({
      '2001': {
        date: today,
        zone: 'after_school',
        loc: '420',
        location_label: 'Practice After School',
        updated_at: `${today}T15:00:00.000Z`
      }
    }, namesSeen)
  };

  const result = await service.buildAfterSchoolMonitorSnapshot(
    env,
    { practice: true, practice_day: today },
    today
  );
  assert.equal(result.counts.in_after_school, 1);
  assert.equal(result.students[0].location_label, 'Practice After School');
  assert.deepEqual(namesSeen, [`PRACTICE:${today}:GLOBAL`]);
});

test('After-School Monitor keeps legacy reflection-hold compatibility', () => {
  const today = '2026-08-25';
  const row = service.buildAfterSchoolMonitorRow('3001', { n: 'Legacy Hold Student' }, {
    date: today,
    zone: 'hallway',
    held_by_email: 'staff@example.org',
    held_by_role: 'reflection_hold',
    held_by_title: 'Reflection Hold',
    held_by_since: `${today}T15:00:00.000Z`,
    held_target_loc: 'reflection_hold',
    held_target_label: 'Reflection Hold',
    source: 'reflection_hold'
  }, today);
  assert.equal(row.primary_hold.type, 'reflection');
  assert.equal(row.primary_hold.legacy, true);
});

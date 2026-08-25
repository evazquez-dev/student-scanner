const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const servicePath = path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/hallway-monitor.js');
let service;

test.before(async () => {
  service = await import(`${pathToFileURL(servicePath).href}?hallway=${Date.now()}`);
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

test('Hallway Monitor snapshot preserves counts, locations, bathroom visits, and off-campus defaults', async () => {
  const namesSeen = [];
  const today = service.getHallwayMonitorNYCDate();
  const env = {
    ROSTER: kvWith({
      roster_v1: {
        rows: [
          { o: '1001', n: 'Ada Student', rp: true },
          { o: '1002', n: 'Ben Student' },
          { o: '1003', n: 'Cara Student' }
        ]
      },
      bell_schedule_v1: { tz: 'America/New_York', periods: [] },
      student_classes_v1: { classes: {} },
      att_cfg_v1: { webapp_schedule_mode: 'special' }
    }),
    STUDENT_LOC: studentLocBinding({
      '1001': {
        date: today,
        zone: 'bathroom',
        loc: 'Bathroom 3F',
        location_label: 'Third Floor Bathroom',
        student_name: 'Ada Student',
        source: 'scanner',
        updated_at: `${today}T15:00:00.000Z`,
        bathroom_visits: 2
      },
      '1002': {
        date: today,
        zone: 'hallway',
        loc: 'hallway',
        location_label: 'Second Floor Hallway',
        source: 'scanner',
        updated_at: `${today}T14:59:00.000Z`
      }
    }, namesSeen)
  };

  const result = await service.buildHallwayMonitorSnapshot(env, { practice: false }, today);
  assert.equal(result.ok, true);
  assert.equal(result.total, 3);
  assert.equal(result.counts.bathroom, 1);
  assert.equal(result.counts.hallway, 1);
  assert.equal(result.counts.off_campus, 1);
  assert.equal(result.by_location['Third Floor Bathroom'][0].bathroom_visits, 2);
  assert.equal(result.by_location['Third Floor Bathroom'][0].regents_prep, true);
  assert.equal(result.by_location['Off Campus'][0].osis, '1003');
  assert.deepEqual(namesSeen, ['GLOBAL']);
});

test('Hallway Monitor Practice snapshot reads only the Practice StudentLocation object', async () => {
  const namesSeen = [];
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const env = {
    ROSTER: kvWith({
      roster_v1: { rows: [{ o: '2001', n: 'Practice Student' }] },
      bell_schedule_v1: { periods: [] },
      student_classes_v1: { classes: {} }
    }),
    STUDENT_LOC: studentLocBinding({
      '2001': {
        date: today,
        zone: 'hallway',
        loc: 'hallway',
        location_label: 'Practice Hallway',
        updated_at: `${today}T15:00:00.000Z`
      }
    }, namesSeen)
  };

  const result = await service.buildHallwayMonitorSnapshot(
    env,
    { practice: true, practice_day: today },
    today
  );
  assert.equal(result.counts.hallway, 1);
  assert.deepEqual(namesSeen, [`PRACTICE:${today}:GLOBAL`]);
});

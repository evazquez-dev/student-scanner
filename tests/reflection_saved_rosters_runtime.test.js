const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const servicePath = path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/reflection-saved-rosters.js');
let service;

test.before(async () => {
  service = await import(`${pathToFileURL(servicePath).href}?saved_rosters=${Date.now()}`);
});

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function makeEnv({ rosterRows = [], states = {} } = {}) {
  const kv = new Map();
  const puts = [];
  const namesSeen = [];
  const stateMap = JSON.parse(JSON.stringify(states));
  const env = {
    ROSTER: {
      async get(key) {
        if (key === 'roster_v1') return { rows: rosterRows };
        return kv.has(key) ? kv.get(key) : null;
      },
      async put(key, value, options) {
        const parsed = JSON.parse(String(value));
        kv.set(key, parsed);
        puts.push({ key, value: parsed, options: options || null });
      }
    },
    STUDENT_LOC: {
      idFromName(name) {
        namesSeen.push(name);
        return name;
      },
      get() {
        return {
          async fetch(url) {
            if (String(url).endsWith('/all')) return jsonResponse(stateMap);
            return jsonResponse({ ok: false }, 404);
          }
        };
      }
    }
  };
  return { env, kv, puts, namesSeen };
}

test('saved Reflection rosters persist per staff account without Practice TTL and can be replaced/deleted', async () => {
  const { env, puts } = makeEnv({
    rosterRows: [
      { o: '5001', n: 'One', g: '10' },
      { o: '5002', n: 'Two', g: '10' }
    ]
  });
  const who = { email: 'teacher@example.org' };
  const first = await service.saveReflectionSavedRoster(env, who, {
    name: 'Daily Reflection',
    osisList: ['5001', '5002']
  });
  assert.equal(first.ok, true);
  assert.equal(first.replaced, false);
  assert.equal(first.saved_roster.student_count, 2);

  const configPut = puts.find((row) => row.key.startsWith('reflection_hold:saved_rosters:v1:'));
  assert.ok(configPut);
  assert.equal(configPut.options, null);
  assert.doesNotMatch(configPut.key, /^practice:v1:/);

  const listed = await service.listReflectionSavedRosters(env, who);
  assert.equal(listed.saved_rosters.length, 1);
  assert.equal(listed.saved_rosters[0].name, 'Daily Reflection');

  const replaced = await service.saveReflectionSavedRoster(env, who, {
    name: 'Daily Reflection',
    osisList: ['5002']
  });
  assert.equal(replaced.replaced, true);
  assert.equal(replaced.saved_roster.id, first.saved_roster.id);
  assert.equal(replaced.saved_roster.student_count, 1);

  const deleted = await service.deleteReflectionSavedRoster(env, who, { id: first.saved_roster.id });
  assert.equal(deleted.ok, true);
  const afterDelete = await service.listReflectionSavedRosters(env, who);
  assert.equal(afterDelete.saved_rosters.length, 0);
});

test('saved roster loading filters no-shows, early dismissals, and students already off campus', async () => {
  const today = service.getReflectionSavedRosterNYCDate
    ? service.getReflectionSavedRosterNYCDate()
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { env, namesSeen } = makeEnv({
    rosterRows: [
      { o: '6001', n: 'Still Here', g: '10' },
      { o: '6002', n: 'No State', g: '10' },
      { o: '6003', n: 'Early', g: '11' },
      { o: '6004', n: 'Absent', g: '11' },
      { o: '6005', n: 'Already Left', g: '12' },
      { o: '6006', n: 'Yesterday', g: '12' }
    ],
    states: {
      '6001': { date: today, zone: 'hallway', loc: 'hallway', location_label: 'Hallway' },
      '6003': { date: today, zone: 'off_campus', source: 'early_dismissal_form', location_label: 'Off Campus (early dismissal)' },
      '6004': { date: today, zone: 'off_campus', source: 'absent_mark_off_campus', location_label: 'Off Campus (Absent)' },
      '6005': { date: today, zone: 'off_campus', source: 'exit_scan', location_label: 'Off Campus' },
      '6006': { date: '2000-01-01', zone: 'class', loc: '306' }
    }
  });
  const who = { email: 'teacher@example.org' };
  const saved = await service.saveReflectionSavedRoster(env, who, {
    name: 'After School Group',
    osisList: ['6001', '6002', '6003', '6004', '6005', '6006']
  });
  const modeInfo = { practice: true, practice_day: today };
  namesSeen.length = 0;
  const loaded = await service.loadReflectionSavedRoster(env, modeInfo, who, saved.saved_roster.id);

  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.osis_list, ['6001']);
  assert.equal(loaded.counts.saved, 6);
  assert.equal(loaded.counts.selected, 1);
  assert.equal(loaded.counts.not_present_today, 3);
  assert.equal(loaded.counts.left_early, 1);
  assert.equal(loaded.counts.off_campus, 1);
  assert.ok(namesSeen.length >= 1);
  assert.ok(namesSeen.every((name) => name === `PRACTICE:${today}:GLOBAL`));
});

test('saved-roster frontend helper and route remain wired without replacing core Reflection selection logic', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/reflection_hold.html'), 'utf8');
  const frontend = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/reflection_saved_rosters.js'), 'utf8');
  const route = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/reflection-hold.js'), 'utf8');
  assert.match(html, /reflection_saved_rosters\.js/);
  assert.match(frontend, /Save this roster/);
  assert.match(frontend, /savedRosterSelect/);
  assert.match(frontend, /#rosterBody tr/);
  assert.match(frontend, /dispatchEvent\(new Event\('change'/);
  assert.match(frontend, /saved_rosters\/load\?id=/);
  assert.match(route, /saveReflectionSavedRoster/);
  assert.match(route, /deleteReflectionSavedRoster/);
  assert.match(route, /loadReflectionSavedRoster/);
});

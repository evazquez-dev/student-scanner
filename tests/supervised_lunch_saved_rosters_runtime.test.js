const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const servicePath = path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/supervised-lunch-saved-rosters.js');
let service;

test.before(async () => {
  service = await import(`${pathToFileURL(servicePath).href}?saved_lunch_rosters=${Date.now()}`);
});

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function baseDocs(today) {
  return {
    roster_v1: {
      rows: [
        { o: '1001', n: 'Alpha Lunch', g: '9' },
        { o: '1002', n: 'Beta Lunch', g: '10' },
        { o: '1003', n: 'Gamma Lunch', g: '11' },
        { o: '1004', n: 'Not Lunch', g: '12' }
      ]
    },
    student_classes_v1: {
      classes: {
        '1001': { LCH1: 'RM Caf' },
        '1002': { LCH1: 'Lunch' },
        '1003': { LCH1: 'Caf' },
        '1004': { LCH1: '410' }
      },
      courses: {
        '1001': { LCH1: 'Lunch' },
        '1002': { LCH1: 'Lunch (Caf)' },
        '1003': { LCH1: 'Lunch' },
        '1004': { LCH1: 'ELA400.1' }
      }
    },
    att_cfg_v1: { webapp_schedule_mode: 'special' },
    [`supervised_lunch_v1:${today}`]: {
      date: today,
      assignments: [
        {
          teacherEmail: 'teacher@school.org',
          periodLocal: 'LCH1',
          room: '306',
          label: 'Supervised Lunch (306)',
          osisList: ['1001', '1002', '1003'],
          updatedAt: `${today}T12:00:00.000Z`
        }
      ]
    }
  };
}

function makeEnv(today, states = {}) {
  const seed = baseDocs(today);
  const kv = new Map(Object.entries(seed).map(([k, v]) => [k, v]));
  const puts = [];
  const namesSeen = [];
  const env = {
    ROSTER: {
      async get(key) { return kv.has(key) ? kv.get(key) : null; },
      async put(key, value, options) {
        const parsed = JSON.parse(String(value));
        kv.set(key, parsed);
        puts.push({ key, value: parsed, options: options || null });
      }
    },
    STUDENT_LOC: {
      idFromName(name) { namesSeen.push(name); return name; },
      get() {
        return {
          async fetch(url) {
            if (String(url).endsWith('/all')) return jsonResponse(states);
            return jsonResponse({ ok: false }, 404);
          }
        };
      }
    }
  };
  return { env, kv, puts, namesSeen };
}

test('named Supervised Lunch roster saves the applied assignment and persists as personal configuration', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { env, puts } = makeEnv(today);
  const who = { email: 'teacher@school.org' };
  const modeInfo = { practice: false, practice_day: today };

  const saved = await service.saveSupervisedLunchSavedRoster(env, modeInfo, who, {
    name: 'Lunch Crew', date: today, periodLocal: 'LCH1', room: '306'
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.saved_roster.name, 'Lunch Crew');
  assert.equal(saved.saved_roster.periodLocal, 'LCH1');
  assert.equal(saved.saved_roster.room, '306');
  assert.equal(saved.saved_roster.student_count, 3);

  const configPut = puts.find((row) => row.key.startsWith('supervised_lunch:saved_rosters:v1:'));
  assert.ok(configPut);
  assert.equal(configPut.options, null);
  assert.doesNotMatch(configPut.key, /^practice:v1:/);

  const listed = await service.listSupervisedLunchSavedRosters(env, who);
  assert.equal(listed.saved_rosters.length, 1);
  assert.equal(listed.saved_rosters[0].name, 'Lunch Crew');

  const deleted = await service.deleteSupervisedLunchSavedRoster(env, who, { id: saved.saved_roster.id });
  assert.equal(deleted.ok, true);
  assert.equal((await service.listSupervisedLunchSavedRosters(env, who)).saved_rosters.length, 0);
});

test('named roster cannot be saved until that lunch/room assignment is actually applied', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { env } = makeEnv(today);
  const result = await service.saveSupervisedLunchSavedRoster(
    env,
    { practice: false, practice_day: today },
    { email: 'teacher@school.org' },
    { name: 'Not Applied', date: today, periodLocal: 'LCH1', room: '999' }
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, 'apply_assignment_before_saving_roster');
});

test('loading a named lunch roster filters attendance/location state and current lunch eligibility in Practice Mode', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const states = {
    '1001': { date: today, zone: 'class', loc: '301', location_label: 'Room 301' },
    '1002': { date: today, zone: 'off_campus', source: 'early_dismissal_form', location_label: 'Off Campus (early dismissal)' },
    '1003': { date: today, zone: 'off_campus', source: 'absent_mark_off_campus', location_label: 'Off Campus (Absent)' }
  };
  const { env, namesSeen, kv } = makeEnv(today, states);
  const who = { email: 'teacher@school.org' };
  const liveMode = { practice: false, practice_day: today };
  const saved = await service.saveSupervisedLunchSavedRoster(env, liveMode, who, {
    name: 'Filtered Crew', date: today, periodLocal: 'LCH1', room: '306'
  });

  const classes = JSON.parse(JSON.stringify(kv.get('student_classes_v1')));
  classes.classes['1003'].LCH1 = '410';
  classes.courses['1003'].LCH1 = 'ELA400.1';
  kv.set('student_classes_v1', classes);

  namesSeen.length = 0;
  const loaded = await service.loadSupervisedLunchSavedRoster(
    env,
    { practice: true, practice_day: today },
    who,
    saved.saved_roster.id
  );
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.osis_list, ['1001']);
  assert.equal(loaded.counts.saved, 3);
  assert.equal(loaded.counts.selected, 1);
  assert.equal(loaded.counts.left_early, 1);
  assert.equal(loaded.counts.not_lunch_eligible, 1);
  assert.ok(namesSeen.length >= 1);
  assert.ok(namesSeen.every((name) => name === `PRACTICE:${today}:GLOBAL`));
});

test('Supervised Lunch frontend presents named saved rosters and keeps daily assignment as a separate action', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/supervised_lunch.html'), 'utf8');
  const frontend = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/supervised_lunch_saved_rosters.js'), 'utf8');
  const route = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/supervised-lunch.js'), 'utf8');
  assert.match(html, /Saved lunch rosters/);
  assert.match(html, /Apply today’s assignment/);
  assert.match(html, /Save roster/);
  assert.doesNotMatch(html, /Use last set/);
  assert.match(frontend, /async function saveRoster/);
  assert.match(frontend, /loadSavedRoster/);
  assert.match(frontend, /apply_assignment_before_saving_roster|Apply today’s supervised lunch assignment/);
  assert.match(route, /saveSupervisedLunchSavedRoster/);
  assert.match(route, /loadSupervisedLunchSavedRoster/);
});

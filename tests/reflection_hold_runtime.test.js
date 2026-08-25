const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const servicePath = path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/reflection-hold.js');
let service;

test.before(async () => {
  service = await import(`${pathToFileURL(servicePath).href}?reflection=${Date.now()}`);
});

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function makeEnv({ rosterRows = [], locations = [], states = {} } = {}) {
  const puts = [];
  const namesSeen = [];
  const updates = [];
  const stateMap = JSON.parse(JSON.stringify(states));
  const env = {
    ROSTER: {
      async get(key) {
        if (key === 'roster_v1') return { rows: rosterRows };
        if (key === 'locs_v1') return { locations };
        return null;
      },
      async put(key, value, options) {
        puts.push({ key, value: JSON.parse(String(value)), options: options || null });
      }
    },
    STUDENT_LOC: {
      idFromName(name) {
        namesSeen.push(name);
        return name;
      },
      get() {
        return {
          async fetch(url, init = {}) {
            const u = String(url);
            if (u.endsWith('/all')) return jsonResponse(stateMap);
            if (u.endsWith('/update')) {
              const body = JSON.parse(String(init.body || '{}'));
              updates.push(body);
              const osis = String(body.osis || '');
              stateMap[osis] = { ...(stateMap[osis] || {}), ...body };
              return jsonResponse({ ok: true });
            }
            return jsonResponse({ ok: false }, 404);
          }
        };
      }
    }
  };
  return { env, puts, namesSeen, updates, stateMap };
}

test('Reflection Hold preview preserves Regents priority and Late Arrival replacement behavior', async () => {
  const today = service.getReflectionHoldNYCDate();
  const { env } = makeEnv({
    rosterRows: [
      { o: '1001', n: 'Regents Student', g: '12', rp: true },
      { o: '1002', n: 'Late Student', g: '11' },
      { o: '1003', n: 'Ready Student', g: '10' }
    ],
    locations: [{ name: '306', type: 'class' }],
    states: {
      '1002': {
        date: today,
        zone: 'hallway',
        loc: 'hallway',
        after_school_late_hold_active: true,
        after_school_late_hold_date: today,
        after_school_late_arrival_at: `${today}T14:00:00.000Z`
      }
    }
  });

  const result = await service.previewReflectionHold(env, { practice: false, practice_day: today }, {
    date: today,
    room: 'RM 306',
    osisList: ['1001', '1002', '1003', '9999']
  });
  assert.equal(result.ok, true);
  assert.equal(result.room, '306');
  assert.deepEqual(result.counts, { total: 4, eligible: 2, already_held: 1, unknown: 1 });
  const regents = result.rows.find((r) => r.osis === '1001');
  const late = result.rows.find((r) => r.osis === '1002');
  assert.equal(regents.hold.type, 'regents_prep');
  assert.equal(regents.eligible, false);
  assert.equal(late.eligible, true);
  assert.equal(late.lower_priority_hold.type, 'late_arrival');
});

test('Reflection Hold confirm writes only to the Practice StudentLocation object and Practice audit namespace', async () => {
  const today = service.getReflectionHoldNYCDate();
  const { env, puts, namesSeen, updates } = makeEnv({
    rosterRows: [{ o: '2001', n: 'Practice Student', g: '10' }],
    locations: [{ name: '306', type: 'class' }],
    states: {
      '2001': {
        date: today,
        zone: 'hallway',
        loc: 'hallway',
        location_label: 'Hallway'
      }
    }
  });
  const modeInfo = { practice: true, practice_day: today };
  const result = await service.confirmReflectionHold(env, modeInfo, {
    email: 'teacher@example.org',
    role: 'editor'
  }, {
    date: today,
    room: '306',
    holdLabel: 'Reflection Hold',
    reason: 'Practice test',
    osisList: ['2001']
  });

  assert.equal(result.applied_count, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].source, 'after_school_reflection_hold');
  assert.equal(updates[0].after_school_reflection_hold_active, true);
  assert.equal(updates[0].after_school_reflection_owner_email, 'teacher@example.org');
  assert.ok(namesSeen.length >= 2);
  assert.ok(namesSeen.every((name) => name === `PRACTICE:${today}:GLOBAL`));
  assert.equal(puts.length, 1);
  assert.match(puts[0].key, new RegExp(`^practice:v1:${today}:audit:`));
  assert.equal(puts[0].value.practice, true);
  assert.equal(puts[0].options.expirationTtl, 36 * 60 * 60);
});

test('Reflection Hold update converts a legacy hold to modern fields without leaving legacy hold controls active', async () => {
  const today = service.getReflectionHoldNYCDate();
  const { env, updates } = makeEnv({
    locations: [{ name: '405', type: 'class' }],
    states: {
      '3001': {
        date: today,
        zone: 'with_staff',
        loc: 'reflection_hold',
        held_by_email: 'teacher@example.org',
        held_by_role: 'reflection_hold',
        held_by_title: 'Reflection Hold',
        held_by_since: `${today}T14:00:00.000Z`,
        held_target_loc: 'reflection_hold',
        held_target_label: 'Reflection Hold',
        source: 'reflection_hold'
      }
    }
  });

  const result = await service.updateReflectionHold(env, { practice: false, practice_day: today }, {
    email: 'teacher@example.org',
    role: 'editor'
  }, {
    date: today,
    room: '405',
    reason: 'Updated note'
  });

  assert.equal(result.updated_count, 1);
  assert.equal(updates[0].after_school_reflection_hold_active, true);
  assert.equal(updates[0].after_school_reflection_hold_room, '405');
  assert.equal(updates[0].zone, 'hallway');
  assert.equal(updates[0].held_by_email, null);
  assert.equal(updates[0].held_target_loc, null);
});

test('Reflection Hold release preserves ownership and clears modern hold fields', async () => {
  const today = service.getReflectionHoldNYCDate();
  const { env, updates } = makeEnv({
    rosterRows: [
      { o: '4001', n: 'Mine' },
      { o: '4002', n: 'Not Mine' }
    ],
    states: {
      '4001': {
        date: today,
        student_name: 'Mine',
        after_school_reflection_hold_active: true,
        after_school_reflection_hold_date: today,
        after_school_reflection_owner_email: 'teacher@example.org',
        after_school_reflection_hold_label: 'Reflection Hold'
      },
      '4002': {
        date: today,
        student_name: 'Not Mine',
        after_school_reflection_hold_active: true,
        after_school_reflection_hold_date: today,
        after_school_reflection_owner_email: 'other@example.org',
        after_school_reflection_hold_label: 'Reflection Hold'
      }
    }
  });

  const result = await service.releaseReflectionHold(env, { practice: false, practice_day: today }, {
    email: 'teacher@example.org',
    role: 'editor'
  }, {
    date: today,
    osisList: ['4001', '4002'],
    mine: false,
    mode: 'release'
  });

  assert.equal(result.released_count, 1);
  assert.equal(result.skipped_count, 1);
  assert.equal(result.skipped[0].reason, 'not_owned_by_current_user');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].osis, '4001');
  assert.equal(updates[0].after_school_reflection_hold_active, false);
  assert.equal(updates[0].reflection_hold_cleared_mode, 'release');
});

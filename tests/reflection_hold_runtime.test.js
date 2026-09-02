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
            if (u.endsWith('/reflection_hold')) {
              const body = JSON.parse(String(init.body || '{}'));
              updates.push(body);
              const osis = String(body.osis || '');
              const prev = stateMap[osis] || {};
              const action = String(body.action || '').toLowerCase();
              const modernActive = !!prev.after_school_reflection_hold_active;
              const legacyActive = !!prev.held_by_email && (
                String(prev.held_by_role || '').toLowerCase() === 'reflection_hold' ||
                String(prev.held_target_loc || '').toLowerCase() === 'reflection_hold' ||
                String(prev.source || '').toLowerCase().includes('reflection_hold')
              );
              const existingOwner = String(
                modernActive
                  ? (prev.after_school_reflection_owner_email || '')
                  : (legacyActive ? prev.held_by_email || '' : '')
              ).toLowerCase();

              if (action === 'confirm' && (modernActive || legacyActive)) {
                if (existingOwner === String(body.owner_email || '').toLowerCase()) {
                  return jsonResponse({ ok:true, applied:false, already:true, owner_email:existingOwner });
                }
                return jsonResponse({ ok:false, error:'already_held', owner_email:existingOwner }, 409);
              }
              if (action !== 'confirm') {
                if (!modernActive && !legacyActive) return jsonResponse({ ok:false, error:'not_reflection_hold' }, 409);
                if (existingOwner && existingOwner !== String(body.owner_email || '').toLowerCase() && body.allow_admin_override !== true) {
                  return jsonResponse({ ok:false, error:'not_owned_by_current_user', owner_email:existingOwner }, 403);
                }
              }

              if (action === 'confirm' || action === 'update') {
                const next = {
                  ...prev,
                  after_school_reflection_hold_active:true,
                  after_school_reflection_hold_date:String(body.date || ''),
                  after_school_reflection_owner_email:String(body.owner_email || '').toLowerCase(),
                  after_school_reflection_hold_label:String(body.hold_label || 'Reflection Hold'),
                  after_school_reflection_hold_room:String(body.room || ''),
                  after_school_reflection_hold_reason:String(body.reason || '') || null,
                  after_school_reflection_hold_set_at: action === 'confirm'
                    ? String(body.whenISO || '')
                    : (prev.after_school_reflection_hold_set_at || String(body.whenISO || ''))
                };
                if (legacyActive) {
                  const looksLegacy = String(prev.loc || '').toLowerCase() === 'reflection_hold';
                  if (looksLegacy) {
                    next.zone = prev.held_from_zone || null;
                    next.loc = prev.held_from_loc || null;
                    next.location_label = prev.held_from_label || null;
                  }
                  next.held_by_email = null;
                  next.held_by_role = null;
                  next.held_by_title = null;
                  next.held_by_since = null;
                  next.held_target_zone = null;
                  next.held_target_loc = null;
                  next.held_target_label = null;
                  next.held_from_zone = null;
                  next.held_from_loc = null;
                  next.held_from_label = null;
                }
                stateMap[osis] = next;
                return jsonResponse({ ok:true, applied:true, osis, owner_email:body.owner_email || null });
              }

              const next = {
                ...prev,
                after_school_reflection_hold_active:false,
                after_school_reflection_hold_date:null,
                after_school_reflection_owner_email:null,
                after_school_reflection_hold_label:null,
                after_school_reflection_hold_room:null,
                after_school_reflection_hold_reason:null,
                reflection_hold_cleared_mode:action
              };
              if (legacyActive) {
                const looksLegacy = String(prev.loc || '').toLowerCase() === 'reflection_hold';
                if (looksLegacy) {
                  next.zone = prev.held_from_zone || null;
                  next.loc = prev.held_from_loc || null;
                  next.location_label = prev.held_from_label || null;
                }
                next.held_by_email = null;
                next.held_by_role = null;
                next.held_by_title = null;
                next.held_by_since = null;
                next.held_target_zone = null;
                next.held_target_loc = null;
                next.held_target_label = null;
              }
              stateMap[osis] = next;
              return jsonResponse({ ok:true, applied:true, osis, owner_email:existingOwner || null });
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
  const { env, puts, namesSeen, updates, stateMap } = makeEnv({
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
  assert.equal(updates[0].action, 'confirm');
  assert.equal(updates[0].owner_email, 'teacher@example.org');
  assert.equal(stateMap['2001'].after_school_reflection_hold_active, true);
  assert.equal(stateMap['2001'].after_school_reflection_owner_email, 'teacher@example.org');
  assert.ok(namesSeen.length >= 2);
  assert.ok(namesSeen.every((name) => name === `PRACTICE:${today}:GLOBAL`));
  assert.equal(puts.length, 1);
  assert.match(puts[0].key, new RegExp(`^practice:v1:${today}:audit:`));
  assert.equal(puts[0].value.practice, true);
  assert.equal(puts[0].options.expirationTtl, 36 * 60 * 60);
});

test('Reflection Hold update converts a legacy hold to modern fields without leaving legacy hold controls active', async () => {
  const today = service.getReflectionHoldNYCDate();
  const { env, updates, stateMap } = makeEnv({
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
  assert.equal(updates[0].action, 'update');
  assert.equal(updates[0].room, '405');
  assert.equal(stateMap['3001'].after_school_reflection_hold_active, true);
  assert.equal(stateMap['3001'].after_school_reflection_hold_room, '405');
  assert.equal(stateMap['3001'].zone, null); // legacy cleanup never invents Hallway
  assert.equal(stateMap['3001'].held_by_email, null);
  assert.equal(stateMap['3001'].held_target_loc, null);
});

test('Reflection Hold release preserves ownership and clears modern hold fields', async () => {
  const today = service.getReflectionHoldNYCDate();
  const { env, updates, stateMap } = makeEnv({
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
  assert.equal(updates[0].action, 'release');
  assert.equal(stateMap['4001'].after_school_reflection_hold_active, false);
  assert.equal(stateMap['4001'].reflection_hold_cleared_mode, 'release');
});


test('Reflection Hold options include a modern hold even when physical evidence is from a prior date', async () => {
  const today = service.getReflectionHoldNYCDate();
  const { env } = makeEnv({
    rosterRows: [{ o:'5001', n:'Stale Physical Student', g:'10' }],
    states: {
      '5001': {
        date:'2026-08-31',
        zone:'class',
        loc:'201',
        location_label:'201',
        location_evidence_at:'2026-08-31T14:00:00.000Z',
        after_school_reflection_hold_active:true,
        after_school_reflection_hold_date:today,
        after_school_reflection_owner_email:'teacher@example.org',
        after_school_reflection_hold_label:'Reflection Hold',
        after_school_reflection_hold_room:'405'
      }
    }
  });
  const result = await service.buildReflectionHoldOptions(env, { practice:false, practice_day:today }, {
    email:'teacher@example.org', role:'editor'
  }, today);
  assert.equal(result.ok, true);
  assert.equal(result.my_active_holds.length, 1);
  assert.equal(result.my_active_holds[0].osis, '5001');
  assert.equal(result.my_active_holds[0].current_loc, '201');
});

test('Reflection Hold confirm does not overwrite a hold won concurrently by another owner', async () => {
  const today = service.getReflectionHoldNYCDate();
  const { env, stateMap } = makeEnv({
    rosterRows:[{ o:'6001', n:'Concurrent Student', g:'11' }],
    locations:[{ name:'405', type:'class' }],
    states:{ '6001': { date:today, zone:'hallway', loc:'hallway', location_evidence_at:`${today}T13:00:00.000Z` } }
  });

  // Simulate another owner winning after preview but before confirm.
  stateMap['6001'].after_school_reflection_hold_active = true;
  stateMap['6001'].after_school_reflection_hold_date = today;
  stateMap['6001'].after_school_reflection_owner_email = 'other@example.org';

  const result = await service.confirmReflectionHold(env, { practice:false, practice_day:today }, {
    email:'teacher@example.org', role:'editor'
  }, {
    date:today, room:'405', holdLabel:'Reflection Hold', osisList:['6001']
  });

  assert.equal(result.applied_count, 0);
  assert.equal(result.skipped_count, 1);
  assert.match(String(result.skipped[0].reason || result.skipped[0].error || ''), /already_held/);
  assert.equal(stateMap['6001'].after_school_reflection_owner_email, 'other@example.org');
  assert.equal(stateMap['6001'].zone, 'hallway');
});

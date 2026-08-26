const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
let service;

test.before(async () => {
  service = await import(`${pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/scan-injector.js')).href}?t=${Date.now()}`);
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function makeEnv() {
  const data = new Map([
    ['roster_v1', { rows: [
      { o: '1001', n: 'Alpha Student', g: '9', sx: 'F' },
      { o: '1002', n: 'Beta Student', g: '10', sx: 'M' }
    ] }],
    ['locs_v1', { locations: [
      { name: 'Room 301', type: 'class', mode: 'class' },
      { name: 'Bathroom (First Floor)', type: 'bathroom', mode: 'bathroom' },
      { name: 'Front Entrance (Varied)', type: 'varied', mode: 'varied' }
    ] }]
  ]);
  const puts = [];
  const namesSeen = [];
  const locationUpdates = [];
  return {
    puts,
    namesSeen,
    locationUpdates,
    env: {
      ROSTER: {
        async get(key) { return data.get(key) ?? null; },
        async put(key, value, options) { puts.push({ key, value: JSON.parse(String(value)), options: options || null }); }
      },
      STUDENT_LOC: {
        idFromName(name) { namesSeen.push(name); return name; },
        get() {
          return {
            async fetch(_url, init = {}) {
              if (init?.body) locationUpdates.push(JSON.parse(String(init.body)));
              return json({ ok: true });
            }
          };
        }
      }
    }
  };
}

function fakeBaseWorker(calls) {
  return {
    async fetch(req, _env, ctx) {
      const body = await req.text();
      const p = new URLSearchParams(body);
      calls.push(Object.fromEntries(p.entries()));
      if (p.get('action') === 'lookup') {
        const osis = p.get('code');
        return json({
          found: true,
          osis,
          name: osis === '1001' ? 'Alpha Student' : 'Beta Student',
          sex: osis === '1001' ? 'F' : 'M',
          current_period: '2',
          current_room: '301',
          attendance: 'Present',
          kiosk_mode: 'in_class'
        });
      }
      if (p.get('action') === 'log') {
        ctx.waitUntil(Promise.resolve());
        return json({ ok: true, buffered: true, log_id: `log-${p.get('code')}` });
      }
      return json({ ok: false, error: 'unexpected_action' }, 400);
    }
  };
}

test('Scan Injector options expose current roster and configured locations', async () => {
  const { env } = makeEnv();
  const out = await service.buildScanInjectorOptions(env, { practice: true, practice_day: '2026-08-26' });
  assert.equal(out.ok, true);
  assert.equal(out.practice, true);
  assert.equal(out.date, '2026-08-26');
  assert.equal(out.students.length, 2);
  assert.equal(out.locations.length, 3);
});

test('batch class injection uses simulated clock time and real log pipeline', async () => {
  const { env, puts } = makeEnv();
  const calls = [];
  const result = await service.injectScanIns({
    env,
    modeInfo: { practice: true, practice_day: '2026-08-26' },
    actorEmail: 'admin@school.org',
    body: {
      osisList: ['1001', '1002'],
      location: 'Room 301',
      whenISO: '2026-08-26T12:30:00.000Z', // 08:30 New York
      spacing_seconds: 2
    },
    baseWorker: fakeBaseWorker(calls),
    originalRequest: new Request('https://worker.example/admin/scan_injector/inject', { headers: { origin: 'https://app.example' } })
  });
  assert.equal(result.ok, true);
  assert.equal(result.injected, 2);
  const lookups = calls.filter((row) => row.action === 'lookup');
  const logs = calls.filter((row) => row.action === 'log');
  assert.equal(lookups.length, 2);
  assert.equal(logs.length, 2);
  assert.equal(lookups[0].debug_hhmm, '08:30');
  assert.equal(lookups[0].kiosk_room, '301');
  assert.equal(logs[0].source, 'admin_scan_injector');
  assert.match(logs[0].allowed, /^kiosk_ok_first:/);
  assert.equal(logs[0].period_id, '2');
  assert.equal(logs[1].whenISO, '2026-08-26T12:30:02.000Z');
  const audit = puts.find((row) => row.key.startsWith('practice:v1:2026-08-26:audit:'));
  assert.ok(audit);
  assert.equal(audit.options.expirationTtl, 36 * 60 * 60);
});

test('bathroom injection produces forced gender IN and varied entrance produces non-toggle injected IN', async () => {
  const { env, namesSeen, locationUpdates } = makeEnv();
  const bathCalls = [];
  let result = await service.injectScanIns({
    env,
    modeInfo: { practice: true, practice_day: '2026-08-26' },
    actorEmail: 'admin@school.org',
    body: { osisList: ['1001'], location: 'Bathroom (First Floor)', whenISO: '2026-08-26T14:00:00.000Z' },
    baseWorker: fakeBaseWorker(bathCalls),
    originalRequest: new Request('https://worker.example/admin/scan_injector/inject')
  });
  assert.equal(result.injected, 1);
  assert.equal(bathCalls.find((row) => row.action === 'log').allowed, 'in_F');

  const variedCalls = [];
  result = await service.injectScanIns({
    env,
    modeInfo: { practice: true, practice_day: '2026-08-26' },
    actorEmail: 'admin@school.org',
    body: { osisList: ['1002'], location: 'Front Entrance (Varied)', whenISO: '2026-08-26T14:00:00.000Z' },
    baseWorker: fakeBaseWorker(variedCalls),
    originalRequest: new Request('https://worker.example/admin/scan_injector/inject')
  });
  assert.equal(result.injected, 1);
  assert.equal(variedCalls.find((row) => row.action === 'log').allowed, 'admin_inject_in');
  assert.ok(namesSeen.includes('PRACTICE:2026-08-26:GLOBAL'));
  assert.equal(locationUpdates.at(-1).zone, 'hallway');
  assert.equal(locationUpdates.at(-1).source, 'admin_scan_injector');
});

test('injector refuses timestamps outside the active Practice day', async () => {
  const { env } = makeEnv();
  const calls = [];
  const result = await service.injectScanIns({
    env,
    modeInfo: { practice: true, practice_day: '2026-08-26' },
    actorEmail: 'admin@school.org',
    body: { osisList: ['1001'], location: 'Room 301', whenISO: '2026-08-27T12:00:00.000Z' },
    baseWorker: fakeBaseWorker(calls),
    originalRequest: new Request('https://worker.example/admin/scan_injector/inject')
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'scan_time_must_be_on_active_day');
  assert.equal(calls.length, 0);
});

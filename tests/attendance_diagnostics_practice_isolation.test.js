const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const routeUrl = pathToFileURL(
  path.join(root, 'cf-redcake/red-cake-77d5/src/routes/attendance-diagnostics.js')
).href;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function makeRoster(records) {
  const map = new Map(Object.entries(records));
  const listedPrefixes = [];
  return {
    listedPrefixes,
    async list({ prefix }) {
      listedPrefixes.push(String(prefix || ''));
      return {
        keys: Array.from(map.keys())
          .filter((key) => key.startsWith(String(prefix || '')))
          .map((name) => ({ name })),
        list_complete: true
      };
    },
    async get(key, options) {
      const raw = map.get(String(key)) ?? null;
      if (raw == null) return null;
      if (options?.type === 'json') {
        try { return JSON.parse(raw); } catch { return null; }
      }
      return raw;
    }
  };
}

function practiceTrace(submissionId, extra = {}) {
  return JSON.stringify({
    submissionId,
    route: '/admin/teacher_att/submit',
    date: '2026-08-24',
    room: '405',
    periodLocal: '2',
    actorEmail: 'teacher@school.org',
    persistedAtISO: '2026-08-24T14:00:00.000Z',
    events: [{ level: 'warn', osis: '123456789', ts: '2026-08-24T14:00:00.000Z' }],
    ...extra
  });
}

function adminRequest(url) {
  return new Request(url, { headers: { 'x-admin-token': 'test-admin-token' } });
}

async function loadRoute() {
  return import(`${routeUrl}?practice-isolation=${Date.now()}-${Math.random()}`);
}

test('Practice Attendance Diagnostics returns only Practice-prefixed traces', async () => {
  const { handleAttendanceDiagnosticsRequest } = await loadRoute();
  const practiceKey = 'practice:v1:2026-08-24:TA_TRACE:2026-08-24:practice-sub';
  const liveKey = 'TA_TRACE:2026-08-24:live-sub';
  const roster = makeRoster({
    [practiceKey]: practiceTrace('practice-sub'),
    [liveKey]: practiceTrace('live-sub')
  });

  let legacyTraceCalls = 0;
  const baseWorker = {
    async fetch(req) {
      const pathname = new URL(req.url).pathname;
      if (pathname === '/system/mode') return json({ ok: true, mode: 'practice', practice: true, practice_day: '2026-08-24' });
      if (pathname === '/admin/teacher_att_trace_lookup') legacyTraceCalls++;
      return json({ ok: false, error: 'unexpected_legacy_call' }, 500);
    }
  };

  const req = adminRequest('https://worker.example/admin/teacher_att_trace_lookup?date=2026-08-24&limit=25');
  const response = await handleAttendanceDiagnosticsRequest(req, { ROSTER: roster, ADMIN_TOKEN: 'test-admin-token' }, {}, baseWorker);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.practice, true);
  assert.equal(data.history_scope, 'practice_only');
  assert.equal(data.count, 1);
  assert.equal(data.results[0].submissionId, 'practice-sub');
  assert.equal(data.results.some((row) => row.submissionId === 'live-sub'), false);
  assert.equal(legacyTraceCalls, 0);
  assert.deepEqual(roster.listedPrefixes, ['practice:v1:2026-08-24:TA_TRACE:2026-08-24:']);
});

test('Live Attendance Diagnostics remains delegated to the legacy implementation', async () => {
  const { handleAttendanceDiagnosticsRequest } = await loadRoute();
  let traceCalls = 0;
  const baseWorker = {
    async fetch(req) {
      const pathname = new URL(req.url).pathname;
      if (pathname === '/system/mode') return json({ ok: true, mode: 'live', practice: false });
      if (pathname === '/admin/teacher_att_trace_lookup') {
        traceCalls++;
        return json({ ok: true, source: 'legacy-live', results: [{ submissionId: 'live-sub' }] });
      }
      return json({ ok: false }, 404);
    }
  };

  const req = new Request('https://worker.example/admin/teacher_att_trace_lookup?date=2026-08-24');
  const response = await handleAttendanceDiagnosticsRequest(req, { ROSTER: makeRoster({}) }, {}, baseWorker);
  const data = await response.json();

  assert.equal(traceCalls, 1);
  assert.equal(data.source, 'legacy-live');
  assert.equal(data.results[0].submissionId, 'live-sub');
});

test('Attendance Diagnostics fails closed to Practice isolation when mode lookup fails', async () => {
  const { handleAttendanceDiagnosticsRequest } = await loadRoute();
  const practiceKey = 'practice:v1:2026-08-24:TA_TRACE:2026-08-24:practice-sub';
  const roster = makeRoster({ [practiceKey]: practiceTrace('practice-sub') });

  const baseWorker = {
    async fetch(req) {
      const pathname = new URL(req.url).pathname;
      if (pathname === '/system/mode') throw new Error('mode unavailable');
      throw new Error('legacy trace reader must not be reached while mode is unknown');
    }
  };

  const req = adminRequest('https://worker.example/admin/teacher_att_trace_lookup?date=2026-08-24');
  const response = await handleAttendanceDiagnosticsRequest(req, { ROSTER: roster, ADMIN_TOKEN: 'test-admin-token' }, {}, baseWorker);
  const data = await response.json();

  assert.equal(data.practice, true);
  assert.equal(data.count, 1);
  assert.equal(data.results[0].submissionId, 'practice-sub');
});

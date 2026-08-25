const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const serviceUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/student-scans.js')).href;

class FakeKV {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [
      String(key),
      typeof value === 'string' ? value : JSON.stringify(value)
    ]));
  }
  async get(key, options) {
    const raw = this.map.get(String(key));
    if (raw == null) return null;
    if (options?.type === 'json' || options === 'json') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  }
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    if (cursor) return { keys: [], list_complete: true };
    const keys = [...this.map.keys()]
      .filter((key) => key.startsWith(String(prefix)))
      .sort()
      .slice(0, limit)
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

function fakeLogBuffer(rows = []) {
  return {
    seenNames: [],
    idFromName(name) {
      this.seenNames.push(String(name));
      return String(name);
    },
    get() {
      return {
        async fetch(url) {
          const u = new URL(url);
          const osis = u.searchParams.get('osis');
          return new Response(JSON.stringify({
            ok: true,
            rows: rows.filter((row) => String(row.osis) === String(osis))
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
      };
    }
  };
}

async function service() {
  return import(`${serviceUrl}?v=${Date.now()}-${Math.random()}`);
}

test('Student Scans live query preserves GAS rows and appends live scan corrections', async () => {
  const mod = await service();
  const originalFetch = global.fetch;
  let posted = null;
  global.fetch = async (_url, init = {}) => {
    posted = new URLSearchParams(String(init.body || ''));
    return new Response(JSON.stringify({
      ok: true,
      rows: [{ osis: '123', whenISO: '2026-08-25T13:00:00.000Z', location: '306' }],
      truncated: false
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const env = {
      GAS_URL: 'https://gas.example/exec',
      GAS_SHARED_SECRET: 'secret',
      ROSTER: new FakeKV({
        'scan:correction_v1:123:2026-08-25T13:05:00.000Z': {
          date: '2026-08-25', osis: '123', whenISO: '2026-08-25T13:05:00.000Z', type: 'manual_scan_out'
        }
      })
    };
    const result = await mod.queryStudentScans(env, { practice: false, practice_day: '2026-08-25' }, {
      osis: '123', start: '2026-08-25', end: '2026-08-25', max: '5000'
    });
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 1);
    assert.equal(result.corrections.length, 1);
    assert.equal(posted.get('action'), 'scans_query');
    assert.equal(posted.get('osis'), '123');
    assert.equal(posted.get('max'), '5000');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Student Scans Practice query merges Practice KV and LogBuffer without calling GAS', async () => {
  const mod = await service();
  const originalFetch = global.fetch;
  let externalFetches = 0;
  global.fetch = async () => {
    externalFetches += 1;
    throw new Error('Practice query must not call GAS');
  };

  try {
    const logBuffer = fakeLogBuffer([
      { logId: 'dup', osis: '123', whenISO: '2026-08-25T12:00:00.000Z', location: 'hall', scheduleDate: '2026-08-25', source: 'buffer' },
      { logId: 'buffer-only', osis: '123', whenISO: '2026-08-25T12:10:00.000Z', location: 'bathroom', scheduleDate: '2026-08-25' }
    ]);
    const env = {
      ROSTER: new FakeKV({
        'practice:v1:2026-08-25:practice_record:scan:123:dup': {
          id: 'dup', logId: 'dup', osis: '123', whenISO: '2026-08-25T12:00:00.000Z', location: 'hall', scheduleDate: '2026-08-25', source: 'stored', created_at_iso: '2026-08-25T12:00:01.000Z'
        },
        'practice:v1:2026-08-25:practice_record:scan:123:stored-only': {
          id: 'stored-only', osis: '123', whenISO: '2026-08-25T12:20:00.000Z', location: '306', scheduleDate: '2026-08-25', created_at_iso: '2026-08-25T12:20:01.000Z'
        },
        'practice:v1:2026-08-25:scan:correction_v1:123:2026-08-25T12:15:00.000Z': {
          date: '2026-08-25', osis: '123', whenISO: '2026-08-25T12:15:00.000Z', type: 'manual_scan_out'
        }
      }),
      LOG_BUFFER: logBuffer
    };
    const result = await mod.queryStudentScans(env, { practice: true, practice_day: '2026-08-25' }, {
      osis: '123', start: '2026-08-25', end: '2026-08-25', max: '5000'
    });

    assert.equal(result.ok, true);
    assert.equal(result.practice, true);
    assert.equal(result.persisted_externally, false);
    assert.equal(result.history_scope, 'practice_today_only');
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows.find((row) => row.logId === 'dup').source, 'stored');
    assert.equal(result.corrections.length, 1);
    assert.deepEqual(logBuffer.seenNames, ['PRACTICE:2026-08-25:LOG:2026-08-25']);
    assert.equal(externalFetches, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Student Scans Practice query rejects invalid inputs before reading history', async () => {
  const mod = await service();
  const env = { ROSTER: new FakeKV({}) };
  let result = await mod.queryStudentScans(env, { practice: true, practice_day: '2026-08-25' }, {
    osis: 'abc', start: '2026-08-25', end: '2026-08-25'
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.error, 'bad_osis');

  result = await mod.queryStudentScans(env, { practice: true, practice_day: '2026-08-25' }, {
    osis: '123', start: '08/25/2026', end: '2026-08-25'
  });
  assert.equal(result.error, 'bad_start');
});

test('Student Scans roster keeps using the reference-data GAS roster read', async () => {
  const mod = await service();
  const originalFetch = global.fetch;
  let action = '';
  global.fetch = async (_url, init = {}) => {
    action = new URLSearchParams(String(init.body || '')).get('action') || '';
    return new Response(JSON.stringify({ ok: true, roster: [{ o: '123', n: 'Student One' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  try {
    const result = await mod.loadStudentScansRoster({ GAS_URL: 'https://gas.example/exec', GAS_SHARED_SECRET: 'secret' });
    assert.equal(result.ok, true);
    assert.equal(action, 'roster');
    assert.deepEqual(result.roster, [{ o: '123', n: 'Student One' }]);
  } finally {
    global.fetch = originalFetch;
  }
});

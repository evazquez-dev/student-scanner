const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
let service;

test.before(async () => {
  const servicePath = path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/roster-search.js');
  service = await import(`${pathToFileURL(servicePath).href}?roster_search=${Date.now()}`);
});

test('roster search preserves legacy scoring, fields, sorting, and 25-result cap', () => {
  const rows = [
    { o: '1002', n: 'Beta Student', e: 'beta@school.org', l: 'B2', lu: 'LCH2' },
    { o: '1001', n: 'Alpha Student', e: 'alpha@school.org', l: 'A1', lu: 'LCH1' },
    { o: '2001', n: 'Student Alpha', e: 'other@school.org', l: '', lu: '' }
  ];
  const byName = service.searchRosterRows(rows, 'alpha');
  assert.deepEqual(byName.map((r) => r.osis), ['1001', '2001']);
  assert.deepEqual(byName[0], {
    osis: '1001', name: 'Alpha Student', email: 'alpha@school.org', locker: 'A1', lunch: 'LCH1', score: 260
  });

  const byOsis = service.searchRosterRows(rows, '100');
  assert.deepEqual(byOsis.map((r) => r.osis), ['1001', '1002']);
  assert.deepEqual(service.searchRosterRows(rows, 'a'), []);
});

test('roster search reads roster_v1 from KV and returns ordinary student records only', async () => {
  const env = {
    ROSTER: {
      async get(key, options) {
        assert.equal(key, 'roster_v1');
        if (options?.type === 'json') return { rows: [{ o: '314159265', n: 'Teacher Searchable', e: 'student@school.org', l: '12', lu: 'LCH1' }] };
        return null;
      }
    }
  };
  const results = await service.searchRoster(env, 'Teacher');
  assert.equal(results.length, 1);
  assert.equal(results[0].osis, '314159265');
});

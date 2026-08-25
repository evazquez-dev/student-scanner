const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const frontend = read('student-scanner/admin/after_school_monitor.js');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/after-school-monitor.js');

test('After-School Monitor frontend still uses the same endpoint', () => {
  assert.match(frontend, /adminFetch\('\/admin\/after_school_monitor'/);
});

test('After-School Monitor modular route owns only its read endpoint', () => {
  assert.match(route, /'\/admin\/after_school_monitor'/);
  assert.doesNotMatch(route, /reflection_hold/);
  assert.doesNotMatch(route, /after_school\/toggle/);
  assert.match(index, /AFTER_SCHOOL_MONITOR_PATHS/);
});

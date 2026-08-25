const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const frontend = read('student-scanner/admin/hallway.js');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/hallway-monitor.js');

test('Hallway Monitor frontend still uses the same snapshot endpoint', () => {
  assert.match(frontend, /const SNAPSHOT_PATH = '\/admin\/hallway_state_monitor'/);
  assert.match(frontend, /const BATHROOM_CLEAR_PATH = '\/admin\/bathroom\/clear'/);
});

test('Hallway Monitor modular route owns only the read snapshot', () => {
  assert.match(route, /'\/admin\/hallway_state_monitor'/);
  assert.doesNotMatch(route, /'\/admin\/hallway_state'/);
  assert.doesNotMatch(route, /'\/admin\/bathroom\/clear'/);
  assert.match(index, /HALLWAY_MONITOR_PATHS/);
});

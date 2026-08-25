const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/hallway-monitor.js');
const service = read('cf-redcake/red-cake-77d5/src/services/hallway-monitor.js');
const legacy = read('cf-redcake/red-cake-77d5/src/worker.js');

const interceptPos = index.indexOf('if (HALLWAY_MONITOR_PATHS.has(path)');
const fallbackPos = index.indexOf('return baseWorker.fetch(req, env, ctx);');

test('SAFETY: Hallway Monitor snapshot is intercepted before legacy fallback', () => {
  assert.ok(interceptPos >= 0, 'Hallway Monitor intercept missing');
  assert.ok(fallbackPos > interceptPos, 'Hallway Monitor must run before legacy fallback');
  assert.match(index, /handleHallwayMonitorRequest/);
});

test('SAFETY: Hallway Monitor modular route preserves hallway authorization', () => {
  assert.match(route, /base\.data\?\.can\?\.hallway/);
  assert.match(route, /hallway_monitor_forbidden/);
  assert.match(route, /req\.method !== 'GET'/);
});

test('SAFETY: Hallway Monitor snapshot remains Practice-aware', () => {
  assert.match(service, /loadStudentViewModeInfo/);
  assert.match(service, /studentViewOperationalDoName\(modeInfo, 'GLOBAL'\)/);
  assert.match(service, /https:\/\/student-loc\/all/);
});

test('SAFETY: Hallway Monitor extraction is read-only and leaves bathroom clear on legacy path', () => {
  assert.doesNotMatch(route, /bathroom\/clear/);
  assert.doesNotMatch(service, /student-loc\/update/);
  assert.match(legacy, /path === "\/admin\/bathroom\/clear"/);
  assert.match(legacy, /clearBathroomFromHallwayMonitor_/);
});

test('SAFETY: legacy Hallway Monitor snapshot remains physically present for rollback', () => {
  assert.match(legacy, /path === "\/admin\/hallway_state" \|\| path === "\/admin\/hallway_state_monitor"/);
});

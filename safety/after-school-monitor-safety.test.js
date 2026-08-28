const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/after-school-monitor.js');
const service = read('cf-redcake/red-cake-77d5/src/services/after-school-monitor.js');
const legacy = read('cf-redcake/red-cake-77d5/src/worker.js');

const interceptPos = index.indexOf('if (AFTER_SCHOOL_MONITOR_PATHS.has(path)');
const fallbackPos = index.indexOf('return baseWorker.fetch(req, env, ctx);');

test('SAFETY: After-School Monitor is intercepted before legacy fallback', () => {
  assert.ok(interceptPos >= 0, 'After-School Monitor intercept missing');
  assert.ok(fallbackPos > interceptPos, 'After-School Monitor must run before legacy fallback');
  assert.match(index, /handleAfterSchoolMonitorRequest/);
});

test('SAFETY: After-School Monitor preserves hallway-monitor authorization', () => {
  assert.match(route, /base\.data\?\.can\?\.after_school_monitor/);
  assert.match(route, /hallway_monitor_forbidden/);
  assert.match(route, /req\.method !== 'GET'/);
});

test('SAFETY: After-School Monitor remains Practice-aware', () => {
  assert.match(service, /loadStudentViewModeInfo/);
  assert.match(service, /studentViewOperationalDoName\(modeInfo, 'GLOBAL'\)/);
  assert.match(service, /https:\/\/student-loc\/all/);
});

test('SAFETY: After-School Monitor extraction stays read-only', () => {
  assert.doesNotMatch(route, /POST/);
  assert.doesNotMatch(service, /student-loc\/update/);
  assert.doesNotMatch(service, /ROSTER\.put/);
});

test('SAFETY: legacy After-School Monitor route stays removed after modular cleanup', () => {
  assert.doesNotMatch(legacy, /path === "\/admin\/after_school_monitor"/);
});

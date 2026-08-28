const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/supervised-lunch.js');
const service = read('cf-redcake/red-cake-77d5/src/services/supervised-lunch.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const ui = read('student-scanner/admin/supervised_lunch.js');

test('Supervised Lunch routes are owned by the modular handler before legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/supervised-lunch\.js'/);
  const guardPos = index.indexOf('SUPERVISED_LUNCH_PATHS.has(path)');
  const fallbackPos = index.lastIndexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(guardPos >= 0, 'Supervised Lunch route guard must exist');
  assert.ok(fallbackPos > guardPos, 'Supervised Lunch must run before legacy fallback');
  assert.match(index, /handleSupervisedLunchRequest/);
});

test('Supervised Lunch frontend endpoint and payload contracts remain unchanged', () => {
  for (const pathname of ['/admin/supervised_lunch/options', '/admin/supervised_lunch/save']) {
    assert.ok(route.includes(pathname), `${pathname} must remain modular`);
    assert.ok(ui.includes(pathname), `${pathname} must remain in frontend`);
    assert.ok(!worker.includes(`if (path === "${pathname}")`), `${pathname} legacy route block should stay removed`);
  }
  assert.match(ui, /JSON\.stringify\(\{ date: state\.today, periodLocal, room, osisList \}\)/);
});

test('Supervised Lunch service preserves existing KV and lunch schedule contracts', () => {
  assert.match(service, /SUPERVISED_LUNCH_KEY_PREFIX = 'supervised_lunch_v1:'/);
  assert.match(service, /SUPERVISED_LUNCH_LAST_SET_KEY_PREFIX = 'supervised_lunch_last_set_v1:'/);
  assert.match(service, /new Set\(\['LCH1', 'LCH2'\]\)/);
  assert.match(service, /ROSTER_KEY = 'roster_v1'/);
  assert.match(service, /CLASSES_KEY = 'student_classes_v1'/);
  assert.match(service, /ATT_CFG_KEY = 'att_cfg_v1'/);
  assert.match(service, /LOC_KEY = 'locs_v1'/);
  assert.match(service, /lunch_dual/);
  assert.match(service, /invalid_students_for_lunch_period/);
});

test('Supervised Lunch extraction does not import the legacy monolith directly', () => {
  assert.doesNotMatch(route, /from\s+['"]\.\.\/worker\.js['"]/);
  assert.doesNotMatch(service, /from\s+['"]\.\.\/worker\.js['"]/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/student-view.js');
const service = read('cf-redcake/red-cake-77d5/src/services/student-view.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const frontend = read('student-scanner/admin/student_view.js');

test('SAFETY: Student View dashboard is intercepted before legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/student-view\.js'/);
  const routePos = index.indexOf('STUDENT_VIEW_PATHS.has(path)');
  const fallbackPos = index.lastIndexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(routePos >= 0, 'Student View modular interception missing');
  assert.ok(fallbackPos > routePos, 'Student View handler must run before legacy fallback');
});

test('SAFETY: Student View extraction owns only the dashboard GET endpoint', () => {
  assert.match(route, /'\/admin\/student\/dashboard'/);
  assert.doesNotMatch(route, /'\/admin\/roster\/search'/);
  assert.match(route, /req\.method !== 'GET'/);
  assert.doesNotMatch(route, /method:\s*'POST'/);
});

test('SAFETY: Student View does not write live operational state', () => {
  assert.doesNotMatch(service, /fetch\([^\n]*\{\s*method:\s*['"]POST['"]/);
  assert.doesNotMatch(service, /ATTENDANCE_DO[^\n]*put/);
  assert.doesNotMatch(service, /STUDENT_LOC[^\n]*put/);
  assert.doesNotMatch(service, /CLASS_SESSION_DO[^\n]*put/);
  assert.match(service, /do_registry:/, 'Practice DO registry parity should remain');
  assert.match(service, /expirationTtl:\s*PRACTICE_KV_TTL_SEC/);
});

test('SAFETY: Practice Student View reads use Practice Durable Object names', () => {
  assert.match(service, /`PRACTICE:\$\{d\}:\$\{base\}`/);
  assert.match(service, /studentViewOperationalDoName\(modeInfo, 'GLOBAL'\)/);
  assert.match(service, /studentViewOperationalDoName\(modeInfo, `att:\$\{date\}`/);
  assert.match(service, /studentViewOperationalDoName\(modeInfo, liveName, date\)/);
});

test('SAFETY: legacy Student View dashboard route stays removed after modular cleanup', () => {
  assert.doesNotMatch(worker, /path === "\/admin\/student\/dashboard"/);
  assert.match(frontend, /\/admin\/student\/dashboard\?osis=/);
  assert.match(frontend, /\/admin\/roster\/search\?q=/);
});

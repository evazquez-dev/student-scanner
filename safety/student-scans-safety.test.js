const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/student-scans.js');
const service = read('cf-redcake/red-cake-77d5/src/services/student-scans.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const frontend = read('student-scanner/admin/student_scans.js');

test('SAFETY: Student Scans routes are intercepted before the legacy fallback', () => {
  assert.match(index, /from '\.\/routes\/student-scans\.js'/);
  const routePos = index.indexOf('STUDENT_SCANS_PATHS.has(path)');
  const fallbackPos = index.lastIndexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(routePos >= 0, 'Student Scans modular interception missing');
  assert.ok(fallbackPos > routePos, 'Student Scans handler must run before legacy fallback');
});

test('SAFETY: Student Scan Report extraction is read-only and limited to its two GET endpoints', () => {
  assert.match(route, /'\/admin\/roster_students'/);
  assert.match(route, /'\/admin\/scans_query'/);
  assert.match(route, /req\.method !== 'GET'/);
  assert.doesNotMatch(service, /ROSTER\.put\(/);
  assert.doesNotMatch(service, /ROSTER\.delete\(/);
});

test('SAFETY: Practice scan history stays in Practice KV and Practice LogBuffer namespaces', () => {
  assert.match(service, /practice:v1:/);
  assert.match(service, /practice_record:\$\{cat\}/);
  assert.match(service, /PRACTICE:\$\{d\}:\$\{base\}/);
  assert.match(service, /history_scope: 'practice_today_only'/);
  assert.match(service, /persisted_externally: false/);
});

test('SAFETY: Live GAS scan query is selected only outside Practice Mode', () => {
  assert.match(service, /return modeInfo\?\.practice\s*\?\s*queryPracticeScans/);
  assert.match(service, /:\s*queryLiveScans/);
  assert.match(service, /action: 'scans_query'/);
});

test('SAFETY: Legacy Student Scans route blocks stay removed after modular cleanup', () => {
  assert.doesNotMatch(worker, /path === "\/admin\/roster_students"/);
  assert.doesNotMatch(worker, /path === "\/admin\/scans_query"/);
  assert.match(frontend, /\/admin\/roster_students/);
  assert.match(frontend, /\/admin\/scans_query/);
});

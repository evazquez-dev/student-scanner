const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const worker = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const wrangler = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/wrangler.jsonc'), 'utf8');

test('proven zero-caller Worker helpers remain removed', () => {
  for (const name of [
    'htmlEscape_',
    'isValidAttendanceCodeLetter_',
    'studentHasScheduleMapEntry_',
    'staffPullCoversFullPeriod_'
  ]) {
    assert.doesNotMatch(worker, new RegExp(`\\b${name}\\b`), `${name} should remain removed`);
  }
});

test('unused social-worker allowlist config is removed without deleting live staff-pull implementation', () => {
  assert.doesNotMatch(wrangler, /SOCIAL_WORKER_ALLOWLIST/);
  assert.match(worker, /staffPullPeriodEvidence_/);
  assert.match(worker, /STAFF_PULL_LOC_DEFAULT\s*=\s*"social_worker"/);
});

test('student session helper stays because student routes still call it', () => {
  assert.match(worker, /async function requireStudent_/);
  const calls = worker.match(/await requireStudent_\(req, env\)/g) || [];
  assert.ok(calls.length >= 2, 'requireStudent_ should remain wired to student routes');
});

test('uncertain Fidelity and bell-override candidates stay intact for separate review', () => {
  assert.match(worker, /function fetchFidelityDashboardFromGas_/);
  assert.match(worker, /function postFidelityScoreSnapshotToGas_/);
  assert.match(worker, /function buildFidelityTeacherRoomPeriodFidelity_/);
  assert.match(worker, /function mergeBellSchedulesById/);
});

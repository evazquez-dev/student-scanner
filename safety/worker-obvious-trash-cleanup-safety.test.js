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

test('proven zero-caller Fidelity, bell, push, and scan-correction helpers stay removed', () => {
  for (const name of [
    'fetchFidelityDashboardFromGas_',
    'postFidelityScoreSnapshotToGas_',
    'buildFidelityTeacherRoomPeriodFidelity_',
    'mergeBellSchedulesById',
    'sendPushCategoryToEmails_',
    'listScanCorrections_',
    'sendPushToEmails_',
    'fidelityDashboardRoomPeriodKey_',
    'fidelityDashboardRoundPct_',
    'fidelityDashboardExpectedStudents_',
    'fidelityDashboardAttendanceByPeriod_',
    'fidelityDashboardAttendanceIsPresentLate_',
    'fidelityDashboardHasRealClassScan_',
    'fidelityDashboardPullOverlaps_'
  ]) {
    assert.equal(worker.includes(name), false, `${name} returned to worker.js`);
  }
  // Active Fidelity ingestion/scoring and attendance bell resolution remain.
  assert.match(worker, /function captureFidelityEvents_/);
  assert.match(worker, /function fetchFidelityRangeDashboardFromGas_/);
  assert.match(worker, /function effectiveBellScheduleForDateISO/);
});

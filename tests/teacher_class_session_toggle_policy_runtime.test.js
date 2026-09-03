const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const workerUrl = pathToFileURL(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js')).href;

async function loadWorkerFresh(){
  return import(workerUrl + `?teacher_toggle_policy=${Date.now()}_${Math.random()}`);
}

test('active and arrival periods allow ordinary teacher Out/In toggles', async () => {
  const { teacherClassSessionTogglePolicy_ } = await loadWorkerFresh();
  for (const phase of ['active', 'arrival']) {
    const policy = teacherClassSessionTogglePolicy_({ phase, nowMin: 500, endMin: 520, rec: null });
    assert.equal(policy.allowed, true);
    assert.equal(policy.historicalCloseout, false);
  }
});

test('past period permits only an IN closeout for a student with first-IN who is explicitly OUT within 10 minutes', async () => {
  const { teacherClassSessionTogglePolicy_ } = await loadWorkerFresh();
  const policy = teacherClassSessionTogglePolicy_({
    phase: 'past',
    nowMin: 523,
    endMin: 520,
    rec: { firstInISO: '2026-09-03T13:20:00.000Z', out: { isOut: true, outSinceISO: '2026-09-03T13:30:00.000Z' } }
  });
  assert.equal(policy.allowed, true);
  assert.equal(policy.historicalCloseout, true);
  assert.equal(policy.reason, 'post_bell_in_closeout');
  assert.equal(policy.closeoutGraceMin, 10);
});

test('past-period closeout is rejected after the 10-minute grace expires', async () => {
  const { teacherClassSessionTogglePolicy_ } = await loadWorkerFresh();
  const policy = teacherClassSessionTogglePolicy_({
    phase: 'past',
    nowMin: 531,
    endMin: 520,
    rec: { firstInISO: '2026-09-03T13:20:00.000Z', out: { isOut: true } }
  });
  assert.equal(policy.allowed, false);
  assert.equal(policy.reason, 'closeout_grace_expired');
});

test('past-period closeout cannot create a new OUT when the student is already IN', async () => {
  const { teacherClassSessionTogglePolicy_ } = await loadWorkerFresh();
  const policy = teacherClassSessionTogglePolicy_({
    phase: 'past',
    nowMin: 525,
    endMin: 520,
    rec: { firstInISO: '2026-09-03T13:20:00.000Z', out: { isOut: false } }
  });
  assert.equal(policy.allowed, false);
  assert.equal(policy.historicalCloseout, false);
  assert.equal(policy.reason, 'not_currently_out');
});

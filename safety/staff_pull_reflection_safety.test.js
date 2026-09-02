const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const worker = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const reflection = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/reflection-hold.js'), 'utf8');

test('SAFETY: Staff Pull cannot overwrite a different staff owner', () => {
  assert.match(worker, /error: existingIsReflection \? "different_hold_active" : "already_held"/);
  assert.match(worker, /error: "not_holder"/);
  assert.match(worker, /allow_admin_override/);
});

test('SAFETY: Staff Pull and Reflection Hold do not manufacture physical location evidence', () => {
  const staff = worker.slice(worker.indexOf('if (path === "/staff_pull")'), worker.indexOf('if (path === "/reflection_hold")'));
  const reflect = worker.slice(worker.indexOf('if (path === "/reflection_hold")'), worker.indexOf('if (path === "/update")'));
  assert.doesNotMatch(staff, /location_evidence_at:\s*whenISO/);
  assert.doesNotMatch(reflect, /location_evidence_at:\s*whenISO/);
  assert.match(staff, /held_date: date/);
});

test('SAFETY: passing-time Staff Pull cannot mark the upcoming class OUT before the bell', () => {
  const block = worker.slice(worker.indexOf('if (path === "/staff_pull_event"'), worker.indexOf('if (path === "/physical_evidence"'));
  assert.match(block, /phase !== "transition"/);
  assert.match(block, /clippedStartISO/);
});

test('SAFETY: release grace expires and cannot erase a tardy that predates Staff Pull', () => {
  assert.match(worker, /atMs > untilMs/);
  assert.match(worker, /late_predates_staff_pull/);
  assert.match(worker, /lateEvidenceMs < pullStartMs - 2e3/);
});

test('SAFETY: Reflection Hold state failures cannot be reported as successful mutations', () => {
  assert.match(reflection, /if \(!response\.ok \|\| !data\?\.ok\)/);
  assert.match(reflection, /reflection_hold_do_http_/);
  assert.doesNotMatch(reflection, /student-loc\/update/);
});

test('SAFETY: end-of-day reset cannot synthesize Off Campus through an active exit obligation', () => {
  const reset = worker.slice(worker.indexOf('async function maybeAfterSchoolOffCampusReset'), worker.indexOf('__name(maybeAfterSchoolOffCampusReset'));
  assert.match(reset, /afterSchoolExitHoldFor_/);
  assert.match(reset, /held_by_email/);
});

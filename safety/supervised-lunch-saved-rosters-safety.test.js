const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const service = read('cf-redcake/red-cake-77d5/src/services/supervised-lunch-saved-rosters.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/supervised-lunch.js');
const frontend = read('student-scanner/admin/supervised_lunch_saved_rosters.js');

test('SAFETY: named lunch roster definitions are persistent per-user configuration, not Practice operational state', () => {
  assert.match(service, /supervised_lunch:saved_rosters:v1:/);
  assert.match(service, /encodeURIComponent/);
  assert.doesNotMatch(service, /expirationTtl/);
  assert.doesNotMatch(service, /practice:v1:/);
});

test('SAFETY: loading a named lunch roster uses current-mode StudentLocation and filters off-campus/no-show students', () => {
  assert.match(service, /studentViewOperationalDoName\(modeInfo, 'GLOBAL'\)/);
  assert.match(service, /not_present_today/);
  assert.match(service, /left_early/);
  assert.match(service, /off_campus/);
  assert.match(service, /early_dismissal/);
  assert.match(service, /not_lunch_eligible/);
});

test('SAFETY: named roster save is based on an already-applied supervised lunch assignment', () => {
  assert.match(service, /loadSupervisedLunchAssignments/);
  assert.match(service, /apply_assignment_before_saving_roster/);
  assert.doesNotMatch(frontend, /body:\s*JSON\.stringify\(\{\s*action: 'save',[^}]*osisList/s);
});

test('SAFETY: saved lunch roster mutations retain origin and View-As read-only protections', () => {
  assert.match(route, /\/admin\/supervised_lunch\/saved_rosters/);
  assert.match(route, /mutationGuard\(req, env, base\.response, base\.data\)/);
  assert.match(route, /action === 'delete'/);
});

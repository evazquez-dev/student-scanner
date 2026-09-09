const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const route = read('cf-redcake/red-cake-77d5/src/routes/communications-dashboard.js');
const service = read('cf-redcake/red-cake-77d5/src/services/communications-dashboard.js');
const gas = read('Google Apps Script/clasp-projects/behavioral-endpoint/Code.js');

test('SAFETY: grade and department authority come from effective staff_profile, not arbitrary request params', () => {
  assert.doesNotMatch(route, /searchParams\.get\(['"]grade['"]\)/);
  assert.doesNotMatch(route, /searchParams\.get\(['"]department['"]\)/);
  assert.match(service, /profile\?\.grade_team/);
  assert.match(service, /profile\?\.department/);
  assert.match(service, /allowed\.has\(scopeKey\)/);
});

test('SAFETY: follow-up resolution is origin protected, View-As read-only, and owner/admin constrained', () => {
  assert.match(route, /mutationOriginAllowed\(req, env\)/);
  assert.match(route, /viewAsReadOnlyResponse\(accessResponse, access\)/);
  assert.match(route, /owner !== viewer/);
  assert.match(gas, /owner !== viewerEmail/);
  assert.match(gas, /isBehaviorAdminRole_\(viewerRole\)/);
});

test('SAFETY: Practice Mode dashboard reads practice communication records instead of live GAS history', () => {
  assert.match(route, /loadPracticeCommunicationRows/);
  assert.match(route, /if \(mode\.practice\)/);
  assert.match(route, /persisted_externally: false/);
});

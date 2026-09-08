const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const gas = fs.readFileSync(path.join(root, 'Google Apps Script/clasp-projects/student-scanner-gas/Code.js'), 'utf8');
const roster = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/services/academic-roster.js'), 'utf8');
const access = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/services/admin-session.js'), 'utf8');
const legacyWorker = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');

test('All HS Staff academic-roster pull includes scoped GTL/DC leadership metadata', () => {
  assert.match(gas, /ACADEMIC_STAFF_SHEET:\s*'All HS Staff'/);
  assert.match(gas, /ACADEMIC_STAFF_LEADERSHIP_HEADER:\s*'SLT'/);
  assert.match(gas, /academicLeadershipRoles_/);
  assert.match(gas, /department:/);
  assert.match(gas, /grade_team:/);
  assert.match(gas, /leadership_roles:/);
});

test('compiled staff mapping and admin access preserve scoped leadership roles without changing auth role', () => {
  assert.match(roster, /is_grade_team_lead/);
  assert.match(roster, /is_district_chair/);
  assert.match(legacyWorker, /leadership_roles/);
  assert.match(legacyWorker, /is_grade_team_lead/);
  assert.match(legacyWorker, /is_district_chair/);
  assert.match(access, /staff_profile:/);
  assert.match(access, /leadership_roles/);
  assert.match(access, /is_grade_team_lead/);
  assert.match(access, /is_district_chair/);
});

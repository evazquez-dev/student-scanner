const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(__dirname, '..', '..');
const frontend = path.join(project, 'student-scanner');
const route = fs.readFileSync(path.join(project, 'cf-redcake', 'red-cake-77d5', 'src', 'routes', 'incidents.js'), 'utf8');
const js = fs.readFileSync(path.join(frontend, 'admin', 'incident_creator.js'), 'utf8');
const html = fs.readFileSync(path.join(frontend, 'admin', 'incident_creator.html'), 'utf8');

test('incident witness directory mixes students and staff without changing student validation', () => {
  assert.match(route, /\/admin\/incident\/witness_search/);
  assert.match(route, /searchRoster\(env,\s*qRaw\)/);
  assert.match(route, /loadAcademicRoster\(env\)/);
  assert.match(route, /staff_mapping_by_email/);
  assert.match(route, /kind:\s*'student'/);
  assert.match(route, /kind:\s*'staff'/);
  assert.match(route, /normalizeIncidentStudentList/, 'student witness validation must remain intact');
});

test('incident witness UI supports staff suggestions and unlisted names', () => {
  assert.match(html, /Search students or staff by name, OSIS, or email/);
  assert.match(html, /Other \/ unlisted witnesses/);
  assert.match(js, /STAFF_WITNESSES/);
  assert.match(js, /FREE_WITNESSES/);
  assert.match(js, /\/admin\/incident\/witness_search/);
  assert.match(js, /Add “\$\{clean\}” as another witness/);
  assert.match(js, /combinedOtherWitnessesText/);
  assert.match(js, /if\(kind==='staff'\)/);
  assert.match(js, /meta\.textContent=`Student • OSIS/);
});

test('staff and free-form witnesses stay in the existing other_witnesses compatibility field', () => {
  assert.match(js, /fd\.set\('other_witnesses',combinedOtherWitnessesText\(\)\)/);
  assert.match(js, /<\$\{email\}>/);
  assert.doesNotMatch(js, /staff_witnesses_json/);
});

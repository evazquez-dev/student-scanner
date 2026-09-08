const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const route = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/routes/required-communications.js'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'Google Apps Script/clasp-projects/behavioral-endpoint/Code.js'), 'utf8');

test('required campaign mutations are super-admin-only and view-as remains read-only', () => {
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(route, /if \(!isSuperAdmin\(access\)\)/);
  assert.match(route, /mutationOriginAllowed/);
});

test('communication category correction cannot grant GTL/DC implicit edit authority', () => {
  assert.match(route, /access\?\.can\?\.student_contacts/);
  assert.match(gas, /if \(!isBehaviorAdminRole_\(viewerRole\) && originalActor !== viewerEmail\) throw new Error\('forbidden'\)/);
  assert.doesNotMatch(route, /is_grade_team_lead.*communication_category_update/s);
  assert.doesNotMatch(route, /is_district_chair.*communication_category_update/s);
});

test('operational category correction fails closed when system mode cannot be read', () => {
  assert.match(route, /system_mode_check_failed/);
  assert.match(route, /practice:v1:/);
  assert.match(route, /persisted_externally: false/);
});

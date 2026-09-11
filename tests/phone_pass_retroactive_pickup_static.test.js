const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const route = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/phone-pass.js'), 'utf8');
const service = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/phone-pass-retroactive-pickup.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/phone_pass_return_actions.js'), 'utf8');

test('retroactive pickup is a grant-authorized Phone Pass mutation', () => {
  assert.match(route, /\/admin\/phone_pass\/retroactive_pickup/);
  assert.match(route, /confirmRetroactivePhonePickup/);
  assert.match(route, /canGrantPhonePass\(env, who\.email\)/);
  assert.match(route, /phone_pass_grant_forbidden/);
});

test('retroactive pickup writes only phone workflow state through the non-location update path', () => {
  assert.match(service, /https:\/\/student-loc\/update/);
  assert.doesNotMatch(service, /https:\/\/student-loc\/phone_pass/);
  assert.match(service, /phone_pickup_requested\s*!==\s*true/);
  assert.match(service, /phone_state_action:\s*'retroactive_pickup'/);
  assert.match(service, /phone_pickup_mode:\s*'retroactive'/);
  assert.match(service, /live_location_unchanged:\s*true/);
  assert.match(service, /physical_applied:\s*false/);
  assert.match(service, /location_evidence_at/);
});

test('Pickup Requests offers an explicit retroactive pickup button', () => {
  assert.match(ui, /RETROACTIVE_PICKUP_ENDPOINT/);
  assert.match(ui, /Retroactive Pickup/);
  assert.match(ui, /confirmRetroactivePickup/);
  assert.match(ui, /will NOT change the student's current live location/);
  assert.match(ui, /Student Picked Up Phone/);
});


test('Pickup Request actions render beneath the student information', () => {
  assert.match(ui, /pickupRequestRow/);
  assert.match(ui, /grid-template-columns:\s*1fr/);
  assert.match(ui, /pickupRequestActions/);
  assert.match(ui, /justify-content:flex-start/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const route = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/phone-pass.js'), 'utf8');
const service = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/phone-pass-pickup-requests.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/phone_pass_return_actions.js'), 'utf8');

test('Phone Pass exposes a pending pickup request queue', () => {
  assert.match(route, /\/admin\/phone_pass\/pickup_requests/);
  assert.match(route, /listPendingPhonePickupRequests/);
  assert.match(service, /phone_pickup_requested\s*!==\s*true/);
  assert.match(service, /phone_out\s*===\s*true/);
  assert.match(service, /phone_state_date/);
});

test('Phone Pass UI renders pending requests and confirms physical pickup', () => {
  assert.match(ui, /Pickup Requests/);
  assert.match(ui, /Student Picked Up Phone/);
  assert.match(ui, /PICKUP_REQUESTS_ENDPOINT/);
  assert.match(ui, /confirmPickup/);
  assert.match(ui, /source:\s*'phone_pass'/);
});

test('existing return request and retroactive return controls remain present', () => {
  assert.match(ui, /Send Student to Return Phone/);
  assert.match(ui, /Retroactive Return/);
  assert.match(ui, /\/admin\/phone_pass\/send_to_return/);
  assert.match(ui, /\/admin\/phone_pass\/retroactive_return/);
});

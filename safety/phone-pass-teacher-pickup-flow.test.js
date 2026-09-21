const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..','..');
const read=(rel)=>fs.readFileSync(path.join(ROOT,rel),'utf8');

const route=read('cf-redcake/red-cake-77d5/src/routes/phone-pass.js');
const service=read('cf-redcake/red-cake-77d5/src/services/phone-pass.js');
const worker=read('cf-redcake/red-cake-77d5/src/worker.js');
const ui=read('student-scanner/admin/phone_pass.js');

test('SAFETY: grant-only teachers request pickup instead of marking phone physically out',()=>{
  assert.match(route,/teacherGrantOnly/);
  assert.match(route,/body\.source\s*=\s*'phone_pass_request'/);
  assert.match(service,/requestSource === 'phone_pass_request'/);
  assert.match(service,/sentByTeacher \? 'send_to_pickup' : 'pickup'/);
});

test('SAFETY: Admin and Office Staff retain physical-pickup confirmation mode',()=>{
  assert.match(service,/grant_mode:/);
  assert.match(service,/confirm_pickup/);
  assert.match(service,/request_pickup/);
  assert.match(service,/isOfficeStaffEmail/);
});

test('SAFETY: kiosk pickup keeps the original requester attribution',()=>{
  assert.match(worker,/phone_pickup_requested_by_email = prev\.phone_pickup_requested_by_email \|\| null/);
  assert.match(worker,/phone_pickup_requested_at = prev\.phone_pickup_requested_at \|\| null/);
});

test('SAFETY: a teacher can still manage a phone after the kiosk confirms pickup',()=>{
  assert.match(service,/phone_pickup_requested_by_email/);
  assert.match(service,/isPhonePickupRequestedToday/);
  assert.match(route,/pickupRequester/);
});

test('SAFETY: Phone Pass UI clearly distinguishes request vs physical confirmation',()=>{
  assert.match(ui,/grant_mode/);
  assert.match(ui,/Send Student to Pickup Phone/);
  assert.match(ui,/phone_pass_request/);
  assert.match(ui,/Pickup Requested ✓/);
});

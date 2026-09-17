const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const worker=fs.readFileSync(
  path.join(root,'cf-redcake/red-cake-77d5/src/durable-objects/phone-events.js'),
  'utf8'
);
const calls=fs.readFileSync(path.join(root,'student-scanner/admin/calls.js'),'utf8');

test('live timer uses timezone-safe Worker anchor instead of PBX wall clock',()=>{
  assert.match(worker,/EAGLENEST_GRANDSTREAM_LIVE_TIMER_TRANSFER_V1/);
  assert.match(worker,/const liveStartedAt = clean\(previousCall\?\.live_started_at, 40\) \|\| new Date\(\)\.toISOString\(\)/);
  assert.match(worker,/const logicalStartedAt = clean\(previousCall\?\.started_at, 40\)/);
  assert.match(worker,/started_at: logicalStartedAt/);
  assert.match(worker,/live_started_at: liveStartedAt/);
  assert.match(worker,/pbx_started_at: clean\(previousCall\?\.pbx_started_at, 40\) \|\| pbxStartedAt/);

  assert.match(calls,/EAGLENEST_CALLS_LIVE_TIMER_V2/);
  assert.match(calls,/c\.live_started_at\|\|c\.started_at\|\|c\.start_local/);
  assert.match(calls,/fmtDate\(c\.live_started_at\|\|c\.started_at\)/);
  assert.match(calls,/start_local:c\.live_started_at\|\|c\.started_at/);
});

test('same call preserves timing and family context across transfer legs',()=>{
  assert.match(worker,/const phoneKey = currentPhoneKey \|\| clean\(previousCall\?\.phone_key, 80\)/);
  assert.match(worker,/Array\.isArray\(previousCall\?\.matches\)/);
  assert.match(worker,/clean\(previousCall\?\.phone_last4, 4\)/);
  assert.match(worker,/clean\(previousCall\?\.started_at, 40\)[\s\S]*\|\| pbxStartedAt/);
  assert.match(worker,/clean\(previousCall\?\.live_started_at, 40\)/);
});

test('attended transfer consult orientation requires strong owner and route-target evidence',()=>{
  assert.match(worker,/EAGLENEST_GRANDSTREAM_ATTENDED_TRANSFER_CONSULT_ORIENTATION_V1/);
  assert.match(worker,/peer\.state === 'connected'/);
  assert.match(worker,/endpointSet\.has\(peer\.staff_extension\)/);
  assert.match(worker,/normalizeGrandstreamPhone\(call\.route_target\)/);
  assert.match(worker,/normalizeGrandstreamPhone\(call\.route_target_name\)/);
  assert.match(worker,/routeHints\.has\(targetExtension\)/);
  assert.match(worker,/call\.src_extension = ownerExtension/);
  assert.match(worker,/call\.dst_extension = targetExtension/);
  assert.match(worker,/call\.staff_extension = ownerExtension/);
  assert.match(worker,/call\.transfer_consult = true/);
});

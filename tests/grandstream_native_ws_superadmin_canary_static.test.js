const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const route=fs.readFileSync(
  path.join(root,'cf-redcake/red-cake-77d5/src/routes/grandstream-live.js'),
  'utf8'
);
const worker=fs.readFileSync(
  path.join(root,'cf-redcake/red-cake-77d5/src/durable-objects/phone-events.js'),
  'utf8'
);

test('Super Admin live traffic uses a separate Durable Object canary',()=>{
  assert.match(route,/EAGLENEST_GRANDSTREAM_NATIVE_WS_SUPERADMIN_CANARY_V1/);
  assert.match(route,/nativeCanary = isSuperAdmin\(access\)/);
  assert.match(route,/nativeCanary \? 'SUPER_ADMIN_NATIVE_CANARY' : 'GLOBAL'/);
  assert.match(route,/if \(nativeCanary\) streamParams\.set\('transport', 'native_ws_v1'\)/);
});

test('ordinary GLOBAL transport remains legacy cookie WebSocket',()=>{
  const start=worker.indexOf('// EAGLENEST_GRANDSTREAM_WS_DIAGNOSTICS_PASSIVE_V2');
  const end=worker.indexOf('  _sendPbx(payload)',start);
  assert.ok(start>=0 && end>start);
  const legacy=worker.slice(start,end);

  assert.match(worker,/this\.transportProfile = 'legacy_cookie_ws'/);
  assert.match(legacy,/this\.transportProfile === 'native_ws_v1'/);
  assert.match(legacy,/'Cookie': `session-identify=\$\{cookie\}`/);
  assert.match(legacy,/eventnames: \['ActivityCallStatus'\]/);
});

test('native Super Admin canary authenticates inside WebSocket and subscribes directly to ActiveCallStatus',()=>{
  const start=worker.indexOf('async _connectPbxWebSocketNativeCanary()');
  const end=worker.indexOf('// EAGLENEST_GRANDSTREAM_WS_DIAGNOSTICS_PASSIVE_V2',start);
  assert.ok(start>=0 && end>start);
  const canary=worker.slice(start,end);

  assert.match(canary,/action: 'challenge'/);
  assert.match(canary,/username,/);
  assert.match(canary,/version: '1'/);
  assert.match(canary,/md5HexNativeWs\(`\$\{challengeValue\}\$\{password\}`\)/);
  assert.match(canary,/action: 'login'/);
  assert.match(canary,/action: 'heartbeat'/);
  assert.match(canary,/eventnames: \['ActiveCallStatus'\]/);

  assert.doesNotMatch(canary,/session-identify|['"]Cookie['"]\s*:/);
});

test('native canary retains production reconnect and polling fallback machinery',()=>{
  assert.match(worker,/return this\._connectPbxWebSocketNativeCanary\(\)/);
  assert.match(worker,/_handlePbxDisconnect\(reason\) \{/);
  assert.match(worker,/this\._startPolling\(reason\);/);
  assert.match(worker,/this\._scheduleReconnect\(\);/);
  assert.match(worker,/transport_profile: this\.transportProfile/);
});

test('native auth diagnostics do not emit raw authentication material',()=>{
  const start=worker.indexOf('async _connectPbxWebSocketNativeCanary()');
  const end=worker.indexOf('// EAGLENEST_GRANDSTREAM_WS_DIAGNOSTICS_PASSIVE_V2',start);
  const canary=worker.slice(start,end);

  assert.doesNotMatch(canary,/console\.log/);
  assert.doesNotMatch(canary,/challenge_value|raw_token|raw_password|raw_username/);
});

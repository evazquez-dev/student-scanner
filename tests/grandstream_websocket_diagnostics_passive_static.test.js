const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const worker=fs.readFileSync(
  path.join(root,'cf-redcake/red-cake-77d5/src/durable-objects/phone-events.js'),
  'utf8'
);

test('passive diagnostics hotfix is present',()=>{
  assert.match(worker,/EAGLENEST_GRANDSTREAM_WS_DIAGNOSTICS_PASSIVE_V2/);
  assert.match(worker,/websocket_diagnostics: this\._wsDiagnosticsPayload\(\)/);
});

test('original subscription fallback semantics are restored',()=>{
  assert.match(worker,/if \(action === 'subscribe' && Number\.isFinite\(status\) && status !== 0\)/);
  assert.match(worker,/eventnames: \['ActivityCallStatus'\]/);
  assert.match(worker,/eventnames: \['ActiveCallStatus'\]/);
});

test('original disconnect behavior remains direct',()=>{
  assert.match(worker,/_handlePbxDisconnect\(reason\) \{/);
  assert.match(worker,/this\.pbxWs = null;/);
  assert.match(worker,/this\._startPolling\(reason\);/);
  assert.match(worker,/this\._scheduleReconnect\(\);/);
});

test('close metadata is passive and original handler still runs',()=>{
  assert.match(worker,/this\._recordPbxDisconnect\('websocket_closed'/);
  assert.match(worker,/this\._handlePbxDisconnect\('websocket_closed'\);/);
  assert.match(worker,/close_code: Number\(event\?\.code \|\| 0\)/);
  assert.match(worker,/close_reason: clean\(event\?\.reason, 160\)/);
});

test('polling fallback is still immediate',()=>{
  assert.match(worker,/this\.pollTimer = setInterval\(\(\) => \{/);
  assert.match(worker,/this\._pollOnce\(false\)\.catch\(\(\) => \{\}\);/);
});

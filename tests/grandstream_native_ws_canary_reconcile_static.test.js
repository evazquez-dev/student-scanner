const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const worker=fs.readFileSync(
  path.join(root,'cf-redcake/red-cake-77d5/src/durable-objects/phone-events.js'),
  'utf8'
);

test('native Super Admin canary keeps an authoritative snapshot reconciliation loop',()=>{
  assert.match(worker,/EAGLENEST_GRANDSTREAM_NATIVE_WS_CANARY_RECONCILE_V1/);
  assert.match(worker,/const NATIVE_CANARY_RECONCILE_MS = 2500/);
  assert.match(worker,/this\._startNativeCanaryReconciliation\(\);/);
  assert.match(worker,/this\._pollOnce\(false\)/);
  assert.match(worker,/native_canary_reconciliation_active:/);
});

test('reconciliation is native-canary-only and requires a live native socket',()=>{
  const start=worker.indexOf('_startNativeCanaryReconciliation() {');
  const end=worker.indexOf('_stopNativeCanaryReconciliation() {',start);
  assert.ok(start>=0 && end>start);
  const block=worker.slice(start,end);

  assert.match(block,/this\.transportProfile !== 'native_ws_v1'/);
  assert.match(block,/!this\.engineStarted/);
  assert.match(block,/!this\.clients\.size/);
  assert.match(block,/!this\.pbxWs/);
});

test('native reconcile stops before fallback polling or engine shutdown',()=>{
  const disconnectStart=worker.indexOf('_handlePbxDisconnect(reason) {');
  const disconnectEnd=worker.indexOf('_scheduleReconnect()',disconnectStart);
  const disconnect=worker.slice(disconnectStart,disconnectEnd);
  assert.match(disconnect,/this\._stopNativeCanaryReconciliation\(\);/);
  assert.match(disconnect,/this\._startPolling\(reason\);/);

  const stopStart=worker.indexOf('async _stopEngine() {');
  assert.ok(stopStart>=0);
  const stop=worker.slice(stopStart,stopStart+700);
  assert.match(stop,/this\._stopNativeCanaryReconciliation\(\);/);
});

test('GLOBAL legacy connector is not modified into hybrid reconciliation',()=>{
  const legacyStart=worker.indexOf('// EAGLENEST_GRANDSTREAM_WS_DIAGNOSTICS_PASSIVE_V2');
  const legacyEnd=worker.indexOf('  _sendPbx(payload)',legacyStart);
  assert.ok(legacyStart>=0 && legacyEnd>legacyStart);
  const legacy=worker.slice(legacyStart,legacyEnd);

  assert.match(legacy,/'Cookie': `session-identify=\$\{cookie\}`/);
  assert.doesNotMatch(legacy,/_startNativeCanaryReconciliation\(\)/);
});

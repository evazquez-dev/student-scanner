const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const worker=fs.readFileSync(
  path.join(root,'cf-redcake/red-cake-77d5/src/durable-objects/phone-events.js'),
  'utf8'
);

test('native canary starts native WebSocket before legacy HTTPS login',()=>{
  assert.match(worker,/EAGLENEST_GRANDSTREAM_NATIVE_WS_STARTUP_RESILIENCE_V2/);

  const start=worker.indexOf('async _ensureEngine() {');
  const end=worker.indexOf('// EAGLENEST_GRANDSTREAM_WS_AUTH_HEARTBEAT_PROBE_V1',start);
  assert.ok(start>=0 && end>start);
  const block=worker.slice(start,end);

  const nativeBranch=block.indexOf("if (this.transportProfile === 'native_ws_v1')");
  const nativeConnect=block.indexOf('this._connectPbxWebSocket()',nativeBranch);
  const globalMarker=block.indexOf('// GLOBAL / ordinary-user legacy startup remains unchanged.');
  const legacyLogin=block.indexOf('await this._ensureApiSession(false);',globalMarker);

  assert.ok(nativeBranch>=0);
  assert.ok(nativeConnect>nativeBranch);
  assert.ok(globalMarker>nativeConnect);
  assert.ok(legacyLogin>globalMarker);
  assert.match(block,/this\._attemptNativeCanaryReconciliation\('startup'\)\.catch\(\(\) => \{\}\)/);
});

test('native canary can self-heal an old wedged starting state',()=>{
  const start=worker.indexOf('async _ensureEngine() {');
  const end=worker.indexOf('if (this.startPromise) return this.startPromise;',start);
  const block=worker.slice(start,end);

  assert.match(block,/staleNativeStartup/);
  assert.match(block,/this\.status\.mode === 'starting'/);
  assert.match(block,/!this\.pbxWs/);
  assert.match(block,/this\.engineStarted = false/);
  assert.match(block,/native_canary_stale_startup_recovered/);
});

test('REST reconciliation failure cannot tear down healthy native WebSocket',()=>{
  const start=worker.indexOf('async _attemptNativeCanaryReconciliation');
  const end=worker.indexOf('_startNativeCanaryReconciliation() {',start);
  assert.ok(start>=0 && end>start);
  const block=worker.slice(start,end);

  assert.match(block,/await this\._pollOnce\(false\)/);
  assert.match(block,/this\._recordNativeCanaryReconcileFailure\(error, phase\)/);
  assert.doesNotMatch(block,/_handlePbxDisconnect/);
  assert.doesNotMatch(block,/this\.pbxWs\s*=\s*null/);
});

test('failed REST reconciliation uses bounded retry backoff',()=>{
  assert.match(worker,/NATIVE_CANARY_RECONCILE_BACKOFF_MAX_MS = 30000/);
  assert.match(worker,/nativeCanaryReconcileFailureCount/);
  assert.match(worker,/nativeCanaryReconcileNextAttemptMs/);
  assert.match(worker,/5000 \* \(2 \*\* exponent\)/);
  assert.match(worker,/native_canary_reconciliation_backoff_active:/);
  assert.match(worker,/native_canary_reconciliation_next_retry_at_iso:/);
});

test('GLOBAL legacy startup remains after the native-only branch',()=>{
  const start=worker.indexOf('async _ensureEngine() {');
  const end=worker.indexOf('// EAGLENEST_GRANDSTREAM_WS_AUTH_HEARTBEAT_PROBE_V1',start);
  const block=worker.slice(start,end);

  assert.match(block,/GLOBAL \/ ordinary-user legacy startup remains unchanged/);
  const marker=block.indexOf('// GLOBAL / ordinary-user legacy startup remains unchanged.');
  const after=block.slice(marker);
  assert.match(after,/await this\._ensureApiSession\(false\);[\s\S]*?await this\._pollOnce\(true\)/);
});

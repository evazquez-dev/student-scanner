const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const worker=fs.readFileSync(
  path.join(root,'cf-redcake/red-cake-77d5/src/durable-objects/phone-events.js'),
  'utf8'
);

test('Grandstream WebSocket diagnostics expose sanitized lifecycle data',()=>{
  assert.match(worker,/EAGLENEST_GRANDSTREAM_WS_DIAGNOSTICS_V1/);
  assert.match(worker,/websocket_diagnostics: this\._wsDiagnosticsPayload\(\)/);
  assert.match(worker,/connect_attempts:/);
  assert.match(worker,/connect_successes:/);
  assert.match(worker,/last_upgrade_http_status:/);
  assert.match(worker,/last_upgrade_websocket_present:/);
  assert.match(worker,/last_close_code:/);
  assert.match(worker,/last_close_reason:/);
  assert.match(worker,/last_close_was_clean:/);
  assert.match(worker,/last_connection_lifetime_ms:/);
  assert.match(worker,/unexpected_disconnects:/);
  assert.match(worker,/polling_fallbacks:/);
  assert.match(worker,/reconnect_attempts:/);
  assert.match(worker,/current_connection_age_ms:/);
});

test('WebSocket close event captures code reason and clean flag',()=>{
  assert.match(worker,/ws\.addEventListener\('close', \(event\) => this\._handlePbxDisconnect/);
  assert.match(worker,/close_code: Number\(event\?\.code \|\| 0\)/);
  assert.match(worker,/close_reason: clean\(event\?\.reason, 160\)/);
  assert.match(worker,/was_clean: event\?\.wasClean === true/);
});

test('diagnostic events do not log PBX cookie or raw caller data',()=>{
  const helperStart=worker.indexOf('_wsDiagEvent(event, details = {})');
  assert.ok(helperStart>=0);
  const helperEnd=worker.indexOf('_activeCallList()',helperStart);
  const helper=worker.slice(helperStart,helperEnd);
  assert.doesNotMatch(helper,/apiCookie|session-identify|phone_key|callernum|connectednum/);

  assert.match(worker,/console\.log\('EAGLENEST_PBX_WS_DIAG', entry\)/);
});

test('poll fallback does not erase retained WebSocket diagnostic failure',()=>{
  assert.match(worker,/this\.wsDiag\.last_poll_fallback_reason = clean\(reason, 120\)/);
  assert.match(worker,/this\.status\.last_error = ''; \/\/ EAGLENEST_GRANDSTREAM_CLEAR_STALE_POLL_ERROR_V1/);
  assert.match(worker,/last_disconnect_reason:/);
});

test('idle engine closure is explicitly marked expected',()=>{
  assert.match(worker,/engine_idle_close_requested/);
  assert.match(worker,/expected: true/);
  assert.match(worker,/this\.pbxWs\.close\(1000, 'idle'\)/);
});

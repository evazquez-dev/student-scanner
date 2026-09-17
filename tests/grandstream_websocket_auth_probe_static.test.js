const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const doPath=path.join(root,'cf-redcake/red-cake-77d5/src/durable-objects/phone-events.js');
const routePath=path.join(root,'cf-redcake/red-cake-77d5/src/routes/grandstream-live.js');
const worker=fs.readFileSync(doPath,'utf8');
const route=fs.readFileSync(routePath,'utf8');

test('auth heartbeat probe is isolated from the production Calls socket',()=>{
  assert.match(worker,/EAGLENEST_GRANDSTREAM_WS_AUTH_HEARTBEAT_PROBE_V1/);

  const start=worker.indexOf('async _probePbxWebSocketAuth()');
  const canaryEnd=worker.indexOf('// EAGLENEST_GRANDSTREAM_NATIVE_WS_SUPERADMIN_CANARY_V1',start);
  const legacyEnd=worker.indexOf('// EAGLENEST_GRANDSTREAM_WS_DIAGNOSTICS_PASSIVE_V2',start);
  const end=canaryEnd>start ? canaryEnd : legacyEnd;
  assert.ok(start>=0 && end>start);
  const probe=worker.slice(start,end);

  assert.match(probe,/const cookie = await this\._ensureApiSession\(false\)/);
  assert.match(probe,/grandstreamLiveApiRequest\(this\.env, cookie/);
  assert.match(probe,/'Cookie': `session-identify=\$\{cookie\}`/);
  assert.match(probe,/action: 'heartbeat'/);

  assert.match(probe,/let probeWs = null/);
  assert.match(probe,/probeWs\.send\(JSON\.stringify/);
  assert.match(probe,/probeWs\.close\(1000, 'auth_probe_complete'\)/);
  assert.doesNotMatch(probe,/this\.pbxWs\s*=/);
  assert.doesNotMatch(probe,/this\._sendPbx\(/);
  assert.doesNotMatch(probe,/this\._handlePbxDisconnect\(/);
  assert.doesNotMatch(probe,/this\._startPolling\(/);
  assert.doesNotMatch(probe,/this\._scheduleReconnect\(/);

  assert.doesNotMatch(probe,/action:\s*'subscribe'/);
  assert.doesNotMatch(probe,/ActivityCallStatus|ActiveCallStatus/);
});

test('auth probe exposes only sanitized authentication evidence',()=>{
  const start=worker.indexOf('async _probePbxWebSocketAuth()');
  const canaryEnd=worker.indexOf('// EAGLENEST_GRANDSTREAM_NATIVE_WS_SUPERADMIN_CANARY_V1',start);
  const legacyEnd=worker.indexOf('// EAGLENEST_GRANDSTREAM_WS_DIAGNOSTICS_PASSIVE_V2',start);
  const end=canaryEnd>start ? canaryEnd : legacyEnd;
  const probe=worker.slice(start,end);

  assert.match(probe,/https_api_cookie_valid/);
  assert.match(probe,/cookie_header_sent/);
  assert.match(probe,/heartbeat_status/);
  assert.match(probe,/authenticated/);
  assert.match(probe,/close_code/);
  assert.match(probe,/close_reason/);
  assert.match(probe,/close_was_clean/);

  assert.doesNotMatch(probe,/result\.(?:cookie|session_cookie|raw_cookie)\s*=/);
});

test('auth probe route is explicit POST and Super Admin only',()=>{
  assert.match(route,/['"]\/admin\/integrations\/grandstream\/live\/auth_probe['"]/);

  const start=route.indexOf("if (path === '/admin/integrations/grandstream/live/auth_probe')");
  const end=route.indexOf('// EAGLENEST_GRANDSTREAM_LIVE_CHANNEL_PROBE_V1_ROUTE',start);
  assert.ok(start>=0 && end>start);
  const block=route.slice(start,end);

  assert.match(block,/req\.method !== 'POST'/);
  assert.match(block,/!isSuperAdmin\(access\)/);
  assert.match(block,/!mutationOriginAllowed\(req, env\)/);
  assert.match(block,/viewAsReadOnlyResponse\(accessResponse, access\)/);
  assert.match(block,/internalRequest\('\/auth_probe', \{ method:'POST' \}\)/);
});

test('existing production WebSocket subscription implementation remains present',()=>{
  assert.match(worker,/EAGLENEST_GRANDSTREAM_WS_DIAGNOSTICS_PASSIVE_V2/);
  assert.match(worker,/action: 'subscribe'/);
  assert.match(worker,/eventnames: \['ActivityCallStatus'\]/);
  assert.match(worker,/eventnames: \['ActiveCallStatus'\]/);
  assert.match(worker,/_handlePbxDisconnect\(reason\) \{/);
  assert.match(worker,/_startPolling\(reason\);/);
  assert.match(worker,/_scheduleReconnect\(\);/);
});

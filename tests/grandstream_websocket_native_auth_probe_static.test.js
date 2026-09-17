const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const service=fs.readFileSync(path.join(root,'cf-redcake/red-cake-77d5/src/services/grandstream-live.js'),'utf8');
const route=fs.readFileSync(path.join(root,'cf-redcake/red-cake-77d5/src/routes/grandstream-live.js'),'utf8');
const phoneEvents=fs.readFileSync(path.join(root,'cf-redcake/red-cake-77d5/src/durable-objects/phone-events.js'),'utf8');

test('native auth probe is isolated from production Calls socket',()=>{
  const start=service.indexOf('export async function grandstreamLiveProbeNativeWebSocketAuth');
  const end=service.indexOf('export async function grandstreamLiveLoadExtensions',start);
  assert.ok(start>=0 && end>start);
  const probe=service.slice(start,end);
  assert.match(service,/EAGLENEST_GRANDSTREAM_WS_NATIVE_AUTH_PROBE_V1/);
  assert.match(probe,/'Upgrade': 'websocket'/);
  assert.doesNotMatch(probe,/'Cookie':/);
  assert.doesNotMatch(probe,/PHONE_EVENTS_DO|this\.pbxWs|_startPolling|_scheduleReconnect/);
});

test('probe performs a single challenge-login-heartbeat-subscribe chain',()=>{
  const start=service.indexOf('export async function grandstreamLiveProbeNativeWebSocketAuth');
  const end=service.indexOf('export async function grandstreamLiveLoadExtensions',start);
  const probe=service.slice(start,end);
  assert.match(probe,/action: 'challenge'/);
  assert.match(probe,/version: '1'/);
  assert.match(probe,/md5Hex\(`\$\{challengeValue\}\$\{password\}`\)/);
  assert.match(probe,/action: 'login'/);
  assert.match(probe,/automatic_login_retries: 0/);
  assert.match(probe,/action: 'heartbeat'/);
  assert.match(probe,/eventnames: \['ActivityCallStatus'\]/);
});

test('probe does not expose challenge token password or cookie values',()=>{
  const start=service.indexOf('export async function grandstreamLiveProbeNativeWebSocketAuth');
  const end=service.indexOf('export async function grandstreamLiveLoadExtensions',start);
  const probe=service.slice(start,end);
  assert.match(probe,/challenge_received/);
  assert.match(probe,/challenge_length/);
  assert.match(probe,/login_cookie_returned/);
  assert.doesNotMatch(probe,/result\.challenge\s*=/);
  assert.doesNotMatch(probe,/result\.token\s*=/);
  assert.doesNotMatch(probe,/result\.password\s*=/);
  assert.doesNotMatch(probe,/result\.cookie\s*=/);
});

test('route is explicit POST, Super Admin only, and bypasses PhoneEventsDO',()=>{
  const start=route.indexOf("if (path === '/admin/integrations/grandstream/live/native_auth_probe')");
  const end=route.indexOf('// EAGLENEST_GRANDSTREAM_LIVE_CHANNEL_PROBE_V1_ROUTE',start);
  assert.ok(start>=0 && end>start);
  const block=route.slice(start,end);
  assert.match(block,/req\.method !== 'POST'/);
  assert.match(block,/!isSuperAdmin\(access\)/);
  assert.match(block,/!mutationOriginAllowed\(req, env\)/);
  assert.match(block,/viewAsReadOnlyResponse\(accessResponse, access\)/);
  assert.match(block,/grandstreamLiveProbeNativeWebSocketAuth\(env\)/);
  assert.doesNotMatch(block,/phoneEventsStub|stub\.fetch/);
});

test('production PhoneEvents transport remains intact',()=>{
  assert.match(phoneEvents,/EAGLENEST_GRANDSTREAM_WS_DIAGNOSTICS_PASSIVE_V2/);
  assert.match(phoneEvents,/eventnames: \['ActivityCallStatus'\]/);
  assert.match(phoneEvents,/_handlePbxDisconnect\(reason\) \{/);
  assert.match(phoneEvents,/_startPolling\(reason\);/);
  assert.match(phoneEvents,/_scheduleReconnect\(\);/);
});

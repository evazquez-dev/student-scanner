const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const calls=fs.readFileSync(path.join(root,'admin/calls.js'),'utf8');

test('just-ended calls survive same-tab navigation while waiting for CDR history',()=>{
  assert.match(calls,/EAGLENEST_CALLS_RECENT_SESSION_BRIDGE_V1/);
  assert.match(calls,/RECENT_BRIDGE_KEY='eaglenest_calls_recent_bridge_v1'/);
  assert.match(calls,/RECENT_BRIDGE_TTL_MS=30\*60\*1000/);
  assert.match(calls,/sessionStorage\.setItem\(RECENT_BRIDGE_KEY/);
  assert.match(calls,/restoreRecentBridge\(\);renderRecent\(\)/);
  assert.match(calls,/if\(changed\)persistRecentBridge\(\)/);
});

test('recent bridge is PII-minimized and never stores contact/student payloads',()=>{
  const start=calls.indexOf('function recentBridgeSafe(c){');
  const end=calls.indexOf('function recentBridgeTime(v){',start);
  assert.ok(start>=0 && end>start);
  const block=calls.slice(start,end);
  assert.doesNotMatch(block,/\bmatches\b/);
  assert.doesNotMatch(block,/student_number|student_name|contact_assoc_id|person_id|raw_phone|phone_key/);
  assert.match(block,/phone_last4/);
});

test('authoritative D1 history replaces the temporary recent bridge',()=>{
  assert.match(calls,/function reconcileRecentBridge\(hist\)/);
  assert.match(calls,/recentBridgeMatchesHistory/);
  assert.match(calls,/reconcileRecentBridge\(j\.rows\|\|\[\]\)/);
  assert.match(calls,/Math\.abs\(a-b\)>120000/);
});

test('recent bridge is session-only, not durable browser localStorage',()=>{
  const start=calls.indexOf('function persistRecentBridge(){');
  const end=calls.indexOf('function reconcileRecentBridge(hist){',start);
  assert.ok(start>=0 && end>start);
  const block=calls.slice(start,end);
  assert.match(block,/sessionStorage/);
  assert.doesNotMatch(block,/localStorage/);
});

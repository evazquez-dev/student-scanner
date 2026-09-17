const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const calls=fs.readFileSync(path.join(root,'admin/calls.js'),'utf8');

test('Recent Calls renders transfer lineage supplied by logical CDR history',()=>{
  assert.match(calls,/EAGLENEST_CALLS_HISTORY_TRANSFER_DETAIL_V1/);
  assert.match(calls,/function transferDetail\(c\)/);
  assert.match(calls,/transfer_from_extension/);
  assert.match(calls,/transfer_to_extension/);

  const start=calls.indexOf('function renderRecent(){');
  const end=calls.indexOf('function renderAll(){',start);
  assert.ok(start>=0 && end>start);
  const block=calls.slice(start,end);
  assert.match(block,/transferDetail\(c\)/);
});

test('Recent Calls still keeps temporary live-to-CDR reconciliation bridge',()=>{
  assert.match(calls,/EAGLENEST_CALLS_RECENT_SESSION_BRIDGE_V1/);
  assert.match(calls,/recentBridgeMatchesHistory/);
  assert.match(calls,/reconcileRecentBridge/);
});

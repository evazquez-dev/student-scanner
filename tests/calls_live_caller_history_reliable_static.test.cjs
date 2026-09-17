const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const calls=fs.readFileSync(path.join(root,'admin/calls.js'),'utf8');

test('live caller card answers who most recently called from school',()=>{
  assert.match(calls,/EAGLENEST_LIVE_CALLER_HISTORY_ANSWER_V2/);
  assert.match(calls,/data\?\.most_recent_school_outgoing/);
  assert.match(calls,/Most recent school call:/);
  assert.match(calls,/syncing to PBX history/);
});

test('pending recent outbound can render staff name plus extension',()=>{
  const start=calls.indexOf('function historyStaffLabel(row)');
  const end=calls.indexOf('function liveCallerHistoryHtml(call)',start);
  assert.ok(start>=0 && end>start);
  const block=calls.slice(start,end);
  assert.match(block,/row\?\.src_name\|\|row\?\.staff_name/);
  assert.match(block,/row\?\.src_extension\|\|row\?\.staff_extension/);
});

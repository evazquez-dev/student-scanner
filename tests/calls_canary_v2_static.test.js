const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'admin/calls_canary.js'),'utf8');
const html=fs.readFileSync(path.join(root,'admin/calls_canary.html'),'utf8');

test('V2 canary records browser sleep gaps and observation coverage',()=>{
  assert.match(js,/PROMOTION_PAGE_V2/);
  assert.match(js,/longest_gap_ms/);
  assert.match(js,/total_gap_ms/);
  assert.match(js,/function observation\(\)/);
  assert.match(html,/Browser observation/);
});

test('V2 canary classifies mismatches and captures safe lineage evidence',()=>{
  assert.match(js,/internal_orientation/);
  assert.match(js,/state_or_endpoint_detail/);
  assert.match(js,/canary_compare\/snapshot/);
  assert.match(js,/recent_transitions/);
  assert.match(html,/lineage evidence/);
});

test('V2 canary supports controlled extension-only call markers',()=>{
  assert.match(js,/from_extension/);
  assert.match(js,/to_extension/);
  assert.match(html,/Controlled call marker/);
  assert.match(html,/no external phone number is stored/i);
});

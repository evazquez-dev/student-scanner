const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..','..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const route=read('cf-redcake/red-cake-77d5/src/routes/dean-dashboard.js');
const service=read('cf-redcake/red-cake-77d5/src/services/dean-dashboard.js');
const scope=read('cf-redcake/red-cake-77d5/src/services/dean-scope.js');
const gate=read('cf-redcake/red-cake-77d5/src/utils/access-route-gate.js');

test('SAFETY: Dean mutations use origin protection and View As is read-only',()=>{
  assert.match(route,/mutationOriginAllowed/);
  assert.match(route,/viewAsReadOnlyResponse/);
});

test('SAFETY: Dean student reads and writes verify server-side scope',()=>{
  assert.match(service,/student_outside_dean_scope/);
  assert.match(service,/deanScopeContains/);
  assert.match(scope,/resolveDeanScope/);
});

test('SAFETY: Practice Mode cannot create live Dean intervention records',()=>{
  assert.match(service,/practice_mode_read_only/);
});

test('SAFETY: dedicated capability gates Dean routes while scope admin uses Access Control',()=>{
  assert.match(gate,/\/admin\/dean\/scope','access_control'/);
  assert.match(gate,/\/admin\/dean\/','dean_dashboard'/);
});

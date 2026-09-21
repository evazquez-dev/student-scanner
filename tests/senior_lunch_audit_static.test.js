const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..','..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('cf-redcake/red-cake-77d5/src/index.js');
const route=read('cf-redcake/red-cake-77d5/src/routes/senior-lunch-audit.js');
const service=read('cf-redcake/red-cake-77d5/src/services/senior-lunch-audit.js');
const nav=read('student-scanner/admin/nav.js');
const oldHtml=read('student-scanner/admin/senior_lunch_audit.html');
const outside=read('student-scanner/admin/outside_lunch.js');
test('only new Outside Lunch is navigable; old bookmarks redirect',()=>{
  assert.match(nav,/href:'\.\/outside_lunch\.html'/);
  assert.doesNotMatch(nav,/href:'\.\/senior_lunch_audit\.html'/);
  assert.match(oldHtml,/location.replace\('\.\/outside_lunch\.html'/);
  assert.match(outside,/\/admin\/outside_lunch\/penalty\/retract/);
});
test('existing audit read remains modular; old forgiveness is not a route',()=>{
  assert.match(index,/from '\.\/routes\/senior-lunch-audit\.js'/);
  assert.match(route,/\/admin\/senior_outin_audit/);
  assert.doesNotMatch(route,/\/admin\/senior_outin_forgive/);
  assert.doesNotMatch(service,/forgiveSeniorLunchPenalty/);
});
test('schedule and violation evidence stay available to new engine',()=>{
  for(const name of ['roster_v1','bell_schedule_v1','student_classes_v1','att_cfg_v1'])assert.ok(service.includes(name));
  assert.match(service,/new Set\(\['LCH1', 'LCH2'\]\)/);
  assert.match(service,/senior_outin_last_violation_type/);
});

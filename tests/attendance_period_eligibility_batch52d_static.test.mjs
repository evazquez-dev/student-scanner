import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const html=readFileSync(path.resolve(here,'../admin/attendance_evidence_verify.html'),'utf8');
const js=readFileSync(path.resolve(here,'../admin/attendance_evidence_verify.js'),'utf8');
test('period eligibility panel is connected with verified daily source and classroom review',()=>{
 for(const id of ['periodEligibility52d','periodEligibility52dMeta','periodEligibility52dRows']){
  assert.match(html,new RegExp(`id="${id}"`));assert.match(js,new RegExp(`['"]${id}['"]`));
 }
 assert.match(js,/result\.period_eligibility/);
 assert.match(js,/period_eligibility:r\.period_eligibility\|\|null/);
 assert.match(js,/period_eligibility:c\.period_eligibility\|\|null/);
 assert.match(html,/Student-period classifications do not establish official meeting attendance/);
});

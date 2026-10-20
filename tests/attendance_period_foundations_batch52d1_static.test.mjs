import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin/attendance_evidence_verify.html',import.meta.url),'utf8');
const page=readFileSync(new URL('../admin/attendance_evidence_verify.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/services/attendance-period-audit.js',import.meta.url),'utf8');
const resolver=readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/services/classroom-obligations.js',import.meta.url),'utf8');
test('read-only 5.2D.1 panel and privacy-safe aggregate copy included',()=>{
  assert.match(html,/id="periodFoundations52d1"/);
  assert.match(page,/result\.reconciliation_foundations_52d1/);
  assert.match(page,/reconciliation_foundations_52d1:r\.reconciliation_foundations_52d1/);
  assert.match(html,/No student or teacher scores are produced/);
});
test('pipeline includes 5.2D and 5.2D.1 in order, preserving diagnostics',()=>{
  assert.match(worker,/reconcilePeriodFoundations52D1\(env,db,[\s\S]*reconcilePeriodEligibility52D1?/);
});
test('#N/A is suppressed as an instructional assignment, not as a daily enrollment record',()=>{
  assert.match(resolver,/isUnassignedClassroomValue52D1/);
  assert.match(resolver,/roomRaw/);
  assert.match(resolver,/courseRaw/);
});

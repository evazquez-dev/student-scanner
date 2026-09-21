// EAGLENEST_OUTSIDE_LUNCH_V2: the old forgiveness flow has no callers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const oldService=readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/services/senior-lunch-audit.js',import.meta.url),'utf8');
const oldRoute=readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/routes/senior-lunch-audit.js',import.meta.url),'utf8');
const modern=readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/services/outside-lunch.js',import.meta.url),'utf8');
test('old forgiveness is gone, new penalty-only retraction is authoritative',()=>{
  assert.doesNotMatch(oldService,/export async function forgiveSeniorLunchPenalty/);
  assert.doesNotMatch(oldRoute,/\/admin\/senior_outin_forgive/);
  const f=modern.split('export async function retractOutsideLunchPenalty')[1];
  assert.ok(f);
  assert.match(f,/senior_outin_penalty_pending:false/);
  assert.doesNotMatch(f,/senior_outin_out_active:/);
  assert.match(f,/INSERT INTO outside_lunch_penalty_retractions/);
});
test('lookup tolerates a never-scanned student; other location failures still fail closed',()=>{
  assert.match(modern,/if\s*\(response.status===404\)\s*return \{\}/);
  assert.match(modern,/if\s*\(!response.ok\)\s*throw new Error\('student_location_read_failed'\)/);
});

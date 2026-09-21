const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT,p), 'utf8');
const index=read('cf-redcake/red-cake-77d5/src/index.js');
const audit=read('cf-redcake/red-cake-77d5/src/routes/senior-lunch-audit.js');
const service=read('cf-redcake/red-cake-77d5/src/services/senior-lunch-audit.js');
const newRoute=read('cf-redcake/red-cake-77d5/src/routes/outside-lunch.js');
const newService=read('cf-redcake/red-cake-77d5/src/services/outside-lunch.js');
const worker=read('cf-redcake/red-cake-77d5/src/worker.js');
test('SAFETY: Outside Lunch is intercepted before the legacy worker',()=>{
  assert.match(index,/OUTSIDE_LUNCH_PATHS.has\(path\)/);
  assert.ok(index.indexOf('OUTSIDE_LUNCH_PATHS.has(path)')<index.lastIndexOf('return baseWorker.fetch(req, env, ctx);'));
});
test('SAFETY: legacy audit remains read-only and forgiveness endpoint is retired',()=>{
  assert.match(audit,/EAGLENEST_OUTSIDE_LUNCH_V2/);
  assert.match(audit,/\/admin\/senior_outin_audit/);
  assert.doesNotMatch(audit,/\/admin\/senior_outin_forgive/);
  assert.doesNotMatch(service,/export async function forgiveSeniorLunchPenalty/);
  assert.doesNotMatch(worker,/if \(path === "\/admin\/senior_outin_forgive"\)/);
});
test('SAFETY: all Outside Lunch administrative writes keep origin, View As and admin guards',()=>{
  assert.match(newRoute,/mutationOriginAllowed/);
  assert.match(newRoute,/viewAsReadOnlyResponse/);
  assert.match(newRoute,/if\(\(isMutation\|\|path.endsWith\('\/dashboard'\)\)\&\&!admin\)/);
});
test('SAFETY: new penalty retraction preserves physical OUT and writes a D1 audit',()=>{
  const fn=newService.split('export async function retractOutsideLunchPenalty')[1];
  assert.ok(fn);
  assert.match(fn,/senior_outin_penalty_pending:false/);
  assert.doesNotMatch(fn,/senior_outin_out_active:/);
  assert.match(fn,/if\(!response.ok\)/);
  assert.match(fn,/INSERT INTO outside_lunch_penalty_retractions/);
});
test('SAFETY: Practice mode uses distinct StudentLocation object',()=>{
  assert.match(service,/SYSTEM_MODE_KEY = 'system:mode:v1'/);
  assert.match(service,/return `PRACTICE:\$\{d\}:GLOBAL`/);
  assert.match(service,/seniorLunchStudentLocationDoName\(modeInfo\)/);
});
test('SAFETY: admin retraction never overrides the slip requirement',()=>{
  assert.match(newService,/const baseEligible=slip && gradeAllowed && !actions.restriction/);
});

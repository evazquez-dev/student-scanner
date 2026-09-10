const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const route = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/phone-pass.js'), 'utf8');
const service = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/phone-pass.js'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const frontend = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/phone_pass_return_actions.js'), 'utf8');

test('retroactive Phone Pass return is a guarded final-return mutation', () => {
  assert.match(route, /\/admin\/phone_pass\/retroactive_return/);
  assert.match(route, /confirmRetroactivePhoneReturn/);
  const start = route.indexOf("if (path === '/admin/phone_pass/retroactive_return')");
  const end = route.indexOf("if (path === '/admin/phone_pass/return')", start);
  assert.ok(start >= 0 && end > start, 'Retroactive route handler not found');
  const handler = route.slice(start, end);
  assert.match(handler, /canReturnPhonePass\(env, who\.email\)/);
  assert.match(handler, /hallway_monitor_forbidden/);
  assert.match(route, /const guard = mutationGuard\(req, env, base\.response, base\.data\)/);
});

test('retroactive return closes phone workflow but never rewrites live-location evidence', () => {
  const start = worker.indexOf('if (path === "/phone_pass")');
  const end = worker.indexOf('if (path === "/update")', start);
  assert.ok(start >= 0 && end > start, 'Phone Pass DO block not found');
  const block = worker.slice(start, end);

  assert.match(block, /"retroactive_return"/);
  assert.match(block, /const preserveLiveLocation = action === "retroactive_return"/);
  assert.match(block, /if \(!preserveLiveLocation && !physicalSuperseded\)/);
  assert.match(block, /phone_out = false/);
  assert.match(block, /phone_returned_at = whenISO/);
  assert.match(block, /phone_return_mode = action === "retroactive_return" \? "retroactive" : "live"/);
  assert.match(block, /live_location_unchanged: preserveLiveLocation/);
  assert.match(block, /physical_applied: !preserveLiveLocation && !physicalSuperseded/);
});

test('retroactive service path is audit-only and reports no physical mutation', () => {
  const start = service.indexOf('export async function confirmRetroactivePhoneReturn');
  const end = service.indexOf('export async function confirmPhoneReturn', start);
  assert.ok(start >= 0 && end > start, 'Retroactive service function not found');
  const fn = service.slice(start, end);

  assert.match(fn, /action: 'retroactive_return'/);
  assert.match(fn, /writePhoneAudit\(env, modeInfo, actor\?\.email, 'phone_pass_retroactive_return'/);
  assert.match(fn, /live_location_unchanged: true/);
  assert.match(fn, /physical_applied: false/);
  assert.doesNotMatch(fn, /enqueuePhoneLog/);
});

test('Phone Pass UI labels retroactive return as exceptional and requires explicit confirmation', () => {
  assert.match(frontend, /Retroactive Return/);
  assert.match(frontend, /\/admin\/phone_pass\/retroactive_return/);
  assert.match(frontend, /window\.confirm/);
  assert.match(frontend, /will NOT change the student.s live location/i);
  assert.match(frontend, /Use this only when the phone was returned earlier/i);
});

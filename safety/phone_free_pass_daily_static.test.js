const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const service = read('cf-redcake/red-cake-77d5/src/services/phone-free-pass.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/phone-free-pass.js');
const kiosk = read('cf-redcake/red-cake-77d5/src/services/phone-kiosk.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const nav = read('student-scanner/admin/nav.js');
const page = read('student-scanner/admin/phone_free_pass.js');
const pageHtml = read('student-scanner/admin/phone_free_pass.html');
const kioskUi = read('student-scanner/phone-kiosk/phone-kiosk.js');

test('SAFETY: daily free-phone list is date-keyed and replaced as a whole', () => {
  assert.match(service, /\/phone_free_pass_daily/);
  assert.match(service, /phoneFreePassDate/);
  assert.match(worker, /phone_free_pass_daily_current/);
  assert.match(route, /\/admin\/phone_free_pass\/save/);
  assert.match(pageHtml, /id="saveBtn"[\s\S]*Save Today.?s List \(Replace\)/i);
  assert.match(page, /\/admin\/phone_free_pass\/save/);
});

test('SAFETY: free pickup is kiosk fallback only when no normal phone flow exists', () => {
  assert.match(kiosk, /deriveFlow\(context\.state \|\| \{\}\)/);
  assert.match(kiosk, /flow === 'none'/);
  assert.match(kiosk, /getPhoneFreePassEligibility/);
  assert.match(kiosk, /flow = 'free_pickup'/);
});

test('SAFETY: confirmed free pickup is consumed atomically in StudentLocationDO', () => {
  assert.match(worker, /const freePass = body\.free_pass === true/);
  assert.match(worker, /phone_free_pass_used_date/);
  assert.match(worker, /phone_free_pass_already_used_today/);
  assert.match(worker, /phone_free_pass_not_eligible_today/);
  assert.match(worker, /phone_pickup_request_exists/);
});

test('SAFETY: return does not clear the daily free-pass used marker', () => {
  const returnBlock = worker.slice(worker.indexOf('} else if (action === "return" || action === "retroactive_return")'), worker.indexOf('// EAGLENEST_PHONE_PASS_RETROACTIVE_RETURN_V1'));
  assert.doesNotMatch(returnBlock, /phone_free_pass_used_date\s*=\s*null/);
  assert.match(returnBlock, /phone_free_pass_returned_at/);
});

test('SAFETY: free list management is Admin/Super Admin only', () => {
  assert.match(route, /phone_free_pass_admin_required/);
  assert.match(nav, /key:'phone_free_pass'/);
  assert.match(nav, /phone_free_pass:\s*isAdminLike/);
});

test('SAFETY: kiosk UI visibly distinguishes free pickup from a submitted pass', () => {
  assert.match(kioskUi, /FREE PHONE PICKUP/);
  assert.match(kioskUi, /free_pickup/);
});

test('SAFETY: modular route is intercepted before legacy fallback', () => {
  assert.match(index, /PHONE_FREE_PASS_PATHS/);
  assert.ok(index.indexOf('PHONE_FREE_PASS_PATHS.has(path)') < index.indexOf('return baseWorker.fetch(req, env, ctx);'));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const legacyWorker = read('cf-redcake/red-cake-77d5/src/worker.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/phone-kiosk.js');
const service = read('cf-redcake/red-cake-77d5/src/services/phone-kiosk.js');
const html = read('student-scanner/phone-kiosk/index.html');
const js = read('student-scanner/phone-kiosk/phone-kiosk.js');
const sw = read('student-scanner/sw.js');

test('SAFETY: Phone Kiosk is modular and intercepted before legacy fallback', () => {
  assert.match(index, /PHONE_KIOSK_PATHS, handlePhoneKioskRequest/);
  const intercept = index.indexOf('PHONE_KIOSK_PATHS.has(path)');
  const fallback = index.indexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(intercept >= 0 && fallback >= 0 && intercept < fallback);
});

test('SAFETY: public kiosk writes require a paired device credential', () => {
  assert.match(route, /x-phone-kiosk/);
  assert.match(route, /authenticatePhoneKiosk/);
  assert.match(route, /const auth = await requireKiosk\(req, env\)/);
  assert.match(legacyWorker, /Access-Control-Allow-Headers[^\n]+x-phone-kiosk/);
});

test('SAFETY: pairing is Admin or Super Admin only and mutation guarded', () => {
  assert.match(route, /phone_kiosk_pair_forbidden/);
  assert.match(route, /mutationOriginAllowed\(req, env\)/);
  assert.match(route, /viewAsReadOnlyResponse/);
});

test('SAFETY: no-request students cannot enter a phone mutation flow', () => {
  assert.match(service, /if \(flow === 'none'\)/);
  const noneBlock = service.slice(service.indexOf("if (flow === 'none')"), service.indexOf('const locker = publicLocker', service.indexOf("if (flow === 'none')")));
  assert.doesNotMatch(noneBlock, /grantPhonePass|confirmPhoneReturn|markPhoneKioskLocation|notifyOfficeStaffForFlow/);
});

test('SAFETY: pickup and return confirmation revalidate authoritative current state', () => {
  assert.match(service, /const currentFlow = deriveFlow\(context\.state \|\| \{\}\)/);
  assert.match(service, /if \(currentFlow !== requestedFlow\)/);
  assert.match(service, /phone_kiosk_state_changed/);
});

test('SAFETY: kiosk reuses existing Phone Pass mutations instead of creating a parallel phone state', () => {
  assert.match(service, /grantPhonePass\(env, modeInfo, actor/);
  assert.match(service, /confirmPhoneReturn\(env, modeInfo, actor/);
  assert.doesNotMatch(service, /action:\s*['"](?:pickup|return)['"]/);
});

test('SAFETY: live location changes only after staff confirmation and uses Main Office Phone Locker', () => {
  assert.match(service, /Main Office \/ Phone Locker/);
  assert.match(service, /main_office_phone_locker/);
  assert.match(service, /location_evidence:\s*true/);
  assert.match(service, /phone_kiosk_\$\{requestedFlow\}_confirmed/);
  const startBlock = service.slice(service.indexOf('export async function startPhoneKioskFlow'), service.indexOf('export async function confirmPhoneKioskFlow'));
  assert.doesNotMatch(startBlock, /markPhoneKioskLocation/);
});

test('SAFETY: office notification contains locker only, never student identity', () => {
  const notifyStart = service.indexOf('async function notifyOfficeStaffForFlow');
  const notifyEnd = service.indexOf('function deriveFlow', notifyStart);
  const notifyBlock = service.slice(notifyStart, notifyEnd);
  assert.match(service, /const OFFICE_STAFF_ALLOWLIST_KEY = 'office_staff_allowlist_v1'/);
  assert.match(service, /loadOfficeStaffEmails/);
  assert.match(notifyBlock, /body: lockerNotificationText\(locker\)/);
  assert.doesNotMatch(notifyBlock, /student_name|student\.name|name:/);
});

test('SAFETY: Practice Mode does not send live office notifications', () => {
  assert.match(service, /if \(modeInfo\?\.practice\)/);
  assert.match(service, /reason: 'practice_mode'/);
});

test('SAFETY: kiosk does not replace the existing admin Phone Pass fallback', () => {
  assert.match(index, /PHONE_PASS_PATHS\.has\(path\)/);
  assert.match(html, /Phone Pass Kiosk/);
  assert.match(js, /\/phone-kiosk\/confirm/);
});

test('SAFETY: staff confirmation requires press-and-hold on the kiosk UI', () => {
  assert.match(js, /const HOLD_MS = 1250/);
  assert.match(js, /pointerdown/);
  assert.match(js, /Date\.now\(\) - holdStartedAt >= HOLD_MS/);
});

test('SAFETY: Phone Kiosk shell and assets bypass stale service-worker cache', () => {
  assert.match(sw, /url\.pathname\.includes\('\/phone-kiosk\/'\)/);
});

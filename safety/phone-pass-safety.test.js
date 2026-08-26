const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const index = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/index.js'), 'utf8');
const route = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/phone-pass.js'), 'utf8');
const service = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/phone-pass.js'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const earlyDismissalRoute = fs.readFileSync(path.join(ROOT, 'cf-redcake/red-cake-77d5/src/routes/early-dismissal.js'), 'utf8');

test('all operational Phone Pass paths are intercepted before legacy fallback', () => {
  for (const endpoint of ['options','context','mine','active','grant','send_to_return','return']) {
    assert.match(route, new RegExp(`/admin/phone_pass/${endpoint.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
  }
  assert.match(index, /PHONE_PASS_PATHS\.has\(path\)/);
  assert.match(index, /handlePhonePassRequest\(req, env, ctx\)/);
});

test('Phone Pass writes retain origin and View-as mutation guards', () => {
  assert.match(route, /mutationOriginAllowed\(req, env\)/);
  assert.match(route, /viewAsReadOnlyResponse\(response, access\)/);
  assert.match(route, /const guard = mutationGuard\(req, env, base\.response, base\.data\)/);
});

test('shared Teacher Attendance permissions and Ops-only final return are preserved', () => {
  assert.match(route, /requestSource === 'teacher_attendance'/);
  assert.match(route, /viaTeacherAttendance/);
  assert.match(route, /viaPhonePassPage/);
  assert.match(route, /canGrantPhonePass\(env, who\.email\)/);
  assert.match(route, /phone_out_by_email/);
  assert.match(route, /phone_pass_send_back_not_owner/);
  assert.match(route, /canReturnPhonePass\(env, who\.email\)/);
  assert.match(route, /error: 'hallway_monitor_forbidden'/);
  assert.match(route, /context[\s\S]{0,650}any authenticated staff member/);
});

test('Practice mode uses isolated StudentLocation, log buffer, audit, and scan records', () => {
  assert.match(service, /studentViewOperationalDoName\(modeInfo, 'GLOBAL'\)/);
  assert.match(service, /studentViewOperationalDoName\(modeInfo, `LOG:\$\{date\}`/);
  assert.match(service, /`\$\{PRACTICE_KV_PREFIX\}\$\{date\}:practice_record:scan:/);
  assert.match(service, /expirationTtl: PRACTICE_KV_TTL_SEC/);
  assert.match(service, /reason: 'practice_mode'/);
  assert.match(route, /!modeInfo\?\.practice/);
});

test('phone return notifications use the extracted shared push service and remain privacy-safe', () => {
  assert.match(service, /sendPushCategoryToEmails/);
  assert.match(service, /PUSH_CATEGORY_PHONE_RETURN_REQUESTS/);
  assert.match(service, /body: 'A student has been sent to return a phone\. Tap to open Phone Pass\.'/);
  assert.doesNotMatch(service, /body:\s*`[^`]*\$\{studentName\}/);
});

test('legacy Phone Pass implementation remains dormant for rollback during the smoke phase', () => {
  assert.match(worker, /path === "\/admin\/phone_pass\/grant"/);
  assert.match(worker, /path === "\/admin\/phone_pass\/return"/);
});


test('Early Dismissal consumes extracted Phone Pass context directly', () => {
  assert.match(earlyDismissalRoute, /import \{ getPhonePassContext \} from '\.\.\/services\/phone-pass\.js';/);
  assert.match(earlyDismissalRoute, /getPhonePassContext\(env, modeInfo,/);
  assert.doesNotMatch(earlyDismissalRoute, /baseWorker\.fetch\(new Request\(url\.toString\(\),[\s\S]{0,200}phone_pass\/context/);
});

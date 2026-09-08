const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const nav = read('student-scanner/admin/nav.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/esas.js');
const service = read('cf-redcake/red-cake-77d5/src/services/esas.js');
const durable = read('cf-redcake/red-cake-77d5/src/durable-objects/esas.js');
const scanner = read('student-scanner/index.html');
const visitor = read('student-scanner/visitor/index.html');

function block(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `could not isolate ${startNeedle}`);
  return source.slice(start, end);
}

test('SAFETY: emergency takeover requires fresh authenticated server status and never trusts a local-only flag', () => {
  const guard = block(nav, 'async function refreshEsasTakeover', 'function renderSystemModeBanner');
  assert.match(guard, /adminFetch\('\/admin\/esas\/status'/);
  assert.match(guard, /r\.ok/);
  assert.match(guard, /j\?\.ok/);
  assert.match(guard, /j\.active === true/);
  assert.match(guard, /incident_id/);
  assert.doesNotMatch(guard, /localStorage\.getItem|sessionStorage\.getItem/);
});

test('SAFETY: visitor, scanner, student/public surfaces are not hijacked by the shared admin takeover guard', () => {
  assert.match(nav, /return isEsasPage\(\) \|\| isVisitorPage\(\)/);
  assert.doesNotMatch(scanner, /admin\/nav\.js|\.\/admin\/nav\.js/);
  assert.doesNotMatch(visitor, /admin\/nav\.js|\.\/admin\/nav\.js/);
});

test('SAFETY: ESAS activation push contains no student PII and push failure cannot roll back activation', () => {
  const pushBlock = block(route, 'async function dispatchActivationPush', 'async function handleStatus');
  assert.match(pushBlock, /sendPushToEmails/);
  assert.match(pushBlock, /Emergency Student Accountability is active\. Open EagleNEST now\./);
  assert.doesNotMatch(pushBlock, /student\.name|student_name|osis|expected_room|expected_course/);
  const activateBlock = block(route, 'async function handleActivate', 'async function handleMyRoster');
  assert.match(activateBlock, /if \(result\.ok\)/);
  assert.match(activateBlock, /result\.push_dispatch = await dispatchActivationPush/);
  assert.match(pushBlock, /\.catch\(async \(error\) =>/);
});

test('SAFETY: ending ESAS requires exact incident id, exact current unaccounted count, and explicit force when unresolved students remain', () => {
  assert.match(durable, /requestedId !== String\(active\.incident_id/);
  assert.match(durable, /confirmedUnaccounted !== countsBeforeEnd\.unaccounted/);
  assert.match(durable, /countsBeforeEnd\.unaccounted > 0 && body\?\.force_with_unaccounted !== true/);
  assert.match(durable, /unaccounted_count_changed/);
  assert.match(durable, /unaccounted_students_remain/);
  assert.match(service, /confirm_unaccounted:\s*confirmed/);
  assert.match(service, /force_with_unaccounted:\s*forceWithUnaccounted === true/);
});

test('SAFETY: archived ESAS student summary is manager-only and full archive retention remains bounded', () => {
  const archiveBlock = block(route, 'async function handleArchive', 'async function handleAccount');
  assert.match(archiveBlock, /authenticated/);
  assert.match(archiveBlock, /manageOnly/);
  assert.match(service, /ESAS_ARCHIVE_TTL_SEC = 90 \* 24 \* 60 \* 60/);
  assert.match(service, /final_unaccounted/);
  assert.match(service, /ESAS_ARCHIVE_SUMMARY_MAX_UNACCOUNTED = 500/);
});

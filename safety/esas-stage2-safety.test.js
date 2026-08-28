const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const route = read('cf-redcake/red-cake-77d5/src/routes/esas.js');
const service = read('cf-redcake/red-cake-77d5/src/services/esas.js');
const durable = read('cf-redcake/red-cake-77d5/src/durable-objects/esas.js');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');

const stage2Paths = [
  '/admin/esas/my_roster',
  '/admin/esas/search',
  '/admin/esas/account',
  '/admin/esas/unaccounted'
];

test('SAFETY: ESAS Stage 2 APIs remain modular before legacy fallback', () => {
  for (const endpoint of stage2Paths) assert.ok(route.includes(endpoint), `missing ${endpoint}`);
  assert.ok(index.indexOf('ESAS_PATHS.has(path)') < index.indexOf('return baseWorker.fetch(req, env, ctx);'));
  assert.doesNotMatch(route, /worker\.js|baseWorker/);
  for (const endpoint of stage2Paths) assert.ok(!worker.includes(`path === "${endpoint}"`));
});

test('SAFETY: activation snapshot fails inclusive and excludes only explicit current-day off-campus state', () => {
  assert.match(service, /explicitOffCampusState/);
  assert.match(service, /String\(live\.date \|\| ''\) !== String\(date \|\| ''\)/);
  assert.match(service, /zone !== 'off_campus' && !seniorOut/);
  assert.match(service, /student_location_unavailable_no_students_excluded/);
  assert.doesNotMatch(service, /never scanned|missing scan|no scan today/i);
});

test('SAFETY: student snapshot minimizes data and freezes assignment context at activation', () => {
  assert.match(service, /ROSTER_KEY = 'roster_v1'/);
  assert.match(service, /CLASSES_KEY = 'student_classes_v1'/);
  assert.match(service, /TEACHER_ASSIGNMENTS_KEY = 'teacher_assignments_v1'/);
  assert.match(service, /ACADEMIC_ROSTER_KEY = 'academic_roster_v1'/);
  assert.match(service, /expected_teacher_emails/);
  assert.doesNotMatch(service, /student_email:/);
  assert.doesNotMatch(durable, /student_email/);
});

test('SAFETY: all student accounting mutations retain origin and View-as guards', () => {
  assert.match(route, /handleAccount[\s\S]*mutationGuard/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(durable, /incident_mismatch/);
  assert.match(durable, /account_undo_not_allowed/);
});

test('SAFETY: unaccounted/search/my roster are authenticated staff reads while incident management stays restricted', () => {
  const unaccountedStart = route.indexOf('async function handleUnaccounted');
  const accountStart = route.indexOf('async function handleAccount', unaccountedStart);
  const unaccountedBlock = route.slice(unaccountedStart, accountStart);
  assert.match(unaccountedBlock, /authenticated/);
  assert.doesNotMatch(unaccountedBlock, /manageOnly/);
  assert.match(route, /handleMyRoster[\s\S]*authenticated/);
  assert.match(route, /handleSearch[\s\S]*authenticated/);
  assert.match(route, /handleActivate[\s\S]*manageOnly/);
  assert.match(route, /handleEnd[\s\S]*manageOnly/);
});

test('SAFETY: accounting an initially off-campus student promotes them into effective expected population', () => {
  assert.match(durable, /if \(student\.initial_expected !== true\) student\.included_override = true/);
  assert.match(durable, /promoted_from_off_campus/);
  assert.match(durable, /effectiveExpected/);
});

test('SAFETY: ended student-level ESAS archives have bounded retention and DO full record purges only after archive confirmation', () => {
  assert.match(service, /ESAS_ARCHIVE_TTL_SEC = 90 \* 24 \* 60 \* 60/);
  assert.match(service, /expirationTtl: ESAS_ARCHIVE_TTL_SEC/);
  assert.match(service, /archive-complete/);
  assert.match(durable, /path === '\/archive-complete'/);
});

test('SAFETY: ESAS Stage 2 still has no attendance, GAS, PowerSchool, redirect, or push side effects', () => {
  const combined = `${route}\n${service}\n${durable}`;
  assert.doesNotMatch(combined, /pushFinalToGAS|WORKER_PUSH_URL|PowerSchool|FIDELITY_GAS_URL|BEHAVIOR_GAS_URL/);
  assert.doesNotMatch(combined, /location\.replace|window\.location|showNotification|push\/subscribe/);
  assert.match(worker, /path === "\/admin\/teacher_att\/submit"/);
  assert.match(worker, /async function pushFinalToGAS/);
});

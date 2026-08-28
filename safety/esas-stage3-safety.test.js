const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const html = read('admin/esas.html');
const js = read('admin/esas.js');
const sw = read('sw.js');
const route = fs.readFileSync(path.resolve(ROOT, '..', 'cf-redcake/red-cake-77d5/src/routes/esas.js'), 'utf8');

test('SAFETY: Stage 3 does not introduce global emergency takeover or push activation', () => {
  assert.doesNotMatch(js, /location\.replace|window\.location\s*=|location\.assign/);
  assert.doesNotMatch(js, /showNotification|PushManager|push\/subscribe/);
  assert.doesNotMatch(sw, /esas/i);
});

test('SAFETY: Stage 3 account writes keep exact incident id and use the existing guarded endpoint', () => {
  assert.match(js, /incident_id:\s*incidentId/);
  assert.match(js, /\/admin\/esas\/account/);
  assert.match(route, /handleAccount[\s\S]*mutationGuard/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(js, /isViewAsReadOnly/);
  assert.match(js, /Read Only/);
});

test('SAFETY: Stage 3 never treats a failed write as a successful accounting action', () => {
  const post = js.indexOf("await getJson('/admin/esas/account'");
  const confirmed = js.indexOf('mergeStudentIntoLists(result.student)');
  const failure = js.indexOf('Accountability update failed');
  assert.ok(post >= 0 && confirmed > post && failure > post);
  assert.doesNotMatch(js.slice(0, post), /accounted\s*=\s*true/);
});

test('SAFETY: every authenticated staff page receives the live whole-school unaccounted read', () => {
  assert.match(js, /getJson\('\/admin\/esas\/unaccounted'/);
  assert.doesNotMatch(js, /if \(canManage\(\)\) requests\.push\(getJson\('\/admin\/esas\/unaccounted'/);
  assert.match(js, /tabOps\.hidden = false/);
  assert.doesNotMatch(js, /tabOps\.hidden = !canManage\(\)/);
  const unaccountedStart = route.indexOf('async function handleUnaccounted');
  const accountStart = route.indexOf('async function handleAccount', unaccountedStart);
  const unaccountedBlock = route.slice(unaccountedStart, accountStart);
  assert.match(unaccountedBlock, /authenticated/);
  assert.doesNotMatch(unaccountedBlock, /manageOnly/);
});

test('SAFETY: ESAS page explicitly distinguishes live emergency state from Practice Mode', () => {
  assert.match(html, /live emergency control-plane feature even when EagleNEST Practice Mode is active/i);
  assert.match(js, /\/admin\/esas\/status/);
});

test('SAFETY: no student data is persisted by the Stage 3 page into browser storage', () => {
  assert.doesNotMatch(js, /localStorage\.setItem\([^,]+,\s*JSON\.stringify\(.*student/is);
  assert.doesNotMatch(js, /sessionStorage\.setItem\([^,]+,\s*JSON\.stringify\(.*student/is);
  assert.match(js, /setStoredAdminSessionSid/);
});

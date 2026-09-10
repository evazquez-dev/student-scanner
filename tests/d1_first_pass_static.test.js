const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

test('D1 route intercepts all live communication consumers before legacy GAS routes', () => {
  const index = read('cf-redcake/red-cake-77d5/src/index.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/communications-d1.js');
  assert.match(index, /COMMUNICATIONS_D1_PATHS/);
  assert.ok(index.indexOf('COMMUNICATIONS_D1_PATHS.has(path)') < index.indexOf('REQUIRED_COMMUNICATION_PATHS.has(path)'));
  for (const endpoint of [
    '/admin/communications/create',
    '/admin/communications/student',
    '/admin/communications/category',
    '/admin/communications/dashboard',
    '/admin/communications/followup/resolve',
    '/admin/required_communications/coverage',
    '/admin/attendance_outreach'
  ]) assert.match(route, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(route, /BEHAVIOR_GAS_URL/);
});

test('D1 migrations create communications, immutable audit, behavior shadow, and useful indexes', () => {
  const communications = read('cf-redcake/red-cake-77d5/migrations/0001_communications.sql');
  const behavior = read('cf-redcake/red-cake-77d5/migrations/0002_behavior_shadow.sql');
  assert.match(communications, /CREATE TABLE IF NOT EXISTS communications/);
  assert.match(communications, /CREATE TABLE IF NOT EXISTS communication_audit/);
  assert.match(communications, /ux_communications_submission_id/);
  assert.match(communications, /ix_communications_student_date/);
  assert.match(behavior, /CREATE TABLE IF NOT EXISTS behavior_events/);
  assert.match(behavior, /CREATE TABLE IF NOT EXISTS behavior_audit/);
  assert.match(behavior, /origin_system TEXT NOT NULL DEFAULT 'google_sheet_shadow'/);
});

test('behavior remains live on GAS while D1 is shadow-only in first pass', () => {
  const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
  const d1Route = read('cf-redcake/red-cake-77d5/src/routes/communications-d1.js');
  const d1Admin = read('cf-redcake/red-cake-77d5/src/routes/d1-admin.js');
  assert.match(worker, /if \(path === "\/admin\/behavior\/log"\)/);
  assert.match(worker, /action: behaviorAction/);
  assert.doesNotMatch(d1Route, /\/admin\/behavior\/log/);
  assert.match(d1Admin, /production_behavior_storage:'google_sheet'/);
  assert.match(d1Admin, /d1_role:'shadow_only'/);
});

test('communication forms send stable client submission IDs for retry idempotency', () => {
  const contacts = read('student-scanner/admin/student_contacts.js');
  const outreach = read('student-scanner/admin/attendance_outreach.js');
  assert.match(contacts, /D1_COMMUNICATION_SUBMISSION_V1/);
  assert.match(contacts, /submission_id:\s*communicationSubmissionId/);
  assert.match(outreach, /D1_ATTENDANCE_CALL_SUBMISSION_V1/);
  assert.match(outreach, /submission_id:\s*ACTIVE_CALL_SUBMISSION_ID/);
});

test('bootstrap refuses normal verify/deploy until EAGLENEST_DB binding is configured', () => {
  const pkg = JSON.parse(read('cf-redcake/red-cake-77d5/package.json'));
  const verify = String(pkg.scripts?.verify || '');
  const checker = read('cf-redcake/red-cake-77d5/tools/check-d1-config.mjs');
  // Preserve the repository's existing deployment safety contract.
  assert.equal(pkg.scripts?.predeploy, 'npm run verify');
  assert.equal(pkg.scripts?.deploy, 'wrangler deploy');
  assert.match(verify, /check:d1-config/);
  assert.match(checker, /EAGLENEST_DB/);
  assert.match(checker, /EAGLENEST_D1_BOOTSTRAP_PENDING/);
  assert.match(read('cf-redcake/red-cake-77d5/tools/eaglenest_d1.py'), /d1.*migrations.*apply/s);
});

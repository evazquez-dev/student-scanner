const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('social work referrals use dedicated D1 tables and note linkage', () => {
  const sql = read('cf-redcake/red-cake-77d5/migrations/0015_social_work_referrals.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS social_work_referrals/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS social_work_referral_events/);
  assert.match(sql, /submission_id TEXT NOT NULL UNIQUE/);
  assert.match(sql, /ADD COLUMN related_referral_id/);
});

test('signed ingest endpoint requires HMAC timestamp and dedicated Worker secret', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/social-work-referrals.js');
  assert.match(route, /SOCIAL_WORK_REFERRAL_INGEST_SECRET/);
  assert.match(route, /x-eaglenest-timestamp/);
  assert.match(route, /x-eaglenest-signature/);
  assert.match(route, /HMAC/);
  assert.match(route, /5\*60\*1000/);
});

test('referral ingest revalidates student and staff against current EagleNEST rosters', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/social-work-referrals.js');
  assert.match(service, /academic_roster_v1/);
  assert.match(service, /student_not_in_current_roster/);
  assert.match(service, /referrer_not_in_current_staff_roster/);
  assert.match(service, /staff_name_mismatch/);
});

test('social work referrals are restricted to Social Work counselor capability', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/social-work-referrals.js');
  assert.match(route, /counselor_social_work/);
  assert.doesNotMatch(route, /counselor_college === true/);
  assert.doesNotMatch(route, /counselor_academic === true/);
});

test('safety-related reasons are flagged without replacing emergency procedure', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/social-work-referrals.js');
  const ui = read('student-scanner/admin/social_work_referrals.js');
  assert.match(service, /self\[\\s-\]\*harm|self/);
  assert.match(service, /reported\\s\+abuse|abuse/);
  assert.match(ui, /existing immediate emergency\/reporting procedure/);
});

test('Social Work dashboard gets queue, assignment, statuses, and counseling-note linkage', () => {
  const ui = read('student-scanner/admin/social_work_referrals.js');
  const dashboard = read('student-scanner/admin/counselor_dashboard.js');
  const html = read('student-scanner/admin/counselor_dashboard.html');
  const counselor = read('cf-redcake/red-cake-77d5/src/services/counselor-notes.js');
  assert.match(html, /social_work_referrals\.js/);
  assert.match(ui, /Support Requests/);
  assert.match(ui, /Assign to me/);
  assert.match(ui, /Student Seen \/ Add Social Work Note/);
  assert.match(dashboard, /related_referral_id/);
  assert.match(counselor, /related_referral_id/);
});

test('response-sheet Apps Script uses installable form submit and signed ingest', () => {
  const gas = read('Google Apps Script/social-work-referral-response-bound/SocialWorkReferralEagleNest.js');
  assert.match(gas, /forSpreadsheet\(ss\)/);
  assert.match(gas, /\.onFormSubmit\(\)/);
  assert.match(gas, /x-eaglenest-signature/);
  assert.match(gas, /computeHmacSha256Signature/);
  assert.match(gas, /gform-sheet:/);
  assert.match(gas, /9th Grade Student/);
  assert.match(gas, /12th Grade Student/);
});

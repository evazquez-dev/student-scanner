const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const worker = fs.readFileSync(path.join(root, 'cf-redcake', 'red-cake-77d5', 'src', 'worker.js'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'Google Apps Script', 'clasp-projects', 'behavioral-endpoint', 'Code.js'), 'utf8');
const contacts = fs.readFileSync(path.join(root, 'student-scanner', 'admin', 'student_contacts.js'), 'utf8');
const outreach = fs.readFileSync(path.join(root, 'student-scanner', 'admin', 'attendance_outreach.js'), 'utf8');

test('Worker uses EagleNEST relationship tiers instead of PowerSchool priority as primary ordering', () => {
  assert.match(worker, /EAGLENEST_CONTACT_RECOMMENDATION_RANKING_V1/);
  assert.match(worker, /mother.*father/s);
  assert.match(worker, /grandmother.*grandfather/s);
  assert.match(worker, /aunt.*uncle/s);
  assert.match(worker, /sister.*brother/s);
  assert.match(worker, /neighbor.*friend/s);
  assert.match(worker, /contactRecommendationCompare_/);
  assert.match(worker, /eaglenest_rank/);
  assert.match(worker, /eaglenest_tier_label/);

  const comparator = worker.slice(worker.indexOf('function contactRecommendationCompare_'), worker.indexOf('function contactCacheApplyRecord_'));
  assert.ok(comparator.indexOf('contactActiveForRecommendation_') < comparator.indexOf('contactRelationshipTier_'), 'active status should be considered before relationship tier');
  assert.ok(comparator.indexOf('contactRelationshipTier_') < comparator.indexOf('contactUsablePhone_'), 'relationship tier should precede phone/email usefulness');
  assert.ok(comparator.indexOf('contactUsablePhone_') < comparator.indexOf('contactPsPriority_'), 'PowerSchool priority must remain only a late tiebreaker');
});

test('Behavioral GAS fallback returns the same recommendation ordering contract', () => {
  assert.match(gas, /EAGLENEST_CONTACT_RECOMMENDATION_RANKING_V1/);
  assert.match(gas, /contactHubRecommendationCompare_/);
  assert.match(gas, /eaglenest_rank/);
  assert.match(gas, /eaglenest_tier_label/);
  assert.doesNotMatch(
    gas.slice(gas.indexOf('function contactHubListStudent_'), gas.indexOf('function contactHubGetStatusValue_')),
    /contacts\.sort\(\(a,b\) => Number\(a\.contact_priority/
  );
});

test('Student Contacts shows recommendation order and keeps PowerSchool priority as source metadata', () => {
  assert.match(contacts, /Recommended #\$\{esc\(recommendedRank\)\}/);
  assert.match(contacts, /PS priority/);
  assert.match(contacts, /eaglenest_tier_label/);
  assert.doesNotMatch(contacts, /<div class="priority">Priority \$\{esc\(contact\.contact_priority/);
});

test('Attendance Outreach consumes recommendation order and prefers the highest-ranked reachable contact', () => {
  assert.match(outreach, /eaglenest_rank/);
  assert.match(outreach, /Recommended #/);
  assert.match(outreach, /firstPhoneKey/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('conference route exposes authorized leadership reporting without changing write permissions', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/family-conferences.js');
  assert.match(route, /conferenceReportingEventIds/);
  assert.match(route, /availableConferenceReportingScopes/);
  assert.match(route, /requested_scope:\s*url\.searchParams\.get\('scope'\)/);
  assert.match(route, /can_act_all:\s*canViewAllConferenceLanes/);
  assert.doesNotMatch(route, /canViewAllConferenceLanes\s*=\s*isAdmin\s*\|\|\s*bookingProxy\s*\|\|/);
});

test('conference requirement bundle filters snapshotted advisees by reporting scope', () => {
  const req = read('cf-redcake/red-cake-77d5/src/services/conference-requirements.js');
  const leadership = read('cf-redcake/red-cake-77d5/src/services/conference-leadership.js');
  assert.match(req, /resolveConferenceReportingScope/);
  assert.match(req, /filterConferenceRequirementRows/);
  assert.match(req, /can_manage:/);
  assert.match(leadership, /type:'grade'/);
  assert.match(leadership, /type:'department'/);
  assert.match(leadership, /advisor_email/);
  assert.match(leadership, /conference_required_students/);
});

test('report-only leaders can open relevant conference events but do not receive booking arrays', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/family-conferences.js');
  assert.match(service, /allowReportRead/);
  assert.match(service, /reportOnly/);
  assert.match(service, /slots:\s*reportOnly\s*\?\s*\[\]\s*:\s*slots/);
  assert.match(service, /bookings:\s*reportOnly\s*\?\s*\[\]\s*:\s*bookings/);
});

test('conference UI renders scope selector, advisor summary, and read-only leadership rows', () => {
  const html = read('student-scanner/admin/conferences.html');
  const js = read('student-scanner/admin/conferences-leadership.js');
  const base = read('student-scanner/admin/conferences.js');
  assert.match(html, /conferences-leadership\.js\?v=20261001-v1/);
  assert.match(html, /id="conferenceBookingTools"/);
  assert.match(html, /id="conferenceScheduleCard"/);
  assert.match(js, /requirementReportingScopeSelect/);
  assert.match(js, /Family reached/);
  assert.match(js, /Leadership view/);
  assert.match(js, /row\?\.can_manage/);
  assert.match(base, /EagleNESTConferenceReporting\?\.currentScope/);
});

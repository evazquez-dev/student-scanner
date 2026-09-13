const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('required advisee conference migration creates stable requirement snapshot tables', () => {
  const sql = read('cf-redcake/red-cake-77d5/migrations/0012_conference_required_advisees.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS conference_requirements/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS conference_required_students/);
  assert.match(sql, /advisor_email/);
});

test('required advisee service uses stable advisor roster and existing communications D1', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/conference-requirements.js');
  assert.match(service, /student_classes_v1/);
  assert.match(service, /advisor_roster/);
  assert.match(service, /StableAdvisoryRoster/);
  assert.match(service, /createCommunicationD1/);
  assert.match(service, /conference_scheduler:/);
  assert.match(service, /category:\s*'General'/);
});

test('conference routes expose advisor options, roster snapshot, progress, and one-step outreach', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/family-conferences.js');
  assert.match(route, /\/admin\/conferences\/advisor_options/);
  assert.match(route, /\/admin\/conferences\/requirements\/snapshot/);
  assert.match(route, /\/admin\/conferences\/engagement\/log/);
  assert.match(route, /getConferenceRequirementBundle/);
  assert.match(route, /logConferenceCommunication/);
});

test('conference UI has required advisee teacher workflow and admin progress dashboard', () => {
  const html = read('student-scanner/admin/conferences.html');
  const js = read('student-scanner/admin/conferences-required.js');
  assert.match(html, /conferences-required\.js/);
  assert.match(js, /My required advisees/);
  assert.match(js, /Advisor progress/);
  assert.match(js, /Contact \/ Book/);
  assert.match(js, /Student Contacts/);
  assert.match(js, /Select all advisors/);
  assert.match(js, /\/admin\/conferences\/engagement\/log/);
});

test('required advisee enhancement keeps family outreach disabled', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/family-conferences.js');
  const js = read('student-scanner/admin/conferences-required.js');
  assert.doesNotMatch(route, /\/public\//);
  assert.doesNotMatch(route, /sendEmail|sendSms|ParentSquare/i);
  assert.match(js, /Nothing is sent to the family automatically/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('family conferences use dedicated D1 tables with active-booking collision protection', () => {
  const migration = read('cf-redcake/red-cake-77d5/migrations/0011_family_conferences.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS conference_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS conference_slots/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS conference_bookings/);
  assert.match(migration, /ux_conference_active_booking_slot/);
  assert.match(migration, /ux_conference_active_booking_student/);
});

test('conference API is authenticated and family outreach remains disabled in Phase 1', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/family-conferences.js');
  const service = read('cf-redcake/red-cake-77d5/src/services/family-conferences.js');
  const index = read('cf-redcake/red-cake-77d5/src/index.js');
  assert.match(route, /loadBaseAccess/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(route, /conference_admin_required/);
  assert.match(index, /FAMILY_CONFERENCE_PATHS/);
  assert.match(service, /family_booking_enabled:\s*false/);
  assert.match(service, /outbound_enabled:\s*false/);
  assert.doesNotMatch(route, /\/public\//);
  assert.doesNotMatch(route, /MailApp|GmailApp|sendEmail|Twilio|ParentSquare/i);
});

test('conference frontend supports staff booking and a non-functional family preview', () => {
  const html = read('student-scanner/admin/conferences.html');
  const js = read('student-scanner/admin/conferences.js');
  assert.match(html, /Book a family/);
  assert.match(html, /Family experience preview/);
  assert.match(html, /no family booking link exists/i);
  assert.match(js, /\/admin\/conferences\/booking\/create/);
  assert.match(js, /\/admin\/roster\/search/);
  assert.match(js, /\/admin\/contacts\/student/);
  assert.match(js, /STAFF PREVIEW — NOT SENT TO FAMILIES/);
  assert.doesNotMatch(js, /sendEmail|sendSms|parentsquare/i);
});

test('Student Contacts deep-links a selected family into conference scheduling', () => {
  const js = read('student-scanner/admin/student_contacts.js');
  assert.match(js, /Book conference/);
  assert.match(js, /conferences\.html/);
  assert.match(js, /contact_assoc_id/);
});

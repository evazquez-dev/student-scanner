const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('contact language has a persistent D1 schema independent of PowerSchool', () => {
  const migration = read('cf-redcake/red-cake-77d5/migrations/0005_contact_languages.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS contact_language_preferences/);
  assert.match(migration, /confirmation_count/);
  assert.match(migration, /required_confirmations/);
  assert.match(migration, /contact_language_audit/);
});

test('canonical Worker intercepts contact language routes before legacy fallback', () => {
  const index = read('cf-redcake/red-cake-77d5/src/index.js');
  assert.match(index, /CONTACT_LANGUAGE_PATHS/);
  assert.match(index, /handleContactLanguageRequest/);
  assert.ok(index.indexOf('CONTACT_LANGUAGE_PATHS.has(path)') < index.indexOf('return baseWorker.fetch(req, env, ctx)'));
});

test('communications snapshot current preferred language', () => {
  const comms = read('cf-redcake/red-cake-77d5/src/services/communications-d1.js');
  const language = read('cf-redcake/red-cake-77d5/src/services/contact-language.js');
  assert.match(comms, /attachContactLanguageSnapshot/);
  assert.match(language, /snapshot\.preferred_language/);
  assert.match(language, /required_confirmations:\s*preference\.required_confirmations/);
});

test('ParentSquare import treats English as default-unverified and protects staff confirmations', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/contact-language.js');
  assert.match(service, /parentsquare_default_unverified/);
  assert.match(service, /parentsquare_nondefault/);
  assert.match(service, /skipped_existing_staff/);
  assert.match(service, /ambiguous_contact_match/);
});

test('Student Contacts and Attendance Outreach load the shared language UI', () => {
  const contacts = read('student-scanner/admin/student_contacts.html');
  const outreach = read('student-scanner/admin/attendance_outreach.html');
  const ui = read('student-scanner/admin/contact_language.js');
  assert.match(contacts, /contact_language\.js/);
  assert.match(outreach, /contact_language\.js/);
  assert.match(ui, /first 3 communications/i);
  assert.match(ui, /could not confirm it this time/i);
  assert.match(ui, /Import ParentSquare Languages/);
});

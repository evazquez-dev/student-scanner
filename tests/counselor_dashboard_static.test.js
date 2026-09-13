const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('counselor dashboard uses dedicated D1 note and audit tables', () => {
  const sql = read('cf-redcake/red-cake-77d5/migrations/0013_counselor_dashboard.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS counselor_notes/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS counselor_note_audit/);
  assert.match(sql, /follow_up_status/);
  assert.match(sql, /ix_counselor_notes_student/);
});

test('counselor notes are separate from communications and audit edits', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/counselor-notes.js');
  assert.doesNotMatch(service, /createCommunicationD1|communications\s*\(/);
  assert.match(service, /counselor_note_audit/);
  assert.match(service, /followup_resolved/);
  assert.match(service, /followup_reopened/);
});

test('counselor routes require dedicated permission', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/counselor-notes.js');
  const session = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
  assert.match(route, /counselor_notes_forbidden/);
  assert.match(route, /base\.data\?\.can\?\.counselor_notes/);
  assert.match(session, /COUNSELOR_NOTES_ALLOWLIST_KEY/);
  assert.match(session, /counselor_notes_manage/);
  assert.match(session, /counselor_dashboard/);
});

test('counselor dashboard provides timeline, followups, student search and access management', () => {
  const html = read('student-scanner/admin/counselor_dashboard.html');
  const js = read('student-scanner/admin/counselor_dashboard.js');
  assert.match(html, /Counselor Dashboard/);
  assert.match(html, /Follow-ups/);
  assert.match(html, /Recent students/);
  assert.match(html, /Counselor Notes Access/);
  assert.match(js, /\/admin\/roster\/search/);
  assert.match(js, /\/admin\/counselor\/note\/create/);
  assert.match(js, /\/admin\/counselor\/note\/update/);
  assert.match(js, /\/admin\/counselor\/followup\/resolve/);
  assert.match(js, /\/admin\/counselor_notes_allowlist/);
});

test('student lookup exposes counselor notes only when permission exists', () => {
  const js = read('student-scanner/admin/student_view.js');
  assert.match(js, /access\?\.can\?\.counselor_notes/);
  assert.match(js, /counselor_dashboard\.html/);
  assert.match(js, /Counselor Notes/);
});

test('navigation exposes counselor dashboard through dedicated access capability', () => {
  const nav = read('student-scanner/admin/nav.js');
  const brand = read('student-scanner/admin/brand.js');
  assert.match(nav, /counselor_dashboard/);
  assert.match(brand, /counselor_dashboard/);
});

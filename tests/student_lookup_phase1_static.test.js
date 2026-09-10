const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const html = read('student-scanner/admin/student_view.html');
const js = read('student-scanner/admin/student_view.js');
const brand = read('student-scanner/admin/brand.js');
const adminSession = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');

test('Student View is presented as Student Lookup with universal search and current location', () => {
  assert.match(brand, /student_view:\s*'Student Lookup'/);
  assert.match(html, /<h1>Student Lookup<\/h1>/);
  assert.match(html, /Search by name, OSIS, or email/);
  assert.match(js, /\/admin\/roster\/search\?q=/);
  assert.match(html, /<h3>Current Location<\/h3>/);
  assert.match(js, /\/admin\/student\/dashboard\?osis=/);
});

test('Student Lookup is available to every authenticated staff access payload', () => {
  assert.match(adminSession, /student_view:\s*true,/);
  assert.doesNotMatch(js, /access\?\.can\?\.student_view\s*\|\|\s*access\?\.can\?\.super_admin/);
  assert.match(js, /Student Lookup is intentionally available to every authenticated EagleNEST staff account/);
});

test('Phase 1 exposes behavior and communication quick actions for a selected student', () => {
  assert.match(html, /id="logBehaviorBtn"[^>]*>Log Behavior<\/button>/);
  assert.match(html, /id="logCommunicationBtn"[^>]*>Log Communication<\/button>/);
  assert.match(js, /const BEHAVIOR_MENU_ENDPOINT = '\/admin\/behavior\/menu'/);
  assert.match(js, /const BEHAVIOR_LOG_ENDPOINT = '\/admin\/behavior\/log'/);
  assert.match(js, /source:'student_lookup'/);
  assert.match(js, /new URL\('\.\/student_contacts\.html'/);
  assert.doesNotMatch(js, /searchParams\.set\('action', 'log-communication'\)/);
  assert.match(js, /source', 'student_lookup'/);
});

test('Behavior logging reuses configured behavior menu and excludes Incident Creator from behavior choices', () => {
  assert.match(js, /options_by_submenu/);
  assert.match(js, /key === incidentLabel \|\| key === 'incident creator'/);
  assert.match(js, /eventKey:makeBehaviorEventKey\(submenu, option\)/);
  assert.match(html, /id="behaviorRoom"/);
  assert.match(html, /id="behaviorPeriod"/);
});

test('View As keeps Student Lookup readable but disables Phase 1 mutations', () => {
  assert.match(js, /function isViewAsReadOnly\(\)/);
  assert.match(js, /logBehaviorBtn\.disabled = !hasStudent \|\| readOnly/);
  assert.match(js, /logCommunicationBtn\.disabled = !hasStudent \|\| readOnly/);
  assert.match(html, /View As is read-only/);
});

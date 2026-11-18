// EAGLENEST_CONTACT_LANGUAGE_FASC_PANEL_FIX_V1 regression checks.
// Run from the student-scanner repository: node --test tests/contact_language_fasc_panel_static.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'admin', 'contact_language.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin', 'student_contacts.html'), 'utf8');

test('language panel anchors to the real Notes label, not a nested FaSC label', () => {
  assert.match(script, /document\.getElementById\('commNotes'\)\?\.closest\('label'\)/);
  assert.match(script, /notes\?\.parentElement === modal/);
  assert.doesNotMatch(script, /const notes = modal\?\.querySelector\('\.noteLabel'\)/);
});

test('missing language panel displays an error rather than silently swallowing save', () => {
  assert.match(script, /const panel = document\.getElementById\('contactLanguagePanel'\)/);
  assert.match(script, /if\(!panel\?\.isConnected \|\| panel\.hidden\)/);
  assert.match(script, /const error = document\.getElementById\('commError'\)/);
  assert.match(script, /error\.hidden = false/);
});

test('language verification remains required and attendance-outreach remains wired', () => {
  assert.match(script, /if\(save && !validateLanguageGate\(\)\)/);
  assert.match(script, /event\.stopImmediatePropagation\(\)/);
  assert.match(script, /else if\(pageModule === 'attendance_outreach'\)/);
});

test('student contacts uses fresh versioned language script', () => {
  assert.match(html, /contact_language\.js\?v=20261118-fasc-panel-fix-v1/);
});

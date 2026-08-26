const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/student_contacts.html'), 'utf8');
const helper = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/student_contacts_anonymous_call.js'), 'utf8');

test('Student Contacts anonymous calling is installed-app-only and prefixes dialer links with *67', () => {
  assert.match(html, /student_contacts_anonymous_call\.js/);
  assert.match(helper, /display-mode: standalone/);
  assert.match(helper, /navigator\?\.standalone === true/);
  assert.match(helper, /if \(!isInstalledStaffApp\(\)\) return/);
  assert.match(helper, /checkbox\.checked = false/);
  assert.ok(helper.includes('a[href^="tel:"]'));
  assert.match(helper, /tel:\*67\$\{digits\}/);
  assert.match(helper, /event\.preventDefault\(\)/);
});

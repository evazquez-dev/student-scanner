// EAGLENEST_STUDENT_LOOKUP_CONFERENCE_DATETIME_V1
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scannerRoot = fs.existsSync(path.resolve(__dirname, '..', 'admin', 'student_view.html'))
  ? path.resolve(__dirname, '..')
  : path.resolve(__dirname, '..', '..', 'student-scanner');
const read = (rel) => fs.readFileSync(path.join(scannerRoot, rel), 'utf8');

const html = read('admin/student_view.html');
const ui = read('admin/student_lookup_engagement.js');

assert.match(html, /id="engagementContactAt"[^>]*type="datetime-local"/);
assert.match(html, /Defaults to now\. Edit this when logging a conversation later\./);
assert.match(html, /student_lookup_engagement\.js\?v=20261001-conference-outreach-datetime-v1/);

assert.match(ui, /function localDateTimeValue\(/);
assert.match(ui, /function engagementContactAtIso\(/);
assert.match(ui, /\$\('engagementContactAt'\)\.value = localDateTimeValue\(\)/);
assert.match(ui, /const contactAtIso = engagementContactAtIso\(\)/);
assert.match(ui, /Choose a valid communication date and time\./);
assert.match(ui, /contact_at_iso:contactAtIso/);
assert.match(ui, /\/admin\/conferences\/engagement\/log/);

console.log('student_lookup_conference_datetime_static.test.js: PASS');

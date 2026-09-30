const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const html = read('student-scanner/admin/conferences.html');
const main = read('student-scanner/admin/conferences.js');
const required = read('student-scanner/admin/conferences-required.js');
const css = read('student-scanner/admin/conferences-required.css');
const anon = read('student-scanner/admin/student_contacts_anonymous_call.js');

test('conference contact selectors expose selected phone/email details', () => {
  assert.match(html, /id="bookingContactDetails"/);
  assert.match(required, /id="reqContactDetails"/);
  assert.match(main, /conferenceContactDetailsMarkup/);
  assert.match(main, /display\?\.\[field\]/);
  assert.match(main, /source\?\.\[field\]/);
  assert.match(main, /Phone/);
  assert.match(main, /Email/);
  assert.match(main, /renderBookingContactDetails/);
  assert.match(required, /renderRequirementContactDetails/);
  assert.match(required, /reqContactSelect.*change/s);
  assert.match(css, /\.conferenceContactDetails/);
});

test('conference page reuses installed-app anonymous-call utility and prefixes *67', () => {
  assert.match(html, /student_contacts_anonymous_call\.js/);
  assert.match(anon, /window\.EagleNESTAnonymousCall/);
  assert.match(anon, /isInstalledStaffApp/);
  assert.match(anon, /anonymousTelHref/);
  assert.match(anon, /tel:\*67\$\{digits\}/);
  assert.match(main, /EagleNESTAnonymousCall\?\.isInstalledStaffApp/);
  assert.match(main, /EagleNESTAnonymousCall\?\.anonymousTelHref/);
  assert.match(main, /Call anonymously/);
});

console.log('conference_contact_details_anonymous_call_static ok');

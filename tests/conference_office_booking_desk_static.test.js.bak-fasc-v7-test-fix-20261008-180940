const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const page = read('student-scanner/admin/conferences.js');
const html = read('student-scanner/admin/conferences.html');
const required = read('student-scanner/admin/conferences-required.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/family-conferences.js');

assert.match(page, /EAGLENEST_CONFERENCE_BOOKING_PROXY_V2/);
assert.match(page, /function isBookingDesk\(\)/);
assert.match(page, /conference_booking_proxy/);
assert.match(page, /conference_event_admin/);
assert.match(page, /Cancel \/ reschedule/);
assert.match(page, /canViewAllLanes\(\).*staff_email/s);

assert.match(html, /Conference Booking Proxy:/);
assert.match(html, /Conference Booking Proxies can choose any participating advisor or staff lane/i);

assert.match(required, /function reqIsBookingDesk\(\)/);
assert.match(required, /conference_booking_proxy/);
assert.match(required, /conference_event_admin/);
assert.match(required, /Conference booking desk/);
assert.match(required, /if\(!reqCanViewAll\(\)\)slots=slots\.filter/);

assert.match(route, /const bookingProxy = isConferenceBookingProxy\(access\) && !isAdmin/);
assert.match(route, /const canViewAllConferenceLanes = isAdmin \|\| bookingProxy/);
assert.match(route, /listedEvents\.filter\(\(event\) => String\(event\?\.status \|\| ''\) === 'active'\)/);
assert.match(route, /createConferenceBooking\(env, bookingInput, actorEmail, isAdmin \|\| bookingProxy\)/);
assert.match(route, /conference_booking_desk_cancel_only/);
assert.match(route, /String\(body\?\.status \|\| ''\) !== 'cancelled'/);
assert.match(route, /studentLookupBookingProxy/);
assert.match(route, /validateStudentConferenceAdvisorSlot/);

console.log('conference_booking_proxy_static.test.js: PASS');

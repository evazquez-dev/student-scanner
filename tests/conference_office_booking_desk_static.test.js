const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const page = read('student-scanner/admin/conferences.js');
const html = read('student-scanner/admin/conferences.html');
const required = read('student-scanner/admin/conferences-required.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/family-conferences.js');

assert.match(page, /EAGLENEST_CONFERENCE_OFFICE_BOOKING_DESK_V1/);
assert.match(page, /function isBookingDesk\(\)/);
assert.match(page, /function canViewAllLanes\(\)/);
assert.match(page, /office conference booking desk/);
assert.match(page, /Cancel \/ reschedule/);
assert.match(page, /canViewAllLanes\(\).*staff_email/s);

assert.match(html, /Office Booking Desk:/);
assert.match(html, /office booking desk staff can book any participating lane/i);

assert.match(required, /function reqIsBookingDesk\(\)/);
assert.match(required, /function reqCanViewAll\(\)/);
assert.match(required, /Conference booking desk/);
assert.match(required, /if\(!reqCanViewAll\(\)\)slots=slots\.filter/);

assert.match(route, /const officeBookingDesk = isOfficeStaff\(access\) && !isAdmin/);
assert.match(route, /const canViewAllConferenceLanes = isAdmin \|\| officeBookingDesk/);
assert.match(route, /listedEvents\.filter\(\(event\) => String\(event\?\.status \|\| ''\) === 'active'\)/);
assert.match(route, /createConferenceBooking\(env, bookingInput, actorEmail, isAdmin \|\| officeBookingDesk\)/);
assert.match(route, /conference_booking_desk_cancel_only/);
assert.match(route, /String\(body\?\.status \|\| ''\) !== 'cancelled'/);
assert.match(route, /studentLookupOfficeProxy/); // Student Lookup advisor-lane restriction remains separate.
assert.match(route, /validateStudentConferenceAdvisorSlot/);

console.log('conference_office_booking_desk_static.test.js: PASS');

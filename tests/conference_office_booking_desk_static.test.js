// EAGLENEST_GTL_PROXY_LEGACY_STATIC_COMPAT_V2: legacy static assertions now cover both original office and GTL scoped permissions.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const page = read('student-scanner/admin/conferences.js');
const html = read('student-scanner/admin/conferences.html');
const required = read('student-scanner/admin/conferences-required.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/family-conferences.js');

assert.match(page, /EAGLENEST_GTL_BOOKING_PROXY_PATCH_V1/);
assert.match(page, /function isGtlBookingDesk\(\)/);
assert.match(page, /function isBookingDesk\(\)/);
assert.match(page, /conference_booking_proxy/);
assert.match(page, /conference_event_admin/);
assert.match(page, /Cancel \/ reschedule/);
assert.match(page, /canViewAllLanes\(\).*staff_email/s);

assert.match(html, /Conference Booking Proxy:/);
assert.match(html, /Conference Booking Proxies can choose any participating advisor or staff lane/i);

assert.match(required, /function reqIsBookingDesk\(\)/);
assert.match(required, /function reqIsBookingDesk\(\)\{return !reqIsAdmin\(\)&&isBookingDesk\(\);\}/);
assert.match(required, /if\(isGtlBookingDesk\(\)\)slots=slots\.filter\(slot=>slot\.staff_email===row\.advisor_email\);/);
assert.match(required, /conference_event_admin/);
assert.match(required, /Conference booking desk/);
assert.match(required, /if\(!reqCanViewAll\(\)\)slots=slots\.filter/);

assert.match(route, /const bookingProxy = isConferenceBookingProxy\(access\) && !isAdmin/);
assert.match(route, /const canViewAllConferenceLanes = isAdmin \|\| bookingProxy/);
assert.match(route, /listedEvents\.filter\(\(event\) => String\(event\?\.status \|\| ''\) === 'active'\)/);
assert.match(route, /gtlBookingGrant = gtlBookingProxy && \(await assertGtlConferenceBooking\(/);
assert.match(route, /createConferenceBooking\(env, bookingInput, actorEmail, isAdmin \|\| bookingProxy \|\| gtlBookingGrant\)/);
assert.match(route, /scopedGtlConferenceBundle\(result, gtlScope\)/);
assert.match(route, /conference_booking_desk_cancel_only/);
// EAGLENEST_FASC_V7_TEST_FIX: office can cancel OR restore an actual no-show;
// it must not gain permission to complete, mark no-show, or modify unrelated statuses.
assert.match(route, /gtlStatusGrant = gtlBookingProxy && \(await assertGtlConferenceBookingStatus\(/);
assert.match(route, /if \(\(bookingProxy \|\| gtlStatusGrant\) && !\['cancelled','reopen'\]\.includes\(String\(body\?\.status \|\| ''\)\)\)/);
const bookingService = read('cf-redcake/red-cake-77d5/src/services/family-conferences.js');
assert.match(bookingService, /if \(nextStatus === 'reopen'\)/);
assert.match(bookingService, /booking\.status !== 'no_show'/);
assert.match(bookingService, /conference_reopen_slot_no_longer_reserved/);
assert.match(route, /studentLookupBookingProxy/);
assert.match(route, /validateStudentConferenceAdvisorSlot/);

console.log('conference_booking_proxy_static.test.js: PASS');

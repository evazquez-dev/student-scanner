const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const html = read('student-scanner/admin/student_view.html');
const ui = read('student-scanner/admin/student_lookup_engagement.js');
const confRoute = read('cf-redcake/red-cake-77d5/src/routes/family-conferences.js');
const confContext = read('cf-redcake/red-cake-77d5/src/services/student-conference-context.js');
const communicationsRoute = read('cf-redcake/red-cake-77d5/src/routes/communications-d1.js');

assert.match(html, /data-tab="engagement"/);
assert.match(html, /Campaigns &amp; Conferences/);
assert.match(html, /id="engagementBackdrop"/);
assert.match(html, /student_lookup_engagement\.js/);

assert.match(ui, /\/admin\/required_communications\/coverage\?student_number=/);
assert.match(ui, /\/admin\/conferences\/student_context\?student_number=/);
assert.match(ui, /source_context:'student_lookup'/);
assert.match(ui, /Log \/ Book/);
assert.match(ui, /Proxy booking in Student Lookup is advisor-scoped/);
assert.match(ui, /booking_proxy_advisor_scoped/);

assert.match(confRoute, /\/admin\/conferences\/student_context/);
assert.match(confRoute, /studentLookupBookingProxy/);
assert.match(confRoute, /validateStudentConferenceAdvisorSlot/);

// Any staff member granted Conference Booking Proxy gets the same safe behavior:
// Student Lookup stays advisor-lane scoped while the dedicated Conferences page
// may proxy across participating staff lanes.
assert.match(confRoute, /if \(studentLookupBookingProxy\)[\s\S]*validateStudentConferenceAdvisorSlot/);
assert.match(confRoute, /isAdmin \|\| conferenceBookingProxy/);
assert.match(confRoute, /createConferenceBooking\(env, bookingInput, actorEmail, isAdmin \|\| bookingProxy\)/);
assert.match(confRoute, /const canViewAllConferenceLanes = isAdmin \|\| bookingProxy/);

assert.match(confContext, /isBookingProxy \? advisorEmail : actorEmail/);
assert.match(confContext, /booking_proxy_advisor_scoped/);
assert.match(confContext, /conference_student_advisor_lane_required/);
assert.match(confContext, /String\(required\.event_status \|\| ''\) !== 'active'/);
assert.match(confContext, /WHERE status = 'active'/);

assert.match(communicationsRoute, /singleStudentMode/);
assert.match(communicationsRoute, /access\?\.can\?\.student_view === true/);
assert.match(communicationsRoute, /scopedStudentsAll\.filter/);
assert.match(communicationsRoute, /summary\?\.counts\?\.expected/);

console.log('student_lookup_engagement_static.test.js: PASS');

// EAGLENEST_RESOURCE_BOOKING_V1
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('resource booking sync is D1-backed and admin-token protected', () => {
  const migration = read('cf-redcake/red-cake-77d5/migrations/0008_resource_bookings.sql');
  const service = read('cf-redcake/red-cake-77d5/src/services/resource-bookings.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/resource-bookings.js');
  const index = read('cf-redcake/red-cake-77d5/src/index.js');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS resource_bookings/);
  assert.match(migration, /ix_resource_bookings_teacher_date/);
  assert.match(service, /ON CONFLICT\(booking_token\) DO UPDATE/);
  assert.match(service, /resource LIKE 'ChromeCart%'/);
  assert.match(route, /x-admin-token/);
  assert.match(index, /RESOURCE_BOOKING_SYNC_PATHS/);
});

test('My Schedule and Teacher Attendance expose ChromeCart reservations', () => {
  const myRoute = read('cf-redcake/red-cake-77d5/src/routes/my-schedule.js');
  const teacherRoute = read('cf-redcake/red-cake-77d5/src/routes/teacher-attendance-read.js');
  const myJs = read('student-scanner/admin/my_schedule.js');
  const teacherJs = read('student-scanner/admin/teacher_attendance.js');
  const teacherHtml = read('student-scanner/admin/teacher_attendance.html');

  assert.match(myRoute, /resource_booking_count/);
  assert.match(myRoute, /resource_bookings/);
  assert.match(teacherRoute, /resource_bookings_by_period/);
  assert.match(myJs, /ChromeCart/);
  assert.match(teacherJs, /renderResourceBookingNotice/);
  assert.match(teacherHtml, /resourceBookingNotice/);
});

test('Resource Booking GAS pushes create/status updates and daily reconciliation to EagleNEST', () => {
  const gas = read('Google Apps Script/clasp-projects/resource-booking-form/Code.js');
  const preflight = read('Google Apps Script/clasp-projects/resource-booking-form/ResourceBooking_Preflight.js');

  assert.match(gas, /WORKER_ADMIN_TOKEN/);
  assert.match(gas, /\/admin\/resource_bookings\/sync/);
  assert.match(gas, /syncResourceBookingsToEagleNEST_/);
  assert.match(gas, /pushResourceBookingRecordToEagleNEST_/);
  assert.match(preflight, /EagleNEST/);
});

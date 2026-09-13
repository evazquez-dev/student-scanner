// EAGLENEST_VISITOR_APPOINTMENTS_V1
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('visitor appointments are D1-backed and routed before legacy fallback', () => {
  const migration = read('cf-redcake/red-cake-77d5/migrations/0010_visitor_appointments.sql');
  const service = read('cf-redcake/red-cake-77d5/src/services/visitor-appointments.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/visitor-appointments.js');
  const index = read('cf-redcake/red-cake-77d5/src/index.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS visitor_appointments/);
  assert.match(migration, /ix_visitor_appointments_date_status/);
  assert.match(service, /listExpectedVisitorAppointments/);
  assert.match(service, /linkVisitorAppointmentToVisit/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(route, /visitor_desk_forbidden/);
  assert.match(index, /VISITOR_APPOINTMENT_PATHS/);
});

test('Student Contacts schedules contacts or outside guests and exports to Google Calendar', () => {
  const html = read('student-scanner/admin/student_contacts.html');
  const js = read('student-scanner/admin/student_contacts.js');
  assert.match(html, /scheduleOtherGuest/);
  assert.match(html, /appointmentBackdrop/);
  assert.match(html, /myAppointments/);
  assert.match(js, /Schedule meeting/);
  assert.match(js, /\/admin\/visitor_appointments\/create/);
  assert.match(js, /calendar\.google\.com\/calendar\/render/);
  assert.match(js, /contact_snapshot/);
});

test('Visitor Desk surfaces expected visitors and hands them into existing staff check-in', () => {
  const html = read('student-scanner/admin/visitor_desk.html');
  const js = read('student-scanner/admin/visitor_desk.js');
  assert.match(html, /Expected Visitors Today/);
  assert.match(html, /expectedAppointmentsBody/);
  assert.match(js, /\/admin\/visitor_appointments\/today/);
  assert.match(js, /\/admin\/visitor\/staff_create/);
  assert.match(js, /\/admin\/visitor_appointments\/link_visit/);
  assert.match(js, /Add to my calendar/);
});

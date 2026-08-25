const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/student-view.js');
const service = read('cf-redcake/red-cake-77d5/src/services/student-view.js');

test('Student View modular route owns the student dashboard read', () => {
  assert.match(index, /handleStudentViewRequest/);
  assert.match(route, /STUDENT_VIEW_PATHS/);
  assert.match(route, /buildStudentDashboard/);
});

test('Student View service preserves dashboard component contracts', () => {
  assert.match(service, /roster_v1/);
  assert.match(service, /bell_schedule_v1/);
  assert.match(service, /student_classes_v1/);
  assert.match(service, /https:\/\/student-loc\/get\?osis=/);
  assert.match(service, /https:\/\/do\/get\?date=/);
  assert.match(service, /https:\/\/do\/one\?osis=/);
  assert.match(service, /schedule,/);
  assert.match(service, /location,/);
  assert.match(service, /attendance,/);
  assert.match(service, /session/);
});

test('Shared roster search intentionally stays outside Student View extraction', () => {
  assert.doesNotMatch(route, /roster\/search/);
});

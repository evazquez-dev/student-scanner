const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('future My Schedule has a mutable schedule horizon service and custom-day safety states', async () => {
  const servicePath = path.join(ROOT, 'cf-redcake/red-cake-77d5/src/services/schedule-horizon.js');
  const mod = await import(pathToFileURL(servicePath).href + `?t=${Date.now()}`);
  assert.ok(mod.__scheduleHorizonTest);
  const route = read('cf-redcake/red-cake-77d5/src/routes/my-schedule.js');
  const service = read('cf-redcake/red-cake-77d5/src/services/schedule-horizon.js');
  assert.match(route, /\/admin\/schedule_horizon\/sync/);
  assert.match(route, /projectTeacherSchedule/);
  assert.match(route, /past_schedule_preview_not_supported/);
  assert.match(service, /CUSTOM_NOT_PUBLISHED/);
  assert.match(service, /CUSTOM_POTENTIAL/);
});

test('My Schedule UI can browse future dates and never enables attendance links in preview', () => {
  const html = read('student-scanner/admin/my_schedule.html');
  const js = read('student-scanner/admin/my_schedule.js');
  assert.match(html, /id="dateSelect"/);
  assert.match(html, /id="prevDateBtn"/);
  assert.match(html, /id="nextDateBtn"/);
  assert.match(js, /\/admin\/my_schedule\?date=/);
  assert.match(js, /CUSTOM_POTENTIAL/);
  assert.match(js, /CUSTOM_NOT_PUBLISHED/);
  assert.match(js, /Assignment not available yet/);
  assert.match(js, /attendance_links_enabled/);
  assert.match(js, /Preview only/);
});

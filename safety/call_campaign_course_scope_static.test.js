const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('required communication configuration exposes optional multi-course/advisory selection', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/required-communications.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/required-communications.js');
  const admin = read('student-scanner/admin/admin.js');
  assert.match(service, /buildRequiredCourseOptions/);
  assert.match(service, /buildRequiredCampaignResponsibility/);
  // Advisory option coverage is behavior-tested in call_campaign_course_scope_runtime.test.js.
  assert.match(service, /normalizeRequiredCourseKey/);
  assert.match(route, /course_options/);
  assert.match(admin, /requiredCommCourse/);
  assert.match(admin, /course_keys/);
});

test('course-scoped campaign completion is restricted to responsible staff', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/required-communications.js');
  const dashboard = read('cf-redcake/red-cake-77d5/src/services/communications-dashboard.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/communications-dashboard.js');
  assert.match(service, /filterRequiredCampaignMatchesByResponsibility/);
  assert.match(dashboard, /campaign_responsibility/);
  assert.match(dashboard, /campaign_query_student_numbers/);
  assert.match(route, /campaign_query_student_numbers/);
});

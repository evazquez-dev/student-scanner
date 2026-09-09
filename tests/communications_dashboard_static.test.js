const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/communications-dashboard.js');
const service = read('cf-redcake/red-cake-77d5/src/services/communications-dashboard.js');
const access = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
const gas = read('Google Apps Script/clasp-projects/behavioral-endpoint/Code.js');
const html = read('student-scanner/admin/communications.html');
const js = read('student-scanner/admin/communications.js');
const nav = read('student-scanner/admin/nav.js');
const brand = read('student-scanner/admin/brand.js');
const contacts = read('student-scanner/admin/student_contacts.js');

test('communications dashboard is a modular routed staff feature', () => {
  assert.match(index, /COMMUNICATIONS_DASHBOARD_PATHS/);
  assert.match(index, /handleCommunicationsDashboardRequest/);
  assert.match(route, /'\/admin\/communications\/dashboard'/);
  assert.match(route, /'\/admin\/communications\/followup\/resolve'/);
  assert.match(access, /communications: true/);
});

test('role scopes use staff profile, advisor ownership, and academic department rosters', () => {
  assert.match(service, /is_grade_team_lead/);
  assert.match(service, /is_district_chair/);
  assert.match(service, /profile\?\.grade_team/);
  assert.match(service, /profile\?\.department/);
  assert.match(service, /StudentToAdvisorLink/);
  assert.match(service, /teachers_by_email/);
});

test('behavior endpoint supports dashboard query plus audited follow-up resolution', () => {
  assert.match(gas, /communication_dashboard_query/);
  assert.match(gas, /communication_followup_resolve/);
  assert.match(gas, /FollowUpResolvedAtISO/);
  assert.match(gas, /Communication_FollowUp_Audit/);
  assert.match(gas, /FollowUpOwnerEmail/);
});

test('frontend exposes scope tabs, required campaigns, follow-up queue, activity, and deep-linked logging', () => {
  assert.match(html, /data-module="communications"/);
  assert.match(html, /Required Communications/);
  assert.match(html, /Follow-up Queue/);
  assert.match(html, /Needs Attention/);
  assert.match(js, /available_scopes/);
  assert.match(js, /\/admin\/communications\/dashboard/);
  assert.match(js, /\/admin\/communications\/followup\/resolve/);
  assert.match(nav, /key:'communications'/);
  assert.match(brand, /communications:\s*'Communications'/);
  assert.match(contacts, /PAGE_PREFILL_CATEGORY/);
});

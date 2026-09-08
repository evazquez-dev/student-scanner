const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const route = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/routes/required-communications.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/services/required-communications.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/index.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'Google Apps Script/clasp-projects/behavioral-endpoint/Code.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'student-scanner/admin/index.html'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'student-scanner/admin/admin.js'), 'utf8');
const contactsJs = fs.readFileSync(path.join(root, 'student-scanner/admin/student_contacts.js'), 'utf8');

test('required communication route is wired through modular worker entry', () => {
  assert.match(index, /REQUIRED_COMMUNICATION_PATHS/);
  assert.match(index, /handleRequiredCommunicationRequest/);
  assert.match(route, /\/admin\/required_communications\/coverage/);
  assert.match(route, /\/admin\/communications\/category/);
});

test('required communication engine uses live roster, category match, and legacy note provenance', () => {
  assert.match(route, /\/admin\/roster\/all\?limit=5000/);
  assert.match(route, /communication_campaign_matches/);
  assert.match(service, /category_match/);
  assert.match(service, /legacy_text_match/);
  assert.match(gas, /contactHubCampaignMatches_/);
  assert.match(gas, /contactHubCommunicationSearchText_\(r\.Notes\)/);
  assert.match(gas, /arr\.unshift\(category\)/);
});

test('category correction keeps a dedicated audit trail and owner/admin enforcement', () => {
  assert.match(gas, /Communication_Category_Audit/);
  assert.match(gas, /OriginalCategory/);
  assert.match(gas, /PreviousCategory/);
  assert.match(gas, /originalActor !== viewerEmail/);
  assert.match(route, /communication_category_update/);
  assert.match(contactsJs, /Change category/);
  assert.match(contactsJs, /category_updated_at_iso/);
});

test('system administration exposes required campaign management and protects categories in use', () => {
  assert.match(adminHtml, /Required Communications/);
  assert.match(adminJs, /loadRequiredCommunications/);
  assert.match(adminJs, /Check coverage/);
  assert.match(worker, /category_in_use_by_required_campaign/);
});

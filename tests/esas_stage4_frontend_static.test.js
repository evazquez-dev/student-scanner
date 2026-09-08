const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MONO = path.resolve(ROOT, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readRoot = (rel) => fs.readFileSync(path.join(MONO, rel), 'utf8');

const nav = read('admin/nav.js');
const esasHtml = read('admin/esas.html');
const esasJs = read('admin/esas.js');
const route = readRoot('cf-redcake/red-cake-77d5/src/routes/esas.js');
const service = readRoot('cf-redcake/red-cake-77d5/src/services/esas.js');
const durable = readRoot('cf-redcake/red-cake-77d5/src/durable-objects/esas.js');

test('Stage 4 shared admin guard redirects from a fresh authenticated ESAS status every four seconds', () => {
  assert.match(nav, /const ESAS_TAKEOVER_POLL_MS = 4000/);
  assert.match(nav, /adminFetch\('\/admin\/esas\/status'/);
  assert.match(nav, /j\.active === true && j\.incident\?\.incident_id/);
  assert.match(nav, /location\.replace\('\.\/esas\.html\?takeover=1'\)/);
  assert.match(nav, /setInterval\(refreshEsasTakeover, ESAS_TAKEOVER_POLL_MS\)/);
  assert.match(nav, /Never redirect from a guessed or stale client-side state/);
});

test('Stage 4 takeover explicitly exempts ESAS and Visitor Desk while public kiosk surfaces remain outside the guard', () => {
  assert.match(nav, /function isEsasTakeoverExemptPage\(\)/);
  assert.match(nav, /return isEsasPage\(\) \|\| isVisitorPage\(\)/);
  assert.doesNotMatch(read('index.html'), /admin\/nav\.js|\.\/admin\/nav\.js/);
  assert.doesNotMatch(read('visitor/index.html'), /admin\/nav\.js|\.\/admin\/nav\.js/);
});

test('Stage 4 activation queues a generic privacy-safe push to current staff through the existing Web Push service', () => {
  assert.match(route, /sendPushToEmails/);
  assert.match(route, /getEsasPushAudienceEmails/);
  assert.match(service, /staff_mapping_by_email/);
  assert.match(route, /ESAS DRILL ACTIVE/);
  assert.match(route, /ESAS EMERGENCY ACTIVE/);
  assert.match(route, /Emergency Student Accountability is active\. Open EagleNEST now\./);
  assert.match(route, /\.\/admin\/esas\.html\?takeover=1/);
  assert.doesNotMatch(route, /student\.name|student_name|expected_room|expected_course/);
});

test('Stage 4 ESAS page owns the guarded end flow and archived manager summary', () => {
  for (const id of ['managerControls','endIncidentBtn','endGuardPanel','archiveSummaryCard','archiveFinalUnaccounted']) {
    assert.ok(esasHtml.includes(`id="${id}"`), `missing ${id}`);
  }
  assert.match(esasJs, /END WITH \$\{remaining\} UNACCOUNTED/);
  assert.match(esasJs, /confirm_unaccounted:\s*confirmedUnaccounted/);
  assert.match(esasJs, /force_with_unaccounted:\s*force/);
  assert.match(esasJs, /\/admin\/esas\/archive\?incident_id=/);
  assert.match(esasJs, /LAST_ARCHIVE_SUMMARY/);
});

test('Stage 4 end protection is enforced in the Durable Object, not only the browser', () => {
  assert.match(durable, /confirm_unaccounted_required/);
  assert.match(durable, /unaccounted_count_changed/);
  assert.match(durable, /unaccounted_students_remain/);
  assert.match(durable, /body\?\.force_with_unaccounted !== true/);
  assert.match(service, /buildEsasArchiveSummary/);
  assert.match(route, /handleArchive[\s\S]*manageOnly/);
});

// Batch 4 safety contracts: run correctly from the repo root or Worker directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const worker = read('../../cf-redcake/red-cake-77d5/src/worker.js');
const index = read('../../cf-redcake/red-cake-77d5/src/index.js');
const routes = read('../../cf-redcake/red-cake-77d5/src/routes/incidents.js');
const service = read('../../cf-redcake/red-cake-77d5/src/services/incidents.js');

// Removed only after Incident Creator POST was retired in Batch 3.
test('SAFETY: orphaned legacy Incident Creator parsing and evidence helpers stay retired', () => {
  assert.match(worker, /EAGLENEST_LEGACY_INCIDENT_HELPERS_CLEANUP_BATCH4/);
  for (const name of [
    'INCIDENT_ALLOWED_EXTENSIONS', 'incidentCleanText_', 'parseIncidentJsonArray_',
    'normalizeIncidentStudentList_', 'incidentFileAllowed_',
    'incidentBytesToBase64_', 'readIncidentCreateRequest_'
  ]) {
    assert.equal(worker.includes(name), false, `${name} must not be duplicated in worker.js`);
  }
  assert.match(worker, /if \(path === "\/admin\/incident\/create"\) \{[\s\S]*?return adminJson\(req, \{ ok: false, error: "method_not_allowed" \}, 405\);/);
});

test('SAFETY: canonical modular Incident Creator still owns parsing, Practice, D1, R2 and Dean referral', () => {
  const intercept = index.indexOf("path.startsWith('/admin/incident/')");
  const fallback = index.indexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(intercept >= 0 && fallback > intercept, 'Incident route must precede baseWorker fallback');
  assert.match(index, /handleIncidentRequest\(req, env, ctx, baseWorker\)/);
  assert.match(routes, /'\/admin\/incident\/create': 'POST'/);
  assert.match(routes, /'\/admin\/incident\/config': 'GET'/);
  assert.match(routes, /readIncidentCreateRequest\(req\)/);
  assert.match(routes, /validateIncidentEvidenceFiles\(/);
  assert.match(routes, /normalizeIncidentStudentList\(/);
  assert.match(routes, /createPracticeIncident\(/);
  assert.match(routes, /createIncidentD1\(/);
  assert.match(routes, /sendPushCategoryToEmail\(/);
  assert.match(routes, /mutationGuard\(req,/);
  assert.match(service, /export const INCIDENT_MAX_FILES/);
});

test('SAFETY: shared Worker runtime and legacy read-only incident config remain intact', () => {
  for (const symbol of [
    'var INCIDENT_MAX_FILES = 5;', 'var INCIDENT_MAX_FILE_BYTES = 8 * 1024 * 1024;',
    'var INCIDENT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;',
    'var INCIDENT_LOCATION_CATEGORIES = ', 'function sendPushCategoryToEmail_(',
    'var StudentLocationDO = class', 'var VisitorDeskDO = class', 'var ClassSessionDO = class',
    'async scheduled(event, env, ctx)',
    'if (path === "/admin/incident/config")', 'if (path === "/admin/behavior/menu")',
    'if (path === "/admin/staff_pull/pull")'
  ]) {
    assert.ok(worker.includes(symbol), `protected Worker contract missing: ${symbol}`);
  }
});

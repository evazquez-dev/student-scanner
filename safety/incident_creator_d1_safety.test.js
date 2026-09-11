const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const route = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/routes/incidents.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/services/incidents.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/migrations/0004_incidents.sql'), 'utf8');
const wrangler = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/wrangler.jsonc'), 'utf8');

test('SAFETY: live Incident Creator is D1/R2 authoritative with no Behavioral GAS persistence', () => {
  assert.match(route, /createIncidentD1/);
  assert.doesNotMatch(route, /createIncidentInGas|loadIncidentConfigFromGas|BEHAVIOR_GAS/);
  assert.match(service, /requireEagleNestDb/);
  assert.match(service, /INCIDENT_EVIDENCE/);
  assert.doesNotMatch(service, /SpreadsheetApp|DriveApp|BEHAVIOR_GAS/);
});

test('SAFETY: Practice incidents remain isolated and cannot write D1 or R2', () => {
  assert.match(route, /practice\s*\?\s*await createPracticeIncident/);
  assert.match(service, /practice_record:incident:/);
  assert.match(service, /practice_discarded:\s*true/);
});

test('SAFETY: Incident mutations keep origin and View-As guards', () => {
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(route, /loadBaseAccess/);
});

test('SAFETY: incident evidence uses a dedicated private R2 binding', () => {
  assert.match(wrangler, /"binding":\s*"INCIDENT_EVIDENCE"/);
  assert.match(wrangler, /"bucket_name":\s*"eaglenest-incident-evidence"/);
  assert.match(route, /\/admin\/incident\/evidence/);
  assert.match(service, /reporter_email/);
  assert.match(service, /assigned_to_email/);
});

test('SAFETY: D1 schema preserves incident workflow fields and normalized student links', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS incidents/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS incident_participants/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS incident_evidence/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS incident_audit/);
  assert.match(migration, /investigation_notes/);
  assert.match(migration, /resolution_notes/);
  assert.match(migration, /student_number/);
});

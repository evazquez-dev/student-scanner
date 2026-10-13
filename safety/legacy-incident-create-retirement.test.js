// EAGLENEST_LEGACY_INCIDENT_CREATE_CLEANUP_BATCH3
// Test contracts, not the old GAS-backed incident implementation.
// Use URLs relative to this test so it works from either repository root or Worker cwd.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/worker.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/index.js', import.meta.url), 'utf8');
const route = readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/routes/incidents.js', import.meta.url), 'utf8');

const legacyStart = '    if (path === "/admin/incident/create") {';
const legacyEnd = '    if (path === "/admin/behavior/menu") {';

test('SAFETY: modular Incident Creator owns POST before legacy fallback', () => {
  const intercept = index.indexOf("path.startsWith('/admin/incident/')");
  const fallback = index.indexOf('return baseWorker.fetch(req, env, ctx);');
  assert.ok(intercept >= 0 && fallback > intercept, 'incident interception must precede fallback');
  assert.match(index.slice(intercept, fallback), /handleIncidentRequest\(req, env, ctx, baseWorker\)/);
  assert.match(route, /'\/admin\/incident\/create': 'POST'/);
  assert.match(route, /if \(path === '\/admin\/incident\/config'\) return handleConfig/);
  assert.match(route, /return handleCreate\(req, env, ctx, baseWorker\)/);
});

test('SAFETY: legacy incident POST is fail-closed and its GAS write body is retired', () => {
  assert.equal(worker.split(legacyStart).length - 1, 1, 'one legacy fail-closed route');
  assert.equal(worker.split(legacyEnd).length - 1, 1, 'behavior route remains');
  const start = worker.indexOf(legacyStart);
  const end = worker.indexOf(legacyEnd, start);
  assert.ok(end > start);
  const legacyBlock = worker.slice(start, end);
  assert.match(legacyBlock, /return adminJson\(req, \{ ok: false, error: "method_not_allowed" \}, 405\);/);
  assert.doesNotMatch(legacyBlock, /readIncidentCreateRequest_|gasPostJsonUrl_|incident_create_failed/);
  assert.match(worker, /if \(path === "\/admin\/incident\/config"\) \{/);
});

test('SAFETY: modular Incident Creator keeps D1, Practice, authorization, evidence and Dean push', () => {
  assert.match(route, /mutationOriginAllowed\(req, env\)/);
  assert.match(route, /viewAsReadOnlyResponse\(accessResponse, access\)/);
  assert.match(route, /createPracticeIncident\(/);
  assert.match(route, /createIncidentD1\(/);
  assert.match(route, /validateIncidentEvidenceFiles\(/);
  assert.match(route, /sendPushCategoryToEmail\(env, INCIDENT_DEAN_EMAIL/);
  assert.match(route, /readIncidentEvidence\(/);
});

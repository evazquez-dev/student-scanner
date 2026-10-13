import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// File-relative URL imports make these tests independent of process.cwd.
const worker = readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/worker.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/index.js', import.meta.url), 'utf8');
const route = readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/routes/fidelity-dashboard.js', import.meta.url), 'utf8');
const service = readFileSync(new URL('../../cf-redcake/red-cake-77d5/src/services/fidelity-d1.js', import.meta.url), 'utf8');

const dead = [
  'fetchFidelityRangeDashboardFromGas_',
  'fetchFidelityScoreSnapshotMetaFromGas_',
  'fallbackFidelityScoreSnapshotMetaFromCache_',
  'buildFidelityRangeDashboardFromSnapshots_',
  'putCachedFidelityDashboard_',
  'maybePersistFidelityDailyScoreSnapshot_',
];

test('SAFETY: orphaned legacy Fidelity fallback functions are physically absent', () => {
  assert.match(worker, /EAGLENEST_LEGACY_FIDELITY_ORPHANS_CLEANUP_BATCH5/);
  for (const name of dead) {
    assert.equal(worker.includes(name), false, `${name} must not return to worker.js`);
  }
});

test('SAFETY: D1 Fidelity endpoints stay modularly owned before legacy fallback', () => {
  assert.match(index, /FIDELITY_DASHBOARD_PATHS\.has\(path\)/);
  assert.match(index, /handleFidelityDashboardRequest\(req, env, ctx, baseWorker\)/);
  assert.ok(index.indexOf('FIDELITY_DASHBOARD_PATHS.has(path)') < index.indexOf('return baseWorker.fetch(req, env, ctx);'));
  for (const path of ['/admin/fidelity_dashboard', '/admin/fidelity_range_dashboard', '/admin/fidelity_score_snapshot_meta', '/admin/kiosk_health']) {
    assert.ok(route.includes(`'${path}'`), `Missing modular Fidelity route ${path}`);
  }
  for (const fn of ['buildFidelityDashboardD1(', 'fidelityRangeSummaryD1(', 'fidelitySnapshotMetaD1(']) {
    assert.ok(route.includes(fn), `Modular route missing ${fn}`);
    assert.ok(service.includes(fn), `D1 service missing ${fn}`);
  }
  assert.match(route, /loadBaseAccess\(/);
  assert.match(route, /isAllowed\(access\)/);
});

test('SAFETY: shared state, incident config, and scheduled Worker behavior survive', () => {
  for (const symbol of [
    '__EAGLENEST_FIDELITY_D1_V2__',
    'var FidelityEventBufferDO = class',
    'var StudentLocationDO = class',
    'var ClassSessionDO = class',
    'var VisitorDeskDO = class',
    'async scheduled(event, env, ctx)',
    'if (path === "/admin/incident/config")',
    'if (path === "/admin/incident/create")',
    'if (path === "/admin/staff_pull/pull")',
    'if (path === "/admin/push/config")',
  ]) {
    assert.ok(worker.includes(symbol), `Protected Worker capability missing ${symbol}`);
  }
});

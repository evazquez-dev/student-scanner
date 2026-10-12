// EAGLENEST_LEGACY_PUSH_CLEANUP_BATCH2_1
// Regression tests for deliberately retired legacy push endpoints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const project = 'cf-redcake/red-cake-77d5/src/';
const index = read(project + 'index.js');
const worker = read(project + 'worker.js');
const route = read(project + 'routes/push-notifications.js');
const service = read(project + 'services/push-notifications.js');
const incident = read(project + 'routes/incidents.js');

const endpoints = [
  ['/admin/push/preferences', 'POST'],
  ['/admin/push/subscribe', 'POST'],
  ['/admin/push/unsubscribe', 'POST'],
  ['/admin/push/test', 'POST'],
];

test('SAFETY: push API POST endpoints and GET config remain modularly owned before legacy fallback', () => {
  const dispatch = index.indexOf("path.startsWith('/admin/push/')");
  const fallback = index.indexOf('return baseWorker.fetch(req, env, ctx)');
  assert.ok(dispatch > 0 && fallback > dispatch, 'push dispatch must precede fallback');
  assert.match(index, /handlePushNotificationRequest\(req, env, ctx, baseWorker\)/);
  assert.ok(route.includes("['/admin/push/config', { method: 'GET'"), 'modular GET config contract missing');
  for (const [url, method] of endpoints) {
    assert.ok(route.includes(`['${url}', { method: '${method}'`), `missing route ${url}`);
  }
});

test('SAFETY: shadowed push POST handlers have no remaining implementations in legacy Worker', () => {
  assert.match(worker, /EAGLENEST_LEGACY_PUSH_CLEANUP_BATCH2_1/);
  for (const [url] of endpoints) {
    const needle = `if (path === "${url}") return adminJson(req, { ok: false, error: "method_not_allowed" }, 405);`;
    assert.ok(worker.includes(needle), `missing fail-closed legacy method guard for ${url}`);
    assert.equal(worker.split(`if (path === "${url}")`).length - 1, 1,
      `expected one legacy guard for ${url}`);
  }
  assert.match(worker, /if \(path === \"\/admin\/push\/config\"\) \{/,
    'the legacy GET config is intentionally retained for the existing static test');
  assert.match(worker, /phone_return_alerts_eligible:\s*phoneReturnAlertsEligible/,
    'legacy GET config must still identify eligible Ops accounts');
  assert.match(worker, /function buildPushPreferenceCatalog_\(/);
  for (const name of ['savePushPreferencesForEmail_']) {
    assert.equal(worker.includes(name), false, `${name} must be removed after modular ownership`);
  }
});

test('SAFETY: shared push delivery and incident notifications are retained', () => {
  assert.match(service, /sendPushCategoryToEmail/);
  assert.match(service, /sendPushToEmail/);
  assert.match(route, /sendPushToEmail/);
  assert.match(incident, /sendPushCategoryToEmail/);
  assert.match(worker, /sendPushCategoryToEmail_/);
  assert.match(worker, /var StudentLocationDO = class/);
  assert.match(worker, /var ClassSessionDO = class/);
  assert.match(worker, /var VisitorDeskDO = class/);
  assert.match(worker, /async scheduled\(/);
});

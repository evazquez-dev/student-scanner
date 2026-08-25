const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/reflection-hold.js');
const service = read('cf-redcake/red-cake-77d5/src/services/reflection-hold.js');
const legacy = read('cf-redcake/red-cake-77d5/src/worker.js');

const interceptPos = index.indexOf('if (REFLECTION_HOLD_PATHS.has(path)');
const fallbackPos = index.indexOf('return baseWorker.fetch(req, env, ctx);');

test('SAFETY: Reflection Hold routes are intercepted before legacy fallback', () => {
  assert.ok(interceptPos >= 0, 'Reflection Hold intercept missing');
  assert.ok(fallbackPos > interceptPos, 'Reflection Hold must run before legacy fallback');
  assert.match(index, /handleReflectionHoldRequest/);
});

test('SAFETY: Reflection Hold owns all five feature endpoints and no shared roster endpoint', () => {
  for (const suffix of ['options', 'preview', 'confirm', 'update', 'release']) {
    assert.match(route, new RegExp(`/admin/reflection_hold/${suffix}`));
  }
  assert.doesNotMatch(route, /\/admin\/roster\/all/);
});

test('SAFETY: Reflection Hold mutations retain origin and View-As read-only guards', () => {
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(route, /req\.method !== 'POST'/);
});

test('SAFETY: Reflection Hold remains Practice-isolated for StudentLocation and audits', () => {
  assert.match(service, /loadStudentViewModeInfo/);
  assert.match(service, /studentViewOperationalDoName\(modeInfo, 'GLOBAL'\)/);
  assert.match(service, /practice:v1:/);
  assert.match(service, /expirationTtl: PRACTICE_KV_TTL_SEC/);
});

test('SAFETY: Reflection Hold preserves priority and legacy compatibility rules', () => {
  assert.match(service, /Regents Prep has priority/);
  assert.match(service, /lower_priority_hold/);
  assert.match(service, /held_by_role/);
  assert.match(service, /REFLECTION_HOLD_LEGACY_LOC/);
});

test('SAFETY: legacy Reflection Hold implementation remains physically present for rollback', () => {
  for (const suffix of ['options', 'preview', 'confirm', 'update', 'release']) {
    assert.match(legacy, new RegExp(`path === "\\/admin\\/reflection_hold\\/${suffix}"`));
  }
  assert.match(legacy, /reflectionHoldRosterRows_/);
  assert.match(legacy, /reflectionHoldInfo_/);
});

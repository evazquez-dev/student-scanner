const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const route = read('cf-redcake/red-cake-77d5/src/routes/scan-injector.js');
const service = read('cf-redcake/red-cake-77d5/src/services/scan-injector.js');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const html = read('student-scanner/admin/scan_injector.html');
const frontend = read('student-scanner/admin/scan_injector.js');
const nav = read('student-scanner/admin/nav.js');

test('SAFETY: scan injector is admin-authenticated and mutation-protected', () => {
  assert.match(route, /loadBaseAccess/);
  assert.match(route, /role === 'super_admin' \|\| role === 'admin'/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
});

test('SAFETY: Live injection is super-admin only and requires exact explicit confirmation', () => {
  assert.match(route, /live_scan_injection_super_admin_only/);
  assert.match(route, /INJECT LIVE SCANS/);
  assert.match(route, /live_confirmation_required/);
  assert.match(frontend, /INJECT LIVE SCANS/);
  assert.match(html, /LIVE MODE/);
});

test('SAFETY: Practice scan injection reuses scanner lookup and log pipeline with a Practice-scoped audit', () => {
  assert.match(service, /action: 'lookup'/);
  assert.match(service, /action: 'log'/);
  assert.match(service, /source: 'admin_scan_injector'/);
  assert.match(service, /debug_hhmm/);
  assert.match(service, /practice:v1:/);
  assert.match(service, /expirationTtl: PRACTICE_KV_TTL_SEC/);
});

test('SAFETY: varied entrance injector IN is corrected explicitly without changing the real scanner toggle path', () => {
  assert.match(service, /allowed === 'admin_inject_in'/);
  assert.match(service, /forceVariedEntranceIn/);
  assert.match(service, /studentViewOperationalDoName\(modeInfo, 'GLOBAL'\)/);
  assert.match(service, /source: 'admin_scan_injector'/);
});

test('SAFETY: injector is modularly intercepted and surfaced only to admin-like navigation', () => {
  assert.match(index, /SCAN_INJECTOR_PATHS/);
  assert.match(index, /handleScanInjectorRequest\(req, env, ctx, baseWorker\)/);
  assert.match(nav, /scan_injector/);
  assert.match(nav, /access\?\.role === 'super_admin' \|\| access\?\.role === 'admin'/);
});

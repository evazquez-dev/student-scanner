const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('worker persists and exposes super-admin managed external nav links', () => {
  const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
  const adminSessionService = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
  assert.match(worker, /EXTERNAL_NAV_LINKS_KEY\s*=\s*"external_nav_links_v1"/);
  assert.match(worker, /path === "\/admin\/nav_external_links"/);
  assert.match(worker, /sanitizeExternalNavLinks_/);
  assert.match(worker, /parsed\.protocol !== "http:" && parsed\.protocol !== "https:"/);
  assert.match(adminSessionService, /external_links: await loadDefaultExternalLinks\(env\)/);
  assert.match(adminSessionService, /can:\s*\{/);
  assert.match(worker, /writeAudit\(liveModeEnv_\(env\).*update_external_nav_links/);
});

test('shared nav renders configured links at the bottom and opens safely in a new tab', () => {
  const nav = read('student-scanner/admin/nav.js');
  assert.match(nav, /access\?\.external_links/);
  assert.match(nav, /sectionTitle\.textContent = 'External Links'/);
  assert.match(nav, /a\.target = '_blank'/);
  assert.match(nav, /a\.rel = 'noopener noreferrer'/);
  assert.match(nav, /ssNavExternalSection/);
});

test('super admin dashboard supports add, edit, remove, load, and save', () => {
  const html = read('student-scanner/admin/index.html');
  const js = read('student-scanner/admin/admin.js');
  assert.match(html, /id="externalLinksRows"/);
  assert.match(html, /id="btnAddExternalLink"/);
  assert.match(html, /id="btnSaveExternalLinks"/);
  assert.match(js, /function addExternalLinkRow/);
  assert.match(js, /function collectExternalNavLinks/);
  assert.match(js, /\/admin\/nav_external_links/);
  assert.match(js, /row\.remove\(\)/);
});

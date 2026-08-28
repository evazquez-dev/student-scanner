const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const html = read('admin/esas.html');
const css = read('admin/esas.css');
const js = read('admin/esas.js');
const nav = read('admin/nav.js');
const brand = read('admin/brand.js');

test('ESAS Stage 3 ships a dedicated authenticated mobile page', () => {
  assert.match(html, /data-module="esas"/);
  assert.match(html, /admin\/esas\/my_roster|My Current Roster/);
  assert.match(html, /Find Any Student/);
  assert.match(html, /Whole-School Unaccounted/);
  assert.match(js, /\/admin\/session\/check/);
  assert.match(js, /\/admin\/session\/login_google/);
});

test('ESAS Stage 3 consumes only the Stage 2 accountability APIs', () => {
  for (const endpoint of [
    '/admin/esas/status',
    '/admin/esas/my_roster',
    '/admin/esas/search',
    '/admin/esas/account',
    '/admin/esas/unaccounted'
  ]) assert.ok(js.includes(endpoint), `missing ${endpoint}`);
});

test('ESAS accounting UI is server-confirmed rather than optimistic', () => {
  const mutation = js.indexOf("await getJson('/admin/esas/account'");
  const confirmed = js.indexOf('mergeStudentIntoLists(result.student)');
  assert.ok(mutation >= 0 && confirmed > mutation);
  assert.match(js, /Deliberately update the visual accounting state only after the Worker confirms the write/);
  assert.match(js, /PENDING_OSIS/);
  assert.match(js, /Saving…/);
});

test('ESAS Stage 3 polls live status and supports targeted search', () => {
  assert.match(js, /const POLL_MS = 4000/);
  assert.match(js, /setInterval\(\(\) => refreshAll\(\{ silent:true \}\), POLL_MS\)/);
  assert.match(js, /query\.length < 2/);
  assert.match(js, /encodeURIComponent\(query\)/);
});

test('all staff can open live unaccounted while Ops/Admin still default there and teachers start on My Roster', () => {
  assert.match(js, /tabOps\.hidden = false/);
  assert.match(js, /getJson\('\/admin\/esas\/unaccounted'/);
  assert.match(js, /canManage\(\) && ACTIVE_VIEW === 'roster'/);
  assert.match(js, /ACTIVE_VIEW = 'ops'/);
  assert.doesNotMatch(js, /if \(view === 'ops' && !canManage\(\)\) return/);
});

test('ESAS nav/branding is visible to authenticated staff and identifies live Practice behavior', () => {
  assert.match(brand, /esas:\s*'Emergency Accountability'/);
  assert.match(nav, /key:'esas'/);
  assert.match(nav, /it\.key === 'esas' && !!access\?\.email/);
  assert.match(nav, /ESAS IS LIVE AND PERSISTENT/);
});

test('ESAS phone layout has large touch controls and compact responsive cards', () => {
  assert.match(css, /\.account-btn[\s\S]*min-height:58px/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /\.view-tabs[\s\S]*position:sticky/);
});

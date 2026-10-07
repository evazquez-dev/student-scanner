const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nav = fs.readFileSync(path.join(root, 'admin', 'nav.js'), 'utf8');
const js = fs.readFileSync(path.join(root, 'admin', 'global_search.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'admin', 'global_search.css'), 'utf8');

test('shared nav boots the global search palette from access-filtered page metadata', () => {
  assert.match(nav, /EAGLENEST_GLOBAL_SEARCH_V1/);
  assert.match(nav, /section\.items\s*\.filter\(visibleByAccess\)/);
  assert.match(nav, /EAGLENEST_GLOBAL_SEARCH_CONTEXT/);
  assert.match(nav, /global_search\.js\?v=20261007-v1/);
  assert.match(nav, /global_search\.css\?v=20261007-v1/);
});

test('global search supports keyboard toggling, escape, outside click, arrows and enter', () => {
  assert.match(js, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(js, /key === 'k'/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /event\.target === backdrop/);
  assert.match(js, /event\.key === 'ArrowDown'/);
  assert.match(js, /event\.key === 'ArrowUp'/);
  assert.match(js, /event\.key === 'Enter'/);
});

test('student search reuses roster search and opens Student Lookup directly', () => {
  assert.match(js, /\/admin\/roster\/search\?q=/);
  assert.match(js, /\.\/student_view\.html/);
  assert.match(js, /searchParams\.set\('osis'/);
});

test('View As remains Super Admin-only and reuses the existing session endpoints', () => {
  assert.match(js, /actor_role \|\| access\.role/);
  assert.match(js, /=== 'super_admin'/);
  assert.match(js, /\/admin\/view_as\/staff/);
  assert.match(js, /\/admin\/session\/view_as/);
  assert.match(js, /Return to Super Admin/);
});

test('palette is a centered overlay and launcher is located in the shared nav', () => {
  assert.match(css, /#ssGlobalSearchBackdrop/);
  assert.match(css, /position:fixed/);
  assert.match(css, /\.ssGlobalSearchDialog/);
  assert.match(css, /\.ssGlobalSearchLauncher/);
  assert.match(js, /#ssNavDrawer \.ssNavLinks/);
});

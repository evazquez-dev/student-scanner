const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const frontend = read('student-scanner/admin/reflection_hold.js');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/reflection-hold.js');

test('Reflection Hold frontend still calls the same five feature endpoints', () => {
  for (const suffix of ['options', 'preview', 'confirm', 'update', 'release']) {
    assert.match(frontend, new RegExp(`/admin/reflection_hold/${suffix}`));
  }
});

test('Reflection Hold still leaves shared roster/all outside the feature route', () => {
  assert.match(frontend, /\/admin\/roster\/all\?limit=5000&reflection_hold_flags=1/);
  assert.doesNotMatch(route, /\/admin\/roster\/all/);
  assert.match(index, /REFLECTION_HOLD_PATHS/);
});

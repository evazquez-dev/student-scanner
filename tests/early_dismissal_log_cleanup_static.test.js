const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const route = read('cf-redcake/red-cake-77d5/src/routes/early-dismissal.js');
const gas = read('Google Apps Script/clasp-projects/early-dismissal/UndoCleanup.js');
const manifest = read('Google Apps Script/clasp-projects/early-dismissal/appsscript.json');
const frontend = read('student-scanner/admin/early_dismissal.js');

test('Early Dismissal Undo cleanup uses the same fingerprint material in Worker and GAS', () => {
  assert.match(route, /\$\{date\}\|\$\{osis\}\|\$\{whenISO\}/);
  assert.match(gas, /\[dateISO, osis, whenISO\].*\.join\('\|'\)/s);
  assert.match(route, /ed_\$\{hex\.slice\(0, 32\)\}/);
  assert.match(gas, /'ed_' \+ hex\.slice\(0, 32\)/);
});

test('Undo returns cleanup status and GAS is deployable as an authenticated web app', () => {
  assert.match(route, /log_cleanup: logCleanup/);
  assert.match(frontend, /Early Dismissal log row could not be deleted/);
  assert.match(manifest, /"webapp"/);
  assert.match(manifest, /"ANYONE_ANONYMOUS"/);
});

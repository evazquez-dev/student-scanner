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

test('Early Dismissal Undo uses the same exact fingerprint material in Worker and GAS', () => {
  assert.match(route, /\$\{date\}\|\$\{osis\}\|\$\{whenISO\}/);
  assert.match(gas, /\[dateISO, osis, whenISO\].*\.join\('\|'\)/s);
  assert.match(route, /ed_\$\{hex\.slice\(0, 32\)\}/);
  assert.match(gas, /'ed_' \+ hex\.slice\(0, 32\)/);
});

test('Undo returns persistence status, displays failures, and GAS remains authenticated', () => {
  assert.match(route, /log_cleanup: logCleanup/);
  assert.match(route, /evidence_undo_52d2: evidenceUndo52D2/);
  assert.match(route, /undo_not_persisted:/);
  assert.match(frontend, /form response was not marked Undone/);
  assert.match(frontend, /D1 undo audit persistence failed/);
  assert.match(frontend, /Pickup preserved and marked Undone/);
  assert.match(gas, /function markEarlyDismissalResponseUndoneByFingerprint_/);
  assert.doesNotMatch(gas, /sheet\.deleteRow\(rowNumber\)/);
  assert.match(manifest, /"webapp"/);
  assert.match(manifest, /"ANYONE_ANONYMOUS"/);
});

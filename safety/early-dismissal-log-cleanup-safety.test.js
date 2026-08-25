const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const route = read('cf-redcake/red-cake-77d5/src/routes/early-dismissal.js');
const gas = read('Google Apps Script/clasp-projects/early-dismissal/UndoCleanup.js');

test('SAFETY: live Early Dismissal log cleanup is exact-fingerprint and token protected', () => {
  assert.match(route, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(route, /EARLY_DISMISSAL_GAS_URL/);
  assert.match(route, /action: 'early_dismissal_log_cleanup'/);
  assert.match(gas, /EARLY_DISMISSAL_CLEANUP_ACTION_ = 'early_dismissal_log_cleanup'/);
  assert.match(gas, /getProperty\('WORKER_ADMIN_TOKEN'\)/);
  assert.match(gas, /earlyDismissalLogFingerprint_/);
  assert.match(gas, /sheet\.deleteRow\(rowNumber\)/);
  assert.match(gas, /configureEarlyDismissalResponseSheetFromActive/);
});

test('SAFETY: Practice Undo exits before any live GAS callback', () => {
  const start = route.indexOf('async function cleanupEarlyDismissalLog');
  const end = route.indexOf('function makeStudentContextLoader', start);
  const fn = route.slice(start, end);
  const practicePos = fn.indexOf("if (modeInfo?.practice)");
  const fetchPos = fn.indexOf('await fetch(url');
  assert.ok(practicePos >= 0 && fetchPos > practicePos, 'Practice guard must precede cleanup fetch');
  assert.match(fn, /reason: 'practice_mode'/);
});

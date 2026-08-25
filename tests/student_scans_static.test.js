const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/student-scans.js');
const service = read('cf-redcake/red-cake-77d5/src/services/student-scans.js');

test('Student Scans modular route owns roster and scans-query report reads', () => {
  assert.match(index, /handleStudentScansRequest/);
  assert.match(route, /STUDENT_SCANS_PATHS/);
  assert.match(route, /handleRoster/);
  assert.match(route, /handleScansQuery/);
});

test('Student Scans service preserves Practice merge and Live GAS contracts', () => {
  assert.match(service, /action: 'roster'/);
  assert.match(service, /action: 'scans_query'/);
  assert.match(service, /const merged = new Map\(\)/);
  assert.match(service, /listStudentScanCorrections/);
  assert.match(service, /Math\.min\(Math\.max\(Number\(max \|\| 5000\)/);
});

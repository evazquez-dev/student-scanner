const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desk = fs.readFileSync(path.resolve(__dirname, '../admin/visitor_desk.js'), 'utf8');

function sectionBetween(startNeedle, endNeedle) {
  const start = desk.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = desk.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing end marker: ${endNeedle}`);
  return desk.slice(start, end);
}

assert.match(desk, /function\s+badgeVisitLine\s*\(/, 'Visitor Desk should centralize badge visit-line logic');
assert.match(
  desk,
  /if\s*\(\s*v\?\.purpose\s*===\s*'student_pickup'\s*\)\s*return\s+purposeLabel\(v\)\s*\|\|\s*'Student Pickup'/,
  'Student Pickup badges must use a generic purpose label'
);
assert.doesNotMatch(
  desk,
  /const\s+visitLine\s*=\s*esc\s*\(\s*v\.destination\s*\|\|\s*purposeLabel/,
  'Badge rendering must not directly prefer destination for every purpose'
);

const idScannerSection = sectionBetween(
  'const idScanner = Shared.createScannerBuffer',
  'async function saveIdVerification'
);
assert.match(
  idScannerSection,
  /multiline:\s*true/,
  'ID scanner should use multiline quiet-time buffering'
);
assert.match(idScannerSection, /settleMs\s*:/, 'ID scanner should configure settleMs');
assert.match(idScannerSection, /minLength\s*:/, 'ID scanner should configure minLength');
assert.doesNotMatch(
  idScannerSection,
  /Shared\.createScannerBuffer\([\s\S]*\},\s*\{\s*minLength:\s*40\s*\}\s*\)\s*;/,
  'ID scanner must not remain single-line with only minLength: 40'
);

const saveIdSection = sectionBetween(
  'async function saveIdVerification',
  'function openStudentDialog'
);
const editCallIndex = saveIdSection.indexOf("await api('/admin/visitor/edit'");
assert.notEqual(editCallIndex, -1, 'missing visitor edit API call');
const editCallEnd = saveIdSection.indexOf('});', editCallIndex);
assert.notEqual(editCallEnd, -1, 'visitor edit API call should close normally');
const editCallSection = saveIdSection.slice(editCallIndex, editCallEnd + 3);
assert.doesNotMatch(editCallSection, /multiline|settleMs|minLength/, 'scanner configuration must not be passed to api()');

console.log('visitor_frontend_static tests passed');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('student-scanner/admin/student_view.html');
const js = read('student-scanner/admin/student_view.js');
const service = read('cf-redcake/red-cake-77d5/src/services/student-view.js');

test('Phase 2 organizes Student Lookup into six accessible information tabs', () => {
  for (const tab of ['overview','schedule','attendance','scans','behavior','communications']) {
    assert.match(html, new RegExp(`role="tab"[^>]+data-tab="${tab}"|data-tab="${tab}"[^>]+role="tab"`));
    assert.match(html, new RegExp(`role="tabpanel"[^>]+data-panel="${tab}"|data-panel="${tab}"[^>]+role="tabpanel"`));
  }
  assert.match(js, /ArrowRight/);
  assert.match(js, /ArrowLeft/);
  assert.match(js, /Home/);
  assert.match(js, /End/);
});

test('Phase 2 dashboard exposes full-day assigned schedule and per-period attendance while preserving legacy current fields', () => {
  assert.match(service, /day\n\s*\};/);
  assert.match(service, /attendance_today:\s*attendanceToday/);
  assert.match(service, /attendance,/);
  assert.match(service, /session/);
  assert.match(service, /grade:\s*String\(rec\.g/);
  assert.match(js, /dashboard\?\.schedule\?\.day/);
  assert.match(js, /dashboard\?\.attendance_today/);
});

test('Scans, behavior, and communications are lazy student-specific reads', () => {
  assert.match(js, /\/admin\/scans_query/);
  assert.match(js, /\/admin\/behavior\/list/);
  assert.match(js, /\/admin\/communications\/student/);
  assert.match(js, /requested === 'scans'/);
  assert.match(js, /requested === 'behavior'/);
  assert.match(js, /requested === 'communications'/);
});

test('Behavior history remains permission-scoped and exact-filtered to the selected OSIS', () => {
  assert.match(js, /url\.searchParams\.set\('q', selected\.osis\)/);
  assert.match(js, /String\(row\?\.osis \|\| ''\)\.trim\(\) === selected\.osis/);
  assert.match(html, /behavior logs you currently have permission to view/i);
  assert.doesNotMatch(js, /include_deleted.*1/);
});

test('Lazy tab responses cannot render onto a newly selected student', () => {
  assert.match(js, /let selectionSequence = 0/);
  assert.match(js, /const seq = \+\+selectionSequence/);
  assert.match(js, /if \(seq !== selectionSequence\) return/);
  assert.match(js, /resetLazyTabs\(\)/);
});

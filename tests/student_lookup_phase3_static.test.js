const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('student-scanner/admin/student_view.html');
const js = read('student-scanner/admin/student_lookup_phase3.js');

test('Phase 3 is layered after the existing Student Lookup Phase 2 script', () => {
  assert.match(html, /<script src="\.\/student_view\.js" defer><\/script>\s*<script src="\.\/student_lookup_phase3\.js" defer><\/script>/);
  assert.match(js, /Student Actions/);
  assert.match(js, /Phone Pass/);
  assert.match(js, /Staff Pull/);
  assert.match(js, /Reflection Hold/);
  assert.match(js, /Early Dismissal/);
  assert.match(js, /Incident/);
});

test('Phase 3 reads the existing workflow APIs rather than creating parallel state', () => {
  for (const endpoint of [
    '/admin/student/dashboard',
    '/admin/phone_pass/options',
    '/admin/phone_pass/context',
    '/admin/staff_pull/options',
    '/admin/staff_pull/context',
    '/admin/reflection_hold/options',
    '/admin/early_dismissals'
  ]) assert.ok(js.includes(endpoint), `missing ${endpoint}`);
  assert.match(js, /x-admin-session/);
  assert.match(js, /credentials:\s*'include'/);
});

test('Mutating quick actions remain explicit, confirmed, permission-aware, and View-As guarded', () => {
  assert.match(js, /isReadOnly\(\)/);
  assert.match(js, /can\?\.reflection_hold/);
  assert.match(js, /can\?\.incident_creator/);
  assert.match(js, /window\.confirm\(message\)/);
  for (const endpoint of [
    '/admin/phone_pass/grant',
    '/admin/phone_pass/return',
    '/admin/staff_pull/pull',
    '/admin/staff_pull/release',
    '/admin/reflection_hold/release',
    '/admin/early_dismissals/undo'
  ]) assert.ok(js.includes(endpoint), `missing ${endpoint}`);
});

test('Incident launch preserves selected student and live lookup context', () => {
  assert.match(js, /incident_creator\.html/);
  assert.match(js, /osis:state\.osis/);
  assert.match(js, /source:'student_lookup'/);
  assert.match(js, /room:ctx\.room/);
  assert.match(js, /periodLocal:ctx\.periodLocal/);
  assert.match(js, /date:ctx\.date/);
});

test('Phase 3 selection loads are sequence guarded', () => {
  assert.match(js, /const seq = \+\+state\.seq/);
  assert.match(js, /if \(seq !== state\.seq\) return/);
});

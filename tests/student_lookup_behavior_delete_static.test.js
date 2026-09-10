const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

test('Student Lookup behavior delete is original poster or Super Admin only', () => {
  const source = read('student-scanner/admin/student_view.js');
  assert.match(source, /function isSuperAdmin\(\)/);
  assert.match(source, /function canDeleteBehavior\(row\)/);
  assert.match(source, /isSuperAdmin\(\) \|\| actor === viewer/);
  assert.match(source, /data-behavior-delete-id/);
  assert.match(source, /\/admin\/behavior\/update/);
  assert.match(source, /isDeleted:true/);
  assert.doesNotMatch(source, /include_deleted.*1/);
});

test('Logged Behaviors uses the same delete and restore rule', () => {
  const source = read('student-scanner/admin/behavior_history.js');
  assert.match(source, /function canDeleteBehaviorRow\(row\)/);
  assert.match(source, /isSuperAdminViewer\(\) \|\| behaviorActorIsViewer\(row\)/);
  assert.match(source, /canDeleteBehaviorRow\(row\)/);
});

test('D1 enforces the Super Admin-or-original-poster delete rule', () => {
  const source = read('cf-redcake/red-cake-77d5/src/services/behavior-d1.js');
  assert.match(source, /const owner = d1Email\(prior\.actor_email\) === actorEmail/);
  assert.match(source, /const canDeleteRestore = actorRole === 'super_admin' \|\| owner/);
  assert.match(source, /if \(set_deleted && !canDeleteRestore\)/);
  assert.match(source, /if \(!set_deleted && !admin && !owner\)/);
  assert.match(source, /INSERT INTO behavior_audit/);
});

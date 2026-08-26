const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/roster-search.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const contacts = read('student-scanner/admin/student_contacts.js');

function blockBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

test('SAFETY: shared teacher-facing roster search is intercepted before the legacy admin-only block', () => {
  assert.match(index, /ROSTER_SEARCH_PATHS\.has\(path\)/);
  assert.match(route, /'\/admin\/roster\/search'/);
  assert.match(route, /loadBaseAccess\(req, env, ctx\)/);
  assert.doesNotMatch(route, /forbidden_role|isAdminLike|super_admin|requireAdminOrRoles/);
  assert.match(contacts, /\/admin\/roster\/search\?q=/);
  assert.match(worker, /if \(path === "\/admin\/roster\/search"\)/);
});

test('SAFETY: Contact Correction Review remains admin-only', () => {
  const reviewBlock = blockBetween(worker, 'if (path === "/admin/contacts/review")', 'if (path === "/admin/contacts/review/update")');
  assert.match(reviewBlock, /requireAdminOrToken\(req, env\)/);
  assert.match(reviewBlock, /isAdminLikeRole_\(who\.role\)/);
  assert.match(reviewBlock, /forbidden_role/);
});

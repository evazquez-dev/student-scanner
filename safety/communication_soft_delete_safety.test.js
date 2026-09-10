// COMMUNICATION_SOFT_DELETE_V1
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const worker = path.join(root, 'cf-redcake/red-cake-77d5');
const read = (p) => fs.readFileSync(p, 'utf8');
const route = read(path.join(worker, 'src/routes/communications-d1.js'));
const service = read(path.join(worker, 'src/services/communications-d1.js'));
const contacts = read(path.join(root, 'student-scanner/admin/student_contacts.js'));
const studentView = read(path.join(root, 'student-scanner/admin/student_view.js'));

test('SAFETY: communication soft-delete is author/admin guarded and audited', () => {
  assert.match(route, /\/admin\/communications\/delete/);
  assert.match(route, /mutationOriginAllowed\(req, env\)/);
  assert.match(route, /viewAsReadOnlyResponse\(accessResponse, access\)/);
  assert.match(service, /softDeleteCommunicationD1/);
  assert.match(service, /!isAdminLike\(actor\) && d1Email\(prior\.actor_email\) !== actorEmail/);
  assert.match(service, /VALUES \(\?, 'deleted'/);
  assert.match(service, /SET is_deleted = 1/);
});

test('SAFETY: deleted communications are hidden by default and admin-only to reveal/restore', () => {
  assert.match(service, /includeDeleted = false/);
  assert.match(service, /const deletedClause = includeDeleted \? '' : ' AND is_deleted = 0'/);
  assert.match(route, /includeDeleted && !isAdminLike\(access\)/);
  assert.match(route, /\/admin\/communications\/restore/);
  assert.match(service, /if \(!isAdminLike\(actor\)\) return \{ ok:false, status:403, error:'forbidden' \}/);
  assert.match(service, /VALUES \(\?, 'restored'/);
  assert.match(service, /SET is_deleted = 0/);
});

test('SAFETY: normal dashboards continue excluding deleted records', () => {
  assert.match(service, /include_deleted = false/);
  assert.match(service, /const deletedClause = include_deleted \? '' : ' AND is_deleted = 0'/);
});

test('frontend exposes delete to owners/admins but Show deleted and Restore only to admins', () => {
  for (const source of [contacts, studentView]) {
    assert.match(source, /canDeleteCommunication/);
    assert.match(source, /actor_email/);
    assert.match(source, /Mark deleted/);
    assert.match(source, /isCommunicationAdmin/);
    assert.match(source, /Show deleted/);
    assert.match(source, /Restore/);
  }
  assert.match(contacts, /include_deleted/);
  assert.match(studentView, /show_deleted/);
  assert.doesNotMatch(studentView, /include_deleted.*1/);
  assert.match(route, /show_deleted/);
});

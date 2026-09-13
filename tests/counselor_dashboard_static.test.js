const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('counselor dashboard keeps dedicated note/audit tables and adds team-isolation migration', () => {
  const base = read('cf-redcake/red-cake-77d5/migrations/0013_counselor_dashboard.sql');
  const team = read('cf-redcake/red-cake-77d5/migrations/0014_counselor_team_isolation.sql');
  assert.match(base, /CREATE TABLE IF NOT EXISTS counselor_notes/);
  assert.match(base, /CREATE TABLE IF NOT EXISTS counselor_note_audit/);
  assert.match(team, /ADD COLUMN counselor_team/);
  assert.match(team, /college/);
  assert.match(team, /social_work/);
  assert.match(team, /academic/);
  assert.match(team, /DEFAULT 'unassigned'/);
  assert.match(team, /details_json/);
});

test('counselor notes remain separate from Communications and all reads are team-scoped', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/counselor-notes.js');
  assert.doesNotMatch(service, /createCommunicationD1|communications\s*\(/);
  assert.match(service, /WHERE counselor_team = \? AND student_number = \?/);
  assert.match(service, /WHERE counselor_team = \? AND archived = 0/);
  assert.match(service, /AND counselor_team = \?/);
  assert.match(service, /counselor_note_audit/);
});

test('server exposes three independent counselor team permission flags', () => {
  const session = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
  assert.match(session, /COUNSELOR_COLLEGE_ALLOWLIST_KEY/);
  assert.match(session, /COUNSELOR_SOCIAL_WORK_ALLOWLIST_KEY/);
  assert.match(session, /COUNSELOR_ACADEMIC_ALLOWLIST_KEY/);
  assert.match(session, /counselor_college:/);
  assert.match(session, /counselor_social_work:/);
  assert.match(session, /counselor_academic:/);
  assert.match(session, /counselor_notes_manage:\s*isSuperAdmin/);
});

test('counselor route requires allowed team instead of trusting client category', () => {
  const route = read('cf-redcake/red-cake-77d5/src/routes/counselor-notes.js');
  assert.match(route, /allowedTeams\(access\)/);
  assert.match(route, /counselor_team_forbidden/);
  assert.match(route, /counselor_team_required/);
  assert.match(route, /resolveTeam\(access, raw\)/);
  assert.match(route, /createCounselorNote\(env, team/);
  assert.match(route, /getCounselorStudentBundle\(\s*env,\s*resolved\.team/);
});

test('team access management supports multiple team memberships and retains old generic list only as migration information', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/access-management.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/access-management.js');
  assert.match(service, /loadCounselorTeamAccess/);
  assert.match(service, /saveCounselorTeamAccess/);
  assert.match(service, /legacy_generic/);
  assert.match(route, /\/admin\/counselor_team_access/);
  assert.match(route, /handleCounselorTeamAccess/);
});

test('dashboard has team selector, team-specific quick templates, and team-specific structured fields', () => {
  const html = read('student-scanner/admin/counselor_dashboard.html');
  const js = read('student-scanner/admin/counselor_dashboard.js');
  assert.match(html, /Counselor category/);
  assert.match(html, /Counselor Notes Access by Team/);
  assert.match(js, /College Counseling/);
  assert.match(js, /Social Work/);
  assert.match(js, /Academic Counseling/);
  assert.match(js, /Financial Aid\/FAFSA/);
  assert.match(js, /Crisis\/Urgent Concern/);
  assert.match(js, /Credits\/Graduation/);
  assert.match(js, /postsecondary_plan/);
  assert.match(js, /support_focus/);
  assert.match(js, /academic_focus/);
});

test('pre-team notes fail closed as unassigned and require deliberate Super Admin assignment', () => {
  const service = read('cf-redcake/red-cake-77d5/src/services/counselor-notes.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/counselor-notes.js');
  const js = read('student-scanner/admin/counselor_dashboard.js');
  assert.match(service, /counselor_team = 'unassigned'/);
  assert.match(service, /assignLegacyCounselorNoteTeam/);
  assert.match(route, /\/admin\/counselor\/legacy_unassigned/);
  assert.match(route, /\/admin\/counselor\/legacy_assign/);
  assert.match(js, /Pre-team notes needing assignment|legacyNotes/);
});

test('student lookup continues to expose Counselor Notes only through counselor access alias', () => {
  const js = read('student-scanner/admin/student_view.js');
  assert.match(js, /access\?\.can\?\.counselor_notes/);
  assert.match(js, /counselor_dashboard\.html/);
  assert.match(js, /Counselor Notes/);
});

test('navigation keeps Counselor Dashboard gated by counselor_dashboard capability', () => {
  const nav = read('student-scanner/admin/nav.js');
  const brand = read('student-scanner/admin/brand.js');
  assert.match(nav, /counselor_dashboard/);
  assert.match(brand, /counselor_dashboard/);
});

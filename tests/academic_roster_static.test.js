const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const route = read('cf-redcake/red-cake-77d5/src/routes/academic-roster.js');
const service = read('cf-redcake/red-cake-77d5/src/services/academic-roster.js');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const readme = read('cf-redcake/red-cake-77d5/src/README.md');
const gas = read('Google Apps Script/clasp-projects/student-scanner-gas/Code.js');

test('academic roster dedicated endpoints are owned by modular route', () => {
  assert.match(index, /ACADEMIC_ROSTER_PATHS, handleAcademicRosterRequest/);
  assert.match(index, /ACADEMIC_ROSTER_PATHS\.has\(path\)/);
  for (const pathName of [
    '/admin/academic_roster_source',
    '/admin/academic_roster_health',
    '/admin/academic_course_map',
    '/admin/academic_roster_rebuild'
  ]) {
    assert.match(route, new RegExp(pathName.replace(/\//g, '\\/')));
  }
  assert.match(route, /loadBaseAccess/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
});

test('academic roster service owns source normalization compilation persistence and dictionary', () => {
  assert.match(service, /ACADEMIC_ROSTER_SOURCE_KEY\s*=\s*'academic_roster_source_v1'/);
  assert.match(service, /ACADEMIC_ROSTER_KEY\s*=\s*'academic_roster_v1'/);
  assert.match(service, /ACADEMIC_COURSE_MAP_KEY\s*=\s*'academic_course_code_map_v1'/);
  assert.match(service, /function normalizeAcademicRosterSource/);
  assert.match(service, /function buildAcademicRoster/);
  assert.match(service, /function mapAcademicCode/);
  assert.match(service, /academic_roster_large_drop_rejected: enrollments/);
  assert.match(service, /academic_roster_large_drop_rejected: students/);
  assert.match(service, /Only PowerSchool\/full-roster source codes are translated/);
  assert.match(service, /staff_teacher_match_duplicate_email/);
  assert.match(service, /roster_section_without_teacher/);
});

test('academic control data remains live while its audit follows Practice scope', () => {
  assert.match(service, /const PRACTICE_KV_PREFIX = 'practice:v1:'/);
  assert.match(service, /writeAcademicAudit/);
  assert.match(service, /practice \? \{ expirationTtl: PRACTICE_KV_TTL_SEC \} : undefined/);
  assert.doesNotMatch(service, /dowOperationalKey/);
});

test('dedicated GAS academic push already targets modular endpoint without GAS changes', () => {
  assert.match(gas, /function pushAcademicRosterToWorker_\(\)/);
  assert.match(gas, /const url = base \+ '\/admin\/academic_roster_source'/);
});

test('schedule bundle remains an explicit legacy bridge for its optional academic payload', () => {
  assert.ok(worker.includes('path === "/admin/push_schedule_bundle"'));
  assert.match(worker, /payload\.academic_roster_source/);
  assert.match(readme, /push_schedule_bundle/);
  assert.match(readme, /legacy bridge/i);
});

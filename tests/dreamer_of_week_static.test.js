const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const gas = read('Google Apps Script/clasp-projects/student-scanner-gas/Code.js');

test('persistent academic roster is separate from the daily student class map', () => {
  assert.match(worker, /ACADEMIC_ROSTER_SOURCE_KEY\s*=\s*"academic_roster_source_v1"/);
  assert.match(worker, /ACADEMIC_ROSTER_KEY\s*=\s*"academic_roster_v1"/);
  assert.match(worker, /saveAcademicRosterSource_/);
  assert.match(worker, /retained_last_good/);
  assert.match(gas, /Academic roster is additive\. Never let a source\/config problem break the existing/);
  assert.match(gas, /course requests/);
  assert.match(gas, /Full student enrollments\. This is intentionally NOT TODAY Sched \/ FINAL\./);
});

test('academic roster uses exact Teacher Assignments Match identity and reports mismatches', () => {
  assert.match(gas, /Teacher Assignments Match/);
  assert.match(worker, /staff_teacher_match_missing/);
  assert.match(worker, /staff_teacher_match_duplicate_email/);
  assert.match(worker, /shared_assignment/);
  assert.match(worker, /staff_teacher_match_missing_email/);
  assert.match(worker, /staff_match_without_teacher_assignment/);
  assert.match(worker, /Please contact Erick or Edwin/);
});

test('course dictionary supports base-course aliases and exact-section aliases', () => {
  const start = worker.indexOf('var ACADEMIC_ROSTER_SOURCE_KEY');
  const end = worker.indexOf('async function loadAcademicRoster_');
  assert.ok(start >= 0 && end > start, 'academic roster helper block should exist');
  const code = worker.slice(start, end) + '\nthis.__test = { mapAcademicCode_, buildAcademicRoster_ };';
  const context = { console, Set, Object, Array, String, Number, Date, Math, JSON, __name: () => {} };
  vm.createContext(context);
  vm.runInContext(code, context);
  const { mapAcademicCode_, buildAcademicRoster_ } = context.__test;
  const map = { PE1001: 'PE', 'ABC.9': 'LOCAL.9' };
  assert.equal(mapAcademicCode_('PE1001.6A', map), 'PE.6A');
  assert.equal(mapAcademicCode_('ABC.9', map), 'LOCAL.9');

  const roster = buildAcademicRoster_({
    generated_at_iso: '2026-08-21T12:00:00-04:00', date: '2026-08-21',
    students: [{ ps_id:'1', osis:'100000001', name:'Student One', grade:'9', email:'s@example.org' }],
    staff: [{ email:'teacher@example.org', name:'Teacher One', teacher_assignment_match:'TeacherOne' }],
    teacher_assignments: [{ teacher_assignment_match:'TeacherOne', section_code:'PE.6A' }],
    course_requests: [{ student_ps_id:'1', course_code:'PE1001', section_code:'PE1001.6A', grade:'9' }],
    course_names: [{ course_code:'PE1001', name:'Physical Education' }], section_names: []
  }, [{ source_code:'PE1001', target_code:'PE', note:'local code' }]);
  assert.ok(roster.courses.PE);
  assert.deepEqual(Array.from(roster.teachers_by_email['teacher@example.org'].courses.PE.students), ['100000001']);
  assert.equal(roster.health.error_count, 0);
});


test('Teacher Assignments Match supports shared labels for multiple unique staff emails', () => {
  const start = worker.indexOf('var ACADEMIC_ROSTER_SOURCE_KEY');
  const end = worker.indexOf('async function loadAcademicRoster_');
  assert.ok(start >= 0 && end > start, 'academic roster helper block should exist');
  const code = worker.slice(start, end) + '\nthis.__test = { buildAcademicRoster_ };';
  const context = { console, Set, Object, Array, String, Number, Date, Math, JSON, __name: () => {} };
  vm.createContext(context);
  vm.runInContext(code, context);
  const { buildAcademicRoster_ } = context.__test;

  const roster = buildAcademicRoster_({
    generated_at_iso: '2026-08-21T13:00:00-04:00', date: '2026-08-21',
    students: [
      { ps_id:'1', osis:'100000001', name:'Student One', grade:'11' },
      { ps_id:'2', osis:'100000002', name:'Student Two', grade:'12' }
    ],
    staff: [
      { email:'advisor1@example.org', name:'Advisor One', teacher_assignment_match:'CA' },
      { email:'advisor2@example.org', name:'Advisor Two', teacher_assignment_match:'CA' }
    ],
    teacher_assignments: [{ teacher_assignment_match:'CA', section_code:'CA100.1' }],
    course_requests: [
      { student_ps_id:'1', course_code:'CA100', section_code:'CA100.1', grade:'11' },
      { student_ps_id:'2', course_code:'CA100', section_code:'CA100.1', grade:'12' }
    ],
    course_names: [{ course_code:'CA100', name:'College Advising' }],
    section_names: []
  }, []);

  assert.equal(roster.health.error_count, 0);
  assert.equal(roster.health.counts.mapped_teachers, 2);
  assert.equal(roster.teacher_assignment_status.ca.status, 'shared_assignment');
  assert.deepEqual(Array.from(roster.teacher_assignment_status.ca.emails).sort(), ['advisor1@example.org','advisor2@example.org']);
  assert.ok(roster.teachers_by_email['advisor1@example.org'].courses.CA100);
  assert.ok(roster.teachers_by_email['advisor2@example.org'].courses.CA100);
  assert.equal(roster.staff_mapping_by_email['advisor1@example.org'].status, 'shared_assignment');
  assert.equal(roster.staff_mapping_by_email['advisor2@example.org'].status, 'shared_assignment');
});

test('shared Teacher Assignments Match still flags duplicate rows for the same email', () => {
  const start = worker.indexOf('var ACADEMIC_ROSTER_SOURCE_KEY');
  const end = worker.indexOf('async function loadAcademicRoster_');
  const code = worker.slice(start, end) + '\nthis.__test = { buildAcademicRoster_ };';
  const context = { console, Set, Object, Array, String, Number, Date, Math, JSON, __name: () => {} };
  vm.createContext(context);
  vm.runInContext(code, context);
  const { buildAcademicRoster_ } = context.__test;

  const roster = buildAcademicRoster_({
    generated_at_iso: '2026-08-21T13:00:00-04:00', date: '2026-08-21',
    students: [{ ps_id:'1', osis:'100000001', name:'Student One', grade:'11' }],
    staff: [
      { email:'advisor1@example.org', name:'Advisor One', teacher_assignment_match:'CA' },
      { email:'advisor1@example.org', name:'Advisor One Duplicate', teacher_assignment_match:'CA' },
      { email:'advisor2@example.org', name:'Advisor Two', teacher_assignment_match:'CA' }
    ],
    teacher_assignments: [{ teacher_assignment_match:'CA', section_code:'CA100.1' }],
    course_requests: [{ student_ps_id:'1', course_code:'CA100', section_code:'CA100.1', grade:'11' }],
    course_names: [], section_names: []
  }, []);

  assert.ok(roster.health.issues.some((i) => i.type === 'staff_teacher_match_duplicate_email' && i.email === 'advisor1@example.org'));
  assert.ok(roster.teachers_by_email['advisor2@example.org']);
  assert.equal(roster.teachers_by_email['advisor1@example.org'], undefined);
});

test('DOW enforces course-wide 2 to 8 recipient model with independent grade-band cycles', () => {
  assert.match(worker, /DOW_MIN_PER_COURSE\s*=\s*2/);
  assert.match(worker, /DOW_MAX_PER_COURSE\s*=\s*8/);
  assert.match(worker, /DOW_BANDS\s*=\s*\["9_10", "11_12"\]/);
  assert.match(worker, /course_recipient_limit_reached/);
  assert.match(worker, /dow_courses_incomplete/);
  assert.match(worker, /archive[d_]?recipients|archived_recipients/);
  assert.match(worker, /student_not_in_teachers_sections/);
});

test('DOW page and System Settings expose the first-pass controls', () => {
  const page = read('student-scanner/admin/dreamer_of_week.html');
  const js = read('student-scanner/admin/dreamer_of_week.js');
  const adminHtml = read('student-scanner/admin/index.html');
  const adminJs = read('student-scanner/admin/admin.js');
  const nav = read('student-scanner/admin/nav.js');
  assert.match(page, /Select 2–8 recipients per course/);
  assert.match(js, /\/admin\/dow\/state/);
  assert.match(js, /\/admin\/dow\/recipient/);
  assert.match(js, /\/admin\/dow\/reset/);
  assert.match(adminHtml, /Course Code Dictionary/);
  assert.match(adminJs, /\/admin\/academic_course_map/);
  assert.match(adminJs, /\/admin\/academic_roster_health/);
  assert.match(nav, /dreamer_of_week\.html/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const index = read('cf-redcake/red-cake-77d5/src/index.js');
const academicRoute = read('cf-redcake/red-cake-77d5/src/routes/academic-roster.js');
const academicService = read('cf-redcake/red-cake-77d5/src/services/academic-roster.js');
const dowRoute = read('cf-redcake/red-cake-77d5/src/routes/dreamer-of-week.js');
const dowService = read('cf-redcake/red-cake-77d5/src/services/dreamer-of-week.js');
const gas = read('Google Apps Script/clasp-projects/student-scanner-gas/Code.js');

test('persistent academic roster is modular and separate from the daily student class map', () => {
  assert.match(index, /from '\.\/routes\/academic-roster\.js'/);
  assert.match(index, /ACADEMIC_ROSTER_PATHS\.has\(path\)/);
  assert.match(academicService, /ACADEMIC_ROSTER_SOURCE_KEY\s*=\s*'academic_roster_source_v1'/);
  assert.match(academicService, /ACADEMIC_ROSTER_KEY\s*=\s*'academic_roster_v1'/);
  assert.match(academicService, /saveAcademicRosterSource/);
  assert.match(academicRoute, /retained_last_good/);
  assert.match(gas, /Academic roster is additive\. Never let a source\/config problem break the existing/);
  assert.match(gas, /course requests/);
  assert.match(gas, /Full student enrollments\. This is intentionally NOT TODAY Sched \/ FINAL\./);
});

test('academic roster uses exact Teacher Assignments Match identity and reports mismatches', () => {
  assert.match(gas, /Teacher Assignments Match/);
  assert.match(academicService, /staff_teacher_match_missing/);
  assert.match(academicService, /staff_teacher_match_duplicate_email/);
  assert.match(academicService, /shared_assignment/);
  assert.match(academicService, /staff_teacher_match_missing_email/);
  assert.match(academicService, /staff_match_without_teacher_assignment/);
  assert.match(dowService, /Please contact Erick or Edwin/);
});

test('course dictionary supports base-course aliases and exact-section aliases in the modular service', () => {
  assert.match(academicService, /function mapAcademicCode/);
  assert.match(academicService, /const targetBase = mapIndex\?\.\[base\]/);
  assert.match(academicService, /return `\$\{targetBase\}\$\{suffix\}`/);
  assert.match(academicService, /Teacher Assignments is already the local\/EagleNEST side of the dictionary/);
});

test('shared Teacher Assignments Match and duplicate-email protections are owned by the modular compiler', () => {
  assert.match(academicService, /validTeachers\.length > 1 \? 'shared_assignment' : 'ok'/);
  assert.match(academicService, /staff_teacher_match_duplicate_email/);
  assert.match(academicService, /duplicate_rows: dup\.rows/);
  assert.match(academicService, /resolved\.shared \? 'shared_assignment' : 'ok'/);
});

test('DOW is routed through modular source and enforces course-wide 2 to 8 recipient model', () => {
  assert.match(index, /from '\.\/routes\/dreamer-of-week\.js'/);
  assert.match(index, /path\.startsWith\('\/admin\/dow\/'\)/);
  assert.match(index, /handleDreamerOfWeekRequest/);
  assert.match(dowRoute, /'\/admin\/dow\/state'/);
  assert.match(dowRoute, /'\/admin\/dow\/recipient'/);
  assert.match(dowRoute, /'\/admin\/dow\/reset'/);
  assert.match(dowRoute, /viewAsReadOnlyResponse/);
  assert.match(dowService, /DOW_MIN_PER_COURSE\s*=\s*2/);
  assert.match(dowService, /DOW_MAX_PER_COURSE\s*=\s*8/);
  assert.match(dowService, /DOW_BANDS\s*=\s*\['9_10', '11_12'\]/);
  assert.match(dowService, /course_recipient_limit_reached/);
  assert.match(dowService, /dow_courses_incomplete/);
  assert.match(dowService, /archived_recipients/);
  assert.match(dowService, /student_not_in_teachers_sections/);
});

test('DOW service owns Practice-scoped cycles selections history archives and audits', () => {
  assert.match(dowService, /const PRACTICE_KV_PREFIX = 'practice:v1:'/);
  assert.match(dowService, /const PRACTICE_KV_TTL_SEC = 36 \* 60 \* 60/);
  assert.match(dowService, /dowOperationalKey\(modeInfo, `\$\{DOW_CYCLE_KEY_PREFIX\}\$\{band\}`\)/);
  assert.match(dowService, /dowOperationalKey\(modeInfo, `\$\{DOW_SELECTION_KEY_PREFIX\}\$\{band\}:\$\{cycleId\}:`\)/);
  assert.match(dowService, /dowOperationalKey\(modeInfo, DOW_HISTORY_COUNTS_KEY\)/);
  assert.match(dowService, /dowOperationalKey\(modeInfo, `\$\{DOW_ARCHIVE_KEY_PREFIX\}\$\{band\}:\$\{cycle\.cycle_id\}`\)/);
  assert.match(dowService, /writeDowAudit/);
  assert.match(dowService, /fail_closed: true/);
});

test('DOW page and System Settings expose the existing controls without frontend changes', () => {
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

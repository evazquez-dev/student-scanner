'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.join(__dirname, '..', 'admin', 'gradebook_analytics.js');
const code = fs.readFileSync(frontend, 'utf8');
const begin = '// EAGLENEST_GRADEBOOK_TEACHER_SUMMARY_V1_BEGIN';
const end = '// EAGLENEST_GRADEBOOK_TEACHER_SUMMARY_V1_END';
const start = code.indexOf(begin), stop = code.indexOf(end);
assert.ok(start >= 0 && stop > start, 'patched summary helper exists');
assert.match(code, /function\s+renderTable\s*\(\s*\)\s*\{\s*gbRefreshTeacherSummary_\(\);/,
  'renderTable refreshes KPI cards alongside table rows');
const snippet = code.slice(start, stop + end.length);

const all = {
  section_count: 3,
  assignment_count: 24,
  due_count: 17,
  fully_graded_count: 12,
  outstanding_count: 5,
  expected_scores: 30,
  entered_scores: 20,
  grading_completion: 66.67,
  policy_warning_assignment_count: 4,
  policy_warning_count: 7,
  note: 'whole set'
};
const rows = [
  {section_dcid: '1', teacher_email: 'alpha@school.org', additional_teacher_emails: ['beta@school.org', 'ALPHA@SCHOOL.ORG'],
   assignment_count: 10, due_count: 8, fully_graded_count: 6, outstanding_count: 2,
   expected_scores: 20, entered_scores: 15, policy_warning_assignment_count: 3, policy_warning_count: 4},
  {section_dcid: '2', teacher_email: 'beta@school.org', additional_teacher_emails: ['alpha@school.org'],
   assignment_count: 6, due_count: 4, fully_graded_count: 4, outstanding_count: 0,
   expected_scores: 10, entered_scores: 10, policy_warning_assignment_count: 1, policy_warning_count: 3},
  {section_dcid: '3', teacher_email: 'other@school.org', additional_teacher_emails: [],
   assignment_count: 8, due_count: 5, fully_graded_count: 2, outstanding_count: 3,
   expected_scores: 0, entered_scores: 0, policy_warning_assignment_count: 0, policy_warning_count: 0}
];

function context(teacher = '') {
  const result = {value: null};
  const picker = {value: teacher};
  const vmContext = {CURRENT: {summary: all}, SECTION_ROWS: rows,
    document: {getElementById(id) {return id === 'teacherFilter' ? picker : null;}},
    renderSummary(summary) {result.value = summary;}};
  const fns = vm.runInNewContext(`${snippet}\n({gbSummaryForSelectedTeacher_, gbRefreshTeacherSummary_})`, vmContext);
  return { ...fns, result, vmContext, picker };
}

test('all teachers keeps the authoritative Worker summary', () => {
  const {gbSummaryForSelectedTeacher_} = context();
  const result = gbSummaryForSelectedTeacher_(rows, '', all);
  assert.deepEqual({...result}, all);
});

test('selected primary teacher recomputes all six KPI values and policy counts', () => {
  const {gbSummaryForSelectedTeacher_} = context();
  const result = gbSummaryForSelectedTeacher_(rows, '  ALPHA@SCHOOL.ORG  ', all);
  assert.equal(result.section_count, 2);
  assert.equal(result.assignment_count, 16);
  assert.equal(result.due_count, 12);
  assert.equal(result.fully_graded_count, 10);
  assert.equal(result.outstanding_count, 2);
  assert.equal(result.expected_scores, 30);
  assert.equal(result.entered_scores, 25);
  assert.equal(result.grading_completion, 83.33);
  assert.equal(result.policy_warning_assignment_count, 4);
  assert.equal(result.policy_warning_count, 7);
});

test('co-taught section is counted once even when primary/additional email repeats', () => {
  const {gbSummaryForSelectedTeacher_} = context();
  const result = gbSummaryForSelectedTeacher_(rows.slice(0, 1), 'alpha@school.org', all);
  assert.equal(result.section_count, 1);
  assert.equal(result.assignment_count, 10);
});

test('teacher with no matches receives zero counts and no completion rate', () => {
  const {gbSummaryForSelectedTeacher_} = context();
  const result = gbSummaryForSelectedTeacher_(rows, 'not-here@school.org', all);
  assert.equal(result.section_count, 0);
  assert.equal(result.assignment_count, 0);
  assert.equal(result.policy_warning_assignment_count, 0);
  assert.equal(result.grading_completion, null);
});

test('scoreless selected teacher receives N/A rather than a false 0 percent', () => {
  const {gbSummaryForSelectedTeacher_} = context();
  const result = gbSummaryForSelectedTeacher_(rows, 'other@school.org', all);
  assert.equal(result.section_count, 1);
  assert.equal(result.expected_scores, 0);
  assert.equal(result.grading_completion, null);
});

test('dropdown refresh renders selected summary and restores all-teacher summary', () => {
  const {gbRefreshTeacherSummary_, result, picker} = context('beta@school.org');
  gbRefreshTeacherSummary_();
  assert.equal(result.value.section_count, 2);
  assert.equal(result.value.assignment_count, 16);
  picker.value = '';
  gbRefreshTeacherSummary_();
  assert.equal(result.value.section_count, 3);
  assert.equal(result.value.assignment_count, 24);
});

test('ignores malformed numeric source fields rather than producing NaN', () => {
  const {gbSummaryForSelectedTeacher_} = context();
  const result = gbSummaryForSelectedTeacher_([
    {teacher_email: 'x@school.org', assignment_count: 'bad', due_count: undefined,
      expected_scores: NaN, entered_scores: -5, policy_warning_count: '2'}
  ], 'x@school.org', all);
  assert.equal(result.section_count, 1);
  assert.equal(result.assignment_count, 0);
  assert.equal(result.policy_warning_count, 2);
  assert.equal(result.grading_completion, null);
});

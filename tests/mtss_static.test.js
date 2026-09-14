import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

test('MTSS D1 migration defines case, attendance, rule, intervention, and review tables', () => {
  const sql = read('cf-redcake/red-cake-77d5/migrations/0012_mtss.sql');
  for (const table of ['mtss_cases','mtss_attendance_daily','mtss_rules','mtss_rule_hits','mtss_interventions','mtss_reviews']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /ux_mtss_active_student_domain/);
});

test('MTSS UI and Student Lookup extension exist', () => {
  assert.match(read('student-scanner/admin/mtss.html'), /MTSS Case Management/);
  assert.match(read('student-scanner/admin/mtss.js'), /\/admin\/mtss\/dashboard/);
  assert.match(read('student-scanner/admin/student_lookup_mtss.js'), /\/admin\/mtss\/student/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mtssRuleMatches } from '../../cf-redcake/red-cake-77d5/src/services/mtss-rules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const scannerRoot = path.resolve(here, '..');
const root = path.resolve(scannerRoot, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const rule = {
  signal_key: 'consecutive_absence_days',
  operator: 'gte',
  threshold: 3,
  min_captured_days: 3,
  window_days: 0,
  min_event_count: 0
};

test('three consecutive absence days matches Tier 2 streak rule', () => {
  assert.equal(mtssRuleMatches(rule, {
    captured_days: 5,
    consecutive_absence_days: 3,
    windows: {}
  }), true);
});

test('two consecutive absence days does not match streak rule', () => {
  assert.equal(mtssRuleMatches(rule, {
    captured_days: 5,
    consecutive_absence_days: 2,
    windows: {}
  }), false);
});

test('streak rule does not wait for ten captured days', () => {
  assert.equal(mtssRuleMatches(rule, {
    captured_days: 3,
    consecutive_absence_days: 3,
    windows: {}
  }), true);
});

test('MTSS attendance service computes trailing streak from captured official days', () => {
  const svc = read('cf-redcake/red-cake-77d5/src/services/mtss.js');
  assert.match(svc, /consecutive_absence_days/);
  assert.match(svc, /ORDER BY student_number, school_date/);
  assert.match(svc, /consecutive_absence_days/);
  assert.match(svc, /classification/);
  assert.match(svc, /'absent'/);
});

test('migration seeds enabled Tier 2 3-day rule', () => {
  const sql = read('cf-redcake/red-cake-77d5/migrations/0017_mtss_consecutive_absence_rule.sql');
  assert.match(sql, /attendance_consecutive_absences_t2/);
  assert.match(sql, /consecutive_absence_days/);
  assert.match(sql, /'gte',\s*3,\s*3,\s*0,\s*0,\s*1,\s*1,\s*1/);
});

test('MTSS rule UI labels streak in plain English', () => {
  const js = read('student-scanner/admin/mtss.js');
  assert.match(js, /Consecutive absences/);
  assert.match(js, /isStreak/);
});

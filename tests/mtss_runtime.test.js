import test from 'node:test';
import assert from 'node:assert/strict';
import { mtssRuleMatches, mtssSchoolYearCode } from '../../cf-redcake/red-cake-77d5/src/services/mtss-rules.js';

test('MTSS school year rolls in July', () => {
  assert.equal(mtssSchoolYearCode('2026-09-14'), 'SY2627');
  assert.equal(mtssSchoolYearCode('2027-02-01'), 'SY2627');
  assert.equal(mtssSchoolYearCode('2027-07-01'), 'SY2728');
});

test('attendance absence rule respects minimum finalized days', () => {
  const rule = { signal_key:'absence_rate', operator:'gte', threshold:0.10, min_captured_days:10, window_days:0, min_event_count:0 };
  assert.equal(mtssRuleMatches(rule, { captured_days:9, absence_rate:0.5, absence_count:4, windows:{} }), false);
  assert.equal(mtssRuleMatches(rule, { captured_days:10, absence_rate:0.10, absence_count:1, windows:{} }), true);
});

test('windowed tardy rule uses the configured recent finalized-day window', () => {
  const rule = { signal_key:'late_count', operator:'gte', threshold:5, min_captured_days:10, window_days:20, min_event_count:5 };
  const metrics = { captured_days:50, late_count:12, windows:{ '20':{ captured_days:20, late_count:4 } } };
  assert.equal(mtssRuleMatches(rule, metrics), false);
  metrics.windows['20'].late_count = 5;
  assert.equal(mtssRuleMatches(rule, metrics), true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const serviceUrl = pathToFileURL(path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/src/services/required-communications.js')).href;

async function loadService() {
  return import(`${serviceUrl}?required=${Date.now()}-${Math.random()}`);
}

test('required campaign sanitizer preserves valid scoped campaigns and configured category casing', async () => {
  const svc = await loadService();
  const campaigns = svc.sanitizeRequiredCampaigns([
    {
      campaign_id: 'curriculum-night-2627',
      name: 'Curriculum Night Calls',
      category: 'curriculum night',
      start_date: '2026-09-01',
      due_date: '2026-09-16',
      grades: ['Grade 9', '10th grade', '10'],
      legacy_phrases: ['Curriculum night call', 'curriculum night call', 'Family reminded'],
      active: true
    }
  ], { categories: ['General', 'Curriculum Night'] });

  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].category, 'Curriculum Night');
  assert.deepEqual(campaigns[0].grades, ['9','10']);
  assert.deepEqual(campaigns[0].legacy_phrases, ['Curriculum night call', 'Family reminded']);
});

test('coverage counts each expected student once and tracks exact vs legacy provenance', async () => {
  const svc = await loadService();
  const campaign = {
    campaign_id: 'curriculum-night-2627',
    name: 'Curriculum Night Calls',
    category: 'Curriculum Night',
    start_date: '2026-09-01',
    due_date: '2026-09-16',
    grades: ['9'],
    active: true,
    legacy_phrases: []
  };
  const students = [
    { osis:'1001', name:'One', grade:'9' },
    { osis:'1002', name:'Two', grade:'9' },
    { osis:'1003', name:'Three', grade:'10' }
  ];
  const matches = [
    { student_number:'1001', communication_id:'a', match_type:'legacy_text_match', contact_at_iso:'2026-09-02T12:00:00Z' },
    { student_number:'1001', communication_id:'b', match_type:'category_match', contact_at_iso:'2026-09-03T12:00:00Z' },
    { student_number:'1003', communication_id:'c', match_type:'category_match', contact_at_iso:'2026-09-03T12:00:00Z' }
  ];
  const result = svc.buildRequiredCoverage(campaign, students, matches);
  assert.equal(result.counts.expected, 2);
  assert.equal(result.counts.complete, 1);
  assert.equal(result.counts.missing, 1);
  assert.equal(result.counts.qualifying_records, 2);
  assert.equal(result.counts.duplicate_qualifying_records, 1);
  assert.equal(result.counts.exact_category_students, 1);
  assert.equal(result.counts.legacy_text_students, 1);
  assert.equal(result.completed[0].match.match_type, 'category_match');
  assert.equal(result.missing[0].student_number, '1002');
});

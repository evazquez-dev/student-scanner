const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const commUrl = pathToFileURL(path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/src/services/communications-d1.js')).href;
const behaviorUrl = pathToFileURL(path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/src/services/behavior-d1.js')).href;

async function load(url, tag){ return import(`${url}?${tag}=${Date.now()}-${Math.random()}`); }

test('D1 communication model preserves existing UI options and Attendance Outreach outcomes', async () => {
  const svc = await load(commUrl, 'comm');
  const options = svc.communicationD1Options();
  assert.ok(options.methods.includes('Phone'));
  assert.ok(options.directions.includes('Outgoing'));
  assert.ok(options.outcomes.includes('Spoke/Connected'));
  assert.ok(options.outcomes.includes('Left Voicemail'));
  assert.ok(options.outcomes.includes('Will Be Late'));
  assert.ok(options.outcomes.includes('Absent Today'));
  assert.ok(options.outcomes.includes('Wrong Number'));
});

test('D1 communication normalization trusts authenticated actor instead of client actor fields', async () => {
  const svc = await load(commUrl, 'comm');
  const row = svc.normalizeCommunicationD1Input({
    student_number:'1001',
    student_name:'Student One',
    contact_at_iso:'2026-09-10T15:00:00Z',
    method:'Phone',
    direction:'Outgoing',
    category:'Attendance',
    outcome:'Spoke/Connected',
    notes:'Called family.',
    actor_email:'spoof@bad.example',
    submission_id:'client-123'
  }, {
    email:'teacher@school.org',
    role:'editor'
  });
  assert.equal(row.actor_email, 'teacher@school.org');
  assert.equal(row.student_number, '1001');
  assert.equal(row.school_date, '2026-09-10');
  assert.equal(row.submission_id, 'client-123');
  assert.equal(svc.validateCommunicationD1Input(row), '');
});

test('new D1 communication IDs are collision-resistant and visibly distinct from legacy sheet counter IDs', async () => {
  const svc = await load(commUrl, 'comm');
  const id = svc.makeD1CommunicationId('2026-09-10T15:00:00Z', 'abcdef1234567890');
  assert.match(id, /^COM-2627-D1-ABCDEF1234567890$/);
});

test('behavior D1 foundation normalizes the current Behavior_Log contract without enabling live cutover', async () => {
  const svc = await load(behaviorUrl, 'behavior');
  const row = svc.normalizeBehaviorD1Input({
    behavior_id:'beh-1',
    submission_id:'sub-1',
    whenISO:'2026-09-10T14:30:00Z',
    date:'2026-09-10',
    room:'309',
    periodLocal:'2',
    osis:'1001',
    name:'Student One',
    event_key:'Uniform',
    event_label:'Uniform',
    meta:{ submenu:'Uniform', option:'Shirt' }
  }, { email:'teacher@school.org', role:'editor' });
  assert.equal(row.student_number, '1001');
  assert.equal(row.event_key, 'uniform');
  assert.equal(row.actor_email, 'teacher@school.org');
  assert.equal(svc.validateBehaviorD1Input(row), '');
});

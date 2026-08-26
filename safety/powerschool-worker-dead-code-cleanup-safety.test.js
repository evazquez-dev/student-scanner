const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const index = read('cf-redcake/red-cake-77d5/src/index.js');
const wrangler = read('cf-redcake/red-cake-77d5/wrangler.jsonc');

test('abandoned Worker-side PowerSchool meeting sender scaffolding stays removed', () => {
  assert.doesNotMatch(worker, /\bMeetingSentDO\b/);
  assert.doesNotMatch(index, /\bMeetingSentDO\b/);
  assert.doesNotMatch(worker, /\benv\.PS_CLIENT_ID\b/);
  assert.doesNotMatch(worker, /\benv\.PS_CLIENT_SECRET\b/);
  assert.doesNotMatch(worker, /\benv\.PS_YEAR_ID\b/);
  assert.doesNotMatch(worker, /\benv\.PS_QNAME_MEETING_EXISTING\b/);

  for (const key of [
    'PS_BASE_URL',
    'PS_CLIENT_ID',
    'PS_SCHOOL_ID',
    'PS_YEAR_ID',
    'PS_PROGRAM_ID',
    'PS_ATT_MODE_CODE',
    'PS_PQ_PAGE_SIZE',
    'PS_QNAME_MEETING_EXISTING'
  ]) {
    assert.doesNotMatch(wrangler, new RegExp(`"${key}"\\s*:`));
  }
  assert.doesNotMatch(wrangler, /"binding"\s*:\s*"MEETING_STATE"/);
});

test('working Meeting Attendance GAS bridge and attendance computation stay intact', () => {
  assert.match(worker, /async function pushFinalToGAS\b/);
  assert.match(worker, /\benv\.WORKER_PUSH_URL\b/);
  assert.match(worker, /\benv\.WORKER_PUSH_SECRET\b/);
  assert.match(wrangler, /"WORKER_PUSH_URL"\s*:/);
  assert.match(worker, /path === "\/admin\/meeting\/preview"/);
  assert.match(worker, /path === "\/admin\/attendance\/final_export"/);
  assert.match(worker, /async function runAttendanceSnapshotCron\b/);
  assert.match(worker, /function computeMeetingPreview\b/);
  assert.match(worker, /handleContactCachePush_/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const EXPECTED = {
  A: '1051',
  E: '1052',
  EL: '1053',
  ISS: '1055',
  L: '1056',
  OSS: '1057',
  P: '1059'
};

test('SY26-27 attendance-code IDs are synchronized across Daily, Meeting, and Worker runtime maps', () => {
  const daily = read('Google Apps Script/clasp-projects/daily-attendance/PS_Integrate.js');
  const meeting = read('Google Apps Script/clasp-projects/ps-meeting-attendance/Code.js');
  const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
  const teacherRead = read('cf-redcake/red-cake-77d5/src/services/teacher-attendance-read.js');

  assert.match(daily, /YEARID_CURRENT = '36'/);
  assert.match(daily, /ABSENT: '1051'/);
  assert.match(daily, /EXCUSED: '1052'/);
  assert.match(daily, /EXCUSED_LATE: '1053'/);
  assert.match(daily, /ISS: '1055'/);
  assert.match(daily, /LATE: '1056'/);
  assert.match(daily, /OSS: '1057'/);
  assert.match(daily, /PRESENT: '1059'/);
  assert.match(daily, /SUSPENSION_CODE_IDS = \[ATTENDANCE_CODE_IDS\.ISS, ATTENDANCE_CODE_IDS\.OSS\]/);

  for (const [letter, id] of Object.entries({ A: EXPECTED.A, E: EXPECTED.E, EL: EXPECTED.EL, L: EXPECTED.L, P: EXPECTED.P })) {
    const gasRe = new RegExp(`${letter}:\\s*'${id}'`);
    const workerRe = new RegExp(`${letter}:\\s*"${id}"`);
    assert.match(meeting, gasRe, `Meeting Attendance ${letter} should map to ${id}`);
    assert.match(teacherRead, gasRe, `Teacher Attendance read ${letter} should map to ${id}`);
    assert.match(worker, workerRe, `Worker ${letter} should map to ${id}`);
  }

  assert.match(meeting, /LE:\s*'1053'/);
  assert.match(teacherRead, /LE:\s*'1053'/);
  assert.match(worker, /LE:\s*"1053"/);
});

test('known SY25-26 attendance IDs are absent from active attendance configuration blocks', () => {
  const targets = [
    read('Google Apps Script/clasp-projects/daily-attendance/PS_Integrate.js'),
    read('Google Apps Script/clasp-projects/ps-meeting-attendance/Code.js'),
    read('cf-redcake/red-cake-77d5/src/services/teacher-attendance-read.js')
  ];
  const stale = /['"](?:951|952|955|956|958|1001)['"]/;
  for (const src of targets) assert.doesNotMatch(src, stale);

  const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
  const mapLine = worker.match(/var CODE_LETTER_TO_ID = \{[^\n]+\};/);
  assert.ok(mapLine, 'Worker attendance-code map should exist');
  assert.doesNotMatch(mapLine[0], stale);
});

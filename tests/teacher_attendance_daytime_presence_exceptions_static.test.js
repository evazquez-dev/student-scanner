const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const ui = fs.readFileSync(path.join(root, 'student-scanner/admin/teacher_attendance.js'), 'utf8');

function daytimeRenderer() {
  const start = ui.indexOf('function renderRows(');
  assert.ok(start >= 0, 'normal Teacher Attendance renderRows() not found');
  const nextCandidates = [
    ui.indexOf('function renderAfterSchoolRows(', start + 1),
    ui.indexOf('async function renderAfterSchoolRows(', start + 1)
  ].filter((i) => i > start);
  const end = nextCandidates.length ? Math.min(...nextCandidates) : ui.length;
  return ui.slice(start, end);
}

test('normal daytime Teacher Attendance rows carry the presence exception from snapshot state', () => {
  const daytime = daytimeRenderer();
  assert.match(daytime, /presenceException\s*=\s*String\(snap\?\.presence_exception/);
  assert.match(daytime, /presenceException,/);
});

test('normal daytime roster visibly renders every presence exception label', () => {
  const daytime = daytimeRenderer();
  assert.match(daytime, /left_early:\s*'LEFT EARLY'/);
  assert.match(daytime, /off_campus:\s*'OFF CAMPUS'/);
  assert.match(daytime, /missed_am_scan:\s*'MISSED AM SCAN'/);
  assert.match(daytime, /not_seen_today:\s*'NOT SEEN TODAY'/);
  assert.match(daytime, /top\.appendChild\(presenceChip\)/);
});

test('LEFT EARLY and OFF CAMPUS do not get a duplicate generic off-campus chip', () => {
  const daytime = daytimeRenderer();
  assert.match(daytime, /r\.zone === 'off_campus'/);
  assert.match(daytime, /presenceCode === 'left_early'/);
  assert.match(daytime, /presenceCode === 'off_campus'/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const admin = path.resolve(__dirname, '../admin');
const pull = fs.readFileSync(path.join(admin, 'staff_pull.js'), 'utf8');
const lookup = fs.readFileSync(path.join(admin, 'student_lookup_phase3.js'), 'utf8');

test('Staff Pull page shows holder and time for already_held', () => {
  assert.match(pull, /function staffPullApiErrorMessage/);
  assert.match(pull, /Already with \$\{holder\}/);
  assert.match(pull, /held_by_since/);
});

test('Student Lookup uses the friendly Staff Pull conflict message', () => {
  assert.match(lookup, /function apiErrorMessage\(data, status\)/);
  assert.match(lookup, /Already with \$\{holder\}/);
  assert.match(lookup, /new Error\(apiErrorMessage\(data, resp\.status\)\)/);
});

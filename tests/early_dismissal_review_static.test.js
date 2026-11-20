const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const js = fs.readFileSync(path.resolve(__dirname, '../admin/early_dismissal.js'),'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '../admin/early_dismissal.html'),'utf8');
test('page offers the two deliberate staff review actions separately from Undo', () => {
  assert.match(js,/Ignore Later Scan/);
  assert.match(js,/Confirm Returned/);
  assert.match(js,/data-action="ignore_scan"/);
  assert.match(js,/data-action="confirm_return"/);
  assert.match(js,/\/admin\/early_dismissals\/review/);
  assert.match(js,/row\.status === 'changed'/);
  assert.match(js,/row\.can_review/);
});
test('page shows corrected/returned status and cache-busts frontend assets', () => {
  assert.match(js,/review_action === 'ignored_scan'/);
  assert.match(js,/s === 'returned'/);
  assert.match(html,/early_dismissal\.js\?v=20261119-review1/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const mainJs = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/phone_pass.js'), 'utf8');
const helper = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/phone_pass_return_actions.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'student-scanner/admin/phone_pass.html'), 'utf8');

test('Phone Pass return actions are isolated in a helper and the original page logic remains unchanged', () => {
  assert.match(html, /phone_pass\.js" defer><\/script>[\s\S]*phone_pass_return_actions\.js" defer><\/script>/);
  assert.match(helper, /\/admin\/phone_pass\/send_to_return/);
  assert.match(helper, /source: 'phone_pass'/);
  assert.doesNotMatch(mainJs, /phone-pass-return-action/);
});

test('Allowed by me rows expose Send to Return and become Return requested after the request', () => {
  assert.match(helper, /function enhanceMineRows\(\)/);
  assert.match(helper, /Send to Return/);
  assert.match(helper, /Return requested ✓/);
  assert.match(helper, /refreshPhonePassViews\(osis\)/);
});

test('Phones Out keeps Confirm Return separate and only adds request controls for authorized rows', () => {
  assert.match(helper, /function canRequestActiveRow\(row\)/);
  assert.match(helper, /if\(isAdminLike\(\)\) return true/);
  assert.match(helper, /rowOwnerLocal\(row\) === emailLocal\(CAP\.email\)/);
  assert.match(helper, /row\.querySelector\('button\.btn-success'\)/);
  assert.match(html, /\.row-actions/);
  assert.match(html, /\.btn-return-request/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'admin', 'auth_return.html'), 'utf8');

test('mobile Google failure has accessible recovery controls', () => {
  assert.match(html, /EAGLENEST_MOBILE_GOOGLE_RECOVERY_V2/);
  assert.match(html, /id="recoveryActions"/);
  assert.match(html, /id="retryLogin"/);
  assert.match(html, /Sign in again/);
  assert.match(html, /\.\/signin\.html/);
  assert.match(html, /recoveryActions\.hidden = false/);
});

test('recovery retains same-origin admin destination and does not leak the handoff URL', () => {
  assert.match(html, /history\.replaceState\(null, '', location\.pathname\)/);
  assert.match(html, /value\.origin !== location\.origin/);
  assert.match(html, /value\.pathname\.startsWith\(adminRoot\.pathname\)/);
  assert.match(html, /signInAgain\.searchParams\.set\('return_to', destination\.href\)/);
  assert.match(html, /EAGLENEST_AUTH\?\.getSid/);
});

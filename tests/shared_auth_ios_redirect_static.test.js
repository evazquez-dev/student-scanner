const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const shared = fs.readFileSync(path.join(ROOT, 'admin/shared_auth.js'), 'utf8');
const authReturn = fs.readFileSync(path.join(ROOT, 'admin/auth_return.html'), 'utf8');

test('shared auth switches Google button to redirect only on iOS/iPadOS', () => {
  assert.match(shared, /EAGLENEST_IOS_GOOGLE_REDIRECT_V1/);
  assert.match(shared, /iPad\|iPhone\|iPod/);
  assert.match(shared, /platform === 'MacIntel'/);
  assert.match(shared, /next\.ux_mode = 'redirect'/);
  assert.match(shared, /next\.login_uri = loginUri\(\)/);
  assert.match(shared, /delete next\.callback/);
});

test('shared auth prepares opaque redirect state before rendering Google button', () => {
  assert.match(shared, /prepare_redirect/);
  assert.match(shared, /prepareGoogleRedirectState/);
  assert.match(shared, /originalRenderButton\(parent, \{ \.\.\.\(options \|\| \{\}\), state \}\)/);
});

test('auth return exchanges a one-time handoff then stores the normal EagleNEST SID', () => {
  assert.match(authReturn, /handoff/);
  assert.match(authReturn, /EAGLENEST_AUTH\?\.setSid/);
  assert.match(authReturn, /history\.replaceState/);
  assert.match(authReturn, /location\.replace/);
});

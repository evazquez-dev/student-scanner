const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Cloudflare entry layer stores personal external links per signed-in email', () => {
  const wrapper = read('cf-redcake/red-cake-77d5/src/worker_entry.js');
  const wrangler = read('cf-redcake/red-cake-77d5/wrangler.jsonc');
  assert.match(wrangler, /"main"\s*:\s*"src\/worker_entry\.js"/);
  assert.match(wrapper, /USER_EXTERNAL_LINKS_KEY_PREFIX\s*=\s*'user_external_links_v1:'/);
  assert.match(wrapper, /path === '\/admin\/user_external_links'/);
  assert.match(wrapper, /path === '\/admin\/access'/);
  assert.match(wrapper, /show_default_external_links/);
  assert.match(wrapper, /personal_external_links/);
  assert.match(wrapper, /external_links:\s*effective/);
  assert.match(wrapper, /view_as_read_only/);
});

test('notifications page edits personal links and default-link visibility', () => {
  const html = read('student-scanner/admin/notifications.html');
  const js = read('student-scanner/admin/notifications.js');
  assert.match(html, /id="showDefaultExternalLinks"/);
  assert.match(html, /id="defaultExternalLinksPreview"/);
  assert.match(html, /id="personalExternalLinksRows"/);
  assert.match(html, /id="addPersonalExternalLinkBtn"/);
  assert.match(html, /id="savePersonalExternalLinksBtn"/);
  assert.match(js, /\/admin\/user_external_links/);
  assert.match(js, /function collectPersonalExternalLinks/);
  assert.match(js, /function saveDefaultExternalLinkVisibility/);
  assert.match(js, /personal_links/);
  assert.match(js, /show_defaults/);
});

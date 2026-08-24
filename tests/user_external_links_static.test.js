const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Cloudflare Worker uses modular entry and extracted external-links modules', () => {
  const entry = read('cf-redcake/red-cake-77d5/src/index.js');
  const route = read('cf-redcake/red-cake-77d5/src/routes/external-links.js');
  const service = read('cf-redcake/red-cake-77d5/src/services/external-links.js');
  const bridge = read('cf-redcake/red-cake-77d5/src/utils/admin-bridge.js');
  const wrangler = read('cf-redcake/red-cake-77d5/wrangler.jsonc');

  assert.match(wrangler, /"main"\s*:\s*"src\/index\.js"/);
  assert.match(entry, /from '\.\/routes\/external-links\.js'/);
  assert.match(entry, /path === '\/admin\/user_external_links'/);
  assert.match(entry, /path === '\/admin\/access'/);
  assert.match(entry, /return baseWorker\.fetch\(req, env, ctx\)/);
  assert.match(route, /handleUserExternalLinksRequest/);
  assert.match(route, /augmentAccessResponseWithExternalLinks/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(bridge, /view_as_read_only/);
  assert.match(service, /USER_EXTERNAL_LINKS_KEY_PREFIX\s*=\s*'user_external_links_v1:'/);
  assert.match(service, /saveUserExternalLinks/);
  assert.match(service, /combineExternalLinks/);
  assert.match(service, /parsed\.protocol !== 'http:' && parsed\.protocol !== 'https:'/);
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

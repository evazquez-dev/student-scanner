const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.resolve(root, '../cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const contacts = fs.readFileSync(path.join(root, 'admin/student_contacts.js'), 'utf8');
const nightly = fs.readFileSync(path.resolve(root, '../Google Apps Script/clasp-projects/powerschool-nightly-sync/code.js'), 'utf8');

assert.match(worker, /CONTACT_CACHE_META_KEY/);
assert.match(worker, /path === "\/internal\/contact-cache\/push"/);
assert.match(worker, /path === "\/internal\/contact-cache\/commit"/);
assert.match(worker, /getContactCacheStudent_\(env, studentNumber/);
assert.match(worker, /cache_source: "worker_kv_daily_snapshot"/);
assert.match(worker, /BEHAVIOR_MENU_CACHE_KEY/);
assert.match(worker, /refreshBehaviorMenuCache_\(env, getNYCDate\(\)\)/);

const contactsRoute = worker.indexOf('if (path === "/admin/contacts/student")');
const contactsFast = worker.indexOf('getContactCacheStudent_(env, studentNumber', contactsRoute);
const contactsGas = worker.indexOf('action: "contact_list"', contactsRoute);
assert(contactsRoute >= 0 && contactsFast > contactsRoute && contactsGas > contactsFast, 'Contact KV fast path must run before GAS fallback');

const menuRoute = worker.indexOf('if (path === "/admin/behavior/menu")');
const menuKv = worker.indexOf('env.ROSTER.get(BEHAVIOR_MENU_CACHE_KEY', menuRoute);
const menuRefresh = worker.indexOf('refreshBehaviorMenuCache_(env, nyDate)', menuRoute);
assert(menuRoute >= 0 && menuKv > menuRoute && menuRefresh > menuKv, 'Behavior menu KV fast path must run before GAS refresh');

assert.match(nightly, /Configure Worker contact-cache secret/);
assert.match(nightly, /Push Contacts to Worker cache now/);
assert.match(nightly, /pushContactsToWorkerCache_\(\{ interactive: false \}\)/);
assert.match(nightly, /\/internal\/contact-cache\/push/);
assert.match(nightly, /\/internal\/contact-cache\/commit/);

assert.match(contacts, /CONTACT_LOADING_DELAY_MS = 220/);
assert.match(contacts, /setTimeout\(\(\) => \{/);
assert.match(contacts, /requestSequence !== contactLoadSequence/);
assert.match(contacts, /Contact cards take the fast Worker\/KV path/);
console.log('fast_contacts_behavior_menu_static.test.js: PASS');

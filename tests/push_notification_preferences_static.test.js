const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const project = path.resolve(root, '..');
const service = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/services/push-notifications.js'), 'utf8');
const route = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/routes/push-notifications.js'), 'utf8');
const index = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/index.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin/notifications.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'admin/notifications.js'), 'utf8');

assert.match(service, /PUSH_PREFERENCES_KEY_PREFIX = 'push_preferences_v1:'/, 'Preferences should persist separately from device subscriptions');
assert.match(service, /function pushCategoryDefinitions\(/, 'Push service should define a centralized notification catalog');
assert.match(service, /'attendance_alerts'/, 'Catalog should include future attendance alerts');
assert.match(service, /'staff_pull_alerts'/, 'Catalog should include future Staff Pull alerts');
assert.match(service, /'dow_reminders'/, 'Catalog should include future DOW reminders');
assert.match(service, /'behavior_escalations'/, 'Catalog should include future behavior escalation alerts');
assert.match(service, /'early_dismissal_alerts'/, 'Catalog should include future early dismissal alerts');
assert.match(service, /'system_alerts'/, 'Catalog should include future system alerts');
assert.match(route, /'\/admin\/push\/preferences'/, 'Modular route should expose preference updates');
assert.match(route, /notification_categories: notificationCategories/, 'Push config should return the preference catalog');
assert.match(service, /export async function sendPushCategoryToEmail/, 'Reusable category-aware single-recipient delivery should be extracted');
assert.match(service, /export async function sendPushCategoryToEmails/, 'Reusable category-aware multi-recipient delivery should be extracted');
assert.match(service, /default_enabled:\s*true/, 'Existing live categories should default on for eligible users');
assert.match(index, /path\.startsWith\('\/admin\/push\/'\)/, 'Canonical Worker entry should route push endpoints through the modular layer');

assert.match(html, /id="prefList"/, 'Notifications page should contain preference list');
assert.match(html, /Notification preferences/, 'Notifications page should explain preference controls');
assert.match(js, /\/admin\/push\/preferences/, 'Frontend should save preferences to Worker');
assert.match(js, /className='prefToggle'/, 'Frontend should render checkbox controls');
assert.match(js, /row\.status==='coming_soon'/, 'Frontend should distinguish future categories');
assert.match(js, /applies to all of your enabled EagleNEST devices/, 'Frontend should explain account-wide preferences');

console.log('push_notification_preferences_static.test.js: PASS');

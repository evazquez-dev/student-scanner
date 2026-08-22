const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.resolve(root, '../cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin/notifications.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'admin/notifications.js'), 'utf8');

assert.match(worker, /PUSH_PREFERENCES_KEY_PREFIX = "push_preferences_v1:"/, 'Preferences should persist separately from device subscriptions');
assert.match(worker, /function pushCategoryDefinitions_\(/, 'Worker should define a centralized notification catalog');
assert.match(worker, /"attendance_alerts"/, 'Catalog should include future attendance alerts');
assert.match(worker, /"staff_pull_alerts"/, 'Catalog should include future Staff Pull alerts');
assert.match(worker, /"dow_reminders"/, 'Catalog should include future DOW reminders');
assert.match(worker, /"behavior_escalations"/, 'Catalog should include future behavior escalation alerts');
assert.match(worker, /"early_dismissal_alerts"/, 'Catalog should include future early dismissal alerts');
assert.match(worker, /"system_alerts"/, 'Catalog should include future system alerts');
assert.match(worker, /path === "\/admin\/push\/preferences"/, 'Worker should expose preference updates');
assert.match(worker, /notification_categories: notificationCategories/, 'Push config should return the preference catalog');
assert.match(worker, /sendPushCategoryToEmail_\(liveModeEnv_\(env\), INCIDENT_DEAN_EMAIL, PUSH_CATEGORY_DEAN_REFERRALS/, 'Dean push should respect Dean referral preference');
assert.match(worker, /sendPushCategoryToEmails_\(env, recipients, PUSH_CATEGORY_PHONE_RETURN_REQUESTS/, 'Phone return push should respect category preference');
assert.match(worker, /default_enabled:\s*true/, 'Existing live categories should default on for eligible users');

assert.match(html, /id="prefList"/, 'Notifications page should contain preference list');
assert.match(html, /Notification preferences/, 'Notifications page should explain preference controls');
assert.match(js, /\/admin\/push\/preferences/, 'Frontend should save preferences to Worker');
assert.match(js, /className='prefToggle'/, 'Frontend should render checkbox controls');
assert.match(js, /row\.status==='coming_soon'/, 'Frontend should distinguish future categories');
assert.match(js, /applies to all of your enabled EagleNEST devices/, 'Frontend should explain account-wide preferences');

console.log('push_notification_preferences_static.test.js: PASS');

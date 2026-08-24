const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const project = path.resolve(root, '..');
const index = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/index.js'), 'utf8');
const route = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/routes/push-notifications.js'), 'utf8');
const incidentRoute = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/routes/incidents.js'), 'utf8');
const service = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/services/push-notifications.js'), 'utf8');
const wrangler = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/wrangler.jsonc'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/package.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'admin/nav.js'), 'utf8');
const brand = fs.readFileSync(path.join(root, 'admin/brand.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin/incident_creator.html'), 'utf8');
const incidentJs = fs.readFileSync(path.join(root, 'admin/incident_creator.js'), 'utf8');
const notifyHtml = fs.readFileSync(path.join(root, 'admin/notifications.html'), 'utf8');
const notifyJs = fs.readFileSync(path.join(root, 'admin/notifications.js'), 'utf8');
const adminManifest = JSON.parse(fs.readFileSync(path.join(root, 'admin/manifest.webmanifest'), 'utf8'));
const gas = fs.readFileSync(path.resolve(project, 'Google Apps Script/clasp-projects/behavioral-endpoint/Code.js'), 'utf8');

assert.match(service, /INCIDENT_DEAN_EMAIL = 'jgarcia@theamericandreamschool\.org'/);
assert.match(route, /'\/admin\/push\/config'/);
assert.match(route, /'\/admin\/push\/subscribe'/);
assert.match(route, /'\/admin\/push\/unsubscribe'/);
assert.match(route, /'\/admin\/push\/test'/);
assert.match(index, /handlePushNotificationRequest/);
assert.match(service, /await import\('web-push'\)/);
assert.match(service, /statusCode === 404 \|\| statusCode === 410/);
assert.match(service, /no_push_subscriptions/);
assert.match(route, /push_test_rate_limited/);
assert.match(route, /body: 'Push notifications are working on this device\.'/);
assert.match(route, /viewAsReadOnlyResponse/);

// Incident Creator now owns Dean referral orchestration and calls the shared
// category-aware push service directly.
assert.match(incidentRoute, /sendPushCategoryToEmail/);
assert.match(incidentRoute, /PUSH_CATEGORY_DEAN_REFERRALS/);
assert.match(incidentRoute, /body: 'A new incident report has been referred to you in EagleNEST\.'/);
assert.doesNotMatch(incidentRoute, /body: `[^`]*\$\{[^}]*student/i, 'Dean push body must not interpolate student data');
assert.match(incidentRoute, /assigned_to_email: assignedToEmail/);
assert.match(incidentRoute, /reason: 'practice_mode'/);
assert.match(incidentRoute, /reason: 'duplicate_submission'/);
assert.match(wrangler, /"nodejs_compat"/);
assert.equal(pkg.dependencies['web-push'], '^3.6.7');

assert.match(html, /id="referToDean"[^>]+type="checkbox"/);
assert.match(html, />Refer to Dean</);
assert.match(incidentJs, /fd\.set\('refer_to_dean',referToDeanEl\?\.checked\?'1':'0'\)/);
assert.match(incidentJs, /Dean referral simulated in Practice Mode/);
assert.match(incidentJs, /Jorge does not have an enabled push device yet/);

assert.match(gas, /set\('AssignedToEmail', assignedToEmail\)/);
assert.match(gas, /assigned_to_email: assignedToEmail/);

assert.match(sw, /self\.addEventListener\('push'/);
assert.match(sw, /showNotification/);
assert.match(sw, /self\.addEventListener\('notificationclick'/);
assert.match(sw, /clients\.openWindow/);

assert.match(notifyHtml, /data-module="notifications"/);
assert.match(notifyHtml, /id="enableBtn"/);
assert.match(notifyHtml, /id="testBtn"/);
assert.match(notifyJs, /Notification\.requestPermission\(\)/);
assert.match(notifyJs, /pushManager\.subscribe/);
assert.match(notifyJs, /\/admin\/push\/subscribe/);
assert.match(notifyJs, /\/admin\/push\/test/);
assert.match(nav, /href:'\.\/notifications\.html'/);
assert.match(brand, /notifications:\s*'My Settings'/);
assert.equal(adminManifest.scope, './');
assert.equal(adminManifest.display, 'standalone');

console.log('push_notifications_phase1_static.test.js: PASS');

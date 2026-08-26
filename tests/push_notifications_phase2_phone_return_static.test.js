const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.resolve(root, '../cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const phonePass = fs.readFileSync(path.resolve(root, '../cf-redcake/red-cake-77d5/src/services/phone-pass.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin/notifications.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'admin/notifications.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

assert.match(phonePass, /loadHallwayMonitorEmails/, 'Phone Pass should load the explicit Hallway Monitor/Ops audience');
assert.match(phonePass, /function notifyPhoneReturnRequestedToOps\(/, 'Phone Pass should have a centralized phone return push helper');
assert.match(phonePass, /title:\s*'Phone Return Requested'/, 'Phone return notification should use the expected title');
assert.match(phonePass, /body:\s*'A student has been sent to return a phone\. Tap to open Phone Pass\.'/ , 'Push body should remain privacy-safe and generic');
assert.match(phonePass, /url:\s*'\.\/admin\/phone_pass\.html'/, 'Phone return notification should deep-link to Phone Pass');
assert.match(phonePass, /audience:\s*'hallway_monitor_allowlist'/, 'Return request should explicitly target the Ops/Hallway Monitor allowlist');
assert.match(phonePass, /alreadyReturnRequested/, 'Phone Pass should suppress duplicate return-request pushes');
assert.match(phonePass, /reason:\s*'practice_mode'/, 'Practice Mode should simulate instead of sending real phone-return pushes');
assert.match(worker, /phone_return_alerts_eligible:\s*phoneReturnAlertsEligible/, 'Push config should identify eligible Ops accounts');
assert.doesNotMatch(phonePass, /body:\s*`[^`]*\$\{studentName\}/, 'Phone return push body must not expose the student name');
assert.match(html, /Phone Pass → Return requested/, 'Notifications page should explain Phase 2 phone-return routing');
assert.match(html, /id="phoneReturnRouting"/, 'Notifications page should show whether this account is in the return-alert group');
assert.match(js, /phone_return_alerts_eligible/, 'Notifications page should render return-alert eligibility');
assert.match(sw, /notificationclick/, 'Service worker should handle notification taps');
assert.match(sw, /openWindow/, 'Service worker should be able to open Phone Pass from the notification');

console.log('push_notifications_phase2_phone_return_static.test.js: PASS');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const project = path.resolve(root, '..');
const service = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/services/class-reminders.js'), 'utf8');
const route = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/routes/class-reminders.js'), 'utf8');
const entry = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/src/index.js'), 'utf8');
const wrangler = fs.readFileSync(path.resolve(project, 'cf-redcake/red-cake-77d5/wrangler.jsonc'), 'utf8');
const scheduleHtml = fs.readFileSync(path.join(root, 'admin/my_schedule.html'), 'utf8');
const settingsHtml = fs.readFileSync(path.join(root, 'admin/notifications.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'admin/class_reminders.js'), 'utf8');

assert.match(service, /CLASS_REMINDER_PREFERENCE_KEY_PREFIX = 'class_reminder_pref_v1:'/, 'Class reminder preference should have its own KV namespace');
assert.match(service, /CLASS_REMINDER_SENT_KEY_PREFIX = 'class_reminder_sent_v1:'/, 'Class reminders should be deduped per user/period/day');
assert.match(service, /CLASS_REMINDER_DEFAULT_LEAD_MINUTES = 5/, 'Default lead time should remain five minutes');
assert.match(service, /CLASS_REMINDER_ALLOWED_LEAD_MINUTES = Object\.freeze\(\[1, 3, 5, 10, 15\]\)/, 'Each user should choose from controlled personal lead times');
assert.match(service, /lead_minutes: normalizeLeadMinutes\(doc\?\.lead_minutes\)/, 'Stored preference should retain a personal lead time');
assert.match(service, /targetPeriodsForNow\(bell, clock\.minute_of_day, pref\.lead_minutes\)/, 'Cron should evaluate each user using their own lead time');
assert.match(service, /enabled:\s*preference\?\.enabled === true/, 'Absent preference should resolve to off');
assert.match(service, /default_enabled:\s*false/, 'Class reminders must be off by default');
assert.match(service, /TEACHER_ASSIGNMENTS_KEY = 'teacher_assignments_v1'/, 'Class reminders should use the live teacher assignment schedule');
assert.match(service, /BELL_KEY = 'bell_schedule_v1'/, 'Class reminders should use the live bell schedule');
assert.match(service, /sendPushToEmail\(/, 'Class reminders should reuse existing Web Push delivery');
assert.match(service, /loadCoverageAssignmentsForDate\(/, 'Coverage assignments should be eligible for reminders');
assert.match(service, /buildTeacherAttendanceOptions\(/, 'Advisory ownership should be eligible for reminders');
assert.match(service, /today_schedule_missing_or_stale/, 'Stale daily schedules must not generate reminders');
assert.match(service, /practice_mode/, 'Practice Mode must not send real class reminders');

assert.match(route, /\/admin\/class_reminders\/preferences/, 'Preference route should be exposed');
assert.match(route, /loadBaseAccess\(/, 'Preference route should use the existing EagleNEST staff session');
assert.match(route, /typeof body\.enabled !== 'boolean'/, 'Enabled preference should still require a boolean when supplied');
assert.match(route, /invalid_lead_minutes/, 'Preference mutation should reject unsupported personal lead times');

assert.match(entry, /import baseWorker,[\s\S]*from '\.\/worker\.js'/, 'Canonical Worker entry must remain intact');
assert.match(entry, /CLASS_REMINDER_PATHS\.has\(path\)/, 'Canonical Worker entry should intercept the class reminder preference route');
assert.match(entry, /runClassReminderCron/, 'Canonical Worker entry should run the class reminder scheduled job');
assert.match(entry, /return baseWorker\.fetch\(req, env, ctx\);/, 'Canonical legacy fallback must remain intact');
assert.match(entry, /return baseWorker\.scheduled\(event, env, ctx\)/, 'Existing scheduled handler delegation must remain intact');

assert.match(wrangler, /"main"\s*:\s*"src\/index\.js"/, 'Wrangler must keep the canonical Worker entry');
assert.match(wrangler, /"\* \* \* \* \*"/, 'Wrangler should schedule minute-level reminder checks');
assert.match(wrangler, /"0 10 \* \* \*"/, 'Existing daily cron must remain');
assert.match(wrangler, /"\*\/10 \* \* \* \*"/, 'Existing attendance cron must remain');

assert.match(settingsHtml, /<h1>My Settings<\/h1>/, 'Notification/device page should present as My Settings');
assert.match(settingsHtml, /id="classReminderToggle"/, 'My Settings should expose the class reminder toggle');
assert.match(settingsHtml, /id="classReminderLead"/, 'My Settings should expose personal reminder timing');
assert.match(settingsHtml, /15 minutes before/, 'My Settings should expose the controlled lead-time choices');
assert.match(settingsHtml, /\.prefFuture,\.prefIneligible\{display:none!important\}/, 'Coming-soon and ineligible notification rows should be hidden');
assert.match(settingsHtml, /Only notification types that apply to your account are shown\./, 'My Settings should explain role-aware notification visibility');
assert.match(settingsHtml, /id="notificationRouting"[^>]*hidden/, 'Old routing detail should no longer clutter My Settings');
assert.match(settingsHtml, /class_reminders\.js/, 'My Settings should load the class reminder client');

assert.doesNotMatch(scheduleHtml, /id="classReminderToggle"/, 'My Schedule should no longer contain notification controls');
assert.doesNotMatch(scheduleHtml, /id="classReminderLead"/, 'My Schedule should no longer contain reminder timing controls');
assert.match(scheduleHtml, /Class notifications are available in <a href="\.\/notifications\.html">My Settings<\/a>/, 'My Schedule should keep only a small settings reminder');
assert.doesNotMatch(scheduleHtml, /class_reminders\.js/, 'My Schedule should not load the notification settings client');

assert.match(client, /notifications_admin_session_v1/, 'Class reminder settings should reuse the My Settings session');
assert.match(client, /\/admin\/class_reminders\/preferences/, 'Client should read/write the class reminder preference');
assert.match(client, /lead_minutes:lead/, 'Client should save personal reminder timing independently');
assert.match(client, /toggle\.checked=enabled/, 'Class reminder setting should render as an account-level toggle');

console.log('class_reminders_static.test.js: PASS');

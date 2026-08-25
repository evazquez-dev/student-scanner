const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const worker = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/worker.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/index.js'), 'utf8');
const diagnostics = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/routes/attendance-diagnostics.js'), 'utf8');
const incidents = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/routes/incidents.js'), 'utf8');
const dow = fs.readFileSync(path.join(root, 'cf-redcake/red-cake-77d5/src/services/dreamer-of-week.js'), 'utf8');

// Shared operational state must be date/mode scoped. New movement workflows
// depend on these helpers, so this is the central isolation boundary.
assert.match(worker, /function operationalDoName_\(env, liveName, date = ""\)/);
assert.match(worker, /function operationalKvKey_\(env, liveKey, date = ""\)/);
assert.match(worker, /async function sendLocationToDO\(env, state\)/);
assert.match(worker, /env\.STUDENT_LOC\.idFromName\(operationalDoName_\(env, "GLOBAL"\)\)/);
assert.match(worker, /async function _getLiveLocationsFromDO\(env\)/);
assert.match(worker, /async function enqueueLogRow\(env, ctx, row\)/);
assert.match(worker, /env\.LOG_BUFFER\.idFromName\(operationalDoName_\(env, `LOG:\$\{dateKey\}`, dateKey\)\)/);

// Dreamer of the Week is now modular. Its operational selections, cycles,
// history, archives, and audits must all use the same Practice namespace.
assert.match(index, /handleDreamerOfWeekRequest/);
assert.match(index, /path\.startsWith\('\/admin\/dow\/'\)/);
assert.match(dow, /const PRACTICE_KV_PREFIX = 'practice:v1:'/);
assert.match(dow, /const PRACTICE_KV_TTL_SEC = 36 \* 60 \* 60/);
assert.match(dow, /return `\$\{PRACTICE_KV_PREFIX\}\$\{date\}:\$\{key\}`/);
assert.match(dow, /dowOperationalKey\(modeInfo, `\$\{DOW_CYCLE_KEY_PREFIX\}\$\{band\}`\)/);
assert.match(dow, /dowOperationalKey\(modeInfo, `\$\{DOW_SELECTION_KEY_PREFIX\}\$\{band\}:\$\{cycleId\}:`\)/);
assert.match(dow, /dowOperationalKey\(modeInfo, DOW_HISTORY_COUNTS_KEY\)/);
assert.match(dow, /dowOperationalKey\(modeInfo, `\$\{DOW_ARCHIVE_KEY_PREFIX\}\$\{band\}:\$\{cycle\.cycle_id\}`\)/);
assert.match(dow, /fail_closed: true/);

// Reflection Hold uses shared StudentLocation state for create/update/release.
for (const route of ['confirm', 'update', 'release']) {
  assert.match(worker, new RegExp(`path === "\\/admin\\/reflection_hold\\/${route}"`));
}
assert.match(worker, /source: "after_school_reflection_hold_update"/);
assert.match(worker, /source = mode === "cancel" \? "after_school_reflection_hold_cancel" : "after_school_reflection_hold_release"/);

// After-school manual movement reuses the mode-scoped location and log stack.
assert.match(worker, /path === "\/admin\/after_school\/toggle"/);
assert.match(worker, /await updateCurrentLocationKV\(env, params, ctx\)/);
assert.match(worker, /source: "teacher_attendance"/);

// Staff Pull uses the same mode-scoped StudentLocation/ClassSession/log stack.
for (const route of ['pull', 'release']) {
  assert.match(worker, new RegExp(`path === "\\/admin\\/staff_pull\\/${route}"`));
}
assert.match(worker, /source: "staff_pull"/);
assert.match(worker, /source: "staff_release"/);
assert.match(worker, /reason: "staff_release"/);

// Phone Pass state and logs are operational and therefore Practice-scoped.
for (const route of ['grant', 'send_to_return', 'return']) {
  assert.match(worker, new RegExp(`path === "\\/admin\\/phone_pass\\/${route}"`));
}
assert.match(worker, /source: "phone_pass_grant"/);
assert.match(worker, /source: "phone_pass_send_to_return"/);
assert.match(worker, /source: "phone_pass_return"/);
assert.match(worker, /else if \(isPracticeMode_\(env\)\) \{\s*phoneReturnNotification = \{ queued: false, simulated: true,[^}]*reason: "practice_mode" \}/);

// Operational notifications are simulated in Practice Mode rather than sent.
assert.match(incidents, /if \(practice\) \{\s*deanNotification = \{ ok: true, simulated: true,[^}]*reason: 'practice_mode' \}/);

// Attendance Diagnostics had a historical leak: the legacy writer already
// stores Practice traces under operationalKvKey_, and the modular Practice
// reader must list that same namespace rather than raw TA_TRACE keys.
assert.match(worker, /const key = operationalKvKey_\(env, teacherTraceLookupKey_\(date, submissionId\), date\)/);
assert.match(index, /handleAttendanceDiagnosticsRequest/);
assert.match(index, /path === '\/admin\/teacher_att_trace_lookup'/);
assert.match(diagnostics, /const PRACTICE_KV_PREFIX = 'practice:v1:'/);
assert.match(diagnostics, /return `\$\{PRACTICE_KV_PREFIX\}\$\{d\}:TA_TRACE:\$\{d\}:`/);
assert.match(diagnostics, /if \(!practice\) return baseWorker\.fetch\(req, env, ctx\)/);
assert.match(diagnostics, /mode: 'practice',[\s\S]{0,100}practice: true,[\s\S]{0,100}fail_closed: true/);
assert.match(diagnostics, /history_scope: 'practice_only'/);

// Visitor Management remains the one intentional live operational exception.
assert.match(worker, /handleVisitorKioskRoute_\(req, liveModeEnv_\(env\), ctx, path\)/);
assert.match(worker, /handleVisitorAdminRoute_\(req, liveModeEnv_\(env\), ctx, path\)/);

console.log('practice_mode_new_workflows_static.test.js: PASS');

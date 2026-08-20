const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const worker = read('cf-redcake/red-cake-77d5/src/worker.js');

test('Worker exposes a persistent global system mode with practice scoping and purge', () => {
  assert.match(worker, /SYSTEM_MODE_KEY\s*=\s*"system:mode:v1"/);
  assert.match(worker, /PRACTICE_KV_PREFIX\s*=\s*"practice:v1:"/);
  assert.match(worker, /path\s*===\s*"\/system\/mode"/);
  assert.match(worker, /path\s*===\s*"\/admin\/system_mode"/);
  assert.match(worker, /purgePracticeStateForDate_/);
  assert.match(worker, /mode_store_not_bound/);
});

test('Practice queue records are immutable and queue flushers refuse external persistence', () => {
  assert.match(worker, /practice:\s*isPracticeMode_\(env\)/);
  assert.match(worker, /practice_day:\s*isPracticeMode_\(env\)\s*\?\s*practiceDate_\(env\)/);
  assert.match(worker, /rows\.some\(\(row\)\s*=>\s*row\?\.practice\s*===\s*true\)/);
  assert.match(worker, /events\.some\(\(ev\)\s*=>\s*ev\?\.practice\s*===\s*true\)/);
  assert.match(worker, /if \(isPracticeMode_\(env\)\)[\s\S]{0,500}skipped_external:\s*true/);
});

test('Attendance push, RFID debug, and incident evidence have Worker-side practice guards', () => {
  assert.match(worker, /async function pushFinalToGAS[\s\S]{0,900}if \(isPracticeMode_\(env\)\)/);
  assert.match(worker, /action === "rfid_debug"[\s\S]{0,220}isPracticeMode_\(env\)/);
  assert.match(worker, /practice_discarded:\s*true/);
});

test('Visitor routes deliberately run with LIVE policy', () => {
  assert.match(worker, /handleVisitorKioskRoute_\(req, liveModeEnv_\(env\)/);
  assert.match(worker, /handleVisitorAdminRoute_\(req, liveModeEnv_\(env\)/);
  assert.match(worker, /VISITOR_DESK_DO\.idFromName\(VISITOR_DESK_DO_NAME\)/);
});

test('Frontend exposes practice status and super-admin mode control', () => {
  const nav = read('student-scanner/admin/nav.js');
  const admin = read('student-scanner/admin/admin.js');
  const adminHtml = read('student-scanner/admin/index.html');
  const scanner = read('student-scanner/index.html');
  const visitor = read('student-scanner/visitor/visitor.js');
  assert.match(nav, /\/system\/mode/);
  assert.match(nav, /PRACTICE MODE/);
  assert.match(admin, /\/admin\/system_mode/);
  assert.match(adminHtml, /Global System Mode/);
  assert.match(scanner, /refreshPracticeModeBanner/);
  assert.match(visitor, /Visitor Management is LIVE/i);
});

test('Practice banner dynamically offsets the shared hamburger and drawer', () => {
  const nav = read('student-scanner/admin/nav.js');
  const navCss = read('student-scanner/admin/nav.css');
  assert.match(nav, /--eaglenest-practice-banner-height/);
  assert.match(nav, /getBoundingClientRect\(\)\.height/);
  assert.match(nav, /ResizeObserver/);
  assert.match(navCss, /data-system-mode="practice"[^\n]*#ssNavToggle/);
  assert.match(navCss, /data-system-mode="practice"[^\n]*#ssNavDrawer/);
  assert.match(navCss, /height:calc\(100vh - var\(--eaglenest-practice-banner-height/);
});

test('Every authoritative non-Visitor operational GAS project has a fail-closed mode guard', () => {
  const projects = [
    'daily-attendance',
    'ps-meeting-attendance',
    'student-scanner-gas',
    'behavioral-endpoint',
    'fidelity-tracking',
    'early-dismissal',
  ];
  for (const project of projects) {
    const rel = `Google Apps Script/clasp-projects/${project}/PracticeModeGuard.js`;
    assert.equal(exists(rel), true, `${project} should contain PracticeModeGuard.js`);
    const guard = read(rel);
    assert.match(guard, /\/system\/mode/);
    assert.match(guard, /mode:'practice', practice:true, fail_closed:true/);
  }
  assert.equal(exists('Google Apps Script/clasp-projects/visitor-management/PracticeModeGuard.js'), false);
});

test('Standalone GAS operational write entrypoints check practice mode', () => {
  assert.match(read('Google Apps Script/clasp-projects/daily-attendance/PS_Integrate.js'), /function pushDailyFromSheet\(\)[\s\S]{0,350}mode\.practice/);
  assert.match(read('Google Apps Script/clasp-projects/daily-attendance/PS_Integrate.js'), /function adjustScanTimeForToday_\(payload\)[\s\S]{0,350}mode\.practice/);
  assert.match(read('Google Apps Script/clasp-projects/ps-meeting-attendance/Code.js'), /function doPost\(e\)[\s\S]{0,1800}eagleNestSystemMode_/);
  assert.match(read('Google Apps Script/clasp-projects/student-scanner-gas/Code.js'), /eagleNestSystemMode_/);
  assert.match(read('Google Apps Script/clasp-projects/behavioral-endpoint/Code.js'), /eagleNestSystemMode_/);
  assert.match(read('Google Apps Script/clasp-projects/fidelity-tracking/Code.js'), /eagleNestSystemMode_/);
  const early = read('Google Apps Script/clasp-projects/early-dismissal/Code.js');
  assert.match(early, /purgePracticeEarlyDismissalSubmission_/);
  assert.match(early, /form\.deleteResponse\(best\.getId\(\)\)/);
  assert.match(early, /e\.range\.getSheet\(\)\.deleteRow\(e\.range\.getRow\(\)\)/);
});

test('Practice operational history reads are isolated from live GAS history', () => {
  assert.match(worker, /path === "\/admin\/scans_query"/);
  assert.match(worker, /allPracticeRows[\s\S]{0,1400}history_scope: "practice_today_only"/);
  assert.match(worker, /path === "\/admin\/behavior\/list"[\s\S]{0,500}isPracticeMode_\(env\)[\s\S]{0,250}buildPracticeBehaviorList_/);
  assert.match(worker, /path === "\/admin\/communications\/student"[\s\S]{0,1000}history_scope: "practice_today_only"/);
});

test('Practice scans and behaviors remain queryable for the current practice day', () => {
  assert.match(worker, /persistPracticeScanLog_/);
  assert.match(worker, /practiceScanRecordFromLogRow_/);
  assert.match(worker, /path === "\/query"[\s\S]{0,650}practiceScanRecordFromLogRow_/);
  assert.match(worker, /putPracticeRecord_\(env, "behavior", practiceBehavior/);
  assert.match(worker, /path === "\/list_all"[\s\S]{0,700}sanitizeBehaviorLogCacheEntry_/);
});

test('Practice behavior edits persist only in practice storage', () => {
  assert.match(worker, /async function updatePracticeBehavior_/);
  assert.match(worker, /await env\.ROSTER\.put\(key, JSON\.stringify\(next\), practicePutOptions_\(env\)\)/);
  assert.match(worker, /Practice behavior updated for today only/);
});

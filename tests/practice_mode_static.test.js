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

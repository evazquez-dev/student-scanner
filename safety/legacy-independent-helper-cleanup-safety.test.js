const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const worker = read('cf-redcake/red-cake-77d5/src/worker.js');
const adminSessionService = read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
const accessService = read('cf-redcake/red-cake-77d5/src/services/access-management.js');
const academicService = read('cf-redcake/red-cake-77d5/src/services/academic-roster.js');
const dowService = read('cf-redcake/red-cake-77d5/src/services/dreamer-of-week.js');
const reflectionService = read('cf-redcake/red-cake-77d5/src/services/reflection-hold.js');
const afterSchoolService = read('cf-redcake/red-cake-77d5/src/services/after-school-monitor.js');
const lunchService = read('cf-redcake/red-cake-77d5/src/services/supervised-lunch.js');

const REMOVED_HELPERS = [
  'supervisedLunchLastSetKey',
  'saveSupervisedLunchAssignments',
  'getSupervisedLunchLastSet_',
  'putSupervisedLunchLastSet_',
  'supervisedLunchEligibleStudentsForPeriod_',
  'afterSchoolMonitorHoldList_',
  'afterSchoolMonitorRow_',
  'reflectionHoldLocationOptions_',
  'resolveReflectionHoldRoom_',
  'reflectionHoldRosterRows_',
  'loadPhonePassGrantAllowlist_',
  'canGrantPhonePass_',
  'compileAndSaveAcademicRoster_',
  'rebuildAcademicRosterFromStoredSource_',
  'dowNormalizeBand_',
  'dowBandForGrade_',
  'dowBandLabel_',
  'dowCycleKey_',
  'dowSelectionPrefix_',
  'dowSelectionKey_',
  'listKvJsonPrefix_',
  'ensureDowCycle_',
  'dowCurrentSelections_',
  'buildDowSelectionStats_',
  'loadDowHistoryCounts_',
  'dowStudentPublic_',
  'dowRelevantCourseCodes_',
  'dowCompletenessForBand_',
  'buildDowState_',
  'setDowRecipient_',
  'resetDowBand_',
  'viewAsPublicPayload_',
  'listViewAsStaff_',
  'setAdminSessionViewAs_'
];

test('SAFETY: helpers orphaned by independent modular routes stay out of worker.js', () => {
  for (const helper of REMOVED_HELPERS) {
    assert.doesNotMatch(worker, new RegExp(`\\b${helper.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`), `${helper} returned to worker.js`);
  }
});

test('SAFETY: canonical modular owners remain present for removed helper families', () => {
  assert.match(lunchService, /loadSupervisedLunchAssignments/);
  assert.match(lunchService, /saveSupervisedLunchAssignments/);
  assert.match(afterSchoolService, /export async function buildAfterSchoolMonitorSnapshot/);
  assert.match(reflectionService, /export async function previewReflectionHold/);
  assert.match(adminSessionService, /export async function canGrantPhonePass/);
  assert.match(accessService, /PHONE_PASS_GRANT_KEY/);
  assert.match(academicService, /export async function rebuildAcademicRosterFromStoredSource/);
  assert.match(dowService, /export async function buildDowState/);
  assert.match(adminSessionService, /export async function viewAsPublicPayload/);
});

test('SAFETY: Teacher Attendance and still-bridged shared helpers remain untouched', () => {
  assert.match(worker, /path === "\/admin\/teacher_att\/submit"/);
  assert.match(worker, /path === "\/admin\/class_session\/toggle"/);
  assert.match(worker, /async function pushFinalToGAS/);
  assert.match(worker, /function computeMeetingPreview/);
  assert.match(worker, /function effectiveBellScheduleForDateISO/);
  assert.match(worker, /function captureFidelityEvents_/);
});

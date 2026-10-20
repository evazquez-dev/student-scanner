import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=file('../admin/attendance_evidence_verify.html');
const js=file('../admin/attendance_evidence_verify.js');
const pipe=file('../../cf-redcake/red-cake-77d5/src/services/attendance-period-audit.js');
const route=file('../../cf-redcake/red-cake-77d5/src/routes/early-dismissal.js');
const gas=file('../../Google Apps Script/clasp-projects/early-dismissal/Code.js');
test('new read-only D1-backed timeline audit panel and privacy-safe aggregates',()=>{
 assert.match(html,/id="periodWindows52d2"/);
 assert.match(js,/result\.campus_windows_52d2/);
 assert.match(js,/campus_windows_52d2:r\.campus_windows_52d2/);
});
test('pipeline runs 5.2D.2 after reconciled 5.2D.1 and 5.2D',()=>{
 assert.match(pipe,/return await reconcilePeriodWindows52D2\(env,db,await reconcilePeriodFoundations52D1\(env,db,await reconcilePeriodEligibility52D/);
});
test('historical import endpoint cannot invoke live location changes',()=>{
 const fn=route.slice(route.indexOf('async function handleHistoricalDismissalImport52D2'),route.indexOf('export async function handleEarlyDismissalRequest'));
 assert.match(fn,/saveDismissalEvents52D2/);
 assert.doesNotMatch(fn,/applyEarlyDismissalEntries|setStudentLocation/);
 assert.match(route,/evidence_undo_52d2/);
});
test('GAS historical backfill defaults to dry-run and never calls live dismissal endpoint',()=>{
 const fn=gas.slice(gas.indexOf('function backfillEarlyDismissalEvidence52D2('));
 assert.match(fn,/if\(dryRun===undefined\)dryRun=true/);
 assert.match(fn,/admin\/early_dismissal_evidence_52d2\/import/);
 assert.doesNotMatch(fn,/postEarlyDismissalWithRetry_/);
});

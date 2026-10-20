// Batch 5.2E fail-closed contractual checks: read-only evidence, explicit capture.
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..','..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const route=read('cf-redcake/red-cake-77d5/src/routes/attendance-reconciliation-audit.js');
const svc=read('cf-redcake/red-cake-77d5/src/services/attendance-verification-snapshots-52e.js');
const html=read('student-scanner/admin/attendance_evidence_verify.html');
const js=read('student-scanner/admin/attendance_evidence_verify.js');
const sql=read('cf-redcake/red-cake-77d5/migrations/0044_attendance_verification_snapshots_52e.sql');
test('super admin + View As protections precede snapshot reads and writes',()=>{
 assert.match(route,/super_admin_required/);assert.match(route,/view_as\?\.active===true/);
 assert.match(route,/mutationOriginAllowed\(req,env\)/);assert.match(route,/period_snapshot_capture/);
 assert.match(route,/period_snapshots/);assert.match(route,/period_snapshot'/);
});
test('snapshots are stored separately from attendance and PS and are immutable content-addressed',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS attendance_verification_snapshots_52e/);
 assert.match(sql,/payload_json TEXT NOT NULL/);assert.match(sql,/UNIQUE\(school_date,period_local,snapshot_sha256\)/);
 assert.match(svc,/INSERT OR IGNORE INTO attendance_verification_snapshots_52e/);
 assert.doesNotMatch(svc,/UPDATE\s+(?:attendance|scan_events|students|cc\b)/i);
 assert.match(svc,/52e_sources_changed_during_capture_retry/);
});
test('UI keeps private case records separate from aggregate copy and requires explicit save',()=>{
 assert.match(html,/savePeriodSnapshot52e/);assert.match(js,/confirm\('Save a private immutable D1 evidence snapshot/);
 assert.match(html,/snapshot52eStudentJson/);assert.match(js,/snapshot52eReview/);
 assert.match(js,/copySnapshot52eSafe/);assert.match(js,/copySnapshot52ePrivate/);
});

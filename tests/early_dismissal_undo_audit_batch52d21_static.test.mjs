import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('undo callback marks form row, never deletes it',()=>{
 const s=read('Google Apps Script/clasp-projects/early-dismissal/UndoCleanup.js');
 assert.match(s,/function markEarlyDismissalResponseUndoneByFingerprint_/);
 assert.match(s,/getRange\(matchedRow,cols\['Dismissal Status'\]\)\.setValue\('Undone'\)/);
 assert.match(s,/UndoneAt/);assert.match(s,/UndoneBy/);
 assert.match(s,/early_dismissal_mark_undone_v52d21/);
 assert.doesNotMatch(s,/sheet\.deleteRow\(rowNumber\)/);
});
test('live Worker reports failures without silently claiming complete undo evidence',()=>{
 const s=read('cf-redcake/red-cake-77d5/src/routes/early-dismissal.js');
 assert.match(s,/undoneBy:result\.record\?\.used_by/);
 assert.match(s,/evidence_undo_52d2: evidenceUndo52D2/);
 assert.match(s,/undo_not_persisted:/);
 assert.match(s,/early_dismissal_mark_undone_v52d21/);
 assert.match(s,/undone_at_iso: String\(record\?\.used_at/);
});
test('revised historical backfill includes undo markers',()=>{
 const s=read('Google Apps Script/clasp-projects/early-dismissal/Code.js');
 assert.match(s,/function backfillEarlyDismissalEvidence52D2/);
 assert.match(s,/iStatus=hdr\.indexOf\('Dismissal Status'\)/);
 assert.match(s,/entry\.undone_at_iso=at\.toISOString\(\)/);
 assert.match(s,/unmatched_count:group\.unmatched\.length/);
});
test('admin UI warns on either D1 or form sheet failure',()=>{
 const s=read('student-scanner/admin/early_dismissal.js');
 assert.match(s,/data\?\.evidence_undo_52d2\?\.recorded !== true/);
 assert.match(s,/data\?\.log_cleanup\?\.marked !== true/);
 assert.match(s,/audit needs repair/);
});

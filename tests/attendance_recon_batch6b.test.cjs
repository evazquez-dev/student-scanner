const {test}=require('node:test');const assert=require('node:assert/strict');
const api=require('../admin/attendance_recon_batch6b.js');
const file=(name,headers,rows)=>({name:name+'.export.csv',headers:headers.split(','),rows:rows.map(x=>x.map(String))});
function suite(){return [
 file('Students','ID,Student_Number',[[10,123456789],[11,223456789]]),
 file('CC','ID,StudentID,SectionID,SchoolID,TermID,DateEnrolled,DateLeft',[[100,10,50,2,3600,'08/31/2026','06/26/2027'],[101,11,51,2,3600,'10/02/2026','06/26/2027']]),
 file('Sections','ID,SchoolID,TermID,Teacher,Room',[[50,2,3600,404,112],[51,2,3600,405,308]]),
 file('Section_Meeting','ID,SectionID,Year_ID,SchoolID,Cycle_Day_Letter,Period_Number',[[900,50,36,2,'B',2],[901,51,36,2,'B',2]]),
 file('Attendance','StudentID,Att_Date,Attendance_CodeID,PeriodID,SchoolID',[[10,'10/01/2026',1052,1102,2],[11,'10/01/2026',1059,1102,2],[10,'10/01/2026',1056,0,2],[10,'10/16/2026',1059,1102,2]]),
 file('Attendance_Code','ID,Att_Code,Description,SchoolID,YearID',[[1052,'E','Excused',2,36],[1059,'','Present',2,36],[1056,'L','Late',2,36]]),
 file('Period','ID,Period_Number,SchoolID,Year_ID',[[1102,2,2,36]]),
 file('Calendar_Day','ID,Date,Cycle_Day_ID,Bell_Schedule_ID,InSession',[[101,'10/01/2026',1,3775,1],[102,'10/01/2026',9,15,1]]),
 file('Cycle_Day','ID,Letter,SchoolID,Year_ID',[[1,'B',2,36],[9,'B',1,36]]),
 file('Bell_Schedule_Items','ID,Bell_Schedule_ID,Period_ID',[[1,3775,1102],[2,3775,1103]])];}
test('PowerSchool IDs and dated enrollment give unique inferred CCID without claiming source CCID',()=>{const d=api.build(suite(),{start:'2026-10-01',end:'2026-10-15'});assert.equal(d.stats.total,3);let r=d.records[0];assert.equal(r.student_number,'123456789');assert.equal(r.section_inference,'unique_dated_cc_candidate_not_official_ccid');assert.equal(r.inferred_ccid,'100');assert.equal(r.code,'E');assert.equal(r.status,'VERIFIED');});
test('nonenrolled student is never assigned a classroom',()=>{const d=api.build(suite(),{start:'2026-10-01',end:'2026-10-15'});const r=d.records.find(x=>x.student_number==='223456789');assert.equal(r.section_inference,'no_dated_section_candidate');assert.equal(r.status,'NEEDS_REVIEW');});
test('daily period zero never borrows classroom membership',()=>{const d=api.build(suite(),{start:'2026-10-01',end:'2026-10-15'});assert.equal(d.records.find(x=>x.kind==='daily').section_inference,'not_applicable_daily');});
test('today not part of completed historical window',()=>{const d=api.build(suite(),{start:'2026-10-01',end:'2026-10-15'});assert.equal(d.records.some(x=>x.date==='2026-10-16'),false);});
test('D1 missing comparison not claimed without approved period map',()=>{const d=api.build(suite(),{start:'2026-10-01',end:'2026-10-15'});const ix={ok:true,correction_snapshot:{range_start:'2026-09-01',range_end:'2026-10-14'},rows:[]};const c=api.compareD1(d,ix,{});assert.equal(c.counts.missing_in_d1,0);assert.equal(c.counts.unmapped,2);});
test('D1 code difference and absent key flagged with explicit bell-specific mapping',()=>{const d=api.build(suite(),{start:'2026-10-01',end:'2026-10-15'});const ix={ok:true,correction_snapshot:{range_start:'2026-09-01',range_end:'2026-10-14'},rows:[{school_date:'2026-10-01',student_number:'123456789',period_local:'1',code_id:'1059',status:'present'}]};const c=api.compareD1(d,ix,{'3775':{'1102':'1'}});assert.equal(c.counts.mismatch,1);assert.equal(c.counts.missing_in_d1,1);assert.equal(c.queue[0].severity,'NEEDS_REVIEW');});
test('matching D1 correction gets read-only matched count',()=>{const d=api.build(suite(),{start:'2026-10-01',end:'2026-10-15'});const ix={ok:true,correction_snapshot:{range_start:'2026-09-01',range_end:'2026-10-14'},rows:[{school_date:'2026-10-01',student_number:'123456789',period_local:'1',code_id:'1052',status:'excused'}]};const c=api.compareD1(d,ix,{'3775':{'1102':'1'}});assert.equal(c.counts.matched,1);});
test('bad maps rejected, safe summary contains no student identifiers',()=>{assert.throws(()=>api.parseApprovedMaps('{"3775":{"1102":"99"}}'));const d=api.build(suite(),{start:'2026-10-01',end:'2026-10-15'});const safe=JSON.stringify(api.safeSummary(d));assert.equal(safe.includes('123456789'),false);assert.equal(safe.includes('223456789'),false);});

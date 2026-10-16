// EAGLENEST_ATTENDANCE_RECON_BATCH6C1_DROPPED_CC_V1
const {test}=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../admin/attendance_recon_batch6c.js');
const file=(name,headers,rows)=>({name:name+'.export.csv',headers:headers.split(','),rows:rows.map(r=>r.map(String))});
function suite({duplicate=false,end='09/10/2026'}={}){
 return [
  file('Students','ID,Student_Number',[[11,'223456789'],[12,'323456789']]),
  file('CC','ID,StudentID,SectionID,SchoolID,TermID,DateEnrolled,DateLeft,Course_Number',[
   [101,11,-50,2,-3600,'09/03/2026',end,'MATH'],
   ...(duplicate?[[102,11,-50,2,-3600,'09/03/2026',end,'MATH']]:[]),
   [103,12,51,2,3600,'09/08/2026','06/26/2027','ENGLISH']]),
  file('Sections','ID,SchoolID,TermID,Teacher,Room,Course_Number',[[50,2,3600,404,112,'MATH'],[51,2,3600,405,313,'ENGLISH']]),
  file('Section_Meeting','ID,SectionID,Year_ID,SchoolID,Cycle_Day_Letter,Period_Number',[[900,50,36,2,'A',2],[901,51,36,2,'A',2]]),
  file('Attendance','StudentID,Att_Date,Attendance_CodeID,PeriodID,SchoolID',[
   [11,'09/04/2026',1051,1102,2],[11,'09/10/2026',1051,1102,2],
   [12,'09/04/2026',1051,1102,2],[11,'09/08/2026',1051,1102,2]]),
  file('Attendance_Code','ID,Att_Code,Description,SchoolID,YearID',[[1051,'A','Absent',2,36]]),
  file('Period','ID,Period_Number,SchoolID,Year_ID',[[1102,2,2,36]]),
  file('Calendar_Day','ID,Date,Cycle_Day_ID,Bell_Schedule_ID,InSession',[[1,'09/04/2026',1,3775,1],[2,'09/10/2026',1,3775,1],[3,'09/08/2026',1,4254,1]]),
  file('Cycle_Day','ID,Letter,SchoolID,Year_ID',[[1,'A',2,36]]),
  file('Bell_Schedule_Items','ID,Bell_Schedule_ID,Period_ID',[[1,3775,1102],[2,3775,1115],[3,4254,1115]])
 ];
}
const build=(files)=>engine.build(files,{start:'2026-09-04',end:'2026-09-10',schoolId:'2',yearId:'36',termId:'3600'});
test('dropped TermID and negative SectionID resolve to one dated historical CC candidate without rewriting signed keys',()=>{
 const files=suite(),original=JSON.stringify(files);const p=build(files),r=p.records.find(x=>x.ps_student_id==='11'&&x.date==='2026-09-04');
 assert.equal(r.root_cause,'HISTORICAL_DROPPED_CC_RESOLVED');
 assert.equal(r.status,'PROVISIONAL');assert.equal(r.inferred_ccid,'101');
 assert.equal(r.inferred_section_id,'50');assert.equal(r.historical_cc_original_section_id,'-50');
 assert.equal(r.historical_cc_term_id,'-3600');assert.equal(r.historical_cc_date_enrolled,'2026-09-03');
 assert.equal(r.historical_cc_date_left,'2026-09-10');assert.equal(r.match_count,1);
 assert.deepEqual(r.warnings,[]);assert.equal(JSON.stringify(files),original);
});
test('DateLeft is exclusive and does not resurrect a dropped section afterward',()=>{
 const r=build(suite()).records.find(x=>x.ps_student_id==='11'&&x.date==='2026-09-10');
 assert.equal(r.status,'NEEDS_REVIEW');assert.equal(r.inferred_ccid,'');
});
test('duplicate historical candidate is not silently selected',()=>{
 const p=build(suite({duplicate:true}));const r=p.records.find(x=>x.ps_student_id==='11'&&x.date==='2026-09-04');
 assert.equal(r.status,'NEEDS_REVIEW');assert.equal(r.inferred_ccid,'');
});
test('historical CC cannot be used before DateEnrolled of a positive current section',()=>{
 const r=build(suite()).records.find(x=>x.ps_student_id==='12'&&x.date==='2026-09-04');
 assert.equal(r.status,'NEEDS_REVIEW');assert.equal(r.inferred_ccid,'');
});
test('confirmed daily-only event still excludes a row even when a matching dropped CC exists',()=>{
 const r=build(suite()).records.find(x=>x.ps_student_id==='11'&&x.date==='2026-09-08');
 assert.equal(r.status,'EXCLUDED_POLICY');assert.equal(r.meeting_obligation_eligible,false);
 assert.equal(r.inferred_ccid,'');
});
test('privacy-safe summary carries aggregate recovery counts only',()=>{
 const p=build(suite());const s=engine.safeSummary(p);
 assert.equal(s.historical_cc_resolution_counts.resolved,1);
 assert.equal(s.historical_cc_resolution_counts.students,1);
 assert.ok(!JSON.stringify(s).includes('223456789'));
});

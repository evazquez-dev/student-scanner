const {test}=require('node:test');const assert=require('node:assert/strict');
const b6c=require('../admin/attendance_recon_batch6c.js');
const file=(name,headers,rows)=>({name:name+'.export.csv',headers:headers.split(','),rows:rows.map(r=>r.map(String))});
function suite(){return [
 file('Students','ID,Student_Number',[[10,'123456789'],[11,'223456789'],[12,'323456789']]),
 file('CC','ID,StudentID,SectionID,SchoolID,TermID,DateEnrolled,DateLeft',[
  [100,10,50,2,3600,'09/08/2026','06/26/2027'],
  [101,11,-7,2,-3600,'08/31/2026','06/26/2027'],
  [102,12,52,2,3600,'08/31/2026','06/26/2027']]),
 file('Sections','ID,SchoolID,TermID,Teacher,Room,Course_Number',[[50,2,3600,404,112,'MATH'],[52,2,3600,405,202,'FM2']]),
 file('Section_Meeting','ID,SectionID,Year_ID,SchoolID,Cycle_Day_Letter,Period_Number',[[900,50,36,2,'A',2],[901,52,36,2,'B',14]]),
 file('Attendance','StudentID,Att_Date,Attendance_CodeID,PeriodID,SchoolID',[
  [10,'09/03/2026',1051,1102,2], [11,'09/03/2026',1051,1102,2],
  [12,'09/16/2026',1051,1116,2], [12,'09/16/2026',1051,1114,2],
  [10,'09/08/2026',1051,1102,2],[10,'09/08/2026',1051,0,2]
 ]),
 file('Attendance_Code','ID,Att_Code,Description,SchoolID,YearID',[[1051,'A','Absent',2,36]]),
 file('Period','ID,Period_Number,SchoolID,Year_ID',[[1102,2,2,36],[1116,16,2,36],[1114,14,2,36]]),
 file('Calendar_Day','ID,Date,Cycle_Day_ID,Bell_Schedule_ID,InSession',[[1,'09/03/2026',1,3775,1],[2,'09/08/2026',1,4254,1],[3,'09/16/2026',2,3769,1]]),
 file('Cycle_Day','ID,Letter,SchoolID,Year_ID',[[1,'A',2,36],[2,'B',2,36]]),
 file('Bell_Schedule_Items','ID,Bell_Schedule_ID,Period_ID',[[1,3775,1102],[2,3775,1116],[3,3769,1114],[4,4254,1114],[5,3769,1102]])
 ];}
const build=()=>b6c.build(suite(),{start:'2026-09-03',end:'2026-09-16',schoolId:'2',yearId:'36',termId:'3600'});
test('single-bell day preserves PowerSchool meeting record but excludes it from obligation and correction candidate',()=>{
 const p=build(),r=p.records.find(x=>x.date==='2026-09-08'&&x.kind==='meeting');
 assert.equal(r.status,'EXCLUDED_POLICY');assert.equal(r.meeting_obligation_eligible,false);assert.equal(r.correction_candidate,false);assert.equal(r.schedule_policy_id,'HS_SINGLE_PERIOD_EVENT_DAILY_ONLY');
 assert.equal(p.records.find(x=>x.date==='2026-09-08'&&x.kind==='daily').status,'VERIFIED');
});
test('September 16 FM1 excluded while FM2 is retained as expected meeting',()=>{
 const p=build(),fm1=p.records.find(x=>x.period_id==='1116'),fm2=p.records.find(x=>x.period_id==='1114');
 assert.equal(fm1.status,'EXCLUDED_POLICY');assert.equal(fm1.schedule_policy_id,'HS_2026_09_16_FM1_NOT_SCHEDULED');assert.equal(fm2.meeting_obligation_eligible,true);assert.notEqual(fm2.status,'EXCLUDED_POLICY');
});
test('historical negative term CC is explained, not assigned as a source CCID',()=>{
 const p=build(),r=p.records.find(x=>x.ps_student_id==='11');
 assert.equal(r.root_cause,'HISTORICAL_CC_NONSTANDARD_TERM');assert.equal(r.status,'NEEDS_REVIEW');assert.equal(r.inferred_ccid,'');assert.equal(r.enrollment_investigation.traces[0].term_id,'-3600');
});
test('before-enrollment attendance is explained using matching CC effective dates',()=>{
 const p=build(),r=p.records.find(x=>x.ps_student_id==='10'&&x.date==='2026-09-03');
 assert.equal(r.root_cause,'ATTENDANCE_BEFORE_SECTION_ENROLLMENT');assert.equal(r.enrollment_investigation.traces[0].date_enrolled,'2026-09-08');
});
test('new summary preserves raw totals while reporting exclusions and cause counts',()=>{
 const p=build();assert.equal(p.stats.total,6);assert.equal(p.stats.daily,1);assert.equal(p.stats.meeting,5);assert.equal(p.stats.meeting_excluded_by_policy,2);assert.equal(p.days.find(d=>d.date==='2026-09-08').meeting_excluded_by_policy,1);
 const safe=JSON.stringify(b6c.safeSummary(p));assert.equal(safe.includes('123456789'),false);assert.equal(safe.includes('223456789'),false);assert.equal(safe.includes('policy_version'),true);
});
test('D1 key comparisons do not turn excluded special-day records into missing meeting corrections',()=>{
 const p=build(),ix={ok:true,correction_snapshot:{range_start:'2026-09-01',range_end:'2026-09-30'},rows:[{school_date:'2026-09-08',student_number:'123456789',period_local:'1',code_id:'1052',status:'excused'}]};
 const c=b6c.compareD1(p,ix,{'4254':{'1102':'1'}});assert.equal(c.counts.missing_in_d1,0);assert.equal(c.counts.special_day_d1_excluded,1);assert.equal(c.counts.unexpected_d1,0);
});
test('source files, policies, and official D1 records are not modified in place',()=>{
 const raw=suite(),before=JSON.stringify(raw);const p=b6c.build(raw,{start:'2026-09-03',end:'2026-09-16'});assert.equal(JSON.stringify(raw),before);assert.equal(p.read_only,true);assert.equal(p.local_browser_only,true);assert.equal(b6c.POLICIES.length,2);
});

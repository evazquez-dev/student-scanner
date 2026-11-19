// EAGLENEST_GENERIC_DAILY_ATTENDANCE_REPORT_V1
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../../');
const daily=fs.readFileSync(path.join(root,'student-scanner/admin/student_reports_daily.js'),'utf8');
const letter=fs.readFileSync(path.join(root,'student-scanner/admin/student_reports.js'),'utf8');
const html=fs.readFileSync(path.join(root,'student-scanner/admin/student_view.html'),'utf8');
const service=fs.readFileSync(path.join(root,'cf-redcake/red-cake-77d5/src/services/grades-attendance.js'),'utf8');
const route=fs.readFileSync(path.join(root,'cf-redcake/red-cake-77d5/src/routes/grades.js'),'utf8');
function functions(){
  const window={};
  const document={readyState:'loading',addEventListener(){},getElementById(){return null;},querySelector(){return{content:'https://example.org/'};}};
  const context={window,document,location:{href:'https://example.org/admin/student_view.html'},
    Intl,Date,URL,Headers,console};
  const source=daily.replace('window.EagleNESTDailyAttendanceReport = {load,print,reset,render};',
    'window.EagleNESTDailyAttendanceReport = {load,print,reset,render,modelFromResponse,documentPages,displayRows};');
  vm.runInNewContext(source,context,{filename:'student_reports_daily.js'});
  return window.EagleNESTDailyAttendanceReport;
}
const referenceRows=[
  {school_date:'2026-11-05',classification:'present',detail_code:'present_default',
    arrival_at_iso:'2026-11-05T13:06:00.000Z',canonical_membership:'enrolled'},
  {school_date:'2026-11-06',classification:'late',detail_code:'excused_late',
    arrival_at_iso:'2026-11-06T15:19:00.000Z',canonical_membership:'enrolled'},
  {school_date:'2026-11-09',classification:'absent',detail_code:'excused_absent',
    arrival_at_iso:'',canonical_membership:'enrolled'},
  {school_date:'2026-11-04',classification:'not_enrolled',detail_code:'',
    arrival_at_iso:'',canonical_membership:'not_enrolled'}
];
function sample(rows=referenceRows){return {ok:true,
  window:{start:'2026-11-05',end:'2026-11-09',entry_date:'2026-11-05'},
  coverage:{outside_coverage:false},attendance:{data_quality:{outside_coverage:false}},daily_rows:rows};}
test('the generic option preserves the existing bilingual letter',()=>{
  assert.match(html,/option value="letter"/);
  assert.match(html,/option value="daily"/);
  assert.match(html,/student_reports_daily\.js/);
  assert.match(letter,/if \(isDaily\(\)\) return window\.EagleNESTDailyAttendanceReport\?\.load/);
  assert.match(letter,/if \(isDaily\(\)\) return window\.EagleNESTDailyAttendanceReport\?\.print/);
});
test('first arrival scans are student-authorized, current-HS scoped and Practice-safe',()=>{
  assert.match(route,/const auth = await authorizeStudent/);
  assert.match(route,/includeArrivalTimes: url\.searchParams\.get\('include_arrival_times'\) === '1' &&/);
  assert.match(route,/url\.searchParams\.get\('report_enrollment_scoped'\) === '1'/);
  assert.match(service,/loadAttendanceOutreachModeInfo\(env\)\.catch\(\(\)=>\(\{practice:true\}\)\)/);
  assert.match(service,/allowLiveArrivals=includeArrivalTimes && reportMode\?\.practice===false/);
  assert.match(service,/Front Entrance \(Morning\)/);
  assert.match(service,/Rear Entrance \(Morning\)/);
  assert.match(service,/verifiedMembers\.has\(date\)/);
});
test('an early L-style scan remains on time when the official status is Present',()=>{
  const api=functions();
  const data=api.modelFromResponse(sample(),'123456789','Sample Student');
  assert.equal(data.counts.days,3);
  assert.equal(data.counts.onTime,1);
  assert.equal(data.counts.late,1);
  assert.equal(data.counts.absent,1);
  assert.equal(data.counts.attended,2);
  assert.equal(data.counts.notEnrolled,1);
  assert.equal(data.counts.unknown,0);
  assert.equal(data.issues.length,0);
  assert.equal(data.rows.find(x=>x.school_date==='2026-11-05').arrival_time,'8:06 AM');
  assert.equal(data.rows.find(x=>x.school_date==='2026-11-05').label,'On time');
  assert.equal(data.rows.find(x=>x.school_date==='2026-11-06').label,'Late (excused)');
  assert.equal(data.rows.find(x=>x.school_date==='2026-11-09').label,'Absent (excused)');
});
test('unknown dates block printing and verified non-enrollment never counts as absent',()=>{
  const api=functions();
  const rows=[...referenceRows,{school_date:'2026-11-10',classification:'unknown',detail_code:''}];
  const data=api.modelFromResponse(sample(rows),'123456789','Sample Student');
  assert.equal(data.counts.unknown,1);
  assert.equal(data.counts.absent,1);
  assert.equal(data.counts.days,3);
  assert.match(data.issues.join(' | '),/unknown official attendance/);
});
test('print layout paginates large attendance histories without dropping rows',()=>{
  const api=functions();
  const base=Date.UTC(2026,8,1);
  const rows=Array.from({length:130},(_,i)=>({
    school_date:new Date(base+i*86400000).toISOString().slice(0,10),
    classification:'late',detail_code:'',arrival_at_iso:'2026-11-06T15:19:00.000Z'
  }));
  const data=api.modelFromResponse({...sample(rows),window:{start:'2026-09-01',end:'2027-01-10',entry_date:'2026-09-01'}},'123456789','Sample Student');
  const pages=api.documentPages(data);
  assert.match(pages,/Page 3 of 3/);
  for(const row of rows){
    const [year,month,day]=row.school_date.split('-');
    assert.ok(pages.includes(`${month}/${day}/${year.slice(2)}`));
  }
});

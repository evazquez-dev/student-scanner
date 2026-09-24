// EAGLENEST_INCENTIVE_TRIPS_V1 pure-rule regression tests (no production D1 or Worker access).
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeWindow, resolveWindow, evaluateStudent } from '../../cf-redcake/red-cake-77d5/src/services/incentive-trips.js';
const today='2026-09-24';
const grades={behavior:{enabled:true,use_global:true,rules:{max_events:{enabled:true,value:0}}},
 daily:{enabled:true,use_global:true,rules:{min_pct:{enabled:true,value:90}}},
 meeting:{enabled:true,use_global:false,window:{kind:'school_year',through:today},rules:{min_pct:{enabled:true,value:90}}},
 academics:{enabled:true,source:'current',rules:{min_average:{enabled:true,value:75}}}};
const base={name:'Test trip',grades:['9'],global_window:{kind:'rolling_school',count:3,through:today},...grades};
const day=['2026-09-18','2026-09-21','2026-09-22','2026-09-23','2026-09-24'];
function fixture(){const cfg=normalizeConfig(base,today),win={behavior:resolveWindow(cfg.global_window,day,today),
 daily:resolveWindow(cfg.global_window,day,today),meeting:resolveWindow(cfg.meeting.window,day,today)};
 const ids=win.meeting.school_days,data={daily:new Map([['123',ids.map(d=>({school_date:d,classification:'present'}))]]),
 meeting:new Map([['123',ids.map(d=>({school_date:d,expected_count:1,on_time_count:1,not_on_time_count:0,unknown_count:0,periods_json:'[{"status":"present"}]'}))]]),
 behavior:new Map([['123',[]]]),incident:new Map([['123',[]]]),
 meetingDays:new Map(ids.map(d=>[d,{complete:1,school_in_session:1,expected_student_meetings:100}]))};
 return {cfg,win,data};}
test('rolling school days exclude today by default and choose exactly N dates',()=>{
 const w=resolveWindow(normalizeWindow({kind:'rolling_school',count:3,through:today},today),day,today);
 assert.deepEqual(w.school_days,['2026-09-21','2026-09-22','2026-09-23']);
 assert.throws(()=>resolveWindow(normalizeWindow({kind:'rolling_school',count:6,through:today},today),day,today),/insufficient_school_days/);
});
test('category custom school-year window does not change global rolling window',()=>{
 const cfg=normalizeConfig(base,today);assert.equal(cfg.meeting.use_global,false);
 assert.equal(cfg.meeting.window.kind,'school_year');assert.equal(cfg.global_window.kind,'rolling_school');
});
test('no grade evaluation-window toggle and current standing default',()=>{
 const c=normalizeConfig({...base,academics:{enabled:true,rules:{min_average:{enabled:true,value:75}}}},today);
 assert.equal(c.academics.source,'current');assert.equal('use_global' in c.academics,false);
});
test('pass and fail follow individually configured categories',()=>{
 const {cfg,win,data}=fixture();const student={osis:'123',name:'Example Student',grade:'9'};
 const grade={courses:[{course_code:'ELA400',grade_numeric:85}]};
 assert.equal(evaluateStudent(student,cfg,win,data,grade,{snapshot_date:today}).status,'ELIGIBLE');
 data.behavior.get('123').push({school_date:'2026-09-22',event_key:'uniform'});
 assert.equal(evaluateStudent(student,cfg,win,data,grade,{snapshot_date:today}).status,'INELIGIBLE');
});
test('zero grade is unentered and does not create a false eligibility result',()=>{
 const {cfg,win,data}=fixture();const s={osis:'123',name:'Example Student',grade:'9'};
 const out=evaluateStudent(s,cfg,win,data,{courses:[{course_code:'ELA400',grade_numeric:0}]},{});
 assert.equal(out.status,'INSUFFICIENT_DATA');assert.deepEqual(out.categories.academics.missing_courses,['ELA400']);
});
test('full-day absence is evaluated in daily attendance, not double charged in meeting percentage',()=>{
 const {cfg,win,data}=fixture();const s={osis:'123',name:'Example Student',grade:'9'};
 data.daily.get('123').find(x=>x.school_date==='2026-09-22').classification='absent';
 const out=evaluateStudent(s,cfg,win,data,{courses:[{course_code:'ELA400',grade_numeric:85}]},{});
 assert.equal(out.categories.daily.status,'FAIL');
 assert.equal(out.categories.meeting.status,'PASS');
});

test('saved moving window uses the new date when rerun; explicit end remains fixed',()=>{
 const saved=normalizeWindow({kind:'rolling_school',count:3,through:today,through_mode:'today'},today);
 assert.equal(saved.through,today);
 assert.equal(normalizeWindow(saved,'2026-09-25').through,'2026-09-25');
 assert.equal(normalizeWindow({kind:'rolling_school',count:3,through:today,through_mode:'date'},'2026-09-25').through,today);
});
test('selected course not present in grade snapshot is insufficient data',()=>{
 const {cfg,win,data}=fixture();cfg.academics.course_scope='selected';cfg.academics.course_codes=['ELA400','MTH400'];
 const result=evaluateStudent({osis:'123',name:'Student',grade:'9'},cfg,win,data,{courses:[{course_code:'ELA400',grade_numeric:85}]},{});
 assert.equal(result.status,'INSUFFICIENT_DATA');assert.deepEqual(result.categories.academics.missing_courses,['MTH400']);
});
test('grade threshold parameter alone is not an academic eligibility rule',()=>{
 assert.throws(()=>normalizeConfig({...base,academics:{enabled:true,rules:{min_courses_above_pct:{enabled:true,value:80}}}},today),/enable_academic_rule/);
});
test('calendar-day and custom windows resolve inclusively without adding noninstructional dates',()=>{
 const cal=resolveWindow(normalizeWindow({kind:'rolling_calendar',count:4,through:today,include_today:false},today),day,today);
 assert.equal(cal.start,'2026-09-20');assert.equal(cal.end,'2026-09-23');
 assert.deepEqual(cal.school_days,['2026-09-21','2026-09-22','2026-09-23']);
 const specific=resolveWindow(normalizeWindow({kind:'specific',start:'2026-09-18',end:'2026-09-22'},today),day,today);
 assert.deepEqual(specific.school_days,['2026-09-18','2026-09-21','2026-09-22']);
});
test('excused class period is excluded rather than a missed class',()=>{
 const {cfg,win,data}=fixture(),s={osis:'123',name:'Student',grade:'9'};
 const row=data.meeting.get('123').find(x=>x.school_date==='2026-09-22');
 Object.assign(row,{on_time_count:0,not_on_time_count:1,periods_json:'[{"status":"excused"}]'});
 const r=evaluateStudent(s,cfg,win,data,{courses:[{course_code:'ELA400',grade_numeric:84}]},{});
 assert.equal(r.categories.meeting.status,'PASS');assert.equal(r.categories.meeting.excluded_excused_periods,1);
});
test('disabled grade section cannot block a behavior-only eligibility report',()=>{
 const cfg=normalizeConfig({name:'Behavior-only',grades:['9'],global_window:{kind:'rolling_school',count:3,through:today},
 behavior:{enabled:true,rules:{max_events:{enabled:true,value:0}}}},today);
 const win={behavior:resolveWindow(cfg.global_window,day,today)};
 const data={behavior:new Map(),incident:new Map()};
 const r=evaluateStudent({osis:'123',name:'Student',grade:'9'},cfg,win,data,null,null);
 assert.equal(r.status,'ELIGIBLE');assert.equal('academics' in r.categories,false);
});

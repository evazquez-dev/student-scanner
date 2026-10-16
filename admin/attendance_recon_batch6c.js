/* EAGLENEST_ATTENDANCE_RECON_BATCH6C_V1
 * Versioned *review-only* historical schedule policies + enrollment explanations.
 * This client overlay never mutates PowerSchool, D1, or source exports.
 * These exclusions affect this reconciliation preview ONLY; other attendance
 * eligibility or accountability services require separate integration.
 */
(function(root,factory){
 const api=factory(root?.EagleNESTBatch6B || (typeof require==='function'?require('./attendance_recon_batch6b.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.EagleNESTBatch6B)Object.assign(root.EagleNESTBatch6B,{build:api.build,compareD1:api.compareD1,safeSummary:api.safeSummary});
})(typeof globalThis==='object'?globalThis:null,function(base){
'use strict';
if(!base)throw Error('Batch 6B prerequisite not loaded');
const POLICY_VERSION='6C-2026-10-16-v1';
const POLICIES=Object.freeze([
 Object.freeze({id:'HS_SINGLE_PERIOD_EVENT_DAILY_ONLY',kind:'bell_shape',school_id:'2',year_id:'36',reason:'The HS single-period custom bell is used for trips and school events. Daily attendance only; no meeting obligation.',authority:'School operations confirmation 2026-10-16',effect:'exclude_meeting_from_review_and_scoring'}),
 Object.freeze({id:'HS_2026_09_16_FM1_NOT_SCHEDULED',kind:'date_ps_period',school_id:'2',year_id:'36',date:'2026-09-16',ps_period_id:'1116',reason:'Only FM2 was scheduled on 2026-09-16. FM1 records must be retained but are not scheduled meeting obligations.',authority:'School operations confirmation 2026-10-16',effect:'exclude_meeting_from_review_and_scoring'})
]);
const rawBuild=base.build.bind(base),rawCompare=base.compareD1.bind(base),rawSummary=base.safeSummary.bind(base);
const norm=x=>String(x??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const text=x=>String(x??'').trim();
const fields={id:['id'],student:['studentid','student_id'],section:['sectionid','section_id'],school:['schoolid','school_id'],term:['termid','term_id'],start:['dateenrolled','date_enrolled'],end:['dateleft','date_left'],year:['year_id','yearid'],period:['period_number','periodnumber'],cycle:['cycle_day_letter','letter'],course:['course_number'],teacher:['teacher'],room:['room']};
const read=(f,row,key)=>{if(!f)return'';const i=f.headers.findIndex(h=>(fields[key]||[]).includes(norm(h)));return i<0?'':text(row[i]);};
function dateKey(s){s=text(s);if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(0,10);const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);return m?`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:'';}
function policyFor(row,preview){if(row.kind!=='meeting'||preview.school_id!=='2'||preview.year_id!=='36')return null;
 if(preview.days.some(d=>d.date===row.date&&d.special))return POLICIES[0];
 if(row.date==='2026-09-16'&&row.period_id==='1116')return POLICIES[1];
 return null;}
function constructSources(raw,preview){const role=base.roleFiles(raw),cc=role.get('cc'),sections=role.get('sections'),meeting=role.get('section_meeting');if(!cc||!sections||!meeting)return null;
 const ccByStudent=new Map(),sectionById=new Map(),meetBySection=new Map();
 for(const r of cc.rows){if(read(cc,r,'school')!==preview.school_id)continue;const sid=read(cc,r,'student');if(!ccByStudent.has(sid))ccByStudent.set(sid,[]);ccByStudent.get(sid).push(r);}
 for(const r of sections.rows){if(read(sections,r,'school')!==preview.school_id)continue;let id=read(sections,r,'id');if(!sectionById.has(id))sectionById.set(id,[]);sectionById.get(id).push(r);}
 for(const r of meeting.rows){if(read(meeting,r,'school')!==preview.school_id||read(meeting,r,'year')!==preview.year_id)continue;let id=read(meeting,r,'section');if(!meetBySection.has(id))meetBySection.set(id,[]);meetBySection.get(id).push(r);}
 return {cc,sections,meeting,ccByStudent,sectionById,meetBySection};}
function diagnose(r,src,termId){
 if(!src)return {root_cause:'EXPORT_TABLES_UNAVAILABLE',explanation:'Required CC/Sections/Section_Meeting source tables unavailable.',traces:[]};
 const all=src.ccByStudent.get(r.ps_student_id)||[],current=all.filter(row=>read(src.cc,row,'term')===termId);
 const nonstandard=all.filter(row=>read(src.cc,row,'term')!==termId);
 const traces=[];let periodMatched=0,startsAfter=0,endedBefore=0,duplicate=0;
 for(const c of all){const sid=read(src.cc,c,'section'),term=read(src.cc,c,'term');const sec=src.sectionById.get(sid)||[];const secs=sec.filter(s=>read(src.sections,s,'term')===term);const matches=(src.meetBySection.get(sid)||[]).some(m=>read(src.meeting,m,'period')===r.period_number&&read(src.meeting,m,'cycle')===r.cycle);
 const start=dateKey(read(src.cc,c,'start')),end=dateKey(read(src.cc,c,'end'));
 const before=!!start&&start>r.date,after=!!end&&end<=r.date;
 if(term===termId&&matches&&secs.length===1){periodMatched++;if(before)startsAfter++;if(after)endedBefore++;}
 if(secs.length>1)duplicate++;
 let reason=term!==termId?'nonstandard_or_historical_term':!secs.length?'section_missing_from_export':!matches?'section_not_assigned_this_period_or_rotation':before?'enrollment_starts_after_attendance':after?'enrollment_ended_before_attendance':'dated_candidate_requires_additional_review';
 traces.push({ccid:read(src.cc,c,'id'),section_id:sid,term_id:term,school_id:read(src.cc,c,'school'),date_enrolled:start,date_left:end,period_rotation_match:matches,section_found:secs.length>0,section_ambiguity:secs.length>1,teacher_id:secs.length===1?read(src.sections,secs[0],'teacher'):'',room:secs.length===1?read(src.sections,secs[0],'room'):'',course:secs.length===1?read(src.sections,secs[0],'course'):'',reason});
 }
 let root='SECTION_OR_PERIOD_MEMBERSHIP_UNRESOLVED',why='No unique dated, period-matching section; review section meeting/rotation and historical membership.';
 if(!current.length&&nonstandard.length){root='HISTORICAL_CC_NONSTANDARD_TERM';why='Student has CC history, but no CC rows under the selected current term; investigate nonstandard/negative TermID records.';}
 else if(!current.length){root='NO_CURRENT_TERM_CC';why='No CC enrollment for this student in the selected current term.';}
 else if(periodMatched&&startsAfter){root='ATTENDANCE_BEFORE_SECTION_ENROLLMENT';why='A section matches the official period and cycle, but CC.DateEnrolled occurs after this attendance date.';}
 else if(periodMatched&&endedBefore){root='ATTENDANCE_AFTER_SECTION_EXIT';why='A matching section exists but CC.DateLeft is on or before this attendance date.';}
 else if(duplicate){root='AMBIGUOUS_SECTION_REFERENCE';why='More than one exported section row shares an enrollment section key.';}
 const rank=x=>x.reason==='enrollment_starts_after_attendance'?0:x.reason==='enrollment_ended_before_attendance'?1:x.period_rotation_match?2:x.reason==='nonstandard_or_historical_term'?3:4;
 traces.sort((a,b)=>rank(a)-rank(b)||a.section_id.localeCompare(b.section_id));
 return {root_cause:root,explanation:why,CC_rows_total:all.length,current_term_CC_rows:current.length,nonstandard_term_CC_rows:nonstandard.length,matching_period_rotation_current_term_rows:periodMatched,traces:traces.slice(0,40),trace_truncated:traces.length>40};
}
function build(raw,opts){const preview=rawBuild(raw,opts),src=constructSources(raw,preview);
 const causes={},exclusions={};
 for(const r of preview.records){const p=policyFor(r,preview);r.meeting_obligation_eligible=r.kind==='meeting';
  if(p){r.meeting_obligation_eligible=false;r.schedule_policy_id=p.id;r.schedule_policy_reason=p.reason;r.original_warnings=[...r.warnings];r.status='EXCLUDED_POLICY';r.warnings=[];r.correction_candidate=false;r.section_inference='not_applicable_policy_exclusion';r.root_cause='';r.inferred_ccid='';r.inferred_section_id='';r.inferred_teacher_id='';r.inferred_room='';r.match_count=0;exclusions[p.id]=(exclusions[p.id]||0)+1;continue;}
  if(r.kind==='meeting'&&(r.warnings.includes('no_dated_section_match')||r.warnings.includes('ambiguous_dated_section'))){const d=diagnose(r,src,preview.term_id);r.root_cause=d.root_cause;r.enrollment_investigation=d;causes[d.root_cause]=(causes[d.root_cause]||0)+1;}
 }
 const byDate=new Map();for(const r of preview.records){let d=byDate.get(r.date)||{issues:0,corrections:0,excluded:0,eligible:0};if(r.kind==='meeting'){if(r.status==='EXCLUDED_POLICY')d.excluded++;else d.eligible++;}if(r.warnings.length)d.issues++;if(r.correction_candidate)d.corrections++;byDate.set(r.date,d);}
 for(const day of preview.days){const sum=byDate.get(day.date)||{issues:0,corrections:0,excluded:0,eligible:0};day.source_issues=sum.issues;day.corrections=sum.corrections;day.meeting_excluded_by_policy=sum.excluded;day.meeting_obligations_eligible=sum.eligible;day.meeting_raw_records=day.meeting;}
 preview.issues=Object.fromEntries(preview.records.flatMap(r=>r.warnings).reduce((m,k)=>(m.set(k,(m.get(k)||0)+1),m),new Map()));
 preview.stats={...preview.stats,review:preview.records.filter(r=>r.status==='NEEDS_REVIEW').length,provisional:preview.records.filter(r=>r.status==='PROVISIONAL').length,correction_candidates:preview.records.filter(r=>r.correction_candidate).length,section_unique:preview.records.filter(r=>r.section_inference==='unique_dated_cc_candidate_not_official_ccid').length,meeting_excluded_by_policy:preview.records.filter(r=>r.status==='EXCLUDED_POLICY').length,meeting_obligations_eligible:preview.records.filter(r=>r.kind==='meeting'&&r.status!=='EXCLUDED_POLICY').length};
 preview.policy_version=POLICY_VERSION;preview.policies=POLICIES.map(p=>({...p,affected_record_count:exclusions[p.id]||0}));preview.enrollment_root_cause_counts=causes;preview.policy_exclusion_counts=exclusions;
 preview.limitations.push('Batch 6C schedule exclusions apply to this browser reconciliation preview; D1, PowerSchool, eligibility services and teacher accountability engines are NOT modified.','Enrollment explanations describe exported CC evidence, not approved PowerSchool enrollment edits.');
 return preview;}
function compareD1(preview,index,maps={}){const c=rawCompare(preview,index,maps),byDate=new Map(preview.days.map(d=>[d.date,d]));
 c.counts.uncompared_d1=0;c.counts.special_day_d1_excluded=0;
 const bellByDate=new Map(preview.records.filter(r=>r.kind==='meeting').map(r=>[r.date,r.bell_schedule_id]));
 for(const r of c.queue){if(r.kind!=='d1_record_without_approved_export_key')continue;
  const day=byDate.get(r.date);if(day?.special){r.kind='published_d1_record_on_daily_only_special_event';r.severity='EXCLUDED_POLICY';r.explanation='Preserved in published D1; this date has no meeting attendance obligation.';c.counts.unexpected_d1--;c.counts.special_day_d1_excluded++;continue;}
  const bell=bellByDate.get(r.date)||'';
  if(!maps?.[`${r.date}@${bell}`]&&!maps?.[bell]){r.kind='d1_correction_not_comparable_without_approved_mapping';r.severity='PROVISIONAL';r.explanation='There is no approved PS-to-local mapping for the date/bell schedule.';c.counts.unexpected_d1--;c.counts.uncompared_d1++;}
 }
 c.policy_version=POLICY_VERSION;c.limitations.push('D1 source records excluded by preview policy remain stored and unchanged.');return c;}
function safeSummary(preview,comparison){const out=rawSummary(preview,comparison);out.version='6C';out.policy_version=preview.policy_version;out.policies=preview.policies;out.enrollment_root_cause_counts=preview.enrollment_root_cause_counts;out.policy_exclusion_counts=preview.policy_exclusion_counts;return out;}
return {build,compareD1,safeSummary,POLICY_VERSION,POLICIES,diagnose};
});

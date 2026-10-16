/* EAGLENEST_ATTENDANCE_RECON_BATCH6B_V1 — client-only PS historical evidence reconciliation.
 * Raw PowerSchool export rows remain local to the browser. CCID/section links are
 * inferred from dated enrollment + cycle and NEVER represented as official Attendance.CCID.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.EagleNESTBatch6B=api;})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const norm=x=>String(x??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const val=x=>String(x??'').trim();
const yyyy=s=>{s=val(s);if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(0,10);let m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);if(m){let v=`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;return new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v?v:'';}return '';};
const FIELDS={id:['id'],osis:['student_number'],studentId:['studentid','student_id'],school:['schoolid','school_id'],date:['att_date','date','school_date'],codeId:['attendance_codeid','attendance_code_id'],periodId:['periodid','period_id'],sectionId:['sectionid','section_id'],termId:['termid','term_id'],yearId:['year_id','yearid'],cycleId:['cycle_day_id','cycledayid','cycle_day_id'],cycle:['letter','cycle_day_letter'],bellId:['bell_schedule_id','bellscheduleid'],start:['dateenrolled','date_enrolled'],end:['dateleft','date_left'],periodNo:['period_number','periodnumber'],code:['att_code'],description:['description'],room:['room'],teacher:['teacher'],course:['course_number'],sectionNo:['section_number'],inSession:['insession','in_session']};
function read(f,r,key){if(!f)return '';const desired=FIELDS[key]||[];let idx=f.headers.findIndex(h=>desired.includes(norm(h)));return idx<0?'':val(r[idx]);}
function roleFiles(raw){const out=new Map();for(const rawF of raw||[]){let n=norm(rawF.name.replace(/\.export\.[^.]+$/i,'').replace(/\.(csv|tsv|xlsx|xls)$/i,'')),name={students:'students',cc:'cc',sections:'sections',section_meeting:'section_meeting',teachers:'teachers',calendar_day:'calendar_day',cycle_day:'cycle_day',bell_schedule_items:'bell_schedule_items',period:'period',attendance:'attendance',attendance_code:'attendance_code'}[n]||({meeting_attendance:'attendance',calendar_days:'calendar_day',periods:'period',attendance_codes:'attendance_code'}[rawF.roleOverride||rawF.role]||'');if(name){if(out.has(name))throw Error('duplicate_source_table_'+name);out.set(name,{...rawF,role:name});}}return out;}
function indexed(f,key,accept=()=>true){const idx=new Map();for(const row of f?.rows||[]){if(!accept(row))continue;let k=read(f,row,key);if(k){if(!idx.has(k))idx.set(k,[]);idx.get(k).push(row);}}return idx;}
function one(map,key){let a=map.get(key)||[];return a.length===1?a[0]:null;}
function codeStatus(code){return ({E:'excused',EL:'excused_late',ISS:'iss',OSS:'oss',P:'present',PRESENT:'present'}[val(code).toUpperCase()]||'');}
function build(rawFiles,{start='2026-08-31',end='2026-10-15',schoolId='2',yearId='36',termId='3600',maxRows=50000}={}){
 if(!/^\d{4}-\d\d-\d\d$/.test(start)||!/^\d{4}-\d\d-\d\d$/.test(end)||end<start||!/^\d+$/.test(schoolId)||!/^\d+$/.test(yearId)||!/^\d+$/.test(termId))throw Error('invalid_reconciliation_scope');
 const f=roleFiles(rawFiles),required=['students','attendance','attendance_code','period','calendar_day','cycle_day','bell_schedule_items','cc','sections','section_meeting'];
 const missing=required.filter(k=>!f.has(k));if(missing.length)throw Error('missing_export_tables: '+missing.join(', '));
 const byStudent=indexed(f.get('students'),'id'),byPeriod=indexed(f.get('period'),'id',r=>read(f.get('period'),r,'school')===schoolId&&read(f.get('period'),r,'yearId')===yearId),byCode=indexed(f.get('attendance_code'),'id',r=>read(f.get('attendance_code'),r,'school')===schoolId&&read(f.get('attendance_code'),r,'yearId')===yearId),byCycle=indexed(f.get('cycle_day'),'id',r=>read(f.get('cycle_day'),r,'school')===schoolId&&read(f.get('cycle_day'),r,'yearId')===yearId),bySection=indexed(f.get('sections'),'id',r=>read(f.get('sections'),r,'school')===schoolId&&read(f.get('sections'),r,'termId')===termId),byCC=indexed(f.get('cc'),'studentId',r=>read(f.get('cc'),r,'school')===schoolId&&read(f.get('cc'),r,'termId')===termId),byMeet=indexed(f.get('section_meeting'),'sectionId',r=>read(f.get('section_meeting'),r,'school')===schoolId&&read(f.get('section_meeting'),r,'yearId')===yearId),byDate=indexed(f.get('calendar_day'),'date'),byBell=indexed(f.get('bell_schedule_items'),'bellId');
 const calendar=new Map();const invalidCalendars=new Set();for(const row of f.get('calendar_day').rows){const date=yyyy(read(f.get('calendar_day'),row,'date'));if(!date||date<start||date>end)continue;const cycle=one(byCycle,read(f.get('calendar_day'),row,'cycleId'));if(!cycle)continue;let value={date,cycle:read(f.get('cycle_day'),cycle,'cycle'),bell:read(f.get('calendar_day'),row,'bellId'),id:read(f.get('calendar_day'),row,'id'),inSession:read(f.get('calendar_day'),row,'inSession')==='1'};if(calendar.has(date)){invalidCalendars.add(date);calendar.delete(date);}else if(!invalidCalendars.has(date))calendar.set(date,value);}
 const records=[],days=new Map(),issues=new Map();const add=(item,kind)=>{issues.set(kind,(issues.get(kind)||0)+1);item.warnings.push(kind);};
 for(const [index,row] of f.get('attendance').rows.entries()){
  if(records.length>=maxRows)throw Error('source_limit_exceeded');const date=yyyy(read(f.get('attendance'),row,'date'));
  if(!date||date<start||date>end||read(f.get('attendance'),row,'school')!==schoolId)continue;
  const studentId=read(f.get('attendance'),row,'studentId'),pid=read(f.get('attendance'),row,'periodId'),codeId=read(f.get('attendance'),row,'codeId');
  const student=one(byStudent,studentId),period=pid==='0'?null:one(byPeriod,pid),code=one(byCode,codeId),cal=calendar.get(date)||null,periodNo=period?read(f.get('period'),period,'periodNo'):'';
  const day=days.get(date)||{date,records:0,daily:0,meeting:0,corrections:0,special:false,source_issues:0};days.set(date,day);day.records++;
  const item={row_index:index+2,date,student_number:student?read(f.get('students'),student,'osis'):'',ps_student_id:studentId,period_id:pid,period_number:periodNo,code_id:codeId,code:code?(read(f.get('attendance_code'),code,'code')||read(f.get('attendance_code'),code,'description')):'',status:'VERIFIED',kind:pid==='0'?'daily':'meeting',cycle:cal?.cycle||'',bell_schedule_id:cal?.bell||'',calendar_day_id:cal?.id||'',in_session:cal?.inSession??null,section_inference:'not_attempted',inferred_ccid:'',inferred_section_id:'',inferred_teacher_id:'',inferred_room:'',match_count:0,warnings:[]};
  if(!student||!item.student_number||!/^[0-9]{5,15}$/.test(item.student_number))add(item,'student_identity_unresolved');
  if(!code)add(item,'attendance_code_not_found');
  if(!cal)add(item,'calendar_day_not_uniquely_identified');
  if(pid!=='0'&&!period)add(item,'period_id_not_found_in_hs_year');
  if(item.kind==='daily'){day.daily++;item.section_inference='not_applicable_daily';}
  else{
   day.meeting++;const bs=cal?(byBell.get(cal.bell)||[]).filter(x=>read(f.get('bell_schedule_items'),x,'periodId')!=='' ):[];
   const validBell=bs.some(x=>read(f.get('bell_schedule_items'),x,'periodId')===pid);
   const special=cal&&bs.length===1;if(special){day.special=true;add(item,'single_period_custom_schedule');}
   if(cal&&!validBell)add(item,'period_off_official_bell');
   if(cal?.inSession===false)add(item,'not_in_session_on_official_calendar');
   if(student&&period&&cal){const candidates=[];
    for(const cc of byCC.get(studentId)||[]){const joined=one(bySection,read(f.get('cc'),cc,'sectionId'));if(!joined)continue;
     const enroll=yyyy(read(f.get('cc'),cc,'start')),exit=yyyy(read(f.get('cc'),cc,'end'));
     if((enroll&&enroll>date)||(exit&&exit<=date))continue;
     const match=(byMeet.get(read(f.get('cc'),cc,'sectionId'))||[]).some(m=>read(f.get('section_meeting'),m,'periodNo')===periodNo&&read(f.get('section_meeting'),m,'cycle')===cal.cycle);
     if(match)candidates.push({ccid:read(f.get('cc'),cc,'id'),sid:read(f.get('cc'),cc,'sectionId'),teacher:read(f.get('sections'),joined,'teacher'),room:read(f.get('sections'),joined,'room')});
    }
    item.match_count=candidates.length;
    if(candidates.length===1){item.section_inference='unique_dated_cc_candidate_not_official_ccid';item.inferred_ccid=candidates[0].ccid;item.inferred_section_id=candidates[0].sid;item.inferred_teacher_id=candidates[0].teacher;item.inferred_room=candidates[0].room;}
    else{item.section_inference=candidates.length>1?'ambiguous_multiple_cc_candidates':'no_dated_section_candidate';add(item,candidates.length>1?'ambiguous_dated_section':'no_dated_section_match');}
   }else item.section_inference='source_insufficient';
  }
  item.correction_status=item.kind==='meeting'?codeStatus(item.code):'';item.correction_candidate=!!item.correction_status&&/^[1-6]$/.test(item.period_number);
  if(item.correction_candidate)day.corrections++;
  if(item.warnings.length){day.source_issues++;item.status=item.warnings.some(w=>['student_identity_unresolved','attendance_code_not_found','calendar_day_not_uniquely_identified','period_id_not_found_in_hs_year','ambiguous_dated_section','no_dated_section_match'].includes(w))?'NEEDS_REVIEW':'PROVISIONAL';}
  // Inferred CCID must never be confused with source Attendance.CCID.
  records.push(item);
 }
 return {read_only:true,local_browser_only:true,school_id:schoolId,year_id:yearId,term_id:termId,range:{start,end},source_files:[...f.values()].map(x=>x.name),records,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),issues:Object.fromEntries(issues),stats:{total:records.length,daily:records.filter(r=>r.kind==='daily').length,meeting:records.filter(r=>r.kind==='meeting').length,section_unique:records.filter(r=>r.section_inference==='unique_dated_cc_candidate_not_official_ccid').length,correction_candidates:records.filter(r=>r.correction_candidate).length,review:records.filter(r=>r.status==='NEEDS_REVIEW').length,provisional:records.filter(r=>r.status==='PROVISIONAL').length},limitations:['Source Attendance export lacks CCID and record ID: classroom links are inferred only','Official daily PowerSchool codes are not physical classroom observations','Absent evidence is never evidence of absence or staff neglect','Nonmatching D1 correction periods cannot be established without explicit, date/bell-scoped local period mapping']};
}
function compareD1(preview, index, approvedMaps={}){
 if(!preview?.records||!index?.ok||!Array.isArray(index.rows))throw Error('correction_index_unavailable');
 const scope=index.correction_snapshot||null;const lookup=new Map(),seen=new Set(),compare=[],counts={matched:0,mismatch:0,missing_in_d1:0,unmapped:0,out_of_scope:0,duplicate:0,unexpected_d1:0};
 for(const d of index.rows){let k=[d.school_date,d.student_number,d.period_local].join('|');if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push(d);}
 for(const r of preview.records){if(!r.correction_candidate||!r.student_number)continue;
  const applicable=scope&&r.date>=scope.range_start&&r.date<=scope.range_end;
  if(!applicable){counts.out_of_scope++;continue;}
  const chosen=(approvedMaps[r.date+'@'+r.bell_schedule_id]||approvedMaps[r.bell_schedule_id])?.[r.period_id];
  if(!chosen){counts.unmapped++;continue;}
  if(!/^[1-6]$/.test(String(chosen)))continue;
  const k=[r.date,r.student_number,chosen].join('|'),found=lookup.get(k)||[];
  if(found.length>1){counts.duplicate++;compare.push({date:r.date,student_number:r.student_number,period_id:r.period_id,period_local:chosen,code_id:r.code_id,kind:'multiple_d1_corrections',severity:'NEEDS_REVIEW'});continue;}
  seen.add(k);
  if(!found.length){counts.missing_in_d1++;compare.push({date:r.date,student_number:r.student_number,period_id:r.period_id,period_local:chosen,code_id:r.code_id,kind:'ps_correction_absent_from_published_d1',severity:'MISSING_EVIDENCE'});}
  else if(String(found[0].code_id)!==String(r.code_id)||String(found[0].status)!==String(r.correction_status)){
   counts.mismatch++;compare.push({date:r.date,student_number:r.student_number,period_id:r.period_id,period_local:chosen,code_id:r.code_id,d1_code_id:found[0].code_id,kind:'official_code_changed_or_mapping_invalid',severity:'NEEDS_REVIEW'});
  }else counts.matched++;
 }
 for(const [k,ds] of lookup){let [date,student,local]=k.split('|');if(date<preview.range.start||date>preview.range.end)continue;
  if(!seen.has(k)){counts.unexpected_d1+=ds.length;compare.push({date,student_number:student,period_local:local,kind:'d1_record_without_approved_export_key',severity:'PROVISIONAL'});}
 }
 return {ok:true,read_only:true,correction_snapshot:scope,counts,queue:compare,limitations:['D1 corrections represent last published version, not original event edit history','Only explicitly approved bell-schedule/PS-period → local-period mappings permit key-level discrepancies','PowerSchool source export is a point-in-time snapshot, not an immutable historical action ledger']};
}
function parseApprovedMaps(raw){let value=typeof raw==='string'?JSON.parse(raw):raw;if(!value||typeof value!=='object'||Array.isArray(value))throw Error('expected_object_of_bell_schedule_maps');const map={};for(let [bell,periods] of Object.entries(value)){if(!/^(?:\d+|\d{4}-\d{2}-\d{2}@\d+)$/.test(bell)||!periods||typeof periods!=='object'||Array.isArray(periods))throw Error('invalid_bell_schedule_id');map[bell]={};for(let [pid,local] of Object.entries(periods)){if(!/^\d+$/.test(pid)||!(/^(?:[1-6]|ADV|FM1|FM2|LCH1|LCH2|SKIP)$/.test(String(local))))throw Error('invalid_ps_period_to_local_mapping');map[bell][pid]=String(local);}}return map;}
function safeSummary(preview,comparison){return {version:'6B',scope:{...preview.range,school_id:preview.school_id,year_id:preview.year_id},source_file_count:preview.source_files.length,stats:preview.stats,days:preview.days,issues:preview.issues,comparison_counts:comparison?.counts||null,correction_scope:comparison?.correction_snapshot?{range_start:comparison.correction_snapshot.range_start,range_end:comparison.correction_snapshot.range_end,row_count:comparison.correction_snapshot.row_count}:null,limitations:preview.limitations};}
return {build,compareD1,parseApprovedMaps,safeSummary,roleFiles,codeStatus};
});

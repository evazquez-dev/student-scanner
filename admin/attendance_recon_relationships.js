/* EAGLENEST_PS_RELATIONSHIP_INSPECTOR_BATCH6A1 — local-only schema analysis, NO uploads or writes. */
(function(root, factory) {
  const api=factory();
  if (typeof module === 'object' && module.exports) module.exports=api;
  if (root) root.EagleNESTPowerSchoolRelationships=api;
})(typeof globalThis === 'object' ? globalThis : null, function() {
  'use strict';
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  const value=v=>String(v??'').trim();
  const ROLE_HINTS=[
    [/^(students?|student)$/,'students'],[/^(cc|course_enrollments?|course_enrollment)$/,'cc'],
    [/^(section_meeting|section_meetings)$/,'section_meeting'],[/^(sections|section)$/,'sections'],
    [/^(sectionteacher|section_teacher|section_teachers)$/,'section_teachers'],
    [/^(teachers|teacher|school_staff)$/,'teachers'],[/^(calendar_day|calendar_days)$/,'calendar_days'],
    [/^(cycle_day|cycle_days)$/,'cycle_days'],[/^(bell_schedule_items|bell_schedule_item)$/,'bell_schedule_items'],
    [/^(bell_schedule|bell_schedules)$/,'bell_schedules'],[/^(period|periods)$/,'periods'],
    [/^(attendance_code|attendance_codes)$/,'attendance_codes'],
    [/^(attendance|meeting_attendance|attendance_meeting)$/,'meeting_attendance'],
    [/^(daily_attendance|attendance_daily)$/,'daily_attendance'],[/^(courses|course)$/,'courses']
  ];
  const HEADERS={
    row_id:['id'],osis:['student_number','osis','state_student_id','stateid','nyc_student_id','studentnumber'],
    ps_id:['studentid','student_id','students_id','studentsdcid','powerschool_student_id','ps_student_id'],
    section_id:['sectionid','section_id','sections_id'],ccid:['ccid','course_enrollment_id','courseenrollmentid'],
    period_id:['periodid','period_id'],period_number:['period_number','periodnumber','period'],
    calendar_day_id:['calendar_day_id','calendardayid','calendar_dayid','calendardaydcid'],
    cycle_day_id:['cycle_day_id','cycledayid'],bell_schedule_id:['bell_schedule_id','bellscheduleid'],
    attendance_code_id:['attendance_code_id','attendancecodeid','attendance_codeid','att_code_id','attcodeid','code_id'],
    teacher_id:['teacherid','teacher_id','teacher'],school_id:['schoolid','school_id'],
    year_id:['yearid','year_id'],date:['date','school_date','attendance_date','att_date','calendar_date'],
    entry_date:['dateenrolled','date_enrolled','entrydate','entry_date','start_date'],
    exit_date:['dateleft','date_left','exitdate','exit_date','end_date'],
    code:['att_code','attendance_code','code','abbr','abbreviation'],
    course:['course_number','coursenumber','course_name','course'],
    first:['first_name','firstname'],last:['last_name','lastname'],
    in_session:['insession','in_session','school_in_session']
  };
  const ROLE_FIELDS={
    students:['row_id','osis','school_id','entry_date','exit_date'],
    cc:['row_id','ps_id','section_id','school_id','entry_date','exit_date'],
    sections:['row_id','teacher_id','course','school_id','year_id'],
    section_meeting:['row_id','section_id','period_id','period_number','bell_schedule_id','school_id'],
    teachers:['row_id','school_id'],
    section_teachers:['row_id','section_id','teacher_id'],
    calendar_days:['row_id','date','in_session','cycle_day_id','bell_schedule_id','school_id'],
    cycle_days:['row_id','school_id'],
    bell_schedule_items:['row_id','bell_schedule_id','period_id'],
    bell_schedules:['row_id','school_id'],periods:['row_id','period_number','school_id'],
    attendance_codes:['row_id','code','school_id'],
    meeting_attendance:['row_id','ps_id','ccid','calendar_day_id','period_id','attendance_code_id','school_id','date'],
    daily_attendance:['row_id','ps_id','calendar_day_id','attendance_code_id','school_id','date'],
    courses:['row_id','course','school_id']
  };
  const FIELD_LABELS={row_id:'Record ID (ID)',osis:'OSIS (Student_Number)',ps_id:'StudentID → Students.ID',section_id:'SectionID → Sections.ID',ccid:'CCID → CC.ID',period_id:'PeriodID → Period.ID',period_number:'Period number',calendar_day_id:'Calendar_DayID → Calendar_Day.ID',cycle_day_id:'Cycle_DayID → Cycle_Day.ID',bell_schedule_id:'Bell_ScheduleID',attendance_code_id:'Attendance_CodeID → Attendance_Code.ID',teacher_id:'Teacher ID → Teachers.ID',school_id:'SchoolID',year_id:'YearID',date:'Date',entry_date:'Date enrolled / start',exit_date:'Date left / end',code:'Attendance code',course:'Course',first:'First name',last:'Last name',in_session:'In session'};
  const RELATIONS=[
    ['cc','ps_id','students','row_id','CC.StudentID → Students.ID'],
    ['cc','section_id','sections','row_id','CC.SectionID → Sections.ID'],
    ['section_meeting','section_id','sections','row_id','Section_Meeting.SectionID → Sections.ID'],
    ['section_teachers','section_id','sections','row_id','SectionTeacher.SectionID → Sections.ID'],
    ['sections','teacher_id','teachers','row_id','Sections.Teacher → Teachers.ID'],
    ['section_teachers','teacher_id','teachers','row_id','SectionTeacher.TeacherID → Teachers.ID'],
    ['calendar_days','cycle_day_id','cycle_days','row_id','Calendar_Day.Cycle_DayID → Cycle_Day.ID'],
    ['calendar_days','bell_schedule_id','bell_schedules','row_id','Calendar_Day.Bell_ScheduleID → Bell_Schedule.ID'],
    ['bell_schedule_items','bell_schedule_id','bell_schedules','row_id','Bell_Schedule_Items.Bell_ScheduleID → Bell_Schedule.ID'],
    ['bell_schedule_items','period_id','periods','row_id','Bell_Schedule_Items.Period_ID → Period.ID'],
    ['meeting_attendance','ps_id','students','row_id','Attendance.StudentID → Students.ID'],
    ['meeting_attendance','ccid','cc','row_id','Attendance.CCID → CC.ID'],
    ['meeting_attendance','calendar_day_id','calendar_days','row_id','Attendance.Calendar_DayID → Calendar_Day.ID'],
    ['meeting_attendance','period_id','periods','row_id','Attendance.PeriodID → Period.ID'],
    ['meeting_attendance','attendance_code_id','attendance_codes','row_id','Attendance.Attendance_CodeID → Attendance_Code.ID'],
    ['daily_attendance','ps_id','students','row_id','DailyAttendance.StudentID → Students.ID'],
    ['daily_attendance','attendance_code_id','attendance_codes','row_id','DailyAttendance.Attendance_CodeID → Attendance_Code.ID'],
    ['daily_attendance','calendar_day_id','calendar_days','row_id','DailyAttendance.Calendar_DayID → Calendar_Day.ID']
  ];
  function headerIndex(f,k){
    const manual=f.mapping?.[k];
    if(manual===-1)return -1;
    if(Number.isInteger(manual)&&manual>=0&&manual<f.headers.length){
      const manualHeader=norm(f.headers[manual]);
      // Legacy Batch 6 incorrectly interpreted SectionID as a CCID. Never trust that cross-domain mapping.
      if (!(k==='ccid'&&['sectionid','section_id'].includes(manualHeader))) return manual;
    }
    const headers=f.headers.map(norm);
    const choices=HEADERS[k]||[];
    let index=headers.findIndex(h=>choices.includes(h));
    if(index>=0)return index;
    // Generic ID belongs to a source TABLE, not all keys called ID.
    if(k==='ps_id'&&f.role==='students')return headers.indexOf('id');
    if(k==='ccid'&&f.role==='cc')return headers.indexOf('id');
    return -1;
  }
  function pick(f,row,k){const i=headerIndex(f,k);return i<0?'':value(row[i]);}
  function roleFor(f){
    const name=norm(String(f.name||'').split('/').pop().replace(/\.export\.[^.]+$/i,'').replace(/\.(csv|tsv|xls|xlsx|txt)$/i,''));
    for(const [pat,r] of ROLE_HINTS)if(pat.test(name))return r;
    const headers=f.headers.map(norm),has=k=>(HEADERS[k]||[]).some(n=>headers.includes(n));
    if(has('osis')&&headers.includes('id'))return 'students';
    if(has('ps_id')&&has('section_id')&&headers.includes('id'))return 'cc';
    if(has('date')&&has('in_session'))return 'calendar_days';
    if(has('attendance_code_id')&&has('ps_id')&&has('ccid'))return 'meeting_attendance';
    if(has('code')&&headers.includes('id')&&!has('ps_id'))return 'attendance_codes';
    return 'unclassified';
  }
  function configure(file){return {...file,role:file.roleOverride||roleFor(file)};}
  function dateValue(raw){
    const s=value(raw);if(!s)return '';
    if(/^\d{4}-\d\d-\d\d/.test(s)){const d=s.slice(0,10);return !Number.isNaN(Date.parse(d+'T12:00:00Z'))?d:'';}
    const match=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(match){const d=`${match[3]}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`;const parsed=new Date(d+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===d?d:'';}
    if(/^\d{5}(?:\.0+)?$/.test(s)){const n=Number(s);if(n<20000||n>90000)return '';return new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10);}
    return '';
  }
  function scopeRows(f,{schoolId='2',yearId='',onDate=''}={}){
    const hasSchool=headerIndex(f,'school_id')>=0,hasYear=headerIndex(f,'year_id')>=0;
    // Never silently infer historical membership from a current student's SchoolID.
    const all=f.rows.map((row,i)=>({row,i:i+2}));
    const out=all.filter(rec=>{
      const row=rec.row;
      if(schoolId && hasSchool && pick(f,row,'school_id')!==String(schoolId))return false;
      if(yearId && hasYear && pick(f,row,'year_id')!==String(yearId))return false;
      if(onDate && f.role==='cc'){
        const start=dateValue(pick(f,row,'entry_date')),end=dateValue(pick(f,row,'exit_date'));
        if(start&&start>onDate)return false;
        if(end&&end<=onDate)return false;
      }
      return true;
    });
    return {rows:out,unscoped_count:all.length,scope_applied:{school_id:!!(schoolId&&hasSchool),year_id:!!(yearId&&hasYear),cc_membership_date:!!(onDate&&f.role==='cc')},unverifiable_school_scope:!!(schoolId&&!hasSchool)};
  }
  function analyze(rawFiles=[],options={}){
    const files=rawFiles.map(configure);const inventory=[];const byRole=new Map();
    for(const f of files){if(!byRole.has(f.role))byRole.set(f.role,[]);byRole.get(f.role).push(f);
      const scope=scopeRows(f,options),available=ROLE_FIELDS[f.role]||[];
      const knownDates=[...new Set(scope.rows.map(({row})=>dateValue(pick(f,row,'date'))).filter(Boolean))].sort();
      inventory.push({file:f.name,sheet:f.sheet,type:f.role,rows:f.rows.length,scoped_rows:scope.rows.length,scope_applied:scope.scope_applied,school_scope_unverified:scope.unverifiable_school_scope,
        date_range:knownDates.length?knownDates[0]+' to '+knownDates.at(-1):null,distinct_dates:knownDates.length,
        key_columns:Object.fromEntries(available.map(k=>[k,headerIndex(f,k)<0?null:f.headers[headerIndex(f,k)]])),
        missing_required_keys:({students:['row_id','osis'],cc:['row_id','ps_id','section_id'],sections:['row_id'],section_meeting:['section_id'],calendar_days:['row_id','date']})[f.role]?.filter(k=>headerIndex(f,k)<0)||[]});
    }
    const crosswalk=new Map(),reverse=new Map(),conflictingOsis=new Set(),conflictingPs=new Set(),sourceFiles=[];
    for(const f of byRole.get('students')||[]){if(headerIndex(f,'osis')<0||headerIndex(f,'row_id')<0)continue;
      const {rows}=scopeRows(f,options);let valid=0;
      for(const {row} of rows){const osis=pick(f,row,'osis'),id=pick(f,row,'row_id');if(!osis||!id)continue;valid++;
        if(!crosswalk.has(osis))crosswalk.set(osis,new Set());crosswalk.get(osis).add(id);
        if(!reverse.has(id))reverse.set(id,new Set());reverse.get(id).add(osis);
      }sourceFiles.push({file:f.name,source_table:'Students',rows_with_both_ids:valid});
    }
    const verified=new Map();for(const [osis,ids] of crosswalk){if(ids.size!==1){conflictingOsis.add(osis);continue;}const id=[...ids][0];if(reverse.get(id)?.size!==1){conflictingPs.add(id);continue;}verified.set(osis,id);}
    const joinRows=[];
    for(const [childRole,childField,parentRole,parentField,label] of RELATIONS){
      const children=byRole.get(childRole)||[],parents=byRole.get(parentRole)||[];
      if(!children.length&&!parents.length)continue;
      if(!children.length||!parents.length){joinRows.push({relationship:label,status:'missing_table',missing:!children.length?childRole:parentRole});continue;}
      for(const child of children)for(const parent of parents){const relation={relationship:label,left:child.name,right:parent.name,child_field:childField,parent_field:parentField};
        const ci=headerIndex(child,childField),pi=headerIndex(parent,parentField);
        if(ci<0||pi<0){joinRows.push({...relation,status:'missing_key',missing:ci<0?`${childRole}.${childField}`:`${parentRole}.${parentField}`});continue;}
        const pc=scopeRows(parent,options),cc=scopeRows(child,options);
        const parentIndex=new Map();let parentEmpty=0;
        for(const {row} of pc.rows){const id=pick(parent,row,parentField);if(!id){parentEmpty++;continue;}parentIndex.set(id,(parentIndex.get(id)||0)+1);}
        let matched=0,unmatched=0,ambiguous=0,blank=0,schoolConflicts=0;const samples=[];
        const checkSchool=headerIndex(child,'school_id')>=0&&headerIndex(parent,'school_id')>=0;
        const parentSchools=new Map();if(checkSchool)for(const {row} of pc.rows){const id=pick(parent,row,parentField),s=pick(parent,row,'school_id');if(id&&s){if(!parentSchools.has(id))parentSchools.set(id,new Set());parentSchools.get(id).add(s);}}
        for(const {row,i} of cc.rows){const id=pick(child,row,childField);if(!id){blank++;continue;}
          const n=parentIndex.get(id)||0;
          const sc=checkSchool&&parentSchools.has(id)&&!parentSchools.get(id).has(pick(child,row,'school_id'));
          if(sc){unmatched++;schoolConflicts++;if(samples.length<8)samples.push({row:i,issue:'school_id_conflict'});}
          else if(n===1)matched++;else if(n>1){ambiguous++;if(samples.length<8)samples.push({row:i,issue:'duplicate_parent_id'});}
          else{unmatched++;if(samples.length<8)samples.push({row:i,issue:'parent_id_not_found'});}
        }
        joinRows.push({...relation,status:ambiguous?'ambiguous':unmatched?'partial':'matched',scoped_child_rows:cc.rows.length,scoped_parent_rows:pc.rows.length,
          matched,unmatched,ambiguous,blank,school_conflicts:schoolConflicts,duplicate_parent_ids:[...parentIndex.values()].filter(v=>v>1).length,
          unmatched_row_examples:samples,school_scope_unverified:cc.unverifiable_school_scope||pc.unverifiable_school_scope});
      }
    }
    const required=[['students','cc'],['cc','sections'],['section_meeting','sections']];
    const recommendations=[];
    if(!verified.size)recommendations.push('Map Students.ID (internal PowerSchool ID) and Students.Student_Number (OSIS). CC.StudentID links to Students.ID; do not use CC.ID or CC.SectionID as a student ID.');
    if(!(byRole.get('meeting_attendance')||[]).length)recommendations.push('For actual attendance corrections, add Attendance rows with StudentID, CCID, Calendar_DayID, PeriodID and Attendance_CodeID.');
    for(const row of joinRows.filter(r=>['missing_key','ambiguous'].includes(r.status)).slice(0,8))recommendations.push(`${row.relationship}: ${row.status}${row.missing?` (${row.missing})`:''}. Review field mapping or export schema.`);
    recommendations.push('Verified ID/section links establish structural identity, not enrollment on a historical date. Validate CC DateEnrolled/DateLeft and attendance on Calendar_Day before scoring.');
    recommendations.push('No rows are uploaded, corrected, or written to D1. Unmatched student records do not imply absence; PowerSchool default Present is not a physical scan.');
    return {version:'EAGLENEST_PS_RELATIONSHIP_INSPECTOR_BATCH6A1',read_only:true,local_browser_only:true,
      scope:{school_id:String(options.schoolId??'2'),year_id:String(options.yearId??''),membership_date:String(options.onDate??'')},
      files:inventory,id_bridge:{uniquely_mapped_students:verified.size,conflicts:conflictingOsis.size+conflictingPs.size,
        osis_conflicts:conflictingOsis.size,internal_id_conflicts:conflictingPs.size,source_files:sourceFiles},
      relationships:joinRows,summary:{relationships_matched:joinRows.filter(r=>r.status==='matched').length,
        relationships_partial:joinRows.filter(r=>r.status==='partial').length,relationships_blocked:joinRows.filter(r=>['missing_table','missing_key','ambiguous'].includes(r.status)).length},
      recommendations,
      /* not returned in JSON */
    };
  }
  function verifiedBridge(rawFiles,options={}){const files=rawFiles.map(configure),byOsis=new Map(),byId=new Map();
    for(const f of files.filter(f=>f.role==='students'))for(const {row} of scopeRows(f,options).rows){const osis=pick(f,row,'osis'),id=pick(f,row,'row_id');if(!osis||!id)continue;
      if(!byOsis.has(osis))byOsis.set(osis,new Set());byOsis.get(osis).add(id);
      if(!byId.has(id))byId.set(id,new Set());byId.get(id).add(osis);
    }
    const verified=new Map();for(const [osis,ids] of byOsis)if(ids.size===1){const id=[...ids][0];if(byId.get(id)?.size===1)verified.set(osis,id);}return verified;
  }
  return {analyze,configure,roleFor,headerIndex,pick,scopeRows,verifiedBridge,dateValue,ROLE_FIELDS,FIELD_LABELS};
});

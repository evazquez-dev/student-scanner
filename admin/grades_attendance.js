// EAGLENEST_GRADES_ATTENDANCE_HUB_V1
(() => {
  'use strict';
  const $=(id)=>document.getElementById(id);
  const state={tab:'overview',seq:0,studentOsis:'',studentTab:'grades',attendance:null,grades:null};

  const tabs=[...document.querySelectorAll('[data-ga-tab]')];
  const overviewPanel=$('overviewPanel'),dailyPanel=$('dailyAttendancePanel'),meetingPanel=$('meetingAttendancePanel');
  const gradesStatusWrap=$('gradesStatusWrap'),gradesResultsCard=$('gradesResultsCard');
  const teacherKpis=$('teacherKpis'),adminKpis=$('adminKpis'),windowControls=$('attendanceWindowControls');
  const preset=$('attendanceWindowPreset'),customWrap=$('attendanceCustomDates'),customStart=$('attendanceStart'),customEnd=$('attendanceEnd'),windowResolved=$('attendanceWindowResolved');

  function api(){return window.EagleNESTGradesPage||null;}
  function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
  function pct(v){return Number.isFinite(Number(v))?`${Number(v).toFixed(Number(v)%1?1:0)}%`:'—'}
  function niceDate(v){const s=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return s||'—';const d=new Date(`${s}T12:00:00`);return d.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}
  function qualityText(row){
    const q=row?.data_quality||{},parts=[];
    if(q.outside_coverage)parts.push('outside coverage');
    if((q.missing_daily_dates||[]).length)parts.push(`${q.missing_daily_dates.length} daily missing`);
    if((q.missing_meeting_dates||[]).length)parts.push(`${q.missing_meeting_dates.length} meeting missing`);
    if(Number(q.unknown_meeting_count||0))parts.push(`${q.unknown_meeting_count} unknown meetings`);
    return parts.length?parts.join(' · '):'Complete';
  }
  function gradeSignal(row){
    if(!row)return'<span class="muted">No grade rows</span>';
    if(Number(row.below_passing_count||0)>0)return`<span class="attentionTag">${Number(row.below_passing_count)} below ${esc(window.EagleNESTGradesPage?.passingScore?.()??70)}%</span>`;
    if(Number(row.missing_count||0)>0)return`<span class="missingTag">${Number(row.missing_count)} missing</span>`;
    return'<span class="okTag">On track</span>';
  }
  function dailySignal(row){
    if(!row)return'<span class="missingTag">No data</span>';
    const bits=[pct(row.daily?.percentage)];
    if(Number(row.daily?.absent_days||0))bits.push(`${Number(row.daily.absent_days)} absent`);
    if(Number(row.daily?.late_days||0))bits.push(`${Number(row.daily.late_days)} late`);
    return `<span class="${row.daily?.status==='NOT_MET'?'attentionTag':row.daily?.status==='PENDING_DATA'?'missingTag':'okTag'}">${esc(bits.join(' · '))}</span>`;
  }
  function meetingSignal(row){
    if(!row)return'<span class="missingTag">No data</span>';
    const bits=[`${pct(row.meeting?.percentage)} on time`];
    if(Number(row.meeting?.not_on_time_meetings||0))bits.push(`${Number(row.meeting.not_on_time_meetings)} not on time`);
    return `<span class="${row.meeting?.status==='NOT_MET'?'attentionTag':row.meeting?.status==='PENDING_DATA'?'missingTag':'okTag'}">${esc(bits.join(' · '))}</span>`;
  }

  function scopeParams(){
    const p=api()?.scopeParams?.();
    return p instanceof URLSearchParams?p:new URLSearchParams();
  }
  function attendanceParams(){
    const p=scopeParams();
    p.set('preset',preset?.value||'marking_period');
    if((preset?.value||'')==='custom'){
      if(customStart?.value)p.set('start',customStart.value);
      if(customEnd?.value)p.set('end',customEnd.value);
    }
    return p;
  }
  async function getJson(path,params){
    const u=new URL(path,document.querySelector('meta[name="api-base"]')?.content||location.origin);
    if(params)for(const [k,v] of params)u.searchParams.append(k,v);
    const r=await api().fetch(u);
    const j=await r.json().catch(()=>null);
    if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);
    return j;
  }
  function applyWindowMeta(data){
    const w=data?.window||{};
    if(windowResolved)windowResolved.textContent=w?.start&&w?.end
      ? `${w.label||'Attendance window'} · ${niceDate(w.start)} – ${niceDate(w.end)}${w.fallback?' · fallback range':''}`
      : 'Attendance window unavailable';
  }

  function applyVisibility(){
    const grades=state.tab==='grades';
    const admin=api()?.isAdminMode?.()===true;
    if(teacherKpis)teacherKpis.hidden=!grades||admin;
    if(adminKpis)adminKpis.hidden=!grades||!admin;
    if(gradesResultsCard)gradesResultsCard.hidden=!grades;
    if(gradesStatusWrap)gradesStatusWrap.hidden=!grades;
    if(windowControls)windowControls.hidden=grades;
    if(overviewPanel)overviewPanel.hidden=state.tab!=='overview';
    if(dailyPanel)dailyPanel.hidden=state.tab!=='daily';
    if(meetingPanel)meetingPanel.hidden=state.tab!=='meeting';
    tabs.forEach(btn=>{
      const active=btn.dataset.gaTab===state.tab;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',active?'true':'false');
    });
  }
  function setTab(tab){
    if(!['overview','grades','daily','meeting'].includes(tab))return;
    state.tab=tab;
    applyVisibility();
    if(tab!=='grades')reload();
  }

  function renderOverview(att,grades){
    applyWindowMeta(att);
    const gradeBy=new Map((grades?.rows||[]).map(r=>[String(r.osis),r]));
    const attBy=new Map((att?.rows||[]).map(r=>[String(r.osis),r]));
    const osis=[...new Set([...gradeBy.keys(),...attBy.keys()])];
    const rows=osis.map(id=>({grade:gradeBy.get(id),att:attBy.get(id)})).sort((a,b)=>{
      const ga=String(a.att?.grade_level||a.grade?.grade_level||''),gb=String(b.att?.grade_level||b.grade?.grade_level||'');
      return ga.localeCompare(gb,undefined,{numeric:true})||String(a.att?.name||a.grade?.name||'').localeCompare(String(b.att?.name||b.grade?.name||''),undefined,{sensitivity:'base'});
    });
    $('overviewKpiStudents').textContent=String(rows.length);
    $('overviewKpiGrades').textContent=String((grades?.rows||[]).filter(r=>Number(r.below_passing_count||0)>0||Number(r.missing_count||0)>0).length);
    $('overviewKpiDaily').textContent=String(att?.summary?.daily_below_target_students||0);
    $('overviewKpiMeeting').textContent=String(att?.summary?.meeting_below_target_students||0);
    $('overviewMeta').textContent=`${rows.length} student(s) · Daily target ${Number(att?.settings?.daily_threshold_pct??90)}% · Meeting on-time target ${Number(att?.settings?.class_threshold_pct??90)}%`;
    if(!rows.length){$('overviewResults').innerHTML='<div class="empty">No students match this scope and filter.</div>';return;}
    $('overviewResults').innerHTML=`<table><thead><tr><th>Student</th><th>Grade</th><th>Grades</th><th>Daily Attendance</th><th>Meeting Attendance</th><th>Data</th></tr></thead><tbody>${rows.map(({grade,att})=>{
      const row=att||grade||{},name=att?.name||grade?.name||row.osis,level=att?.grade_level||grade?.grade_level||'—';
      return `<tr><td><button class="studentBtn gaStudent" data-osis="${esc(row.osis)}" data-student-tab="grades" type="button">${esc(name)}</button><div class="muted small mono">${esc(row.osis)}</div></td><td>${esc(level)}</td><td>${gradeSignal(grade)}</td><td>${dailySignal(att)}</td><td>${meetingSignal(att)}</td><td><span class="small muted">${esc(att?qualityText(att):'No attendance data')}</span></td></tr>`;
    }).join('')}</tbody></table>`;
    wireStudentButtons($('overviewResults'));
  }

  function renderDaily(data){
    state.attendance=data;applyWindowMeta(data);
    const s=data?.summary||{};
    $('dailyKpiStudents').textContent=String(s.students||0);
    $('dailyKpiAttendance').textContent=pct(s.daily_percentage);
    $('dailyKpiOnTime').textContent=pct(s.daily_on_time_percentage);
    $('dailyKpiAbsent').textContent=String(s.daily_absent_days||0);
    $('dailyKpiLate').textContent=String(s.daily_late_days||0);
    $('dailyMeta').textContent=`${Number(s.students||0)} student(s) · Official PowerSchool daily attendance · target ${Number(data?.settings?.daily_threshold_pct??90)}%`;
    const rows=data?.rows||[];
    if(!rows.length){$('dailyResults').innerHTML='<div class="empty">No students match this scope and filter.</div>';return;}
    $('dailyResults').innerHTML=`<table><thead><tr><th>Student</th><th>Grade</th><th>Attendance</th><th>On-time arrival</th><th>Present</th><th>Absent</th><th>Late</th><th>Known days</th><th>Data</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="studentBtn gaStudent" data-osis="${esc(r.osis)}" data-student-tab="daily" type="button">${esc(r.name||r.osis)}</button><div class="muted small mono">${esc(r.osis)}</div></td><td>${esc(r.grade_level||'—')}</td><td>${dailySignal(r)}</td><td>${pct(r.daily?.on_time_percentage)}</td><td>${Number(r.daily?.attended_days||0)}</td><td>${Number(r.daily?.absent_days||0)}</td><td>${Number(r.daily?.late_days||0)}</td><td>${Number(r.daily?.denominator_days||0)}</td><td><span class="small muted">${esc(qualityText(r))}</span></td></tr>`).join('')}</tbody></table>`;
    wireStudentButtons($('dailyResults'));
  }

  function renderMeeting(data){
    state.attendance=data;applyWindowMeta(data);
    const s=data?.summary||{};
    $('meetingKpiStudents').textContent=String(s.students||0);
    $('meetingKpiOnTimePct').textContent=pct(s.meeting_percentage);
    $('meetingKpiOnTime').textContent=String(s.meeting_on_time||0);
    $('meetingKpiNotOnTime').textContent=String(s.meeting_not_on_time||0);
    $('meetingMeta').textContent=`${Number(s.students||0)} student(s) · Full-day absences are excluded from the class on-time denominator · target ${Number(data?.settings?.class_threshold_pct??90)}%`;
    const rows=data?.rows||[];
    if(!rows.length){$('meetingResults').innerHTML='<div class="empty">No students match this scope and filter.</div>';return;}
    $('meetingResults').innerHTML=`<table><thead><tr><th>Student</th><th>Grade</th><th>On-time %</th><th>On time</th><th>Not on time</th><th>Known meetings</th><th>Excluded for full-day absence</th><th>Data</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="studentBtn gaStudent" data-osis="${esc(r.osis)}" data-student-tab="meeting" type="button">${esc(r.name||r.osis)}</button><div class="muted small mono">${esc(r.osis)}</div></td><td>${esc(r.grade_level||'—')}</td><td>${meetingSignal(r)}</td><td>${Number(r.meeting?.on_time_meetings||0)}</td><td>${Number(r.meeting?.not_on_time_meetings||0)}</td><td>${Number(r.meeting?.denominator_meetings||0)}</td><td>${Number(r.meeting?.excluded_full_day_absence_meetings||0)}</td><td><span class="small muted">${esc(qualityText(r))}</span></td></tr>`).join('')}</tbody></table>`;
    wireStudentButtons($('meetingResults'));
  }

  function wireStudentButtons(root){
    root?.querySelectorAll('.gaStudent').forEach(btn=>btn.addEventListener('click',()=>{
      const osis=btn.dataset.osis,tab=btn.dataset.studentTab||'grades';
      api()?.openStudent?.(osis);
      setStudentTab(tab);
    }));
  }

  async function reload(){
    if(!api()?.ready?.())return;
    const seq=++state.seq;
    const p=attendanceParams();
    try{
      if(state.tab==='overview'){
        $('overviewResults').innerHTML='<div class="empty">Loading grades and attendance…</div>';
        const gp=scopeParams();gp.set('status','all');
        const [att,grades]=await Promise.all([
          getJson('/admin/grades/attendance/students',p),
          getJson('/admin/grades/students',gp)
        ]);
        if(seq!==state.seq)return;
        state.attendance=att;state.grades=grades;renderOverview(att,grades);
      }else if(state.tab==='daily'){
        $('dailyResults').innerHTML='<div class="empty">Loading daily attendance…</div>';
        const att=await getJson('/admin/grades/attendance/students',p);if(seq!==state.seq)return;renderDaily(att);
      }else if(state.tab==='meeting'){
        $('meetingResults').innerHTML='<div class="empty">Loading meeting attendance…</div>';
        const att=await getJson('/admin/grades/attendance/students',p);if(seq!==state.seq)return;renderMeeting(att);
      }
    }catch(e){
      if(seq!==state.seq)return;
      const target=state.tab==='overview'?$('overviewResults'):state.tab==='daily'?$('dailyResults'):$('meetingResults');
      if(target)target.innerHTML=`<div class="empty">${esc(e?.message||e)}</div>`;
    }
  }

  function studentStatusLabel(row){
    const state=String(row?.state||'').replaceAll('_',' ');
    return state?state.replace(/\b\w/g,c=>c.toUpperCase()):'—';
  }
  function meetingPeriodHtml(period){
    const status=String(period?.status||'unknown').toLowerCase();
    const cls=['present'].includes(status)?'pass':['late','absent'].includes(status)?'fail':['excused','excused_late','iss','oss'].includes(status)?'neutral':'missing';
    return `<span class="meetingPeriodChip ${cls}">P${esc(period?.period_local||'—')} · ${esc(String(status).replaceAll('_',' '))}</span>`;
  }
  function renderStudentDaily(data){
    const ev=data?.attendance?.daily_attendance_requirement||{},rows=data?.daily_rows||[];
    $('studentDailySummary').innerHTML=`<div class="detailKpis"><span class="pill">${pct(ev.percentage)} attendance</span><span class="pill">${Number(ev.attended_days||0)} present</span><span class="pill">${Number(ev.absent_days||0)} absent</span><span class="pill">${Number(ev.late_days||0)} late</span></div>`;
    $('studentDailyRows').innerHTML=rows.length?`<table><thead><tr><th>Date</th><th>Daily status</th><th>Source</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(niceDate(r.school_date))}</td><td><span class="attendanceState ${esc(r.classification)}">${esc(r.classification)}</span></td><td class="small muted">${esc(r.source||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No daily attendance rows in this window.</div>';
  }
  function renderStudentMeeting(data){
    const ev=data?.attendance?.on_time_class_requirement||{},rows=data?.meeting_rows||[];
    $('studentMeetingSummary').innerHTML=`<div class="detailKpis"><span class="pill">${pct(ev.percentage)} on time</span><span class="pill">${Number(ev.on_time_meetings||0)} on time</span><span class="pill">${Number(ev.not_on_time_meetings||0)} not on time</span><span class="pill">${Number(ev.excluded_full_day_absence_meetings||0)} excluded for full-day absence</span></div>`;
    $('studentMeetingRows').innerHTML=rows.length?`<div class="meetingDayList">${rows.map(r=>`<details class="historySnapshot"><summary>${esc(niceDate(r.school_date))} · ${esc(studentStatusLabel(r))}${r.expected_count?` · ${Number(r.on_time_count||0)}/${Number(r.expected_count||0)} on time`:''}${r.official_correction_count?` · ${Number(r.official_correction_count)} official correction(s)`:''}</summary><div class="meetingPeriodChips">${(r.periods||[]).map(meetingPeriodHtml).join('')||'<span class="muted small">No period detail for this date.</span>'}</div></details>`).join('')}</div>`:'<div class="empty">No meeting attendance rows in this window.</div>';
  }
  async function loadStudent(osis){
    state.studentOsis=String(osis||'');
    if(!state.studentOsis)return;
    $('studentDailyRows').innerHTML='<div class="empty">Loading daily attendance…</div>';
    $('studentMeetingRows').innerHTML='<div class="empty">Loading meeting attendance…</div>';
    const p=new URLSearchParams();p.set('osis',state.studentOsis);p.set('preset',preset?.value||'marking_period');
    if((preset?.value||'')==='custom'){if(customStart?.value)p.set('start',customStart.value);if(customEnd?.value)p.set('end',customEnd.value);}
    try{
      const data=await getJson('/admin/grades/attendance/student',p);
      $('studentAttendanceWindow').textContent=`Attendance window: ${data.window?.label||''} · ${niceDate(data.window?.start)} – ${niceDate(data.window?.end)}`;
      renderStudentDaily(data);renderStudentMeeting(data);
    }catch(e){
      $('studentDailyRows').innerHTML=`<div class="empty">${esc(e?.message||e)}</div>`;
      $('studentMeetingRows').innerHTML=`<div class="empty">${esc(e?.message||e)}</div>`;
    }
  }
  function setStudentTab(tab){
    if(!['grades','daily','meeting'].includes(tab))tab='grades';
    state.studentTab=tab;
    document.querySelectorAll('[data-student-tab-button]').forEach(btn=>{
      const active=btn.dataset.studentTabButton===tab;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',active?'true':'false');
    });
    $('studentGradesPane').hidden=tab!=='grades';
    $('studentDailyPane').hidden=tab!=='daily';
    $('studentMeetingPane').hidden=tab!=='meeting';
  }

  function boot(){
    tabs.forEach(btn=>btn.addEventListener('click',()=>setTab(btn.dataset.gaTab)));
    preset?.addEventListener('change',()=>{
      customWrap.hidden=preset.value!=='custom';
      if(preset.value!=='custom'||(customStart.value&&customEnd.value))reload();
    });
    customStart?.addEventListener('change',()=>{if(customStart.value&&customEnd.value)reload()});
    customEnd?.addEventListener('change',()=>{if(customStart.value&&customEnd.value)reload()});
    document.querySelectorAll('[data-student-tab-button]').forEach(btn=>btn.addEventListener('click',()=>setStudentTab(btn.dataset.studentTabButton)));
    $('searchInput')?.addEventListener('input',()=>{clearTimeout(boot.searchTimer);boot.searchTimer=setTimeout(()=>{if(state.tab!=='grades')reload()},220)});
    $('gradeFilter')?.addEventListener('change',()=>{if(state.tab!=='grades')reload()});
    window.addEventListener('eaglenest-grades-scope-change',()=>{applyVisibility();if(state.tab!=='grades')reload()});
    customWrap.hidden=(preset?.value||'marking_period')!=='custom';
    setStudentTab('grades');setTab('overview');
  }
  window.EagleNESTGradesAttendance={loadStudent,setStudentTab,reload,setTab};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

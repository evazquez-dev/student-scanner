/* EAGLENEST_MTSS_ACADEMIC_V1 - grades warning queue and measurable skill goals */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const core = () => window.EagleNESTMTSS;
  const state = {alerts:[],last:null,loading:false,settingsLoaded:false};
  const fmt = v => v == null || v === '' ? '—' : String(v);
  // 0 in a course grade is an unentered grade, not a failing score. Skill probes may be 0.
  const fmtCourseGrade = grade => {
    const raw=String(grade?.grade_value ?? '').trim();
    const n=grade?.grade_numeric == null || String(grade.grade_numeric).trim()===''?null:Number(grade.grade_numeric);
    const displayN=raw?Number(raw.replace(/%$/, '').trim()):null;
    return n===0 || (raw!=='' && Number.isFinite(displayN) && displayN===0) || (n===null && !raw) ? 'Not entered' : fmt(raw || grade?.grade_numeric);
  };
  const dateNY = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const api = (path,init={}) => core().api(path,init);
  const send = (path,body) => api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

  async function loadQueue(){
    if(!core() || state.loading)return;
    state.loading=true;
    try{
      const q=$('academicSearch').value.trim(), grade=$('academicGrade').value;
      const url='/admin/mtss/academic/alerts?'+new URLSearchParams({q,grade});
      const r=await api(url);
      $('academicEarlyWarning').hidden=false;
      state.last=r;state.alerts=r.rows||[];
      renderQueue(r);
    }catch(e){
      if(e.status===403){$('academicEarlyWarning').hidden=true;}else{
        $('academicEarlyWarning').hidden=false;$('academicWarningStatus').textContent='Academic queue unavailable: '+e.message;
      }
    }finally{state.loading=false;}
  }
  async function loadSettings(){
    if(!core()?.canManageAll() || state.settingsLoaded)return;
    state.settingsLoaded=true;
    try{
      const r=await api('/admin/mtss/academic/settings');
      $('academicDeclinePoints').value=r.settings?.decline_points ?? 10;
      $('academicMultipleCourses').value=r.settings?.multiple_failing_courses ?? 3;
      $('academicSettingsForm').hidden=!core()?.canEditRules() || core()?.isReadOnly();
    }catch(e){state.settingsLoaded=false;}
  }
  function renderQueue(r){
    const source=r.source||{},summary=r.summary||{};
    $('academicWarningStatus').textContent=r.configured
      ? `PowerSchool grade snapshot ${source.snapshot_date} · ${source.marking_period} · Previous date ${source.previous_snapshot_date||'none'} · Passing ${r.thresholds.passing_score} · Decline alert ${r.thresholds.decline_points}+ points. Recommendations are for staff review; no cases or tiers are changed automatically.`
      : `No current-school-year grade data available (${r.reason||'not configured'}). Sync the HS Grade Data Hub first.`;
    $('academicWarningCount').textContent=`${summary.students_flagged||0} flagged · ${summary.students_without_case||0} not in an active academic case`;
    $('academicWarningsBody').innerHTML=state.alerts.length?state.alerts.map((r,i)=>{
      const issue=[...r.failing_courses.map(c=>`${c.course_name}: ${c.grade}`),...r.declining_courses.map(c=>`${c.course_name}: ${c.previous_grade} → ${c.grade}`)].join(' · ');
      const button=r.case?`<button class="btn academicOpen" data-alert="${i}">View academic case</button>`
        : core()?.canManageAll()&&!core()?.isReadOnly()?`<button class="btn academicApprove" data-alert="${i}">Review / open case</button>`:'<span class="small muted">Leadership review</span>';
      return `<tr><td><strong>${esc(r.name)}</strong><div class="small muted">${esc(r.osis)} · Grade ${esc(r.grade_level)}</div></td>
        <td>${r.failing_courses.length}</td><td>${r.declining_courses.length}</td><td>${esc(issue)}</td>
        <td>${r.case?`Tier ${esc(r.case.tier)} · ${esc(r.case.status)}`:r.multiple_course_review?'Multiple-course review':'Pending review'}</td><td>${button}</td></tr>`;
    }).join(''):'<tr><td colspan="6" class="empty">No students match the current warning criteria.</td></tr>';
  }

  function makePlot(goal){
    const series=[{date:goal.baseline_date,value:Number(goal.baseline_value)},...(goal.measurements||[]).map(m=>({date:m.measure_date,value:Number(m.value)}))];
    if(series.length<2)return '<div class="small muted">Add a measurement to display progress.</div>';
    const vals=[...series.map(m=>m.value),Number(goal.target_value)];
    const min=Math.min(...vals),max=Math.max(...vals),span=Math.max(1,max-min);const w=340,h=95;
    const pts=series.map((m,i)=>`${10+i*320/Math.max(1,series.length-1)},${h-10-(m.value-min)/span*(h-20)}`).join(' ');
    const ty=h-10-(Number(goal.target_value)-min)/span*(h-20);
    return `<svg class="academicPlot" viewBox="0 0 ${w} ${h}" role="img" aria-label="Progress from ${esc(goal.baseline_value)} toward ${esc(goal.target_value)} ${esc(goal.measure_unit)}">
      <line x1="10" y1="${ty}" x2="330" y2="${ty}" stroke="currentColor" opacity=".5" stroke-dasharray="4 4"/>
      <polyline fill="none" stroke="var(--accent)" stroke-width="3" points="${pts}"/>
      ${pts.split(' ').map(pair=>{const [x,y]=pair.split(',');return `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--accent)"/>`;}).join('')}
    </svg>`;
  }
  function renderCase(data){
    const section=$('academicCaseSection');
    if(!section)return;
    section.hidden=data?.case?.domain!=='academic';
    if(section.hidden)return;
    const c=data.case, academic=data.academic||{}, doc=academic.grades?.current;
    $('academicGradeSnapshot').innerHTML=doc?`<strong>PowerSchool grades · ${esc(doc.snapshot_date)} · ${esc(doc.marking_period)}</strong><div class="academicGradeChips">${(doc.courses||[]).map(x=>`<span>${esc(x.course_name||x.course_code)}: <strong>${esc(fmtCourseGrade(x))}</strong></span>`).join('')}</div>`
      :'<div class="muted">No current grade snapshot for this student.</div>';
    $('academicGradeHistoryRows').innerHTML=(academic.grades?.history||[]).slice(0,6).map(s=>`<span>${esc(s.snapshot_date)} · ${esc(s.marking_period)}: ${(s.courses||[]).map(x=>`${esc(x.course_code)} ${esc(fmtCourseGrade(x))}`).join(' · ')}</span>`).join('')||'<span>No prior snapshots available.</span>';
    const writable=!core().isReadOnly()&&c.is_active;
    $('academicGoalForm').hidden=!writable;
    $('academicGoalBaselineDate').value=dateNY();
    $('academicGoalTargetDate').value='';
    const goals=academic.goals||[];
    $('academicGoalCount').textContent=`${goals.length} goal${goals.length===1?'':'s'}`;
    $('academicGoals').innerHTML=goals.length?goals.map(g=>{
      const points=[{measure_date:g.baseline_date,value:g.baseline_value,notes:'Baseline'},...(g.measurements||[])];
      return `<article class="academicGoal" data-goal-id="${esc(g.goal_id)}">
       <div class="sectionHead"><div><strong>${esc(g.content_area)} · ${esc(g.skill)}</strong><div class="small muted">${esc(g.measure_name)} · ${esc(g.frequency||'Frequency not set')} · ${esc(g.provider_email||'Unassigned')}</div></div><span class="pill ${g.target_met?'good':'info'}">${g.target_met?'Target reached':'Monitoring'}</span></div>
       <div class="academicGoalTarget">Baseline ${esc(g.baseline_value)}${esc(g.measure_unit)} → Target ${esc(g.target_value)}${esc(g.measure_unit)} by ${esc(g.target_date)} · Latest ${esc(g.latest_value)}${esc(g.measure_unit)}</div>
       ${makePlot(g)}<div class="academicMeasureList">${points.map(m=>`<span>${esc(m.measure_date)}: <strong>${esc(m.value)}${esc(g.measure_unit)}</strong></span>`).join('')}</div>
       ${writable&&g.status==='active'?`<form class="academicMeasureForm"><label>Assessment date <input type="date" name="measure_date" required value="${dateNY()}" min="${esc(g.baseline_date)}"></label><label>Result (${esc(g.measure_unit)}) <input type="number" name="value" step="any" required></label><label>Notes <input name="notes" maxlength="1000" placeholder="Assessment / evidence"></label><button class="btn primary" type="submit">Record result</button></form>`:''}
       </article>`;
    }).join(''):'<div class="small muted">No academic skill goals yet. Create one below; existing intervention assignments stay on this same MTSS case.</div>';
  }

  function bind(){
    let timer;
    for(const id of ['academicSearch','academicGrade'])$(id).addEventListener(id==='academicSearch'?'input':'change',()=>{clearTimeout(timer);timer=setTimeout(loadQueue,250);});
    $('academicWarningsBody').addEventListener('click',e=>{
      const b=e.target.closest('[data-alert]'); if(!b)return;
      const r=state.alerts[Number(b.dataset.alert)];if(!r)return;
      if(r.case){core().openCase(r.case.case_id);return;}
      if(!core().canManageAll()||core().isReadOnly())return;
      core().openNewCase();$('newOsis').value=r.osis;$('newDomain').value='academic';$('newTier').value='2';
      $('newReason').value=`PowerSchool academic warning (${state.last?.source?.snapshot_date||'snapshot'}): ${r.reason}. Review intervention needs and tier with the academic team.`;
    });
    $('academicGoalForm').addEventListener('submit',async e=>{
      e.preventDefault();const c=core().currentCase();if(c?.case?.domain!=='academic')return;
      const f=new FormData(e.currentTarget),body=Object.fromEntries(f.entries());body.case_id=c.case.case_id;
      $('academicGoalStatus').textContent='Saving goal…';
      try{await send('/admin/mtss/academic/goal',body);e.currentTarget.reset();$('academicGoalStatus').textContent='Goal saved.';await core().openCase(body.case_id);}
      catch(error){$('academicGoalStatus').textContent='Could not save goal: '+error.message;}
    });
    $('academicSettingsForm').addEventListener('submit',async e=>{
      e.preventDefault();if(!core()?.canEditRules()||core()?.isReadOnly())return;
      $('academicSettingsStatus').textContent='Saving…';
      try{
        await send('/admin/mtss/academic/settings',{decline_points:Number($('academicDeclinePoints').value),multiple_failing_courses:Number($('academicMultipleCourses').value)});
        $('academicSettingsStatus').textContent='Saved.';await loadQueue();
      }catch(error){$('academicSettingsStatus').textContent='Save failed: '+error.message;}
    });
    $('academicGoals').addEventListener('submit',async e=>{
      const form=e.target.closest('.academicMeasureForm');if(!form)return;e.preventDefault();
      const c=core().currentCase();if(c?.case?.domain!=='academic')return;
      const goal=form.closest('[data-goal-id]');const body={...Object.fromEntries(new FormData(form).entries()),goal_id:goal.dataset.goalId};
      $('academicGoalStatus').textContent='Recording result…';
      try{await send('/admin/mtss/academic/measure',body);$('academicGoalStatus').textContent='Result recorded.';await core().openCase(c.case.case_id);}
      catch(error){$('academicGoalStatus').textContent='Could not record result: '+error.message;}
    });
    document.addEventListener('eaglenest:mtss:dashboard-loaded',()=>{if(state.last)renderQueue(state.last);else loadQueue();loadSettings();});
    loadQueue();
  }
  window.EagleNESTMTSSAcademic={renderCase,loadQueue};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();

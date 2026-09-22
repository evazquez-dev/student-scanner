/* EAGLENEST_RECESS_OUTIN_V1: shared V3 layout, separate backend and scanner state. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const API=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const CLIENT=document.querySelector('meta[name="google-client-id"]')?.content||'';
const KEYS=['recess_admin_session_v1','ss_admin_session_sid_v1','admin_session_v1','admin_session_sid'];
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let access=null, rows=[], studentOsis='',busy=false, page=1, totalPages=1, searchTimer=null;
function session(){try{for(const k of KEYS){const x=sessionStorage.getItem(k)||localStorage.getItem(k);if(x)return x;}}catch{}return '';}
function stash(s){if(!s)return;for(const k of KEYS){try{sessionStorage.setItem(k,s);localStorage.setItem(k,s);}catch{}}}
async function req(path,init={}){let head=new Headers(init.headers||{});const sid=session();if(sid)head.set('x-admin-session',sid);
 const resp=await fetch(new URL(path,API),{credentials:'include',cache:'no-store',...init,headers:head});stash(resp.headers.get('x-admin-session')||'');
 const data=await resp.json().catch(()=>({}));if(!resp.ok||!data.ok)throw Error(data.error||`HTTP ${resp.status}`);return data;}
const pct=v=>v==null?'—':`${Number(v).toFixed(1)}%`;
function flag(b,label='Eligible'){return `<span class="pill ${b?'good':'bad'}">${escape(b?label:'Not eligible')}</span>`;}
function table(headers,lines){return `<div class="scroll"><table><thead><tr>${headers.map(x=>`<th>${escape(x)}</th>`).join('')}</tr></thead><tbody>${lines.length?lines.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">No records</td></tr>`}</tbody></table></div>`;}
function showError(v){$('error').textContent=String(v||'');}
async function drawBoard(){if(!access?.can?.admin)return;
 const q=encodeURIComponent($('search').value.trim());
 const r=await req(`/admin/recess/dashboard?page=${page}&page_size=25&q=${q}`);
 rows=r.students||[];page=r.pagination?.page||1;totalPages=r.pagination?.total_pages||1;
 $('counts').innerHTML=`${badge('good',Number(r.counts.eligible||0)+' eligible on page')}${badge('bad',Number(r.counts.ineligible||0)+' not eligible on page')}${badge('info',Number(r.counts.total||0)+' students in results')}`;
 $('pageCount').textContent=`Page ${page} of ${totalPages}`;
 $('prevPage').disabled=page<=1;$('nextPage').disabled=page>=totalPages;
 filterBoard();}
/* EAGLENEST_OUTSIDE_LUNCH_STATUS_UI_V3: presentation only, no policy overrides. */
function badge(kind,label){
  const allowed=['good','bad','warn','info','neutral'];
  const status=allowed.includes(kind)?kind:'neutral';
  return `<span class="ol-status ol-status--${status}">${escape(label)}</span>`;
}
function statusCard(label,value,kind,detail){
  const allowed=['good','bad','warn','info'];
  const tone=allowed.includes(kind)?kind:'info';
  return `<div class="ol-stat ol-stat--${tone}"><div class="ol-stat-label">${escape(label)}</div><div class="ol-stat-value">${escape(value)}</div><div class="ol-stat-meta">${escape(detail||'')}</div></div>`;
}
function checksFor(r){
  const a=r.attendance||{},g=r.academics||{};
  const windowReady=a.complete_window===true && !a.missing_daily && Number(a.school_denominator)===10;
  const classReady=windowReady && !a.missing_classes && Number(a.class_total)>0;
  const schoolTone=!windowReady?'warn':Number(a.school_present)>=9?'good':'bad';
  const arrivalTone=a.today_arrival?.status==='pending'?'warn':a.today_arrival?.met?'good':'bad';
  const classTone=!classReady?'warn':Number(a.class_ontime)*100>=90*Number(a.class_total)?'good':'bad';
  const gradeTone=!g.ready?'warn':Number(g.failing_course_count)===0?'good':'bad';
  return {windowReady,classReady,schoolTone,arrivalTone,classTone,gradeTone};
}
function reasonHtml(r){
  const reasons=Array.isArray(r.reasons)?r.reasons:[];
  const title=r.eligible?'Eligible for outside lunch':'Not eligible for outside lunch';
  const body=reasons.length?`<ul class="ol-reasons">${reasons.map(s=>`<li>${escape(s)}</li>`).join('')}</ul>`:
    (r.admin_pass?'<div>Authorized by an administrative pass. Automatic checks remain visible below.</div>':
    r.eligible?'<div>All required eligibility checks are satisfied.</div>':'<div>Eligibility requirements are not met.</div>');
  const override=r.admin_pass?`<div class="ol-override">${badge('info','Administrative pass active')}<span>Automatic attendance and grade checks remain visible. A pass never waives restrictions or a recess-return penalty.</span></div>`:'';
  return `<div class="ol-outcome ol-outcome--${r.eligible?'good':'bad'}" role="status"><div class="ol-outcome-title">${escape(title)}</div><div class="ol-outcome-body">${body}${override}</div></div>`;
}
function filterBoard(){
  const q=$('search').value.trim().toLowerCase();
  const list=rows; // Server-side pagination and search already applied.
  $('board').innerHTML=table(['Student','Permission','School / arrival','Classes','Grades','Penalty','Eligibility'],list.map(r=>{
    const a=r.attendance||{},g=r.academics||{},c=checksFor(r);
    const schoolText=`${a.school_present??'—'}/${a.school_denominator??'—'} days`;
    const arrivalText=a.today_arrival?.met?'On time today':a.today_arrival?.status==='late'?'Late today':a.today_arrival?.status==='absent'?'Absent today':'Arrival pending';
    const classText=`${a.class_ontime??'—'}/${a.class_total??'—'} meetings`;
    const gradesText=!g.ready?'Grade data pending':Number(g.failing_course_count)===0?'All classes passing':`${g.failing_course_count} below passing`;
    return [
      `<button class="btn ol-student-button" data-student="${escape(r.osis)}">${escape(r.name)}</button><div class="ol-detail">${escape(r.osis)} · Grade ${escape(r.grade)}</div>${r.currently_out?badge('info','Currently OUT'):''}`,
      `<div class="ol-cell">${badge('info','No permission slip required')}</div>`,
      `<div class="ol-cell">${badge(c.schoolTone,c.windowReady?schoolText:'Attendance incomplete')}${badge(c.arrivalTone,arrivalText)}<span class="ol-detail">${escape(schoolText)} · ${escape(arrivalText)}</span></div>`,
      `<div class="ol-cell">${badge(c.classTone,c.classReady?classText:'Class data incomplete')}<span class="ol-detail">${escape(classText)} · ${pct(a.class_pct)} on time</span></div>`,
      `<div class="ol-cell">${badge(c.gradeTone,gradesText)}<span class="ol-detail">${escape(g.marking_period||'Current marking period')}</span></div>`,
      `<div class="ol-cell">${badge(r.penalty_pending?'bad':'good',r.penalty_pending?'Recess penalty pending':'No penalty')}</div>`,
      `<div class="ol-cell">${badge(r.eligible?'good':'bad',r.eligible?'Eligible':'Not eligible')}${r.admin_pass?badge('info','Admin pass'):''}<span class="ol-detail">${escape(r.reason||'All checks met')}</span></div>`
    ];
  }));
}
function showStudent(r){
  if(!r?.ok)return;
  const a=r.attendance||{},g=r.academics||{},pen=r.penalty||{},c=checksFor(r);
  const readySchool=c.windowReady;
  const schoolValue=`${a.school_present??'—'}/${a.school_denominator??'—'} · ${pct(a.school_pct)}`;
  const arrivalValue=a.today_arrival?.met?'On time today':a.today_arrival?.status==='late'?'Late today':a.today_arrival?.status==='absent'?'Absent today':'Not verified';
  const arrivalAt=a.today_arrival?.at?new Date(a.today_arrival.at).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}):'No timed morning scan';
  const arrivalDetail=`Today ${a.today_arrival?.date||r.date||'—'} · ${arrivalAt} · School starts ${a.today_arrival?.cutoff||'—'} (NY time)`;
  const classValue=`${a.class_ontime??'—'}/${a.class_total??'—'} · ${pct(a.class_pct)}`;
  const gradeValue=!g.ready?'Data pending':Number(g.failing_course_count)===0?'All classes passing':`${g.failing_course_count} below passing`;
  const daily=(a.days||[]).map(x=>{
    const missing=x.daily_status==='missing';
    const classStatus=x.class_status||'';
    const classKind=classStatus==='evaluated'?'good':classStatus==='excluded_full_day_absence'||classStatus==='no_instructional_periods'?'info':'warn';
    const periods=(x.periods||[]).map(p=>{
      const s=String(p.status||'unknown').toLowerCase();
      // EAGLENEST_OUTSIDE_LUNCH_CLASS_ABSENCE_EXCLUSION_V1: report absence as excluded, not a failed meeting.
      const excluded=s==='absent'||s==='excused';
      const kind=excluded?'info':s==='present'?'good':s==='unknown'?'warn':'bad';
      const label=excluded?`${s.replaceAll('_',' ')} · excluded`:s.replaceAll('_',' ');
      return `<span class="ol-period"><span class="ol-detail">${escape(p.period_local||p.period_id||'Period')}</span>${badge(kind,label)}</span>`;
    }).join('')||'—';
    const dailyKind=missing?'warn':x.excused_absence?'info':x.daily_status==='present'?'good':x.daily_status==='late'?'warn':'bad';
    return [escape(x.date),badge(dailyKind,x.excused_absence?'Excused absence':missing?'Missing data':x.daily_status||'Unknown'),
      escape(x.detail_code),badge(missing?'warn':x.counted_present?'good':'bad',missing?'Pending':x.counted_present?'Counts as present':'Does not count'),
      badge(missing?'warn':x.on_time_arrival?'good':'bad',missing?'Pending':x.on_time_arrival?'On time':'Not on time'),
      badge(classKind,classStatus.replaceAll('_',' ')||'Not available'),periods];
  });
  const courses=(g.courses||[]).map(x=>{
    const result=x.status==='passing'?'good':x.status==='failing'?'bad':'warn';
    return [escape(x.course_code),escape(x.course_name),
      x.grade==null?badge('warn','Not entered'):`<strong>${escape(x.grade)}</strong>`,
      badge(result,x.status==='passing'?'Passing':x.status==='failing'?'Below passing':'Not entered')];
  });
  const actions=(r.admin_actions||[]).map(x=>[
    badge(x.action_type==='pass'?'info':'bad',x.action_type),escape(x.reason),escape(x.begins_on),escape(x.expires_on),
    x.revoked_at_iso?badge('neutral','Retracted'):badge('info','Active / historical'),
    x.revoked_at_iso?'—':`<button class="btn" data-retract="${escape(x.id)}">Retract</button>`]);
  const history=(r.lunch_history||[]).map(x=>[
    escape(x.event_at_iso),escape(x.schedule_date),escape(x.location),
    badge(x.allowed===true||x.allowed===1||String(x.allowed).toLowerCase()==='true'?'good':x.allowed===false||x.allowed===0||String(x.allowed).toLowerCase()==='false'?'bad':'neutral',
      x.allowed===true||x.allowed===1||String(x.allowed).toLowerCase()==='true'?'Allowed':x.allowed===false||x.allowed===0||String(x.allowed).toLowerCase()==='false'?'Denied':x.allowed??'—'),
    escape(x.period_id),escape(x.device_id)]);
  $('student').innerHTML=`<div class="row" style="justify-content:space-between"><div><div class="ol-eyebrow">Live eligibility review</div><h2>${escape(r.name)} · ${escape(r.osis)}</h2></div>${badge(r.eligible?'good':'bad',r.eligible?'Eligible':'Not eligible')}</div>
  ${reasonHtml(r)}
  <div class="grid" style="margin:15px 0">
    ${statusCard('Permission slip','Not required','info','Adult-supervised recess — all grades')}
    ${statusCard('School attendance',schoolValue,c.schoolTone,readySchool?'At least 9 of the last 10 completed school days':'Waiting for a complete 10-day attendance window')}
    ${statusCard('On-time to school TODAY',arrivalValue,c.arrivalTone,arrivalDetail)}
    ${statusCard('On-time class meetings',classValue,c.classTone,c.classReady?'At least 90% on time; absent / excused meetings excluded':'Missing or incomplete class-meeting evidence')}
    ${statusCard('Current marking-period grades',gradeValue,c.gradeTone,g.ready?`${g.marking_period||'Marking period'} · Passing: ${g.passing_score??'configured'} · Updated ${g.snapshot_date||'—'}`:'Current grade snapshot not ready; zeros are not entered grades')}
    ${statusCard('Late-return penalty',pen.pending?'Recess penalty pending':'No penalty',pen.pending?'bad':'good',pen.pending?'Next otherwise-eligible outside-lunch attempt is blocked':pen.last_violation_date?`Last violation: ${pen.last_violation_date}`:'No active restriction from a late return')}
    ${r.admin_restriction?statusCard('Administrative restriction','Active','bad','Blocks outside lunch regardless of other results'):''}
  </div>
  <h3 class="ol-section-title">Daily and class-attendance evidence</h3>${table(['Day','Daily status','Code','Counts present','On time (history only)','Class data','Meeting details'],daily)}
  <h3 class="ol-section-title">Current marking-period courses</h3>${g.courses?table(['Course','Name','Grade','Result'],courses):'<div class="ol-detail">Course-level grades hidden by your permissions.</div>'}
  <h3 class="ol-section-title">Lunch history / penalty</h3>${table(['Time','Date','Action','Result','Period','Device'],history)}<div class="notice">Last late return: ${escape(pen.last_late_return_at||'—')} · Last violation: ${escape(pen.last_violation_type||'—')} · ${badge(pen.pending?'bad':'good',pen.pending?'Recess penalty pending':'No pending penalty')}</div>
  ${access?.can?.admin?`<h3 class="ol-section-title">Penalty retraction history</h3>${table(['Violation','Date','Reason','Retracted at','Staff'],(r.penalty_retractions||[]).map(x=>[escape(x.violation_type),escape(x.violation_date),escape(x.reason),escape(x.retracted_at_iso),escape(x.retracted_by_email)]))}
    <div class="stack" style="margin:14px 0"><button class="btn" data-add="pass">Issue administrative pass</button><button class="btn" data-add="restriction">Add restriction</button>${pen.pending?'<button class="btn" data-penalty="retract">Retract lunch penalty</button>':''}</div>
    <h3 class="ol-section-title">Administrative actions</h3>${table(['Type','Reason','From','Through','Status','Action'],actions)}`:''}`;
}
async function loadStudent(osis){const id=String(osis||'').replace(/\D/g,'');if(!id)return;studentOsis=id;$('osis').value=id;history.replaceState(null,'',`?osis=${encodeURIComponent(id)}`);
 $('student').textContent='Loading eligibility detail…';showStudent(await req(`/admin/recess/detail?osis=${encodeURIComponent(id)}`));}
async function mutate(path,body){if(busy)return;busy=true;showError('');try{await req(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});await loadStudent(studentOsis);if(access?.can?.admin)await drawBoard();}catch(e){showError(e.message);}finally{busy=false;}}
async function init(){try{access=await req('/admin/access');$('who').textContent=`${access.email||'Staff'} · ${access.role||''}`;$('login').hidden=true;$('app').hidden=false;
 $('adminBoard').hidden=!access?.can?.admin;const osis=new URL(location.href).searchParams.get('osis');
 if(osis)await loadStudent(osis);if(access?.can?.admin)await drawBoard();
 }catch(e){$('loginStatus').textContent=`Sign in required: ${e.message}`;}}
window.addEventListener('DOMContentLoaded',()=>{
 $('refresh').onclick=()=>{showError('');(async()=>{if(access?.can?.admin)await drawBoard();if(studentOsis)await loadStudent(studentOsis);})().catch(e=>showError(e.message));};
 $('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;drawBoard().catch(e=>showError(e.message));},280);};
 $('prevPage').onclick=()=>{if(page>1){page--;drawBoard().catch(e=>showError(e.message));}};
 $('nextPage').onclick=()=>{if(page<totalPages){page++;drawBoard().catch(e=>showError(e.message));}};$('open').onclick=()=>loadStudent($('osis').value).catch(e=>showError(e.message));
 document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-student],[data-add],[data-retract],[data-penalty]');if(!b)return;
 if(b.dataset.student){await loadStudent(b.dataset.student).catch(e=>showError(e.message));$('student').scrollIntoView({behavior:'smooth'});return;}
 if(!access?.can?.admin||!studentOsis)return;
 if(b.dataset.add){const kind=b.dataset.add,reason=prompt(`Reason for ${kind}?`);if(!reason||reason.trim().length<3)return;
 const expires=prompt('Last day of this action (YYYY-MM-DD)?',new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}));if(!expires)return;
 await mutate('/admin/recess/action',{osis:studentOsis,action_type:kind,reason,expires_on:expires});}
 if(b.dataset.retract){const reason=prompt('Reason for retracting this administrative action?');if(reason?.trim().length>=3)await mutate('/admin/recess/action/retract',{id:b.dataset.retract,reason});}
 if(b.dataset.penalty){const reason=prompt('Reason for retracting this lunch-return penalty?');if(reason?.trim().length>=3)await mutate('/admin/recess/penalty/retract',{osis:studentOsis,reason});}
 });
 init().then(()=>{if(!$('app').hidden)return;const t=Date.now();(function ready(){if(window.google?.accounts?.id){google.accounts.id.initialize({client_id:CLIENT,callback:async x=>{
 try{const v=await req('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:x.credential})});stash(v.sid);await init();}catch(e){$('loginStatus').textContent=e.message;}},ux_mode:'popup'});google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return;}
 if(Date.now()-t<10000)setTimeout(ready,100);})();});
});
})();

'use strict';
const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const CLIENT_ID=document.querySelector('meta[name="google-client-id"]')?.content||'';
const $=id=>document.getElementById(id);
let CURRENT=null,SECTION_ROWS=[],IS_ADMIN=false; // EAGLENEST_GRADEBOOK_TEACHER_BRIDGE_FRONTEND_V1
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function sid(){return window.EAGLENEST_AUTH?.getSid?.()||''}
async function api(path,init={}){const h=new Headers(init.headers||{});if(sid())h.set('x-admin-session',sid());const r=await fetch(new URL(path,API_BASE),{...init,headers:h,credentials:'include',cache:'no-store'});const next=r.headers.get('x-admin-session');if(next)window.EAGLENEST_AUTH?.setSid?.(next);const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);return j}
function nice(v){if(!v)return '—';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{dateStyle:'medium',timeStyle:v.includes('T')?'short':undefined,timeZone:'America/New_York'}):v}
function percent(r){return r?.grading_completion==null?'—':Number(r.grading_completion).toFixed(1)+'%'}
function pill(status){const lookup={UPCOMING:['Upcoming','gbNeutral'],PENDING_GRADING:['Pending grading','gbWarn'],FULLY_GRADED:['Fully graded','gbGood'],NO_ACTIVE_ENROLLMENT:['No active enrollment','gbNeutral']};const [name,klass]=lookup[status]||[status,'gbNeutral'];return `<span class="gbPill ${klass}">${esc(name)}</span>`}
// EAGLENEST_GRADEBOOK_POLICY_WARNINGS_V1 — warnings are independent of grading status.
function gbPolicyWarnings_(assignment){
  let warnings=[];
  try{const raw=assignment?.policy_warnings;warnings=Array.isArray(raw)?raw:JSON.parse(String(raw||'[]'));}
  catch{return '<small class="gbWarn">Unable to display stored policy warnings</small>';}
  if(!Array.isArray(warnings)||!warnings.length)return '<small>—</small>';
  return warnings.map(w=>`<small class="gbWarn" title="${esc(w.code||'Policy review')}">⚠ ${esc(w.message||w.code||'Review policy')} (${Number(w.count)||1})</small>`).join('');
}
// EAGLENEST_GRADEBOOK_GRID_POLICY_HEADER_V1
// Display-only ADS policy explanation; Cloud Run remains the authority for policy warnings.
const GB_GRID_POINT_RULES = Object.freeze({
  'Exams/Quizzes':[100,50,10],
  'Projects/Labs':[100,50,20],
  'Classwork':[20,5],
  'Prepwork':[10]
});
const GB_GRID_CORE_PREFIXES = ['ELA','ENG','MTH','MATH','MAT','SCI','HIS','HST','HIST','SOC','SS','SP'];
function gbGridCoreCourse_(courseNumber){
  const code=String(courseNumber||'').trim().toUpperCase().replace(/\s+/g,'');
  return GB_GRID_CORE_PREFIXES.some(p=>code.startsWith(p) &&
    (code.length===p.length || /[\d_-]/.test(code[p.length])));
}
// Color groups are visual classifications, not automatic policy-category remapping.
function gbGridCategory_(category){
  const label=String(category||'').trim().toLowerCase().replace(/\s+/g,' ');
  if(['exams/quizzes','exam','exams','quiz','quizzes','test','tests','assessment','assessments','exit ticket','exit tickets'].includes(label))
    return {key:'assessments',label:'Exams / assessments'};
  if(['projects/labs','projects','project','lab','labs'].includes(label))
    return {key:'projects',label:'Projects / labs'};
  if(['classwork','class work'].includes(label))
    return {key:'classwork',label:'Classwork'};
  if(['prepwork','preparation','homework','hw','prepwork (hw)'].includes(label))
    return {key:'prepwork',label:'Prepwork / homework'};
  return {key:'other',label:'Other categories'};
}
function gbGridReviewRecord_(assignment){
  return GB_GRID_CONTEXT?.assignmentById?.get(String(assignment?.id||'')) || null;
}
function gbGridPolicyWarnings_(assignment){
  const record=gbGridReviewRecord_(assignment);
  if(!record)return [];
  try{
    const raw=record.policy_warnings;
    const parsed=Array.isArray(raw)?raw:JSON.parse(String(raw||'[]'));
    return Array.isArray(parsed)?parsed.filter(w=>w && typeof w.code==='string' && typeof w.message==='string'):[];
  }catch{return [];}
}
function gbGridAllowedPoints_(assignment){
  const course=GB_GRID_CONTEXT?.courseNumber;
  if(!gbGridCoreCourse_(course))return null;
  // Exact PowerSchool category name: a display color alias is never a policy match.
  return GB_GRID_POINT_RULES[String(assignment?.category||'').trim()]||null;
}
function gbGridPolicyHeader_(assignment){
  const warnings=gbGridPolicyWarnings_(assignment);
  const allowed=gbGridAllowedPoints_(assignment);
  const category=String(assignment?.category||'Uncategorized');
  const max=assignment?.max==null?'not specified':String(assignment.max);
  const pointsWarning=warnings.find(w=>w.code==='POINTS_OUT_OF_POLICY');
  const policyStatus=(pointsWarning && allowed)
    ? `<div class="gbGridPointsViolation"><strong>⚠ Out-of-points mismatch:</strong> This ${esc(category)} assignment is out of <strong>${esc(max)}</strong> points. Allowed: <strong>${allowed.join(' or ')} points</strong>.</div>`
    : '';
  const rules=allowed
    ? `<div class="gbGridAllowed"><strong>ADS core-subject rule:</strong> Allowed out-of values for ${esc(category)}: <strong>${allowed.join(', ')} points</strong>.</div>`
    : '';
  const otherWarnings=warnings.filter(w=>w!==pointsWarning || !allowed);
  const issues=otherWarnings.map(w=>`<li><strong>${esc(w.code.replace(/_/g,' '))}:</strong> ${esc(w.message)}${Number(w.count)>1?` <span class="gbMeta">(${Number(w.count)} occurrences)</span>`:''}</li>`).join('');
  const review=issues?`<div class="gbGridWarningList"><strong>⚠ Policy review</strong><ul>${issues}</ul></div>`:'';
  const record=gbGridReviewRecord_(assignment);
  const fallback=Number(record?.nonstandard_max)>0 && !warnings.length
    ? '<div class="gbGridWarningList">⚠ Review the assignment maximum against ADS policy.</div>':'';
  return `${policyStatus}${rules}${review}${fallback}`;
}
function gbGridCategoryLegend_(grid){
  const used=new Set(grid.assignments.map(a=>gbGridCategory_(a.category).key));
  const groups=[
    ['assessments','Exams / assessments'],['projects','Projects / labs'],
    ['classwork','Classwork'],['prepwork','Prepwork / homework'],['other','Other']
  ];
  return '<span class="gbGridLegendIntro">Category colors:</span>'+
    groups.filter(([key])=>used.has(key)).map(([key,label])=>
      `<span class="gbGridLegendItem"><i class="gbGridCatDot gbCat-${key}" aria-hidden="true"></i>${label}</span>`).join('');
}

// EAGLENEST_GRADEBOOK_GRID_V1 — read-only gradebook projection.
let GB_GRID_CONTEXT=null;
function gbFlagLabels_(flags){
  return [...String(flags||'')].map(k=>({L:'Late',M:'Missing',A:'Absent',I:'Incomplete',E:'Exempt'}[k])).filter(Boolean);
}
function gbFlagChips_(flags){
  const labels={L:'Late',M:'Missing',A:'Absent',I:'Incomplete',E:'Exempt'};
  return [...String(flags||'')].filter(k=>labels[k]).map(k=>
    `<span class="gbFlag gbFlag${k}" title="${labels[k]}">${k==='E'?'EXC':k}</span>`).join('');
}
function gbSwitchView_(view){
  const grid=view==='grid';
  $('gbTabReview').classList.toggle('gbSelectedTab',!grid);
  $('gbTabGrid').classList.toggle('gbSelectedTab',grid);
  $('gbTabReview').setAttribute('aria-selected',String(!grid));
  $('gbTabGrid').setAttribute('aria-selected',String(grid));
  $('detailBody').hidden=grid;
  $('gbGridPane').hidden=!grid;
  $('details').classList.toggle('gbGridMode',grid);
  if(grid)gbLoadGrid_();
}
async function gbLoadGrid_(){
  const ctx=GB_GRID_CONTEXT;
  if(!ctx)return;
  if(ctx.grid){gbRenderGrid_(ctx.grid);return;}
  $('gbGridScroll').innerHTML='<div class="gbEmpty">Loading student scores…</div>';
  $('gbGridSelected').textContent='This grid shows the latest published PowerSchool snapshot. Scores cannot be edited here.';
  try{
    const response=await api('/admin/gradebook-analytics/grid?section_dcid='+encodeURIComponent(ctx.dcid));
    if(GB_GRID_CONTEXT!==ctx)return;
    ctx.grid=response.grid;
    $('gbGridSnapshot').textContent='Snapshot '+(response.snapshot_date||'')+' · Read-only';
    gbRenderGrid_(response.grid);
  }catch(e){if(GB_GRID_CONTEXT===ctx)$('gbGridScroll').textContent='Unable to load gradebook grid: '+(e.message||String(e));}
}
function gbSelectGrid_(grid,studentIndex,assignmentIndex,scoreMap){
  const assignment=grid.assignments[assignmentIndex];
  const student=studentIndex>=0?grid.students[studentIndex]:null;
  if(!assignment)return;
  const score=student?scoreMap.get(student.key+'|'+assignment.id):null;
  const max=assignment.max==null?'—':assignment.max;
  const name=esc(assignment.name||'Unnamed assignment');
  const value=score?.entry!==undefined&&score.entry!==''?esc(score.entry):'No score entered';
  const calc=score?.percent==null?'':` · ${Number(score.percent).toFixed(1)}%`;
  const flags=score?gbFlagChips_(score.flags):'';
  $('gbGridSelected').innerHTML=`<div class="gbGridSelectedAssignment"><strong>Assignment: ${name}</strong> <span class="gbMeta">Due ${esc(assignment.due)} · ${esc(assignment.category||'Uncategorized')} · Out of ${esc(max)} points</span></div>`+
    gbGridPolicyHeader_(assignment)+
    (student?`<div class="gbSelectedGrade"><strong>${esc(student.name)}</strong> · Score: <strong>${value}</strong>${calc}${flags?` <span class="gbCellFlags">${flags}</span>`:''}</div>`:'<div class="gbMeta">Select a score below to see student details and flags.</div>');
  $('gbGridScroll').querySelectorAll('.gbGridActive').forEach(el=>el.classList.remove('gbGridActive'));
  const selected=$('gbGridScroll').querySelector(studentIndex<0?`[data-gb-col="${assignmentIndex}"]`:`[data-gb-a="${assignmentIndex}"][data-gb-s="${studentIndex}"]`);
  if(selected)selected.classList.add('gbGridActive');
}
function gbRenderGrid_(grid){
  if(!grid||!Array.isArray(grid.students)||!Array.isArray(grid.assignments)||!Array.isArray(grid.cells)){
    $('gbGridScroll').innerHTML='<div class="gbEmpty">No grid data is stored for this snapshot. Republish analytics after deploying the Cloud Run grid update.</div>';
    return;
  }
  const scoreMap=new Map(grid.cells.map(r=>[r.student+'|'+r.assignment,r]));
  const head=grid.assignments.map((a,i)=>{
    const group=gbGridCategory_(a.category);
    const warningCount=gbGridPolicyWarnings_(a).length;
    return `<th scope="col"><button type="button" class="gbGridColumn gbCat-${group.key}${warningCount?' gbGridColumnWarn':''}" data-gb-col="${i}" title="${esc(a.name)} · ${esc(a.category||'Uncategorized')}${warningCount?' · '+warningCount+' policy warning(s)':''}" aria-label="${esc(a.name)} · ${esc(a.category||'Uncategorized')}${warningCount?' · '+warningCount+' policy warning(s)':''}"><span class="gbGridCategoryName">${esc(a.category||'Uncategorized')}</span><span>${esc(a.due)}</span><strong>${esc(a.name)}</strong><small>Out of ${esc(a.max??'—')}</small>${warningCount?'<span class="gbGridColumnAlert" title="Policy warnings — select assignment to review">⚠ '+warningCount+'</span>':''}</button></th>`;
  }).join('');
  const rows=grid.students.map((s,si)=>`<tr><th scope="row" class="gbGridName" title="${esc(s.name)}">${esc(s.name)}</th>`+
    grid.assignments.map((a,ai)=>{
      const score=scoreMap.get(s.key+'|'+a.id);
      // No raw score entry is different from a legitimate numerical zero.
      const text=score?.entry!==undefined&&score.entry!==''?score.entry:'—';
      const kind=score?.kind==='SCORE_CODE'?' gbGridSpecial':'';
      const flags=score?gbFlagChips_(score.flags):'';
      return `<td><button type="button" class="gbGridCell${kind}" data-gb-s="${si}" data-gb-a="${ai}" aria-label="${esc(s.name)} · ${esc(a.name)} · ${esc(text)}${score?.flags?' · '+esc(gbFlagLabels_(score.flags).join(', ')):''}"><span class="gbScoreText">${esc(text)}</span><span class="gbCellFlags">${flags}</span></button></td>`;
    }).join('')+'</tr>').join('');
  $('gbGridScroll').innerHTML=`<table class="gbGridTable"><thead><tr><th scope="col" class="gbGridCorner">STUDENTS (${grid.students.length})</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  $('gbGridLegend').innerHTML=gbGridCategoryLegend_(grid);
  $('gbGridScroll').onclick=ev=>{
    const btn=ev.target.closest('button[data-gb-a],button[data-gb-col]');
    if(!btn||!$('gbGridScroll').contains(btn))return;
    const ai=Number(btn.dataset.gbA??btn.dataset.gbCol),si=btn.dataset.gbS===undefined?-1:Number(btn.dataset.gbS);
    gbSelectGrid_(grid,si,ai,scoreMap);
  };
  if(grid.assignments.length)gbSelectGrid_(grid,-1,0,scoreMap);
}

function setError(e){$('error').hidden=!e;$('error').textContent=String(e||'')}
function renderSummary(s){const cards=[['My / selected sections',s.section_count],['Assignments retrieved',s.assignment_count],['Due assignments graded',`${s.fully_graded_count}/${s.due_count}`],['Recorded score completion',s.grading_completion==null?'—':Number(s.grading_completion).toFixed(1)+'%'],['Due assignments pending',s.outstanding_count],['Assignments needing policy review',s.policy_warning_assignment_count||0]];$('kpis').innerHTML=cards.map(([name,v])=>`<div class="gbKpi"><span>${esc(name)}</span><strong>${esc(v)}</strong></div>`).join('')}
// EAGLENEST_GRADEBOOK_COURSE_SORT_V1
// Mirror the Worker display rules; the server remains authoritative for totals and access.
const gbCourseCollator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
function gbExcludedSection(row){return [row?.course_number,row?.section_code].some(v=>
  /^(?:LCH|FM)\d*(?:$|[._-])/.test(String(v??'').trim().toUpperCase().replace(/\s+/g,'')));}
function gbCourseSort(a,b){
  const aEmpty=!(Number(a?.assignment_count)>0),bEmpty=!(Number(b?.assignment_count)>0);
  if(aEmpty!==bEmpty)return aEmpty?1:-1;
  const aCourse=String(a?.course_number||a?.section_code||'').split('.')[0];
  const bCourse=String(b?.course_number||b?.section_code||'').split('.')[0];
  return gbCourseCollator.compare(aCourse,bCourse)||
    gbCourseCollator.compare(String(a?.section_code||''),String(b?.section_code||''))||
    gbCourseCollator.compare(String(a?.teacher_name||''),String(b?.teacher_name||''))||
    gbCourseCollator.compare(String(a?.section_dcid||''),String(b?.section_dcid||''));
}
// EAGLENEST_GRADEBOOK_SECTION_SWITCHER_V1 — only offer already authorized sections.
function gbPopulateSectionSwitcher_(dcid){
  const wrap=$('gbSectionSwitcherWrap'),select=$('gbSectionSwitcher');
  const current=SECTION_ROWS.find(r=>String(r.section_dcid)===String(dcid));
  const currentEmail=String(current?.teacher_email||'').trim().toLowerCase();
  const currentTeacherId=String(current?.teacher_id||'').trim();
  // A teacher's overview is already access-scoped, including co-taught sections.
  // For admins, group by the opened section's primary PowerSchool teacher.
  const ownSections=CURRENT?.viewer?.role==='teacher';
  const choices=current?SECTION_ROWS.filter(r=>ownSections || (
    currentEmail ? String(r.teacher_email||'').trim().toLowerCase()===currentEmail :
    currentTeacherId ? String(r.teacher_id||'').trim()===currentTeacherId :
    String(r.section_dcid)===String(dcid)
  )).sort(gbCourseSort):[];
  const options=choices.map(r=>{
    const option=document.createElement('option');
    option.value=String(r.section_dcid);
    option.textContent=String(r.section_code||r.course_number||r.section_dcid);
    return option;
  });
  select.replaceChildren(...options);
  select.value=String(dcid);
  wrap.hidden=choices.length<2;
  select.disabled=choices.length<2;
}

function renderTable(){gbRefreshTeacherSummary_();const q=$('search').value.trim().toLowerCase();const teacher=$('teacherFilter').value;const visible=SECTION_ROWS.filter(r=>(!teacher||r.teacher_email===teacher||(r.additional_teacher_emails||[]).includes(teacher))&&(!q||[r.section_code,r.teacher_name,r.course_number].some(v=>String(v||'').toLowerCase().includes(q))));$('listCaption').textContent=`${visible.length} section(s) · click a course for its assignment breakdown.`;
  $('table').innerHTML=visible.length?`<table><thead><tr><th>Section</th>${IS_ADMIN?'<th>Teacher</th>':''}<th>Enrolled</th><th>Retrieved assignments</th><th>Due fully graded</th><th>Recorded completion</th><th>Pending due</th><th>Policy reviews</th><th>Last score entry</th></tr></thead><tbody>${visible.map(r=>`<tr><td><button class="gbRowButton" data-section="${esc(r.section_dcid)}">${esc(r.section_code)}</button>${r.coverage==='NO_RETRIEVED_ASSIGNMENTS'?'<small>No returned scored assignments</small>':''}</td>${IS_ADMIN?`<td>${esc(r.teacher_name||'Unmapped teacher')}<small>${esc(r.teacher_email||'Email not mapped')}</small>${r.additional_teacher_emails?.length?`<small>Additional: ${esc(r.additional_teacher_emails.join(', '))}</small>`:''}</td>`:''}<td>${r.enrolled_count}</td><td>${r.assignment_count}</td><td>${r.fully_graded_count}/${r.due_count}</td><td>${percent(r)}</td><td class="${r.outstanding_count?'gbWarn':'gbGood'}">${r.outstanding_count}</td><td class="${Number(r.policy_warning_assignment_count)?'gbWarn':''}">${Number(r.policy_warning_assignment_count)||0}</td><td>${esc(r.latest_score_entry||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="gbEmpty">No sections match your filters, or your teacher email has not yet been mapped to a PowerSchool section.</div>';
  $('table').querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>showSection(b.dataset.section));}
async function showSection(dcid,keepGrid=false){
  const showGrid=keepGrid&&$('gbTabGrid').getAttribute('aria-selected')==='true';
  const ctx={dcid,grid:null,courseNumber:'',assignmentById:new Map()};
  GB_GRID_CONTEXT=ctx;
  gbSwitchView_('review');
  if(!$('details').open)$('details').showModal();
  gbPopulateSectionSwitcher_(dcid);
  $('detailTitle').textContent='Loading section…';
  $('detailBody').innerHTML='';
  try{
    const data=await api('/admin/gradebook-analytics/section?section_dcid='+encodeURIComponent(dcid));
    if(GB_GRID_CONTEXT!==ctx)return;
if(GB_GRID_CONTEXT?.dcid===dcid){GB_GRID_CONTEXT.courseNumber=data.section?.course_number||'';GB_GRID_CONTEXT.assignmentById=new Map((data.assignments||[]).map(a=>[String(a.assignment_section_id),a]));if(GB_GRID_CONTEXT.grid&&!$('gbGridPane').hidden)gbRenderGrid_(GB_GRID_CONTEXT.grid);}$('detailTitle').textContent=data.section.section_code+' · '+(data.section.teacher_name||'');$('detailMeta').textContent=`${data.assignments.length} assignment(s) retrieved · ${data.section.enrolled_count} enrolled · completion ${percent(data.section)}`;
  $('detailBody').innerHTML=data.assignments.length?`<table><thead><tr><th>Due</th><th>Assignment</th><th>Category</th><th>Points</th><th>Recorded / expected</th><th>Status</th><th>Flags</th><th>Policy review</th></tr></thead><tbody>${data.assignments.map(a=>`<tr><td>${esc(a.due_date)}</td><td>${esc(a.name)}${a.counted?'':'<small>Not counted in final grade</small>'}</td><td>${esc(a.category||'Uncategorized')}</td><td>${a.max_points??'—'}</td><td>${a.entered_scores}/${a.expected_scores}<small>${a.exempt_count} exempt</small></td><td>${pill(a.status)}</td><td><span class="${a.unentered_count?'gbBad':''}">${a.unentered_count} unentered</span><small>${a.missing_flag_count} missing · ${a.absent_flag_count} absent · ${a.incomplete_flag_count} incomplete</small>${a.nonstandard_max&&!Number(a.policy_warning_count)?'<small class="gbWarn">Review maximum-point rule</small>':''}${a.overmax_count?`<small class="gbWarn">${a.overmax_count} score(s) over maximum</small>`:''}</td><td>${gbPolicyWarnings_(a)}</td></tr>`).join('')}</tbody></table>`:'<div class="gbEmpty">No assignment records were returned for this section. The existing PowerSchool query excludes assignments with no qualifying score records.</div>';
if(showGrid&&GB_GRID_CONTEXT===ctx)gbSwitchView_('grid');
}catch(e){if(GB_GRID_CONTEXT!==ctx)return;$('detailTitle').textContent='Unable to load section';$('detailBody').textContent=e.message||String(e)}}
async function renderHistory(){try{const d=await api('/admin/gradebook-analytics/history');$('history').textContent=d.history?.length?d.history.map(s=>`${s.snapshot_date} · published ${nice(s.published_at)}`).join('  ·  '):'No earlier snapshots yet.'}catch{$('history').textContent='History temporarily unavailable.'}}
async function load(){setError('');$('table').textContent='Loading weekly report…';try{const data=await api('/admin/gradebook-analytics/overview');$('login').hidden=true;$('app').hidden=false;CURRENT=data;await gbControlAuthorize_();IS_ADMIN=data.viewer?.role==='admin'||data.viewer?.role==='department_chair' /* EAGLENEST_GRADEBOOK_DEPARTMENT_CHAIR_UI_V1 */;$('listTitle').textContent=data.viewer?.role==='department_chair'?'My Department Sections':IS_ADMIN?'Schoolwide sections':'My Sections';if(!data.snapshot){$('table').innerHTML='<div class="gbEmpty">No published gradebook analytics snapshot yet. Run Cloud Run /run?mode=eaglenest after both source exports show SUCCESS.</div>';$('kpis').innerHTML='';return}
  $('meta').textContent=`Assignment data refreshed ${nice(data.snapshot.assignment_export_completed_at)} · roster refreshed ${nice(data.snapshot.dde_export_completed_at)} · report published ${nice(data.snapshot.published_at)} · school ${data.snapshot.school_id}, term ${data.snapshot.term_id}`;
  $('coverage').textContent=data.snapshot.coverage_note||'';
  SECTION_ROWS=(data.sections||[]).filter(row=>!gbExcludedSection(row)).sort(gbCourseSort);
  const teacherOptions=new Map();for(const row of SECTION_ROWS){if(row.teacher_email)teacherOptions.set(row.teacher_email,row.teacher_name||row.teacher_email);for(const email of row.additional_teacher_emails||[])if(!teacherOptions.has(email))teacherOptions.set(email,email)}const teachers=[...teacherOptions.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  $('teacherFilterWrap').hidden=!IS_ADMIN;$('teacherFilter').innerHTML='<option value="">All teachers</option>'+teachers.map(([email,name])=>`<option value="${esc(email)}">${esc(name)}</option>`).join('');renderSummary(data.summary||{});renderTable();renderHistory();
}catch(e){setError(e.message||String(e));$('table').textContent='Could not load report.'}}
async function signIn(){try{await api('/admin/access');await load()}catch{if(!window.google?.accounts?.id){$('loginMessage').textContent='Loading Google Sign-In…';let i=0;while(!window.google?.accounts?.id&&i++<100)await new Promise(r=>setTimeout(r,80));}if(!window.google?.accounts?.id){$('loginMessage').textContent='Google Sign-In failed to load';return}window.google.accounts.id.initialize({client_id:CLIENT_ID,callback:async r=>{try{const response=await fetch(new URL('/admin/session/login_google',API_BASE),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:r.credential}).toString(),credentials:'include'});const j=await response.json();if(!response.ok||!j.ok)throw new Error(j.error||'Sign-in failed');window.EAGLENEST_AUTH?.setSid?.(j.sid||response.headers.get('x-admin-session'));await load()}catch(e){$('loginMessage').textContent=e.message||String(e)}}});window.google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});$('loginMessage').textContent='Please sign in with your school account.'}}
$('refresh').onclick=load;$('search').oninput=renderTable;$('teacherFilter').onchange=renderTable;$('closeDetails').onclick=()=>$('details').close();$('gbTabReview').onclick=()=>gbSwitchView_('review');$('gbTabGrid').onclick=()=>gbSwitchView_('grid');$('gbSectionSwitcher').onchange=ev=>{const next=String(ev.target.value||'');if(next&&next!==String(GB_GRID_CONTEXT?.dcid||''))showSection(next,true);};window.addEventListener('DOMContentLoaded',signIn);

// EAGLENEST_GRADEBOOK_MANUAL_CONTROL_V1 — frontend visibility is only UX;
// Worker validates super_admin for both GET and POST (and blocks View-as writes).
let GB_CONTROL_AUTHED=false,GB_CONTROL_POLL=null;
async function gbControlAuthorize_(){
  if(GB_CONTROL_AUTHED)return;
  try{
    const access=await api('/admin/access');
    if(access.role!=='super_admin'||access.can?.super_admin!==true||access.view_as?.active)return;
    GB_CONTROL_AUTHED=true;
    $('manualControl').hidden=false;
    $('manualStatusRefresh').addEventListener('click',gbControlStatus_);
    $('manualButtons').querySelectorAll('[data-control-action]').forEach(button=>{
      button.addEventListener('click',()=>gbControlQueue_(button.dataset.controlAction));
    });
    await gbControlStatus_();
    GB_CONTROL_POLL=setInterval(()=>{
      if(!document.hidden)gbControlStatus_().catch(()=>{});
    },15000);
  }catch(e){console.warn('Gradebook control unavailable:',e.message||String(e));}
}
function gbControlState_(job){
  if(!job)return'No manual refresh active.';
  const labels={assignments:'Refreshing PowerSchool assignments',dde:'Refreshing DDE',publish:'Publishing EagleNEST analytics'};
  return `${job.status.toUpperCase()} · ${labels[job.phase]||job.phase} · requested by ${job.requested_by} · ${job.detail||''}`;
}
async function gbControlStatus_(){
  if(!GB_CONTROL_AUTHED)return;
  try{
    const data=await api('/admin/gradebook-analytics/control');
    $('manualMessage').textContent=gbControlState_(data.active||data.jobs?.[0]);
    const active=!!data.active;
    $('manualButtons').querySelectorAll('button').forEach(b=>b.disabled=active);
    $('manualHistory').textContent=(data.jobs||[]).slice(0,4).map(j=>
      `${new Date(j.created_at).toLocaleString()} · ${j.action} · ${j.status}${j.snapshot_id?' · snapshot '+j.snapshot_id.slice(0,12):''}`
    ).join('  |  ');
    if(data.jobs?.[0]?.status==='done' && data.jobs[0].action==='all' && CURRENT?.snapshot?.snapshot_id!==data.jobs[0].snapshot_id){
      // Requery report only after the ready pointer is switched.
      const current=await api('/admin/gradebook-analytics/overview');
      if(current.snapshot?.snapshot_id && current.snapshot.snapshot_id!==CURRENT?.snapshot?.snapshot_id){
        CURRENT=current;SECTION_ROWS=current.sections||[];renderSummary(current.summary||{});renderTable();
        $('meta').textContent=`Assignment data refreshed ${nice(current.snapshot.assignment_export_completed_at)} · roster refreshed ${nice(current.snapshot.dde_export_completed_at)} · report published ${nice(current.snapshot.published_at)}`;
        renderHistory();
      }
    }
  }catch(e){$('manualMessage').textContent='Manual refresh status unavailable: '+(e.message||e);}
}
async function gbControlQueue_(action){
  const labels={all:'Run PowerSchool export → DDE sync → EagleNEST publication',
    assignments:'Refresh PowerSchool assignment export only (does not publish)',
    dde:'Refresh DDE only (does not publish)',
    publish:'Republish EagleNEST using existing assignment and DDE exports'};
  if(!window.confirm('Superadmin action: '+labels[action]+'?'))return;
  $('manualMessage').textContent='Submitting '+action+' request…';
  try{
    const data=await api('/admin/gradebook-analytics/control',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})
    });
    $('manualMessage').textContent='Queued '+data.job?.action+'; next private poll typically within five minutes.';
    await gbControlStatus_();
  }catch(e){$('manualMessage').textContent='Could not queue refresh: '+(e.message||e);}
}

// EAGLENEST_GRADEBOOK_TEACHER_SUMMARY_V1_BEGIN
// Gradebook Analytics is already scoped by the Worker. This only recalculates
// the KPI cards over the same authorized rows as the teacher dropdown/table.
// A co-taught section contributes once (not once per matching teacher email).
function gbSummaryForSelectedTeacher_(rows, teacherEmail, allTeacherSummary = {}) {
  const selected = String(teacherEmail ?? '').trim().toLowerCase();
  if (!selected) return { ...allTeacherSummary }; // Preserve authoritative all-teachers totals.

  const filtered = (Array.isArray(rows) ? rows : []).filter(row => {
    const primary = String(row?.teacher_email ?? '').trim().toLowerCase();
    const additional = Array.isArray(row?.additional_teacher_emails)
      ? row.additional_teacher_emails : [];
    return primary === selected || additional.some(email =>
      String(email ?? '').trim().toLowerCase() === selected);
  });

  // These are the additive per-section totals used by the Worker overview.
  // Preserve other summary properties for forward compatibility, but never
  // let a whole-school total leak into a supported teacher-specific KPI.
  const additive = [
    'assignment_count', 'due_count', 'fully_graded_count', 'outstanding_count',
    'expected_scores', 'entered_scores', 'unentered_count', 'exempt_count',
    'missing_flag_count', 'absent_flag_count', 'incomplete_flag_count',
    'late_flag_count', 'overmax_count', 'nonstandard_max_count',
    'policy_warning_count', 'policy_warning_assignment_count'
  ];
  const summary = { ...allTeacherSummary, section_count: filtered.length };
  for (const field of additive) summary[field] = 0;
  for (const row of filtered) {
    for (const field of additive) {
      const value = Number(row?.[field]);
      if (Number.isFinite(value) && value > 0) summary[field] += value;
    }
  }
  summary.grading_completion = summary.expected_scores > 0
    ? Math.round(summary.entered_scores / summary.expected_scores * 10000) / 100
    : null;
  return summary;
}

function gbRefreshTeacherSummary_() {
  // Never request or use data outside the existing authorized overview payload.
  if (!CURRENT || !Array.isArray(SECTION_ROWS)) return;
  const picker = document.getElementById('teacherFilter');
  if (!picker) return;
  renderSummary(gbSummaryForSelectedTeacher_(
    SECTION_ROWS, picker.value, CURRENT.summary || {}
  ));
}
// EAGLENEST_GRADEBOOK_TEACHER_SUMMARY_V1_END

/* EAGLENEST_COUNSELOR_DASHBOARD_V1 */
/* EAGLENEST_COUNSELOR_TEAMS_V2 */
function meta(name){return document.querySelector(`meta[name="${name}"]`)?.content||'';}
const API_BASE=(meta('api-base')||'').replace(/\/*$/,'')+'/';
const GOOGLE_CLIENT_ID=meta('google-client-id')||'';
const ADMIN_SESSION_KEY='ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY='teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER='x-admin-session';
const $=(id)=>document.getElementById(id);

const TEAM_CONFIG={
  college:{
    label:'College Counseling',
    subtitle:'College planning, applications, financial aid, scholarships, and postsecondary milestones.',
    noteTypes:['College Check-in','Postsecondary Planning','College List','Application Planning','Application Submitted','Financial Aid/FAFSA','Scholarship','Essay/Recommendation','Transcript/Records','College Visit/Fair','Decision/Enrollment','Other'],
    tags:['College List','Application','FAFSA','Financial Aid','Scholarship','Essay','Recommendation','Transcript','Visit/Fair','Decision','Follow-up'],
    templates:[
      {label:'College check-in',type:'College Check-in',tags:['Follow-up']},
      {label:'Application check-in',type:'Application Planning',tags:['Application']},
      {label:'FAFSA / aid',type:'Financial Aid/FAFSA',tags:['FAFSA','Financial Aid'],details:{milestone:'FAFSA / Financial Aid'}},
      {label:'Scholarship',type:'Scholarship',tags:['Scholarship']},
      {label:'Decision / enrollment',type:'Decision/Enrollment',tags:['Decision']}
    ]
  },
  social_work:{
    label:'Social Work',
    subtitle:'Student support check-ins, barriers, referrals, coordination, and school-based social-emotional support.',
    noteTypes:['Student Check-in','Attendance/Barrier','Peer Conflict','Family Concern','Social-Emotional','Referral/Coordination','External Service Coordination','Crisis/Urgent Concern','Other'],
    tags:['Check-in','Attendance/Barrier','Peer Conflict','Family','Social-Emotional','Referral','Coordination','Urgent','Follow-up'],
    templates:[
      {label:'Student check-in',type:'Student Check-in',tags:['Check-in']},
      {label:'Attendance / barrier',type:'Attendance/Barrier',tags:['Attendance/Barrier']},
      {label:'Peer conflict',type:'Peer Conflict',tags:['Peer Conflict']},
      {label:'Referral / coordination',type:'Referral/Coordination',tags:['Referral','Coordination']},
      {label:'Urgent concern',type:'Crisis/Urgent Concern',tags:['Urgent','Follow-up']}
    ]
  },
  academic:{
    label:'Academic Counseling',
    subtitle:'Academic progress, credits, Regents, graduation requirements, interventions, and student goals.',
    noteTypes:['Academic Check-in','Course Performance','Credits/Graduation','Regents','Attendance Impact','Schedule/Course Placement','Tutoring/Support','Academic Goal','Teacher Follow-up','Other'],
    tags:['Academic','Course Performance','Credits','Graduation','Regents','Attendance','Schedule','Tutoring','Goal','Teacher Follow-up','Follow-up'],
    templates:[
      {label:'Academic check-in',type:'Academic Check-in',tags:['Academic']},
      {label:'Course performance',type:'Course Performance',tags:['Course Performance']},
      {label:'Credits / graduation',type:'Credits/Graduation',tags:['Credits','Graduation']},
      {label:'Regents',type:'Regents',tags:['Regents']},
      {label:'Teacher follow-up',type:'Teacher Follow-up',tags:['Teacher Follow-up','Follow-up']}
    ]
  }
};

let access=null;
let activeTeam='';
let dashboard=null;
let selectedStudent=null;
let studentBundle=null;
let editingNote=null;
let searchTimer=null;
let accessStaff=[];
let teamAccess={college:new Set(),social_work:new Set(),academic:new Set()};
let legacyGeneric=[];
let legacyNotes=[];

function esc(v){return String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function canManage(){return access?.can?.counselor_notes_manage===true;}
function isReadOnly(){return access?.view_as?.active===true||access?.view_as?.read_only===true;}
function availableTeams(){
  const out=[];
  if(access?.can?.counselor_college===true)out.push('college');
  if(access?.can?.counselor_social_work===true)out.push('social_work');
  if(access?.can?.counselor_academic===true)out.push('academic');
  return out;
}
function getSid(){try{return String(sessionStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem(ADMIN_SESSION_KEY)||sessionStorage.getItem(ADMIN_SESSION_LEGACY_KEY)||localStorage.getItem(ADMIN_SESSION_LEGACY_KEY)||'').trim();}catch{return '';}}
function setSid(sid){const v=String(sid||'').trim();if(!v)return;try{for(const k of [ADMIN_SESSION_KEY,ADMIN_SESSION_LEGACY_KEY]){sessionStorage.setItem(k,v);localStorage.setItem(k,v);}}catch{}}
async function adminFetch(pathOrUrl,init={}){const url=pathOrUrl instanceof URL?pathOrUrl:new URL(pathOrUrl,API_BASE);const headers=new Headers(init.headers||{});const sid=getSid();if(sid&&!headers.has(ADMIN_SESSION_HEADER))headers.set(ADMIN_SESSION_HEADER,sid);const r=await fetch(url,{...init,headers,credentials:'include',cache:'no-store'});const next=String(r.headers.get('x-admin-session')||'').trim();if(next)setSid(next);return r;}
async function api(path,init={}){const r=await adminFetch(path,init);const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok){const e=new Error(j?.error||`HTTP ${r.status}`);e.payload=j;e.status=r.status;throw e;}return j;}
function setStatus(message,kind=''){const el=$('pageStatus');el.textContent=message||'';el.className=`status ${kind}`.trim();}
function fmtDateTime(iso){const d=new Date(String(iso||''));return Number.isFinite(d.getTime())?d.toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'—';}
function fmtShort(iso){const d=new Date(String(iso||''));return Number.isFinite(d.getTime())?d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';}
function fmtDateKey(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return value||'—';const d=new Date(`${value}T12:00:00`);return d.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});}
function localDateTimeValue(iso=new Date().toISOString()){const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '';const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
function todayLocal(){const d=new Date();const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function addDaysLocal(days){const d=new Date();d.setDate(d.getDate()+Number(days||0));const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function noteTags(){return [...document.querySelectorAll('.tagChoice:checked')].map((el)=>el.value);}
function setTagChoices(tags){const set=new Set(Array.isArray(tags)?tags:[]);document.querySelectorAll('.tagChoice').forEach((el)=>{el.checked=set.has(el.value);});}
function noteCanEdit(note){return !!note&&!isReadOnly()&&note.counselor_team===activeTeam&&(canManage()||String(note.counselor_email||'').toLowerCase()===String(access?.email||'').toLowerCase());}
async function waitForGoogle(timeoutMs=8000){const start=Date.now();while(!window.google?.accounts?.id){if(Date.now()-start>timeoutMs)throw new Error('Google sign-in failed to load');await new Promise(r=>setTimeout(r,50));}return google.accounts.id;}
async function getAccess(){const r=await adminFetch('/admin/access');if(!r.ok)return null;const j=await r.json().catch(()=>null);return j?.ok?j:null;}
async function doLogin(token){const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:token}).toString()});const j=await r.json().catch(()=>({}));if(j?.sid)setSid(j.sid);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);}

function setActiveTeam(team,{reload=true}={}){
  if(!availableTeams().includes(team))return;
  activeTeam=team;
  $('teamSelect').value=team;
  const cfg=TEAM_CONFIG[team];
  $('teamSubtitle').textContent=cfg.subtitle;
  if(selectedStudent)$('studentTeamBadge').textContent=cfg.label;
  renderNoteFormForTeam();
  const url=new URL(location.href);url.searchParams.set('team',team);history.replaceState(null,'',url.toString());
  if(reload){
    if(selectedStudent)openStudent(selectedStudent);
    loadDashboard();
  }
}

function buildTeamSelector(){
  const teams=availableTeams();
  $('teamSelect').replaceChildren();
  for(const team of teams)$('teamSelect').appendChild(new Option(TEAM_CONFIG[team].label,team));
  const requested=new URL(location.href).searchParams.get('team');
  activeTeam=teams.includes(requested)?requested:teams[0]||'';
  if(activeTeam)$('teamSelect').value=activeTeam;
  $('teamLabel').hidden=teams.length<=1;
  if(activeTeam)$('teamSubtitle').textContent=TEAM_CONFIG[activeTeam].subtitle;
}

async function searchStudents(raw){
  const q=String(raw||'').trim(),menu=$('studentSearchMenu');
  if(q.length<2){menu.hidden=true;menu.replaceChildren();return;}
  try{
    const data=await api(`/admin/roster/search?q=${encodeURIComponent(q)}`);
    const rows=Array.isArray(data.results)?data.results:[];
    menu.innerHTML=rows.length?rows.map((row)=>`<button type="button" data-osis="${esc(row.osis)}" data-name="${esc(row.name||'')}"><strong>${esc(row.name||row.osis)}</strong><div class="muted small">OSIS ${esc(row.osis||'')}${row.email?` • ${esc(row.email)}`:''}</div></button>`).join(''):'<div class="emptyState">No matches.</div>';
    menu.hidden=false;
    menu.querySelectorAll('[data-osis]').forEach((btn)=>btn.addEventListener('click',()=>openStudent({student_number:btn.dataset.osis,name:btn.dataset.name})));
  }catch(e){menu.innerHTML=`<div class="emptyState">Search failed: ${esc(e.message)}</div>`;menu.hidden=false;}
}

function scopeValue(){return String($('scopeSelect').value||'team');}
async function loadDashboard(){
  if(!activeTeam)return;
  setStatus(`Loading ${TEAM_CONFIG[activeTeam].label} dashboard…`);
  try{
    dashboard=await api(`/admin/counselor/dashboard?team=${encodeURIComponent(activeTeam)}&scope=${encodeURIComponent(scopeValue())}`);
    renderDashboard();setStatus('');
  }catch(e){setStatus(`Could not load counselor dashboard: ${e.message}`,'error');}
}
function renderDashboard(){
  const s=dashboard?.summary||{};
  $('kpiNotes7d').textContent=s.notes_7d??0;$('kpiStudents30d').textContent=s.students_30d??0;$('kpiOpenFollowups').textContent=s.open_followups??0;$('kpiOverdue').textContent=s.overdue_followups??0;
  const today=String(dashboard?.today||todayLocal()),followups=Array.isArray(dashboard?.followups)?dashboard.followups:[];
  $('followupList').innerHTML=followups.length?followups.map((note)=>{
    const overdue=note.follow_up_due_date&&note.follow_up_due_date<today;
    return `<article class="listItem ${overdue?'overdue':''}"><div class="timelineTop"><div><button class="linkBtn" type="button" data-open-student="${esc(note.student_number)}" data-student-name="${esc(note.student_name||'')}"><strong>${esc(note.student_name||note.student_number)}</strong></button><div class="listMeta">${esc(note.note_type)} • ${esc(fmtShort(note.meeting_at_iso))}</div></div><span class="pill ${overdue?'danger':'warn'}">${overdue?'Overdue ':''}${esc(fmtDateKey(note.follow_up_due_date))}</span></div><div class="listBody">${esc(note.note_text)}</div><div class="listMeta">Counselor: ${esc(note.counselor_name||note.counselor_email)}</div>${noteCanEdit(note)?`<div class="toolbar" style="justify-content:flex-end;margin-top:8px"><button type="button" data-resolve-followup="${esc(note.note_id)}">Resolve follow-up</button></div>`:''}</article>`;
  }).join(''):'<div class="emptyState">No open follow-ups.</div>';
  $('followupList').querySelectorAll('[data-open-student]').forEach((btn)=>btn.addEventListener('click',()=>openStudent({student_number:btn.dataset.openStudent,name:btn.dataset.studentName})));
  $('followupList').querySelectorAll('[data-resolve-followup]').forEach((btn)=>btn.addEventListener('click',()=>resolveFollowup(btn.dataset.resolveFollowup,true)));
  const recent=Array.isArray(dashboard?.recent_students)?dashboard.recent_students:[];
  $('recentStudents').innerHTML=recent.length?recent.map((row)=>`<article class="listItem"><button class="linkBtn" type="button" data-recent-osis="${esc(row.student_number)}" data-recent-name="${esc(row.student_name||'')}"><strong>${esc(row.student_name||row.student_number)}</strong></button><div class="listMeta">Grade ${esc(row.student_grade||'—')} • ${row.note_count} note${Number(row.note_count)===1?'':'s'}</div><div class="listMeta">Last meeting ${esc(fmtShort(row.latest_meeting_at_iso))}</div></article>`).join(''):'<div class="emptyState">No recent students yet.</div>';
  $('recentStudents').querySelectorAll('[data-recent-osis]').forEach((btn)=>btn.addEventListener('click',()=>openStudent({student_number:btn.dataset.recentOsis,name:btn.dataset.recentName})));
}

async function openStudent(student){
  const osis=String(student?.student_number||student?.osis||'').trim();if(!osis||!activeTeam)return;
  selectedStudent={student_number:osis,name:String(student?.name||'')};$('studentSearchMenu').hidden=true;$('studentSearch').value=selectedStudent.name||osis;$('dashboardView').hidden=true;$('studentView').hidden=false;$('studentName').textContent=selectedStudent.name||'Loading student…';$('studentMeta').textContent=`OSIS ${osis}`;$('studentTeamBadge').textContent=TEAM_CONFIG[activeTeam].label;$('studentTimeline').innerHTML='<div class="emptyState">Loading notes…</div>';setStatus(`Loading ${TEAM_CONFIG[activeTeam].label} timeline…`);
  const url=new URL(location.href);url.searchParams.set('osis',osis);url.searchParams.set('team',activeTeam);if(selectedStudent.name)url.searchParams.set('name',selectedStudent.name);history.replaceState(null,'',url.toString());
  try{
    studentBundle=await api(`/admin/counselor/student?team=${encodeURIComponent(activeTeam)}&student_number=${encodeURIComponent(osis)}`);
    selectedStudent={student_number:studentBundle.student.student_number,name:studentBundle.student.name,grade:studentBundle.student.grade,email:studentBundle.student.email};renderStudent();setStatus('');
  }catch(e){$('studentTimeline').innerHTML=`<div class="emptyState">Could not load notes: ${esc(e.message)}</div>`;setStatus(`Could not load student: ${e.message}`,'error');}
}
function detailPairs(note){
  const d=note?.details||{},pairs=[];
  if(note?.counselor_team==='college'){
    if(d.postsecondary_plan)pairs.push(['Postsecondary plan',d.postsecondary_plan]);
    if(d.milestone)pairs.push(['Milestone',d.milestone]);
    if(d.school_program)pairs.push(['School / program',d.school_program]);
    if(d.next_deadline)pairs.push(['Next deadline',fmtDateKey(d.next_deadline)]);
  }else if(note?.counselor_team==='academic'){
    if(d.academic_focus)pairs.push(['Academic focus',d.academic_focus]);
    if(d.intervention)pairs.push(['Intervention / support',d.intervention]);
    if(d.next_action)pairs.push(['Next action',d.next_action]);
  }else if(note?.counselor_team==='social_work'){
    if(d.support_focus)pairs.push(['School support focus',d.support_focus]);
    if(d.coordination)pairs.push(['Coordination',d.coordination]);
    if(d.next_action)pairs.push(['Next action',d.next_action]);
  }
  return pairs;
}
function renderDetailPairs(note){
  const pairs=detailPairs(note);if(!pairs.length)return '';
  return `<div class="detailGrid">${pairs.map(([k,v])=>`<div class="detailItem"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`;
}
function renderStudent(){
  const student=studentBundle?.student||selectedStudent||{},summary=studentBundle?.summary||{};
  $('studentName').textContent=student.name||student.student_number||'Student';$('studentMeta').textContent=[`OSIS ${student.student_number||''}`,student.grade?`Grade ${student.grade}`:'',student.email||''].filter(Boolean).join(' • ');$('studentTeamBadge').textContent=TEAM_CONFIG[activeTeam].label;$('studentNoteCount').textContent=summary.note_count??0;$('studentCounselorCount').textContent=summary.counselor_count??0;$('studentFollowupCount').textContent=summary.open_followups??0;$('studentLastMeeting').textContent=summary.last_meeting_at_iso?fmtShort(summary.last_meeting_at_iso):'—';$('newNoteBtn').disabled=isReadOnly();
  const notes=Array.isArray(studentBundle?.notes)?studentBundle.notes:[];
  $('studentTimeline').innerHTML=notes.length?notes.map((note)=>{
    const tags=(Array.isArray(note.tags)?note.tags:[]).map((tag)=>`<span class="pill">${esc(tag)}</span>`).join('');
    const follow=note.follow_up_needed?`<div class="followupBox"><div class="timelineTop"><strong>Follow-up</strong><span class="pill ${note.follow_up_status==='resolved'?'good':'warn'}">${esc(note.follow_up_status==='resolved'?'Resolved':'Open')}</span></div><div class="listMeta">${note.follow_up_due_date?`Due ${esc(fmtDateKey(note.follow_up_due_date))}`:'No due date'}${note.follow_up_resolved_at_iso?` • resolved ${esc(fmtShort(note.follow_up_resolved_at_iso))}`:''}</div>${note.follow_up_status==='open'&&noteCanEdit(note)?`<div class="toolbar" style="justify-content:flex-end;margin-top:8px"><button type="button" data-resolve="${esc(note.note_id)}">Resolve follow-up</button></div>`:''}</div>`:'';
    return `<article class="timelineItem"><div class="timelineTop"><div><strong>${esc(note.note_type)}</strong><div class="listMeta">${esc(fmtDateTime(note.meeting_at_iso))} • ${esc(note.counselor_name||note.counselor_email)}</div></div>${noteCanEdit(note)?`<button type="button" data-edit="${esc(note.note_id)}">Edit</button>`:''}</div>${tags?`<div class="tags">${tags}</div>`:''}${renderDetailPairs(note)}<div class="timelineText">${esc(note.note_text)}</div>${follow}${note.updated_at_iso&&note.updated_at_iso!==note.created_at_iso?`<div class="listMeta" style="margin-top:9px">Updated ${esc(fmtShort(note.updated_at_iso))}</div>`:''}</article>`;
  }).join(''):`<div class="emptyState">No ${esc(TEAM_CONFIG[activeTeam].label)} notes for this student yet.</div>`;
  $('studentTimeline').querySelectorAll('[data-edit]').forEach((btn)=>btn.addEventListener('click',()=>openEditNote(btn.dataset.edit)));
  $('studentTimeline').querySelectorAll('[data-resolve]').forEach((btn)=>btn.addEventListener('click',()=>resolveFollowup(btn.dataset.resolve,true)));
}
function closeStudent(){selectedStudent=null;studentBundle=null;$('studentView').hidden=true;$('dashboardView').hidden=false;const url=new URL(location.href);url.searchParams.delete('osis');url.searchParams.delete('name');history.replaceState(null,'',url.toString());}

function renderNoteFormForTeam(){
  if(!activeTeam)return;
  const cfg=TEAM_CONFIG[activeTeam];
  $('noteType').replaceChildren(...cfg.noteTypes.map((v)=>new Option(v,v)));
  $('tagChoices').innerHTML=cfg.tags.map((tag)=>`<label><input type="checkbox" value="${esc(tag)}" class="tagChoice"> ${esc(tag)}</label>`).join('');
  $('quickTemplates').innerHTML=cfg.templates.map((t,i)=>`<button type="button" data-template-index="${i}">${esc(t.label)}</button>`).join('');
  $('quickTemplates').querySelectorAll('[data-template-index]').forEach((btn)=>btn.addEventListener('click',()=>applyTemplate(Number(btn.dataset.templateIndex))));
  $('noteTeamMeta').textContent=cfg.label;
  renderTeamDetails({});
}
function renderTeamDetails(details={}){
  const d=details||{};
  if(activeTeam==='college'){
    $('teamDetails').innerHTML=`<h3>College counseling details</h3><div class="teamDetailsGrid"><label>Postsecondary plan<select id="detailPostsecondary"><option value="">—</option>${['4-year college','2-year college','Trade / career program','Military','Workforce','Undecided'].map(v=>`<option${d.postsecondary_plan===v?' selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Milestone<select id="detailMilestone"><option value="">—</option>${['Exploring','Application Planning','Application Submitted','FAFSA / Financial Aid','Scholarship','Recommendation','Transcript','Essay','College Visit / Fair','Decision / Deposit'].map(v=>`<option${d.milestone===v?' selected':''}>${esc(v)}</option>`).join('')}</select></label><label>School / program<input id="detailSchoolProgram" maxlength="240" value="${esc(d.school_program||'')}" placeholder="Optional"></label><label>Next deadline<input id="detailNextDeadline" type="date" value="${esc(d.next_deadline||'')}"></label></div>`;
  }else if(activeTeam==='academic'){
    $('teamDetails').innerHTML=`<h3>Academic counseling details</h3><div class="teamDetailsGrid"><label>Academic focus<select id="detailAcademicFocus"><option value="">—</option>${['Course Performance','Credits','Regents','Graduation Requirements','Attendance Impact','Schedule / Course Placement','Tutoring / Support','Academic Goal','Teacher Follow-up'].map(v=>`<option${d.academic_focus===v?' selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Intervention / support<input id="detailIntervention" maxlength="600" value="${esc(d.intervention||'')}" placeholder="Optional"></label><label class="wide">Next action<input id="detailNextAction" maxlength="600" value="${esc(d.next_action||'')}" placeholder="Optional"></label></div>`;
  }else{
    $('teamDetails').innerHTML=`<h3>Social Work details</h3><div class="muted small" style="margin-bottom:8px">Use school-support language here; this is not a diagnosis or clinical record.</div><div class="teamDetailsGrid"><label>School support focus<select id="detailSupportFocus"><option value="">—</option>${['Student Check-in','Attendance / Barrier','Peer Conflict','Family Concern','Social-Emotional','Referral','External Service Coordination','Crisis / Urgent Concern'].map(v=>`<option${d.support_focus===v?' selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Coordination<input id="detailCoordination" maxlength="600" value="${esc(d.coordination||'')}" placeholder="Optional"></label><label class="wide">Next action<input id="detailNextAction" maxlength="600" value="${esc(d.next_action||'')}" placeholder="Optional"></label></div>`;
  }
}
function collectDetails(){
  if(activeTeam==='college')return{postsecondary_plan:$('detailPostsecondary')?.value||'',milestone:$('detailMilestone')?.value||'',school_program:$('detailSchoolProgram')?.value.trim()||'',next_deadline:$('detailNextDeadline')?.value||''};
  if(activeTeam==='academic')return{academic_focus:$('detailAcademicFocus')?.value||'',intervention:$('detailIntervention')?.value.trim()||'',next_action:$('detailNextAction')?.value.trim()||''};
  return{support_focus:$('detailSupportFocus')?.value||'',coordination:$('detailCoordination')?.value.trim()||'',next_action:$('detailNextAction')?.value.trim()||''};
}
function applyTemplate(index){
  const t=TEAM_CONFIG[activeTeam]?.templates?.[index];if(!t)return;
  $('noteType').value=t.type;setTagChoices(t.tags||[]);
  if(t.details)renderTeamDetails({...collectDetails(),...t.details});
}

function openNewNote(){
  if(!selectedStudent||isReadOnly())return;editingNote=null;renderNoteFormForTeam();$('noteModalTitle').textContent='Add counseling note';$('noteStudentMeta').textContent=`${selectedStudent.name||selectedStudent.student_number} • OSIS ${selectedStudent.student_number}`;$('noteMeetingAt').value=localDateTimeValue();$('noteType').value=TEAM_CONFIG[activeTeam].noteTypes[0];setTagChoices([]);renderTeamDetails({});$('noteText').value='';$('followupNeeded').checked=false;$('followupDueWrap').hidden=true;$('followupDueDate').value=addDaysLocal(7);$('editReasonWrap').hidden=true;$('editReason').value='';$('noteModalStatus').textContent='';$('noteModal').hidden=false;$('noteText').focus();
}
function openEditNote(noteId){
  const note=(studentBundle?.notes||[]).find((row)=>row.note_id===noteId);if(!note||!noteCanEdit(note))return;editingNote=note;renderNoteFormForTeam();if(note.note_type&&![...$('noteType').options].some((o)=>o.value===note.note_type))$('noteType').appendChild(new Option(`${note.note_type} (legacy)`,note.note_type));$('noteModalTitle').textContent='Edit counseling note';$('noteStudentMeta').textContent=`${note.student_name||note.student_number} • ${note.counselor_name||note.counselor_email}`;$('noteMeetingAt').value=localDateTimeValue(note.meeting_at_iso);$('noteType').value=note.note_type||TEAM_CONFIG[activeTeam].noteTypes[0];setTagChoices(note.tags||[]);renderTeamDetails(note.details||{});$('noteText').value=note.note_text||'';$('followupNeeded').checked=note.follow_up_needed===true;$('followupDueWrap').hidden=!note.follow_up_needed;$('followupDueDate').value=note.follow_up_due_date||addDaysLocal(7);$('editReasonWrap').hidden=false;$('editReason').value='';$('noteModalStatus').textContent='';$('noteModal').hidden=false;
}
async function saveNote(){
  if(!selectedStudent||isReadOnly()||!activeTeam)return;
  const meetingValue=$('noteMeetingAt').value,meetingDate=new Date(meetingValue);if(!meetingValue||!Number.isFinite(meetingDate.getTime())){$('noteModalStatus').textContent='Choose a valid meeting date/time.';return;}
  const follow=$('followupNeeded').checked,payload={team:activeTeam,student_number:selectedStudent.student_number,meeting_at_iso:meetingDate.toISOString(),note_type:$('noteType').value,tags:noteTags(),details:collectDetails(),note_text:$('noteText').value.trim(),follow_up_needed:follow,follow_up_due_date:follow?$('followupDueDate').value:'',edit_reason:$('editReason').value.trim()};
  if(!payload.note_text){$('noteModalStatus').textContent='Enter a note.';return;}if(follow&&!payload.follow_up_due_date){$('noteModalStatus').textContent='Choose a follow-up due date.';return;}if(editingNote)payload.note_id=editingNote.note_id;
  $('saveNoteBtn').disabled=true;$('noteModalStatus').textContent=editingNote?'Saving changes…':'Saving note…';
  try{await api(editingNote?'/admin/counselor/note/update':'/admin/counselor/note/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});$('noteModal').hidden=true;await openStudent(selectedStudent);await loadDashboard();setStatus(editingNote?'Counseling note updated. Edit retained in audit history.':'Counseling note saved.','good');editingNote=null;}catch(e){$('noteModalStatus').textContent=`Could not save note: ${e.message}`;}finally{$('saveNoteBtn').disabled=false;}
}
async function resolveFollowup(noteId,resolved=true){
  if(isReadOnly()||!activeTeam)return;if(resolved&&!confirm('Mark this counseling follow-up resolved?'))return;
  try{await api('/admin/counselor/followup/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({team:activeTeam,note_id:noteId,resolved})});if(selectedStudent)await openStudent(selectedStudent);await loadDashboard();setStatus('Follow-up updated.','good');}catch(e){setStatus(`Could not update follow-up: ${e.message}`,'error');}
}
function openStudentLookup(){if(!selectedStudent)return;const url=new URL('./student_view.html',location.href);url.searchParams.set('osis',selectedStudent.student_number);if(selectedStudent.name)url.searchParams.set('name',selectedStudent.name);location.href=url.toString();}

async function openAccess(){
  if(!canManage())return;$('accessModal').hidden=false;$('accessStatus').textContent='Loading team access…';$('accessSearch').value='';
  try{
    const [staffData,accessData,legacyData]=await Promise.all([api('/admin/counselor/staff_options'),api('/admin/counselor_team_access'),api('/admin/counselor/legacy_unassigned')]);
    accessStaff=Array.isArray(staffData.rows)?staffData.rows:[];
    teamAccess={
      college:new Set((accessData.teams?.college||[]).map(v=>String(v).toLowerCase())),
      social_work:new Set((accessData.teams?.social_work||[]).map(v=>String(v).toLowerCase())),
      academic:new Set((accessData.teams?.academic||[]).map(v=>String(v).toLowerCase()))
    };
    legacyGeneric=Array.isArray(accessData.legacy_generic)?accessData.legacy_generic:[];
    legacyNotes=Array.isArray(legacyData.rows)?legacyData.rows:[];
    renderAccessStaff();renderLegacyNotes();renderLegacyAccessNotice();$('accessStatus').textContent='';
  }catch(e){$('accessStatus').textContent=`Could not load access settings: ${e.message}`;}
}
function filteredAccessStaff(){const q=String($('accessSearch').value||'').trim().toLowerCase();if(!q)return accessStaff;return accessStaff.filter((row)=>[row.name,row.email,row.department,row.grade_team,row.status].join(' ').toLowerCase().includes(q));}
function renderAccessStaff(){
  const rows=filteredAccessStaff();$('collegeCount').textContent=teamAccess.college.size;$('socialWorkCount').textContent=teamAccess.social_work.size;$('academicCount').textContent=teamAccess.academic.size;
  $('accessStaffList').innerHTML=`<div class="accessHeader"><span>Staff member</span><span>College</span><span>Social Work</span><span>Academic</span></div>`+(rows.length?rows.map((row)=>{
    const email=String(row.email||'').toLowerCase();
    return `<div class="accessRow"><div class="accessIdentity"><span class="accessName">${esc(row.name||row.email)}</span><span class="accessMeta">${esc(row.email)}${row.department?` • ${esc(row.department)}`:''}${row.grade_team?` • Grade team ${esc(row.grade_team)}`:''}</span></div>${['college','social_work','academic'].map(team=>`<label class="teamCheck"><input type="checkbox" data-team="${team}" data-access-email="${esc(email)}" ${teamAccess[team].has(email)?'checked':''}> ${esc(TEAM_CONFIG[team].label.replace(' Counseling',''))}</label>`).join('')}</div>`;
  }).join(''):'<div class="emptyState">No staff match this search.</div>');
  $('accessStaffList').querySelectorAll('[data-team][data-access-email]').forEach((input)=>input.addEventListener('change',()=>{const team=input.dataset.team,email=String(input.dataset.accessEmail||'').toLowerCase();if(input.checked)teamAccess[team].add(email);else teamAccess[team].delete(email);renderAccessStaff();}));
}
function renderLegacyAccessNotice(){
  if(!legacyGeneric.length){$('legacyAccessNotice').hidden=true;return;}
  $('legacyAccessNotice').hidden=false;$('legacyAccessNotice').innerHTML=`<strong>${legacyGeneric.length} account${legacyGeneric.length===1?'':'s'} had the old generic Counselor Notes access.</strong><div class="small" style="margin-top:5px">Generic access no longer grants note visibility. Assign each person to College Counseling, Social Work, Academic Counseling, or more than one team using the checkboxes below.</div><div class="small muted" style="margin-top:5px">${legacyGeneric.map(esc).join(' • ')}</div>`;
}
function renderLegacyNotes(){
  const section=$('legacyNotesSection');section.hidden=!legacyNotes.length;if(!legacyNotes.length)return;
  $('legacyNotesList').innerHTML=legacyNotes.map((note)=>`<article class="listItem"><div class="legacyAssign"><div><strong>${esc(note.student_name||note.student_number)}</strong><div class="listMeta">${esc(note.note_type)} • ${esc(fmtShort(note.meeting_at_iso))} • ${esc(note.counselor_name||note.counselor_email)}</div><div class="listBody">${esc(note.note_text)}</div></div><select data-legacy-team="${esc(note.note_id)}"><option value="">Choose category…</option><option value="college">College Counseling</option><option value="social_work">Social Work</option><option value="academic">Academic Counseling</option></select><button type="button" data-legacy-assign="${esc(note.note_id)}">Assign</button></div></article>`).join('');
  $('legacyNotesList').querySelectorAll('[data-legacy-assign]').forEach((btn)=>btn.addEventListener('click',()=>assignLegacy(btn.dataset.legacyAssign)));
}
async function assignLegacy(noteId){
  const select=document.querySelector(`[data-legacy-team="${CSS.escape(noteId)}"]`),team=select?.value||'';if(!team){$('accessStatus').textContent='Choose a counselor category first.';return;}
  try{await api('/admin/counselor/legacy_assign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({note_id:noteId,team})});legacyNotes=legacyNotes.filter((n)=>n.note_id!==noteId);renderLegacyNotes();$('accessStatus').textContent=`Legacy note assigned to ${TEAM_CONFIG[team].label}.`;}catch(e){$('accessStatus').textContent=`Could not assign legacy note: ${e.message}`;}
}
async function saveAccess(){
  $('saveAccessBtn').disabled=true;$('accessStatus').textContent='Saving team access…';
  try{
    const payload={teams:{college:Array.from(teamAccess.college),social_work:Array.from(teamAccess.social_work),academic:Array.from(teamAccess.academic)}};
    const data=await api('/admin/counselor_team_access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    teamAccess={college:new Set(data.teams?.college||[]),social_work:new Set(data.teams?.social_work||[]),academic:new Set(data.teams?.academic||[])};
    renderAccessStaff();$('accessStatus').textContent='Counselor team access saved. Staff will see only the categories they are assigned to.';
  }catch(e){$('accessStatus').textContent=`Could not save team access: ${e.message}`;}finally{$('saveAccessBtn').disabled=false;}
}

async function boot(){
  access=await getAccess();
  if(!access){
    $('loginOut').textContent='Please sign in.';const g=await waitForGoogle();g.initialize({client_id:GOOGLE_CLIENT_ID,ux_mode:'popup',callback:async(r)=>{try{$('loginOut').textContent='Signing in…';await doLogin(r.credential);location.reload();}catch(e){$('loginOut').textContent=`Login failed: ${e.message}`;}}});g.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return;
  }
  if(access?.can?.counselor_dashboard!==true||!availableTeams().length){$('loginOut').textContent='Your account is not assigned to a Counselor Dashboard category.';return;}

  $('loginCard').hidden=true;$('app').hidden=false;buildTeamSelector();renderNoteFormForTeam();
  $('viewerMeta').textContent=`${access.email||'Staff'} • ${availableTeams().map(t=>TEAM_CONFIG[t].label).join(' + ')}${isReadOnly()?' • read-only preview':''}`;$('accessBtn').hidden=!canManage();if(isReadOnly())$('newNoteBtn').disabled=true;

  $('teamSelect').addEventListener('change',()=>setActiveTeam($('teamSelect').value));
  $('scopeSelect').addEventListener('change',loadDashboard);
  $('studentSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchStudents($('studentSearch').value),180);});
  document.addEventListener('click',(e)=>{if(!e.target.closest('.searchWrap'))$('studentSearchMenu').hidden=true;});
  $('refreshBtn').addEventListener('click',async()=>{if(selectedStudent)await openStudent(selectedStudent);await loadDashboard();});
  $('backToDashboard').addEventListener('click',closeStudent);$('newNoteBtn').addEventListener('click',openNewNote);$('openStudentLookup').addEventListener('click',openStudentLookup);
  $('closeNoteModal').addEventListener('click',()=>{$('noteModal').hidden=true;editingNote=null;});$('noteModal').addEventListener('click',(e)=>{if(e.target.id==='noteModal'){$('noteModal').hidden=true;editingNote=null;}});
  $('followupNeeded').addEventListener('change',()=>{$('followupDueWrap').hidden=!$('followupNeeded').checked;if($('followupNeeded').checked&&!$('followupDueDate').value)$('followupDueDate').value=addDaysLocal(7);});$('saveNoteBtn').addEventListener('click',saveNote);
  $('accessBtn').addEventListener('click',openAccess);$('closeAccessModal').addEventListener('click',()=>{$('accessModal').hidden=true;});$('accessModal').addEventListener('click',(e)=>{if(e.target.id==='accessModal')e.currentTarget.hidden=true;});$('accessSearch').addEventListener('input',renderAccessStaff);$('saveAccessBtn').addEventListener('click',saveAccess);

  await loadDashboard();
  const url=new URL(location.href),osis=String(url.searchParams.get('osis')||'').trim();if(osis)await openStudent({student_number:osis,name:String(url.searchParams.get('name')||'')});
}
boot().catch((e)=>{$('loginOut').textContent=String(e?.message||e);setStatus(String(e?.message||e),'error');});

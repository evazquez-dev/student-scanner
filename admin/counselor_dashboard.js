/* EAGLENEST_COUNSELOR_DASHBOARD_V1 */
function meta(name){return document.querySelector(`meta[name="${name}"]`)?.content||'';}
const API_BASE=(meta('api-base')||'').replace(/\/*$/,'')+'/';
const GOOGLE_CLIENT_ID=meta('google-client-id')||'';
const ADMIN_SESSION_KEY='ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY='teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER='x-admin-session';
const $=(id)=>document.getElementById(id);

let access=null;
let dashboard=null;
let selectedStudent=null;
let studentBundle=null;
let editingNote=null;
let searchTimer=null;
let accessStaff=[];
let allowedEmails=new Set();

function esc(v){return String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function canManage(){return access?.can?.counselor_notes_manage===true;}
function isReadOnly(){return access?.view_as?.active===true||access?.view_as?.read_only===true;}
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
function noteCanEdit(note){return !!note&&!isReadOnly()&&(canManage()||String(note.counselor_email||'').toLowerCase()===String(access?.email||'').toLowerCase());}

async function waitForGoogle(timeoutMs=8000){const start=Date.now();while(!window.google?.accounts?.id){if(Date.now()-start>timeoutMs)throw new Error('Google sign-in failed to load');await new Promise(r=>setTimeout(r,50));}return google.accounts.id;}
async function getAccess(){const r=await adminFetch('/admin/access');if(!r.ok)return null;const j=await r.json().catch(()=>null);return j?.ok?j:null;}
async function doLogin(token){const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:token}).toString()});const j=await r.json().catch(()=>({}));if(j?.sid)setSid(j.sid);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);}

async function searchStudents(raw){
  const q=String(raw||'').trim();
  const menu=$('studentSearchMenu');
  if(q.length<2){menu.hidden=true;menu.replaceChildren();return;}
  try{
    const data=await api(`/admin/roster/search?q=${encodeURIComponent(q)}`);
    const rows=Array.isArray(data.results)?data.results:[];
    menu.innerHTML=rows.length?rows.map((row)=>`<button type="button" data-osis="${esc(row.osis)}" data-name="${esc(row.name||'')}"><strong>${esc(row.name||row.osis)}</strong><div class="muted small">OSIS ${esc(row.osis||'')}${row.email?` • ${esc(row.email)}`:''}</div></button>`).join(''):'<div class="emptyState">No matches.</div>';
    menu.hidden=false;
    menu.querySelectorAll('[data-osis]').forEach((btn)=>btn.addEventListener('click',()=>openStudent({student_number:btn.dataset.osis,name:btn.dataset.name})));
  }catch(e){
    menu.innerHTML=`<div class="emptyState">Search failed: ${esc(e.message)}</div>`;
    menu.hidden=false;
  }
}

function scopeValue(){return canManage()?String($('scopeSelect').value||'my'):'my';}
async function loadDashboard(){
  setStatus('Loading counselor dashboard…');
  try{
    dashboard=await api(`/admin/counselor/dashboard?scope=${encodeURIComponent(scopeValue())}`);
    renderDashboard();
    setStatus('');
  }catch(e){
    setStatus(`Could not load counselor dashboard: ${e.message}`,'error');
  }
}

function renderDashboard(){
  const s=dashboard?.summary||{};
  $('kpiNotes7d').textContent=s.notes_7d??0;
  $('kpiStudents30d').textContent=s.students_30d??0;
  $('kpiOpenFollowups').textContent=s.open_followups??0;
  $('kpiOverdue').textContent=s.overdue_followups??0;

  const today=String(dashboard?.today||todayLocal());
  const followups=Array.isArray(dashboard?.followups)?dashboard.followups:[];
  $('followupList').innerHTML=followups.length?followups.map((note)=>{
    const overdue=note.follow_up_due_date&&note.follow_up_due_date<today;
    return `<article class="listItem ${overdue?'overdue':''}">
      <div class="timelineTop">
        <div><button class="linkBtn" type="button" data-open-student="${esc(note.student_number)}" data-student-name="${esc(note.student_name||'')}"><strong>${esc(note.student_name||note.student_number)}</strong></button><div class="listMeta">${esc(note.note_type)} • ${esc(fmtShort(note.meeting_at_iso))}</div></div>
        <span class="pill ${overdue?'danger':'warn'}">${overdue?'Overdue ':''}${esc(fmtDateKey(note.follow_up_due_date))}</span>
      </div>
      <div class="listBody">${esc(note.note_text)}</div>
      <div class="listMeta">Counselor: ${esc(note.counselor_name||note.counselor_email)}</div>
      ${noteCanEdit(note)?`<div class="toolbar" style="justify-content:flex-end;margin-top:8px"><button type="button" data-resolve-followup="${esc(note.note_id)}">Resolve follow-up</button></div>`:''}
    </article>`;
  }).join(''):'<div class="emptyState">No open follow-ups.</div>';

  $('followupList').querySelectorAll('[data-open-student]').forEach((btn)=>btn.addEventListener('click',()=>openStudent({student_number:btn.dataset.openStudent,name:btn.dataset.studentName})));
  $('followupList').querySelectorAll('[data-resolve-followup]').forEach((btn)=>btn.addEventListener('click',()=>resolveFollowup(btn.dataset.resolveFollowup,true)));

  const recent=Array.isArray(dashboard?.recent_students)?dashboard.recent_students:[];
  $('recentStudents').innerHTML=recent.length?recent.map((row)=>`<article class="listItem">
    <button class="linkBtn" type="button" data-recent-osis="${esc(row.student_number)}" data-recent-name="${esc(row.student_name||'')}"><strong>${esc(row.student_name||row.student_number)}</strong></button>
    <div class="listMeta">Grade ${esc(row.student_grade||'—')} • ${row.note_count} note${Number(row.note_count)===1?'':'s'}</div>
    <div class="listMeta">Last meeting ${esc(fmtShort(row.latest_meeting_at_iso))}</div>
  </article>`).join(''):'<div class="emptyState">No recent students yet.</div>';
  $('recentStudents').querySelectorAll('[data-recent-osis]').forEach((btn)=>btn.addEventListener('click',()=>openStudent({student_number:btn.dataset.recentOsis,name:btn.dataset.recentName})));
}

async function openStudent(student){
  const osis=String(student?.student_number||student?.osis||'').trim();
  if(!osis)return;
  selectedStudent={student_number:osis,name:String(student?.name||'')};
  $('studentSearchMenu').hidden=true;
  $('studentSearch').value=selectedStudent.name||osis;
  $('dashboardView').hidden=true;
  $('studentView').hidden=false;
  $('studentName').textContent=selectedStudent.name||'Loading student…';
  $('studentMeta').textContent=`OSIS ${osis}`;
  $('studentTimeline').innerHTML='<div class="emptyState">Loading notes…</div>';
  setStatus('Loading student counseling timeline…');
  const url=new URL(location.href);url.searchParams.set('osis',osis);if(selectedStudent.name)url.searchParams.set('name',selectedStudent.name);history.replaceState(null,'',url.toString());
  try{
    studentBundle=await api(`/admin/counselor/student?student_number=${encodeURIComponent(osis)}`);
    selectedStudent={student_number:studentBundle.student.student_number,name:studentBundle.student.name,grade:studentBundle.student.grade,email:studentBundle.student.email};
    renderStudent();
    setStatus('');
  }catch(e){
    $('studentTimeline').innerHTML=`<div class="emptyState">Could not load notes: ${esc(e.message)}</div>`;
    setStatus(`Could not load student: ${e.message}`,'error');
  }
}

function renderStudent(){
  const student=studentBundle?.student||selectedStudent||{};
  const summary=studentBundle?.summary||{};
  $('studentName').textContent=student.name||student.student_number||'Student';
  $('studentMeta').textContent=[`OSIS ${student.student_number||''}`,student.grade?`Grade ${student.grade}`:'',student.email||''].filter(Boolean).join(' • ');
  $('studentNoteCount').textContent=summary.note_count??0;
  $('studentCounselorCount').textContent=summary.counselor_count??0;
  $('studentFollowupCount').textContent=summary.open_followups??0;
  $('studentLastMeeting').textContent=summary.last_meeting_at_iso?fmtShort(summary.last_meeting_at_iso):'—';
  $('newNoteBtn').disabled=isReadOnly();

  const notes=Array.isArray(studentBundle?.notes)?studentBundle.notes:[];
  $('studentTimeline').innerHTML=notes.length?notes.map((note)=>{
    const tags=(Array.isArray(note.tags)?note.tags:[]).map((tag)=>`<span class="pill">${esc(tag)}</span>`).join('');
    const follow=note.follow_up_needed?`<div class="followupBox">
      <div class="timelineTop"><strong>Follow-up</strong><span class="pill ${note.follow_up_status==='resolved'?'good':'warn'}">${esc(note.follow_up_status==='resolved'?'Resolved':'Open')}</span></div>
      <div class="listMeta">${note.follow_up_due_date?`Due ${esc(fmtDateKey(note.follow_up_due_date))}`:'No due date'}${note.follow_up_resolved_at_iso?` • resolved ${esc(fmtShort(note.follow_up_resolved_at_iso))}`:''}</div>
      ${note.follow_up_status==='open'&&noteCanEdit(note)?`<div class="toolbar" style="justify-content:flex-end;margin-top:8px"><button type="button" data-resolve="${esc(note.note_id)}">Resolve follow-up</button></div>`:''}
    </div>`:'';
    return `<article class="timelineItem">
      <div class="timelineTop">
        <div><strong>${esc(note.note_type)}</strong><div class="listMeta">${esc(fmtDateTime(note.meeting_at_iso))} • ${esc(note.counselor_name||note.counselor_email)}</div></div>
        ${noteCanEdit(note)?`<button type="button" data-edit="${esc(note.note_id)}">Edit</button>`:''}
      </div>
      ${tags?`<div class="tags">${tags}</div>`:''}
      <div class="timelineText">${esc(note.note_text)}</div>
      ${follow}
      ${note.updated_at_iso&&note.updated_at_iso!==note.created_at_iso?`<div class="listMeta" style="margin-top:9px">Updated ${esc(fmtShort(note.updated_at_iso))}</div>`:''}
    </article>`;
  }).join(''):'<div class="emptyState">No counseling notes for this student yet. Add the first note when you meet with them.</div>';

  $('studentTimeline').querySelectorAll('[data-edit]').forEach((btn)=>btn.addEventListener('click',()=>openEditNote(btn.dataset.edit)));
  $('studentTimeline').querySelectorAll('[data-resolve]').forEach((btn)=>btn.addEventListener('click',()=>resolveFollowup(btn.dataset.resolve,true)));
}

function closeStudent(){
  selectedStudent=null;studentBundle=null;
  $('studentView').hidden=true;$('dashboardView').hidden=false;
  const url=new URL(location.href);url.searchParams.delete('osis');url.searchParams.delete('name');history.replaceState(null,'',url.toString());
}

function openNewNote(){
  if(!selectedStudent||isReadOnly())return;
  editingNote=null;
  $('noteModalTitle').textContent='Add counseling note';
  $('noteStudentMeta').textContent=`${selectedStudent.name||selectedStudent.student_number} • OSIS ${selectedStudent.student_number}`;
  $('noteMeetingAt').value=localDateTimeValue();
  $('noteType').value='Check-in';
  setTagChoices([]);
  $('noteText').value='';
  $('followupNeeded').checked=false;
  $('followupDueWrap').hidden=true;
  $('followupDueDate').value=addDaysLocal(7);
  $('editReasonWrap').hidden=true;
  $('editReason').value='';
  $('noteModalStatus').textContent='';
  $('noteModal').hidden=false;
  $('noteText').focus();
}

function openEditNote(noteId){
  const note=(studentBundle?.notes||[]).find((row)=>row.note_id===noteId);
  if(!note||!noteCanEdit(note))return;
  editingNote=note;
  $('noteModalTitle').textContent='Edit counseling note';
  $('noteStudentMeta').textContent=`${note.student_name||note.student_number} • ${note.counselor_name||note.counselor_email}`;
  $('noteMeetingAt').value=localDateTimeValue(note.meeting_at_iso);
  $('noteType').value=note.note_type||'Other';
  setTagChoices(note.tags||[]);
  $('noteText').value=note.note_text||'';
  $('followupNeeded').checked=note.follow_up_needed===true;
  $('followupDueWrap').hidden=!note.follow_up_needed;
  $('followupDueDate').value=note.follow_up_due_date||addDaysLocal(7);
  $('editReasonWrap').hidden=false;
  $('editReason').value='';
  $('noteModalStatus').textContent='';
  $('noteModal').hidden=false;
}

async function saveNote(){
  if(!selectedStudent||isReadOnly())return;
  const meetingValue=$('noteMeetingAt').value;
  const meetingDate=new Date(meetingValue);
  if(!meetingValue||!Number.isFinite(meetingDate.getTime())){$('noteModalStatus').textContent='Choose a valid meeting date/time.';return;}
  const follow=$('followupNeeded').checked;
  const payload={
    student_number:selectedStudent.student_number,
    meeting_at_iso:meetingDate.toISOString(),
    note_type:$('noteType').value,
    tags:noteTags(),
    note_text:$('noteText').value.trim(),
    follow_up_needed:follow,
    follow_up_due_date:follow?$('followupDueDate').value:'',
    edit_reason:$('editReason').value.trim()
  };
  if(!payload.note_text){$('noteModalStatus').textContent='Enter a note.';return;}
  if(follow&&!payload.follow_up_due_date){$('noteModalStatus').textContent='Choose a follow-up due date.';return;}
  if(editingNote)payload.note_id=editingNote.note_id;

  $('saveNoteBtn').disabled=true;$('noteModalStatus').textContent=editingNote?'Saving changes…':'Saving note…';
  try{
    await api(editingNote?'/admin/counselor/note/update':'/admin/counselor/note/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    $('noteModal').hidden=true;
    await openStudent(selectedStudent);
    await loadDashboard();
    setStatus(editingNote?'Counseling note updated. Edit retained in audit history.':'Counseling note saved.','good');
    editingNote=null;
  }catch(e){
    $('noteModalStatus').textContent=`Could not save note: ${e.message}`;
  }finally{$('saveNoteBtn').disabled=false;}
}

async function resolveFollowup(noteId,resolved=true){
  if(isReadOnly())return;
  if(resolved&&!confirm('Mark this counseling follow-up resolved?'))return;
  try{
    await api('/admin/counselor/followup/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({note_id:noteId,resolved})});
    if(selectedStudent)await openStudent(selectedStudent);
    await loadDashboard();
    setStatus('Follow-up updated.','good');
  }catch(e){setStatus(`Could not update follow-up: ${e.message}`,'error');}
}

function openStudentLookup(){
  if(!selectedStudent)return;
  const url=new URL('./student_view.html',location.href);
  url.searchParams.set('osis',selectedStudent.student_number);
  if(selectedStudent.name)url.searchParams.set('name',selectedStudent.name);
  location.href=url.toString();
}

async function openAccess(){
  if(!canManage())return;
  $('accessModal').hidden=false;$('accessStatus').textContent='Loading access…';$('accessSearch').value='';
  try{
    const [staffData,allowData]=await Promise.all([
      api('/admin/counselor/staff_options'),
      api('/admin/counselor_notes_allowlist')
    ]);
    accessStaff=Array.isArray(staffData.rows)?staffData.rows:[];
    allowedEmails=new Set((Array.isArray(allowData.emails)?allowData.emails:[]).map((x)=>String(x||'').toLowerCase()));
    renderAccessStaff();
    $('accessStatus').textContent='';
  }catch(e){$('accessStatus').textContent=`Could not load access settings: ${e.message}`;}
}

function filteredAccessStaff(){
  const q=String($('accessSearch').value||'').trim().toLowerCase();
  if(!q)return accessStaff;
  return accessStaff.filter((row)=>[row.name,row.email,row.department,row.grade_team,row.status].join(' ').toLowerCase().includes(q));
}
function renderAccessStaff(){
  const rows=filteredAccessStaff();$('accessCount').textContent=`${allowedEmails.size} selected`;
  $('accessStaffList').innerHTML=rows.length?rows.map((row)=>`<label class="accessRow ${allowedEmails.has(String(row.email).toLowerCase())?'selected':''}">
    <input type="checkbox" data-access-email="${esc(row.email)}" ${allowedEmails.has(String(row.email).toLowerCase())?'checked':''}>
    <span><span class="accessName">${esc(row.name||row.email)}</span><span class="accessMeta">${esc(row.email)}${row.department?` • ${esc(row.department)}`:''}${row.grade_team?` • Grade team ${esc(row.grade_team)}`:''}</span></span>
  </label>`).join(''):'<div class="emptyState">No staff match this search.</div>';
  $('accessStaffList').querySelectorAll('[data-access-email]').forEach((input)=>input.addEventListener('change',()=>{
    const email=String(input.dataset.accessEmail||'').toLowerCase();
    if(input.checked)allowedEmails.add(email);else allowedEmails.delete(email);renderAccessStaff();
  }));
}
function selectVisibleAccess(){for(const row of filteredAccessStaff())allowedEmails.add(String(row.email||'').toLowerCase());renderAccessStaff();}
function clearAccess(){allowedEmails.clear();renderAccessStaff();}
async function saveAccess(){
  $('saveAccessBtn').disabled=true;$('accessStatus').textContent='Saving access…';
  try{
    const data=await api('/admin/counselor_notes_allowlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({emails:Array.from(allowedEmails)})});
    allowedEmails=new Set((data.emails||[]).map((x)=>String(x).toLowerCase()));
    renderAccessStaff();$('accessStatus').textContent=`Saved ${data.count||0} counselor access account(s).`;
  }catch(e){$('accessStatus').textContent=`Could not save access: ${e.message}`;}
  finally{$('saveAccessBtn').disabled=false;}
}

async function boot(){
  access=await getAccess();
  if(!access){
    $('loginOut').textContent='Please sign in.';
    const g=await waitForGoogle();
    g.initialize({client_id:GOOGLE_CLIENT_ID,ux_mode:'popup',callback:async(r)=>{try{$('loginOut').textContent='Signing in…';await doLogin(r.credential);location.reload();}catch(e){$('loginOut').textContent=`Login failed: ${e.message}`;}}});
    g.renderButton($('g_id_signin'),{theme:'outline',size:'large'});
    return;
  }
  if(access?.can?.counselor_notes!==true){
    $('loginOut').textContent='Your account does not have Counselor Notes access.';
    return;
  }

  $('loginCard').hidden=true;$('app').hidden=false;
  $('viewerMeta').textContent=`${access.email||'Staff'} • restricted counseling-team workspace${isReadOnly()?' • read-only preview':''}`;
  $('accessBtn').hidden=!canManage();$('scopeLabel').hidden=!canManage();
  if(isReadOnly())$('newNoteBtn').disabled=true;

  $('studentSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchStudents($('studentSearch').value),180);});
  document.addEventListener('click',(e)=>{if(!e.target.closest('.searchWrap'))$('studentSearchMenu').hidden=true;});
  $('refreshBtn').addEventListener('click',async()=>{if(selectedStudent)await openStudent(selectedStudent);await loadDashboard();});
  $('scopeSelect').addEventListener('change',loadDashboard);
  $('backToDashboard').addEventListener('click',closeStudent);
  $('newNoteBtn').addEventListener('click',openNewNote);
  $('openStudentLookup').addEventListener('click',openStudentLookup);
  $('closeNoteModal').addEventListener('click',()=>{$('noteModal').hidden=true;editingNote=null;});
  $('noteModal').addEventListener('click',(e)=>{if(e.target.id==='noteModal'){$('noteModal').hidden=true;editingNote=null;}});
  $('followupNeeded').addEventListener('change',()=>{$('followupDueWrap').hidden=!$('followupNeeded').checked;if($('followupNeeded').checked&&!$('followupDueDate').value)$('followupDueDate').value=addDaysLocal(7);});
  $('saveNoteBtn').addEventListener('click',saveNote);
  $('accessBtn').addEventListener('click',openAccess);
  $('closeAccessModal').addEventListener('click',()=>{$('accessModal').hidden=true;});
  $('accessModal').addEventListener('click',(e)=>{if(e.target.id==='accessModal')e.currentTarget.hidden=true;});
  $('accessSearch').addEventListener('input',renderAccessStaff);
  $('selectVisibleAccess').addEventListener('click',selectVisibleAccess);
  $('clearAccess').addEventListener('click',clearAccess);
  $('saveAccessBtn').addEventListener('click',saveAccess);

  await loadDashboard();

  const url=new URL(location.href);
  const osis=String(url.searchParams.get('osis')||'').trim();
  if(osis)await openStudent({student_number:osis,name:String(url.searchParams.get('name')||'')});
}
boot().catch((e)=>{$('loginOut').textContent=String(e?.message||e);setStatus(String(e?.message||e),'error');});

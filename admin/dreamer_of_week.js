const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const SESSION_HEADER = 'x-admin-session';
const SESSION_KEY = 'dreamer_of_week_admin_session_v1';
const LEGACY_SESSION_KEYS = ['ss_admin_session_sid_v1','admin_session_v1','teacher_att_admin_session_v1'];

const loginCard = document.getElementById('loginCard');
const loginOut = document.getElementById('loginOut');
const appShell = document.getElementById('appShell');
const refreshBtn = document.getElementById('refreshBtn');
const pageStatus = document.getElementById('pageStatus');
const mappingProblem = document.getElementById('mappingProblem');
const mappingProblemText = document.getElementById('mappingProblemText');
const teacherArea = document.getElementById('teacherArea');
const teacherIdentity = document.getElementById('teacherIdentity');
const courseCards = document.getElementById('courseCards');
const managerArea = document.getElementById('managerArea');
const managerBands = document.getElementById('managerBands');
const exportAllDreamersBtn = document.getElementById('exportAllDreamersBtn');
const historyArea = document.getElementById('historyArea');
const historyBatches = document.getElementById('historyBatches');
const historyExpandAllBtn = document.getElementById('historyExpandAllBtn');
const historyCollapseAllBtn = document.getElementById('historyCollapseAllBtn');

let currentState = null;
let currentHistory = null;
const DOW_RECIPIENT_PENDING=new Set(); // EAGLENEST_DOW_RECIPIENT_FEEDBACK_V1
let eventsBound = false;

function show(el){ if(el){ el.classList.remove('hidden'); el.style.display=''; } }
function hide(el){ if(el){ el.classList.add('hidden'); el.style.display='none'; } }
function esc(value){ return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(value){
  if(!value) return '—';
  const d=new Date(value); if(!Number.isFinite(d.getTime())) return String(value);
  return d.toLocaleString([], {dateStyle:'medium', timeStyle:'short'});
}
function bandLabel(band){ return band === '9_10' ? 'Grades 9–10' : 'Grades 11–12'; }

function csvCell(value){
  let text=String(value ?? '');
  if(/^[=+\-@]/.test(text)) text=`'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
}

function downloadCsv(filename,rows){
  const headers=[
    ['osis','OSIS'],['first_name','First Name'],['last_name','Last Name'],['full_name','Full Name'],
    ['grade','Grade'],['student_email','Student Email'],['band_label','Grade Band'],['period','DOW Period'],
    ['cycle_id','Cycle ID'],['course_code','Course Code'],['course_name','Course Name'],['selected_by_name','Selected By Name'],['selected_by_email','Selected By Email'],
    ['selected_at_iso','Selected At'],['previous_awards','Previous DOW Awards'],['current_selections','Current DOW Selections']
  ];
  const lines=[headers.map(([,label])=>csvCell(label)).join(',')];
  for(const row of rows||[]) lines.push(headers.map(([key])=>csvCell(row?.[key] ?? '')).join(','));
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function exportBandCsv(band,data){
  const rows=Array.isArray(data?.export_rows)?data.export_rows:[];
  if(!rows.length){setStatus(`No current ${bandLabel(band)} Dreamers have been selected yet.`,'warn');return;}
  const date=new Date().toLocaleDateString('en-CA');
  const seq=Number(data?.cycle?.sequence||1);
  downloadCsv(`dreamers_of_week_${band}_period_${seq}_${date}.csv`,rows);
  setStatus(`Exported ${rows.length} ${bandLabel(band)} course-recipient row${rows.length===1?'':'s'}.`,'ok');
}

function exportAllCurrentCsv(){
  const bands=currentState?.manager?.bands||{};
  const rows=['9_10','11_12'].flatMap((band)=>Array.isArray(bands?.[band]?.export_rows)?bands[band].export_rows:[]);
  if(!rows.length){setStatus('No current Dreamers have been selected yet.','warn');return;}
  const date=new Date().toLocaleDateString('en-CA');
  downloadCsv(`dreamers_of_week_current_${date}.csv`,rows);
  setStatus(`Exported ${rows.length} current course-recipient row${rows.length===1?'':'s'}.`,'ok');
}

function getSid(){
  try{
    const own=String(sessionStorage.getItem(SESSION_KEY)||localStorage.getItem(SESSION_KEY)||'').trim();
    if(own) return own;
    for(const k of LEGACY_SESSION_KEYS){ const v=String(sessionStorage.getItem(k)||localStorage.getItem(k)||'').trim(); if(v) return v; }
  }catch{}
  return '';
}
function setSid(sid){
  const v=String(sid||'').trim(); if(!v) return;
  try{ sessionStorage.setItem(SESSION_KEY,v); localStorage.setItem(SESSION_KEY,v); }catch{}
}
function clearSid(){ try{ sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); }catch{} }
function stashSid(resp,data){
  try{ const sid=String(data?.sid||resp?.headers?.get(SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim(); if(sid) setSid(sid); }catch{}
}
async function adminFetch(path,init={}){
  const headers=new Headers(init.headers||{}); const sid=getSid(); if(sid&&!headers.has(SESSION_HEADER)) headers.set(SESSION_HEADER,sid);
  const resp=await fetch(new URL(path,API_BASE),{...init,headers,credentials:'include',cache:'no-store'});
  let cloneData=null; try{ cloneData=await resp.clone().json(); }catch{}
  stashSid(resp,cloneData);
  if(resp.status===401 && ['expired','no_session'].includes(String(cloneData?.error||''))) clearSid();
  return resp;
}
async function readJson(resp){
  const j=await resp.json().catch(()=>({}));
  if(!resp.ok||!j?.ok){ const e=new Error(j?.message||j?.error||`HTTP ${resp.status}`); e.data=j; e.status=resp.status; throw e; }
  return j;
}
function setStatus(text,kind='info'){ if(pageStatus){ pageStatus.className=`statusBanner ${kind}`; pageStatus.textContent=text; } }

async function waitForGoogle(timeoutMs=8000){
  const start=Date.now(); while(!window.google?.accounts?.id){ if(Date.now()-start>timeoutMs) throw new Error('Google Sign-In failed to load'); await new Promise(r=>setTimeout(r,50)); }
  return window.google.accounts.id;
}

window.addEventListener('DOMContentLoaded',async()=>{
  bindEvents();
  if(await bootstrapSession()) return;
  try{
    if(!GOOGLE_CLIENT_ID) throw new Error('Missing google-client-id meta.');
    const gsi=await waitForGoogle();
    gsi.initialize({client_id:GOOGLE_CLIENT_ID,callback:onGoogleCredential,ux_mode:'popup',use_fedcm_for_prompt:true});
    gsi.renderButton(document.getElementById('g_id_signin'),{theme:'outline',size:'large'});
    hide(appShell); show(loginCard); loginOut.textContent='Please sign in…';
  }catch(e){ hide(appShell); show(loginCard); loginOut.textContent=`Sign-in initialization failed: ${e?.message||e}`; }
});

async function bootstrapSession(){
  try{
    const r=await adminFetch('/admin/session/check',{method:'GET'}); const j=await r.json().catch(()=>({}));
    if(!r.ok||!j?.ok) return false;
    hide(loginCard); show(appShell); await loadState(); return true;
  }catch{return false;}
}
async function onGoogleCredential(resp){
  try{
    loginOut.textContent='Signing in…';
    const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:resp.credential}).toString()});
    const j=await r.json().catch(()=>({})); stashSid(r,j); if(j?.sid) setSid(j.sid);
    if(!r.ok||!j?.ok) throw new Error(j?.error||`HTTP ${r.status}`);
    hide(loginCard); show(appShell); await loadState();
  }catch(e){ show(loginCard); hide(appShell); loginOut.textContent=`Login failed: ${e?.message||e}`; }
}

function bindEvents(){
  if(eventsBound) return; eventsBound=true;
  refreshBtn?.addEventListener('click',loadState);
  exportAllDreamersBtn?.addEventListener('click',exportAllCurrentCsv);
  historyExpandAllBtn?.addEventListener('click',()=>historyBatches?.querySelectorAll('.historyBatch').forEach((details)=>{details.open=true;}));
  historyCollapseAllBtn?.addEventListener('click',()=>historyBatches?.querySelectorAll('.historyBatch').forEach((details)=>{details.open=false;}));
}

async function loadState(){
  refreshBtn.disabled=true; setStatus('Loading Dreamer of the Week…','info');
  try{
    const r=await adminFetch('/admin/dow/state',{method:'GET'}); const j=await readJson(r); currentState=j; renderState(j);
    if(j?.manager?.can_edit_history===true) await loadDowHistory();
    else { currentHistory=null; hide(historyArea); historyBatches?.replaceChildren(); }
    const health=j.academic_roster?.health||{};
    if(health.status==='error') setStatus(`Ready, but the academic roster has ${Number(health.error_count||0)} configuration error(s). If a class or student is missing, contact Erick or Edwin.`,'warn');
    else if(health.status==='warning') setStatus(`Ready. Academic roster has ${Number(health.issue_count||0)} warning(s).`,'warn');
    else setStatus('Ready. Recipient counts are shared course-wide.','ok');
  }catch(e){
    currentState=null; currentHistory=null; hide(teacherArea); hide(managerArea); hide(historyArea);
    setStatus(e?.message||'Could not load Dreamer of the Week.','error');
  }finally{ refreshBtn.disabled=false; }
}

function renderState(state){
  const teacherOk=state?.teacher_mapping_ok===true;
  if(teacherOk){
    hide(mappingProblem); show(teacherArea);
    const map=state.teacher_mapping||{};
    const cultureOnly=state?.school_culture_access===true && !map.teacher_assignment_match;
    teacherIdentity.textContent=cultureOnly
      ? `${map.name||state.who?.email||''} · School Culture staff access`
      : `${map.name||state.who?.email||''}${map.teacher_assignment_match?` · Teacher Assignments Match: ${map.teacher_assignment_match}`:''}`;
    renderTeacherCourses(state.courses||[]);
  }else{
    show(mappingProblem); mappingProblemText.textContent=state?.teacher_mapping_message||'Please contact Erick or Edwin to have your schedule mapping corrected.';
    hide(teacherArea); courseCards.replaceChildren();
  }
  if(state?.manager?.can_manage){ show(managerArea); renderManager(state.manager); }
  else { hide(managerArea); managerBands.replaceChildren(); }
  if(state?.manager?.can_edit_history===true) show(historyArea);
  else { hide(historyArea); historyBatches?.replaceChildren(); }
}

function renderTeacherCourses(courses){
  courseCards.replaceChildren();
  if(!courses.length){ courseCards.innerHTML='<div class="empty">No DOW-eligible courses were found for your account.</div>'; return; }
  for(const course of courses){
    const card=document.createElement('article'); card.className='courseCard';
    const head=document.createElement('div'); head.className='courseHead';
    const scope=course?.whole_school===true
      ? 'Roster: Whole school'
      : `Your sections: ${esc((course.sections||[]).join(', ')||'—')}`;
    head.innerHTML=`<div><h3>${esc(course.name||course.course_code)}</h3><div class="courseCode">${esc(course.course_code)}</div><div class="sectionList">${scope}</div></div>`;
    card.appendChild(head);
    for(const band of ['9_10','11_12']){
      const data=course.bands?.[band]; if(!data) continue;
      card.appendChild(renderBandPanel(course,data));
    }
    courseCards.appendChild(card);
  }
}

function renderBandPanel(course,data){
  const panel=document.createElement('div'); panel.className='bandPanel';
  const count=Number(data.course_selected||0); const max=Number(data.max||8); const min=Number(data.min||2);
  const counterClass=count>=max?'full':count>=min?'good':'low';
  panel.innerHTML=`<div class="bandTop"><div><div class="bandLabel">${esc(data.label||bandLabel(data.band))}</div><div class="courseHint">Period ${Number(data.cycle?.sequence||1)} · started ${esc(fmtDate(data.cycle?.started_at_iso))}</div></div><div class="counter ${counterClass}">${count} / ${max}</div></div><div class="courseHint">${count<min?`${min-count} more recipient${min-count===1?'':'s'} needed before this period can close.`:count>=max?'Course maximum reached. Remove a recipient before adding another.':'Course requirement met; additional recipients are optional.'}</div>`;

  const list=document.createElement('div'); list.className='studentList';
  for(const student of data.students||[]) list.appendChild(renderStudentRow(course,data,student));
  if(!(data.students||[]).length) list.innerHTML=`<div class="empty">${course?.whole_school===true?'No students are in this grade group.':'No students from your sections are in this grade group.'}</div>`;

  if(course?.whole_school===true){
    const rosterDetails=document.createElement('details'); rosterDetails.className='schoolCultureRoster';
    const summary=document.createElement('summary');
    summary.innerHTML=`<span>Show whole-school roster</span><span class="rosterSummaryMeta">${Number((data.students||[]).length)} students · ${count} selected</span>`;
    rosterDetails.appendChild(summary);

    const rosterBody=document.createElement('div'); rosterBody.className='schoolCultureRosterBody';
    const search=document.createElement('input');
    search.type='search'; search.className='studentSearch'; search.placeholder='Search whole-school roster by name or OSIS…';
    rosterBody.append(search,list);
    rosterDetails.appendChild(rosterBody);
    panel.appendChild(rosterDetails);

    search.addEventListener('input',()=>{
      const q=String(search.value||'').trim().toLowerCase();
      for(const row of list.querySelectorAll('.studentRow')){
        row.style.display=!q||String(row.dataset.search||'').includes(q)?'':'none';
      }
    });
  }else{
    panel.appendChild(list);
  }

  return panel;
}

function recipientRequestKey(course,bandData,student){
  return `${String(bandData?.band||'')}|${String(course?.course_code||'')}|${String(student?.osis||'')}`;
}
function recipientButtonMarkup(label,loading=false){
  return loading?`<span class="recipientSpinner" aria-hidden="true"></span><span>${esc(label)}</span>`:`<span>${esc(label)}</span>`;
}
function recipientHintText(bandData){
  const count=Number(bandData?.course_selected||0),min=Number(bandData?.min||2),max=Number(bandData?.max||8);
  return count<min?`${min-count} more recipient${min-count===1?'':'s'} needed before this period can close.`:count>=max?'Course maximum reached. Remove a recipient before adding another.':'Course requirement met; additional recipients are optional.';
}
function syncBandRecipientUi(button,bandData){
  const panel=button?.closest?.('.bandPanel'); if(!panel)return;
  const count=Number(bandData?.course_selected||0),min=Number(bandData?.min||2),max=Number(bandData?.max||8);
  const counter=panel.querySelector('.counter');
  if(counter){counter.textContent=`${count} / ${max}`;counter.classList.toggle('low',count<min);counter.classList.toggle('good',count>=min&&count<max);counter.classList.toggle('full',count>=max);}
  const hints=panel.querySelectorAll('.courseHint'); if(hints.length>1)hints[hints.length-1].textContent=recipientHintText(bandData);
  const summary=panel.querySelector('.rosterSummaryMeta'); if(summary){summary.textContent=`${panel.querySelectorAll('.studentRow').length} students · ${count} selected`;}
  for(const other of panel.querySelectorAll('.recipientToggle')){
    if(other.dataset.busy==='1')continue;
    const selected=other.dataset.selected==='1';
    other.disabled=count>=max&&!selected;
    other.title=other.disabled?'This course already has 8 recipients.':'';
  }
}
function syncStudentSelectionCount(osis,count){
  for(const row of document.querySelectorAll(`.studentRow[data-osis="${CSS.escape(String(osis||''))}"]`)){
    const el=row.querySelector('[data-dow-current-count]'); if(el)el.textContent=String(Number(count||0));
  }
}
function applyRecipientResult(course,bandData,student,button,result){
  const selected=result?.selected===true;
  student.selected=selected;
  student.current_selections=Number(result?.current_student_selections||0);
  bandData.course_selected=Number(result?.course_selected||0);
  const row=button.closest('.studentRow');
  row?.classList.toggle('selected',selected);
  row?.classList.remove('saving');
  row?.classList.add('confirmed');
  button.classList.toggle('selected',selected);
  button.classList.remove('saving');
  button.classList.add('confirmed');
  button.dataset.selected=selected?'1':'0';
  button.removeAttribute('aria-busy');
  syncStudentSelectionCount(student.osis,student.current_selections);
  syncBandRecipientUi(button,bandData);
}
function renderStudentRow(course,bandData,student){
  const row=document.createElement('div');
  row.className=`studentRow${student.selected?' selected':''}`;
  row.dataset.search=`${student.name||''} ${student.osis||''}`.toLowerCase();
  row.dataset.osis=String(student.osis||'');
  const left=document.createElement('div');
  left.innerHTML=`<div class="studentName">${esc(student.name||student.osis)}</div><div class="studentMeta">Grade ${esc(student.grade||'—')}</div><div class="studentStats"><span class="statPill">Current DOW selections: <span data-dow-current-count>${Number(student.current_selections||0)}</span></span><span class="statPill">Previous DOW awards: ${Number(student.previous_awards||0)}</span></div>`;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className=`btn recipientToggle${student.selected?' selected':''}`;
  btn.dataset.selected=student.selected?'1':'0';
  btn.innerHTML=recipientButtonMarkup(student.selected?'Selected ✓':'Select');
  const atMax=Number(bandData.course_selected||0)>=Number(bandData.max||8);
  if(atMax&&!student.selected){btn.disabled=true;btn.title='This course already has 8 recipients.';}
  btn.addEventListener('click',()=>toggleRecipient(course,bandData,student,btn));
  row.append(left,btn);
  return row;
}
async function toggleRecipient(course,bandData,student,button){
  const requestKey=recipientRequestKey(course,bandData,student);
  if(DOW_RECIPIENT_PENDING.has(requestKey))return;
  const next=!student.selected,oldSelected=student.selected===true;
  DOW_RECIPIENT_PENDING.add(requestKey);
  button.dataset.busy='1';
  button.disabled=true;
  button.setAttribute('aria-busy','true');
  button.classList.remove('confirmed');
  button.classList.add('saving');
  button.closest('.studentRow')?.classList.add('saving');
  button.innerHTML=recipientButtonMarkup(next?'Submitting…':'Removing…',true);
  setStatus(`${next?'Submitting':'Removing'} ${student.name||student.osis}…`,'info');
  try{
    const r=await adminFetch('/admin/dow/recipient',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({band:bandData.band,course_code:course.course_code,osis:student.osis,selected:next})});
    const result=await readJson(r);
    applyRecipientResult(course,bandData,student,button,result);
    button.innerHTML=recipientButtonMarkup(result.selected===true?'Logged ✓':'Removed ✓');
    setStatus(result.selected===true?`✓ ${student.name||student.osis} was officially logged for ${course.name||course.course_code}.`:`✓ ${student.name||student.osis} was removed from ${course.name||course.course_code}.`,'ok');
    window.setTimeout(()=>{
      if(!button.isConnected)return;
      button.classList.remove('confirmed');
      button.closest('.studentRow')?.classList.remove('confirmed');
      button.innerHTML=recipientButtonMarkup(student.selected?'Selected ✓':'Select');
      button.dataset.busy='0';
      syncBandRecipientUi(button,bandData);
    },1100);
  }catch(e){
    student.selected=oldSelected;
    button.classList.remove('saving','confirmed');
    button.closest('.studentRow')?.classList.remove('saving','confirmed');
    button.removeAttribute('aria-busy');
    button.dataset.busy='0';
    button.dataset.selected=oldSelected?'1':'0';
    button.innerHTML=recipientButtonMarkup(oldSelected?'Selected ✓':'Select');
    if(e?.data?.error==='course_recipient_limit_reached')setStatus(`This course already has ${e.data.max||8} recipients. Remove one before adding another.`,'warn');
    else setStatus(e?.message||'Could not update recipient. Nothing was changed.','error');
    syncBandRecipientUi(button,bandData);
  }finally{
    DOW_RECIPIENT_PENDING.delete(requestKey);
    if(button.isConnected&&button.dataset.busy!=='1')syncBandRecipientUi(button,bandData);
  }
}

function renderManager(manager){
  managerBands.replaceChildren();
  for(const band of ['9_10','11_12']){
    const data=manager?.bands?.[band]; if(!data) continue;
    const card=document.createElement('article'); card.className='managerBand';
    const incomplete=(data.courses||[]).filter(c=>!c.complete); const selectedTotal=(data.courses||[]).reduce((n,c)=>n+Number(c.selected||0),0);
    card.innerHTML=`<h3>${esc(data.label||bandLabel(band))}</h3><div class="cycleMeta">Period ${Number(data.cycle?.sequence||1)} · started ${esc(fmtDate(data.cycle?.started_at_iso))}</div><div class="managerSummary"><span class="summaryPill ${data.reset_ready?'ready':'notReady'}">${data.reset_ready?'✓ Ready to reset':`${incomplete.length} course${incomplete.length===1?'':'s'} incomplete`}</span><span class="summaryPill">${selectedTotal} course-recipient selections</span></div>`;
    const courses=document.createElement('div'); courses.className='managerCourses';
    for(const course of data.courses||[]){
      const details=document.createElement('details'); details.className='managerCourse';
      const names=(course.recipients||[]);
      details.innerHTML=`<summary>${course.complete?'✓':'⚠'} ${esc(course.name||course.course_code)} · ${Number(course.selected||0)} / ${Number(course.max||8)}</summary><div class="managerCourseBody"><div class="courseCode">${esc(course.course_code)}</div>${names.length?`<ul class="recipientNames">${names.map(s=>`<li>${esc(s.name||s.osis)} · Grade ${esc(s.grade||'—')}</li>`).join('')}</ul>`:'<div style="margin-top:.35rem;">No recipients selected yet.</div>'}</div>`;
      courses.appendChild(details);
    }
    card.appendChild(courses);
    const reset=document.createElement('div'); reset.className='resetRow';
    const exportBtn=document.createElement('button'); exportBtn.type='button'; exportBtn.className='btn secondary'; exportBtn.textContent=`Export ${bandLabel(band)} CSV`; exportBtn.disabled=!(data.export_rows||[]).length; exportBtn.addEventListener('click',()=>exportBandCsv(band,data));
    const forceReset=!data.reset_ready && data.force_reset_allowed===true;
    const note=document.createElement('span'); note.className='resetNote';
    note.textContent=data.reset_ready
      ? 'Reset archives these recipients as historical awards.'
      : forceReset
        ? 'Some courses are incomplete. Dean / Super Admin may force reset; only currently selected recipients will be archived.'
        : 'Every course must have at least 2 recipients before reset.';
    const btn=document.createElement('button'); btn.type='button'; btn.className='btn danger';
    btn.textContent=forceReset?`Force Reset ${bandLabel(band)} Period`:`Reset ${bandLabel(band)} Period`;
    btn.disabled=!data.reset_ready&&!forceReset;
    btn.addEventListener('click',()=>resetBand(band,data,btn));
    reset.append(note,exportBtn,btn); card.appendChild(reset); managerBands.appendChild(card);
  }
}


async function loadDowHistory(){
  const r=await adminFetch('/admin/dow/history',{method:'GET'});
  currentHistory=await readJson(r);
  renderDowHistory(currentHistory);
}

function historyStudentsForCourse(history,band,courseCode){
  const option=(history?.course_options?.[band]||[]).find(c=>c.course_code===courseCode);
  const studentMap=history?.students||{};
  return (option?.students||[]).map(osis=>studentMap[osis]).filter(Boolean)
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}));
}

function renderDowHistory(history){
  historyBatches.replaceChildren();
  const batches=Array.isArray(history?.batches)?history.batches:[];
  if(!batches.length){ historyBatches.innerHTML='<div class="empty">No closed Dreamer of the Week batches yet.</div>'; return; }

  batches.forEach((batch,index)=>{
    const details=document.createElement('details'); details.className='historyBatch';
    const summary=document.createElement('summary');
    summary.innerHTML=`<strong>${esc(batch.label||bandLabel(batch.band))} · Period ${Number(batch.cycle?.sequence||1)}</strong><span>${esc(fmtDate(batch.closed_at_iso))} · ${Number(batch.recipient_count||0)} recipient selection${Number(batch.recipient_count||0)===1?'':'s'}${batch.forced_reset?' · force reset':''}</span>`;
    details.appendChild(summary);

    const body=document.createElement('div'); body.className='historyBody';
    if(batch.last_edited_at_iso){
      const edited=document.createElement('div'); edited.className='historyEdited';
      edited.textContent=`Last corrected ${fmtDate(batch.last_edited_at_iso)} by ${batch.last_edited_by||'unknown'}`;
      body.appendChild(edited);
    }

    const courses=document.createElement('div'); courses.className='historyCourses';
    for(const course of batch.courses||[]){
      const courseBox=document.createElement('div'); courseBox.className='historyCourse';
      const title=document.createElement('div'); title.className='historyCourseTitle';
      title.innerHTML=`<strong>${esc(course.name||course.course_code)}</strong><span>${Number(course.selected||0)} / ${Number(course.max||8)}</span>`;
      courseBox.appendChild(title);

      if((course.recipients||[]).length){
        const recips=document.createElement('div'); recips.className='historyRecipients';
        for(const recipient of course.recipients||[]){
          const row=document.createElement('div'); row.className='historyRecipient';
          const who=recipient.selected_by_name||recipient.selected_by_email||'unknown';
          row.innerHTML=`<div><strong>${esc(recipient.name||recipient.osis)}</strong><span>Grade ${esc(recipient.grade||'—')} · selected by ${esc(who)}${recipient.added_after_close?' · added after close':''}</span></div>`;
          const remove=document.createElement('button'); remove.type='button'; remove.className='btn danger compact'; remove.textContent='Remove';
          remove.addEventListener('click',()=>editHistoricalRecipient(batch,course,recipient,false,remove));
          row.appendChild(remove); recips.appendChild(row);
        }
        courseBox.appendChild(recips);
      }else{
        const empty=document.createElement('div'); empty.className='historyEmpty'; empty.textContent='No recipients in this course.';
        courseBox.appendChild(empty);
      }
      courses.appendChild(courseBox);
    }
    body.appendChild(courses);

    const editor=document.createElement('div'); editor.className='historyEditor';
    const courseSelect=document.createElement('select'); courseSelect.className='historySelect';
    const studentSelect=document.createElement('select'); studentSelect.className='historySelect';
    const add=document.createElement('button'); add.type='button'; add.className='btn secondary'; add.textContent='Add Recipient';

    const courseOptions=history?.course_options?.[batch.band]||[];
    courseSelect.innerHTML=courseOptions.map(c=>`<option value="${esc(c.course_code)}">${esc(c.name||c.course_code)}</option>`).join('');

    const refreshStudents=()=>{
      const courseCode=courseSelect.value;
      const selectedSet=new Set(
        (batch.courses||[]).find(c=>c.course_code===courseCode)?.recipients?.map(r=>r.osis)||[]
      );
      const students=historyStudentsForCourse(history,batch.band,courseCode).filter(s=>!selectedSet.has(s.osis));
      studentSelect.innerHTML=students.length
        ? students.map(s=>`<option value="${esc(s.osis)}">${esc(s.name||s.osis)} · Grade ${esc(s.grade||'—')} · ${esc(s.osis)}</option>`).join('')
        : '<option value="">No eligible unselected students</option>';
      add.disabled=!students.length;
    };
    courseSelect.addEventListener('change',refreshStudents); refreshStudents();
    add.addEventListener('click',()=>{
      const course=(courseOptions||[]).find(c=>c.course_code===courseSelect.value);
      const student=history?.students?.[studentSelect.value];
      if(!course||!student) return;
      editHistoricalRecipient(batch,course,student,true,add);
    });

    const editorLabel=document.createElement('div'); editorLabel.className='historyEditorLabel'; editorLabel.textContent='Correct this closed batch';
    editor.append(editorLabel,courseSelect,studentSelect,add);
    body.appendChild(editor);
    details.appendChild(body);
    historyBatches.appendChild(details);
  });
}

async function editHistoricalRecipient(batch,course,student,selected,button){
  const action=selected?'add':'remove';
  if(!window.confirm(`${selected?'Add':'Remove'} ${student.name||student.osis} ${selected?'to':'from'} ${course.name||course.course_code} in ${batch.label||bandLabel(batch.band)} Period ${Number(batch.cycle?.sequence||1)}?`)) return;
  button.disabled=true; setStatus(`${selected?'Adding':'Removing'} historical recipient…`,'info');
  try{
    const r=await adminFetch('/admin/dow/history/recipient',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        band:batch.band,
        cycle_id:batch.cycle?.cycle_id,
        course_code:course.course_code,
        osis:student.osis,
        selected
      })
    });
    await readJson(r);
    await loadState();
    setStatus(`Past DOW batch updated. Historical award counts were rebuilt.`,'ok');
  }catch(e){
    if(e?.data?.error==='course_recipient_limit_reached') setStatus(`That archived course already has ${e.data.max||8} recipients.`,'warn');
    else setStatus(e?.message||`Could not ${action} historical recipient.`,'error');
    button.disabled=false;
  }
}


async function resetBand(band,data,button){
  const label=bandLabel(band); const seq=Number(data?.cycle?.sequence||1);
  const forceReset=!data?.reset_ready && data?.force_reset_allowed===true;
  const incomplete=(data?.courses||[]).filter(c=>!c.complete);
  const incompleteText=incomplete.slice(0,12).map(c=>`${c.name||c.course_code} (${c.selected||0}/${c.min||2})`).join(', ');
  const message=forceReset
    ? `FORCE RESET ${label} DOW Period ${seq}?\n\n${incomplete.length} course${incomplete.length===1?' is':'s are'} incomplete${incompleteText?`:\n${incompleteText}`:''}.\n\nOnly recipients currently selected will be archived. Missing course submissions will NOT be invented.\n\nA new ${label} period will begin.`
    : `Close ${label} DOW Period ${seq}?\n\nCurrent recipients will be archived as historical DOW awards and a new ${label} period will begin.`;
  if(!window.confirm(message)) return;
  button.disabled=true; setStatus(`${forceReset?'Force closing':'Closing'} ${label} period…`,'info');
  try{
    const r=await adminFetch('/admin/dow/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({band,force:forceReset})});
    const result=await readJson(r); await loadState(); setStatus(result?.forced_reset?`${label} period force-reset successfully. Only submitted recipients were archived; a new period is now active.`:`${label} period reset successfully. A new period is now active.`,'ok');
  }catch(e){
    if(e?.data?.error==='dow_courses_incomplete'){
      const names=(e.data.incomplete_courses||[]).map(c=>`${c.name||c.course_code} (${c.selected||0}/${c.min||2})`).join(', ');
      setStatus(`Cannot reset yet. Incomplete courses: ${names||'one or more courses'}.`,'warn');
    }else setStatus(e?.message||'Could not reset DOW period.','error');
    button.disabled=false;
  }
}

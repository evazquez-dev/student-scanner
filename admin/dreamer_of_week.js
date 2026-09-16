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

let currentState = null;
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
    ['cycle_id','Cycle ID'],['course_code','Course Code'],['course_name','Course Name'],['selected_by','Selected By'],
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
}

async function loadState(){
  refreshBtn.disabled=true; setStatus('Loading Dreamer of the Week…','info');
  try{
    const r=await adminFetch('/admin/dow/state',{method:'GET'}); const j=await readJson(r); currentState=j; renderState(j);
    const health=j.academic_roster?.health||{};
    if(health.status==='error') setStatus(`Ready, but the academic roster has ${Number(health.error_count||0)} configuration error(s). If a class or student is missing, contact Erick or Edwin.`,'warn');
    else if(health.status==='warning') setStatus(`Ready. Academic roster has ${Number(health.issue_count||0)} warning(s).`,'warn');
    else setStatus('Ready. Recipient counts are shared course-wide.','ok');
  }catch(e){
    currentState=null; hide(teacherArea); hide(managerArea);
    setStatus(e?.message||'Could not load Dreamer of the Week.','error');
  }finally{ refreshBtn.disabled=false; }
}

function renderState(state){
  const teacherOk=state?.teacher_mapping_ok===true;
  if(teacherOk){
    hide(mappingProblem); show(teacherArea);
    const map=state.teacher_mapping||{};
    teacherIdentity.textContent=`${map.name||state.who?.email||''}${map.teacher_assignment_match?` · Teacher Assignments Match: ${map.teacher_assignment_match}`:''}`;
    renderTeacherCourses(state.courses||[]);
  }else{
    show(mappingProblem); mappingProblemText.textContent=state?.teacher_mapping_message||'Please contact Erick or Edwin to have your schedule mapping corrected.';
    hide(teacherArea); courseCards.replaceChildren();
  }
  if(state?.manager?.can_manage){ show(managerArea); renderManager(state.manager); }
  else { hide(managerArea); managerBands.replaceChildren(); }
}

function renderTeacherCourses(courses){
  courseCards.replaceChildren();
  if(!courses.length){ courseCards.innerHTML='<div class="empty">No DOW-eligible courses were found for your account.</div>'; return; }
  for(const course of courses){
    const card=document.createElement('article'); card.className='courseCard';
    const head=document.createElement('div'); head.className='courseHead';
    head.innerHTML=`<div><h3>${esc(course.name||course.course_code)}</h3><div class="courseCode">${esc(course.course_code)}</div><div class="sectionList">Your sections: ${esc((course.sections||[]).join(', ')||'—')}</div></div>`;
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
  if(!(data.students||[]).length) list.innerHTML='<div class="empty">No students from your sections are in this grade group.</div>';
  panel.appendChild(list); return panel;
}

function renderStudentRow(course,bandData,student){
  const row=document.createElement('div'); row.className=`studentRow${student.selected?' selected':''}`;
  const left=document.createElement('div');
  left.innerHTML=`<div class="studentName">${esc(student.name||student.osis)}</div><div class="studentMeta">Grade ${esc(student.grade||'—')}</div><div class="studentStats"><span class="statPill">Current DOW selections: ${Number(student.current_selections||0)}</span><span class="statPill">Previous DOW awards: ${Number(student.previous_awards||0)}</span></div>`;
  const btn=document.createElement('button'); btn.type='button'; btn.className=`btn recipientToggle${student.selected?' selected':''}`; btn.textContent=student.selected?'Selected ✓':'Select';
  const atMax=Number(bandData.course_selected||0)>=Number(bandData.max||8);
  if(atMax&&!student.selected){ btn.disabled=true; btn.title='This course already has 8 recipients.'; }
  btn.addEventListener('click',()=>toggleRecipient(course,bandData,student,btn));
  row.append(left,btn); return row;
}

async function toggleRecipient(course,bandData,student,button){
  const next=!student.selected; button.disabled=true;
  setStatus(`${next?'Selecting':'Removing'} ${student.name||student.osis}…`,'info');
  try{
    const r=await adminFetch('/admin/dow/recipient',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({band:bandData.band,course_code:course.course_code,osis:student.osis,selected:next})});
    await readJson(r); await loadState();
  }catch(e){
    if(e?.data?.error==='course_recipient_limit_reached') setStatus(`This course already has ${e.data.max||8} recipients. Remove one before adding another.`,'warn');
    else setStatus(e?.message||'Could not update recipient.','error');
    button.disabled=false;
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

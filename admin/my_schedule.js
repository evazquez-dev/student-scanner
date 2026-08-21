const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const GOOGLE_CLIENT_ID=document.querySelector('meta[name="google-client-id"]')?.content||'';
const SESSION_HEADER='x-admin-session';
const SESSION_KEY='my_schedule_admin_session_v1';
const LEGACY_SESSION_KEYS=['ss_admin_session_sid_v1','teacher_att_admin_session_v1','dreamer_of_week_admin_session_v1','admin_session_v1'];
const loginCard=document.getElementById('loginCard');
const loginOut=document.getElementById('loginOut');
const appShell=document.getElementById('appShell');
const refreshBtn=document.getElementById('refreshBtn');
const pageStatus=document.getElementById('pageStatus');
const mappingProblem=document.getElementById('mappingProblem');
const mappingProblemText=document.getElementById('mappingProblemText');
const scheduleArea=document.getElementById('scheduleArea');
const teacherName=document.getElementById('teacherName');
const teacherMatch=document.getElementById('teacherMatch');
const scheduleDate=document.getElementById('scheduleDate');
const scheduleSubtitle=document.getElementById('scheduleSubtitle');
const periodList=document.getElementById('periodList');
let refreshTimer=null;

function show(el){if(el){el.classList.remove('hidden');el.style.display='';}}
function hide(el){if(el){el.classList.add('hidden');el.style.display='none';}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function getSid(){try{const own=String(sessionStorage.getItem(SESSION_KEY)||localStorage.getItem(SESSION_KEY)||'').trim();if(own)return own;for(const k of LEGACY_SESSION_KEYS){const v=String(sessionStorage.getItem(k)||localStorage.getItem(k)||'').trim();if(v)return v;}}catch{}return '';}
function setSid(sid){const v=String(sid||'').trim();if(!v)return;try{sessionStorage.setItem(SESSION_KEY,v);localStorage.setItem(SESSION_KEY,v);}catch{}}
function clearSid(){try{sessionStorage.removeItem(SESSION_KEY);localStorage.removeItem(SESSION_KEY);}catch{}}
function stashSid(resp,data){try{const sid=String(data?.sid||resp?.headers?.get(SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim();if(sid)setSid(sid);}catch{}}
async function adminFetch(path,init={}){const headers=new Headers(init.headers||{});const sid=getSid();if(sid&&!headers.has(SESSION_HEADER))headers.set(SESSION_HEADER,sid);const resp=await fetch(new URL(path,API_BASE),{...init,headers,credentials:'include',cache:'no-store'});let j=null;try{j=await resp.clone().json();}catch{}stashSid(resp,j);if(resp.status===401&&['expired','no_session'].includes(String(j?.error||'')))clearSid();return resp;}
async function waitForGoogle(timeoutMs=8000){const start=Date.now();while(!window.google?.accounts?.id){if(Date.now()-start>timeoutMs)throw new Error('Google Sign-In failed to load');await new Promise(r=>setTimeout(r,50));}return window.google.accounts.id;}
function setStatus(text,kind='info'){pageStatus.className=`statusBanner ${kind}`;pageStatus.textContent=text;}
function attendanceHref(room,period){const u=new URL('./teacher_attendance.html',location.href);u.searchParams.set('room',room);u.searchParams.set('period',period);return u.href;}
function displayDate(iso){if(!iso)return '—';const d=new Date(`${iso}T12:00:00`);return Number.isFinite(d.getTime())?d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'}):iso;}

function render(data){
  if(!data.teacher_mapping_ok){hide(scheduleArea);show(mappingProblem);mappingProblemText.textContent=data.mapping_message||'Please contact Erick or Edwin for a fix.';setStatus('Teacher assignment mapping needs attention.','error');return;}
  hide(mappingProblem);show(scheduleArea);
  teacherName.textContent=data.teacher_name||data.who?.email||'—';
  teacherMatch.textContent=data.teacher_assignment_match||'—';
  scheduleDate.textContent=displayDate(data.schedule_date||data.date);
  scheduleSubtitle.textContent=`${displayDate(data.date)} teaching schedule`;
  const stale=!!data.schedule_stale;
  scheduleArea.classList.toggle('stale',stale);
  if(!data.schedule_configured){setStatus("Today's teacher schedule has not been pushed to EagleNEST yet.",'warn');}
  else if(stale){setStatus(`The latest teacher schedule is dated ${displayDate(data.schedule_date)}. Attendance links are disabled until today's schedule is pushed.`,'warn');}
  else if(data.highlight_kind==='current'){setStatus(`Period ${data.current_period_local} is in progress and highlighted below.`,'good');}
  else if(data.highlight_kind==='up_next'){setStatus(`Transition time — Period ${data.current_period_local} is highlighted as up next.`,'info');}
  else{setStatus("Today's schedule is loaded.",'good');}

  const periods=Array.isArray(data.periods)?data.periods:[];
  periodList.innerHTML=periods.map(p=>{
    const classes=Array.isArray(p.classes)?p.classes:[];
    const badge=p.highlight_kind==='current'?'Current period':(p.highlight_kind==='up_next'?'Up next':'');
    const classHtml=classes.length?classes.map(c=>{
      const names=(c.sections||[]).map(s=>s.name||s.code).filter(Boolean);
      const codes=(c.sections||[]).map(s=>s.code).filter(Boolean);
      const title=names.length?names.join(' + '):'Scheduled class';
      const href=attendanceHref(String(c.room||''),String(p.id||''));
      return `<a class="classLink" href="${esc(href)}" aria-label="Open Teacher Attendance for Period ${esc(p.id)}, Room ${esc(c.room)}">
        <div class="classTop"><span class="classTitle">${esc(title)}</span><span class="roomPill">Room ${esc(c.room)}</span></div>
        ${codes.length?`<div class="sectionCodes">${esc(codes.join(' • '))}</div>`:''}
      </a>`;
    }).join(''):'<div class="emptyClass">No class assigned</div>';
    return `<section class="periodRow ${p.is_highlighted?'highlighted':''}">
      <div class="periodBadge">
        <span class="periodNumber">Period ${esc(p.id)}</span>
        <span class="periodTime">${esc(p.time_label||'')}</span>
        ${badge?`<span class="nowPill">${esc(badge)}</span>`:''}
      </div>
      <div class="classes">${classHtml}</div>
    </section>`;
  }).join('')||'<section class="scheduleCard"><p class="muted">No bell periods are configured for today.</p></section>';
}

async function loadSchedule(){
  try{setStatus("Loading today's schedule…",'info');const r=await adminFetch('/admin/my_schedule',{method:'GET'});const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok)throw new Error(j?.detail||j?.error||`HTTP ${r.status}`);render(j);}catch(e){setStatus(`Could not load schedule: ${e?.message||e}`,'error');}
}
async function bootstrapSession(){try{const r=await adminFetch('/admin/session/check',{method:'GET'});const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok)return false;hide(loginCard);show(appShell);await loadSchedule();return true;}catch{return false;}}
async function onGoogleCredential(resp){try{loginOut.textContent='Signing in…';const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:resp.credential}).toString()});const j=await r.json().catch(()=>({}));stashSid(r,j);if(j?.sid)setSid(j.sid);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);hide(loginCard);show(appShell);await loadSchedule();}catch(e){show(loginCard);hide(appShell);loginOut.textContent=`Login failed: ${e?.message||e}`;}}

window.addEventListener('DOMContentLoaded',async()=>{
  refreshBtn?.addEventListener('click',loadSchedule);
  if(await bootstrapSession()){refreshTimer=setInterval(()=>{if(!document.hidden)loadSchedule();},60000);return;}
  try{if(!GOOGLE_CLIENT_ID)throw new Error('Missing google-client-id meta.');const gsi=await waitForGoogle();gsi.initialize({client_id:GOOGLE_CLIENT_ID,callback:onGoogleCredential,ux_mode:'popup',use_fedcm_for_prompt:true});gsi.renderButton(document.getElementById('g_id_signin'),{theme:'outline',size:'large'});hide(appShell);show(loginCard);loginOut.textContent='Please sign in…';}catch(e){hide(appShell);show(loginCard);loginOut.textContent=`Sign-in initialization failed: ${e?.message||e}`;}
});
window.addEventListener('beforeunload',()=>{if(refreshTimer)clearInterval(refreshTimer);});

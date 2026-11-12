(() => {
'use strict';
const $ = id => document.getElementById(id);
const API = new URL(document.querySelector('meta[name="api-base"]').content || '/',location.origin);
const KEYS=['reflection_hold_admin_session_v1','teacher_att_admin_session_v1','ss_admin_session_sid_v1','admin_session_v1','admin_session_sid'];
const state={options:null,rosters:[],selected:new Set(),parents:new Map(),parentLinks:new Map(),roster:[],dates:[]};
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function getSession(){try{for(const k of KEYS){const v=sessionStorage.getItem(k)||localStorage.getItem(k);if(v)return v;}}catch{}return '';}
async function api(path,init={}){
 const headers=new Headers(init.headers||{}),session=getSession();if(session)headers.set('x-admin-session',session);
 const r=await fetch(new URL(path,API),{...init,headers,credentials:'include',cache:'no-store'});
 const sid=r.headers.get('x-admin-session');if(sid){try{sessionStorage.setItem('reflection_hold_admin_session_v1',sid);}catch{}}
 const json=await r.json().catch(()=>null);
 if(!r.ok||!json?.ok)throw new Error(`${json?.error||'request_failed'}${json?.detail?': '+json.detail:''}${json?.failed?': '+JSON.stringify(json.failed):''}`);
 return json;
}
function post(path,body){return api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
function notice(msg,kind='error'){$('formResult').className=kind;$('formResult').textContent=msg;}
function selectedDay(){return state.dates.find(d=>d.date===$('sessionDate').value);}
function selectedSlot(){return selectedDay()?.slots?.[$('sessionPeriod').value];}
function updateDate(){
 const d=selectedDay(),sel=$('sessionPeriod'),was=sel.value;
 for(const o of sel.options)o.disabled=!d?.slots?.[o.value];
 if(!d?.slots?.[was])sel.value=[...sel.options].find(o=>!o.disabled)?.value||'';
 updateSlot();
}
function updateSlot(){
 const slot=selectedSlot(),after=$('sessionPeriod').value==='AFTER_SCHOOL';
 if (!after){
  const allowed=new Set(state.options?.lunch_eligible?.[$('sessionPeriod').value]||[]);
  const before=state.selected.size;
  state.selected=new Set([...state.selected].filter(o=>allowed.has(o)));
  if(before>state.selected.size)notice(`${before-state.selected.size} student(s) excluded because this is not their scheduled lunch period.`,'success');
 }
 $('sessionStart').value=slot?.start||'';$('sessionEnd').value=slot?.end||'';
 $('sessionStart').readOnly=!after;$('sessionEnd').readOnly=!after;
 $('scheduleInfo').textContent=slot?`${selectedDay().schedule_key||'Special'} schedule · ${after?'After-school checkout blocked until released':'Lunch-period supervision'} · ${slot.start}–${slot.end}`:'No published session is available for this date.';
 renderStudents();validate();
}
function invalidateSubmission(){state.pendingRequestId='';}
function validate(){
 const valid=state.selected.size>0&&!!selectedSlot()&&!!$('sessionRoom').value&&!!$('sessionReason').value.trim()&&$('studentInformed').checked;
 $('submitBtn').disabled=!valid;
}
function renderStudents(){
 const q=$('search').value.trim().toLowerCase(),p=$('sessionPeriod').value;
 const elig=new Set(state.options?.lunch_eligible?.[p]||[]);
 const body=$('studentBody');body.replaceChildren();
 let visible=0;
 for(const s of state.roster){
  if(q&&!`${s.name} ${s.osis}`.toLowerCase().includes(q))continue;
  if(++visible>700)break;
  const tr=document.createElement('tr'),allowed=p==='AFTER_SCHOOL'||elig.has(s.osis);
  const check=document.createElement('input');check.type='checkbox';check.checked=state.selected.has(s.osis);check.disabled=!allowed;
  check.addEventListener('change',()=>{invalidateSubmission();if(check.checked)state.selected.add(s.osis);else state.selected.delete(s.osis);renderParents();validate();});
  const td=document.createElement('td');td.append(check);tr.append(td);
  for(const value of [s.name,s.osis,allowed?'Eligible':'Other lunch']){const cell=document.createElement('td');cell.textContent=value;tr.append(cell);}
  body.append(tr);
 }
 $('selectedCount').textContent=`${state.selected.size} selected`;
 renderParents();
}
async function loadParentRecords(osis){
 const records=await api(`/admin/communications/student?student_number=${encodeURIComponent(osis)}&limit=150`);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 const today=`${parts.year}-${parts.month}-${parts.day}`;
 const nyDay=value=>{const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';const d=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));return `${d.year}-${d.month}-${d.day}`;};
 const choices=(records.rows||[]).filter(r=>nyDay(r.contact_at_iso)===today).filter(r=>{
   const rel=String(r.contact_relationship||'').toLowerCase();return rel&&rel!=='student'&&!r.is_deleted;
 });
 state.parentLinks.set(osis,choices);renderParents();
}
function renderParents(){
 const body=$('parentBody');body.replaceChildren();
 const names=new Map(state.roster.map(s=>[s.osis,s.name]));
 for(const o of state.selected){
  const item=state.parents.get(o)||{parent_status:'not_contacted',parent_communication_id:''};
  const tr=document.createElement('tr');const name=document.createElement('td');name.textContent=names.get(o)||o;
  const statusCell=document.createElement('td'),status=document.createElement('select');
  [['not_contacted','Not contacted'],['attempted','Attempted'],['contacted_logged','Contacted & logged']].forEach(([v,label])=>status.append(new Option(label,v)));
  status.value=item.parent_status;status.addEventListener('change',()=>{invalidateSubmission();state.parents.set(o,{parent_status:status.value,parent_communication_id:''});renderParents();});
  statusCell.append(status);const logCell=document.createElement('td');
  if(item.parent_status==='contacted_logged'){
   const records=state.parentLinks.get(o)||[],choice=document.createElement('select');choice.append(new Option('Select parent communication…',''));
   for(const rec of records)choice.append(new Option(`${rec.contact_display_name||rec.contact_relationship} · ${String(rec.contact_at_iso||'').slice(0,16)} · ${rec.method}`,rec.communication_id));
   choice.value=item.parent_communication_id;
   choice.addEventListener('change',()=>{invalidateSubmission();state.parents.set(o,{...item,parent_communication_id:choice.value});});
   logCell.append(choice);
   const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh records';
   refresh.addEventListener('click',()=>loadParentRecords(o).catch(e=>notice(e.message)));
   logCell.append(refresh);
   const a=document.createElement('a');a.href='./student_contacts.html?source=reflection_sessions';a.target='_blank';a.rel='noopener noreferrer';a.textContent=' Log contact';logCell.append(a);
   if(!state.parentLinks.has(o))loadParentRecords(o).catch(e=>notice(e.message));
  }else {logCell.textContent=item.parent_status==='attempted'?'Follow-up needed':'Contact pending';}
  tr.append(name,statusCell,logCell);body.append(tr);
 }
 $('selectedCount').textContent=`${state.selected.size} selected`;validate();
}
function installRosters(){
 const sel=$('rosterSelect');sel.replaceChildren();sel.append(new Option('Choose a roster…',''));
 for(const r of state.rosters){sel.append(new Option(`${r.name} (${r.student_count||0})`,`${r.kind}|${r.id}`));}
}
async function refreshRosters(){
 try{const r=await api('/admin/my_rosters');state.rosters=[...(r.custom_rosters||[]),...(r.shared_rosters||[]),...(r.system_rosters||[]),...(r.legacy_rosters||[])];installRosters();}
 catch(e){$('rosterSelect').replaceChildren(new Option('Rosters unavailable',''));}
}
async function loadRoster(){
 const value=$('rosterSelect').value;if(!value)return;const [kind,id]=value.split('|');
 const r=await api(`/admin/my_rosters/detail?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`);
 const all=new Set(state.roster.map(s=>s.osis));
 state.selected=new Set((r.students||[]).map(s=>String(s.osis||'')).filter(x=>all.has(x)));
 renderStudents();notice(`Loaded ${state.selected.size} students from ${r.roster?.name||'roster'}.`,'success');
}
async function createSessions(){
 if(!$('studentInformed').checked)return notice('Student conversation confirmation is required.');
 if(!$('sessionRoom').value||!$('sessionReason').value.trim())return notice('Room and reason are required.');
 if(!state.selected.size)return notice('Select one or more students.');
 const students=[...state.selected].map(o=>({osis:o,...(state.parents.get(o)||{parent_status:'not_contacted'})}));
 for(const s of students)if(s.parent_status==='contacted_logged'&&!s.parent_communication_id)return notice(`Choose a logged parent communication for ${s.osis}.`);
 const submit=$('submitBtn');submit.disabled=true;
 // Reuse the same idempotency key only when retrying the same submission.
 const request_id=state.pendingRequestId||(state.pendingRequestId=`ss_${crypto.randomUUID().replace(/-/g,'')}`);
 try{
  const r=await post('/admin/student_sessions/schedule',{
   request_id,type:$('type').value,period:$('sessionPeriod').value,date:$('sessionDate').value,
   start_time:$('sessionStart').value,end_time:$('sessionEnd').value,room:$('sessionRoom').value,
   reason:$('sessionReason').value.trim(),student_informed:true,students
  });
  notice(`Saved ${r.scheduled.length} student session(s). Student communications logged.`, 'success');
  state.pendingRequestId='';state.selected.clear();$('studentInformed').checked=false;renderStudents();
 }catch(e){notice(e.message);}finally{validate();}
}
async function refreshUpcoming(){
 const r=await api('/admin/student_sessions/list?from=2000-01-01'),body=$('upcomingBody');body.replaceChildren();
 if(!r.sessions.length){body.innerHTML='<tr><td colspan="6">No sessions found.</td></tr>';}
 for(const x of r.sessions){
  const tr=document.createElement('tr');for(const v of [x.session_date,x.student_name||x.student_number,x.session_type==='reflection'?'Reflection':'Study Hall',`${x.period_local} · ${x.start_time}–${x.end_time} · ${x.room}`,x.parent_status]){const td=document.createElement('td');td.textContent=v;tr.append(td);}
  const actions=document.createElement('td'),tag=document.createElement('div');tag.textContent=x.status;actions.append(tag);
  const available={scheduled:['present','missed','completed','released','cancelled'],present:['completed','released']}[x.status]||[];
  for(const act of available){
   const btn=document.createElement('button');btn.type='button';btn.textContent=act.charAt(0).toUpperCase()+act.slice(1);
   btn.addEventListener('click',async()=>{if(!confirm(`Mark ${x.student_name} as ${act}?`))return;btn.disabled=true;try{await post('/admin/student_sessions/update',{assignment_id:x.assignment_id,action:act});await refreshUpcoming();}catch(e){alert(e.message);btn.disabled=false;}});actions.append(btn);
  }
  tr.append(actions);body.append(tr);
 }
 await refreshLegacyHolds();
}
async function refreshLegacyHolds(){
 const container=$('legacyHolds');container.replaceChildren();
 try{const r=await api('/admin/reflection_hold/options');const today=r.date||'';const holds=r.my_active_holds||[];
 if(!holds.length){container.textContent='No active legacy holds for your account.';return;}
 for(const h of holds){const line=document.createElement('div');line.className='flex';line.style.margin='6px 0';
  const info=document.createElement('span');info.textContent=`${h.name||h.osis} · ${h.room||''} · ${h.reason||''}`;line.append(info);
  const button=document.createElement('button');button.textContent='Release';button.addEventListener('click',async()=>{if(!confirm(`Release hold for ${h.name||h.osis}?`))return;try{await post('/admin/reflection_hold/release',{date,osisList:[h.osis],mode:'release'});await refreshLegacyHolds();}catch(e){alert(e.message);}});line.append(button);container.append(line);
 }
 }catch(e){container.textContent=`Legacy holds unavailable: ${e.message}`;}
}
function tab(upcoming){$('formPanel').classList.toggle('hidden',upcoming);$('upcomingPanel').classList.toggle('hidden',!upcoming);$('tabForm').setAttribute('aria-pressed',String(!upcoming));$('tabUpcoming').setAttribute('aria-pressed',String(upcoming));if(upcoming)refreshUpcoming().catch(e=>alert(e.message));}
async function init(){
 const t=localStorage.getItem('ss_theme_v1');if(t)document.documentElement.dataset.theme=t;
 $('themeBtn').onclick=()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;localStorage.setItem('ss_theme_v1',next);};
 $('tabForm').onclick=()=>tab(false);$('tabUpcoming').onclick=()=>tab(true);$('refreshUpcoming').onclick=()=>refreshUpcoming().catch(e=>alert(e.message));
 $('type').onchange=()=>{invalidateSubmission();validate();};$('sessionDate').onchange=()=>{invalidateSubmission();updateDate();};$('sessionPeriod').onchange=()=>{invalidateSubmission();updateSlot();};
 $('sessionRoom').onchange=()=>{invalidateSubmission();validate();};$('sessionReason').oninput=()=>{invalidateSubmission();validate();};$('sessionStart').onchange=invalidateSubmission;$('sessionEnd').onchange=invalidateSubmission;$('studentInformed').onchange=()=>{invalidateSubmission();validate();};
 $('search').oninput=renderStudents;$('loadRoster').onclick=()=>loadRoster().catch(e=>notice(e.message));$('submitBtn').onclick=createSessions;
 $('selectVisible').onclick=()=>{invalidateSubmission();for(const tr of $('studentBody').querySelectorAll('tr')){const cb=tr.querySelector('input[type=checkbox]');if(cb&&!cb.disabled)cb.checked=true;}
  state.selected=new Set([...state.selected,...[...$('studentBody').querySelectorAll('tr')].filter(tr=>{const cb=tr.querySelector('input');return cb?.checked&&!cb.disabled}).map(tr=>tr.children[2].textContent.trim())]);renderStudents();};
 $('clearSelected').onclick=()=>{invalidateSubmission();state.selected.clear();renderStudents();};
 try{
  const [options,holds]=await Promise.all([api('/admin/student_sessions/options'),api('/admin/reflection_hold/options')]);
  state.options=options;state.dates=options.dates||[];state.roster=options.students||[];
  const locs=holds.locations||[];$('sessionRoom').replaceChildren(new Option('Choose room…',''));
  for(const l of locs){const name=typeof l==='string'?l:String(l.name||'');if(name)$('sessionRoom').append(new Option(name,name));}
  $('sessionDate').replaceChildren(new Option('Choose published date…',''));
  for(const d of state.dates)$('sessionDate').append(new Option(`${d.date} (${d.schedule_key})`,d.date));
  if(state.dates.length)$('sessionDate').value=state.dates[0].date;
  updateDate();renderStudents();$('banner').textContent=`${state.dates.length} published date(s) available. No sessions can be saved without confirming a direct student conversation.`;
  await refreshRosters();
 }catch(e){$('banner').textContent=`Cannot load Reflection & Study Hall: ${e.message}`;notice(e.message);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

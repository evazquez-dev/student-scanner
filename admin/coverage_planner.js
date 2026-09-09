const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'coverage_planner_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';

const $ = (id) => document.getElementById(id);
const loginCard = $('loginCard');
const loginOut = $('loginOut');
const app = $('app');
const refreshBtn = $('refreshBtn');
const printBtn = $('printBtn');
const showGapsBtn = $('showGapsBtn');
const clearBtn = $('clearBtn');
const selectVisibleBtn = $('selectVisibleBtn');
const teacherSearch = $('teacherSearch');
const groupSelect = $('groupSelect');
const teacherList = $('teacherList');
const selectedSummary = $('selectedSummary');
const staleBanner = $('staleBanner');
const errorBanner = $('errorBanner');
const gapTable = $('gapTable');
const teacherSummaryCard = $('teacherSummaryCard');
const teacherSummaryTable = $('teacherSummaryTable');
const stillStaffedDetails = $('stillStaffedDetails');
const stillStaffedTable = $('stillStaffedTable');

let ACCESS = null;
let MODEL = null;
let SELECTED = new Set();
let TEACHERS = [];

function show(el){ if(el) el.hidden=false; }
function hide(el){ if(el) el.hidden=true; }
function esc(v){ return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function getStoredSid(){ try{return String(sessionStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem('ss_admin_session_sid_v1')||'').trim()}catch{return''} }
function setStoredSid(sid){const v=String(sid||'').trim();if(!v)return;try{sessionStorage.setItem(ADMIN_SESSION_KEY,v);localStorage.setItem(ADMIN_SESSION_KEY,v);localStorage.setItem('ss_admin_session_sid_v1',v)}catch{}}
function clearStoredSid(){try{sessionStorage.removeItem(ADMIN_SESSION_KEY);localStorage.removeItem(ADMIN_SESSION_KEY)}catch{}}
function stashSid(resp){try{const sid=String(resp?.headers?.get(ADMIN_SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim();if(sid)setStoredSid(sid)}catch{}}

async function adminFetch(pathOrUrl,init={}){
  const url=pathOrUrl instanceof URL?pathOrUrl:new URL(pathOrUrl,API_BASE);
  const headers=new Headers(init.headers||{});const sid=getStoredSid();if(sid&&!headers.has(ADMIN_SESSION_HEADER))headers.set(ADMIN_SESSION_HEADER,sid);
  const resp=await fetch(url,{...init,headers,credentials:'include',cache:'no-store'});stashSid(resp);
  if(resp.status===401||resp.status===403){const j=await resp.clone().json().catch(()=>null);if(['expired','no_session','bad_session'].includes(String(j?.error||'').toLowerCase()))clearStoredSid()}
  return resp;
}

async function fetchAccess(){const r=await adminFetch('/admin/access');const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);return j}
function setError(msg){const text=String(msg||'').trim();if(!text){hide(errorBanner);errorBanner.textContent='';return}errorBanner.textContent=text;show(errorBanner)}
function fmtDay(iso){if(!iso)return 'Today';try{return new Date(`${iso}T12:00:00`).toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'})}catch{return iso}}
function tag(text,kind='info'){return `<span class="tag ${esc(kind)}">${esc(text)}</span>`}
function tableHtml(rows,cols,empty){if(!Array.isArray(rows)||!rows.length)return `<div class="empty">${esc(empty)}</div>`;return `<table><thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${c.render(r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`}

function selectedFromUrl(){const u=new URL(location.href);return String(u.searchParams.get('teachers')||'').split(',').map(v=>v.trim()).filter(Boolean)}
function updateUrl(){const u=new URL(location.href);const values=[...SELECTED];if(values.length)u.searchParams.set('teachers',values.join(','));else u.searchParams.delete('teachers');history.replaceState(null,'',u)}

function teacherSearchText(row){return [row.display_name,row.assignment_label,...(row.emails||[]),...(row.departments||[]),...(row.grade_teams||[])].join(' ').toLowerCase()}
function teacherMeta(row){const bits=[];if(row.departments?.length)bits.push(row.departments.join(', '));if(row.grade_teams?.length)bits.push(`Grade Team ${row.grade_teams.join(', ')}`);if(row.emails?.length)bits.push(row.emails.join(', '));if(row.unmapped)bits.push('Unmapped assignment');return bits.join(' · ')||`${Number(row.section_count||0)} section(s)`}

function renderTeachers(){
  const q=String(teacherSearch.value||'').trim().toLowerCase();
  teacherList.innerHTML=TEACHERS.map(row=>{
    const checked=SELECTED.has(row.teacher_key)?' checked':'';
    const hidden=q&&!teacherSearchText(row).includes(q)?' hiddenChoice':'';
    return `<label class="teacherChoice${row.unmapped?' unmapped':''}${hidden}" data-key="${esc(row.teacher_key)}"><input type="checkbox" value="${esc(row.teacher_key)}"${checked}><span><strong>${esc(row.display_name||row.assignment_label||row.teacher_key)}</strong>${row.display_name!==row.assignment_label&&row.assignment_label?`<div class="teacherMeta mono">${esc(row.assignment_label)}</div>`:''}<div class="teacherMeta">${esc(teacherMeta(row))}</div></span></label>`;
  }).join('')||'<div class="empty">No Teacher Assignment entries are available.</div>';
  renderSelectedSummary();
}

function renderSelectedSummary(){
  const rows=TEACHERS.filter(r=>SELECTED.has(r.teacher_key));
  selectedSummary.innerHTML=rows.length
    ? `<strong>${rows.length} selected:</strong> ${rows.map(r=>esc(r.display_name||r.assignment_label)).join(' · ')}`
    : 'No teachers selected.';
}

function buildGroups(){
  const dept=new Set(),grade=new Set();TEACHERS.forEach(r=>{(r.departments||[]).forEach(v=>dept.add(v));(r.grade_teams||[]).forEach(v=>grade.add(v))});
  const options=['<option value="">Add a group…</option>'];
  [...grade].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})).forEach(v=>options.push(`<option value="grade:${esc(v)}">Grade Team · ${esc(v)}</option>`));
  [...dept].sort((a,b)=>String(a).localeCompare(String(b),undefined,{sensitivity:'base'})).forEach(v=>options.push(`<option value="department:${esc(v)}">Department · ${esc(v)}</option>`));
  groupSelect.innerHTML=options.join('');
}

function selectGroup(value){
  const [kind,...rest]=String(value||'').split(':');const target=rest.join(':');if(!kind||!target)return;
  for(const row of TEACHERS){const list=kind==='grade'?(row.grade_teams||[]):kind==='department'?(row.departments||[]):[];if(list.some(v=>String(v)===target))SELECTED.add(row.teacher_key)}
  groupSelect.value='';renderTeachers();updateUrl();
}

function renderKpis(model){const s=model?.summary||{};$('kpiSelected').textContent=Number(s.selected_teachers||0);$('kpiGaps').textContent=Number(s.gap_count||0);$('kpiStudents').textContent=Number(s.students_in_gap_sections||0);$('kpiStillStaffed').textContent=Number(s.still_staffed_count||0);$('gapCountTag').textContent=`${Number(s.gap_count||0)} gap${Number(s.gap_count||0)===1?'':'s'}`}
function teacherNames(row,field){const values=row?.[field]||[];return values.length?values.map(v=>esc(v)).join('<br>'):'—'}

function renderGaps(model){
  gapTable.innerHTML=tableHtml(model?.gaps||[],[
    {label:'Period',render:r=>`<div class="periodCell"><strong>${esc(r.period_local||'—')}</strong><span class="muted small">${esc(r.time_label||'')}</span></div>`},
    {label:'Section',render:r=>`<strong>${esc(r.section_name||'—')}</strong>${r.section_code?`<div class="muted small mono">${esc(r.section_code)}</div>`:''}`},
    {label:'Room',render:r=>esc(r.room||'—')},
    {label:'Students',render:r=>`<span class="mono">${Number(r.student_count||0)}</span>`},
    {label:'Absent / unavailable',render:r=>teacherNames(r,'absent_teachers')},
    {label:'Status',render:()=>tag('Needs coverage','warn')}
  ],SELECTED.size?'No coverage gaps were found for the selected teachers today.':'Select one or more absent teachers, then click “Show Today’s Gaps.”');
}

function renderTeacherStats(model){
  const rows=model?.teacher_stats||[];
  if(!rows.length){hide(teacherSummaryCard);teacherSummaryTable.innerHTML='';return}
  teacherSummaryTable.innerHTML=tableHtml(rows,[
    {label:'Teacher Assignment',render:r=>`<strong>${esc(r.display_name||r.assignment_label||r.teacher_key)}</strong>${r.assignment_label&&r.assignment_label!==r.display_name?`<div class="muted small mono">${esc(r.assignment_label)}</div>`:''}`},
    {label:'Meetings today',render:r=>`<span class="mono">${Number(r.meetings_today||0)}</span>`},
    {label:'Gaps created',render:r=>`<span class="mono">${Number(r.gaps_created||0)}</span>`},
    {label:'Still staffed',render:r=>`<span class="mono">${Number(r.still_staffed||0)}</span>`}
  ],'No selected teachers.');show(teacherSummaryCard);
}

function renderStillStaffed(model){
  const rows=model?.still_staffed||[];if(!rows.length){hide(stillStaffedDetails);stillStaffedTable.innerHTML='';return}
  stillStaffedTable.innerHTML=tableHtml(rows,[
    {label:'Period',render:r=>`<strong>${esc(r.period_local||'—')}</strong><div class="muted small">${esc(r.time_label||'')}</div>`},
    {label:'Section',render:r=>`<strong>${esc(r.section_name||'—')}</strong>`},
    {label:'Room',render:r=>esc(r.room||'—')},
    {label:'Selected absent',render:r=>teacherNames(r,'absent_teachers')},
    {label:'Teacher still assigned',render:r=>teacherNames(r,'remaining_teachers')}
  ],'');show(stillStaffedDetails);
}

function renderModel(model){
  MODEL=model;TEACHERS=Array.isArray(model?.teacher_options)?model.teacher_options:[];
  const valid=new Set(TEACHERS.map(r=>r.teacher_key));SELECTED=new Set((model?.selected_teacher_keys||[]).filter(k=>valid.has(k)));
  $('dateLine').textContent=`${fmtDay(model?.date)} · schedule source ${model?.schedule_date||'date unavailable'}`;
  $('viewerPill').textContent=ACCESS?.email||model?.viewer?.email||'—';
  if(model?.schedule_stale){staleBanner.textContent=`Coverage Planner stopped before calculating gaps because the Teacher Assignments schedule is for ${model.schedule_date}, not today (${model.date}). Refresh/push today’s schedule first.`;show(staleBanner)}else hide(staleBanner);
  buildGroups();renderTeachers();renderKpis(model);renderGaps(model);renderTeacherStats(model);renderStillStaffed(model);updateUrl();
}

async function loadPlanner({preserveSelection=true}={}){
  setError('');app.classList.add('loading');refreshBtn.disabled=true;showGapsBtn.disabled=true;
  try{
    const keys=preserveSelection?[...SELECTED]:selectedFromUrl();const u=new URL('/admin/coverage_planner',API_BASE);if(keys.length)u.searchParams.set('teachers',keys.join(','));
    const r=await adminFetch(u);const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.message||j?.error||`HTTP ${r.status}`);renderModel(j);
  }catch(e){setError(e?.message||e)}finally{app.classList.remove('loading');refreshBtn.disabled=false;showGapsBtn.disabled=false}
}

async function bootstrapAuthenticated(){ACCESS=await fetchAccess();if(!ACCESS?.can?.coverage_planner||!['admin','super_admin'].includes(String(ACCESS.role||'')))throw new Error('Coverage Planner is restricted to Admin and Super Admin accounts.');if(ACCESS?.view_as?.active)throw new Error('Exit View as Teacher before opening Coverage Planner.');hide(loginCard);show(app);SELECTED=new Set(selectedFromUrl());await loadPlanner({preserveSelection:true})}
async function onGoogleCredential(resp){try{loginOut.textContent='Signing in…';const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:resp.credential}).toString()});const j=await r.json().catch(()=>null);if(j?.sid)setStoredSid(j.sid);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);await bootstrapAuthenticated()}catch(e){show(loginCard);hide(app);loginOut.textContent=`Login failed: ${e?.message||e}`}}
async function trySession(){try{const r=await adminFetch('/admin/session/check');const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)return false;await bootstrapAuthenticated();return true}catch{return false}}

window.addEventListener('DOMContentLoaded',async()=>{
  refreshBtn.addEventListener('click',()=>loadPlanner({preserveSelection:true}));
  showGapsBtn.addEventListener('click',()=>loadPlanner({preserveSelection:true}));
  printBtn.addEventListener('click',()=>window.print());
  clearBtn.addEventListener('click',()=>{SELECTED.clear();renderTeachers();updateUrl();renderKpis({summary:{}});renderGaps({gaps:[]});hide(teacherSummaryCard);hide(stillStaffedDetails)});
  selectVisibleBtn.addEventListener('click',()=>{teacherList.querySelectorAll('.teacherChoice:not(.hiddenChoice) input[type="checkbox"]').forEach(cb=>SELECTED.add(cb.value));renderTeachers();updateUrl()});
  teacherSearch.addEventListener('input',renderTeachers);
  groupSelect.addEventListener('change',()=>selectGroup(groupSelect.value));
  teacherList.addEventListener('change',ev=>{const cb=ev.target.closest('input[type="checkbox"]');if(!cb)return;if(cb.checked)SELECTED.add(cb.value);else SELECTED.delete(cb.value);renderSelectedSummary();updateUrl()});
  if(await trySession())return;
  if(!GOOGLE_CLIENT_ID){loginOut.textContent='Missing google-client-id meta.';return}
  try{await new Promise((resolve,reject)=>{const started=Date.now();(function wait(){if(window.google?.accounts?.id)return resolve();if(Date.now()-started>8000)return reject(new Error('Google sign-in failed to load'));setTimeout(wait,50)})()});google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:onGoogleCredential,ux_mode:'popup',use_fedcm_for_prompt:true});google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});loginOut.textContent='—'}catch(e){loginOut.textContent=`Google init failed: ${e?.message||e}`}
});

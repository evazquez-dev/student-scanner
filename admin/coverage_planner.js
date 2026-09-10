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
const coveragePoolSelect = $('coveragePoolSelect');
const teacherList = $('teacherList');
const selectedSummary = $('selectedSummary');
const staleBanner = $('staleBanner');
const errorBanner = $('errorBanner');
const gapTable = $('gapTable');
const teacherSummaryCard = $('teacherSummaryCard');
const teacherSummaryTable = $('teacherSummaryTable');
const stillStaffedDetails = $('stillStaffedDetails');
const stillStaffedTable = $('stillStaffedTable');
const coveragePreviewCard = $('coveragePreviewCard');
const coveragePreviewName = $('coveragePreviewName');
const coveragePreviewMeta = $('coveragePreviewMeta');
const coveragePreviewTarget = $('coveragePreviewTarget');
const coveragePreviewTable = $('coveragePreviewTable');
const confirmCoverageBtn = $('confirmCoverageBtn');
const cancelCoverageBtn = $('cancelCoverageBtn');
const coverageAssignmentsCard = $('coverageAssignmentsCard');
const coverageAssignmentsTable = $('coverageAssignmentsTable');

let ACCESS = null;
let MODEL = null;
let SELECTED = new Set();
let TEACHERS = [];
let COVER_STAFF = [];
let PENDING_ASSIGNMENT = null;

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

function buildCoveragePools(){
  const dept=new Set(),grade=new Set();COVER_STAFF.forEach(r=>{if(r.department)dept.add(r.department);if(r.grade_team)grade.add(r.grade_team)});
  const current=coveragePoolSelect.value||'all';
  const options=['<option value="all">All staff</option>'];
  [...grade].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})).forEach(v=>options.push(`<option value="grade:${esc(v)}">Grade Team · ${esc(v)}</option>`));
  [...dept].sort((a,b)=>String(a).localeCompare(String(b),undefined,{sensitivity:'base'})).forEach(v=>options.push(`<option value="department:${esc(v)}">Department · ${esc(v)}</option>`));
  coveragePoolSelect.innerHTML=options.join('');
  if([...coveragePoolSelect.options].some(o=>o.value===current))coveragePoolSelect.value=current;
}

function selectGroup(value){
  const [kind,...rest]=String(value||'').split(':');const target=rest.join(':');if(!kind||!target)return;
  for(const row of TEACHERS){const list=kind==='grade'?(row.grade_teams||[]):kind==='department'?(row.departments||[]):[];if(list.some(v=>String(v)===target))SELECTED.add(row.teacher_key)}
  groupSelect.value='';renderTeachers();updateUrl();
}

function renderKpis(model){
  const s=model?.summary||{};
  $('kpiSelected').textContent=Number(s.selected_teachers||0);
  $('kpiGaps').textContent=Number(s.gap_count||0);
  $('kpiAssigned').textContent=Number(s.assigned_gap_count||0);
  $('kpiStudents').textContent=Number(s.students_in_gap_sections||0);
  $('kpiStillStaffed').textContent=Number(s.still_staffed_count||0);
  $('gapCountTag').textContent=`${Number(s.gap_count||0)} gap${Number(s.gap_count||0)===1?'':'s'}`;
}
function teacherNames(row,field){const values=row?.[field]||[];return values.length?values.map(v=>esc(v)).join('<br>'):'—'}

function coveragePoolMatches(staff){
  const value=String(coveragePoolSelect.value||'all');
  if(value==='all')return true;
  const [kind,...rest]=value.split(':');const target=rest.join(':');
  if(kind==='grade')return String(staff.grade_team||'')===target;
  if(kind==='department')return String(staff.department||'')===target;
  return true;
}

function staffDutyRows(staff,period){
  const row=(staff?.schedule||[]).find(r=>String(r.period_local||'').toUpperCase()===String(period||'').toUpperCase());
  return Array.isArray(row?.duties)?row.duties:[];
}

function coverageStaffEligible(staff,gap){
  if(!staff||staff.is_absent||!coveragePoolMatches(staff))return false;
  const duties=staffDutyRows(staff,gap.period_local);
  return !duties.some(d=>!(d?.kind==='coverage'&&String(d?.gap_key||'')===String(gap.key||'')));
}

function coverageStaffLabel(staff){
  const bits=[];if(staff.department)bits.push(staff.department);if(staff.grade_team)bits.push(`GT ${staff.grade_team}`);
  return `${staff.name||staff.email}${bits.length?` — ${bits.join(' · ')}`:''}`;
}

function coverageSelectHtml(gap){
  const assigned=gap?.coverage_assignment||null;
  const eligible=COVER_STAFF.filter(staff=>coverageStaffEligible(staff,gap));
  const eligibleEmails=new Set(eligible.map(s=>s.email));
  let options='<option value="">Choose coverage staff…</option>';
  for(const staff of eligible){
    const selected=assigned?.assigned_to_email===staff.email?' selected':'';
    options+=`<option value="${esc(staff.email)}"${selected}>${esc(coverageStaffLabel(staff))}</option>`;
  }
  if(assigned?.assigned_to_email&&!eligibleEmails.has(assigned.assigned_to_email)){
    options+=`<option value="${esc(assigned.assigned_to_email)}" selected>${esc(assigned.assigned_to_name||assigned.assigned_to_email)} — currently assigned (conflict)</option>`;
  }
  const current=assigned?`<div class="coverageCurrent">${tag('Assigned','good')} <strong>${esc(assigned.assigned_to_name||assigned.assigned_to_email)}</strong></div>`:'';
  return `${current}<select class="coverageSelect" data-gap-key="${esc(gap.key)}" aria-label="Coverage staff for ${esc(gap.period_local)} ${esc(gap.room)}">${options}</select>`;
}

function renderGaps(model){
  gapTable.innerHTML=tableHtml(model?.gaps||[],[
    {label:'Period',render:r=>`<div class="periodCell"><strong>${esc(r.period_local||'—')}</strong><span class="muted small">${esc(r.time_label||'')}</span>${r.gap_kind==='advisory'?`<span class="gapKind">Advisory</span>`:''}</div>`},
    {label:'Section / Duty',render:r=>`<strong>${esc(r.section_name||'—')}</strong>${r.section_code?`<div class="muted small mono">${esc(r.section_code)}</div>`:''}`},
    {label:'Room',render:r=>esc(r.room||'—')},
    {label:'Students',render:r=>r.gap_kind==='advisory'?'—':`<span class="mono">${Number(r.student_count||0)}</span>`},
    {label:'Absent / unavailable',render:r=>teacherNames(r,'absent_teachers')},
    {label:'Coverage',render:r=>coverageSelectHtml(r)},
    {label:'Status',render:r=>r.coverage_assignment?tag('Covered','good'):tag('Needs coverage','warn')}
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
    {label:'Section / Duty',render:r=>`<strong>${esc(r.section_name||'—')}</strong>${r.gap_kind==='advisory'?'<div class="muted small">Advisory room already has another staff member.</div>':''}`},
    {label:'Room',render:r=>esc(r.room||'—')},
    {label:'Selected absent',render:r=>teacherNames(r,'absent_teachers')},
    {label:'Staff still assigned',render:r=>teacherNames(r,'remaining_teachers')}
  ],'');show(stillStaffedDetails);
}

function renderCoverageAssignments(model){
  const rows=model?.coverage_assignments||[];
  if(!rows.length){hide(coverageAssignmentsCard);coverageAssignmentsTable.innerHTML='';return}
  coverageAssignmentsTable.innerHTML=tableHtml(rows,[
    {label:'Period',render:r=>`<strong>${esc(r.period_local||'—')}</strong><div class="muted small">${esc(r.time_label||'')}</div>`},
    {label:'Coverage duty',render:r=>`<strong>${esc(r.section_name||'Coverage')}</strong>${r.section_code?`<div class="muted small mono">${esc(r.section_code)}</div>`:''}`},
    {label:'Room',render:r=>esc(r.room||'—')},
    {label:'Covering staff',render:r=>`<strong>${esc(r.assigned_to_name||r.assigned_to_email)}</strong><div class="muted small">${esc(r.assigned_to_email||'')}</div>`},
    {label:'Absent / unavailable',render:r=>(r.absent_teachers||[]).map(v=>esc(v)).join('<br>')||'—'},
    {label:'Action',render:r=>`<button class="btn small removeCoverageBtn" type="button" data-gap-key="${esc(r.gap_key)}">Remove</button>`}
  ],'');show(coverageAssignmentsCard);
}

function dutyHtml(duty){
  const kind=String(duty?.kind||'class');
  const label=kind==='coverage'?'Coverage':kind==='advisory'?'Advisory':'Class';
  return `<div class="previewDuty ${esc(kind)}"><span class="previewDutyTag">${esc(label)}</span><strong>${esc(duty?.title||duty?.section_name||'Scheduled duty')}</strong>${duty?.room?`<span>Room ${esc(duty.room)}</span>`:''}${duty?.section_code?`<span class="mono">${esc(duty.section_code)}</span>`:''}</div>`;
}

function renderCoveragePreview(gap,staff){
  if(!gap||!staff){PENDING_ASSIGNMENT=null;hide(coveragePreviewCard);return}
  PENDING_ASSIGNMENT={gap,staff};
  coveragePreviewName.textContent=staff.name||staff.email;
  const meta=[staff.email,staff.department,staff.grade_team?`Grade Team ${staff.grade_team}`:''].filter(Boolean).join(' · ');
  coveragePreviewMeta.textContent=meta||'All staff';
  coveragePreviewTarget.innerHTML=`Proposed assignment: <strong>${esc(gap.period_local)}</strong> · Room <strong>${esc(gap.room)}</strong> · ${esc(gap.section_name||'Coverage')}`;
  const rows=(staff.schedule||[]).map(row=>{
    const existing=Array.isArray(row.duties)?row.duties:[];
    const isTarget=String(row.period_local||'').toUpperCase()===String(gap.period_local||'').toUpperCase();
    const alreadyHere=existing.some(d=>d?.kind==='coverage'&&String(d?.gap_key||'')===String(gap.key||''));
    const proposed=isTarget&&!alreadyHere?[...existing,{kind:'coverage',title:gap.section_name||'Coverage',section_name:gap.section_name||'Coverage',section_code:gap.section_code||'',room:gap.room,gap_key:gap.key}]:existing;
    return {...row,existing,proposed,isTarget};
  });
  coveragePreviewTable.innerHTML=tableHtml(rows,[
    {label:'Period',render:r=>`<strong>${esc(r.period_local)}</strong><div class="muted small">${esc(r.time_label||'')}</div>`},
    {label:'Current schedule',render:r=>r.existing.length?r.existing.map(dutyHtml).join(''):'<span class="openSlot">Open</span>'},
    {label:'With this coverage',render:r=>r.proposed.length?r.proposed.map(dutyHtml).join(''):'<span class="openSlot">Open</span>'}
  ],'No periods are configured.');
  confirmCoverageBtn.textContent=gap.coverage_assignment?.assigned_to_email===staff.email?'Confirm current assignment':`Assign ${staff.name||staff.email}`;
  show(coveragePreviewCard);
  coveragePreviewCard.scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function postCoverage(action,payload={}){
  const r=await adminFetch('/admin/coverage_planner',{
    method:'POST',
    headers:{'content-type':'application/json;charset=UTF-8'},
    body:JSON.stringify({action,selected_teacher_keys:[...SELECTED],...payload})
  });
  const j=await r.json().catch(()=>null);
  if(!r.ok||!j?.ok)throw new Error(j?.message||j?.error||`HTTP ${r.status}`);
  return j;
}

async function assignPendingCoverage(){
  if(!PENDING_ASSIGNMENT)return;
  const {gap,staff}=PENDING_ASSIGNMENT;
  confirmCoverageBtn.disabled=true;setError('');
  try{
    await postCoverage('assign',{gap_key:gap.key,staff_email:staff.email});
    PENDING_ASSIGNMENT=null;hide(coveragePreviewCard);
    await loadPlanner({preserveSelection:true});
  }catch(e){setError(e?.message||e)}finally{confirmCoverageBtn.disabled=false}
}

async function removeCoverage(gapKey){
  if(!gapKey)return;
  setError('');
  try{
    await postCoverage('remove',{gap_key:gapKey});
    if(PENDING_ASSIGNMENT?.gap?.key===gapKey){PENDING_ASSIGNMENT=null;hide(coveragePreviewCard)}
    await loadPlanner({preserveSelection:true});
  }catch(e){setError(e?.message||e)}
}

function renderModel(model){
  MODEL=model;TEACHERS=Array.isArray(model?.teacher_options)?model.teacher_options:[];COVER_STAFF=Array.isArray(model?.coverage_staff_options)?model.coverage_staff_options:[];
  const valid=new Set(TEACHERS.map(r=>r.teacher_key));SELECTED=new Set((model?.selected_teacher_keys||[]).filter(k=>valid.has(k)));
  $('dateLine').textContent=`${fmtDay(model?.date)} · schedule source ${model?.schedule_date||'date unavailable'}`;
  $('viewerPill').textContent=ACCESS?.email||model?.viewer?.email||'—';
  const warnings=[];
  if(model?.schedule_stale)warnings.push(`Coverage Planner stopped before calculating class gaps because Teacher Assignments is for ${model.schedule_date}, not today (${model.date}). Refresh/push today’s schedule first.`);
  if(model?.advisor_schedule_stale)warnings.push(`Advisory coverage was not calculated because the advisory/class source is for ${model.advisor_source_date}, not today (${model.date}).`);
  if(warnings.length){staleBanner.textContent=warnings.join(' ');show(staleBanner)}else hide(staleBanner);
  buildGroups();buildCoveragePools();renderTeachers();renderKpis(model);renderGaps(model);renderTeacherStats(model);renderStillStaffed(model);renderCoverageAssignments(model);updateUrl();
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
  clearBtn.addEventListener('click',()=>{SELECTED.clear();renderTeachers();updateUrl();renderKpis({summary:{}});renderGaps({gaps:[]});hide(teacherSummaryCard);hide(stillStaffedDetails);hide(coveragePreviewCard)});
  selectVisibleBtn.addEventListener('click',()=>{teacherList.querySelectorAll('.teacherChoice:not(.hiddenChoice) input[type="checkbox"]').forEach(cb=>SELECTED.add(cb.value));renderTeachers();updateUrl()});
  teacherSearch.addEventListener('input',renderTeachers);
  groupSelect.addEventListener('change',()=>selectGroup(groupSelect.value));
  coveragePoolSelect.addEventListener('change',()=>{renderGaps(MODEL||{});hide(coveragePreviewCard);PENDING_ASSIGNMENT=null});
  teacherList.addEventListener('change',ev=>{const cb=ev.target.closest('input[type="checkbox"]');if(!cb)return;if(cb.checked)SELECTED.add(cb.value);else SELECTED.delete(cb.value);renderSelectedSummary();updateUrl()});
  gapTable.addEventListener('change',ev=>{
    const select=ev.target.closest('.coverageSelect');if(!select)return;
    const gap=(MODEL?.gaps||[]).find(row=>String(row.key)===String(select.dataset.gapKey));
    const staff=COVER_STAFF.find(row=>row.email===select.value);
    if(!select.value||!gap||!staff){PENDING_ASSIGNMENT=null;hide(coveragePreviewCard);return}
    renderCoveragePreview(gap,staff);
  });
  coverageAssignmentsTable.addEventListener('click',ev=>{const btn=ev.target.closest('.removeCoverageBtn');if(btn)removeCoverage(btn.dataset.gapKey)});
  confirmCoverageBtn.addEventListener('click',assignPendingCoverage);
  cancelCoverageBtn.addEventListener('click',()=>{PENDING_ASSIGNMENT=null;hide(coveragePreviewCard);renderGaps(MODEL||{})});
  if(await trySession())return;
  if(!GOOGLE_CLIENT_ID){loginOut.textContent='Missing google-client-id meta.';return}
  try{await new Promise((resolve,reject)=>{const started=Date.now();(function wait(){if(window.google?.accounts?.id)return resolve();if(Date.now()-started>8000)return reject(new Error('Google sign-in failed to load'));setTimeout(wait,50)})()});google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:onGoogleCredential,ux_mode:'popup',use_fedcm_for_prompt:true});google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});loginOut.textContent='—'}catch(e){loginOut.textContent=`Google init failed: ${e?.message||e}`}
});

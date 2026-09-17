// EAGLENEST_GRADES_DASHBOARD_V1
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'grades_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';
const $ = (id) => document.getElementById(id);

const loginCard=$('loginCard'),loginOut=$('loginOut'),app=$('app'),snapshotMeta=$('snapshotMeta'),passingPill=$('passingPill'),viewerPill=$('viewerPill');
const refreshBtn=$('refreshBtn'),myGroups=$('myGroups'),leadershipWrap=$('leadershipWrap'),leadershipGroups=$('leadershipGroups'),selectedGroups=$('selectedGroups');
const allMineBtn=$('allMineBtn'),clearGroupsBtn=$('clearGroupsBtn'),searchInput=$('searchInput'),gradeFilter=$('gradeFilter'),statusFilter=$('statusFilter');
const adminGroupsWrap=$('adminGroupsWrap'),adminGroupPicker=$('adminGroupPicker'),results=$('results'),resultMeta=$('resultMeta');
const errorCard=$('errorCard'),errorOut=$('errorOut'),studentDialog=$('studentDialog'),studentDialogClose=$('studentDialogClose'),studentDialogTitle=$('studentDialogTitle'),studentDialogMeta=$('studentDialogMeta'),studentCurrent=$('studentCurrent'),studentHistory=$('studentHistory');

let ACCESS=null,OVERVIEW=null,LAST_RESULTS=null;
const SELECTED=new Set();
let loadTimer=null;

function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function getStoredSid(){try{return String(sessionStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem('ss_admin_session_sid_v1')||'').trim()}catch{return''}}
function setStoredSid(sid){const v=String(sid||'').trim();if(!v)return;try{sessionStorage.setItem(ADMIN_SESSION_KEY,v);localStorage.setItem(ADMIN_SESSION_KEY,v);localStorage.setItem('ss_admin_session_sid_v1',v)}catch{}}
function clearStoredSid(){try{sessionStorage.removeItem(ADMIN_SESSION_KEY);localStorage.removeItem(ADMIN_SESSION_KEY)}catch{}}
function stashSid(resp){try{const sid=String(resp?.headers?.get(ADMIN_SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim();if(sid)setStoredSid(sid)}catch{}}
async function adminFetch(pathOrUrl,init={}){const url=pathOrUrl instanceof URL?pathOrUrl:new URL(pathOrUrl,API_BASE);const headers=new Headers(init.headers||{});const sid=getStoredSid();if(sid&&!headers.has(ADMIN_SESSION_HEADER))headers.set(ADMIN_SESSION_HEADER,sid);const resp=await fetch(url,{...init,headers,credentials:'include',cache:'no-store'});stashSid(resp);if(resp.status===401){const j=await resp.clone().json().catch(()=>null);if(['expired','no_session','bad_session'].includes(String(j?.error||'')))clearStoredSid()}return resp}
function setError(message){const text=String(message||'').trim();errorOut.textContent=text;errorCard.hidden=!text}
function passingScore(){return Number(OVERVIEW?.settings?.passing_score ?? 70)}
function gradeKind(grade){const n=Number(grade?.grade_numeric);if(!Number.isFinite(n))return'missing';return n>=passingScore()?'pass':'fail'}
function fmtGrade(grade){return Number.isFinite(Number(grade?.grade_numeric))?`${Number(grade.grade_numeric).toFixed(Number(grade.grade_numeric)%1?1:0)}%`:(grade?.grade_value||'—')}
function fmtDate(v){const s=String(v||'').trim();if(!s)return'—';const d=new Date(`${s}T12:00:00`);return Number.isFinite(d.getTime())?d.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}):s}
function debounceLoad(){clearTimeout(loadTimer);loadTimer=setTimeout(loadStudents,180)}

async function fetchAccess(){const r=await adminFetch('/admin/access');const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);return j}
async function fetchOverview(){const r=await adminFetch('/admin/grades/overview');const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);return j}

function groupMap(){const map=new Map();for(const row of [...(OVERVIEW?.my_groups||[]),...(OVERVIEW?.leadership_groups||[]),...(OVERVIEW?.all_groups||[])])map.set(row.id,row);map.set('mine:all',{id:'mine:all',type:'mine',label:'All My Students'});return map}
function selectedLabels(){const map=groupMap();return [...SELECTED].map(id=>map.get(id)).filter(Boolean)}
function syncChipStates(){document.querySelectorAll('[data-grade-group]').forEach(btn=>btn.classList.toggle('active',SELECTED.has(btn.dataset.gradeGroup)));renderSelected();}
function toggleGroup(id){if(!id)return;const map=groupMap();const row=map.get(id);if(SELECTED.has(id)){SELECTED.delete(id)}else{
  if(row?.type==='course'){for(const child of row.child_section_ids||[])SELECTED.delete(child)}
  if(row?.type==='section'&&row.course_code){SELECTED.delete(`course:${row.course_code}`);SELECTED.delete(`mycourse:${row.course_code}`);}
  SELECTED.add(id);
}
syncChipStates();loadStudents()}
function chip(row,labelOverride=''){const btn=document.createElement('button');btn.type='button';btn.className='groupChip';btn.dataset.gradeGroup=row.id;btn.innerHTML=`${esc(labelOverride||row.label)} <span class="count">${Number(row.student_count||0)}</span>`;btn.addEventListener('click',()=>toggleGroup(row.id));return btn}

function renderMyGroups(){myGroups.replaceChildren();const groups=OVERVIEW?.my_groups||[];const advisories=groups.filter(g=>g.type==='advisory');if(advisories.length){const block=document.createElement('div');block.className='groupBlock';block.innerHTML='<div class="groupTitle">Advisory</div>';const row=document.createElement('div');row.className='chipRow';advisories.forEach(g=>row.appendChild(chip(g)));block.appendChild(row);myGroups.appendChild(block)}
  const courses=groups.filter(g=>g.type==='course');const sections=groups.filter(g=>g.type==='section');if(courses.length){const block=document.createElement('div');block.className='groupBlock';block.innerHTML='<div class="groupTitle">Courses & Sections</div>';for(const course of courses){const cluster=document.createElement('div');cluster.className='courseCluster';const title=document.createElement('div');title.className='courseName';title.textContent=course.label;const row=document.createElement('div');row.className='courseSections';row.appendChild(chip(course,`All ${course.label}`));for(const s of sections.filter(x=>x.course_code===course.course_code))row.appendChild(chip(s,s.section_code||s.label));cluster.append(title,row);block.appendChild(cluster)}myGroups.appendChild(block)}
  if(!groups.length)myGroups.innerHTML='<div class="empty">No advisory or academic section is currently mapped to your staff account.</div>';
  const leaders=OVERVIEW?.leadership_groups||[];leadershipWrap.hidden=!leaders.length;leadershipGroups.replaceChildren();leaders.forEach(g=>leadershipGroups.appendChild(chip(g)));
  syncChipStates();
}

function renderSelected(){selectedGroups.replaceChildren();const labels=selectedLabels();if(!labels.length){selectedGroups.innerHTML='<span class="muted small">No groups selected.</span>';return}for(const row of labels){const el=document.createElement('span');el.className='chip selectedChip';el.innerHTML=`${esc(row.label)} <button type="button" aria-label="Remove ${esc(row.label)}">×</button>`;el.querySelector('button').addEventListener('click',()=>toggleGroup(row.id));selectedGroups.appendChild(el)}}

function renderFilters(){const pass=passingScore();passingPill.textContent=`Passing: ${pass}%+`;statusFilter.innerHTML=`<option value="all">All grade statuses</option><option value="below_passing">Below ${esc(pass)}%</option><option value="passing">Passing (${esc(pass)}%+)</option><option value="missing">Missing numeric grade</option>`;$('kpiBelowLabel').textContent=`below ${pass}%`;$('kpiPassingLabel').textContent=`${pass}% and above`;
  gradeFilter.innerHTML='<option value="">All grades</option>';for(const grade of OVERVIEW?.filter_options?.grade_levels||[]){const o=new Option(`Grade ${grade}`,grade);gradeFilter.appendChild(o)}
  const all=OVERVIEW?.all_groups||[];adminGroupsWrap.hidden=!all.length;adminGroupPicker.replaceChildren();if(all.length){const ordered=all.filter(g=>['school','advisory','course','section'].includes(g.type)&&!String(g.id||'').startsWith('mycourse:')&&g.id!=='mine:all');for(const g of ordered){const prefix=g.type==='section'?'Section':g.type==='course'?'Course':g.type==='advisory'?'Advisory':'Scope';const o=new Option(`${prefix}: ${g.label}${g.section_code?` [${g.section_code}]`:''}`,g.id);adminGroupPicker.appendChild(o)}}
}

function renderOverview(){const cur=OVERVIEW?.current||{};snapshotMeta.textContent=cur.configured?`${cur.marking_period||'Current'} · Snapshot ${fmtDate(cur.snapshot_date)} · ${Number(cur.student_count||0)} students · ${Number(cur.row_count||0)} grade rows`:'Grade Hub has not pushed a current dataset yet.';viewerPill.textContent=OVERVIEW?.viewer?.view_as?.active?`Viewing as ${OVERVIEW?.viewer?.name||OVERVIEW?.viewer?.email}`:(OVERVIEW?.viewer?.name||OVERVIEW?.viewer?.email||'Staff');renderMyGroups();renderFilters()}

function gradeChipsHtml(grades){if(!grades?.length)return'<span class="muted">No grade rows</span>';return `<div class="gradeChips">${grades.map(g=>`<span class="gradeChip ${gradeKind(g)}" title="${esc(g.course_code||'')}"><strong>${esc(g.course_name||g.academic_course_code||g.course_code||'Course')}</strong> ${esc(fmtGrade(g))}</span>`).join('')}</div>`}
function renderRows(data){LAST_RESULTS=data;const s=data?.summary||{};$('kpiStudents').textContent=Number(s.students||0);$('kpiBelow').textContent=Number(s.below_passing_students||0);$('kpiPassing').textContent=Number(s.passing_students||0);$('kpiMissing').textContent=Number(s.missing_grade_students||0);resultMeta.textContent=`${Number(data?.returned_student_count||0)} student(s) shown from ${Number(data?.selected_student_count||0)} in the selected group union.`;
  if(!data?.rows?.length){results.innerHTML='<div class="empty">No students match the current groups and filters.</div>';return}
  results.innerHTML=`<table><thead><tr><th>Student</th><th>Grade</th><th>Current Grades</th><th>Below ${esc(passingScore())}%</th><th>Lowest</th></tr></thead><tbody>${data.rows.map(r=>`<tr><td><button class="studentBtn" data-osis="${esc(r.osis)}" type="button">${esc(r.name||r.osis)}</button><div class="muted small mono">${esc(r.osis)}</div></td><td>${esc(r.grade_level||'—')}</td><td>${gradeChipsHtml(r.grades)}</td><td>${r.below_passing_count?`<span class="statusBad">${Number(r.below_passing_count)}</span>`:'<span class="statusGood">0</span>'}</td><td>${Number.isFinite(Number(r.lowest_grade))?`${esc(r.lowest_grade)}%`:'—'}</td></tr>`).join('')}</tbody></table>`;
  results.querySelectorAll('.studentBtn').forEach(btn=>btn.addEventListener('click',()=>openStudent(btn.dataset.osis)));
}

async function loadStudents(){if(!OVERVIEW)return;setError('');const url=new URL('/admin/grades/students',API_BASE);for(const id of SELECTED)url.searchParams.append('group',id);if(searchInput.value.trim())url.searchParams.set('q',searchInput.value.trim());if(gradeFilter.value)url.searchParams.set('grade',gradeFilter.value);if(statusFilter.value)url.searchParams.set('status',statusFilter.value);results.innerHTML='<div class="empty">Loading grades…</div>';try{const r=await adminFetch(url);const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);renderRows(j)}catch(e){setError(e?.message||e);results.innerHTML='<div class="empty">Could not load grade rows.</div>'}}

function renderCurrentStudent(student){const name=[student?.first,student?.last].filter(Boolean).join(' ')||student?.osis||'Student';studentDialogTitle.textContent=name;studentDialogMeta.textContent=`Grade ${student?.grade_level||'—'} · OSIS ${student?.osis||'—'} · Passing threshold ${passingScore()}%`;studentCurrent.innerHTML=`<div class="currentGrid">${(student?.grades||[]).map(g=>`<article class="currentCourse"><div class="muted small">${esc(g.academic_course_code||g.course_code||'')}</div><div>${esc(g.course_name||'Course')}</div><strong class="${gradeKind(g)==='fail'?'statusBad':gradeKind(g)==='pass'?'statusGood':''}">${esc(fmtGrade(g))}</strong></article>`).join('')||'<div class="empty">No current grades.</div>'}</div>`}
function renderHistory(history){const snapshots=history?.snapshots||[];if(!snapshots.length){studentHistory.innerHTML='<div class="empty">No historical grade snapshots are stored for this student yet.</div>';return}studentHistory.innerHTML=snapshots.map((s,i)=>`<details class="historySnapshot" ${i===0?'open':''}><summary>${esc(s.marking_period||'Snapshot')} · ${esc(fmtDate(s.snapshot_date))} · ${Number(s.below_passing_count||0)} below ${esc(passingScore())}%</summary><div class="gradeChips" style="margin-top:10px">${(s.grades||[]).map(g=>`<span class="gradeChip ${gradeKind(g)}"><strong>${esc(g.course_name||g.course_code)}</strong> ${esc(fmtGrade(g))}</span>`).join('')}</div></details>`).join('')}
async function openStudent(osis){studentDialogTitle.textContent='Loading…';studentDialogMeta.textContent='';studentCurrent.innerHTML='';studentHistory.innerHTML='<div class="empty">Loading history…</div>';studentDialog.showModal();try{const [curR,histR]=await Promise.all([adminFetch(`/admin/grades/student?osis=${encodeURIComponent(osis)}`),adminFetch(`/admin/grades/student/history?osis=${encodeURIComponent(osis)}`)]);const cur=await curR.json().catch(()=>null),hist=await histR.json().catch(()=>null);if(!curR.ok||!cur?.ok)throw new Error(cur?.error||`HTTP ${curR.status}`);renderCurrentStudent(cur.student);if(histR.ok&&hist?.ok)renderHistory(hist);else studentHistory.innerHTML=`<div class="empty">History unavailable: ${esc(hist?.error||`HTTP ${histR.status}`)}</div>`}catch(e){studentDialogTitle.textContent='Student Grades';studentCurrent.innerHTML=`<div class="empty">${esc(e?.message||e)}</div>`}}

async function bootstrap(){ACCESS=await fetchAccess();if(!ACCESS?.can?.grades)throw new Error('forbidden');OVERVIEW=await fetchOverview();loginCard.hidden=true;app.hidden=false;SELECTED.clear();for(const id of OVERVIEW?.default_group_ids||[])SELECTED.add(id);renderOverview();await loadStudents()}
async function startPage(){
  try{ACCESS=await fetchAccess()}catch(e){await initLogin();return}
  if(!ACCESS?.can?.grades){loginCard.hidden=true;app.hidden=false;setError('Your EagleNEST account does not have access to Grades.');return}
  try{OVERVIEW=await fetchOverview();loginCard.hidden=true;app.hidden=false;SELECTED.clear();for(const id of OVERVIEW?.default_group_ids||[])SELECTED.add(id);renderOverview();await loadStudents()}catch(e){loginCard.hidden=true;app.hidden=false;setError(e?.message||e)}
}
async function waitForGoogle(timeout=8000){const start=Date.now();while(!window.google?.accounts?.id){if(Date.now()-start>timeout)throw new Error('Google sign-in failed to load');await new Promise(r=>setTimeout(r,50))}return window.google.accounts.id}
async function initLogin(){loginCard.hidden=false;app.hidden=true;loginOut.textContent='Please sign in…';try{const gsi=await waitForGoogle();gsi.initialize({client_id:GOOGLE_CLIENT_ID,callback:onGoogleCredential,ux_mode:'popup',use_fedcm_for_prompt:true});gsi.renderButton($('g_id_signin'),{theme:'outline',size:'large'})}catch(e){loginOut.textContent=e?.message||e}}
async function onGoogleCredential(resp){loginOut.textContent='Signing in…';try{const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:resp.credential}).toString()});const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);if(j?.sid)setStoredSid(j.sid);await bootstrap()}catch(e){loginOut.textContent=`Sign-in failed: ${e?.message||e}`}}

allMineBtn.addEventListener('click',()=>{SELECTED.clear();SELECTED.add('mine:all');syncChipStates();loadStudents()});clearGroupsBtn.addEventListener('click',()=>{SELECTED.clear();syncChipStates();loadStudents()});refreshBtn.addEventListener('click',async()=>{try{OVERVIEW=await fetchOverview();renderOverview();await loadStudents()}catch(e){setError(e?.message||e)}});searchInput.addEventListener('input',debounceLoad);gradeFilter.addEventListener('change',loadStudents);statusFilter.addEventListener('change',loadStudents);adminGroupPicker.addEventListener('change',()=>{SELECTED.clear();for(const opt of adminGroupPicker.selectedOptions)SELECTED.add(opt.value);syncChipStates();loadStudents()});studentDialogClose.addEventListener('click',()=>studentDialog.close());

window.addEventListener('DOMContentLoaded',startPage);

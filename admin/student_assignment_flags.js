'use strict';
// EAGLENEST_STUDENT_ASSIGNMENT_FLAGS_V1
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const CLIENT_ID=document.querySelector('meta[name="google-client-id"]')?.content||'';
const FLAG_NAMES={M:'Missing',A:'Absent',I:'Incomplete'};
const FLAG_KEYS=['M','A','I'];
let REQUEST_ID=0, SEARCH_TIMER=null;
function sid(){return window.EAGLENEST_AUTH?.getSid?.()||'';}
async function api(path){
  const h={};if(sid())h['x-admin-session']=sid();
  const r=await fetch(new URL(path,API_BASE),{headers:h,credentials:'include',cache:'no-store'});
  const next=r.headers.get('x-admin-session');if(next)window.EAGLENEST_AUTH?.setSid?.(next);
  const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);
  return j;
}
function errorMessage(msg){$('error').hidden=!msg;$('error').textContent=String(msg||'');}
async function searchStudents(){
  const request=++REQUEST_ID;
  const q=$('studentSearch').value.trim();
  $('report').hidden=true;$('printReport').hidden=true;$('studentMatches').innerHTML='';
  errorMessage('');
  if(q.replace(/[%_\\]/g,'').length<2){$('searchMessage').textContent='Enter at least two characters.';return;}
  $('searchMessage').textContent='Searching…';
  try{
    const data=await api('/admin/gradebook-analytics/student-flags/search?q='+encodeURIComponent(q));
    if(request!==REQUEST_ID)return;
    $('snapshotMeta').textContent=`Published snapshot ${data.snapshot_date||'—'} · Read only`;
    if(data.index_ready===false){$('searchMessage').textContent='Student flag index not available for the current snapshot. Deploy Cloud Run and select Republish analytics.';return;}
    const people=data.students||[];
    $('searchMessage').textContent=people.length?`${people.length} matching student(s) in your accessible sections`:'No matching students in your accessible sections.';
    $('studentMatches').innerHTML=people.map(person=>
      `<button class="flagStudentChoice" role="option" data-key="${esc(person.student_key)}" type="button"><span><strong>${esc(person.name)}</strong>${person.student_number?`<small>Student number ${esc(person.student_number)}</small>`:''}</span><small>${Number(person.section_count)||0} section(s)</small></button>`
    ).join('');
  }catch(e){if(request===REQUEST_ID)errorMessage('Unable to search students: '+e.message);}
}
function reportTable(assignments){
  return `<div class="flagTableWrap"><table class="flagTable"><thead><tr><th>Due</th><th>Assignment</th><th>Entry</th><th>Out of</th><th>Percentage</th></tr></thead><tbody>`+
    assignments.map(a=>`<tr><td>${esc(a.due||'—')}</td><td>${esc(a.name||'Unnamed assignment')}${(a.flags||'').length>1?`<div class="flagNote">Also flagged: ${[...String(a.flags)].filter(f=>FLAG_NAMES[f]).map(f=>FLAG_NAMES[f]).join(', ')}</div>`:''}</td><td class="flagScore">${a.entry!==''&&a.entry!=null?esc(a.entry):'—'}</td><td>${a.max==null?'—':esc(a.max)}</td><td>${a.percent==null?'—':esc(Number(a.percent).toFixed(1)+'%')}</td></tr>`).join('')+
    '</tbody></table></div>';
}
function renderReport(data){
  window.EAGLENEST_CURRENT_FLAG_REPORT=data; // read-only single-report print projection
  const s=data.summary||{},student=data.student||{};
  $('reportName').textContent=student.name||'Student';
  $('reportScope').textContent=(student.number?`Student number: ${student.number} · `:'')+`Snapshot ${data.snapshot_date||'—'} · ${Number(s.section_count)||0} accessible section(s)`;
  $('flagSummary').innerHTML=[['Assignments',s.unique_assignments],['Missing',s.missing],['Absent',s.absent],['Incomplete',s.incomplete]]
    .map(([label,count])=>`<div class="flagCount"><strong>${Number(count)||0}</strong><small>${esc(label)}</small></div>`).join('');
  const sections=data.sections||[];
  const nonempty=sections.filter(section=>Number(section.unique_assignment_count)>0);
  $('reportBody').innerHTML=nonempty.length?nonempty.map(section=>
    `<section class="gbCard flagSection"><h3>${esc(section.section_code||section.course_number)}</h3><p class="flagSectionMeta">${esc(section.teacher_name||'')} · ${section.unique_assignment_count} flagged assignment(s)</p><div class="flagGroups">`+
      (section.by_flag||[]).filter(type=>type.count>0).map(type=>
        `<div class="flagTypeGroup"><h4><span class="flagTag flagTag${esc(type.code)}">${esc(FLAG_NAMES[type.code]||type.code)}</span> ${type.count} assignment(s)</h4>`+
        (type.categories||[]).map(cat=>`<h5 class="flagCategoryTitle">${esc(cat.category||'Uncategorized')}</h5>${reportTable(cat.assignments||[])}`).join('')+
        '</div>'
      ).join('')+
    '</div></section>'
  ).join(''):'<div class="gbCard flagZero">No Missing, Absent, or Incomplete flags in this student’s accessible sections for the published snapshot.</div>';
  $('report').hidden=false;$('printReport').hidden=false;
}
async function selectStudent(key){
  const request=++REQUEST_ID;
  window.EAGLENEST_CURRENT_FLAG_REPORT=null;
  $('printReport').hidden=true;
  $('searchMessage').textContent='Loading assignment flags…';$('report').hidden=true;
  errorMessage('');
  try{
    const data=await api('/admin/gradebook-analytics/student-flags/report?student_key='+encodeURIComponent(key));
    if(request!==REQUEST_ID)return;
    renderReport(data);
    $('searchMessage').textContent='Report loaded. Search again to select another student.';
    $('report').scrollIntoView({block:'start',behavior:'smooth'});
  }catch(e){if(request===REQUEST_ID)errorMessage('Could not load student report: '+e.message);}
}
async function signIn(){
  try{await api('/admin/access');$('login').hidden=true;$('app').hidden=false;document.dispatchEvent(new Event('eaglenest-flags-auth-ready'));return;}
  catch{};
  for(let i=0;!window.google?.accounts?.id && i<70;i++)await new Promise(r=>setTimeout(r,100));
  if(!window.google?.accounts?.id){$('loginMessage').textContent='Google Sign-In is unavailable. Refresh and try again.';return;}
  window.google.accounts.id.initialize({client_id:CLIENT_ID,callback:async x=>{
    try{
      const r=await fetch(new URL('/admin/session/login_google',API_BASE),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:x.credential}).toString(),credentials:'include'});
      const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'Sign-in failed');
      window.EAGLENEST_AUTH?.setSid?.(j.sid||r.headers.get('x-admin-session'));
      $('login').hidden=true;$('app').hidden=false;document.dispatchEvent(new Event('eaglenest-flags-auth-ready'));
    }catch(e){$('loginMessage').textContent=e.message;}
  }});
  window.google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});
  $('loginMessage').textContent='Sign in with your school account.';
}
$('studentSearch').addEventListener('input',()=>{clearTimeout(SEARCH_TIMER);SEARCH_TIMER=setTimeout(searchStudents,350);});
$('studentSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(SEARCH_TIMER);searchStudents();}});
$('searchButton').addEventListener('click',()=>{clearTimeout(SEARCH_TIMER);searchStudents();});
$('studentMatches').addEventListener('click',e=>{const b=e.target.closest('[data-key]');if(b)selectStudent(b.dataset.key);});
$('printReport').addEventListener('click',()=>{if(window.EagleNESTFlagRosters?.printSingle)window.EagleNESTFlagRosters.printSingle();else window.print();});
window.addEventListener('DOMContentLoaded',signIn);

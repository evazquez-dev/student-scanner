/* EAGLENEST_INCENTIVE_TRIPS_V1. No source records changed from this page. */
(()=>{'use strict';
const $=x=>document.getElementById(x),api=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/',clientId=document.querySelector('meta[name="google-client-id"]')?.content||'';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SESSION='ss_admin_session_sid_v1';let configs=[],history=[],types=[],report=null,configId='',busy=false;
const nyDate=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`;};
function sid(){try{return sessionStorage.getItem(SESSION)||localStorage.getItem(SESSION)||sessionStorage.getItem('communications_admin_session_v1')||localStorage.getItem('communications_admin_session_v1')||'';}catch{return '';}}
function storeSid(x){if(!x)return;try{localStorage.setItem(SESSION,x);sessionStorage.setItem(SESSION,x);}catch{}}
async function request(path,body){const h=new Headers(),token=sid();if(token)h.set('x-admin-session',token);if(body!==undefined)h.set('content-type','application/json');
 const r=await fetch(new URL(path,api),{method:body===undefined?'GET':'POST',headers:h,body:body===undefined?undefined:JSON.stringify(body),credentials:'include',cache:'no-store'});
 storeSid(r.headers.get('x-admin-session'));const data=await r.json().catch(()=>null);
 if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);return data;}
function message(txt,bad=false){$('message').hidden=!txt;$('message').textContent=txt;$('message').className='itMessage'+(bad?' bad':' good');}
function busySet(v){busy=v;for(const id of ['saveConfig','preview','produce'])$(id).disabled=v;}
function dirty(){if(report){$('reportCard').hidden=true;report=null;}$('dirtyLabel').textContent='Unsaved report changes';}
const winLabels={rolling_school:'Rolling school days',rolling_calendar:'Rolling calendar days',specific:'Specific date range',school_year:'School year to date'};
function renderWindow(id,defaultKind='rolling_school'){const box=$(id);
 box.innerHTML=`<label>Evaluation method<select class="windowKind">${Object.entries(winLabels).map(([v,l])=>`<option value="${v}" ${v===defaultKind?'selected':''}>${l}</option>`).join('')}</select></label>
 <label class="windowCount">Number of days<input type="number" class="windowN" min="1" max="366" value="6"></label>
 <label class="windowThrough">Evaluate through<input type="date" class="windowEnd" value="${nyDate()}"></label>
 <label class="windowThroughToday itCheck"><input type="checkbox" class="windowAuto" checked>Use today when this configuration is rerun</label>
 <label class="windowInclude itCheck"><input type="checkbox" class="windowToday">Include current school day</label>
 <label class="windowStart">Start date<input type="date" class="windowFrom" value="${nyDate()}"></label>
 <label class="windowSpecificEnd">End date<input type="date" class="windowTo" value="${nyDate()}"></label>
 <span class="itHint"></span>`;
 box.querySelector('.windowKind').addEventListener('change',()=>{updateWindow(box);dirty();});
 box.querySelector('.windowAuto').addEventListener('change',()=>{if(box.querySelector('.windowAuto').checked)box.querySelector('.windowEnd').value=nyDate();updateWindow(box);dirty();});updateWindow(box);}
function updateWindow(box){const k=box.querySelector('.windowKind').value;
 box.querySelector('.windowCount').hidden=!['rolling_school','rolling_calendar'].includes(k);
 box.querySelector('.windowThrough').hidden=k==='specific';box.querySelector('.windowThroughToday').hidden=k==='specific';
 box.querySelector('.windowEnd').disabled=k!=='specific'&&box.querySelector('.windowAuto').checked;
 box.querySelector('.windowInclude').hidden=k==='specific';
 box.querySelector('.windowStart').hidden=k!=='specific';box.querySelector('.windowSpecificEnd').hidden=k!=='specific';
 box.querySelector('.itHint').textContent=k==='rolling_school'?'Uses evidenced instructional days; weekends and non-school days are skipped.':k==='rolling_calendar'?'Uses the calendar range; attendance counts only evidenced instructional days.':k==='specific'?'Both dates are inclusive.':'Starts with the current school year’s first evidenced instructional day.';}
function getWindow(id){const b=$(id),kind=b.querySelector('.windowKind').value;
 const o={kind,through:b.querySelector('.windowAuto').checked?nyDate():b.querySelector('.windowEnd').value,through_mode:b.querySelector('.windowAuto').checked?'today':'date',include_today:b.querySelector('.windowToday').checked};
 if(kind==='rolling_school'||kind==='rolling_calendar')o.count=Number(b.querySelector('.windowN').value);
 if(kind==='specific'){o.start=b.querySelector('.windowFrom').value;o.end=b.querySelector('.windowTo').value;}return o;}
function putWindow(id,w){const b=$(id);if(!w)return;b.querySelector('.windowKind').value=w.kind||'school_year';
 b.querySelector('.windowN').value=w.count||6;b.querySelector('.windowAuto').checked=w.through_mode==='today'||!w.through;b.querySelector('.windowEnd').value=b.querySelector('.windowAuto').checked?nyDate():(w.through||nyDate());b.querySelector('.windowToday').checked=!!w.include_today;
 b.querySelector('.windowFrom').value=w.start||nyDate();b.querySelector('.windowTo').value=w.end||nyDate();updateWindow(b);}
const RULES={behavior:[['max_events','Total logged behavior events','≤',3],['max_major_incidents','Major incident reports','≤',0]],
 daily:[['min_pct','Daily attendance percentage','≥',90],['max_absences','Total absences','≤',2],['max_unexcused','Unexcused absences','≤',1],['max_late','Late arrivals','≤',3]],
 meeting:[['min_pct','Meeting attendance percentage','≥',90],['max_absences','Missed class periods','≤',3],['max_late','Late class arrivals','≤',3]],
 academics:[['min_average','Overall academic average','≥',75],['max_failing','Maximum failing courses','≤',1],
 ['min_course_grade','Lowest individual course grade','≥',65],['min_courses_above','Number of courses above threshold','≥',4],['min_courses_above_pct','Threshold for counted courses (%)','≥',80]]};
function renderRules(group){$(group+'Rules').innerHTML=RULES[group].map(([key,label,sign,value],i)=>`<div class="itRule" data-rule="${key}"><label class="itCheck"><input type="checkbox" class="ruleOn" ${i===0?'checked':''}>${esc(label)}</label><div class="itRuleValue"><span>${sign}</span><input class="ruleValue" type="number" min="0" max="10000" step="${key.includes('pct')||key.includes('average')||key.includes('grade')?'0.01':'1'}" value="${value}"><span>${key.includes('pct')||key.includes('average')||key.includes('grade')?'%':''}</span></div></div>`).join('');
 if(group==='academics')$(group+'Rules').querySelector('[data-rule="min_courses_above_pct"] .ruleOn').checked=false;}
function getRules(group){const rules={};for(const e of $(group+'Rules').querySelectorAll('.itRule')){const key=e.dataset.rule;
 if(e.querySelector('.ruleOn').checked)rules[key]={enabled:true,value:Number(e.querySelector('.ruleValue').value)};}return rules;}
function putRules(group,rules){for(const e of $(group+'Rules').querySelectorAll('.itRule')){
 const x=rules?.[e.dataset.rule];e.querySelector('.ruleOn').checked=x?.enabled===true;if(x?.value!==undefined)e.querySelector('.ruleValue').value=x.value;}}
function typeRow(key='',max=0){const wrap=document.createElement('div');wrap.className='itTypeRow';const options=types.map(x=>`<option value="${esc(x.event_key)}" ${x.event_key===key?'selected':''}>${esc(x.event_label||x.event_key)} (${x.events})</option>`).join('');
 wrap.innerHTML=`<label>Behavior category<select class="itBehaviorType"><option value="">Select type…</option>${options}</select></label><label>Maximum<input type="number" class="itBehaviorMax" value="${Number(max)||0}" min="0" max="10000"></label><button type="button" class="itBtn itRemove">Remove</button>`;
 wrap.querySelector('.itRemove').addEventListener('click',()=>{wrap.remove();dirty();});$('behaviorTypeRules').append(wrap);}
function renderEnabled(k){const on=$(k+'Enabled').checked;$(k+'Body').hidden=!on;$(k+'Status').textContent=on?'On':'Off';$(k+'Status').classList.toggle('off',!on);}
function renderOverrides(k){$(k+'Custom').hidden=$(k+'UseGlobal').checked;}
function renderGradeSource(){$('snapshotWrap').hidden=$('gradeSource').value!=='snapshot';$('courseCodesWrap').hidden=$('courseScope').value!=='selected';}
function getConfig(){const cfg={name:$('tripName').value.trim(),trip_date:$('tripDate').value,grades:[...$('grades').querySelectorAll('input:checked')].map(x=>x.value),
 global_window:getWindow('globalWindow')};for(const k of ['behavior','daily','meeting']){
 cfg[k]={enabled:$(k+'Enabled').checked,use_global:$(k+'UseGlobal').checked,
 window:getWindow(k+'Custom'),rules:getRules(k)};}
 cfg.behavior.types=[...$('behaviorTypeRules').querySelectorAll('.itTypeRow')].map(x=>({key:x.querySelector('select').value,max:Number(x.querySelector('input[type=number]').value)})).filter(x=>x.key);
 cfg.academics={enabled:$('academicsEnabled').checked,source:$('gradeSource').value,snapshot:$('gradeSnapshot').value,
 passing_score:Number($('passingScore').value),course_scope:$('courseScope').value,course_codes:$('courseCodes').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean),rules:getRules('academics')};return cfg;}
function putConfig(c){$('tripName').value=c.name||'Incentive Trip';$('tripDate').value=c.trip_date||'';
 for(const i of $('grades').querySelectorAll('input'))i.checked=(c.grades||[]).includes(i.value);
 putWindow('globalWindow',c.global_window);for(const k of ['behavior','daily','meeting']){
 $(k+'Enabled').checked=!!c[k]?.enabled;$(k+'UseGlobal').checked=c[k]?.use_global!==false;
 putWindow(k+'Custom',c[k]?.window||{kind:'school_year',through:nyDate()});putRules(k,c[k]?.rules);renderEnabled(k);renderOverrides(k);}
 $('behaviorTypeRules').replaceChildren();for(const x of c.behavior?.types||[])typeRow(x.key,x.max);
 $('academicsEnabled').checked=!!c.academics?.enabled;$('gradeSource').value=c.academics?.source||'current';
 $('gradeSnapshot').value=c.academics?.snapshot||'';$('courseScope').value=c.academics?.course_scope||'all';
 $('courseCodes').value=(c.academics?.course_codes||[]).join(', ');$('passingScore').value=c.academics?.passing_score??65;putRules('academics',c.academics?.rules);renderEnabled('academics');renderGradeSource();dirty();}
function badge(s){return `<span class="itBadge ${esc(s||'')}">${esc((s||'OFF').replaceAll('_',' '))}</span>`;}
function renderReport(r){report=r;$('reportCard').hidden=false;$('reportTitle').textContent=r.config.name||'Incentive Trip';
 const parts=Object.entries(r.windows||{}).map(([k,w])=>`${k}: ${w.start} – ${w.end} (${w.school_day_count} school days)`);
 if(r.grade_source)parts.push(`Grades: ${r.grade_source.snapshot_date} (${r.grade_source.received_at_iso||'date unavailable'})`);
 $('reportMeta').textContent=`${r.report_id?'Saved report':'Preview only'} · ${r.produced_at_iso||''} · ${parts.join(' · ')}`;
 const sum=r.summary;$('kpis').innerHTML=[['Evaluated',sum.evaluated,''],['Eligible',sum.eligible,'good'],['Ineligible',sum.ineligible,'bad'],['Insufficient Data',sum.insufficient_data,'pending']]
 .map(([name,count,cl])=>`<div class="itKpi ${cl}"><small>${name}</small><strong>${Number(count).toLocaleString()}</strong></div>`).join('');
 $('gradeFilter').innerHTML='<option value="">All grades</option>'+[...new Set(r.students.map(x=>x.grade))].sort().map(x=>`<option>${esc(x)}</option>`).join('');
 $('statusFilter').value='';$('search').value='';$('studentDetail').hidden=true;renderRows();$('dirtyLabel').textContent=r.report_id?'Latest report saved':'Preview only · produce report to preserve results';
 $('reportCard').scrollIntoView({behavior:'smooth',block:'start'});}
function renderRows(){if(!report)return;const status=$('statusFilter').value,grade=$('gradeFilter').value,q=$('search').value.trim().toLowerCase();
 const filtered=report.students.filter(x=>(!status||x.status===status)&&(!grade||x.grade===grade)&&(!q||x.student_number.includes(q)||x.student_name.toLowerCase().includes(q)));
 $('reportRows').innerHTML=filtered.map(x=>`<tr class="itStudentRow" data-osis="${esc(x.student_number)}"><td><strong>${esc(x.student_name||'Name unavailable')}</strong><br><span class="itMuted">${esc(x.student_number)}</span></td><td>${esc(x.grade)}</td>${['behavior','daily','meeting','academics'].map(k=>`<td>${x.categories[k]?badge(x.categories[k].status):'—'}</td>`).join('')}<td>${badge(x.status)}</td></tr>`).join('')||'<tr><td colspan="7">No matching students.</td></tr>';
 for(const tr of $('reportRows').querySelectorAll('tr[data-osis]'))tr.addEventListener('click',()=>showStudent(tr.dataset.osis));}
function showStudent(id){const s=report?.students.find(x=>x.student_number===id);if(!s)return;
 const parts=Object.entries(s.categories).map(([key,c])=>`<section class="itDetailCell"><h4>${esc(key[0].toUpperCase()+key.slice(1))} ${badge(c.status)}</h4>
 ${c.window?`<p class="itMuted itSmall">${esc(c.window.start)} – ${esc(c.window.end)} (${esc(c.window.method)})</p>`:''}
 ${c.snapshot_date?`<p class="itMuted itSmall">Snapshot ${esc(c.snapshot_date)}</p>`:''}
 ${(c.rules||[]).map(t=>`<div class="itDetailRule"><div>${esc(t.key)}<br><span class="itMuted">${t.operator==='min'?'≥':'≤'} ${esc(t.required)} ${esc(t.unit)}</span></div><div>${t.actual==null?'Unknown':esc(t.actual)} ${badge(t.status)}</div></div>`).join('')}
 ${c.missing_dates?.length?`<p class="itMuted itSmall">Missing dates: ${esc(c.missing_dates.join(', '))}</p>`:''}
 ${c.missing_courses?.length?`<p class="itMuted itSmall">Unentered courses: ${esc(c.missing_courses.join(', '))}</p>`:''}</section>`).join('');
 $('studentDetail').innerHTML=`<h3>${esc(s.student_name)} · ${esc(s.student_number)} ${badge(s.status)}</h3><div class="itDetailGrid">${parts}</div>`;
 $('studentDetail').hidden=false;$('studentDetail').scrollIntoView({behavior:'smooth',block:'nearest'});}
function download(onlyEligible){if(!report)return;const students=onlyEligible?report.students.filter(x=>x.status==='ELIGIBLE'):report.students;
 const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';const head=['Student Number','Name','Grade','Status','Behavior','Daily Attendance','Meeting Attendance','Academics','Details JSON'];
 const data=students.map(x=>[x.student_number,x.student_name,x.grade,x.status,...['behavior','daily','meeting','academics'].map(k=>x.categories[k]?.status||'DISABLED'),JSON.stringify(x.categories)]);
 const csv='\uFEFF'+[head,...data].map(x=>x.map(quote).join(',')).join('\r\n')+'\r\n';const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`EagleNEST_Incentive_${onlyEligible?'Eligible':'Full'}_${(report.report_id||'preview').slice(0,8)}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function reloadConfigs(){configs=(await request('/admin/incentive_trips/configs')).configs;
 const selected=configId;$('configs').innerHTML='<option value="">New configuration</option>'+configs.map(x=>`<option value="${esc(x.config_id)}">${esc(x.name)} — ${esc(x.updated_at_iso.slice(0,10))}</option>`).join('');$('configs').value=selected;}
async function reloadReports(){history=(await request('/admin/incentive_trips/reports')).reports;
 $('reportHistory').innerHTML=history.length?history.map(x=>`<button type="button" data-id="${esc(x.report_id)}"><strong>${esc(x.trip_name)}</strong><br><span class="itMuted">${esc(x.created_at_iso)} · ${esc(x.created_by_email)}</span></button>`).join(''):'No saved reports yet.';
 for(const b of $('reportHistory').querySelectorAll('button'))b.addEventListener('click',async()=>{try{message('Opening original saved results…');renderReport(await request('/admin/incentive_trips/report?id='+encodeURIComponent(b.dataset.id)));message('Original report loaded.');}catch(e){message(e.message,true);}});}
async function run(save){if(busy)return;busySet(true);message(save?'Producing and saving report…':'Calculating preview…');
 try{const payload={config:getConfig(),config_id:configId};const r=await request(save?'/admin/incentive_trips/produce':'/admin/incentive_trips/preview',payload);
 renderReport(r);if(save)await reloadReports();message(save?'Report saved. Original eligibility results can be reopened from the archive.':'Preview generated; results are not saved.');}
 catch(e){message(`Report failed: ${e.message}`,true);}finally{busySet(false);}}
async function init(){renderWindow('globalWindow');for(const k of ['behavior','daily','meeting']){
 renderWindow(k+'Custom','school_year');renderRules(k);$(k+'Enabled').addEventListener('change',()=>{renderEnabled(k);dirty();});
 $(k+'UseGlobal').addEventListener('change',()=>{renderOverrides(k);dirty();});}
 renderRules('academics');$('academicsEnabled').addEventListener('change',()=>{renderEnabled('academics');dirty();});
 $('gradeSource').addEventListener('change',()=>{renderGradeSource();dirty();});$('courseScope').addEventListener('change',()=>{renderGradeSource();dirty();});
 $('addBehaviorType').addEventListener('click',()=>{typeRow();dirty();});
 for(const id of ['tripName','tripDate','grades','globalWindow','behaviorBody','dailyBody','meetingBody','academicsBody']){
  $(id).addEventListener('input',dirty);$(id).addEventListener('change',dirty);}
 $('saveConfig').addEventListener('click',async()=>{if(busy)return;busySet(true);message('Saving configuration…');try{
  const r=await request('/admin/incentive_trips/configs',{config:getConfig(),config_id:configId});configId=r.config_id;await reloadConfigs();
  $('dirtyLabel').textContent='Configuration saved';message('Configuration saved. Rolling windows will move forward when rerun.');
 }catch(e){message(e.message,true);}finally{busySet(false);}});
 $('configs').addEventListener('change',()=>{configId=$('configs').value;const item=configs.find(x=>x.config_id===configId);if(item){putConfig(item.config);$('dirtyLabel').textContent='Loaded saved configuration';}
 else{$('dirtyLabel').textContent='New configuration';}});
 $('preview').addEventListener('click',()=>run(false));$('produce').addEventListener('click',()=>run(true));
 $('refreshReports').addEventListener('click',()=>reloadReports().catch(e=>message(e.message,true)));
 $('csvEligible').addEventListener('click',()=>download(true));$('csvAll').addEventListener('click',()=>download(false));
 for(const k of ['statusFilter','gradeFilter','search'])$(k).addEventListener('input',renderRows);
}
async function bootstrap(){const access=await request('/admin/access');if(!['admin','super_admin'].includes(access.role)||access.view_as?.active)throw new Error('Administrator access required; View as Teacher is not permitted.');
 $('actor').textContent=access.email||access.role;$('login').hidden=true;$('app').hidden=false;
 const opts=await request('/admin/incentive_trips/options');types=opts.behavior_types||[];
 $('gradeSnapshot').innerHTML='<option value="">Select a saved snapshot…</option>'+(opts.grade_snapshots||[]).map(s=>`<option value="${esc(s.dataset_hash)}">${esc(s.snapshot_date)} · ${esc(s.marking_period)} · ${esc(s.received_at_iso)}</option>`).join('');
 await reloadConfigs();await reloadReports();}
async function onGoogle(resp){$('loginMsg').textContent='Signing in…';try{const r=await fetch(new URL('/admin/session/login_google',api),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:resp.credential}).toString(),credentials:'include'});
 storeSid(r.headers.get('x-admin-session'));const j=await r.json();if(j?.sid)storeSid(j.sid);if(!r.ok||!j.ok)throw new Error(j?.error||'Sign-in failed');await bootstrap();}catch(e){$('loginMsg').textContent=e.message;message(e.message,true);}}
window.addEventListener('DOMContentLoaded',async()=>{await init();try{await bootstrap();return;}catch(e){$('loginMsg').textContent=e.message==='unauthorized'?'Sign in to continue.':e.message;}
 if(!clientId){$('loginMsg').textContent='Google client ID missing.';return;}
 try{await new Promise((resolve,reject)=>{const start=Date.now();(function check(){if(window.google?.accounts?.id)return resolve();if(Date.now()-start>10000)return reject(new Error('Google sign-in unavailable'));setTimeout(check,70);})();});
  google.accounts.id.initialize({client_id:clientId,callback:onGoogle,ux_mode:'popup',use_fedcm_for_prompt:true});google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});
 }catch(e){$('loginMsg').textContent=e.message;}});
})();

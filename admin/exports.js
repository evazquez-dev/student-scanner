/* EAGLENEST_GENERAL_EXPORTS_V1 — single admin-only frontend for all export datasets. */
const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const GOOGLE_CLIENT_ID=document.querySelector('meta[name="google-client-id"]')?.content||'';
const SESSION_KEY='communications_admin_session_v1', SESSION_HEADER='x-admin-session';
const $=id=>document.getElementById(id);
const clean=v=>String(v??'');
const esc=v=>clean(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const MODULES={
  communications:{label:'Communications',source:'D1 · Family outreach',hint:'Includes historical family contacts, full notes, follow-ups and category corrections.',
    fields:[['method','Method','methods'],['category','Category','categories'],['outcome','Outcome','outcomes'],['direction','Direction','directions'],['staff','Staff member','staff'],['followup','Follow-up','!All|open:Open|resolved:Resolved|needed:Needed'],['source','Logged from','sources']],deleted:true},
  attendance:{label:'Attendance',source:'Imported PowerSchool attendance',hint:'Choose a specific attendance record type. Daily snapshots include imported Present student-days; exception rows do not.',
    fields:[['classification','Classification','classifications']],attendance:true},
  behavior:{label:'Behavior',source:'D1 · Behavior events',hint:'Logged behavior events and associated notes, including actor, room and period.',
    fields:[['event_type','Behavior type','event_types'],['staff','Logged by','staff'],['source','Logged from','sources']],deleted:true},
  incidents:{label:'Incident Reports',source:'D1 · Incident reports',hint:'Incident reports, investigation notes, involved students, witnesses, and evidence filenames (not evidence file bytes).',
    fields:[['category','Category','categories'],['severity','Severity','severities'],['status','Status','statuses'],['staff','Reporter','staff'],['assignee','Assigned staff','assignees']]},
  dreamer:{label:'Dreamer of the Week',source:'KV · Current and archived cycles',hint:'Current selections and closed awards are identified separately; archived cycles are retained as historical records.',
    fields:[['award_status','Award status','!All|archived:Archived|current_selection:Current selection'],['staff','Selected by','staff'],['course','Course','courses']]},
  mtss:{label:'MTSS',source:'D1 · Case management',hint:'Cases and intervention/review counts. Interventions and reviews are not individual rows in this dataset.',
    fields:[['domain','Domain','domains'],['tier','Tier','tiers'],['status','Status','statuses'],['staff','Case owner','staff']]}
};
const ATTENDANCE={
  attendance_daily:{label:'Daily student snapshots',hint:'Complete imported student-day snapshots: Present / Late / Absent. Data is limited to available complete imported days.'},
  attendance_exceptions:{label:'PowerSchool explicit exceptions',hint:'PowerSchool records with explicit codes on complete days; a missing explicit row is not a missing student.'},
  attendance_periods:{label:'Period attendance summaries',hint:'One student-day summary with counts and period-level JSON from completed meeting imports.'}
};
let access=null,moduleKey='communications',filtersApplied=null,latest=null,currentPage=0,busy=false,options={},requestSerial=0;
function getSid(){try{return clean(sessionStorage.getItem(SESSION_KEY)||localStorage.getItem(SESSION_KEY)||localStorage.getItem('ss_admin_session_sid_v1')).trim();}catch{return '';}}
function storeSid(sid){sid=clean(sid).trim();if(!sid)return;try{sessionStorage.setItem(SESSION_KEY,sid);localStorage.setItem(SESSION_KEY,sid);localStorage.setItem('ss_admin_session_sid_v1',sid);}catch{}}
function stashSid(r){storeSid(r.headers.get(SESSION_HEADER)||r.headers.get('X-Admin-Session'));}
async function adminFetch(path){const h=new Headers(),sid=getSid();if(sid)h.set(SESSION_HEADER,sid);
  const r=await fetch(new URL(path,API_BASE),{headers:h,credentials:'include',cache:'no-store'});stashSid(r);
  const j=await r.json().catch(()=>null);
  if(!r.ok||!j?.ok){const e=new Error(j?.detail?`${j.error||'request_failed'}: ${j.detail}`:j?.error||`HTTP ${r.status}`);e.status=r.status;e.data=j;throw e;}
  return j;
}
function msg(text,kind='info'){const el=$('message');if(!text){el.hidden=true;return;}el.hidden=false;el.className=`message ${kind}`;el.textContent=text;}
function status(text,kind=''){$('downloadStatus').className=`status ${kind}`;$('downloadStatus').textContent=text;}
function dateNY(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const d=Object.fromEntries(parts.map(v=>[v.type,v.value]));return `${d.year}-${d.month}-${d.day}`;}
function datesDefault(){const now=dateNY();const y=Number(now.slice(0,4))-(Number(now.slice(5,7))<7?1:0);return {start_date:`${y}-07-01`,end_date:now};}
function dataset(){return moduleKey==='attendance'?($('attendance_kind')?.value||'attendance_daily'):moduleKey;}
function renderTabs(){const box=$('moduleTabs');box.replaceChildren();for(const [key,m] of Object.entries(MODULES)){
  const b=document.createElement('button');b.type='button';b.className=`tab${key===moduleKey?' active':''}`;b.textContent=m.label;
  b.setAttribute('aria-current',key===moduleKey?'page':'false');b.addEventListener('click',()=>setModule(key));box.append(b);
}}
function makeSelect(id,label,values){const field=document.createElement('label');field.textContent=label;
  const select=document.createElement('select');select.name=id;select.id=id;
  const blank=document.createElement('option');blank.value='';blank.textContent=`All ${label.toLowerCase()}`;select.append(blank);
  let list=values;
  if(typeof values==='string'&&values.startsWith('!')){
    list=values.slice(1).split('|').slice(1).map(v=>{const [val,...parts]=v.split(':');return {value:val,label:parts.join(':')||val};});
  }
  for(const raw of list||[]){const item=typeof raw==='object'?raw:{value:raw,label:raw};const opt=document.createElement('option');opt.value=item.value;opt.textContent=item.label;select.append(opt);}
  field.append(select);return field;
}
function renderDatasetFilters(){const m=MODULES[moduleKey],box=$('datasetFilters');box.replaceChildren();
  if(m.attendance){const select=makeSelect('attendance_kind','Attendance dataset',Object.entries(ATTENDANCE).map(([value,x])=>({value,label:x.label})));
    select.querySelector('option[value=""]').remove();select.style.gridColumn='1 / -1';box.append(select);$('attendance_kind').addEventListener('change',()=>{updateAttendanceHint();dirty();loadOptions();});}
  for(const [key,label,values] of m.fields){const v=typeof values==='string'?values:options[values]||[];box.append(makeSelect(key,label,v));}
  $('deletedLabel').hidden=!m.deleted;
}
function updateAttendanceHint(){if(moduleKey==='attendance'){$('moduleHint').textContent=ATTENDANCE[dataset()].hint;$('dataSource').textContent=MODULES.attendance.source;}}
function dirty(){filtersApplied=null;latest=null;currentPage=0;$('recordCount').textContent='—';$('preview').innerHTML='<div class="empty">Apply filters to preview this dataset.</div>';
  $('resultNote').textContent='Filters changed. Apply them to refresh the results.';$('pageLabel').textContent='—';
  $('prevBtn').disabled=true;$('nextBtn').disabled=true;$('downloadBtn').disabled=true;status('');}
async function setModule(key){if(!MODULES[key]||busy)return;moduleKey=key;const n=++requestSerial;
  const m=MODULES[key],dates=datesDefault();$('moduleTitle').textContent=m.label;$('moduleHint').textContent=m.hint;
  $('dataSource').textContent=m.source;$('sourcePill').textContent=key==='dreamer'?'KV':'D1';
  $('start_date').value=dates.start_date;$('end_date').value=dates.end_date;
  for(const k of ['student_number','grade','search'])$(k).value='';$('include_deleted').checked=false;
  options={};renderTabs();renderDatasetFilters();dirty();msg('');
  await loadOptions(n);
}
async function loadOptions(serial=requestSerial){const kind=dataset();if(kind==='attendance_periods'&&moduleKey==='attendance'){
  // The generic classification select is not meaningful for a period summary.
  const wrap=$('classification')?.closest('label');if(wrap)wrap.hidden=true;
}else if($('classification'))$('classification').closest('label').hidden=false;
  try{const j=await adminFetch(`/admin/exports/options?module=${encodeURIComponent(kind)}`);
    if(serial!==requestSerial||kind!==dataset())return;
    const preserved={};for(const e of $('datasetFilters').querySelectorAll('select'))preserved[e.id]=e.value;
    options=j.filter_options||{};
    renderDatasetFilters();for(const [id,value] of Object.entries(preserved))if($(id)&&[...$(id).options].some(o=>o.value===value))$(id).value=value;
    if(moduleKey==='attendance'){updateAttendanceHint();if(kind==='attendance_periods'&&$('classification'))$('classification').closest('label').hidden=true;}
  }catch(e){if(serial===requestSerial)msg(`Could not load filter choices: ${e.message}`,'warn');}
}
function collect(){const p={module:dataset(),start_date:$('start_date').value,end_date:$('end_date').value,
    student_number:$('student_number').value.trim(),grade:$('grade').value,search:$('search').value.trim(),include_deleted:$('include_deleted').checked?'1':''};
  for(const e of $('datasetFilters').querySelectorAll('select'))if(e.id!=='attendance_kind'&&!e.closest('[hidden]'))p[e.name]=e.value;
  return p;
}
function urlFor(p,page,audit=false){const u=new URL('/admin/exports/query',API_BASE);for(const [key,value] of Object.entries({...p,page:String(page)}))if(value!==''&&value!=null)u.searchParams.set(key,clean(value));
  if(audit)u.searchParams.set('audit_export','1');return u.pathname+u.search;
}
function renderRows(){const rows=latest?.rows||[];$('recordCount').textContent=Number(latest?.count||0).toLocaleString();
  $('resultNote').textContent=`Showing ${rows.length.toLocaleString()} of ${Number(latest?.count||0).toLocaleString()} records on this page · ${(latest?.source||'').replaceAll('_',' ')}`;
  const pages=Math.max(1,Math.ceil(Number(latest?.count||0)/Number(latest?.page_size||250)));
  $('pageLabel').textContent=`Page ${currentPage+1} of ${pages}`;
  $('prevBtn').disabled=busy||currentPage===0;$('nextBtn').disabled=busy||!latest?.has_more;
  $('downloadBtn').disabled=busy||!latest?.count;
  if(!rows.length){$('preview').innerHTML='<div class="empty">No records match these filters.</div>';return;}
  const cols=Object.keys(rows[0]);const th=cols.map(c=>`<th>${esc(c.replaceAll('_',' '))}</th>`).join('');
  const tr=rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(typeof r[c]==='object'?JSON.stringify(r[c]):r[c])}</td>`).join('')}</tr>`).join('');
  $('preview').innerHTML=`<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}
async function query(page=0){if(busy)return;const p=filtersApplied||collect();if(!p.start_date||!p.end_date||p.end_date<p.start_date){msg('Choose a valid date range.','error');return;}
  busy=true;currentPage=page;let serial=requestSerial;
  $('applyBtn').disabled=true;$('downloadBtn').disabled=true;$('nextBtn').disabled=true;$('prevBtn').disabled=true;
  msg('Loading matching records…');
  try{const data=await adminFetch(urlFor(p,page));if(serial!==requestSerial)return;
    latest=data;filtersApplied=p;renderRows();msg('');}
  catch(e){if(serial!==requestSerial)return;latest=null;filtersApplied=null;msg(`Could not load export: ${e.message}`,'error');
    $('recordCount').textContent='—';$('preview').innerHTML='<div class="empty">No preview available. Check the error above.</div>';}
  finally{busy=false;$('applyBtn').disabled=false;if(latest)renderRows();}
}
function safeCell(value){let s=typeof value==='object'&&value!==null?JSON.stringify(value):clean(value);
  // Defend CSV consumers (Excel / Google Sheets) against spreadsheet-formula injection.
  if(/^[\s\uFEFF]*[=+@\-]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
async function download(){if(busy||!filtersApplied||!latest?.count)return;busy=true;const p={...filtersApplied},expected=latest.count,headers=[];const parts=[];let n=0;
  $('applyBtn').disabled=true;$('downloadBtn').disabled=true;$('prevBtn').disabled=true;$('nextBtn').disabled=true;msg('');
  try{for(let page=0;;page++){
      const j=await adminFetch(urlFor(p,page,page===0));
      if(j.count!==expected)throw new Error('Records changed during export. Apply filters and retry to get a consistent count.');
      if(page===0){headers.push(...Object.keys(j.rows?.[0]||{}));if(!headers.length)throw new Error('No records available.');parts.push(headers.map(safeCell).join(','));}
      for(const row of j.rows||[]){parts.push(headers.map(key=>safeCell(row[key])).join(','));n++;}
      status(`Preparing download: ${n.toLocaleString()} / ${expected.toLocaleString()} rows…`);
      if(!j.has_more)break;
      if(n>=expected||page>=200)throw new Error('The export reached an unexpected pagination limit.');
    }
    if(n!==expected)throw new Error(`Expected ${expected} rows but retrieved ${n}. Nothing was downloaded.`);
    const csv='\uFEFF'+parts.join('\r\n')+'\r\n';
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`EagleNEST_${p.module}_${p.start_date}_to_${p.end_date}_${n}rows.csv`;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    status(`CSV downloaded · ${n.toLocaleString()} matching rows`, 'ok');
  }catch(e){status(`Export did not complete: ${e.message}`,'bad');msg(`Download failed: ${e.message}`,'error');}
  finally{busy=false;if(latest)renderRows();$('applyBtn').disabled=false;}
}
async function bootstrap(){access=await adminFetch('/admin/access');
  if(!['admin','super_admin'].includes(access.role)||access?.view_as?.active)throw new Error('This page is available only to administrators outside View as Teacher.');
  $('accountPill').textContent=access.email||access.role;$('loginCard').hidden=true;$('app').hidden=false;
  await setModule('communications');
}
async function trySession(){try{await adminFetch('/admin/session/check');await bootstrap();return true;}catch{return false;}}
async function onGoogle(resp){try{$('loginOut').textContent='Signing in…';
    const r=await fetch(new URL('/admin/session/login_google',API_BASE),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body:new URLSearchParams({id_token:resp.credential}).toString(),credentials:'include'});
    stashSid(r);const j=await r.json().catch(()=>null);if(j?.sid)storeSid(j.sid);
    if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);
    await bootstrap();
  }catch(e){$('loginOut').textContent=`Sign-in failed: ${e.message}`;msg(e.message,'error');}}
window.addEventListener('DOMContentLoaded',async()=>{
  $('filters').addEventListener('submit',e=>{e.preventDefault();filtersApplied=collect();query(0);});
  $('resetBtn').addEventListener('click',()=>setModule(moduleKey));
  $('downloadBtn').addEventListener('click',download);
  $('prevBtn').addEventListener('click',()=>query(currentPage-1));$('nextBtn').addEventListener('click',()=>query(currentPage+1));
  $('filters').addEventListener('input',e=>{if(e.target.id!=='attendance_kind')dirty();});
  $('filters').addEventListener('change',e=>{if(e.target.id!=='attendance_kind')dirty();});
  if(await trySession())return;
  $('loginOut').textContent='Sign in to open Exports.';
  if(!GOOGLE_CLIENT_ID){$('loginOut').textContent='Missing Google client ID.';return;}
  try{await new Promise((resolve,reject)=>{const t=Date.now();(function check(){if(window.google?.accounts?.id)return resolve();if(Date.now()-t>8000)return reject(Error('Google sign-in unavailable'));setTimeout(check,60);})();});
    google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:onGoogle,ux_mode:'popup',use_fedcm_for_prompt:true});
    google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});
  }catch(e){$('loginOut').textContent=e.message;}
});

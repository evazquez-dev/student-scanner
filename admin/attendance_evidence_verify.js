// EAGLENEST_ATTENDANCE_EVIDENCE_VERIFY_TEMP_V1
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
  const SID_KEYS = ['ss_admin_session_sid_v1','teacher_att_admin_session_v1','attendance_status_admin_session_v1','admin_session_v1','admin_session_sid'];
  const todayNY = () => {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x=>[x.type,x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  let selected = null, lookupId = 0, queryTimer = null, busy = false;
  const records = new Map();
  const getSid = () => { try {for (const k of SID_KEYS) {const v = sessionStorage.getItem(k)||localStorage.getItem(k);if(v) return v;}}catch{}return '';};
  const storeSid = response => {const sid=response.headers.get('x-admin-session');if(sid){try{sessionStorage.setItem(SID_KEYS[0],sid);}catch{}}};
  async function request(path, body) {
    const headers = new Headers();
    const sid=getSid();if(sid)headers.set('x-admin-session',sid);
    if(body!==undefined)headers.set('content-type','application/json');
    const response = await fetch(new URL(path,API_BASE),{method:body===undefined?'GET':'POST',credentials:'include',cache:'no-store',headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
    storeSid(response);
    const data=await response.json().catch(()=>({ok:false,error:'invalid_json_response'}));
    return {http_status:response.status,...data,ok:response.ok && data.ok!==false};
  }
  const dateValue=()=> $('schoolDate').value;
  const osisValue=()=> selected?.osis || (/^\d{5,15}$/.test($('studentSearch').value.trim())?$('studentSearch').value.trim():'');
  const qp=values=>new URLSearchParams(values).toString();
  const msg=(text,kind='')=>{ $('message').className='status '+kind; $('message').textContent=text;};
  function setBusy(v){busy=v;for(const id of ['runAll','runObligations','runCampus','runDay','runTeacher','runSnapshots','runDry','captureToday'])$(id).disabled=v;}
  function grade(id,r){
    if(!r||r.ok===false)return ['Error','bad'];
    if(id==='snapshots')return r.snapshot_count>0?['Snapshots saved','good']:['No snapshot yet','warn'];
    if(id==='dry_run')return r.teacher_sections>0?['Sections present','good']:['No regular sections','warn'];
    if(id==='teacher')return r.date!==dateValue()?['Current source — different date','warn']:Number(r.matched_sections||0)>0?['Matched sections','good']:['Review / custom day','warn'];
    if(id==='obligations')return r.verified_count>0?['Verified mappings','good']:['Provisional / missing','warn'];
    if(id==='day_context')return r.readiness?.ready===true?['Day ready','good']:['Review Day Context','warn'];
    if(id==='campus')return r.status==='unknown'?['Unknown presence','warn']:[r.status||'Evidence available','good'];
    return ['Result','good'];
  }
  const titles={day_context:'Day Context',teacher:'Teacher assignment source',snapshots:'Saved D1 staffing snapshots',dry_run:'Staffing dry run',capture:'Manual capture',obligations:'Student classroom obligations',campus:'Campus presence'};
  function render(){
    const root=$('results');root.replaceChildren();
    if(!records.size){root.textContent='No checks run yet.';return;}
    for(const [id,rec] of records){
      const [tag,klass]=grade(id,rec.data);
      const wrap=document.createElement('article');wrap.className='result';
      const head=document.createElement('div');head.className='result-head';
      const name=document.createElement('strong');name.textContent=titles[id]||id;
      const status=document.createElement('span');status.className='pill '+klass;status.textContent=tag;head.append(name,status);
      const time=document.createElement('p');time.textContent=`Checked ${rec.checked_at}`;
      const btn=document.createElement('button');btn.type='button';btn.textContent='Copy this JSON';btn.addEventListener('click',()=>copyText(JSON.stringify(rec.data,null,2)));
      const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Inspect JSON';const code=document.createElement('pre');code.textContent=JSON.stringify(rec.data,null,2);details.append(summary,code);
      wrap.append(head,time,btn);
      if(id==='obligations' && Array.isArray(rec.data?.obligations) && rec.data.obligations.length){
        const scroll=document.createElement('div');scroll.className='table-wrap';
        const table=document.createElement('table');const tr=document.createElement('tr');
        for(const label of ['Period','Room','Course','Teachers','Evidence']){const th=document.createElement('th');th.textContent=label;tr.append(th);}
        const thead=document.createElement('thead');thead.append(tr);table.append(thead);
        const tbody=document.createElement('tbody');
        for(const ob of rec.data.obligations){
          const line=document.createElement('tr');
          const values=[ob.period_local,ob.room,ob.course,(ob.teachers||[]).map(t=>t.name||t.email||t.teacher_key).join(', ')||'—',`${ob.evidence_status||'unknown'}${(ob.warnings||[]).length?' · '+ob.warnings.join('; '):''}`];
          for(const value of values){const td=document.createElement('td');td.textContent=String(value??'');line.append(td);}
          tbody.append(line);
        }
        table.append(tbody);scroll.append(table);wrap.append(scroll);
      }
      wrap.append(details);root.append(wrap);
    }
  }
  const put=(id,data)=>{records.set(id,{checked_at:new Date().toISOString(),data});render();renderHealth();return data;};
  function renderHealth(){
    const day=records.get('day_context')?.data||{},teach=records.get('teacher')?.data||{},snap=records.get('snapshots')?.data||{},dry=records.get('dry_run')?.data||{};
    const ctx=day?.readiness||{};const parts=[];
    if(day.ok)parts.push(`Day Context: ${ctx.status||day.status||'returned'} · ${ctx.day_type||day.day_type||'type unknown'}`);
    if(teach.ok)parts.push(`Current teacher source (${teach.date||'undated'}): ${teach.matched_sections||0} matched section(s), ${teach.room_periods||0} room-period(s)${teach.date!==dateValue()?' — NOT historical evidence for selected date':''}`);
    if(snap.ok)parts.push(`D1: ${snap.snapshot_count||0} saved staffing snapshot(s); latest teacher sections ${snap.latest?.teacher_sections ?? 'n/a'}`);
    if(dry.ok)parts.push(`Dry-run: dated teacher source ${!!dry.teacher_date_verified}; ${dry.teacher_sections||0} sections, ${dry.staff_directory_count||0} staff`);
    $('health').textContent=parts.length?parts.join('   |   '):'Run verification checks to see the evidence status.';
  }
  async function run(id, path, body){
    const data=await request(path,body).catch(e=>({ok:false,error:'network_error',detail:String(e?.message||e)}));
    return put(id,data);
  }
  const paths={
    day:()=>`/admin/day_context?${qp({date:dateValue()})}`,
    teacher:()=>'/admin/teacher_assignments',
    snapshots:()=>`/admin/attendance_evidence/class_obligations/status?${qp({date:dateValue()})}`,
    obligations:()=>`/admin/attendance_evidence/class_obligations?${qp({date:dateValue(),student_number:osisValue()})}`,
    campus:()=>{
      const args={date:dateValue(),student_number:osisValue()};
      if($('asOf').value){const [h,m]=$('asOf').value.split(':').map(Number);if(Number.isFinite(h)&&Number.isFinite(m)){
        // NY local clock to UTC ISO, use Temporal-free iterative zone conversion.
        const local=`${dateValue()}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
        let t=Date.parse(`${local}:00Z`);
        for(let i=0;i<3;i++){
          const v=Object.fromEntries(fmt.formatToParts(new Date(t)).map(p=>[p.type,p.value]));
          const found=`${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
          t+=Date.parse(`${local}:00Z`)-Date.parse(`${found}:00Z`);
        }
        args.as_of=new Date(t).toISOString();
      }}
      return `/admin/attendance_evidence/campus_presence?${qp(args)}`;
    }
  };
  async function task(fn){if(busy)return;setBusy(true);try{await fn();}finally{setBusy(false);}}
  function requireStudent(){if(osisValue())return true;msg('Select a student or enter a valid OSIS first.','warn');$('studentSearch').focus();return false;}
  function requireDate(){if(/^\d{4}-\d{2}-\d{2}$/.test(dateValue()))return true;msg('Choose a valid school date.','warn');return false;}
  function todayOnly(){if(dateValue()===todayNY())return true;msg('Capture and dry-run are only available for the current New York school date.','warn');return false;}
  async function copyText(s){try{await navigator.clipboard.writeText(s);msg('JSON copied. Review identifying information before sharing.','good');}catch{msg('Clipboard permission denied. Open an Inspect JSON panel and copy manually.','warn');}}
  function redact(value){
    const privateKeys=new Set(['student_number','osis','raw_code','email','actor_email','teacher_email','assigned_to_email','updated_by','student_name','staff_name','name','last_name','first_name','teacher_name','device_id','student_id']);
    if(Array.isArray(value))return value.map(redact);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,privateKeys.has(k.toLowerCase())?'[REDACTED]':redact(v)]));
    if(typeof value==='string')return value.replace(/\b\d{9,10}\b/g,'[STUDENT_ID]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[EMAIL]');
    return value;
  }
  function exportReport(safe){const payload={tool:'EagleNEST Attendance Evidence Verification',school_date:dateValue(),checks:Object.fromEntries([...records].map(([id,rec])=>[id,rec]))};return JSON.stringify(safe?redact(payload):payload,null,2);}
  let searchSequence=0;
  function hideSuggestions(){ $('studentSuggestions').hidden=true; $('studentSearch').setAttribute('aria-expanded','false'); }
  function chooseStudent(row){selected={osis:String(row.osis),name:String(row.name||'')};$('studentSearch').value=selected.name?`${selected.name} (${selected.osis})`:selected.osis;$('selectedStudent').textContent=`Selected: ${selected.name||'Student'} · OSIS ${selected.osis}`;hideSuggestions();}
  async function search(){const q=$('studentSearch').value.trim(),nonce=++searchSequence;
    if(q.length<2){hideSuggestions();return;}
    const response=await request('/admin/roster/search?'+qp({q})).catch(()=>null);
    if(nonce!==searchSequence)return;
    const box=$('studentSuggestions');box.replaceChildren();
    const rows=response?.ok===true&&Array.isArray(response.results)?response.results:[];
    if(!rows.length){hideSuggestions();return;}
    for(const row of rows.slice(0,15)){
      const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.textContent=`${row.name||'Student'} · ${row.osis}`;
      b.addEventListener('click',()=>chooseStudent(row));box.append(b);
    }
    box.hidden=false;$('studentSearch').setAttribute('aria-expanded','true');
  }
  async function init(){
    $('schoolDate').value=todayNY();render();
    // /admin/session/check does not include can.*; /admin/access is authoritative.
    let session=await request('/admin/access').catch(()=>({ok:false}));
    if(!session.ok)session=await request('/admin/session/check').catch(()=>({ok:false}));
    const allowed=session?.ok===true && (session?.can ? session.can.super_admin===true : session?.role==='super_admin') && session?.view_as?.active!==true;
    $('app').hidden=!allowed;$('notAuthorized').hidden=allowed;
    if(!allowed){$('authMessage').textContent=session?.view_as?.active?'Exit View As mode before using attendance evidence verification.':'Please sign in as Super Admin through System Administration, then return here.';return;}
    $('studentSearch').addEventListener('input',()=>{selected=null;$('selectedStudent').textContent='Select a student from suggestions, or enter a valid OSIS.';clearTimeout(queryTimer);queryTimer=setTimeout(search,240);});
    $('studentSearch').addEventListener('keydown',e=>{if(e.key==='Escape')hideSuggestions();});
    document.addEventListener('click',e=>{if(!e.target.closest('.field'))hideSuggestions();});
    $('schoolDate').addEventListener('change',()=>{msg('Date changed. Run checks again for this date.');});
    $('runAll').addEventListener('click',()=>task(async()=>{
      if(!requireDate())return;msg('Running read-only checks…');
      await run('day_context',paths.day());await run('teacher',paths.teacher());await run('snapshots',paths.snapshots());
      if(osisValue()){await run('obligations',paths.obligations());await run('campus',paths.campus());}
      msg('Verification completed. Review warnings and copy the redacted JSON to share.','good');
    }));
    $('runDay').addEventListener('click',()=>task(async()=>{if(requireDate())await run('day_context',paths.day());}));
    $('runTeacher').addEventListener('click',()=>task(async()=>{await run('teacher',paths.teacher());}));
    $('runSnapshots').addEventListener('click',()=>task(async()=>{if(requireDate())await run('snapshots',paths.snapshots());}));
    $('runObligations').addEventListener('click',()=>task(async()=>{if(requireDate()&&requireStudent())await run('obligations',paths.obligations());}));
    $('runCampus').addEventListener('click',()=>task(async()=>{if(requireDate()&&requireStudent())await run('campus',paths.campus());}));
    $('runDry').addEventListener('click',()=>task(async()=>{if(requireDate()&&todayOnly())await run('dry_run','/admin/attendance_evidence/class_obligations/capture',{date:dateValue(),dry_run:true});}));
    $('captureToday').addEventListener('click',()=>task(async()=>{
      if(!requireDate()||!todayOnly())return;
      if(!confirm('Capture TODAY\'S current teacher, staff, and coverage sources into append-only production D1? This does NOT change student attendance, but creates a permanent historical source record.'))return;
      const data=await run('capture','/admin/attendance_evidence/class_obligations/capture',{date:dateValue()});
      if(data.ok)await run('snapshots',paths.snapshots());
    }));
    $('clearResults').addEventListener('click',()=>{records.clear();render();renderHealth();msg('Cleared local results.');});
    $('copyAll').addEventListener('click',()=>copyText(exportReport(false)));
    $('copySafe').addEventListener('click',()=>copyText(exportReport(true)));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else void init();
})();

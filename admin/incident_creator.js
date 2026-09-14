const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY = 'teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';

const $ = (id) => document.getElementById(id);
const loginCard = $('loginCard');
const loginOut = $('loginOut');
const app = $('app');
const form = $('incidentForm');
const reporterPill = $('reporterPill');
const sourcePill = $('sourcePill');
const launchContext = $('launchContext');
const dateEl = $('incidentDate');
const timeEl = $('incidentTime');
const locationCategoryEl = $('locationCategory');
const locationDetailEl = $('locationDetail');
const descriptionEl = $('description');
const otherPeopleEl = $('otherPeople');
const otherWitnessesEl = $('otherWitnesses');
const evidenceInput = $('evidenceInput');
const referToDeanEl = $('referToDean');
const evidenceLimits = $('evidenceLimits');
const evidenceHelp = $('evidenceHelp');
const fileList = $('fileList');
const submitBtn = $('submitBtn');
const clearBtn = $('clearBtn');
const successBox = $('successBox');
const successText = $('successText');
const errorBox = $('errorBox');
const busyOverlay = $('busyOverlay');
const newReportBtn = $('newReportBtn');

let ACCESS = null;
let CONFIG = null;
let PEOPLE = [];
let WITNESSES = [];
let STAFF_WITNESSES = [];
let FREE_WITNESSES = [];
let SOURCE_CONTEXT = {};
let SOURCE = 'incident_creator';
let BUSY = false;
let SUBMITTED = false;
let searchTimer = null;

function getStoredAdminSessionSid(){
  try{return String(sessionStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem(ADMIN_SESSION_KEY)||sessionStorage.getItem(ADMIN_SESSION_LEGACY_KEY)||localStorage.getItem(ADMIN_SESSION_LEGACY_KEY)||'').trim();}catch{return '';}
}
function setStoredAdminSessionSid(sid){
  const v=String(sid||'').trim();
  try{
    for(const k of [ADMIN_SESSION_KEY,ADMIN_SESSION_LEGACY_KEY]){
      if(v){sessionStorage.setItem(k,v);localStorage.setItem(k,v);}else{sessionStorage.removeItem(k);localStorage.removeItem(k);}
    }
  }catch{}
}
function stashAdminSessionFromResponse(resp){
  try{const sid=String(resp?.headers?.get(ADMIN_SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim();if(sid)setStoredAdminSessionSid(sid);}catch{}
}
async function adminFetch(pathOrUrl, init={}){
  const u=pathOrUrl instanceof URL?pathOrUrl:new URL(pathOrUrl,API_BASE);
  const headers=new Headers(init.headers||{});
  const sid=getStoredAdminSessionSid();
  if(sid&&!headers.has(ADMIN_SESSION_HEADER))headers.set(ADMIN_SESSION_HEADER,sid);
  const resp=await fetch(u,{...init,headers,credentials:'include',cache:'no-store'});
  stashAdminSessionFromResponse(resp);
  if(resp.status===401){try{const j=await resp.clone().json();if(['expired','no_session','bad_session'].includes(String(j?.error||'')))setStoredAdminSessionSid('');}catch{}}
  return resp;
}
async function waitForGoogle(timeoutMs=8000){
  const start=Date.now();
  while(!window.google?.accounts?.id){if(Date.now()-start>timeoutMs)throw new Error('Google sign-in script failed to load');await new Promise(r=>setTimeout(r,50));}
  return window.google.accounts.id;
}
async function doLogin(idToken){
  const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:idToken}).toString()});
  const j=await r.json().catch(()=>({}));
  if(j?.sid)setStoredAdminSessionSid(String(j.sid));
  if(!r.ok||!j?.ok)throw new Error(j?.error||`login_http_${r.status}`);
}
async function getAccess(){
  const r=await adminFetch('/admin/access',{method:'GET'});
  const j=await r.json().catch(()=>null);
  return r.ok&&j?.ok?j:null;
}
function setBusy(v){
  BUSY=!!v;busyOverlay.hidden=!BUSY;submitBtn.disabled=BUSY||SUBMITTED;clearBtn.disabled=BUSY;evidenceInput.disabled=BUSY||CONFIG?.evidence_enabled===false;if(referToDeanEl)referToDeanEl.disabled=BUSY;
}
function showError(msg){errorBox.textContent=String(msg||'Unknown error');errorBox.hidden=false;successBox.hidden=true;errorBox.scrollIntoView({behavior:'smooth',block:'center'});}
function clearNotices(){errorBox.hidden=true;errorBox.textContent='';successBox.hidden=true;}
function humanBytes(n){const x=Number(n||0);if(x<1024)return `${x} B`;if(x<1024*1024)return `${(x/1024).toFixed(1)} KB`;return `${(x/(1024*1024)).toFixed(1)} MB`;}
function nowHHMM(){try{return new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());}catch{return '';}}
function newSubmissionId(){try{return `incident:${crypto.randomUUID()}`;}catch{return `incident:${Date.now()}:${Math.random().toString(36).slice(2)}`;}}

function witnessKey(value){
  return String(value || '').trim().toLowerCase();
}
function clearPicker(which){
  const input=$(which==='people'?'peopleSearch':'witnessSearch');
  const results=$(which==='people'?'peopleResults':'witnessResults');
  input.value='';
  results.hidden=true;
  results.innerHTML='';
}
function renderChips(which){
  const box=$(which==='people'?'peopleChips':'witnessChips');
  box.innerHTML='';

  if(which==='people'){
    for(const p of PEOPLE){
      const chip=document.createElement('span');chip.className='chip';
      const txt=document.createElement('span');txt.textContent=`${p.name||'Unknown'} (${p.osis})`;
      const rm=document.createElement('button');rm.type='button';rm.textContent='×';rm.title='Remove';
      rm.addEventListener('click',()=>{PEOPLE=PEOPLE.filter(x=>x.osis!==p.osis);renderChips('people');});
      chip.append(txt,rm);box.appendChild(chip);
    }
    return;
  }

  for(const p of WITNESSES){
    const chip=document.createElement('span');chip.className='chip';
    const txt=document.createElement('span');txt.textContent=`${p.name||'Unknown'} (${p.osis})`;
    const rm=document.createElement('button');rm.type='button';rm.textContent='×';rm.title='Remove student witness';
    rm.addEventListener('click',()=>{WITNESSES=WITNESSES.filter(x=>x.osis!==p.osis);renderChips('witness');});
    chip.append(txt,rm);box.appendChild(chip);
  }
  for(const p of STAFF_WITNESSES){
    const chip=document.createElement('span');chip.className='chip';
    const txt=document.createElement('span');txt.textContent=`${p.name||p.email||'Staff'} (Staff)`;
    const rm=document.createElement('button');rm.type='button';rm.textContent='×';rm.title='Remove staff witness';
    rm.addEventListener('click',()=>{STAFF_WITNESSES=STAFF_WITNESSES.filter(x=>x.email!==p.email);renderChips('witness');});
    chip.append(txt,rm);box.appendChild(chip);
  }
  for(const p of FREE_WITNESSES){
    const chip=document.createElement('span');chip.className='chip';
    const txt=document.createElement('span');txt.textContent=`${p.name} (Other)`;
    const rm=document.createElement('button');rm.type='button';rm.textContent='×';rm.title='Remove witness';
    rm.addEventListener('click',()=>{FREE_WITNESSES=FREE_WITNESSES.filter(x=>witnessKey(x.name)!==witnessKey(p.name));renderChips('witness');});
    chip.append(txt,rm);box.appendChild(chip);
  }
}
function addStudent(which,student){
  const p={osis:String(student?.osis||'').trim(),name:String(student?.name||'').trim()};
  if(!p.osis)return;
  if(which==='people'){
    if(!PEOPLE.some(x=>x.osis===p.osis))PEOPLE.push(p);
  }else{
    if(!WITNESSES.some(x=>x.osis===p.osis))WITNESSES.push(p);
  }
  renderChips(which);
  clearPicker(which);
}
function addStaffWitness(staff){
  const p={email:String(staff?.email||'').trim().toLowerCase(),name:String(staff?.name||'').trim()};
  if(!p.email&&!p.name)return;
  const key=p.email||witnessKey(p.name);
  if(!STAFF_WITNESSES.some(x=>(x.email||witnessKey(x.name))===key))STAFF_WITNESSES.push(p);
  renderChips('witness');
  clearPicker('witness');
}
function addFreeWitness(name){
  const clean=String(name||'').trim().replace(/\s+/g,' ').slice(0,200);
  if(clean.length<2)return;
  const key=witnessKey(clean);
  const alreadyStudent=WITNESSES.some(x=>witnessKey(x.name)===key);
  const alreadyStaff=STAFF_WITNESSES.some(x=>witnessKey(x.name)===key);
  const alreadyFree=FREE_WITNESSES.some(x=>witnessKey(x.name)===key);
  if(!alreadyStudent&&!alreadyStaff&&!alreadyFree)FREE_WITNESSES.push({name:clean});
  renderChips('witness');
  clearPicker('witness');
}
function combinedOtherWitnessesText(){
  const parts=[];
  for(const s of STAFF_WITNESSES){
    const name=String(s?.name||s?.email||'Staff').trim();
    const email=String(s?.email||'').trim();
    parts.push(email?`${name} <${email}>`:name);
  }
  for(const row of FREE_WITNESSES){
    const name=String(row?.name||'').trim();
    if(name)parts.push(name);
  }
  const manual=String(otherWitnessesEl.value||'').trim();
  if(manual)parts.push(manual);
  return parts.join('; ').slice(0,3000);
}
function renderSearchResults(which,rows,query=''){
  const box=$(which==='people'?'peopleResults':'witnessResults');
  box.innerHTML='';
  const list=Array.isArray(rows)?rows:[];

  for(const row of list){
    const kind=String(row?.kind||(which==='people'?'student':'')).toLowerCase();
    if(which==='people'&&kind&&kind!=='student')continue;

    const b=document.createElement('button');b.type='button';
    const name=document.createElement('strong');
    const meta=document.createElement('span');meta.className='osis';

    if(kind==='staff'){
      name.textContent=row.name||row.email||'(Unknown staff member)';
      const bits=['Staff'];if(row.email)bits.push(row.email);if(row.department)bits.push(row.department);
      meta.textContent=bits.join(' • ');
      b.addEventListener('click',()=>addStaffWitness(row));
    }else{
      name.textContent=row.name||'(Unknown student)';
      meta.textContent=`Student • OSIS ${row.osis||''}`;
      b.addEventListener('click',()=>addStudent(which,row));
    }
    b.append(name,meta);box.appendChild(b);
  }

  if(which==='witness'){
    const clean=String(query||'').trim().replace(/\s+/g,' ').slice(0,200);
    const exact=list.some(row=>witnessKey(row?.name)===witnessKey(clean));
    if(clean.length>=2&&!exact){
      const b=document.createElement('button');b.type='button';
      const name=document.createElement('strong');name.textContent=`Add “${clean}” as another witness`;
      const meta=document.createElement('span');meta.className='osis';meta.textContent='Unlisted / visitor / family / community / other';
      b.append(name,meta);b.addEventListener('click',()=>addFreeWitness(clean));box.appendChild(b);
    }
  }

  box.hidden=!box.children.length;
}
async function searchPicker(which,q){
  const query=String(q||'').trim();
  if(query.length<2){renderSearchResults(which,[],query);return;}
  const endpoint=which==='witness'?'/admin/incident/witness_search':'/admin/roster/search';
  const r=await adminFetch(`${endpoint}?q=${encodeURIComponent(query)}`,{method:'GET'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j?.ok)throw new Error(j?.error||`picker_search_http_${r.status}`);
  const rows=Array.isArray(j.results)?j.results:[];
  renderSearchResults(which,rows,query);
}
function wirePicker(which){
  const input=$(which==='people'?'peopleSearch':'witnessSearch');
  input.addEventListener('input',()=>{
    clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>searchPicker(which,input.value).catch(e=>showError(`Search failed: ${e.message||e}`)),180);
  });
  input.addEventListener('focus',()=>{if(input.value.trim().length>=2)searchPicker(which,input.value).catch(()=>{});});
  if(which==='witness'){
    input.addEventListener('keydown',(ev)=>{
      if(ev.key!=='Enter')return;
      const clean=String(input.value||'').trim();
      if(clean.length<2)return;
      ev.preventDefault();
      addFreeWitness(clean);
    });
  }
}

async function loadConfig(){
  const r=await adminFetch('/admin/incident/config',{method:'GET'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j?.ok)throw new Error(j?.error||`incident_config_http_${r.status}`);
  CONFIG=j;
  locationCategoryEl.innerHTML='';
  for(const val of j.location_categories||['At School','Off campus','Online/Electronic','Other']){const o=document.createElement('option');o.value=val;o.textContent=val;locationCategoryEl.appendChild(o);}
  if(!dateEl.value)dateEl.value=j.ny_date||'';
  evidenceLimits.textContent=`Up to ${j.max_files} files • ${humanBytes(j.max_file_bytes)} each • ${humanBytes(j.max_total_bytes)} total`;
  if(!j.evidence_enabled){
    evidenceInput.disabled=true;
    evidenceHelp.textContent='Evidence upload is not configured yet. You can submit the incident without files; configure the INCIDENT_EVIDENCE R2 binding to enable uploads.';
  }
}
function renderFiles(){
  fileList.innerHTML='';
  for(const f of Array.from(evidenceInput.files||[])){
    const row=document.createElement('div');row.className='fileRow';
    const n=document.createElement('span');n.textContent=f.name;
    const s=document.createElement('span');s.textContent=humanBytes(f.size);
    row.append(n,s);fileList.appendChild(row);
  }
}
function validateFiles(){
  const files=Array.from(evidenceInput.files||[]);
  if(!files.length)return files;
  if(CONFIG?.evidence_enabled===false)throw new Error('Evidence upload is not configured yet. Remove the files and submit the report, or configure Incident Evidence storage first.');
  const maxFiles=Number(CONFIG?.max_files||5),maxEach=Number(CONFIG?.max_file_bytes||8*1024*1024),maxTotal=Number(CONFIG?.max_total_bytes||20*1024*1024);
  if(files.length>maxFiles)throw new Error(`Choose no more than ${maxFiles} evidence files.`);
  let total=0;
  for(const f of files){if(f.size>maxEach)throw new Error(`${f.name} is too large. Maximum per file is ${humanBytes(maxEach)}.`);total+=f.size;}
  if(total>maxTotal)throw new Error(`Evidence is too large in total. Maximum is ${humanBytes(maxTotal)}.`);
  return files;
}
function applyLaunchContext(){
  const u=new URL(location.href);
  const osis=String(u.searchParams.get('osis')||'').trim();
  const source=String(u.searchParams.get('source')||'').trim();
  const room=String(u.searchParams.get('room')||'').trim();
  const periodLocal=String(u.searchParams.get('periodLocal')||u.searchParams.get('period')||'').trim();
  const date=String(u.searchParams.get('date')||'').trim();
  SOURCE=source||'incident_creator';
  SOURCE_CONTEXT={launch_page:source||'incident_creator'};
  if(room)SOURCE_CONTEXT.room=room;
  if(periodLocal)SOURCE_CONTEXT.periodLocal=periodLocal;
  if(date)SOURCE_CONTEXT.date=date;
  if(source==='teacher_attendance'){
    sourcePill.textContent='Opened from Teacher Attendance';sourcePill.hidden=false;
    const bits=[];if(room)bits.push(`Room ${room}`);if(periodLocal)bits.push(`Period ${periodLocal}`);if(date)bits.push(date);
    launchContext.textContent=`Teacher Attendance context${bits.length?`: ${bits.join(' • ')}`:''}`;launchContext.hidden=false;
    locationCategoryEl.value='At School';if(room&&!locationDetailEl.value)locationDetailEl.value=`Room ${room}`;if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date))dateEl.value=date;
  }
  return osis;
}
async function preselectStudent(osis){
  if(!osis)return;
  const r=await adminFetch(`/admin/roster/search?q=${encodeURIComponent(osis)}`,{method:'GET'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j?.ok)return;
  const exact=(j.results||[]).find(x=>String(x.osis)===String(osis));if(exact)addStudent('people',exact);
}
function resetForm({preserveLaunch=true}={}){
  SUBMITTED=false;form.reset();PEOPLE=[];WITNESSES=[];STAFF_WITNESSES=[];FREE_WITNESSES=[];renderChips('people');renderChips('witness');fileList.innerHTML='';clearNotices();
  dateEl.value=CONFIG?.ny_date||'';timeEl.value=nowHHMM();
  if(CONFIG?.location_categories?.length)locationCategoryEl.value=CONFIG.location_categories[0];
  if(preserveLaunch){const osis=applyLaunchContext();void preselectStudent(osis);} 
}
function validateForm(){
  if(!PEOPLE.length&&!otherPeopleEl.value.trim())throw new Error('Add at least one person involved.');
  if(!dateEl.value)throw new Error('Choose the incident date.');
  if(!locationCategoryEl.value)throw new Error('Choose a location category.');
  if(!locationDetailEl.value.trim())throw new Error('Enter the specific location.');
  if(!descriptionEl.value.trim())throw new Error('Describe the incident.');
  return validateFiles();
}
async function submitIncident(ev){
  ev.preventDefault();if(BUSY)return;clearNotices();
  let files;try{files=validateForm();}catch(e){showError(e.message||e);return;}
  const fd=new FormData();
  fd.set('client_submission_id',newSubmissionId());fd.set('incident_date',dateEl.value);fd.set('incident_time',timeEl.value||'');fd.set('location_category',locationCategoryEl.value);fd.set('location_detail',locationDetailEl.value.trim());fd.set('description',descriptionEl.value.trim());fd.set('people_json',JSON.stringify(PEOPLE));fd.set('witnesses_json',JSON.stringify(WITNESSES));fd.set('other_people_involved',otherPeopleEl.value.trim());fd.set('other_witnesses',combinedOtherWitnessesText());fd.set('source',SOURCE);fd.set('source_context_json',JSON.stringify(SOURCE_CONTEXT||{}));fd.set('refer_to_dean',referToDeanEl?.checked?'1':'0');for(const f of files)fd.append('evidence',f,f.name);
  setBusy(true);
  try{
    const r=await adminFetch('/admin/incident/create',{method:'POST',body:fd});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j?.ok)throw new Error(j?.error||`incident_create_http_${r.status}`);
    {
      let msg=`${j.incident_id || 'Incident'} was saved with status ${j.status || 'New'}${j.duplicate?' (existing submission returned)':''}.`;
      const ref=j?.dean_referral;
      const n=ref?.notification||null;
      if(ref){
        if(n?.simulated) msg+=' Dean referral simulated in Practice Mode; no real push was sent.';
        else if(Number(n?.sent||0)>0) msg+=` Referred to Dean; push sent to ${Number(n.sent)} enabled device${Number(n.sent)===1?'':'s'}.`;
        else if(n?.error==='no_push_subscriptions') msg+=' Referred to Dean. Jorge does not have an enabled push device yet.';
        else if(n?.error==='push_not_configured') msg+=' Referred to Dean. Push notifications are not configured yet.';
        else if(n?.error==='push_category_disabled') msg+=' Referred to Dean. Jorge has this notification category turned off.';
        else if(n?.skipped) msg+=' Dean referral was already recorded for this submission.';
        else msg+=' Referred to Dean, but the push notification could not be delivered.';
      }
      successText.textContent=msg;
    }
    SUBMITTED=true;successBox.hidden=false;errorBox.hidden=true;successBox.scrollIntoView({behavior:'smooth',block:'center'});
  }catch(e){showError(e.message||e);}finally{setBusy(false);}
}
async function boot(){
  wirePicker('people');wirePicker('witness');
  evidenceInput.addEventListener('change',()=>{try{validateFiles();renderFiles();clearNotices();}catch(e){evidenceInput.value='';renderFiles();showError(e.message||e);}});
  clearBtn.addEventListener('click',()=>resetForm());newReportBtn.addEventListener('click',()=>{resetForm();submitBtn.disabled=false;window.scrollTo({top:0,behavior:'smooth'});});form.addEventListener('submit',submitIncident);
  document.addEventListener('click',(e)=>{for(const id of ['peopleResults','witnessResults']){const box=$(id);const input=$(id==='peopleResults'?'peopleSearch':'witnessSearch');if(!box.contains(e.target)&&e.target!==input)box.hidden=true;}});

  ACCESS=await getAccess();
  if(!ACCESS){
    loginOut.textContent='Please sign in.';const gsi=await waitForGoogle();gsi.initialize({client_id:GOOGLE_CLIENT_ID,ux_mode:'popup',callback:async(resp)=>{try{loginOut.textContent='Signing in…';await doLogin(resp.credential);location.reload();}catch(e){loginOut.textContent=`Login failed: ${e.message||e}`;}}});gsi.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return;
  }
  if(!(ACCESS?.can?.incident_creator||ACCESS?.can?.teacher_attendance||ACCESS?.can?.admin))throw new Error('forbidden');
  loginCard.hidden=true;app.hidden=false;reporterPill.textContent=`Reported by ${ACCESS.email||'staff'}`;
  await loadConfig();
  dateEl.value=CONFIG?.ny_date||dateEl.value;timeEl.value=nowHHMM();
  const osis=applyLaunchContext();await preselectStudent(osis);
}

boot().catch(e=>{loginOut.textContent=String(e?.message||e);showError(e?.message||e);});

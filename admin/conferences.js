/* EAGLENEST_FAMILY_CONFERENCES_V1 */
function meta(name){return document.querySelector(`meta[name="${name}"]`)?.content||'';}
const API_BASE=(meta('api-base')||'').replace(/\/*$/,'')+'/';
const GOOGLE_CLIENT_ID=meta('google-client-id')||'';
const ADMIN_SESSION_KEY='ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY='teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER='x-admin-session';
const $=(id)=>document.getElementById(id);

let access=null;
let events=[];
let bundle=null;
let selectedStudent=null;
let selectedContacts=[];
let selectedSlotId='';
let searchTimer=null;
let editingEvent=false;
// EAGLENEST_FAMILY_CONFERENCE_STAFF_PICKER_V1
let staffOptions=[];
const eventStaffSelection=new Map();
const manageStaffSelection=new Map();

function esc(v){return String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function isAdmin(){return ['admin','super_admin'].includes(String(access?.role||'').toLowerCase());}
function getSid(){try{return String(sessionStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem(ADMIN_SESSION_KEY)||sessionStorage.getItem(ADMIN_SESSION_LEGACY_KEY)||localStorage.getItem(ADMIN_SESSION_LEGACY_KEY)||'').trim();}catch{return '';}}
function setSid(sid){const v=String(sid||'').trim();if(!v)return;try{for(const k of [ADMIN_SESSION_KEY,ADMIN_SESSION_LEGACY_KEY]){sessionStorage.setItem(k,v);localStorage.setItem(k,v);}}catch{}}
async function adminFetch(pathOrUrl,init={}){const url=pathOrUrl instanceof URL?pathOrUrl:new URL(pathOrUrl,API_BASE);const headers=new Headers(init.headers||{});const sid=getSid();if(sid&&!headers.has(ADMIN_SESSION_HEADER))headers.set(ADMIN_SESSION_HEADER,sid);const r=await fetch(url,{...init,headers,credentials:'include',cache:'no-store'});const next=String(r.headers.get('x-admin-session')||'').trim();if(next)setSid(next);return r;}
async function api(path,init={}){const r=await adminFetch(path,init);const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok){const e=new Error(j?.error||`HTTP ${r.status}`);e.payload=j;e.status=r.status;throw e;}return j;}
function setStatus(message,kind=''){const el=$('pageStatus');el.textContent=message||'';el.className=`status ${kind}`.trim();}
function fmtDate(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return String(date||'');const d=new Date(`${date}T12:00:00`);return d.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',year:'numeric'});}
function fmtTime(iso){const d=new Date(String(iso||''));return Number.isFinite(d.getTime())?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—';}
function fmtDateTime(iso){const d=new Date(String(iso||''));return Number.isFinite(d.getTime())?d.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):String(iso||'');}
function firstName(name){return String(name||'').trim().split(/\s+/)[0]||'';}
function staffLabel(email){const row=bundle?.staff?.find((s)=>s.staff_email===email);return row?.staff_name||row?.staff_email||email||'Staff';}
function staffLocation(email){const row=bundle?.staff?.find((s)=>s.staff_email===email);return row?.location||bundle?.event?.location||'';}
function currentEventId(){return String($('eventSelect').value||bundle?.event?.event_id||'');}

async function waitForGoogle(timeoutMs=8000){const start=Date.now();while(!window.google?.accounts?.id){if(Date.now()-start>timeoutMs)throw new Error('Google sign-in failed to load');await new Promise(r=>setTimeout(r,50));}return google.accounts.id;}
async function getAccess(){const r=await adminFetch('/admin/access');if(!r.ok)return null;const j=await r.json().catch(()=>null);return j?.ok?j:null;}
async function doLogin(token){const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:token}).toString()});const j=await r.json().catch(()=>({}));if(j?.sid)setSid(j.sid);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);}

// EAGLENEST_FAMILY_CONFERENCE_STAFF_PICKER_V1
function normalizeStaffOption(raw){const email=String(raw?.email||raw?.staff_email||'').trim().toLowerCase();return{email,name:String(raw?.name||raw?.staff_name||email).trim(),department:String(raw?.department||'').trim(),grade_team:String(raw?.grade_team||'').trim(),status:String(raw?.status||'').trim(),teacher_assignment_match:String(raw?.teacher_assignment_match||'').trim(),room_hint:String(raw?.room_hint||raw?.location||'').trim()};}
function staffSelectionRow(raw){const o=normalizeStaffOption(raw);return{staff_email:o.email,staff_name:o.name,location:String(raw?.location??o.room_hint??'').trim()};}
function seedStaffSelection(target,rows){target.clear();for(const raw of Array.isArray(rows)?rows:[]){const row=staffSelectionRow(raw);if(row.staff_email)target.set(row.staff_email,row);}}
function selectedStaffRows(target){return Array.from(target.values()).filter((r)=>r.staff_email);}
function staffPickerParts(kind){return kind==='event'?{map:eventStaffSelection,search:$('eventStaffSearch'),root:$('eventStaffPicker'),count:$('eventStaffCount')}:{map:manageStaffSelection,search:$('staffSearch'),root:$('staffPicker'),count:$('staffSelectedCount')};}
function staffPickerSource(map){const merged=new Map(staffOptions.map((row)=>[row.email,row]));for(const selected of map.values()){if(!merged.has(selected.staff_email))merged.set(selected.staff_email,normalizeStaffOption(selected));}return Array.from(merged.values()).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'})||a.email.localeCompare(b.email));}
function filteredStaffOptions(kind){const{map,search}=staffPickerParts(kind);const term=String(search?.value||'').trim().toLowerCase();const rows=staffPickerSource(map);if(!term)return rows;return rows.filter((row)=>[row.name,row.email,row.department,row.grade_team,row.status,row.teacher_assignment_match].join(' ').toLowerCase().includes(term));}
function renderStaffPicker(kind){const{map,root,count}=staffPickerParts(kind);if(!root)return;if(count)count.textContent=`${map.size} selected`;const rows=filteredStaffOptions(kind);if(!rows.length){root.innerHTML=`<div class="staffPickerEmpty">${staffOptions.length?'No staff match this search.':'No staff roster is available yet.'}</div>`;return;}root.innerHTML=rows.map((row)=>{const selected=map.get(row.email);const meta=[row.department,row.grade_team,row.status].filter(Boolean).join(' • ');const room=selected?.location??row.room_hint??'';return `<div class="staffPickerRow ${selected?'selected':''}"><label class="staffPickerChoice"><input type="checkbox" data-staff-choice="${esc(row.email)}" ${selected?'checked':''}><span class="staffPickerIdentity"><span class="staffPickerName">${esc(row.name||row.email)}</span><span class="staffPickerEmail">${esc(row.email)}</span>${meta?`<span class="staffPickerMeta">${esc(meta)}</span>`:''}</span></label>${selected?`<label class="staffPickerRoom">Conference room<input type="text" maxlength="120" data-staff-room="${esc(row.email)}" value="${esc(room)}" placeholder="Optional"></label>`:'<span></span>'}</div>`;}).join('');root.querySelectorAll('[data-staff-choice]').forEach((input)=>input.addEventListener('change',()=>{const email=String(input.dataset.staffChoice||'').toLowerCase();const option=staffPickerSource(map).find((row)=>row.email===email);if(input.checked&&option){const prior=map.get(email);map.set(email,{staff_email:email,staff_name:option.name||email,location:prior?.location||option.room_hint||''});}else map.delete(email);renderStaffPicker(kind);}));root.querySelectorAll('[data-staff-room]').forEach((input)=>input.addEventListener('input',()=>{const email=String(input.dataset.staffRoom||'').toLowerCase();const row=map.get(email);if(row)row.location=input.value.trim();}));}
function selectVisibleStaff(kind){const{map}=staffPickerParts(kind);for(const option of filteredStaffOptions(kind)){const prior=map.get(option.email);map.set(option.email,{staff_email:option.email,staff_name:option.name||option.email,location:prior?.location||option.room_hint||''});}renderStaffPicker(kind);}
function clearStaffSelection(kind){const{map}=staffPickerParts(kind);map.clear();renderStaffPicker(kind);}
async function loadStaffOptions(){if(!isAdmin())return;const data=await api('/admin/conferences/staff_options');staffOptions=(Array.isArray(data.rows)?data.rows:[]).map(normalizeStaffOption).filter((row)=>row.email);const me=String(access?.email||'').trim().toLowerCase();if(me&&!staffOptions.some((row)=>row.email===me))staffOptions.push(normalizeStaffOption({email:me,name:me.split('@')[0]}));renderStaffPicker('event');renderStaffPicker('manage');}


async function loadEvents(preferId=''){
  const data=await api('/admin/conferences/events');
  events=Array.isArray(data.events)?data.events:[];
  const select=$('eventSelect');select.replaceChildren();
  if(!events.length){select.appendChild(new Option('No conference events yet',''));bundle=null;renderBundle();if(isAdmin())setStatus('No conference events yet. Create one to start reviewing the workflow.');return;}
  for(const e of events){select.appendChild(new Option(`${fmtDate(e.event_date)} — ${e.title}${e.status==='draft'?' [Draft]':''}`,e.event_id));}
  const wanted=preferId&&events.some((e)=>e.event_id===preferId)?preferId:(currentEventId()&&events.some((e)=>e.event_id===currentEventId())?currentEventId():events[0].event_id);
  select.value=wanted;await loadBundle(wanted);
}

async function loadBundle(eventId){
  if(!eventId){bundle=null;renderBundle();return;}
  setStatus('Loading conference event…');
  try{bundle=await api(`/admin/conferences/event?event_id=${encodeURIComponent(eventId)}`);selectedSlotId='';renderBundle();setStatus('');}
  catch(e){bundle=null;renderBundle();setStatus(`Could not load conference event: ${e.message}`,'error');}
}

function renderBundle(){
  const has=!!bundle?.event;$('eventEmpty').hidden=has;$('eventDetails').hidden=!has;
  if(!has){$('slotGrid').innerHTML='<div class="muted">Choose an event.</div>';$('bookingBody').innerHTML='<tr><td colspan="7" class="muted">Choose an event.</td></tr>';renderPreview();return;}
  const e=bundle.event;$('eventTitle').textContent=e.title;
  $('eventMeta').innerHTML=[`<span class="pill">${esc(fmtDate(e.event_date))}</span>`,`<span class="pill">${esc(e.day_start_time)}–${esc(e.day_end_time)}</span>`,`<span class="pill">${Number(e.slot_minutes)} min${e.buffer_minutes?` + ${Number(e.buffer_minutes)} buffer`:''}</span>`,`<span class="pill ${e.status==='active'?'good':e.status==='closed'?'danger':'warn'}">${esc(e.status)}</span>`,e.location?`<span class="pill">${esc(e.location)}</span>`:'',`<span class="pill warn">Family access OFF</span>`].filter(Boolean).join('');
  $('kpiStaff').textContent=bundle.summary?.staff??0;$('kpiSlots').textContent=bundle.summary?.slots??0;$('kpiOpen').textContent=bundle.summary?.open_slots??0;$('kpiScheduled').textContent=bundle.summary?.scheduled??0;$('kpiCompleted').textContent=bundle.summary?.completed??0;$('kpiNoShow').textContent=bundle.summary?.no_show??0;
  populateStaffSelects();renderSlots();renderBookings();renderPreview();
}

function populateStaffSelects(){
  const rows=Array.isArray(bundle?.staff)?bundle.staff:[];
  const own=String(access?.email||'').toLowerCase();
  for(const id of ['staffFilter','scheduleStaffFilter','previewStaff']){
    const sel=$(id);const previous=sel.value;sel.replaceChildren();
    if((id==='scheduleStaffFilter'||id==='previewStaff')&&isAdmin())sel.appendChild(new Option(id==='scheduleStaffFilter'?'All staff':'First available staff',''));
    for(const s of rows){if(!isAdmin()&&s.staff_email!==own)continue;sel.appendChild(new Option(`${s.staff_name||s.staff_email}${s.location?` — ${s.location}`:''}`,s.staff_email));}
    if(previous&&[...sel.options].some((o)=>o.value===previous))sel.value=previous;else if(!isAdmin()&&[...sel.options].some((o)=>o.value===own))sel.value=own;else if(id==='staffFilter'&&sel.options.length)sel.selectedIndex=0;
  }
}

function availableSlots(){const lane=$('staffFilter').value;return (bundle?.slots||[]).filter((s)=>s.status==='open'&&(!lane||s.staff_email===lane));}
function renderSlots(){
  const root=$('slotGrid');const slots=availableSlots();
  if(!slots.length){root.innerHTML='<div class="muted">No open slots in this lane. Admins can generate slots or choose another staff member.</div>';$('bookBtn').disabled=true;return;}
  root.innerHTML=slots.map((s)=>`<button class="slotBtn ${s.slot_id===selectedSlotId?'active':''}" type="button" data-slot-id="${esc(s.slot_id)}"><strong>${esc(fmtTime(s.start_iso))}</strong><div>${esc(fmtTime(s.end_iso))}</div><div class="slotStaff">${esc(staffLabel(s.staff_email))}${staffLocation(s.staff_email)?` • ${esc(staffLocation(s.staff_email))}`:''}</div></button>`).join('');
  root.querySelectorAll('[data-slot-id]').forEach((btn)=>btn.addEventListener('click',()=>{selectedSlotId=btn.dataset.slotId||'';renderSlots();updateBookButton();}));
  updateBookButton();
}
function updateBookButton(){$('bookBtn').disabled=!(selectedStudent&&selectedSlotId&&bundle?.event);}

function contactFromSelect(){const idx=Number($('contactSelect').value);return Number.isInteger(idx)&&idx>=0?selectedContacts[idx]||null:null;}
function renderSelectedStudent(){
  const root=$('selectedStudent');const sel=$('contactSelect');sel.replaceChildren();sel.appendChild(new Option('No specific contact selected',''));
  if(!selectedStudent){root.className='studentBox muted';root.textContent='No student selected.';selectedContacts=[];updateBookButton();renderPreview();return;}
  root.className='studentBox';root.innerHTML=`<strong>${esc(selectedStudent.name||'Student')}</strong><div class="muted small">OSIS ${esc(selectedStudent.osis||'')}</div>`;
  selectedContacts.forEach((c,i)=>{const name=c.display?.name||c.source?.display_name||'Unnamed contact';const rel=c.display?.relationship||c.source?.relationship||'';sel.appendChild(new Option(`${name}${rel?` — ${rel}`:''}`,String(i)));});
  updateBookButton();renderPreview();
}

async function searchStudents(q){
  const term=String(q||'').trim();const menu=$('studentSearchMenu');if(term.length<2){menu.hidden=true;return;}
  try{const data=await api(`/admin/roster/search?q=${encodeURIComponent(term)}`);const results=Array.isArray(data.results)?data.results:[];menu.innerHTML=results.length?results.map((r)=>`<button type="button" data-osis="${esc(r.osis)}" data-name="${esc(r.name||'')}"><strong>${esc(r.name||'—')}</strong><div class="muted small">${esc(r.osis||'')}</div></button>`).join(''):'<div class="muted small" style="padding:10px">No matches.</div>';menu.hidden=false;menu.querySelectorAll('[data-osis]').forEach((b)=>b.addEventListener('click',()=>selectStudent({osis:b.dataset.osis,name:b.dataset.name})));}
  catch(e){menu.innerHTML=`<div class="small" style="padding:10px;color:var(--danger)">${esc(e.message)}</div>`;menu.hidden=false;}
}
async function selectStudent(student,preferredContactAssoc=''){
  selectedStudent={osis:String(student?.osis||''),name:String(student?.name||'')};$('studentSearch').value=selectedStudent.name||selectedStudent.osis;$('studentSearchMenu').hidden=true;selectedContacts=[];renderSelectedStudent();
  try{const data=await api(`/admin/contacts/student?student_number=${encodeURIComponent(selectedStudent.osis)}`);selectedContacts=Array.isArray(data.contacts)?data.contacts:[];if(data.student_name&&!selectedStudent.name)selectedStudent.name=data.student_name;renderSelectedStudent();if(preferredContactAssoc){const idx=selectedContacts.findIndex((c)=>String(c.contact_assoc_id||'')===String(preferredContactAssoc));if(idx>=0)$('contactSelect').value=String(idx);}}
  catch(e){setStatus(`Student selected, but contacts could not be loaded: ${e.message}`,'error');}
}

async function createBooking(){
  if(!selectedStudent||!selectedSlotId||!bundle?.event)return;const contact=contactFromSelect();$('bookBtn').disabled=true;setStatus('Booking conference…');
  const display=contact?.display||{};const source=contact?.source||{};
  try{await api('/admin/conferences/booking/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({booking:{event_id:bundle.event.event_id,slot_id:selectedSlotId,student_number:selectedStudent.osis,student_name:selectedStudent.name,family_contact_assoc_id:contact?.contact_assoc_id||'',family_contact_name:display.name||source.display_name||source.name||'',family_relationship:display.relationship||source.relationship||'',family_phone:display.phone||source.phone||'',family_email:display.email||source.email||'',notes:$('bookingNotes').value.trim()}})});$('bookingNotes').value='';selectedSlotId='';await loadBundle(bundle.event.event_id);setStatus(`Booked ${selectedStudent.name} successfully. No family message was sent.`,'good');}
  catch(e){setStatus(`Could not book conference: ${e.message}`,'error');}
  finally{updateBookButton();}
}

function bookingActionButtons(b){if(b.status!=='scheduled')return '';return `<div class="toolbar" style="justify-content:flex-start"><button type="button" data-book-action="calendar" data-id="${esc(b.booking_id)}">Calendar</button><button type="button" data-book-action="complete" data-id="${esc(b.booking_id)}">Complete</button><button type="button" data-book-action="no_show" data-id="${esc(b.booking_id)}">No show</button><button class="danger" type="button" data-book-action="cancelled" data-id="${esc(b.booking_id)}">Cancel</button></div>`;}
function renderBookings(){
  const body=$('bookingBody');const lane=$('scheduleStaffFilter').value;const rows=(bundle?.bookings||[]).filter((b)=>!lane||b.staff_email===lane).sort((a,b)=>{const sa=bundle.slots.find((s)=>s.slot_id===a.slot_id)?.start_iso||'';const sb=bundle.slots.find((s)=>s.slot_id===b.slot_id)?.start_iso||'';return sa.localeCompare(sb);});
  if(!rows.length){body.innerHTML='<tr><td colspan="7" class="muted">No bookings for this view.</td></tr>';return;}
  body.innerHTML=rows.map((b)=>{const slot=bundle.slots.find((s)=>s.slot_id===b.slot_id);return `<tr><td><strong>${esc(fmtTime(slot?.start_iso))}</strong><div class="muted small">${esc(fmtDateTime(slot?.start_iso))}</div></td><td>${esc(b.staff_name||staffLabel(b.staff_email))}</td><td><strong>${esc(b.student_name)}</strong><div class="muted small">${esc(b.student_number)}</div></td><td>${esc(b.family_contact_name||'No specific contact')}${b.family_relationship?`<div class="muted small">${esc(b.family_relationship)}</div>`:''}</td><td><span class="pill ${b.status==='scheduled'?'good':b.status==='no_show'?'danger':''}">${esc(b.status)}</span></td><td>${esc(b.notes||'')}</td><td>${bookingActionButtons(b)}</td></tr>`;}).join('');
  body.querySelectorAll('[data-book-action]').forEach((btn)=>btn.addEventListener('click',()=>handleBookingAction(btn.dataset.id,btn.dataset.bookAction)));
}
function calendarUrl(booking){const slot=bundle?.slots?.find((s)=>s.slot_id===booking.slot_id);if(!slot)return '';const stamp=(iso)=>new Date(iso).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');const u=new URL('https://calendar.google.com/calendar/render');u.searchParams.set('action','TEMPLATE');u.searchParams.set('text',`Student & Family Conference — ${booking.student_name}`);u.searchParams.set('dates',`${stamp(slot.start_iso)}/${stamp(slot.end_iso)}`);u.searchParams.set('details',`Student: ${booking.student_name}\nFamily contact: ${booking.family_contact_name||'Not specified'}\nScheduled through EagleNEST.`);const loc=staffLocation(booking.staff_email);if(loc)u.searchParams.set('location',loc);u.searchParams.set('ctz','America/New_York');return u.toString();}
async function handleBookingAction(id,action){const booking=bundle?.bookings?.find((b)=>b.booking_id===id);if(!booking)return;if(action==='calendar'){const url=calendarUrl(booking);if(url)window.open(url,'_blank','noopener');return;}const label=action==='cancelled'?'cancel':action==='no_show'?'mark no show':'mark complete';if(!confirm(`${label} for ${booking.student_name}?`))return;try{await api('/admin/conferences/booking/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({booking_id:id,status:action})});await loadBundle(bundle.event.event_id);setStatus(`Conference booking updated: ${action}.`,'good');}catch(e){setStatus(`Could not update booking: ${e.message}`,'error');}}

function renderPreview(){
  const root=$('familyPreview');const e=bundle?.event;if(!e){root.innerHTML='<span class="previewBadge">PREVIEW ONLY</span><h2>Student & Family Conferences</h2><p>Select an event to preview the family experience.</p>';return;}
  const privacy=$('previewPrivacy').value;let studentLabel='your student';if(selectedStudent){studentLabel=privacy==='full'?selectedStudent.name:privacy==='first'?firstName(selectedStudent.name):'your student';}
  let staffEmail=$('previewStaff').value;if(!staffEmail)staffEmail=(bundle.staff||[])[0]?.staff_email||'';const slots=(bundle.slots||[]).filter((s)=>s.status==='open'&&(!staffEmail||s.staff_email===staffEmail)).slice(0,6);
  root.innerHTML=`<span class="previewBadge">STAFF PREVIEW — NOT SENT TO FAMILIES</span><h2>${esc(e.title)}</h2><p>We look forward to meeting with you for <strong>${esc(studentLabel)}</strong>.</p><p><strong>${esc(fmtDate(e.event_date))}</strong>${staffEmail?` with ${esc(staffLabel(staffEmail))}`:''}${staffLocation(staffEmail)?` in ${esc(staffLocation(staffEmail))}`:''}.</p><p>Please choose an available conference time:</p>${slots.length?slots.map((s)=>`<div class="choice">○ ${esc(fmtTime(s.start_iso))} – ${esc(fmtTime(s.end_iso))}</div>`).join(''):'<div class="choice">No open times in this preview lane.</div>'}<p style="font-size:.86rem;color:#66758a">This mockup does not contain a working submit button, public URL, email sender, or text sender. You are only reviewing what a future family-facing page could look like.</p>`;
}

function openNewEvent(){editingEvent=false;$('eventModalTitle').textContent='New conference event';$('eventName').value='';$('eventDate').value='';$('eventStatus').value='draft';$('eventStart').value='15:30';$('eventEnd').value='19:00';$('eventSlotMinutes').value='15';$('eventBufferMinutes').value='0';$('eventLocation').value='';$('eventInstructions').value='';$('eventModalStatus').textContent='';$('eventStaffSection').hidden=false;$('eventStaffSearch').value='';seedStaffSelection(eventStaffSelection,[]);const me=String(access?.email||'').toLowerCase();const mine=staffOptions.find((row)=>row.email===me);if(mine)eventStaffSelection.set(me,{staff_email:me,staff_name:mine.name||me,location:mine.room_hint||''});renderStaffPicker('event');for(const id of ['eventDate','eventStart','eventEnd','eventSlotMinutes','eventBufferMinutes'])$(id).disabled=false;$('eventModal').hidden=false;}
function openEditEvent(){if(!bundle?.event)return;editingEvent=true;const e=bundle.event;const timingLocked=Number(bundle?.summary?.scheduled||0)>0;$('eventModalTitle').textContent='Edit conference event';$('eventName').value=e.title;$('eventDate').value=e.event_date;$('eventStatus').value=e.status;$('eventStart').value=e.day_start_time;$('eventEnd').value=e.day_end_time;$('eventSlotMinutes').value=e.slot_minutes;$('eventBufferMinutes').value=e.buffer_minutes;$('eventLocation').value=e.location||'';$('eventInstructions').value=e.instructions||'';$('eventStaffSection').hidden=true;$('eventModalStatus').textContent=timingLocked?'Date/times are locked because scheduled bookings exist. Staff lanes are managed separately.':'You can still adjust date/times before the first booking. Changing timing clears unbooked slots, so regenerate slots afterward.';for(const id of ['eventDate','eventStart','eventEnd','eventSlotMinutes','eventBufferMinutes'])$(id).disabled=timingLocked;$('eventModal').hidden=false;}
async function saveEvent(){const status=$('eventStatus').value;$('saveEventBtn').disabled=true;$('eventModalStatus').textContent='Saving…';try{if(editingEvent){const result=await api('/admin/conferences/update',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:bundle.event.event_id,event:{title:$('eventName').value.trim(),status,event_date:$('eventDate').value,day_start_time:$('eventStart').value,day_end_time:$('eventEnd').value,slot_minutes:Number($('eventSlotMinutes').value||15),buffer_minutes:Number($('eventBufferMinutes').value||0),location:$('eventLocation').value.trim(),instructions:$('eventInstructions').value.trim()}})});$('eventModal').hidden=true;await loadEvents(bundle.event.event_id);setStatus(result.timing_changed?'Conference event updated. Timing changed, so regenerate slots.':'Conference event updated.','good');}else{const staff=selectedStaffRows(eventStaffSelection);if(!staff.length)throw new Error('Select at least one participating staff member.');const result=await api('/admin/conferences/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:{title:$('eventName').value.trim(),event_date:$('eventDate').value,day_start_time:$('eventStart').value,day_end_time:$('eventEnd').value,slot_minutes:Number($('eventSlotMinutes').value||15),buffer_minutes:Number($('eventBufferMinutes').value||0),location:$('eventLocation').value.trim(),instructions:$('eventInstructions').value.trim(),staff}})});if(status!=='draft')await api('/admin/conferences/update',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:result.event.event_id,event:{status}})});$('eventModal').hidden=true;await loadEvents(result.event.event_id);setStatus('Conference event created. Generate slots when you are ready.','good');}}catch(e){$('eventModalStatus').textContent=`Could not save: ${e.message}`;}finally{$('saveEventBtn').disabled=false;}}
function openStaff(){if(!bundle?.event)return;$('staffSearch').value='';seedStaffSelection(manageStaffSelection,bundle.staff);renderStaffPicker('manage');$('staffModalStatus').textContent='';$('staffModal').hidden=false;}
async function saveStaff(){const staff=selectedStaffRows(manageStaffSelection);$('saveStaffBtn').disabled=true;$('staffModalStatus').textContent='Saving…';try{if(!staff.length)throw new Error('Select at least one participating staff member.');await api('/admin/conferences/staff',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:bundle.event.event_id,staff})});$('staffModal').hidden=true;await loadBundle(bundle.event.event_id);setStatus('Staff lanes updated. Generate slots again.','good');}catch(e){$('staffModalStatus').textContent=`Could not save staff lanes: ${e.message}`;}finally{$('saveStaffBtn').disabled=false;}}
async function generateSlots(){if(!bundle?.event)return;if(!confirm('Generate conference slots for every active staff lane? Existing unbooked slots will be rebuilt.'))return;$('generateSlotsBtn').disabled=true;setStatus('Generating conference slots…');try{const result=await api('/admin/conferences/generate_slots',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:bundle.event.event_id})});await loadBundle(bundle.event.event_id);setStatus(`Generated ${result.generated} conference slots.`,'good');}catch(e){setStatus(`Could not generate slots: ${e.message}`,'error');}finally{$('generateSlotsBtn').disabled=false;}}

async function bootPrefill(){const u=new URL(location.href);const osis=u.searchParams.get('osis');if(!osis)return;await selectStudent({osis,name:u.searchParams.get('name')||''},u.searchParams.get('contact_assoc_id')||'');}
async function boot(){
  access=await getAccess();
  if(!access){$('loginOut').textContent='Please sign in.';const g=await waitForGoogle();g.initialize({client_id:GOOGLE_CLIENT_ID,ux_mode:'popup',callback:async(r)=>{try{$('loginOut').textContent='Signing in…';await doLogin(r.credential);location.reload();}catch(e){$('loginOut').textContent=`Login failed: ${e.message}`;}}});g.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return;}
  if(!(isAdmin()||access?.can?.student_contacts))throw new Error('forbidden');$('loginCard').hidden=true;$('app').hidden=false;$('viewerMeta').textContent=`${access.email||'Staff'} • ${isAdmin()?'admin conference management':'my conference schedule'}`;document.querySelectorAll('.adminOnly').forEach((el)=>el.hidden=!isAdmin());
  $('eventSelect').addEventListener('change',()=>loadBundle($('eventSelect').value));$('refreshBtn').addEventListener('click',()=>loadEvents(currentEventId()));$('newEventBtn').addEventListener('click',openNewEvent);$('editEventBtn').addEventListener('click',openEditEvent);$('manageStaffBtn').addEventListener('click',openStaff);$('generateSlotsBtn').addEventListener('click',generateSlots);$('bookBtn').addEventListener('click',createBooking);$('staffFilter').addEventListener('change',()=>{selectedSlotId='';renderSlots();renderPreview();});$('scheduleStaffFilter').addEventListener('change',renderBookings);$('previewPrivacy').addEventListener('change',renderPreview);$('previewStaff').addEventListener('change',renderPreview);$('contactSelect').addEventListener('change',renderPreview);$('closeEventModal').addEventListener('click',()=>{$('eventModal').hidden=true;});$('saveEventBtn').addEventListener('click',saveEvent);$('closeStaffModal').addEventListener('click',()=>{$('staffModal').hidden=true;});$('saveStaffBtn').addEventListener('click',saveStaff);$('studentSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchStudents($('studentSearch').value),220);});
  // EAGLENEST_FAMILY_CONFERENCE_STAFF_PICKER_V1
  $('eventStaffSearch').addEventListener('input',()=>renderStaffPicker('event'));
  $('eventSelectVisibleStaff').addEventListener('click',()=>selectVisibleStaff('event'));
  $('eventClearStaff').addEventListener('click',()=>clearStaffSelection('event'));
  $('staffSearch').addEventListener('input',()=>renderStaffPicker('manage'));
  $('staffSelectVisible').addEventListener('click',()=>selectVisibleStaff('manage'));
  $('staffClearSelection').addEventListener('click',()=>clearStaffSelection('manage'));
  if(isAdmin()){try{await loadStaffOptions();}catch(e){setStatus(`Could not load staff picker: ${e.message}`,'error');}}
  await loadEvents();await bootPrefill();
}
boot().catch((e)=>{$('loginOut').textContent=String(e?.message||e);setStatus(String(e?.message||e),'error');});

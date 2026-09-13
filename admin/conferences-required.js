/* EAGLENEST_CONFERENCE_REQUIRED_ADVISEES_V1 */
(() => {
  let advisorOptions = [];
  let requirementStudent = null;
  let requirementContacts = [];

  function reqEsc(v){return String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function reqFmtDateTime(iso){const d=new Date(String(iso||''));return Number.isFinite(d.getTime())?d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';}
  function reqStatusLabel(status){
    return ({
      no_outreach:'No outreach',
      contacted:'Contact attempted',
      family_reached:'Family reached',
      booked:'Booked',
      completed:'Completed',
      no_show:'No show',
      needs_rescheduling:'Needs rescheduling'
    })[status] || String(status||'—');
  }
  function reqIsAdmin(){return ['admin','super_admin'].includes(String(access?.role||'').toLowerCase());}

  function injectRequirementUi(){
    if(document.getElementById('conferenceRequirementCard')) return;

    const eventCard=document.getElementById('eventSelect')?.closest('.card');
    if(eventCard){
      const card=document.createElement('section');
      card.id='conferenceRequirementCard';
      card.className='card';
      card.hidden=true;
      card.innerHTML=`
        <div class="sectionHead">
          <div>
            <h2 id="requirementHeading">Required advisees</h2>
            <div id="requirementSubhead" class="muted small">Conference responsibility is snapshotted from the official advisory roster.</div>
          </div>
          <div class="toolbar">
            <button id="requirementRefreshBtn" type="button" class="adminOnly reqAdminOnly" hidden>Build required advisee roster</button>
          </div>
        </div>
        <div id="requirementKpis" class="requirementKpis"></div>
        <div id="requirementSnapshotNote" class="reqSnapshotNote"></div>
        <div id="requirementAdminProgress" class="reqProgressWrap adminOnly reqAdminOnly" hidden>
          <h3>Advisor progress</h3>
          <div class="tableWrap"><table class="table reqProgressTable">
            <thead><tr><th>Advisor</th><th>Required</th><th>Contacted</th><th>Booked</th><th>Completed</th><th>Still need booking</th></tr></thead>
            <tbody id="requirementAdvisorBody"></tbody>
          </table></div>
        </div>
        <div class="sectionHead" style="margin-top:18px">
          <div><h3 id="requirementRosterTitle" style="margin:0">Required students</h3></div>
          <div class="requirementFilters">
            <label class="adminOnly reqAdminOnly" hidden>Advisor<select id="requirementAdvisorFilter"></select></label>
            <label>Status<select id="requirementStatusFilter">
              <option value="">All statuses</option>
              <option value="no_outreach">No outreach</option>
              <option value="contacted">Contact attempted</option>
              <option value="family_reached">Family reached</option>
              <option value="booked">Booked</option>
              <option value="needs_rescheduling">Needs rescheduling</option>
              <option value="completed">Completed</option>
              <option value="no_show">No show</option>
            </select></label>
          </div>
        </div>
        <div class="tableWrap" style="margin-top:12px"><table class="table reqStudentTable">
          <thead><tr><th>Student</th><th>Advisor</th><th>Outreach</th><th>Conference</th><th>Actions</th></tr></thead>
          <tbody id="requirementStudentBody"></tbody>
        </table></div>`;
      eventCard.insertAdjacentElement('afterend',card);
    }

    const adminActions=document.getElementById('eventAdminActions');
    if(adminActions&&!document.getElementById('requirementSnapshotBtn')){
      const btn=document.createElement('button');
      btn.id='requirementSnapshotBtn';
      btn.type='button';
      btn.textContent='Required advisees';
      btn.className='adminOnly reqAdminOnly';
      adminActions.insertBefore(btn,document.getElementById('generateSlotsBtn'));
    }

    const formGrid=document.querySelector('#eventModal .formGrid');
    if(formGrid&&!document.getElementById('eventRequireAdvisees')){
      const label=document.createElement('label');
      label.className='reqCheckboxLabel';
      label.innerHTML=`<input id="eventRequireAdvisees" type="checkbox" checked>
        <span><strong>Required for every advisee of participating advisors</strong><span class="muted small" style="display:block">After the event is created, EagleNEST snapshots each selected advisor's official advisee roster for this conference.</span></span>`;
      formGrid.appendChild(label);
    }

    const staffTools=document.querySelector('#eventStaffSection .staffPickerTools');
    if(staffTools&&!document.getElementById('eventSelectAllAdvisors')){
      const btn=document.createElement('button');
      btn.id='eventSelectAllAdvisors';
      btn.type='button';
      btn.textContent='Select all advisors';
      staffTools.insertBefore(btn,staffTools.firstChild);
    }

    if(!document.getElementById('conferenceOutreachModal')){
      const modal=document.createElement('div');
      modal.id='conferenceOutreachModal';
      modal.className='modalBackdrop';
      modal.hidden=true;
      modal.innerHTML=`
        <section class="modal card" role="dialog" aria-modal="true">
          <div class="modalHead"><h2>Conference outreach</h2><button id="closeConferenceOutreach" type="button">Close</button></div>
          <div id="reqModalStudent" class="reqModalStudent"></div>
          <div class="formGrid">
            <label class="wide">Family contact<select id="reqContactSelect"><option value="">No specific contact</option></select></label>
            <label>Method<select id="reqMethod">
              <option>Phone</option><option>Email</option><option>ParentSquare</option><option>Text</option><option>In Person</option><option>Other</option>
            </select></label>
            <label>Outcome<select id="reqOutcome">
              <option>Spoke/Connected</option><option>Left Voicemail</option><option>No Answer</option><option>Message Sent</option><option>Follow-up Needed</option><option>Resolved</option><option>Other</option>
            </select></label>
            <div class="wide">
              <div class="muted small">Quick outcome</div>
              <div id="reqQuickOutcomes" class="reqQuickOutcomes">
                <button type="button" data-req-outcome="Spoke/Connected">Spoke with family</button>
                <button type="button" data-req-outcome="Left Voicemail">Left voicemail</button>
                <button type="button" data-req-outcome="No Answer">No answer</button>
                <button type="button" data-req-outcome="Message Sent">Message sent</button>
                <button type="button" data-req-outcome="Follow-up Needed">Follow-up needed</button>
              </div>
            </div>
            <label class="wide">Notes<textarea id="reqNotes" rows="3" maxlength="3200" placeholder="Optional details about the conference outreach"></textarea></label>
            <label class="wide">Book conference time now (optional)<select id="reqSlot"><option value="">Log communication only — do not book yet</option></select></label>
          </div>
          <div class="reqBookHint" style="margin-top:12px">If you choose a time, EagleNEST will log this communication and create the conference booking in one workflow. Nothing is sent to the family automatically.</div>
          <div id="reqModalStatus" class="status" style="margin-top:10px"></div>
          <div class="toolbar" style="justify-content:flex-end;margin-top:12px"><button id="saveConferenceOutreach" class="primary" type="button">Save communication</button></div>
        </section>`;
      document.body.appendChild(modal);
    }
  }

  async function loadAdvisorOptions(){
    if(!reqIsAdmin()) return;
    try{
      const data=await api('/admin/conferences/advisor_options');
      advisorOptions=Array.isArray(data.rows)?data.rows:[];
    }catch(e){
      advisorOptions=[];
      setStatus(`Could not load advisor roster options: ${e.message}`,'error');
    }
  }

  function selectAllAdvisors(){
    if(!reqIsAdmin()) return;
    if(!advisorOptions.length){alert('No stable advisor roster is available yet.');return;}
    for(const advisor of advisorOptions){
      const email=String(advisor.email||'').toLowerCase();
      if(!email) continue;
      const existing=eventStaffSelection.get(email);
      eventStaffSelection.set(email,{
        staff_email:email,
        staff_name:advisor.name||existing?.staff_name||email,
        location:existing?.location||''
      });
    }
    renderStaffPicker('event');
  }

  function renderRequirement(){
    const card=document.getElementById('conferenceRequirementCard');
    if(!card) return;
    const req=bundle?.requirement;
    const hasEvent=!!bundle?.event;
    card.hidden=!hasEvent;
    document.querySelectorAll('.reqAdminOnly').forEach((el)=>el.hidden=!reqIsAdmin());
    if(!hasEvent) return;

    const refresh=document.getElementById('requirementRefreshBtn');
    const actionBtn=document.getElementById('requirementSnapshotBtn');
    if(refresh) refresh.textContent=req?.configured?'Rebuild required advisee roster':'Build required advisee roster';
    if(actionBtn) actionBtn.textContent=req?.configured?'Required advisees ✓':'Required advisees';

    if(!req?.configured){
      document.getElementById('requirementHeading').textContent=reqIsAdmin()?'Required advisees not built yet':'Required advisees';
      document.getElementById('requirementSubhead').textContent=reqIsAdmin()
        ?'Build the event-specific required roster from the official advisory roster.'
        :'This event does not have a required advisee roster yet.';
      document.getElementById('requirementKpis').innerHTML='';
      document.getElementById('requirementSnapshotNote').textContent='';
      document.getElementById('requirementAdminProgress').hidden=true;
      document.getElementById('requirementStudentBody').innerHTML='<tr><td colspan="5" class="reqEmpty">No required advisee roster has been snapshotted for this event.</td></tr>';
      return;
    }

    const s=req.summary||{};
    document.getElementById('requirementHeading').textContent=reqIsAdmin()?'Required conference progress':'My required advisees';
    document.getElementById('requirementSubhead').textContent=reqIsAdmin()
      ?'Admin view across all participating advisors.'
      :'Your required advisees for this conference. Log each outreach attempt here and book a time when the family is ready.';
    document.getElementById('requirementKpis').innerHTML=[
      ['Required',s.required||0],
      ['Contacted',`${s.contacted||0}${s.required?` (${s.contact_percent||0}%)`:''}`],
      ['Family reached',s.family_reached||0],
      ['Booked',`${s.booked||0}${s.required?` (${s.booking_percent||0}%)`:''}`],
      ['Completed',s.completed||0],
      ['Need booking',s.needs_booking||0]
    ].map(([label,value])=>`<div class="requirementKpi"><span>${reqEsc(label)}</span><strong>${reqEsc(value)}</strong></div>`).join('');
    document.getElementById('requirementSnapshotNote').textContent=`Roster snapshot: ${reqFmtDateTime(req.snapshot_at_iso)} • ${req.full_required_count||s.required||0} students across ${req.full_advisor_count||req.advisor_progress?.length||0} advisors.`;

    renderAdvisorProgress(req);
    populateRequirementFilters(req);
    renderRequirementStudents(req);
  }

  function renderAdvisorProgress(req){
    const wrap=document.getElementById('requirementAdminProgress');
    if(!reqIsAdmin()){wrap.hidden=true;return;}
    wrap.hidden=false;
    const body=document.getElementById('requirementAdvisorBody');
    const rows=Array.isArray(req.advisor_progress)?req.advisor_progress:[];
    body.innerHTML=rows.length?rows.map((row)=>`<tr>
      <td><strong>${reqEsc(row.advisor_name||row.advisor_email)}</strong><div class="muted small">${reqEsc(row.advisor_email||'')}</div></td>
      <td>${Number(row.required||0)}</td>
      <td>${Number(row.contacted||0)} <span class="muted small">(${Number(row.contact_percent||0)}%)</span></td>
      <td>${Number(row.booked||0)}</td>
      <td>${Number(row.completed||0)}</td>
      <td><strong>${Number(row.needs_booking||0)}</strong></td>
    </tr>`).join(''):'<tr><td colspan="6" class="muted">No advisor progress yet.</td></tr>';
  }

  function populateRequirementFilters(req){
    const select=document.getElementById('requirementAdvisorFilter');
    if(!select) return;
    const previous=select.value;
    select.replaceChildren(new Option('All advisors',''));
    for(const row of Array.isArray(req.advisor_progress)?req.advisor_progress:[]){
      select.appendChild(new Option(`${row.advisor_name||row.advisor_email} — ${row.required||0}`,row.advisor_email||''));
    }
    if(previous&&[...select.options].some((o)=>o.value===previous))select.value=previous;
  }

  function requirementFilteredStudents(req){
    let rows=Array.isArray(req?.students)?req.students.slice():[];
    const advisor=reqIsAdmin()?String(document.getElementById('requirementAdvisorFilter')?.value||''):'';
    const status=String(document.getElementById('requirementStatusFilter')?.value||'');
    if(advisor)rows=rows.filter((row)=>row.advisor_email===advisor);
    if(status)rows=rows.filter((row)=>row.status===status);
    return rows;
  }

  function bookingDescription(row){
    if(!row.booking) return row.status==='needs_rescheduling'?'Cancelled — needs a new time':'Not booked';
    if(row.booking.status==='scheduled'){
      const slot=(bundle?.slots||[]).find((s)=>s.slot_id===row.booking.slot_id);
      return slot?`${fmtTime(slot.start_iso)} with ${row.booking.staff_name||staffLabel(row.booking.staff_email)}`:'Scheduled';
    }
    return reqStatusLabel(row.booking.status);
  }

  function renderRequirementStudents(req=bundle?.requirement){
    const body=document.getElementById('requirementStudentBody');
    if(!body)return;
    const rows=requirementFilteredStudents(req);
    document.getElementById('requirementRosterTitle').textContent=reqIsAdmin()?`Required students (${rows.length})`:`My advisees (${rows.length})`;
    if(!rows.length){body.innerHTML='<tr><td colspan="5" class="reqEmpty">No students match this view.</td></tr>';return;}
    body.innerHTML=rows.map((row)=>{
      const comm=row.latest_communication;
      const outreach=comm
        ?`<div class="reqOutreachSummary"><strong>${reqEsc(comm.outcome||'Contact logged')}</strong><span>${reqEsc(comm.method||'')} • ${reqEsc(reqFmtDateTime(comm.contact_at_iso))}</span><span class="muted">by ${reqEsc(comm.actor_email||'staff')}${row.contact_count>1?` • ${row.contact_count} attempts`:''}</span></div>`
        :'<span class="muted">No conference outreach logged</span>';
      return `<tr data-required-student="${reqEsc(row.student_number)}">
        <td><strong>${reqEsc(row.student_name||row.student_number)}</strong><div class="muted small">OSIS ${reqEsc(row.student_number)}${row.grade?` • Grade ${reqEsc(row.grade)}`:''}</div></td>
        <td>${reqEsc(row.advisor_name||row.advisor_email)}<div class="muted small">${reqEsc(row.assoc_section||'')}</div></td>
        <td>${outreach}</td>
        <td><span class="reqStatus ${reqEsc(row.status)}">${reqEsc(reqStatusLabel(row.status))}</span><div class="muted small" style="margin-top:5px">${reqEsc(bookingDescription(row))}</div></td>
        <td><div class="reqRowActions"><button type="button" data-req-action="contact" data-osis="${reqEsc(row.student_number)}">${row.status==='booked'?'Log outreach':'Contact / Book'}</button><button type="button" data-req-action="contacts" data-osis="${reqEsc(row.student_number)}">Student Contacts</button></div></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('[data-req-action="contact"]').forEach((btn)=>btn.addEventListener('click',()=>openRequirementOutreach(btn.dataset.osis)));
    body.querySelectorAll('[data-req-action="contacts"]').forEach((btn)=>btn.addEventListener('click',()=>{
      const u=new URL('./student_contacts.html',location.href);u.searchParams.set('osis',btn.dataset.osis||'');location.href=u.toString();
    }));
  }

  async function snapshotRequirement(){
    if(!bundle?.event||!reqIsAdmin())return;
    const configured=!!bundle?.requirement?.configured;
    const message=configured
      ?'Rebuild the required advisee roster from the current official advisory roster? This is blocked after any conference booking or conference outreach has been logged.'
      :'Build the required advisee roster for every participating advisor in this event?';
    if(!confirm(message))return;
    const buttons=[document.getElementById('requirementRefreshBtn'),document.getElementById('requirementSnapshotBtn')].filter(Boolean);
    buttons.forEach((b)=>b.disabled=true);
    setStatus('Building required advisee roster…');
    try{
      const result=await api('/admin/conferences/requirements/snapshot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:bundle.event.event_id})});
      await loadBundle(bundle.event.event_id);
      setStatus(`Required roster ready: ${result.required_count} advisees across ${result.advisor_count} advisors.`,'good');
    }catch(e){
      setStatus(`Could not build required advisee roster: ${e.message}`,'error');
    }finally{buttons.forEach((b)=>b.disabled=false);}
  }

  async function loadRequirementContacts(row){
    requirementContacts=[];
    const select=document.getElementById('reqContactSelect');
    select.replaceChildren(new Option('No specific contact',''));
    try{
      const data=await api(`/admin/contacts/student?student_number=${encodeURIComponent(row.student_number)}`);
      requirementContacts=Array.isArray(data.contacts)?data.contacts:[];
      requirementContacts.forEach((c,i)=>{
        const name=c.display?.name||c.source?.display_name||c.source?.name||'Unnamed contact';
        const rel=c.display?.relationship||c.source?.relationship||'';
        select.appendChild(new Option(`${name}${rel?` — ${rel}`:''}`,String(i)));
      });
    }catch(e){
      document.getElementById('reqModalStatus').textContent=`Contacts could not be loaded: ${e.message}`;
    }
  }

  function populateRequirementSlots(row){
    const select=document.getElementById('reqSlot');
    select.replaceChildren(new Option('Log communication only — do not book yet',''));
    const own=String(access?.email||'').toLowerCase();
    let slots=(bundle?.slots||[]).filter((slot)=>slot.status==='open');
    if(!reqIsAdmin())slots=slots.filter((slot)=>slot.staff_email===own);
    slots.sort((a,b)=>String(a.start_iso).localeCompare(String(b.start_iso))||String(a.staff_email).localeCompare(String(b.staff_email)));
    for(const slot of slots){
      select.appendChild(new Option(`${fmtTime(slot.start_iso)} – ${fmtTime(slot.end_iso)} • ${staffLabel(slot.staff_email)}${staffLocation(slot.staff_email)?` • ${staffLocation(slot.staff_email)}`:''}`,slot.slot_id));
    }
  }

  async function openRequirementOutreach(osis){
    const row=(bundle?.requirement?.students||[]).find((item)=>item.student_number===String(osis||''));
    if(!row)return;
    requirementStudent=row;
    requirementContacts=[];
    const modal=document.getElementById('conferenceOutreachModal');
    document.getElementById('reqModalStudent').innerHTML=`<strong>${reqEsc(row.student_name||row.student_number)}</strong><div class="muted small">OSIS ${reqEsc(row.student_number)} • Advisor: ${reqEsc(row.advisor_name||row.advisor_email)}</div>`;
    document.getElementById('reqMethod').value='Phone';
    document.getElementById('reqOutcome').value='Spoke/Connected';
    document.getElementById('reqNotes').value='';
    document.getElementById('reqModalStatus').textContent='';
    populateRequirementSlots(row);
    modal.hidden=false;
    await loadRequirementContacts(row);
  }

  function selectedRequirementContact(){
    const idx=Number(document.getElementById('reqContactSelect').value);
    return Number.isInteger(idx)&&idx>=0?requirementContacts[idx]||null:null;
  }

  function makeSubmissionId(){
    try{if(globalThis.crypto?.randomUUID)return `conference:${crypto.randomUUID()}`;}catch{}
    return `conference:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,10)}`;
  }

  async function saveRequirementOutreach(){
    if(!requirementStudent||!bundle?.event)return;
    const btn=document.getElementById('saveConferenceOutreach');
    const status=document.getElementById('reqModalStatus');
    const contact=selectedRequirementContact();
    const display=contact?.display||{};
    const source=contact?.source||{};
    btn.disabled=true;status.textContent='Saving conference communication…';
    try{
      const payload={
        event_id:bundle.event.event_id,
        student_number:requirementStudent.student_number,
        submission_id:makeSubmissionId(),
        method:document.getElementById('reqMethod').value,
        outcome:document.getElementById('reqOutcome').value,
        notes:document.getElementById('reqNotes').value.trim(),
        follow_up_needed:document.getElementById('reqOutcome').value==='Follow-up Needed',
        slot_id:document.getElementById('reqSlot').value,
        contact_assoc_id:contact?.contact_assoc_id||'',
        person_id:contact?.person_id||contact?.source?.person_id||'',
        contact_display_name:display.name||source.display_name||source.name||'',
        contact_relationship:display.relationship||source.relationship||'',
        contact_phone:display.phone||source.phone||'',
        contact_email:display.email||source.email||''
      };
      const result=await api('/admin/conferences/engagement/log',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      document.getElementById('conferenceOutreachModal').hidden=true;
      await loadBundle(bundle.event.event_id);
      if(result.booking_error){
        setStatus(`Communication logged, but the selected conference time could not be booked: ${result.booking_error}. Choose another open time.`,'error');
      }else if(result.booking){
        setStatus(`Communication logged and ${requirementStudent.student_name} was booked successfully. No family message was sent.`,'good');
      }else{
        setStatus(`Conference communication logged for ${requirementStudent.student_name}.`,'good');
      }
    }catch(e){
      status.textContent=`Could not save: ${e.message}`;
    }finally{btn.disabled=false;}
  }

  function bindRequirementUi(){
    document.getElementById('requirementRefreshBtn')?.addEventListener('click',snapshotRequirement);
    document.getElementById('requirementSnapshotBtn')?.addEventListener('click',snapshotRequirement);
    document.getElementById('eventSelectAllAdvisors')?.addEventListener('click',selectAllAdvisors);
    document.getElementById('requirementAdvisorFilter')?.addEventListener('change',()=>renderRequirementStudents());
    document.getElementById('requirementStatusFilter')?.addEventListener('change',()=>renderRequirementStudents());
    document.getElementById('closeConferenceOutreach')?.addEventListener('click',()=>{document.getElementById('conferenceOutreachModal').hidden=true;});
    document.getElementById('conferenceOutreachModal')?.addEventListener('click',(e)=>{if(e.target.id==='conferenceOutreachModal')e.currentTarget.hidden=true;});
    document.getElementById('saveConferenceOutreach')?.addEventListener('click',saveRequirementOutreach);
    document.getElementById('reqOutcome')?.addEventListener('change',syncQuickOutcome);
    document.querySelectorAll('[data-req-outcome]').forEach((btn)=>btn.addEventListener('click',()=>{
      document.getElementById('reqOutcome').value=btn.dataset.reqOutcome||'Other';syncQuickOutcome();
    }));
  }

  function syncQuickOutcome(){
    const value=document.getElementById('reqOutcome')?.value||'';
    document.querySelectorAll('[data-req-outcome]').forEach((btn)=>btn.classList.toggle('active',btn.dataset.reqOutcome===value));
  }

  injectRequirementUi();
  bindRequirementUi();

  const baseRenderBundle=renderBundle;
  renderBundle=function(){
    baseRenderBundle();
    renderRequirement();
  };

  const baseLoadStaffOptions=loadStaffOptions;
  loadStaffOptions=async function(){
    await baseLoadStaffOptions();
    await loadAdvisorOptions();
  };

  const baseOpenNewEvent=openNewEvent;
  openNewEvent=function(){
    baseOpenNewEvent();
    const checkbox=document.getElementById('eventRequireAdvisees');
    if(checkbox)checkbox.checked=true;
  };

  const baseSaveEvent=saveEvent;
  saveEvent=async function(){
    const wasEditing=editingEvent;
    const beforeId=String(bundle?.event?.event_id||'');
    const requireAdvisees=!wasEditing&&document.getElementById('eventRequireAdvisees')?.checked===true;
    await baseSaveEvent();
    const afterId=String(bundle?.event?.event_id||'');
    if(requireAdvisees&&afterId&&afterId!==beforeId){
      try{
        const result=await api('/admin/conferences/requirements/snapshot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:afterId})});
        await loadBundle(afterId);
        setStatus(`Conference created with ${result.required_count} required advisees across ${result.advisor_count} advisors. Generate slots when ready.`,'good');
      }catch(e){
        setStatus(`Conference event was created, but the required advisee roster could not be built: ${e.message}. You can use “Required advisees” to try again.`,'error');
      }
    }
  };

  const timer=setInterval(()=>{
    if(typeof access!=='undefined'&&access){
      clearInterval(timer);
      document.querySelectorAll('.reqAdminOnly').forEach((el)=>el.hidden=!reqIsAdmin());
      if(reqIsAdmin()&&!advisorOptions.length)loadAdvisorOptions().catch(()=>{});
      renderRequirement();
    }
  },150);
  setTimeout(()=>clearInterval(timer),12000);
})();

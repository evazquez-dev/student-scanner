/* EAGLENEST_SOCIAL_WORK_REFERRALS_V1 */
let swReferralRows=[];
let swReferralSummary={};
let swReferralAssignees=[];
let swReferralDetail=null;
let swReferralReady=false;

const SW_STATUS_LABELS={
  new:'New',
  in_review:'In Review',
  assigned:'Assigned',
  student_seen:'Student Seen',
  follow_up:'Follow-up Needed',
  closed:'Closed'
};

function swInjectUi(){
  if($('swReferralSection'))return;

  const dashboardView=$('dashboardView');
  if(dashboardView){
    const section=document.createElement('section');
    section.id='swReferralSection';
    section.className='card';
    section.hidden=true;
    section.innerHTML=`
      <div class="sectionHead">
        <div>
          <h2>Support Requests</h2>
          <div class="muted small">Teacher-submitted Social Work referrals. The existing email alert can continue; this queue tracks ownership and follow-through.</div>
        </div>
        <button id="swReferralRefresh" type="button">Refresh requests</button>
      </div>
      <div id="swReferralKpis" class="swReferralKpis"></div>
      <div class="swReferralFilters">
        <label>Status<select id="swReferralStatusFilter">
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="in_review">In Review</option>
          <option value="assigned">Assigned</option>
          <option value="student_seen">Student Seen</option>
          <option value="follow_up">Follow-up Needed</option>
          <option value="closed">Closed</option>
        </select></label>
        <label>Assignment<select id="swReferralAssignedFilter">
          <option value="">All referrals</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select></label>
        <label>Search<input id="swReferralSearch" type="search" placeholder="Student or referring staff…"></label>
        <button id="swReferralApplyFilters" type="button">Apply</button>
      </div>
      <div id="swReferralList" class="swReferralList"><div class="emptyState">Loading referrals…</div></div>`;
    dashboardView.insertBefore(section,dashboardView.firstChild);
  }

  if(!$('swReferralModal')){
    const modal=document.createElement('div');
    modal.id='swReferralModal';
    modal.className='modalBackdrop';
    modal.hidden=true;
    modal.innerHTML=`
      <section class="modal wideModal card" role="dialog" aria-modal="true">
        <div class="modalHead">
          <div>
            <h2 id="swReferralModalTitle">Social Work Referral</h2>
            <div id="swReferralModalMeta" class="muted small"></div>
          </div>
          <button id="swReferralModalClose" type="button">Close</button>
        </div>
        <div id="swReferralSafetyBox" class="swReferralSafety" hidden></div>
        <div id="swReferralBody"></div>

        <div class="formGrid" style="margin-top:16px">
          <label>Status<select id="swReferralEditStatus">
            <option value="new">New</option>
            <option value="in_review">In Review</option>
            <option value="assigned">Assigned</option>
            <option value="student_seen">Student Seen</option>
            <option value="follow_up">Follow-up Needed</option>
            <option value="closed">Closed</option>
          </select></label>
          <label>Assigned Social Worker<select id="swReferralAssignee"><option value="">Unassigned</option></select></label>
          <label class="wide">Internal triage / coordination note<textarea id="swReferralTriage" rows="4" maxlength="6000" placeholder="Internal Social Work team tracking note…"></textarea></label>
        </div>

        <div id="swReferralLinkedNotes" style="margin-top:16px"></div>
        <div id="swReferralHistory" style="margin-top:16px"></div>
        <div id="swReferralModalStatus" class="status"></div>
        <div class="toolbar end" style="margin-top:12px">
          <button id="swReferralStudentBtn" type="button">Open Student</button>
          <button id="swReferralAddNoteBtn" class="primary" type="button">Student Seen / Add Social Work Note</button>
          <button id="swReferralSaveBtn" type="button">Save referral</button>
        </div>
      </section>`;
    document.body.appendChild(modal);
  }

  const noteModal=$('noteModal');
  if(noteModal&&!$('swReferralNoteContext')){
    const box=document.createElement('div');
    box.id='swReferralNoteContext';
    box.className='swReferralNoteContext';
    box.hidden=true;
    const form=noteModal.querySelector('.formGrid');
    form?.insertAdjacentElement('beforebegin',box);
  }

  $('swReferralRefresh')?.addEventListener('click',loadSocialWorkReferrals);
  $('swReferralApplyFilters')?.addEventListener('click',loadSocialWorkReferrals);
  $('swReferralSearch')?.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();loadSocialWorkReferrals();}});
  $('swReferralModalClose')?.addEventListener('click',closeSocialWorkReferral);
  $('swReferralModal')?.addEventListener('click',(e)=>{if(e.target.id==='swReferralModal')closeSocialWorkReferral();});
  $('swReferralSaveBtn')?.addEventListener('click',saveSocialWorkReferral);
  $('swReferralAddNoteBtn')?.addEventListener('click',()=>startNoteFromSocialWorkReferral(swReferralDetail?.referral));
  $('swReferralStudentBtn')?.addEventListener('click',()=>{
    const r=swReferralDetail?.referral;
    if(r)openStudent({student_number:r.student_number,name:r.student_name});
    closeSocialWorkReferral();
  });
}

function swStatus(status){return SW_STATUS_LABELS[status]||status||'—';}
function swReasons(reasons){return (Array.isArray(reasons)?reasons:[]).map((x)=>`<span class="swReferralReason">${esc(x)}</span>`).join('');}

async function loadSocialWorkAssignees(){
  if(activeTeam!=='social_work')return;
  try{
    const data=await api('/admin/counselor/social_work/assignees');
    swReferralAssignees=Array.isArray(data.rows)?data.rows:[];
  }catch(e){swReferralAssignees=[];}
}

async function loadSocialWorkReferrals(){
  swInjectUi();
  const section=$('swReferralSection');
  if(activeTeam!=='social_work'){
    if(section)section.hidden=true;
    return;
  }
  section.hidden=false;
  const params=new URLSearchParams();
  const status=$('swReferralStatusFilter')?.value||'';
  const assigned=$('swReferralAssignedFilter')?.value||'';
  const search=$('swReferralSearch')?.value.trim()||'';
  if(status)params.set('status',status);
  if(assigned)params.set('assigned',assigned);
  if(search)params.set('search',search);
  params.set('limit','120');
  try{
    const [data]=await Promise.all([
      api(`/admin/counselor/social_work/referrals?${params.toString()}`),
      swReferralAssignees.length?Promise.resolve():loadSocialWorkAssignees()
    ]);
    swReferralRows=Array.isArray(data.rows)?data.rows:[];
    swReferralSummary=data.summary||{};
    renderSocialWorkReferrals();
  }catch(e){
    $('swReferralList').innerHTML=`<div class="emptyState">Could not load support requests: ${esc(e.message)}</div>`;
  }
}

function renderSocialWorkReferrals(){
  const s=swReferralSummary||{};
  $('swReferralKpis').innerHTML=[
    ['New',s.new||0],['In Review',s.in_review||0],['Assigned',s.assigned||0],
    ['Student Seen',s.student_seen||0],['Follow-up',s.follow_up||0],['Closed',s.closed||0]
  ].map(([label,value])=>`<div class="swReferralKpi"><span>${esc(label)}</span><strong>${Number(value||0)}</strong></div>`).join('');

  const list=$('swReferralList');
  if(!swReferralRows.length){
    list.innerHTML='<div class="emptyState">No Social Work referrals match this view.</div>';
    return;
  }

  list.innerHTML=swReferralRows.map((r)=>`<article class="swReferralCard ${r.safety_related?'safety':''}">
    <div class="swReferralHead">
      <div>
        <button type="button" class="linkBtn" data-sw-open="${esc(r.referral_id)}"><strong>${esc(r.student_name||r.student_number)}</strong></button>
        <div class="swReferralMeta">Grade ${esc(r.student_grade||'—')} • OSIS ${esc(r.student_number)} • ${esc(fmtShort(r.submitted_at_iso))}</div>
      </div>
      <span class="swReferralStatus ${esc(r.status)}">${esc(swStatus(r.status))}</span>
    </div>
    <div class="swReferralReasons">${swReasons(r.reasons)}</div>
    ${r.safety_related?'<div class="swReferralSafety">⚠ Safety-related reason selected. Use the school’s existing immediate emergency/reporting procedure; this dashboard is tracking only.</div>':''}
    <div class="swReferralText">${esc(r.referral_details)}</div>
    <div class="swReferralMeta">Submitted by ${esc(r.referrer_name||r.referrer_email)}${r.assigned_to_email?` • Assigned to ${esc(r.assigned_to_name||r.assigned_to_email)}`:' • Unassigned'}</div>
    <div class="toolbar end" style="margin-top:9px">
      ${!r.assigned_to_email&&!isReadOnly()?`<button type="button" data-sw-assign-me="${esc(r.referral_id)}">Assign to me</button>`:''}
      <button type="button" data-sw-open="${esc(r.referral_id)}">Open referral</button>
    </div>
  </article>`).join('');

  list.querySelectorAll('[data-sw-open]').forEach((btn)=>btn.addEventListener('click',()=>openSocialWorkReferral(btn.dataset.swOpen)));
  list.querySelectorAll('[data-sw-assign-me]').forEach((btn)=>btn.addEventListener('click',()=>assignSocialWorkReferralToMe(btn.dataset.swAssignMe)));
}

async function assignSocialWorkReferralToMe(referralId){
  if(isReadOnly())return;
  const row=swReferralRows.find((r)=>r.referral_id===referralId);
  const status=['new','in_review'].includes(row?.status)?'assigned':row?.status||'assigned';
  try{
    await api('/admin/counselor/social_work/referral/update',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({referral_id:referralId,assigned_to_email:access?.email||'',status})
    });
    await loadSocialWorkReferrals();
    setStatus('Referral assigned to you.','good');
  }catch(e){setStatus(`Could not assign referral: ${e.message}`,'error');}
}

async function openSocialWorkReferral(referralId){
  try{
    const data=await api(`/admin/counselor/social_work/referral?referral_id=${encodeURIComponent(referralId)}`);
    swReferralDetail=data;
    const r=data.referral;
    $('swReferralModalTitle').textContent=`${r.student_name||r.student_number} — Social Work Referral`;
    $('swReferralModalMeta').textContent=`Submitted ${fmtDateTime(r.submitted_at_iso)} by ${r.referrer_name||r.referrer_email}`;
    $('swReferralSafetyBox').hidden=!r.safety_related;
    $('swReferralSafetyBox').textContent=r.safety_related?'⚠ This referral includes a safety-related reason. Follow the school’s immediate emergency/reporting procedures; do not rely on dashboard acknowledgement alone.':'';
    $('swReferralBody').innerHTML=`
      <div class="swReferralReasons">${swReasons(r.reasons)}</div>
      <div class="swReferralDetailGrid" style="margin-top:12px">
        <div class="swReferralDetail"><span>Student</span><strong>${esc(r.student_name||r.student_number)}</strong><div class="swReferralMeta">Grade ${esc(r.student_grade||'—')} • OSIS ${esc(r.student_number)}</div></div>
        <div class="swReferralDetail"><span>Referring staff</span><strong>${esc(r.referrer_name||r.referrer_email)}</strong><div class="swReferralMeta">${esc(r.referrer_email)}</div></div>
        <div class="swReferralDetail"><span>Class / period</span><strong>${esc(r.class_period||'Not provided')}</strong></div>
        <div class="swReferralDetail"><span>Staff availability</span><strong>${esc(r.staff_availability||'Not provided')}</strong></div>
      </div>
      <div class="swReferralDetail" style="margin-top:10px"><span>Teacher referral details</span><div class="swReferralText">${esc(r.referral_details)}</div></div>
      ${r.staff_name_mismatch?`<div class="warningBox" style="margin-top:10px">Submitted account maps to <strong>${esc(r.referrer_name)}</strong>, while the Staff Name dropdown contained <strong>${esc(r.selected_staff_name)}</strong>. EagleNEST uses the collected email as the canonical referrer identity.</div>`:''}`;

    $('swReferralEditStatus').value=r.status;
    const assignee=$('swReferralAssignee');
    assignee.replaceChildren(new Option('Unassigned',''));
    for(const person of swReferralAssignees)assignee.appendChild(new Option(person.name||person.email,person.email));
    if(r.assigned_to_email&&[...assignee.options].some((o)=>o.value===r.assigned_to_email))assignee.value=r.assigned_to_email;
    $('swReferralTriage').value=r.triage_note||'';

    const linked=Array.isArray(data.linked_notes)?data.linked_notes:[];
    $('swReferralLinkedNotes').innerHTML=linked.length?`<h3>Linked Social Work Notes</h3><div class="list">${linked.map((n)=>`<div class="listItem"><strong>${esc(n.note_type)}</strong><div class="listMeta">${esc(fmtDateTime(n.meeting_at_iso))} • ${esc(n.counselor_name||n.counselor_email)}</div></div>`).join('')}</div>`:'';

    const events=Array.isArray(data.events)?data.events:[];
    $('swReferralHistory').innerHTML=`<h3>Referral History</h3><div class="swReferralHistory">${events.length?events.map((ev)=>`<div class="swReferralEvent"><strong>${esc(String(ev.action||'').replaceAll('_',' '))}</strong><div class="swReferralMeta">${esc(fmtDateTime(ev.event_at_iso))}${ev.actor_email?` • ${esc(ev.actor_email)}`:''}</div></div>`).join(''):'<div class="muted small">No history yet.</div>'}</div>`;
    $('swReferralModalStatus').textContent='';
    $('swReferralSaveBtn').disabled=isReadOnly();
    $('swReferralAddNoteBtn').disabled=isReadOnly();
    $('swReferralModal').hidden=false;
  }catch(e){setStatus(`Could not open referral: ${e.message}`,'error');}
}

function closeSocialWorkReferral(){
  $('swReferralModal').hidden=true;
  swReferralDetail=null;
}

async function saveSocialWorkReferral(){
  const r=swReferralDetail?.referral;
  if(!r||isReadOnly())return;
  $('swReferralSaveBtn').disabled=true;$('swReferralModalStatus').textContent='Saving referral…';
  try{
    const data=await api('/admin/counselor/social_work/referral/update',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        referral_id:r.referral_id,
        status:$('swReferralEditStatus').value,
        assigned_to_email:$('swReferralAssignee').value,
        triage_note:$('swReferralTriage').value.trim()
      })
    });
    swReferralDetail=data;
    await loadSocialWorkReferrals();
    $('swReferralModal').hidden=true;
    setStatus('Social Work referral updated.','good');
  }catch(e){$('swReferralModalStatus').textContent=`Could not save referral: ${e.message}`;}
  finally{$('swReferralSaveBtn').disabled=false;}
}

function mapReferralTags(r){
  const tags=[];
  for(const reason of Array.isArray(r?.reasons)?r.reasons:[]){
    const s=String(reason).toLowerCase();
    if(/attendance|barrier/.test(s))tags.push('Attendance/Barrier');
    if(/peer|relationship|conflict/.test(s))tags.push('Peer Conflict');
    if(/family/.test(s))tags.push('Family');
    if(/sad|grief|cry|esteem|anx|emotional|social/.test(s))tags.push('Social-Emotional');
    if(/abuse|suicid|self[\s-]*harm|urgent|crisis/.test(s))tags.push('Urgent');
  }
  return [...new Set(tags)];
}

async function startNoteFromSocialWorkReferral(r){
  if(!r||isReadOnly()||activeTeam!=='social_work')return;
  closeSocialWorkReferral();
  await openStudent({student_number:r.student_number,name:r.student_name});
  openNewNote();
  linkedSocialWorkReferral=r;
  $('noteType').value=r.safety_related?'Crisis/Urgent Concern':'Student Check-in';
  setTagChoices(mapReferralTags(r));
  renderTeamDetails({support_focus:r.safety_related?'Crisis / Urgent Concern':'Student Check-in',coordination:`Teacher referral from ${r.referrer_name||r.referrer_email}`,next_action:''});
  const box=$('swReferralNoteContext');
  if(box){
    box.hidden=false;
    box.innerHTML=`<strong>Linked teacher referral</strong><div class="small" style="margin-top:4px">${esc(fmtDateTime(r.submitted_at_iso))} • ${esc(r.referrer_name||r.referrer_email)}</div><div class="swReferralReasons" style="margin-top:7px">${swReasons(r.reasons)}</div>`;
  }
}

function swClearNoteContext(){
  const box=$('swReferralNoteContext');
  if(box){box.hidden=true;box.innerHTML='';}
}

/* Wrap existing Counselor Dashboard behavior without changing non-Social-Work teams. */
swInjectUi();

const swBaseSetActiveTeam=setActiveTeam;
setActiveTeam=function(team,opts={}){
  swBaseSetActiveTeam(team,opts);
  if($('swReferralSection'))$('swReferralSection').hidden=team!=='social_work';
  swClearNoteContext();
  if(team==='social_work')setTimeout(loadSocialWorkReferrals,0);
};

const swBaseLoadDashboard=loadDashboard;
loadDashboard=async function(){
  await swBaseLoadDashboard();
  if(activeTeam==='social_work')await loadSocialWorkReferrals();
  else if($('swReferralSection'))$('swReferralSection').hidden=true;
};

const swBaseOpenNewNote=openNewNote;
openNewNote=function(){
  swBaseOpenNewNote();
  linkedSocialWorkReferral=null;
  swClearNoteContext();
};

const swBaseOpenEditNote=openEditNote;
openEditNote=function(noteId){
  swBaseOpenEditNote(noteId);
  linkedSocialWorkReferral=null;
  swClearNoteContext();
};

const swBaseSaveNote=saveNote;
saveNote=async function(){
  const linked=linkedSocialWorkReferral?.referral_id||'';
  await swBaseSaveNote();
  if(linked&&$('noteModal')?.hidden){
    linkedSocialWorkReferral=null;
    swClearNoteContext();
    await loadSocialWorkReferrals();
  }
};

const swInit=setInterval(()=>{
  if(typeof access!=='undefined'&&access&&typeof activeTeam!=='undefined'&&activeTeam){
    clearInterval(swInit);
    if(activeTeam==='social_work'){
      loadSocialWorkAssignees().then(loadSocialWorkReferrals).catch(()=>{});
    }
  }
},150);
setTimeout(()=>clearInterval(swInit),12000);

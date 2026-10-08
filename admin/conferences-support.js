/* EAGLENEST_FASC_SUPPORT_DESK_V3 — operational Student Support queue for FaSC.
 * No private counseling notes in the shared queue. Authorization is decided by
 * the Worker, not by display roles, HTML flags, or client-created student groups.
 */
(()=>{
  'use strict';
  const POLL=30000;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ownEmail=()=>String(access?.email||'').toLowerCase();
  const eventId=()=>String(bundle?.event?.event_id||'');
  let state={open:false,allowed:false,manageable:false,adminSummary:false,rows:[],selectedId:'',selectedStudent:null,studentSeq:0,refreshing:false,checking:false,started:false,dirty:false,prevEvent:'',uiChanged:false,lastUpdate:null};
  const categories={attendance:'Attendance',academics:'Academics',behavior:'Behavior / dean',family:'Family support',student_support:'Student student_support',general:'General / other'};
  const statuses={waiting:'Waiting',in_progress:'In meeting',completed:'Completed',no_show:'No show'};
  const priorities={routine:'Routine',today:'Priority today'};
  const links=osis=>({lookup:`./student_view.html?osis=${encodeURIComponent(osis)}`,contacts:`./student_contacts.html?osis=${encodeURIComponent(osis)}`});
  function announce(message,level=''){const el=$('fascSupportStatus');if(el){el.textContent=message;el.dataset.level=level;}}
  function note(message,level=''){const el=$('fascSupportCaseStatus');if(el){el.textContent=message;el.dataset.level=level;}}
  function byId(){return state.rows.find(x=>x.intake_id===state.selectedId)||null;}
  function guardDraft(){return !state.dirty||confirm('Discard unsaved operational follow-up details?');}
  function switchToSupport(){
    if(!state.allowed)return;
    window.EagleNESTFaSCLiveHub?.showLive?.();
    document.body.dataset.fascLiveMode='support';
    state.open=true;state.uiChanged=true;
    $('fascTabLive')?.setAttribute('aria-pressed','false');$('fascTabManage')?.setAttribute('aria-pressed','false');
    const btn=$('fascTabSupport');if(btn)btn.setAttribute('aria-pressed','true');
    announce('Student Support desk is ready. Only authorized staff can act on cases.');
    draw();refresh().catch(e=>announce(e.message,'error'));
  }
  function leaveSupport(){if(!state.open)return;state.open=false;$('fascTabSupport')?.setAttribute('aria-pressed','false');}
  function inject(){
    if($('fascSupportRoot')||!$('fascLiveTabs'))return;
    const tab=document.createElement('button');tab.type='button';tab.id='fascTabSupport';tab.hidden=true;tab.textContent='Student Support desk';tab.setAttribute('aria-pressed','false');
    $('fascLiveTabs').querySelector('.fascLiveTabButtons')?.appendChild(tab);
    tab.addEventListener('click',switchToSupport);
    $('fascTabLive')?.addEventListener('click',leaveSupport);
    $('fascTabManage')?.addEventListener('click',leaveSupport);
    const root=document.createElement('section');root.className='fascSupportRoot';root.id='fascSupportRoot';
    root.innerHTML=`
    <div class="card fascSupportHero">
      <div class="fascSupportHead"><div><h2>Student Support • Conference Desk</h2><p class="muted small" id="fascSupportEvent">Support staff check-ins, family requests, handoffs and next steps</p></div>
        <button id="fascSupportRefresh" type="button">↻ Refresh queue</button></div>
      <div class="fascSupportMetrics" id="fascSupportMetrics"></div><div id="fascSupportStatus" role="status" class="fascLiveStatus"></div>
      <p class="fascSupportPrivacy">Shared queue stores operational details only. Do not enter counseling, social-work, medical, diagnostic, or other highly confidential notes here; use your school's approved confidential record system.</p>
    </div>
    <div class="fascSupportColumns">
      <section class="card"><div class="fascSupportHead"><div><h2>Family requests</h2><p class="muted small">Unclaimed check-ins, assigned visits, and completed meetings</p></div>
        <label class="fascSupportFilter">View<select id="fascSupportFilter"><option value="waiting">Waiting / in progress</option><option value="mine">Assigned to me</option><option value="followup">My case follow-up flags</option><option value="all">All requests</option><option value="no_show">No-shows / late arrivals</option></select></label></div>
        <div id="fascSupportQueue" class="fascSupportQueue"></div></section>
      <section class="card"><h2>Support conversation</h2><div id="fascSupportCase"><p class="muted">Choose a family request or check in a student.</p></div></section>
    </div>
    <section class="card" id="fascSupportCheckin"><div class="fascSupportHead"><div><h2>Check in a family / student</h2><p class="muted small">Use verified student lookup to create a new support visit</p></div></div>
       <div class="fascSupportFormGrid"><label>Find student<input id="fascSupportSearch" type="search" autocomplete="off" placeholder="Search name or OSIS…"></label>
        <label>Support area<select id="fascSupportCategory">${Object.entries(categories).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label>Timing<select id="fascSupportPriority"><option value="routine">Routine</option><option value="today">Priority today</option></select></label>
        <label>Person accompanying student (optional)<input id="fascSupportFamily" maxlength="160" placeholder="Family contact name"></label></div>
       <div id="fascSupportSearchResults" class="fascSupportSearchResults"></div>
       <div class="fascSupportFooter"><span id="fascSupportSelected" class="muted small">No student selected</span><button type="button" class="primary" id="fascSupportCreate" disabled>Check in family</button></div>
    </section>`;
    $('fascLiveRoot').insertAdjacentElement('afterend',root);
    $('fascSupportRefresh').addEventListener('click',()=>refresh(true));
    $('fascSupportFilter').addEventListener('change',drawQueue);
    $('fascSupportQueue').addEventListener('click',e=>{const b=e.target.closest('button[data-intake]');if(b)selectIntake(b.dataset.intake);});
    $('fascSupportCase').addEventListener('click',onCaseAction);
    $('fascSupportCase').addEventListener('input',e=>{if(e.target.matches('textarea,input[type=checkbox],input[type=date]'))state.dirty=true;});
    let debounce;
    $('fascSupportSearch').addEventListener('input',()=>{clearTimeout(debounce);state.selectedStudent=null;$('fascSupportCreate').disabled=true;$('fascSupportSelected').textContent='No student selected';debounce=setTimeout(search,250);});
    $('fascSupportSearchResults').addEventListener('click',e=>{const b=e.target.closest('button[data-osis]');if(!b)return;state.selectedStudent={osis:b.dataset.osis,name:b.dataset.name};$('fascSupportSearchResults').replaceChildren();$('fascSupportSelected').textContent=`Selected: ${state.selectedStudent.name} (${state.selectedStudent.osis})`;$('fascSupportCreate').disabled=!state.manageable;});
    $('fascSupportCreate').addEventListener('click',create);
    document.querySelectorAll('#fascTabManage,#fascTabLive').forEach(b=>b.addEventListener('click',()=>state.uiChanged=true));
  }
  async function refresh(force=false){
    if(!eventId()||state.refreshing)return;
    const requested=eventId();state.refreshing=true;
    try{
      const r=await api(`/admin/conferences/support/desk?event_id=${encodeURIComponent(requested)}`);
      if(eventId()!==requested)return;
      state.allowed=r.can_use===true;state.manageable=r.can_manage===true;state.adminSummary=r.admin_summary===true;
      state.rows=Array.isArray(r.intakes)?r.intakes:[];state.lastUpdate=new Date();
      $('fascTabSupport').hidden=!state.allowed;
      $('fascSupportEvent').textContent=`${bundle?.event?.title||'Conference'} • ${bundle?.event?.event_date||''} • ${state.lastUpdate.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;
      $('fascSupportCheckin').hidden=!state.manageable;
      if(state.allowed&&!state.uiChanged&&!state.started&&state.manageable){state.started=true;switchToSupport();}
      if(state.open){if(!state.allowed){leaveSupport();window.EagleNESTFaSCLiveHub?.showLive?.();return;}draw();}
      if(force)announce('Queue refreshed.','ok');
    }catch(e){
      if(e.status===404||e.status===405){$('fascTabSupport').hidden=true;announce('Support Desk Worker routes are not deployed yet. Keep using the teacher Live Hub.','error');}
      else announce(`Support queue unavailable: ${e.message}`,'error');
    }finally{state.refreshing=false;}
  }
  function renderMetrics(){const rows=state.rows,counts=[['Waiting',rows.filter(x=>x.status==='waiting').length],['Meeting',rows.filter(x=>x.status==='in_progress').length],['Finished',rows.filter(x=>x.status==='completed').length],['Priority today',rows.filter(x=>x.priority==='today'&&!['completed','no_show'].includes(x.status)).length]];
    $('fascSupportMetrics').innerHTML=counts.map(([label,value])=>`<div class="fascSupportMetric"><strong>${value}</strong><span>${esc(label)}</span></div>`).join('');}
  function drawQueue(){const root=$('fascSupportQueue');if(!root)return;const f=$('fascSupportFilter').value;
    const rows=state.rows.filter(r=>f==='all'||f==='mine'&&r.assigned_email===ownEmail()||f==='followup'&&r.assigned_email===ownEmail()&&r.follow_up_needed||f==='waiting'&&['waiting','in_progress'].includes(r.status)||f==='no_show'&&r.status==='no_show'); // EAGLENEST_FASC_REOPEN_NO_SHOW_V7
    rows.sort((a,b)=>Number(b.priority==='today')-Number(a.priority==='today')||Number(a.status==='in_progress')-Number(b.status==='in_progress')||String(a.created_at_iso).localeCompare(String(b.created_at_iso)));
    if(!rows.length){root.innerHTML='<p class="muted">No requests match this filter.</p>';return;}
    root.innerHTML=rows.map(r=>`<button type="button" data-intake="${esc(r.intake_id)}" class="fascSupportItem ${state.selectedId===r.intake_id?'selected':''}">
       <span><strong>${esc(r.student_name||r.student_number)}</strong><small>${esc(categories[r.category]||'Support')} • ${esc(r.family_contact_name||'Family / student')}</small></span>
       <span class="fascSupportItemEnd"><span class="fascSupportStatusTag">${esc(statuses[r.status]||r.status)}</span>${r.priority==='today'?'<small class="fascSupportPriority">Priority today</small>':''}<small>${esc(r.assigned_email?r.assigned_email===ownEmail()?'Assigned to me':r.assigned_email:'Unclaimed')}</small></span>
       </button>`).join('');}
  function selectIntake(id){if(!guardDraft())return;state.selectedId=id;state.dirty=false;drawQueue();drawCase();}
  function drawCase(){const host=$('fascSupportCase');if(!host)return;const r=byId();if(!r){host.innerHTML='<p class="muted">Select a family request to manage the conversation.</p>';return;}
    const isOwner=state.manageable&&r.assigned_email===ownEmail();const canClaim=state.manageable&&r.status==='waiting'&&!r.assigned_email;
    const ongoing=['waiting','in_progress'].includes(r.status),l=links(r.student_number);
    host.innerHTML=`<div class="fascSupportCaseHead"><h3>${esc(r.student_name)}</h3><span class="fascSupportStatusTag">${esc(statuses[r.status]||r.status)}</span></div>
      <p class="muted small">OSIS ${esc(r.student_number)} • ${esc(categories[r.category]||'Support')} • ${esc(priorities[r.priority]||'')}</p>
      <p>${esc(r.family_contact_name||'Family member not specified')} • ${esc(r.assigned_email||'Not yet assigned')}</p>
      <div class="fascSupportLinks"><a href="${esc(l.lookup)}" target="_blank" rel="noopener">Student Lookup ↗</a><a href="${esc(l.contacts)}" target="_blank" rel="noopener">Student Contacts ↗</a></div>
      ${!state.manageable?'<p class="muted small">Administrative overview only. Support case content is private to its assigned support staff member.</p>':''}
      ${canClaim?'<div class="fascSupportActions"><button data-action="claim" class="primary">Claim this family</button></div>':''}
      ${isOwner?`<div class="fascSupportDetail"><label>Operational next step (no counseling/clinical notes)<textarea id="fascSupportNextStep" maxlength="500" rows="3" ${ongoing?'':'disabled'} placeholder="e.g. Call guardian tomorrow; connect family with attendance team">${esc(r.next_step||'')}</textarea></label>
       <label class="fascSupportCheckbox"><input id="fascSupportFollowup" type="checkbox" ${r.follow_up_needed?'checked':''} ${ongoing?'':'disabled'}> Personal case follow-up flag (assign a team below)</label>
       <label>Target follow-up date<input id="fascSupportDue" type="date" value="${esc(r.follow_up_on||'')}" ${ongoing?'':'disabled'}></label></div>
       ${isOwner&&r.status==='no_show'?'<div class="fascSupportActions"><button data-action="reopen" class="primary" type="button">Reopen — family arrived late</button></div>':''}${ongoing?`<div class="fascSupportActions"><button data-action="save">Save next step</button>${r.status==='waiting'?'<button data-action="start" class="primary">Start meeting</button>':''}<button data-action="complete" class="primary">Finish conversation</button><button data-action="no_show">No show</button>${r.status==='waiting'&&!r.next_step&&!r.follow_up_needed?'<button data-action="release">Return to shared queue</button>':''}</div>`:'<p class="muted small">This request is closed. Next steps are preserved for the assigned staff member.</p>'}`:''}
      ${state.manageable&&!isOwner&&!canClaim?'<p class="muted small">This case is assigned to another staff member. Private follow-up details are not shared here.</p>':''}
      <div id="fascSupportCaseStatus" role="status" class="fascLiveStatus"></div>`;
  }
  function draw(){if(!state.allowed)return;renderMetrics();drawQueue();if(!state.dirty)drawCase();}
  async function onCaseAction(e){const btn=e.target.closest('button[data-action]');if(!btn)return;const r=byId();if(!r)return;const action=btn.dataset.action;
    if(action==='release'&&!confirm('Return this untouched request to the shared queue?'))return;
    if(['complete','no_show'].includes(action)&&!confirm(`Mark ${r.student_name} ${action==='complete'?'completed':'no-show'}?`))return;
    if(action==='reopen'&&!confirm(`Reopen ${r.student_name}'s no-show because the family arrived late? The case returns to the waiting queue.`))return;
    btn.disabled=true;note('Saving…');
    const body={event_id:eventId(),intake_id:r.intake_id,action};
    if(!['claim','release'].includes(action)){
      body.next_step=$('fascSupportNextStep')?.value||'';
      body.follow_up_needed=$('fascSupportFollowup')?.checked===true;
      body.follow_up_on=body.follow_up_needed?$('fascSupportDue')?.value||'':'';
    }
    try{await api('/admin/conferences/support/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});state.dirty=false;if(action==='reopen')$('fascSupportFilter').value='waiting';await refresh(true);if(action==='reopen')announce('No-show reopened. The family is back in the waiting queue.','ok');}
    catch(error){note(`Not saved: ${error.message}`,'error');btn.disabled=false;}
  }
  async function search(){const q=$('fascSupportSearch')?.value.trim()||'',seq=++state.studentSeq,out=$('fascSupportSearchResults');
    if(q.length<2){out.replaceChildren();return;}out.textContent='Searching…';
    try{const r=await api(`/admin/roster/search?q=${encodeURIComponent(q)}`);if(seq!==state.studentSeq)return;const items=(r.results||[]).filter(x=>/^\d{5,20}$/.test(String(x.osis||''))).slice(0,30);
      out.innerHTML=items.map(x=>`<button type="button" data-osis="${esc(x.osis)}" data-name="${esc(x.name||x.osis)}">${esc(x.name||x.osis)} • ${esc(x.osis)}</button>`).join('')||'<span class="muted">No results in your directory scope.</span>';
    }catch(error){if(seq===state.studentSeq)out.textContent=`Student search unavailable: ${error.message}`;}
  }
  async function create(){const student=state.selectedStudent;if(!student||!state.manageable||!eventId())return;const btn=$('fascSupportCreate');btn.disabled=true;announce('Checking in family…');
    try{
      const result=await api('/admin/conferences/support/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        event_id:eventId(),action:'check_in',student_number:student.osis,student_name:student.name,
        category:$('fascSupportCategory').value,priority:$('fascSupportPriority').value,
        family_contact_name:$('fascSupportFamily').value.trim()})});
      state.selectedId=result.intake_id||'';state.dirty=false;state.selectedStudent=null;$('fascSupportSearch').value='';$('fascSupportFamily').value='';$('fascSupportSelected').textContent='No student selected';$('fascSupportSearchResults').replaceChildren();
      await refresh(true);announce('Family checked in. A support staff member can now claim the request.','ok');
    }catch(error){announce(`Check-in not saved: ${error.message}`,'error');btn.disabled=false;}
  }
  function onBundle(){if(!state.open||!eventId())return;if(state.prevEvent!==eventId()){
      state.prevEvent=eventId();state.selectedId='';state.rows=[];state.dirty=false;
    }refresh().catch(error=>announce(error.message,'error'));}
  function init(){if(state.checking||!$('fascLiveTabs'))return;state.checking=true;inject();
    const original=renderBundle;renderBundle=function(){original();onBundle();};
    // A support-role user can lack a teaching lane; the Worker lists active
    // conferences for authorized support staff without granting booking rights.
    let tries=0;const boot=setInterval(()=>{tries++;if(access&&eventId()){clearInterval(boot);state.prevEvent=eventId();refresh().catch(()=>{});}else if(tries>150)clearInterval(boot);},100);
    setInterval(()=>{if(!document.hidden&&state.open&&!state.dirty){refresh().catch(error=>announce(error.message,'error'));}},POLL);
  }
  // EAGLENEST_FASC_FOLLOWUPS_V4: owner-verified operational case reference only.
  window.EagleNESTFaSCSupportDesk=Object.freeze({
    getFollowupContext:()=>{const r=byId();return r?{
      event_id:eventId(),source_kind:'support',source_id:r.intake_id,
      student_number:r.student_number,student_name:r.student_name,
      can_assign:state.manageable&&r.assigned_email===ownEmail()
    }:null;}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

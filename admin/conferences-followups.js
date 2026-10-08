/* EAGLENEST_FASC_FOLLOWUPS_V4
 * Multi-person operational follow-ups in BOTH FaSC Live and Student Support Desk.
 * Uses source-verified Worker endpoints; follow-ups are not sensitive case notes.
 */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const POLL=30000;
  const state={event:'',items:[],staff:[],available:false,busy:false,loadingStaff:false,lastError:'',drafts:new Map(),seq:0};
  const eventId=()=>String(bundle?.event?.event_id||'');
  const me=()=>String(access?.email||'').toLowerCase();
  const liveCtx=()=>window.EagleNESTFaSCLiveHub?.getFollowupContext?.()||null;
  const supportCtx=()=>window.EagleNESTFaSCSupportDesk?.getFollowupContext?.()||null;
  const draftKey=ctx=>ctx?`${ctx.event_id}:${ctx.source_kind}:${ctx.source_id}`:'';
  const createId=()=>globalThis.crypto?.randomUUID?.()||`fasc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function announce(host,message,bad=false){const o=host?.querySelector('[data-followup-message]');if(o){o.textContent=message||'';o.classList.toggle('bad',bad);}}
  function draft(ctx){const k=draftKey(ctx);if(!state.drafts.has(k))state.drafts.set(k,{summary:'',due:'',query:'',assignees:new Set(),submission_id:createId()});return state.drafts.get(k);}
  function context(kind){return kind==='support'?supportCtx():liveCtx();}
  function initView(){
    for(const [kind,rootId,title] of [['live','fascLiveRoot','My FaSC follow-ups'],['support','fascSupportRoot','My Student Support follow-ups']]){
      const root=$(rootId);if(!root||root.querySelector(`[data-followup-inbox="${kind}"]`))continue;
      const card=document.createElement('section');card.className='card fascFollowupInbox';card.dataset.followupInbox=kind;
      card.innerHTML=`<div class="fascFollowupHead"><div><h2>${title}</h2><p class="muted small">Assigned to you, or delegated by you. Completion is tracked for each person separately.</p></div><div class="fascFollowupActions"><label>Show<select data-followup-filter><option value="pending">My pending</option><option value="all">All mine / created</option><option value="created">Delegated by me</option><option value="done">My completed</option></select></label><button type="button" data-followup-refresh>↻ Refresh</button></div></div><div data-followup-items class="fascFollowupItems"></div><p data-followup-message role="status" class="fascFollowupMessage"></p>`;
      root.appendChild(card);
      card.addEventListener('change',e=>{if(e.target.matches('[data-followup-filter]'))renderInbox();});
      card.addEventListener('click',async e=>{
        if(e.target.closest('[data-followup-refresh]')){await refresh(true);return;}
        const btn=e.target.closest('[data-followup-action]');if(!btn)return;
        const item=state.items.find(x=>x.followup_id===btn.dataset.followupId);if(!item)return;
        const action=btn.dataset.followupAction;
        if(action==='cancel'&&!confirm('Cancel this entire follow-up for all assignees?'))return;
        btn.disabled=true;
        try{
          await api('/admin/conferences/followups/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:eventId(),followup_id:item.followup_id,action})});
          await refresh(true);
        }catch(error){announce(card,`Unable to update assignment: ${error.message}`,true);btn.disabled=false;}
      });
    }
  }
  function renderInbox(){
    for(const card of document.querySelectorAll('[data-followup-inbox]')){
      const host=card.querySelector('[data-followup-items]'),filter=card.querySelector('[data-followup-filter]')?.value||'pending';
      if(!state.available){host.innerHTML=`<p class="muted small">${state.lastError?esc(state.lastError):'Follow-up assignments will appear when the Worker is available.'}</p>`;continue;}
      let rows=state.items.filter(x=>x.state!=='cancelled');
      rows=rows.filter(x=>filter==='created'?x.is_creator:filter==='done'?x.is_assignee&&x.assigned_state==='done':filter==='pending'?x.is_assignee&&x.assigned_state==='open':x.is_creator||x.is_assignee);
      if(!rows.length){host.innerHTML='<p class="muted">No follow-ups in this view.</p>';continue;}
      host.innerHTML=rows.map(x=>{
        const completed=x.assignees.filter(a=>a.state==='done').length,total=x.assignees.length;
        const mine=x.is_assignee&&x.assigned_state==='open';const done=x.is_assignee&&x.assigned_state==='done';
        return `<article class="fascFollowupItem"><div class="fascFollowupHead"><div><strong>${esc(x.student_name||x.student_number)}</strong><div class="muted small">${esc(x.source_kind==='support'?'Support Desk':x.source_kind==='live'?'Live meeting':'Booked conference')} • ${esc(x.due_on?`Due ${x.due_on}`:'No due date')}</div></div><span class="fascFollowupCount">${completed}/${total} finished</span></div><p>${esc(x.action_summary)}</p><div class="fascFollowupStaff">${x.assignees.map(a=>`<span class="fascFollowupPill ${a.state==='done'?'done':''}">${esc(staffName(a.email))} ${a.state==='done'?'✓':''}</span>`).join('')}</div><div class="fascFollowupButtons">${mine?`<button type="button" class="primary" data-followup-action="done" data-followup-id="${esc(x.followup_id)}">Mark my part done</button>`:''}${done?`<button type="button" data-followup-action="reopen" data-followup-id="${esc(x.followup_id)}">Reopen my part</button>`:''}${x.is_creator?`<button type="button" data-followup-action="cancel" data-followup-id="${esc(x.followup_id)}">Cancel follow-up</button>`:''}</div></article>`;
      }).join('');
    }
  }
  function staffName(emailAddress){return state.staff.find(s=>s.email===emailAddress)?.name||emailAddress;}
  async function refresh(force=false){
    const id=eventId();if(!id||state.busy)return;
    state.busy=true;const seq=++state.seq;
    if(state.event!==id){state.event=id;state.items=[];state.staff=[];state.available=false;state.lastError='';}
    try{
      const result=await api(`/admin/conferences/followups/list?event_id=${encodeURIComponent(id)}`);
      if(seq!==state.seq||id!==eventId())return;
      state.items=Array.isArray(result.followups)?result.followups:[];state.available=true;state.lastError='';
      if(!state.staff.length)await loadStaff(id);
      renderInbox();renderComposers();
      if(force)for(const card of document.querySelectorAll('[data-followup-inbox]'))announce(card,'Follow-ups updated.');
    }catch(error){
      if(id!==eventId())return;
      state.available=false;state.lastError=[404,405].includes(error.status)?'Follow-up Worker not deployed yet.':'Could not load follow-ups: '+error.message;
      renderInbox();renderComposers();
    }finally{state.busy=false;if(id!==eventId()&&eventId())queueMicrotask(()=>refresh().catch(()=>{}));}
  }
  async function loadStaff(id){
    if(state.loadingStaff)return;state.loadingStaff=true;
    try{const result=await api(`/admin/conferences/followups/staff?event_id=${encodeURIComponent(id)}`);if(id===eventId()){state.staff=Array.isArray(result.staff)?result.staff:[];renderComposers();}}
    catch(error){state.lastError=`Staff picker unavailable: ${error.message}`;}
    finally{state.loadingStaff=false;}
  }
  function renderComposers(){
    for(const [kind,rootId] of [['live','fascLiveMeeting'],['support','fascSupportCase']]){
      const root=$(rootId);if(!root)continue;
      const ctx=context(kind),existing=root.querySelector('[data-followup-composer]');
      if(!ctx?.can_assign||!ctx?.source_id||ctx.event_id!==eventId()||!state.available){if(existing)existing.remove();continue;}
      const key=draftKey(ctx);
      if(existing?.dataset.followupComposer===key)continue;
      if(existing)existing.remove();
      const d=draft(ctx),el=document.createElement('section');el.className='fascFollowupComposer';el.dataset.followupComposer=key;
      el.innerHTML=`<div class="fascFollowupHead"><div><h3>Assign FaSC follow-up</h3><p class="muted small">Share a short operational task with one or several staff members. Do not include confidential counseling or social-work notes.</p></div></div><label>Next action for the team<textarea data-fup-summary rows="2" maxlength="500" placeholder="E.g. Check family transportation arrangements by Friday">${esc(d.summary)}</textarea></label><div class="fascFollowupFormRow"><label>Target date (optional)<input data-fup-due type="date" value="${esc(d.due)}"></label><label>Find staff members<input data-fup-query type="search" autocomplete="off" placeholder="Search name, department or email…" value="${esc(d.query)}"></label></div><div data-fup-people class="fascFollowupPeople"></div><div data-fup-selected class="fascFollowupSelected"></div><div class="fascFollowupButtons"><button data-fup-save type="button" class="primary">Assign to selected staff</button></div><div class="fascFollowupMessage" data-fup-notice role="status"></div>`;
      root.appendChild(el);
      el.addEventListener('input',e=>{
        const t=e.target;if(t.matches('[data-fup-summary]'))d.summary=t.value;
        if(t.matches('[data-fup-due]'))d.due=t.value;
        if(t.matches('[data-fup-query]')){d.query=t.value;renderPeople(el,d);}
      });
      el.addEventListener('click',async e=>{
        const choice=e.target.closest('[data-fup-choice]');
        if(choice){const emailAddress=choice.dataset.fupChoice;if(d.assignees.has(emailAddress))d.assignees.delete(emailAddress);else if(d.assignees.size<20)d.assignees.add(emailAddress);renderPeople(el,d);return;}
        if(e.target.closest('[data-fup-save]'))await submit(el,ctx,d);
      });
      renderPeople(el,d);
    }
  }
  function renderPeople(root,d){
    const q=d.query.trim().toLowerCase(),people=root.querySelector('[data-fup-people]'),chosen=root.querySelector('[data-fup-selected]');
    const found=state.staff.filter(s=>!q||`${s.name||''} ${s.email||''} ${s.department||''}`.toLowerCase().includes(q)).slice(0,40);
    people.innerHTML=found.length?found.map(s=>`<button type="button" data-fup-choice="${esc(s.email)}" class="fascFollowupPerson ${d.assignees.has(s.email)?'active':''}" aria-pressed="${d.assignees.has(s.email)}">${d.assignees.has(s.email)?'✓ ':''}${esc(s.name||s.email)}<small>${esc(s.email)}${s.department?' • '+esc(s.department):''}</small></button>`).join(''):'<span class="muted small">No matching staff members in the current directory.</span>';
    chosen.innerHTML=d.assignees.size?`<span class="muted small">Assigned (${d.assignees.size}): </span>${[...d.assignees].map(e=>`<span class="fascFollowupPill">${esc(staffName(e))}</span>`).join('')}`:'<span class="muted small">Choose at least one staff member (up to 20).</span>';
  }
  async function submit(root,ctx,d){
    const notice=root.querySelector('[data-fup-notice]'),btn=root.querySelector('[data-fup-save]');
    if(d.summary.trim().length<4||!d.assignees.size){notice.textContent='Enter a short task and choose at least one recipient.';return;}
    btn.disabled=true;notice.textContent='Assigning follow-up…';
    try{
      const result=await api('/admin/conferences/followups/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:ctx.event_id,source_kind:ctx.source_kind,source_id:ctx.source_id,action:'create',action_summary:d.summary.trim(),due_on:d.due,assignees:[...d.assignees],submission_id:d.submission_id})});
      if(!result.ok)throw new Error(result.error||'Not saved');
      state.drafts.delete(draftKey(ctx));
      notice.textContent='Assigned successfully. Each recipient can now see and complete their follow-up independently.';
      root.querySelector('[data-fup-summary]').value='';root.querySelector('[data-fup-query]').value='';root.querySelector('[data-fup-due]').value='';
      d.summary='';d.due='';d.query='';d.assignees.clear();d.submission_id=createId();renderPeople(root,d);
      await refresh();
    }catch(error){notice.textContent='Follow-up not saved: '+error.message;}
    finally{btn.disabled=false;}
  }
  function init(){
    if(!$('fascLiveRoot'))return;
    initView();
    // The V2/V3 meeting panels re-render independently; reconnect composer only after
    // changes, while maintaining the draft in memory for that source.
    for(const id of ['fascLiveMeeting','fascSupportCase']){
      const host=$(id);if(host)new MutationObserver(()=>renderComposers()).observe(host,{childList:true});
    }
    const previous=renderBundle;
    renderBundle=function(){previous();if(state.event!==eventId()){state.available=false;state.items=[];state.staff=[];}refresh().catch(()=>{});};
    refresh().catch(()=>{});
    setInterval(()=>{if(!document.hidden&&eventId())refresh().catch(()=>{});},POLL);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

/* EAGLENEST_DEAN_INCIDENT_FOLLOWUPS_V1 — one canonical incident, two surfaces. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const base=()=>document.querySelector('meta[name="api-base"]')?.content||location.origin;
  const isOpen=x=>!['resolved','closed','complete','completed','closed - submitted in error'].includes(String(x.status||'').toLowerCase());
  let active=null,busy=false;
  async function api(path,init={}){
    const headers=new Headers(init.headers||{}),sid=window.EAGLENEST_AUTH?.getSid?.()||'';
    if(sid)headers.set('x-admin-session',sid);
    const r=await fetch(new URL(path,base()),{...init,headers,credentials:'include',cache:'no-store'});
    const token=r.headers.get('x-admin-session');if(token)window.EAGLENEST_AUTH?.setSid?.(token);
    const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.message||j.error||`HTTP ${r.status}`);return j;
  }
  function ensureModal(){
    if($('deanIncidentModal'))return;
    const el=document.createElement('div');el.id='deanIncidentModal';el.className='modalBackdrop';el.hidden=true;
    el.innerHTML=`<section class="modal card" role="dialog" aria-modal="true" aria-labelledby="diHeading" style="max-height:90vh;overflow:auto">
      <div class="sectionHead"><div><h2 id="diHeading">Incident follow-up</h2><p id="diSummary" class="muted small"></p></div><button type="button" id="diClose">Close</button></div>
      <div class="detailRow" id="diDescription" style="white-space:pre-wrap;overflow-wrap:anywhere"></div>
      <div class="formGrid"><label>Status<select id="diStatus"><option>New</option><option>In Progress</option><option>Pending Follow-Up</option><option>Resolved</option><option>Closed</option></select></label>
      <label class="wide">Add a Dean note<textarea id="diNote" rows="4" maxlength="8000" placeholder="Investigation, contact with student/family, action taken, or resolution…"></textarea></label></div>
      <p class="muted small">A note is required when closing or resolving an open incident. Dean notes are saved in the incident audit. Corrections to teacher reports appear in the permanent edit history.</p>
      <h3>Dean notes and status history</h3><div class="toolbar"><button type="button" id="diFullHistory">View complete edit log</button></div><div id="diHistory" class="stack"></div><div id="diError" class="status" role="alert"></div>
      <div class="toolbar end"><button type="button" id="diSave" class="primary">Save incident update</button></div>
    </section>`;
    document.body.appendChild(el);
    $('diClose').addEventListener('click',close);
    $('diSave').addEventListener('click',save);
    $('diFullHistory').addEventListener('click',()=>{if(active?.incident_id){const id=active.incident_id;close();window.EAGLENEST_INCIDENT_REPORT_EDITOR?.open(id)}});
    el.addEventListener('click',e=>{if(e.target===el)close()});
  }
  function close(){if(busy)return;$('deanIncidentModal').hidden=true;active=null;}
  async function edit(id){
    ensureModal();$('diError').textContent='Loading incident…';$('deanIncidentModal').hidden=false;
    try{
      const j=await api(`/admin/incident/detail?incident_id=${encodeURIComponent(id)}`);
      if(!j.can_update)throw new Error('Your Dean assignment does not permit updating this incident.');
      active=j.incident;$('diHeading').textContent=`Incident ${active.incident_id}`;
      $('diSummary').textContent=`${active.incident_date} · ${active.reporter_email} · ${active.location_category} · ${active.location_detail}`;
      $('diDescription').textContent=active.description||'No description';
      if(!['New','In Progress','Pending Follow-Up','Resolved','Closed'].includes(active.status)){$('diStatus').add(new Option(active.status,active.status));}
      $('diStatus').value=active.status;
      $('diNote').value='';
      $('diHistory').innerHTML=(j.audit||[]).length?(j.audit||[]).map(a=>`<div class="detailRow"><strong>${esc(a.actor_email)}</strong><div class="meta">${esc(a.changed_at_iso)} · ${esc(a.action||'Update')}${a.from_status!==a.to_status?` · ${esc(a.from_status)} → ${esc(a.to_status)}`:''}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(a.note_text||a.reason||'')}</div></div>`).join(''):'<div class="empty">No history yet.</div>';
      $('diError').textContent='';$('diNote').focus();
    }catch(e){active=null;$('diError').textContent=e.message||String(e);}
  }
  async function save(){
    if(!active||busy)return;
    const status=$('diStatus').value,note=$('diNote').value.trim();
    if(!note&&status===active.status){$('diError').textContent='Add a note or change the status.';return;}
    if(isOpen(active)&&!isOpen({status})&&!note){$('diError').textContent='Please write a resolution note before closing.';return;}
    busy=true;$('diSave').disabled=true;$('diError').textContent='Saving…';
    try{
      const submittedStatus=['New','In Progress','Pending Follow-Up','Resolved','Closed'].includes(status)?status:'';
      await api('/admin/incident/update',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({incident_id:active.incident_id,expected_updated_at_iso:active.updated_at_iso,status:submittedStatus,note_text:note})});
      $('diError').textContent='Saved.';active=null;$('deanIncidentModal').hidden=true;
      // Refresh using the existing Dean Dashboard's loader, not a second copy of its state.
      $('refreshBtn')?.click();
    }catch(e){$('diError').textContent=`Could not save incident: ${e.message||e}`;}finally{busy=false;$('diSave').disabled=false;}
  }
  function render(data){
    const parent=$('followups');if(!parent)return;
    // Main Dean renderer owns #followups. It calls us immediately after its refresh.
    parent.querySelector('#deanIncidentFollowupList')?.remove();
    const box=document.createElement('div');box.id='deanIncidentFollowupList';
    const list=(data?.incidents||[]).filter(x=>isOpen(x));
    if(data?.practice){
      box.innerHTML='<div class="listItem"><div class="meta">Incident updates are disabled while Practice Mode is active.</div></div>';
    }else{
      box.innerHTML=`<h3 style="font-size:.95rem;margin:.3rem 0 .5rem">Incident reports · ${list.length} open</h3>`+
        (list.length?list.map(x=>{
          const names=(x.participants||[]).filter(p=>p.involvement_type==='involved').map(p=>p.student_name||p.student_number).join(', ')||x.primary_student_name||'Unlinked incident';
          return `<div class="listItem"><button class="linkBtn" type="button" data-incident-edit="${esc(x.incident_id)}"><strong>${esc(x.incident_id)}</strong> · ${esc(names)}</button><div class="meta">${esc(x.incident_date)} · ${esc(x.status||'New')} · ${esc(x.reporter_email)}</div><div class="meta" style="overflow-wrap:anywhere">${esc(String(x.description||'').slice(0,200))}</div><span class="pill warn">Open</span></div>`;
        }).join(''):'<div class="empty">No open incident reports in your Dean assignment.</div>');
    }
    if(list.length)parent.querySelectorAll(':scope > .empty').forEach(el=>{if(el.textContent.includes('No open Dean follow-ups'))el.remove()});
    parent.prepend(box);
    box.querySelectorAll('[data-incident-edit]').forEach(b=>b.addEventListener('click',()=>edit(b.dataset.incidentEdit)));
    // Detailed teacher correction history is visible through the shared incident editor.
    document.dispatchEvent(new CustomEvent('eaglenest:dean-incidents-rendered'));
  }
  document.addEventListener('eaglenest:incident:changed',()=>$('refreshBtn')?.click());
  window.EAGLENEST_INCIDENT_FOLLOWUPS={render};
})();

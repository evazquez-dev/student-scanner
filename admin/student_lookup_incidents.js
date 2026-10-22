/* EAGLENEST_STUDENT_LOOKUP_INCIDENTS_V2 — canonical D1 incident history, student scoped. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const base=()=>document.querySelector('meta[name="api-base"]')?.content||location.origin;
  const open=i=>!['resolved','closed','complete','completed'].includes(String(i.status||'').trim().toLowerCase());
  const session=()=>window.EAGLENEST_AUTH?.getSid?.()||sessionStorage.getItem('ss_admin_session_sid_v1')||localStorage.getItem('ss_admin_session_sid_v1')||'';
  let currentOsis='',records=[],nextOffset=null,total=0,loading=false,requestSerial=0;

  async function api(path){
    const headers=new Headers(),sid=session();
    if(sid)headers.set('x-admin-session',sid);
    const res=await fetch(new URL(path,base()),{method:'GET',headers,credentials:'include',cache:'no-store'});
    const updatedSid=res.headers.get('x-admin-session')||res.headers.get('X-Admin-Session');
    if(updatedSid)window.EAGLENEST_AUTH?.setSid?.(updatedSid);
    const body=await res.json().catch(()=>({}));
    if(!res.ok||body?.ok!==true)throw new Error(body?.error||`HTTP ${res.status}`);
    return body;
  }
  function updateCount(){
    const el=$('incidentsCount');if(el)el.textContent=records.length?String(total||records.length):'';
  }
  function reset(osis=''){
    requestSerial++;currentOsis=String(osis||'').trim();records=[];total=0;nextOffset=null;loading=false;
    updateCount();
    if($('incidentsMeta'))$('incidentsMeta').textContent='Incident reports accessible to your account. Older and closed reports remain in the history.';
    if($('incidentsList'))$('incidentsList').innerHTML='<div class="loadingState">Open this tab to load incident reports.</div>';
    if($('incidentsLoadMore'))$('incidentsLoadMore').hidden=true;
  }
  function render(){
    const host=$('incidentsList');if(!host)return;
    const state=$('incidentsStatus')?.value||'all';
    const filtered=records; // Server applies status filter before LIMIT/OFFSET.
    if($('incidentsMeta'))$('incidentsMeta').textContent=`${total} ${state==='all'?'total':state} incident report${total===1?'':'s'} accessible for this student${nextOffset!==null?' · more pages available':''}.`;
    host.innerHTML=filtered.length?filtered.map(r=>{
      const involvement=(r.participants||[]).filter(p=>String(p.student_number||'')===currentOsis).map(p=>p.involvement_type).join(', ');
      const people=(r.participants||[]).filter(p=>p.involvement_type==='involved').map(p=>p.student_name||p.student_number).join(', ');
      const related=people?`Involved: ${people}`:(r.primary_student_name?`Involved: ${r.primary_student_name}`:'');
      const when=[r.incident_date,r.incident_time].filter(Boolean).join(' · ');
      const location=[r.location_category,r.location_detail].filter(Boolean).join(' · ');
      return `<article class="listItem">
        <div class="listTop"><div><div class="listTitle">Incident ${escape(r.incident_id)}</div>
          <div class="listMeta">${escape(when)} · Reported by ${escape(r.reporter_email||'—')}</div></div>
          <span class="pill ${open(r)?'warn':'good'}">${escape(r.status||'New')}</span></div>
        <div class="listMeta">${escape(location||'Location not recorded')}${involvement?` · Student role: ${escape(involvement)}`:''}</div>
        ${related?`<div class="listMeta">${escape(related)}</div>`:''}
        <div class="listBody" style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(r.description||'No description provided.')}</div>
        ${r.resolved_at_iso?`<div class="listMeta">Resolved ${escape(new Date(r.resolved_at_iso).toLocaleString())}</div>`:''}
        ${r.can_update?`<div class="inlineActions" style="margin-top:.6rem"><a class="btn secondary small" href="./dean_dashboard.html?osis=${encodeURIComponent(currentOsis)}">Manage in Dean Dashboard</a></div>`:''}
      </article>`;
    }).join(''):'<div class="emptyState">'+(records.length?'No incidents match this status filter.':'No incident reports are available for this student under your account permissions.')+'</div>';
    if($('incidentsLoadMore'))$('incidentsLoadMore').hidden=nextOffset===null;
  }
  async function load(more=false){
    if(!currentOsis||loading)return;
    const osis=currentOsis,seq=++requestSerial;
    if(!more){records=[];nextOffset=null;total=0;updateCount();}
    const offset=more?(nextOffset??0):0;
    loading=true;
    const host=$('incidentsList');if(host&&!more)host.innerHTML='<div class="loadingState">Loading incident reports…</div>';
    if($('incidentsLoadMore'))$('incidentsLoadMore').disabled=true;
    try{
      const state=$('incidentsStatus')?.value||'all';
      const body=await api(`/admin/incident/student?student_number=${encodeURIComponent(osis)}&limit=50&offset=${offset}&state=${encodeURIComponent(state)}`);
      if(seq!==requestSerial||currentOsis!==osis)return;
      if(body.practice){if(host)host.innerHTML='<div class="emptyState">Practice incidents are separate from the live incident history.</div>';return;}
      total=Number(body.total||0);
      if(more)records.push(...(body.incidents||[]));else records=Array.isArray(body.incidents)?body.incidents:[];
      nextOffset=body.next_offset===null||body.next_offset===undefined?null:Number(body.next_offset);
      updateCount();render();
    }catch(e){if(seq!==requestSerial||currentOsis!==osis)return;
      if(host)host.innerHTML=`<div class="errorState">Could not load incidents: ${escape(e?.message||e)}</div>`;
    }finally{if(seq===requestSerial){loading=false;if($('incidentsLoadMore'))$('incidentsLoadMore').disabled=false;}}
  }
  document.addEventListener('eaglenest:student-lookup-selected',e=>reset(e.detail?.osis));
  document.addEventListener('eaglenest:student-lookup-tab-changed',e=>{
    if(e.detail?.tab==='incidents'){
      if(String(e.detail?.osis||'')!==currentOsis)reset(e.detail?.osis);
      load();
    }
  });
  document.addEventListener('eaglenest:student-lookup-refreshed',()=>{
    if(!$('panelIncidents')?.hidden)load();
  });
  window.addEventListener('DOMContentLoaded',()=>{
    $('refreshIncidentsBtn')?.addEventListener('click',()=>load());
    $('incidentsStatus')?.addEventListener('change',()=>{requestSerial++;loading=false;load(false)});
    $('incidentsLoadMore')?.addEventListener('click',()=>{if(nextOffset!==null)load(true)});
  });
})();

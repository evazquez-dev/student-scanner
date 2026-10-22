/* EAGLENEST_BEHAVIOR_INCIDENTS_V3 — incident list + transparent edit/history access. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const base=()=>document.querySelector('meta[name="api-base"]')?.content||location.origin;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let incidents=[];
  const open=x=>!['resolved','closed','complete','completed','closed - submitted in error'].includes(String(x.status||'').toLowerCase());
  async function load(){
    const out=$('incidentResults'),count=$('incidentCount');if(!out)return;
    out.innerHTML='<div class="emptyState">Loading incident reports…</div>';
    try{
      const headers=new Headers();
      const sid=window.EAGLENEST_AUTH?.getSid?.()||sessionStorage.getItem('behavior_history_admin_session_v1')||localStorage.getItem('behavior_history_admin_session_v1')||'';
      if(sid)headers.set('x-admin-session',sid);
      const r=await fetch(new URL('/admin/incident/list?state=all&limit=500',base()),{headers,credentials:'include',cache:'no-store'});
      const token=r.headers.get('x-admin-session');if(token)window.EAGLENEST_AUTH?.setSid?.(token);
      const j=await r.json().catch(()=>({}));
      if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`);
      incidents=j.incidents||[];
      if(j.practice){out.innerHTML='<div class="emptyState">Practice incident submissions are isolated; this page does not mix them with live incident records.</div>';if(count)count.textContent='Practice mode';return;}
      render(j.truncated===true);
    }catch(e){out.innerHTML=`<div class="emptyState">Could not load incidents: ${esc(e.message||e)}</div>`;if(count)count.textContent='Unavailable';}
  }
  function render(truncated=false){
    const out=$('incidentResults');if(!out)return;
    const choice=$('incidentStateFilter')?.value||'open',q=String($('incidentQuery')?.value||'').trim().toLowerCase();
    const list=incidents.filter(x=>(choice==='all'||(open(x)===(choice==='open')))&&(!q||[x.incident_id,x.description,x.reporter_email,x.location_detail,x.primary_student_name,...(x.participants||[]).map(p=>p.student_name)].join(' ').toLowerCase().includes(q)));
    $('incidentCount').textContent=`${list.length} report${list.length===1?'':'s'}${truncated?' (first 500 shown)':''}`;
    out.innerHTML=list.length?list.map(x=>{
      const students=(x.participants||[]).filter(p=>p.involvement_type==='involved').map(p=>p.student_name||p.student_number).join(', ')||x.primary_student_name||'Other people involved';
      const student=x.primary_student_number||(x.participants||[]).find(p=>p.involvement_type==='involved')?.student_number||'';
      const link=x.can_update?`<a class="btn btn--primary" href="./dean_dashboard.html${student?'?osis='+encodeURIComponent(student):''}">Dean Dashboard</a>`:'';
      return `<article class="behaviorCard"><div class="behaviorTop"><div><div class="behaviorTitle">Incident ${esc(x.incident_id)}</div><div class="behaviorSub">${esc(students)}</div></div><div class="behaviorBadges"><span class="pill ${open(x)?'pill--deleted':'pill--active'}">${esc(x.status||'New')}</span><span class="pill">${esc(x.incident_date)}</span></div></div><div class="metaRow"><div><strong>Reported by:</strong> ${esc(x.reporter_email)}</div><div><strong>Location:</strong> ${esc(x.location_category)}${x.location_detail?' · '+esc(x.location_detail):''}</div></div><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(x.description)}</p><div class="cardActions"><button class="btn" type="button" data-report-history="${esc(x.incident_id)}">${x.can_edit_report?'View history / edit my report':'View edit history'}</button>${link}</div></article>`;
    }).join(''):'<div class="emptyState">No incident reports match these filters.</div>';
    out.querySelectorAll('[data-report-history]').forEach(b=>b.addEventListener('click',()=>window.EAGLENEST_INCIDENT_REPORT_EDITOR?.open(b.dataset.reportHistory)));
  }
  document.addEventListener('eaglenest:behavior:loaded',()=>load());
  document.addEventListener('eaglenest:incident:changed',()=>load());
  window.addEventListener('DOMContentLoaded',()=>{
    $('incidentStateFilter')?.addEventListener('change',()=>render());
    $('incidentQuery')?.addEventListener('input',()=>render());
    $('incidentRefresh')?.addEventListener('click',load);
  });
  window.EAGLENEST_BEHAVIOR_INCIDENTS={reload:load};
})();

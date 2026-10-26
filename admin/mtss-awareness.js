/* EAGLENEST_MTSS_RECOMMENDATIONS_V1: scoped pending recommendations and Tier 1 activity. */
(() => {
  'use strict';
  const panel=document.getElementById('mtssAwarenessPanel');
  if(!panel)return;
  const $=id=>document.getElementById(id);
  const audience=panel.dataset.audience || 'mtss';
  const apiBase=(document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/,'')+'/';
  const sessionKeys=['ss_admin_session_sid_v1','teacher_att_admin_session_v1','mtss_admin_session_v1','admin_session_v1','admin_session_sid'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const name=v=>String(v||'').replaceAll('_',' ');
  const href=(osis)=>`./mtss.html?osis=${encodeURIComponent(osis)}`;
  let seq=0,initialized=false;
  function session(){try{for(const k of sessionKeys){const v=sessionStorage.getItem(k)||localStorage.getItem(k);if(v)return v;}}catch{}return '';}
  async function call(path,body){
    const headers={};const sid=session();if(sid)headers['x-admin-session']=sid;
    if(body!==undefined)headers['content-type']='application/json';
    const response=await fetch(new URL(path,apiBase),{method:body===undefined?'GET':'POST',headers,
      credentials:'include',cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json().catch(()=>({}));
    const newSid=response.headers.get('x-admin-session');
    if(newSid){try{sessionStorage.setItem('ss_admin_session_sid_v1',newSid);}catch{}}
    if(!response.ok||!data.ok)throw new Error(data.detail||data.error||`HTTP ${response.status}`);
    return data;
  }
  function makeSection(title,subtitle,rows,kind,canReview){
    const heading=`<div class="mtssAwareHead"><h3>${esc(title)}</h3><span class="mtssAwareCount">${rows.length}</span></div><p class="mtssAwareSub">${esc(subtitle)}</p>`;
    if(!rows.length)return `<section class="mtssAwareColumn">${heading}<div class="mtssAwareEmpty">Nothing to show yet.</div></section>`;
    const cards=rows.map(r=>{
      const student=`<a href="${href(r.student_number)}">${esc(r.student_name || r.student_number)}</a><span class="mtssAwareMeta"> · Grade ${esc(r.grade||'—')} · OSIS ${esc(r.student_number)}</span>`;
      if(kind==='rec'){
        const action = r.recommendation_type==='deescalation' ? `De-escalation suggested → Tier ${r.requested_tier}` : r.recommendation_type==='escalation' ? `Escalation requested → Tier ${r.requested_tier}`:`Tier ${r.requested_tier} intervention suggested`;
        const review=canReview?`<div class="mtssAwareReview" data-review-id="${esc(r.recommendation_id)}"><textarea class="mtssAwareNote" rows="2" placeholder="Decision note (required to decline)"></textarea><div class="mtssAwareActions"><button type="button" data-decision="accepted">Accept suggestion</button><button type="button" data-decision="declined">Decline</button></div><div class="mtssAwareDecisionStatus" role="status"></div></div>`:'';
        return `<article class="mtssAwareRow">${student}<strong>${esc(action)}</strong>${r.intervention_name_snapshot?`<div>${esc(r.intervention_name_snapshot)}</div>`:''}<div class="mtssAwareDetail">${esc(r.reason)}</div><div class="mtssAwareMeta">Submitted by ${esc(r.submitted_by_email)} · ${esc(new Date(r.submitted_at_iso).toLocaleDateString())}</div>${review}</article>`;
      }
      if(kind==='decision'){
        const action=r.recommendation_type==='deescalation'?'De-escalation to Tier '+r.requested_tier:r.recommendation_type==='escalation'?'Escalation':'Tier '+r.requested_tier+' intervention';
        return `<article class="mtssAwareRow">${student}<strong>${esc(action)} — ${esc(name(r.status))}</strong><div class="mtssAwareDetail">${esc(r.intervention_name_snapshot||r.reason)}</div>${r.decision_note?`<div class="mtssAwareDetail">Decision: ${esc(r.decision_note)}</div>`:''}<div class="mtssAwareMeta">Reviewed by ${esc(r.decided_by_email)} · ${esc(new Date(r.decided_at_iso).toLocaleDateString())}</div></article>`;
      }
      return `<article class="mtssAwareRow">${student}<strong>Tier 1 · ${esc(name(r.domain))}: ${esc(r.intervention_name)}</strong><div class="mtssAwareDetail">${esc(r.outcome)}${r.notes?' · '+esc(r.notes):''}</div><div class="mtssAwareMeta">${esc(r.occurred_on)} · Logged by ${esc(r.actor_email)}</div></article>`;
    }).join('');
    return `<section class="mtssAwareColumn">${heading}<div class="mtssAwareItems">${cards}</div></section>`;
  }
  async function load(){
    const app=$('app');if(!app || app.hidden)return;
    const current=++seq;
    panel.hidden=false;
    const body=$('mtssAwarenessContent');if(!body)return;
    body.textContent='Loading MTSS recommendations and Tier 1 activity…';
    try{
      const data=await call(`/admin/mtss/awareness?audience=${encodeURIComponent(audience)}`);
      if(current!==seq)return;
      body.innerHTML=makeSection('Recommendations awaiting review',
        data.permissions.can_review?'Accept or decline teacher recommendations. Decisions do not change student tiers.':'Recommendations for students in your scope.',
        data.pending_suggestions || [],'rec',data.permissions.can_review)+
        makeSection('Recent Tier 1 interventions',
          'Universal supports documented by staff working with these students.',data.tier1_activity||[],'activity',false)+
        makeSection('Recent decisions',
          'Reviewed recommendations and the recorded outcome. Staff see decisions on their own requests.',
          data.recent_decisions||[],'decision',false);
      const label=$('mtssAwarenessScope');if(label)label.textContent=data.permissions.student_scoped?'Student-scoped feed':'Authorized dashboard feed';
    }catch(error){
      if(current===seq){body.textContent='MTSS awareness unavailable: '+error.message;}
    }
  }
  panel.addEventListener('click',async event=>{
    const button=event.target.closest('[data-decision]');if(!button)return;
    const wrapper=button.closest('[data-review-id]');if(!wrapper)return;
    const decision=button.dataset.decision, note=wrapper.querySelector('.mtssAwareNote').value.trim();
    if(decision==='declined'&&note.length<3){wrapper.querySelector('.mtssAwareDecisionStatus').textContent='Add a reason for declining.';return;}
    wrapper.querySelectorAll('button').forEach(x=>x.disabled=true);
    try{
      await call('/admin/mtss/suggestion/review',{recommendation_id:wrapper.dataset.reviewId,decision,note,audience});
      await load();
    }catch(error){wrapper.querySelector('.mtssAwareDecisionStatus').textContent=error.message;wrapper.querySelectorAll('button').forEach(x=>x.disabled=false);}
  });
  function boot(){
    if(initialized)return;initialized=true;
    const app=$('app');if(!app)return;
    if(!app.hidden)void load();
    new MutationObserver(()=>{if(!app.hidden)void load();}).observe(app,{attributes:true,attributeFilter:['hidden']});
    document.addEventListener('eaglenest:mtss:dashboard-loaded',()=>void load());
    document.addEventListener('eaglenest:mtss:recommendation-submitted',()=>void load());
    for(const id of ['refreshBtn','btnRefresh'])$(id)?.addEventListener('click',()=>setTimeout(load,200));
    $('mtssAwarenessRefresh')?.addEventListener('click',()=>void load());
    // Keep the feed reasonably fresh while the user is looking at the dashboard.
    setInterval(()=>{if(!document.hidden&&!app.hidden)void load();},300000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

/* EAGLENEST_MTSS_STUDENT_SUPPORT_SCOPE_V1_APPLIED */

/* EagleNEST MTSS Case Management */
(() => {
  'use strict';

  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content || '';
  const API_BASE = (meta('api-base') || '').replace(/\/*$/, '') + '/';
  const GOOGLE_CLIENT_ID = meta('google-client-id') || '';
  const SESSION_HEADER = 'x-admin-session';
  const SESSION_KEYS = ['ss_admin_session_sid_v1','teacher_att_admin_session_v1','mtss_admin_session_v1','admin_session_v1','admin_session_sid'];
  const $ = (id) => document.getElementById(id);
  const state = { access:null, dashboard:null, currentCase:null, catalog:null, rules:[], seq:0, filterTimer:null };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct = (v) => Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(1)}%` : '—';
  const fmtDate = (v) => {
    const s = String(v || '').trim();
    if (!s) return '—';
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : s;
  };
  const fmtTime = (v) => {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : fmtDate(v);
  };
  const titleCase = (v) => String(v || '').replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
  const domainLabel = (v) => v === 'academic' ? 'Academic' : v === 'behavior' ? 'Behavior / SEL' : 'Attendance';

  function getSid(){
    try{ for (const k of SESSION_KEYS){ const v=String(sessionStorage.getItem(k)||localStorage.getItem(k)||'').trim(); if(v)return v; } }catch{}
    return '';
  }
  function setSid(sid){
    const v=String(sid||'').trim(); if(!v)return;
    try{ for(const k of SESSION_KEYS){ sessionStorage.setItem(k,v); localStorage.setItem(k,v); } }catch{}
  }
  function stash(resp){
    const sid=String(resp?.headers?.get(SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim(); if(sid)setSid(sid);
  }
  async function api(path, init={}){
    const headers=new Headers(init.headers||{}); const sid=getSid(); if(sid)headers.set(SESSION_HEADER,sid);
    const resp=await fetch(new URL(path,API_BASE),{...init,headers,credentials:'include',cache:'no-store'}); stash(resp);
    const data=await resp.json().catch(()=>null);
    if(!resp.ok||!data?.ok){ const e=new Error(data?.detail||data?.error||`HTTP ${resp.status}`); e.status=resp.status; e.data=data; throw e; }
    return data;
  }

  function isReadOnly(){ return state.access?.view_as?.active===true || state.access?.view_as?.read_only===true; }
  function canManageAll(){ return state.dashboard?.permissions?.manage_all===true; }
  function canEditRules(){ return state.dashboard?.permissions?.edit_rules===true; }

  async function access(){
    try{ state.access=await api('/admin/access'); return state.access; }catch{return null;}
  }

  async function googleReady(timeout=8000){
    const start=Date.now(); while(!window.google?.accounts?.id){ if(Date.now()-start>timeout)throw new Error('Google sign-in failed to load.'); await new Promise(r=>setTimeout(r,50)); }
  }
  async function loginCredential(credential){
    const resp=await fetch(new URL('/admin/session/login_google',API_BASE),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},credentials:'include',body:new URLSearchParams({id_token:credential}).toString()});
    stash(resp); const data=await resp.json().catch(()=>null); if(data?.sid)setSid(String(data.sid)); if(!resp.ok||!data?.ok)throw new Error(data?.error||`HTTP ${resp.status}`); return data;
  }
  async function showLogin(){
    $('loginCard').hidden=false; $('app').hidden=true; $('loginOut').textContent='Sign in to continue.';
    try{
      await googleReady();
      google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:async(r)=>{
        try{ $('loginOut').textContent='Signing in…'; await loginCredential(r.credential); await boot(); }
        catch(e){ $('loginOut').textContent=`Sign-in failed: ${e.message}`; }
      }});
      google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large',text:'signin_with'});
    }catch(e){ $('loginOut').textContent=e.message; }
  }

  function filters(){
    return {
      q:$('filterQ').value.trim(), domain:$('filterDomain').value, tier:$('filterTier').value,
      status:$('filterStatus').value, grade:$('filterGrade').value, include_closed:$('filterClosed').checked?'1':''
    };
  }
  function dashboardUrl(){
    const url=new URL('/admin/mtss/dashboard',API_BASE); const f=filters();
    for(const [k,v] of Object.entries(f)) if(v)url.searchParams.set(k,v);
    return url.toString();
  }

  function renderSummary(data){
    const s=data?.summary||{};
    for(const [prefix,domain] of [['att','attendance'],['aca','academic'],['beh','behavior']]){
      const d=s[domain]||{}; $(`${prefix}T1`).textContent=d.tier1??0; $(`${prefix}T2`).textContent=d.tier2??0; $(`${prefix}T3`).textContent=d.tier3??0;
    }
    $('statEnrolled').textContent=data?.enrolled??'—'; $('statDue').textContent=data?.due_reviews??0; $('statRecommend').textContent=data?.review_recommendations??0;
    $('statScope').textContent=data?.viewer_scope==='all'?'Schoolwide':'Assigned';
    const assigned=data?.viewer_scope!=='all'; $('scopeBanner').hidden=!assigned;
    if(assigned)$('scopeBanner').textContent='You are viewing MTSS cases assigned to you or your advisor team. Schoolwide case management is limited to authorized support/operations staff.';
    $('btnNewCase').hidden=!data?.permissions?.manage_all||isReadOnly();
    $('attendanceTools').hidden=!data?.permissions?.manage_all;
    $('rulesCard').hidden=!data?.permissions?.manage_all;
    if(!$('attendanceTools').hidden){
      const src=data?.attendance_source||{};
      const last=src?.last_sync?.synced_at_iso?fmtTime(src.last_sync.synced_at_iso):'not synced yet';
      const range=src.first_date&&src.last_date?`${fmtDate(src.first_date)}–${fmtDate(src.last_date)}`:'no official days yet';
      $('automationStatus').textContent=`Official PowerSchool days: ${Number(src.captured_days||0)} · ${range} · last sync ${last}`;
    }
  }

  function caseSignal(c){
    if(c.recommendation==='consider_tier_2')return '<span class="recommend">Consider Tier 2</span>';
    if(c.recommendation==='consider_close')return '<span class="recommend">Consider step-down / close</span>';
    if(c.trigger_rule_id)return esc(c.trigger_rule_id.replace(/^attendance_/,'').replace(/_/g,' '));
    return c.opened_source==='manual'?'Manual case':'—';
  }
  function renderCases(data){
    const rows=Array.isArray(data?.cases)?data.cases:[]; $('caseCount').textContent=`${rows.length} case${rows.length===1?'':'s'}`;
    $('casesBody').innerHTML=rows.length?rows.map(c=>`<tr data-case-id="${esc(c.case_id)}">
      <td><strong>${esc(c.student_name_snapshot||c.student_number)}</strong><div class="small muted">OSIS ${esc(c.student_number)} · Grade ${esc(c.grade_snapshot||'—')}</div></td>
      <td>${esc(domainLabel(c.domain))}</td><td><span class="pill t${Number(c.tier)}">Tier ${Number(c.tier)}</span></td>
      <td><span class="pill ${c.status==='improving'?'good':c.status==='escalated'?'warn':'info'}">${esc(titleCase(c.status))}</span></td>
      <td>${esc(c.owner_email||'Unassigned')}</td><td>${esc(fmtDate(c.next_review_date))}${c.next_review_date&&c.next_review_date<=new Date().toISOString().slice(0,10)?'<div class="small recommend">Due</div>':''}</td>
      <td class="signal">${caseSignal(c)}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">No cases match these filters.</td></tr>';
    $('caseStatus').textContent=`${data?.school_year_code||''} · Updated ${new Date(data.generated_at_iso||Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
  }

  async function loadDashboard(){
    const seq=++state.seq; $('caseStatus').textContent='Loading cases…';
    try{ const data=await api(dashboardUrl()); if(seq!==state.seq)return; state.dashboard=data; renderSummary(data); renderCases(data); if(! $('rulesCard').hidden)await loadRules(); }
    catch(e){ if(seq!==state.seq)return; $('caseStatus').textContent=`Could not load MTSS: ${e.message}`; }
  }

  function scheduleDashboard(){ clearTimeout(state.filterTimer); state.filterTimer=setTimeout(loadDashboard,220); }

  async function loadRules(){
    try{ const data=await api('/admin/mtss/rules?domain=attendance'); state.rules=data.rules||[]; renderRules(); }
    catch(e){ $('rulesStatus').textContent=`Rules unavailable: ${e.message}`; }
  }
  function renderRules(){
    $('rulesBody').innerHTML=state.rules.map(r=>{
      const isRate=String(r.signal_key).includes('rate'); const threshold=isRate?(Number(r.threshold)*100):Number(r.threshold);
      return `<tr data-rule-id="${esc(r.rule_id)}"><td><input class="ruleEnabled" type="checkbox" ${r.enabled?'checked':''} ${canEditRules()&&!isReadOnly()?'':'disabled'}></td>
        <td><strong>${esc(r.name)}</strong><div class="small muted">${esc(r.description||'')}</div></td><td>Tier ${r.tier}</td><td>${esc(r.signal_key)}${r.window_days?`<div class="small muted">last ${r.window_days} finalized days</div>`:''}</td>
        <td><input class="${isRate?'rulePct':'ruleInput'} ruleThreshold" type="number" step="${isRate?'0.1':'1'}" min="0" value="${esc(threshold)}" ${canEditRules()&&!isReadOnly()?'':'disabled'}>${isRate?' %':''}</td>
        <td><input class="ruleInput ruleMinDays" type="number" min="0" value="${r.min_captured_days}" ${canEditRules()&&!isReadOnly()?'':'disabled'}></td>
        <td><input class="ruleInput ruleWindow" type="number" min="0" value="${r.window_days}" ${canEditRules()&&!isReadOnly()?'':'disabled'}></td>
        <td><span class="small">Open ${r.auto_open?'✓':'—'} · Escalate ${r.auto_escalate?'✓':'—'}</span></td>
        <td>${canEditRules()&&!isReadOnly()?'<button class="btn saveRule" type="button">Save</button>':''}</td></tr>`;
    }).join('');
  }
  async function saveRule(row){
    const id=row.dataset.ruleId; const r=state.rules.find(x=>x.rule_id===id); if(!r)return;
    const raw=Number(row.querySelector('.ruleThreshold').value); const threshold=String(r.signal_key).includes('rate')?raw/100:raw;
    const body={rule_id:id,enabled:row.querySelector('.ruleEnabled').checked,threshold,min_captured_days:Number(row.querySelector('.ruleMinDays').value||0),window_days:Number(row.querySelector('.ruleWindow').value||0)};
    try{ $('rulesStatus').textContent=`Saving ${r.name}…`; await api('/admin/mtss/rules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); $('rulesStatus').textContent='Rule saved.'; await loadRules(); }
    catch(e){ $('rulesStatus').textContent=`Save failed: ${e.message}`; }
  }

  function openNewCase(){
    const q=new URL(location.href).searchParams.get('osis')||''; $('newOsis').value=/^\d+$/.test(q)?q:''; $('newReason').value=''; $('newReviewDate').value=''; $('newCaseStatus').textContent=''; $('newCaseBackdrop').hidden=false;
  }
  async function createCase(){
    const body={osis:$('newOsis').value.trim(),domain:$('newDomain').value,tier:Number($('newTier').value),reason:$('newReason').value.trim(),next_review_date:$('newReviewDate').value};
    try{ $('newCaseStatus').textContent='Opening case…'; const r=await api('/admin/mtss/case',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); $('newCaseBackdrop').hidden=true; await loadDashboard(); if(r.case?.case_id)await openCase(r.case.case_id); }
    catch(e){ $('newCaseStatus').textContent=`Could not open case: ${e.message}`; }
  }

  async function loadCatalog(c){
    const data=await api(`/admin/mtss/catalog?domain=${encodeURIComponent(c.domain)}&tier=${encodeURIComponent(c.tier)}`); state.catalog=data; return data;
  }
  function options(values, selected=''){ return ['<option value="">—</option>',...values.map(v=>{const label=typeof v==='string'?v:v.label;return `<option value="${esc(label)}" ${label===selected?'selected':''}>${esc(label)}</option>`;})].join(''); }

  function renderCaseDetails(data){
    const c=data.case; state.currentCase=data; $('caseDomainLabel').textContent=domainLabel(c.domain); $('caseModalTitle').textContent=c.student_name_snapshot||c.student_number;
    $('caseMeta').textContent=`OSIS ${c.student_number} · Grade ${c.grade_snapshot||'—'} · Tier ${c.tier} · ${titleCase(c.status)}`;
    const m=data.metrics||null; $('caseMetrics').innerHTML=m?`<div class="metric"><span>Finalized days</span><strong>${m.captured_days}</strong></div><div class="metric"><span>Attendance rate</span><strong>${pct(m.attendance_rate)}</strong></div><div class="metric"><span>Absences</span><strong>${m.absence_count}</strong></div><div class="metric"><span>Lates</span><strong>${m.late_count}</strong></div>`:'';
    $('caseDetails').innerHTML=`<div class="detailRows">
      <div class="detailRow"><span>Domain</span><strong>${esc(domainLabel(c.domain))}</strong></div><div class="detailRow"><span>Tier</span><strong>Tier ${c.tier}</strong></div>
      <div class="detailRow"><span>Status</span><strong>${esc(titleCase(c.status))}</strong></div><div class="detailRow"><span>Owner</span><strong>${esc(c.owner_email||'Unassigned')}</strong></div>
      <div class="detailRow"><span>Next review</span><strong>${esc(fmtDate(c.next_review_date))}</strong></div><div class="detailRow"><span>Opened</span><strong>${esc(fmtTime(c.opened_at_iso))}</strong></div>
      ${c.recommendation?`<div class="detailRow"><span>Recommendation</span><strong class="recommend">${esc(titleCase(c.recommendation))}</strong></div>`:''}
      <div class="detailRow"><span>Reason</span><div>${esc(c.reason||'—')}</div></div></div>`;

    const events=(data.events||[]).map(e=>({at:e.event_at_iso,title:titleCase(e.event_type),detail:e.summary,meta:e.actor_email||e.source}));
    const interventions=(data.interventions||[]).map(i=>({at:i.created_at_iso,title:`Intervention · ${i.intervention_name}`,detail:[i.method,i.frequency,i.notes].filter(Boolean).join(' · '),meta:i.provider_email||i.created_by_email}));
    const reviews=(data.reviews||[]).map(r=>({at:r.reviewed_at_iso,title:`Review · ${titleCase(r.outcome)}`,detail:r.notes,meta:r.reviewed_by_email}));
    const timeline=[...events,...interventions,...reviews].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    $('timelineCount').textContent=`${timeline.length} items`; $('caseTimeline').innerHTML=timeline.length?timeline.map(x=>`<div class="timelineItem"><strong>${esc(x.title)}</strong><div class="meta">${esc(fmtTime(x.at))}${x.meta?` · ${esc(x.meta)}`:''}</div>${x.detail?`<div class="detail">${esc(x.detail)}</div>`:''}</div>`).join(''):'<div class="empty">No timeline events yet.</div>';

    const writable=data.permissions?.can_manage===true&&!data.permissions?.read_only; $('btnAddIntervention').disabled=!writable; $('btnAddReview').disabled=!writable;
    $('contentAreaField').hidden=c.domain!=='academic';
  }

  async function openCase(id){
    $('caseBackdrop').hidden=false; $('caseModalStatus').textContent='Loading case…';
    try{ const data=await api(`/admin/mtss/case?id=${encodeURIComponent(id)}`); await loadCatalog(data.case); renderCaseDetails(data); const cat=state.catalog||{}; $('interventionName').innerHTML=options(cat.interventions||[]); $('interventionMethod').innerHTML=options(cat.methods||[]); $('interventionFrequency').innerHTML=options(cat.frequencies||[]); $('interventionContent').innerHTML=options(cat.content_areas||[]); $('reviewNotes').value=''; $('interventionNotes').value=''; $('caseModalStatus').textContent=''; }
    catch(e){ $('caseModalStatus').textContent=`Could not load case: ${e.message}`; }
  }
  async function addIntervention(){
    const c=state.currentCase?.case; if(!c)return;
    const body={case_id:c.case_id,intervention_name:$('interventionName').value,method:$('interventionMethod').value,frequency:$('interventionFrequency').value,content_area:$('interventionContent').value,notes:$('interventionNotes').value,start_date:new Date().toISOString().slice(0,10)};
    try{ $('caseModalStatus').textContent='Adding intervention…'; await api('/admin/mtss/intervention',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); await openCase(c.case_id); await loadDashboard(); }
    catch(e){ $('caseModalStatus').textContent=`Intervention failed: ${e.message}`; }
  }
  async function addReview(){
    const c=state.currentCase?.case; if(!c)return;
    const body={case_id:c.case_id,outcome:$('reviewOutcome').value,notes:$('reviewNotes').value.trim(),next_review_date:$('reviewNextDate').value};
    try{ $('caseModalStatus').textContent='Saving review…'; await api('/admin/mtss/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); await loadDashboard(); if(body.outcome==='close'||(body.outcome==='step_down'&&Number(c.tier)===2))$('caseBackdrop').hidden=true; else await openCase(c.case_id); }
    catch(e){ $('caseModalStatus').textContent=`Review failed: ${e.message}`; }
  }

  async function runAutomation(path,label){
    try{ $('automationStatus').textContent=`${label}…`; const r=await api(path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}); $('automationStatus').textContent=`Evaluation complete: ${(r.actions||[]).length} case action(s).`; await loadDashboard(); }
    catch(e){ $('automationStatus').textContent=`${label} failed: ${e.message}`; }
  }

  function close(id){ const el=$(id); if(el)el.hidden=true; }
  function wire(){
    $('btnRefresh').addEventListener('click',loadDashboard); $('btnNewCase').addEventListener('click',openNewCase);
    for(const id of ['filterQ','filterDomain','filterTier','filterStatus','filterGrade','filterClosed']) $(id).addEventListener(id==='filterQ'?'input':'change',scheduleDashboard);
    $('casesBody').addEventListener('click',(e)=>{ const row=e.target.closest('[data-case-id]'); if(row)openCase(row.dataset.caseId); });
    $('rulesBody').addEventListener('click',(e)=>{const btn=e.target.closest('.saveRule'); if(btn)saveRule(btn.closest('[data-rule-id]'));});
    $('newCaseForm').addEventListener('submit',(e)=>{e.preventDefault();createCase();});
    $('interventionForm').addEventListener('submit',(e)=>{e.preventDefault();addIntervention();});
    $('reviewForm').addEventListener('submit',(e)=>{e.preventDefault();addReview();});
    $('btnEvaluate').addEventListener('click',()=>runAutomation('/admin/mtss/evaluate','Evaluating attendance rules'));
    document.addEventListener('click',(e)=>{const b=e.target.closest('[data-close]');if(b)close(b.dataset.close);});
  }

  async function boot(){
    const a=await access();
    if(!a){ await showLogin(); return; }
    $('loginCard').hidden=true; $('app').hidden=false; wireOnce();
    const osis=new URL(location.href).searchParams.get('osis'); if(osis&&/^\d+$/.test(osis))$('filterQ').value=osis;
    await loadDashboard();
  }
  let wired=false; function wireOnce(){if(wired)return;wired=true;wire();}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();

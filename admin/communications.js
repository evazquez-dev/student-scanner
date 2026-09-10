const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'communications_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';

const $ = (id) => document.getElementById(id);
const loginCard = $('loginCard');
const loginOut = $('loginOut');
const app = $('app');
const subtitle = $('subtitle');
const viewerPill = $('viewerPill');
const refreshBtn = $('refreshBtn');
const scopeTabs = $('scopeTabs');
const modeBanner = $('modeBanner');
const qualityBanner = $('qualityBanner');
const campaignsEl = $('campaigns');
const attentionEl = $('attention');
const attentionCount = $('attentionCount');
const staffActivityEl = $('staffActivity');
const followupsEl = $('followups');
const recentEl = $('recent');
const errorCard = $('errorCard');
const errorOut = $('errorOut');
const filterSearch = $('filterSearch');
const filterCategory = $('filterCategory');
const filterOutcome = $('filterOutcome');
const filterStaff = $('filterStaff');

let ACCESS = null;
let DASHBOARD = null;
let ACTIVE_SCOPE = new URLSearchParams(location.search).get('scope') || '';

function show(el){ if (el) el.hidden = false; }
function hide(el){ if (el) el.hidden = true; }
function esc(value){ return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function getStoredSid(){ try { return String(sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem('ss_admin_session_sid_v1') || '').trim(); } catch { return ''; } }
function setStoredSid(sid){ const v=String(sid||'').trim(); if(!v)return; try{sessionStorage.setItem(ADMIN_SESSION_KEY,v);localStorage.setItem(ADMIN_SESSION_KEY,v);localStorage.setItem('ss_admin_session_sid_v1',v)}catch{} }
function clearStoredSid(){ try{sessionStorage.removeItem(ADMIN_SESSION_KEY);localStorage.removeItem(ADMIN_SESSION_KEY)}catch{} }
function stashSid(resp){ try{const sid=String(resp?.headers?.get(ADMIN_SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim();if(sid)setStoredSid(sid)}catch{} }

async function adminFetch(pathOrUrl, init={}){
  const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  const headers = new Headers(init.headers || {});
  const sid = getStoredSid();
  if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
  const resp = await fetch(url, { ...init, headers, credentials:'include', cache:'no-store' });
  stashSid(resp);
  if (resp.status === 401 || resp.status === 403) {
    const clone = resp.clone();
    const data = await clone.json().catch(() => null);
    if (['expired','no_session','bad_session'].includes(String(data?.error || '').toLowerCase())) clearStoredSid();
  }
  return resp;
}

async function fetchAccess(){
  const r = await adminFetch('/admin/access');
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

function fmtDate(iso){
  const s=String(iso||'').trim(); if(!s)return '—';
  try{return new Date(s).toLocaleDateString([],{year:'numeric',month:'short',day:'numeric'})}catch{return s}
}
function fmtDateTime(iso){
  const s=String(iso||'').trim(); if(!s)return '—';
  try{return new Date(s).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}catch{return s}
}
function shortNotes(value){ const s=String(value||'').trim(); return s.length>180 ? `${s.slice(0,177)}…` : s; }
function tag(text, kind='info'){ return `<span class="tag ${esc(kind)}">${esc(text)}</span>`; }
function studentUrl(row, { action='', category='' }={}){
  const u = new URL('./student_contacts.html', location.href);
  u.searchParams.set('osis', String(row?.student_number || row?.osis || ''));
  if (row?.student_name || row?.name) u.searchParams.set('name', String(row.student_name || row.name));
  u.searchParams.set('source','communications');
  if (action) u.searchParams.set('action',action);
  if (category) u.searchParams.set('category',category);
  return u.href;
}
function studentLink(row){ return `<a class="studentLink" href="${esc(studentUrl(row))}">${esc(row?.student_name || row?.name || row?.student_number || '—')}</a>`; }
function tableHtml(rows, columns, empty){
  if (!Array.isArray(rows) || !rows.length) return `<div class="empty">${esc(empty)}</div>`;
  return `<table><thead><tr>${columns.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(c=>`<td>${c.render(row)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function setError(message){ const text=String(message||'').trim(); if(!text){hide(errorCard);errorOut.textContent='';return} errorOut.textContent=text;show(errorCard); }
function isAdmin(){ return ['admin','super_admin'].includes(String(ACCESS?.role||'').toLowerCase()); }
function canResolve(row){
  if (ACCESS?.view_as?.active) return false;
  if (isAdmin()) return true;
  const owner=String(row?.follow_up_owner_email || row?.actor_email || '').trim().toLowerCase();
  return owner && owner === String(ACCESS?.email || '').trim().toLowerCase();
}

function renderScopes(data){
  scopeTabs.innerHTML='';
  for (const scope of data?.available_scopes || []) {
    const btn=document.createElement('button');
    btn.type='button'; btn.className=`scopeBtn${scope.key===data?.scope?.key?' active':''}`;
    btn.textContent=scope.label || scope.key;
    btn.addEventListener('click',()=>{ if(scope.key===data?.scope?.key)return; ACTIVE_SCOPE=scope.key; const u=new URL(location.href);u.searchParams.set('scope',scope.key);history.replaceState(null,'',u);loadDashboard(); });
    scopeTabs.appendChild(btn);
  }
}

function renderKpis(data){
  const s=data?.summary || {};
  $('kpiToday').textContent=Number(s.communications_today||0);
  $('kpiWeek').textContent=Number(s.communications_this_week||0);
  $('kpiReached').textContent=Number(s.students_reached_this_week||0);
  $('kpiFollowups').textContent=Number(s.followups_open||0);
  $('kpiFollowupDetail').textContent=`${Number(s.followups_overdue||0)} overdue`;
  $('kpiCampaigns').textContent=Number(s.required_campaigns_open||0);
  $('kpiStudentScope').textContent=`${Number(s.expected_students||0)} students in scope`;
}

function campaignStatusTag(campaign){
  const status=String(campaign?.status||'open');
  if(status==='overdue')return tag('Past due','bad');
  if(status==='due_today')return tag('Due today','warn');
  return tag(`Due ${fmtDate(`${campaign?.campaign?.due_date || ''}T12:00:00`)}`,'info');
}

function renderCampaigns(data){
  const campaigns=data?.campaigns || [];
  if(!campaigns.length){campaignsEl.innerHTML='<div class="empty">No active required communication campaigns.</div>';return}
  campaignsEl.innerHTML=campaigns.map(c=>{
    const counts=c.counts||{}; const campaign=c.campaign||{}; const pct=Number(counts.completion_percent||0);
    const courseScopeLabels=Array.isArray(campaign.course_labels)?campaign.course_labels:[];
    const missing=(c.missing||[]).slice(0,100);
    const owners=(c.breakdown?.by_owner||[]).filter(r=>Number(r.expected||0)>0);
    const ownerTitle=courseScopeLabels.length?'Completion by responsible teacher':'Completion by advisor / owner';
    const ownerPanel=owners.length ? `<div class="miniPanel"><strong>${esc(ownerTitle)}</strong>${owners.map(r=>`<div class="miniRow"><div><strong>${esc(r.owner_name||r.owner_email||'Unassigned')}</strong><div class="muted small">${esc(r.owner_email||'')}</div></div><div class="mono">${Number(r.complete||0)}/${Number(r.expected||0)} · ${Number(r.missing||0)} missing</div></div>`).join('')}</div>` : '<div class="miniPanel empty">No owner breakdown is available for this scope.</div>';
    const missingPanel=missing.length ? `<div class="miniPanel"><strong>Missing students</strong>${missing.map(r=>{const responsibleNames=(r.responsible_staff||[]).map(s=>s.name||s.email).filter(Boolean).join(', ');return `<div class="miniRow"><div>${studentLink(r)}<div class="muted small">Grade ${esc(r.grade||'—')}${responsibleNames?` · Responsible: ${esc(responsibleNames)}`:(r.owner_name?` · ${esc(r.owner_name)}`:'')}</div></div><div class="rowActions"><a class="btn small primary" href="${esc(studentUrl(r,{category:campaign.category}))}">Log</a></div></div>`}).join('')}${Number(counts.missing||0)>missing.length?`<div class="muted small">Showing first ${missing.length} of ${Number(counts.missing||0)} missing students.</div>`:''}</div>` : '<div class="miniPanel empty">Everyone in this scope is complete.</div>';
    return `<article class="campaign">
      <div class="campaignHead"><div><div class="campaignTitle">${esc(campaign.name||campaign.category||'Required Communication')}</div><div class="muted small">${esc(campaign.category||'')} · ${esc(campaign.start_date||'')} → ${esc(campaign.due_date||'')}</div>${courseScopeLabels.length?`<div class="muted small">Responsible: ${esc(courseScopeLabels.join(', '))}</div>`:''}</div>${campaignStatusTag(c)}</div>
      <div class="campaignMetric">${Number(counts.complete||0)} / ${Number(counts.expected||0)}</div>
      <div class="progress" aria-label="${pct}% complete"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div>
      <div class="campaignMeta">${tag(`${pct}% complete`,'good')}${tag(`${Number(counts.missing||0)} remaining`,Number(counts.missing||0)?'warn':'good')}${Number(counts.legacy_text_students||0)?tag(`${Number(counts.legacy_text_students)} legacy note match${Number(counts.legacy_text_students)===1?'':'es'}`,'info'):''}</div>
      <details><summary>View completion details</summary><div class="detailGrid">${missingPanel}${ownerPanel}</div></details>
    </article>`;
  }).join('');
}

function renderAttention(data){
  const rows=data?.attention||[]; attentionCount.textContent=String(Number(data?.attention_count||rows.length));
  if(!rows.length){attentionEl.innerHTML='<div class="empty">Nothing currently needs attention in this scope.</div>';return}
  attentionEl.innerHTML=rows.map(r=>`<article class="attentionItem ${esc(r.severity||'low')}">${tag(String(r.kind||'attention').replaceAll('_',' '),r.severity==='high'?'bad':(r.severity==='medium'?'warn':'info'))}<div style="margin-top:8px">${studentLink(r)}</div><div class="muted small" style="margin-top:4px">${esc(r.detail||'')}</div>${r.owner_name?`<div class="muted small">Owner: ${esc(r.owner_name)}</div>`:''}</article>`).join('');
}

function renderStaffActivity(data){
  staffActivityEl.innerHTML=tableHtml(data?.staff_activity||[],[
    {label:'Staff',render:r=>`<strong>${esc(r.name||r.email||'—')}</strong><div class="muted small">${esc(r.email||'')}</div>`},
    {label:'Communications',render:r=>`<span class="mono">${Number(r.communications||0)}</span>`},
    {label:'Students',render:r=>`<span class="mono">${Number(r.students_reached||0)}</span>`}
  ],'No staff activity in this scope for the current dashboard window.');
}

function dueTag(row){
  if(!row?.follow_up_at_iso)return tag('No due date','info');
  const due=new Date(row.follow_up_at_iso); const now=new Date();
  return due.getTime()<now.getTime()?tag('Overdue','bad'):tag(fmtDateTime(row.follow_up_at_iso),'warn');
}

function renderFollowups(data){
  followupsEl.innerHTML=tableHtml(data?.followups||[],[
    {label:'Student',render:r=>`${studentLink(r)}<div class="muted small">${esc(r.category||'')}</div>`},
    {label:'Due',render:r=>`${dueTag(r)}${r.follow_up_at_iso?`<div class="muted small">${esc(fmtDateTime(r.follow_up_at_iso))}</div>`:''}`},
    {label:'Owner',render:r=>esc(r.follow_up_owner_email||r.actor_email||'—')},
    {label:'Last Contact',render:r=>`${esc(fmtDateTime(r.contact_at_iso||r.created_at_iso))}<div class="muted small">${esc(r.method||'')} · ${esc(r.outcome||'')}</div>`},
    {label:'Notes',render:r=>`<div class="notes">${esc(shortNotes(r.notes)||'—')}</div>`},
    {label:'Action',render:r=>canResolve(r)?`<button class="btn small resolveFollowup" type="button" data-id="${esc(r.communication_id)}" data-student="${esc(r.student_number)}">Mark resolved</button>`:'<span class="muted small">Read only</span>'}
  ],'No open follow-ups in this scope.');
}

function populateSelect(el, values, label, getValue=v=>v, getLabel=v=>v){
  const current=el.value; el.innerHTML=`<option value="">${esc(label)}</option>`;
  for(const value of values||[]){const opt=document.createElement('option');opt.value=getValue(value);opt.textContent=getLabel(value);el.appendChild(opt)}
  if([...el.options].some(o=>o.value===current))el.value=current;
}

function renderFilters(data){
  populateSelect(filterCategory,data?.categories||data?.filter_options?.categories||[],'All categories');
  populateSelect(filterOutcome,data?.filter_options?.outcomes||[],'All outcomes');
  populateSelect(filterStaff,data?.filter_options?.staff||[],'All staff',v=>v.email,v=>v.name||v.email);
}

function recentFilteredRows(){
  const rows=DASHBOARD?.recent||[]; const q=String(filterSearch.value||'').trim().toLowerCase(); const cat=filterCategory.value; const outcome=filterOutcome.value; const staff=filterStaff.value;
  return rows.filter(r=>{
    if(cat&&r.category!==cat)return false;if(outcome&&r.outcome!==outcome)return false;if(staff&&r.actor_email!==staff)return false;
    if(!q)return true;
    return [r.student_name,r.student_number,r.notes,r.contact_display_name,r.actor_email,r.category,r.outcome].some(v=>String(v||'').toLowerCase().includes(q));
  });
}

function renderRecent(){
  recentEl.innerHTML=tableHtml(recentFilteredRows(),[
    {label:'When',render:r=>esc(fmtDateTime(r.contact_at_iso||r.created_at_iso))},
    {label:'Student',render:r=>studentLink(r)},
    {label:'Contact',render:r=>`${esc(r.contact_display_name||'General')}<div class="muted small">${esc(r.contact_relationship||'')}</div>`},
    {label:'Communication',render:r=>`${esc(r.method||'')} · ${esc(r.direction||'')}<div class="muted small">${esc(r.category||'')} · ${esc(r.outcome||'')}</div>`},
    {label:'Staff',render:r=>esc(r.actor_email||'—')},
    {label:'Notes',render:r=>`<div class="notes">${esc(shortNotes(r.notes)||'—')}</div>`}
  ],'No communications match these filters.');
}

function renderDashboard(data){
  DASHBOARD=data; ACTIVE_SCOPE=data?.scope?.key||ACTIVE_SCOPE||'my';
  subtitle.textContent=`${data?.scope?.label||'Communications'} · ${Number(data?.summary?.expected_students||0)} students in campaign scope${data?.scope?.student_scope_source?` · ${String(data.scope.student_scope_source).replaceAll('_',' ')}`:''}`;
  viewerPill.textContent=ACCESS?.view_as?.active?`${ACCESS.email||'—'} · preview`:ACCESS?.email||'—';
  renderScopes(data); renderKpis(data); renderCampaigns(data); renderAttention(data); renderStaffActivity(data); renderFollowups(data); renderFilters(data); renderRecent();
  if(data?.practice){modeBanner.textContent=`Practice Mode — dashboard is showing practice-only communication records for ${data.practice_day}. Nothing on this page writes to live communication history.`;show(modeBanner)}else hide(modeBanner);
  if(data?.data_quality?.truncated){qualityBanner.textContent=`Dashboard query reached its ${Number(data.data_quality.returned_communications||0)}-record limit. Recent activity is usable, but required-campaign totals may be incomplete until the query window is narrowed.`;show(qualityBanner)}else hide(qualityBanner);
}

async function loadDashboard(){
  setError(''); app.classList.add('loading'); refreshBtn.disabled=true;
  try{
    const q=ACTIVE_SCOPE?`?scope=${encodeURIComponent(ACTIVE_SCOPE)}`:'';
    const r=await adminFetch(`/admin/communications/dashboard${q}`); const j=await r.json().catch(()=>null);
    if(!r.ok||!j?.ok)throw new Error(j?.detail||j?.error||`HTTP ${r.status}`);
    const u=new URL(location.href);u.searchParams.set('scope',j.scope?.key||'my');history.replaceState(null,'',u);
    renderDashboard(j);
  }catch(e){setError(e?.message||e)}finally{app.classList.remove('loading');refreshBtn.disabled=false}
}

async function resolveFollowup(id, studentNumber, button){
  if(!id||!studentNumber)return;
  if(!confirm('Mark this follow-up resolved? The resolution will be audited.'))return;
  button.disabled=true;
  try{
    const r=await adminFetch('/admin/communications/followup/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({communication_id:id,student_number:studentNumber})});
    const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);await loadDashboard();
  }catch(e){setError(`Could not resolve follow-up: ${e?.message||e}`);button.disabled=false}
}

async function bootstrapAuthenticated(){
  ACCESS=await fetchAccess();
  if(!ACCESS?.can?.communications&&!ACCESS?.can?.student_contacts)throw new Error('forbidden');
  hide(loginCard);show(app);await loadDashboard();
}

async function onGoogleCredential(resp){
  try{
    loginOut.textContent='Signing in…';
    const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:resp.credential}).toString()});
    const j=await r.json().catch(()=>null);if(j?.sid)setStoredSid(j.sid);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);await bootstrapAuthenticated();
  }catch(e){show(loginCard);hide(app);loginOut.textContent=`Login failed: ${e?.message||e}`}
}

async function trySession(){
  try{const r=await adminFetch('/admin/session/check');const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)return false;await bootstrapAuthenticated();return true}catch{return false}
}

window.addEventListener('DOMContentLoaded',async()=>{
  refreshBtn.addEventListener('click',loadDashboard);
  for(const el of [filterSearch,filterCategory,filterOutcome,filterStaff])el.addEventListener(el===filterSearch?'input':'change',renderRecent);
  document.addEventListener('click',(ev)=>{const btn=ev.target.closest('.resolveFollowup');if(btn)resolveFollowup(btn.dataset.id,btn.dataset.student,btn)});
  if(await trySession())return;
  if(!GOOGLE_CLIENT_ID){loginOut.textContent='Missing google-client-id meta.';return}
  try{
    await new Promise((resolve,reject)=>{const started=Date.now();(function wait(){if(window.google?.accounts?.id)return resolve();if(Date.now()-started>8000)return reject(new Error('Google sign-in failed to load'));setTimeout(wait,50)})()});
    google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:onGoogleCredential,ux_mode:'popup',use_fedcm_for_prompt:true});
    google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});loginOut.textContent='—';
  }catch(e){loginOut.textContent=`Google init failed: ${e?.message||e}`}
});

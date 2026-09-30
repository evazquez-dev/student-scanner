(() => {
  'use strict';
  const API_BASE = (()=>{const raw=(document.querySelector('meta[name="api-base"]')?.content||location.origin).trim();try{return new URL(raw).toString().replace(/\/+$/,'/') }catch{return location.origin+'/'}})();
  const SESSION_KEYS=['access_control_admin_session_v1','admin_roles_admin_session_v1','admin_session_v1','admin_session_sid'];
  const HEADER='x-admin-session';
  const $=id=>document.getElementById(id);
  const state={catalog:null,rolePolicy:{},staff:[],selectedUser:'',effective:null};
  const levelNames=['none','view','use','manage','admin'];
  const levelHelp={
    none:'No access',
    view:'Read-only access',
    use:'Normal day-to-day workflow access',
    manage:'Broader operational or schoolwide management access',
    admin:'Configuration / administrative authority'
  };

  function sid(){try{for(const k of SESSION_KEYS){const v=String(sessionStorage.getItem(k)||localStorage.getItem(k)||'').trim();if(v)return v}}catch{}return''}
  function setSid(v){v=String(v||'').trim();if(!v)return;for(const k of SESSION_KEYS){try{sessionStorage.setItem(k,v);localStorage.setItem(k,v)}catch{}}}
  async function api(path,init={}){const h=new Headers(init.headers||{});const s=sid();if(s&&!h.has(HEADER))h.set(HEADER,s);const r=await fetch(new URL(path,API_BASE),{...init,headers:h,credentials:'include',cache:'no-store'});const x=r.headers.get(HEADER)||r.headers.get('X-Admin-Session');if(x)setSid(x);const j=await r.json().catch(()=>({}));if(!r.ok||j?.ok===false)throw new Error(j?.message||j?.error||`HTTP ${r.status}`);return j}
  function status(msg){$('statusOut').textContent=msg||''}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function roleById(id){return state.catalog?.roles?.find(r=>r.id===id)}
  function groupedCaps(){const g={};for(const c of state.catalog?.capabilities||[])(g[c.category]??=[]).push(c);return g}
  function numericToName(value){return levelNames[Number(value)]||'none'}
  function capLevels(cap){
    const raw=Array.isArray(cap?.valid_levels)&&cap.valid_levels.length?cap.valid_levels:['none','use'];
    return Array.from(new Set(['none',...raw])).filter(x=>levelNames.includes(x));
  }
  function currentPolicyName(cap,value){
    if(value===undefined||value===null||value==='')return'inherit';
    const raw=typeof value==='number'?numericToName(value):String(value).toLowerCase();
    if(raw==='none')return'none';
    return capLevels(cap).includes(raw)?raw:(cap?.grant_level_name||capLevels(cap).find(x=>x!=='none')||'none');
  }
  function allowedText(cap){
    return capLevels(cap).map(x=>`${x[0].toUpperCase()+x.slice(1)} — ${levelHelp[x]||x}`).join(' · ');
  }

  function levelSelect(cap,value,mode='role'){
    const locked=['access_control','admin_roles','admin_dashboard'].includes(cap.id);
    const available=['inherit',...capLevels(cap)];
    const selected=currentPolicyName(cap,value);
    const opts=available.map(x=>{
      const label=x==='inherit'?'Inherit (current EagleNEST behavior)':`${x[0].toUpperCase()+x.slice(1)} — ${levelHelp[x]||x}`;
      return `<option value="${x}" ${selected===x?'selected':''}>${esc(label)}</option>`;
    }).join('');
    return `<select data-cap="${esc(cap.id)}" data-mode="${mode}" ${locked?'disabled':''}>${opts}</select>`;
  }

  function capabilityRow(cap,value,mode,extra=''){
    return `<div class="ac-row">
      <div>
        <div class="ac-title">${esc(cap.label)}</div>
        <div class="ac-desc muted">${esc(cap.description)}</div>
        <div class="ac-level-note">Available here: ${esc(allowedText(cap))}</div>
      </div>
      <div class="ac-control">${levelSelect(cap,value,mode)}${extra}</div>
    </div>`;
  }

  function renderRole(){
    const role=$('roleSelect').value;
    const meta=roleById(role);
    const p=state.rolePolicy?.roles?.[role]||{};
    $('roleSource').innerHTML=`<strong>${esc(meta?.label||role)}</strong><br>${esc(meta?.description||'')}<br><span class="muted">Membership source: ${esc(meta?.source||'Current EagleNEST role resolution')}</span>${meta?.protected?'<br><strong>Protected:</strong> Super Admin critical access cannot be removed here.':''}`;
    let html='<div class="ac-grid">';
    for(const [cat,caps] of Object.entries(groupedCaps())){
      html+=`<section class="ac-category"><h3>${esc(cat)}</h3>`;
      for(const c of caps) html+=capabilityRow(c,p[c.id],'role');
      html+='</section>';
    }
    $('roleMatrix').innerHTML=html+'</div>';
    $('saveRoleBtn').disabled=!!meta?.protected;
    $('resetRoleBtn').disabled=!!meta?.protected;
  }

  function collect(container, mode){
    const out={};
    container.querySelectorAll(`select[data-mode="${mode}"]`).forEach(s=>{
      if(s.disabled)return;
      if(s.value!=='inherit') out[s.dataset.cap]=s.value;
    });
    return out;
  }

  async function saveRole(reset=false){
    const role=$('roleSelect').value;
    const policy=reset?{}:collect($('roleMatrix'),'role');
    status('Saving role policy…');
    await api('/admin/access_control/role_policy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role,policy})});
    await loadCatalog();
    status(`Saved ${roleById(role)?.label||role}.`);
  }

  async function loadStaff(){
    try{
      const j=await api('/admin/view_as/staff');
      state.staff=Array.isArray(j.staff)?j.staff:Array.isArray(j.rows)?j.rows:[];
    }catch{state.staff=[]}
    renderStaffPicker();
  }
  function renderStaffPicker(){
    const q=String($('userSearch').value||'').trim().toLowerCase();
    const rows=state.staff.filter(x=>!q||`${x.name||''} ${x.email||''}`.toLowerCase().includes(q)).slice(0,250);
    $('userPicker').innerHTML='<option value="">Choose staff…</option>'+rows.map(x=>`<option value="${esc(x.email)}">${esc(x.name||x.email)} — ${esc(x.email)}</option>`).join('');
    if(state.selectedUser&&rows.some(x=>x.email===state.selectedUser))$('userPicker').value=state.selectedUser;
  }

  async function loadUser(){
    let email=String($('userPicker').value||'').trim().toLowerCase();
    if(!email){
      const typed=String($('userSearch').value||'').trim().toLowerCase();
      if(typed.includes('@'))email=typed;
    }
    if(!email)throw new Error('Choose a staff member or enter an email.');
    status('Loading effective access…');
    const j=await api(`/admin/access_control/user_effective?email=${encodeURIComponent(email)}`);
    state.selectedUser=email;state.effective=j;
    renderUser();
    status(`Loaded ${email}.`);
  }

  function renderUser(){
    const j=state.effective;if(!j)return;
    const overrides=j.user_override?.overrides||{};
    const staff=state.staff.find(x=>String(x.email).toLowerCase()===j.email);
    $('userSummary').hidden=false;
    $('userSummary').innerHTML=`<strong>${esc(staff?.name||j.staff_profile?.name||j.email)}</strong><br>${esc(j.email)}<br><span class="muted">Base role: ${esc(j.base_role||'editor')}</span><br>${(j.roles||[]).map(r=>`<span class="ac-pill">${esc(roleById(r)?.label||r)}</span>`).join('')}`;
    let html='<div class="ac-grid">';
    for(const [cat,caps] of Object.entries(groupedCaps())){
      html+=`<section class="ac-category"><h3>${esc(cat)}</h3>`;
      for(const c of caps){
        const effective=j.level_names?.[c.id]||'none';
        const source=j.sources?.[c.id]||'';
        const extra=`<span class="ac-effective"><strong>${esc(effective[0].toUpperCase()+effective.slice(1))}</strong><br><span class="muted">${esc(source)}</span></span>`;
        html+=capabilityRow(c,overrides[c.id],'user',extra);
      }
      html+='</section>';
    }
    $('userMatrix').innerHTML=html+'</div>';
    $('userActions').hidden=false;
  }

  async function saveUser(clear=false){
    if(!state.selectedUser)return;
    status(clear?'Clearing overrides…':'Saving overrides…');
    if(clear){
      await api(`/admin/access_control/user_override?email=${encodeURIComponent(state.selectedUser)}`,{method:'DELETE'});
    }else{
      const overrides=collect($('userMatrix'),'user');
      await api('/admin/access_control/user_override',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:state.selectedUser,overrides})});
    }
    await loadUser();
    status(clear?'Individual overrides cleared.':'Individual overrides saved.');
  }

  async function loadAudit(){
    const j=await api('/admin/access_control/audit?limit=150');
    const rows=Array.isArray(j.rows)?j.rows:[];
    $('auditBody').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(new Date(r.ts).toLocaleString())}</td><td>${esc(r.actor_email||'')}</td><td>${esc(r.action||'')}</td><td><code>${esc(JSON.stringify(r.detail||{}))}</code></td></tr>`).join(''):'<tr><td colspan="4" class="muted">No access-control changes yet.</td></tr>';
  }

  async function loadCatalog(){
    const j=await api('/admin/access_control/catalog');
    state.catalog=j;state.rolePolicy=j.role_policy||{};
    const current=$('roleSelect').value;
    $('roleSelect').innerHTML=(j.roles||[]).map(r=>`<option value="${esc(r.id)}">${esc(r.label)}</option>`).join('');
    if(current&&j.roles.some(r=>r.id===current))$('roleSelect').value=current;
    renderRole();
  }

  function tabs(){
    document.querySelectorAll('.ac-tab').forEach(btn=>btn.addEventListener('click',async()=>{
      document.querySelectorAll('.ac-tab').forEach(b=>{b.classList.toggle('active',b===btn);b.classList.toggle('secondary',b!==btn)});
      document.querySelectorAll('.ac-panel').forEach(p=>p.hidden=p.dataset.panel!==btn.dataset.tab);
      if(btn.dataset.tab==='audit')loadAudit().catch(e=>status(`Audit load failed: ${e.message}`));
    }));
  }

  async function boot(){
    const access=await api('/admin/access');
    if(!access?.can?.super_admin)throw new Error('Super Admin access required.');
    $('loginCard').hidden=true;$('appCard').hidden=false;
    $('viewerMeta').textContent=`${access.email||''} (${access.role||''})`;
    await Promise.all([loadCatalog(),loadStaff()]);
    status('Loaded.');
  }

  async function googleLogin(resp){
    try{
      const r=await fetch(new URL('/admin/session/login_google',API_BASE),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:resp.credential}),credentials:'include'});
      const j=await r.json();if(j.sid)setSid(j.sid);if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`);await boot();
    }catch(e){$('loginOut').textContent=`Login failed: ${e.message}`}
  }

  async function init(){
    tabs();
    $('roleSelect').addEventListener('change',renderRole);
    $('saveRoleBtn').addEventListener('click',()=>saveRole(false).catch(e=>status(`Save failed: ${e.message}`)));
    $('resetRoleBtn').addEventListener('click',()=>saveRole(true).catch(e=>status(`Reset failed: ${e.message}`)));
    $('userSearch').addEventListener('input',renderStaffPicker);
    $('userPicker').addEventListener('change',()=>{if($('userPicker').value)$('userSearch').value=$('userPicker').value});
    $('loadUserBtn').addEventListener('click',()=>loadUser().catch(e=>status(e.message)));
    $('saveUserBtn').addEventListener('click',()=>saveUser(false).catch(e=>status(`Save failed: ${e.message}`)));
    $('clearUserBtn').addEventListener('click',()=>saveUser(true).catch(e=>status(`Clear failed: ${e.message}`)));
    $('reloadAuditBtn').addEventListener('click',()=>loadAudit().catch(e=>status(`Audit load failed: ${e.message}`)));
    $('refreshBtn').addEventListener('click',()=>Promise.all([loadCatalog(),state.selectedUser?loadUser():Promise.resolve()]).then(()=>status('Refreshed.')).catch(e=>status(`Refresh failed: ${e.message}`)));
    try{await boot();return}catch{}
    try{
      const start=Date.now();while(!window.google?.accounts?.id){if(Date.now()-start>8000)throw new Error('Google sign-in failed to load');await new Promise(r=>setTimeout(r,50))}
      google.accounts.id.initialize({client_id:document.querySelector('meta[name="google-client-id"]')?.content||'',callback:googleLogin,ux_mode:'popup',use_fedcm_for_prompt:true});
      google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});
      $('loginOut').textContent='Please sign in…';
    }catch(e){$('loginOut').textContent=e.message}
  }
  window.addEventListener('DOMContentLoaded',init);
})();

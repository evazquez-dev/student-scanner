// EAGLENEST_REPORTING_TERMS_V1
(() => {
  'use strict';

  const API_BASE = (() => {
    const raw = (document.querySelector('meta[name="api-base"]')?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/') || (location.origin + '/'); }
    catch { return location.origin + '/'; }
  })();
  const SESSION_KEYS = ['reporting_terms_admin_session_v1','admin_session_v1','admin_session_sid'];
  const HEADER = 'x-admin-session';
  const $ = (id) => document.getElementById(id);
  const state = { access:null, config:null, asOfDate:'', dirty:false };

  function sid(){
    try{
      for(const key of SESSION_KEYS){
        const value=String(sessionStorage.getItem(key)||localStorage.getItem(key)||'').trim();
        if(value)return value;
      }
    }catch{}
    return '';
  }
  function setSid(value){
    value=String(value||'').trim(); if(!value)return;
    for(const key of SESSION_KEYS){try{sessionStorage.setItem(key,value);localStorage.setItem(key,value)}catch{}}
  }
  async function api(path,init={}){
    const headers=new Headers(init.headers||{}); const s=sid(); if(s&&!headers.has(HEADER))headers.set(HEADER,s);
    const response=await fetch(new URL(path,API_BASE),{...init,headers,credentials:'include',cache:'no-store'});
    const session=response.headers.get(HEADER)||response.headers.get('X-Admin-Session'); if(session)setSid(session);
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.ok===false){const error=new Error(data?.message||data?.error||`HTTP ${response.status}`);error.payload=data;throw error}
    return data;
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function clean(value){return String(value??'').trim()}
  function newId(){return `term-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
  function isIsoDate(value){
    const s=String(value||''); if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
    const [y,m,d]=s.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;
  }
  function utcDay(value){if(!isIsoDate(value))return NaN;const [y,m,d]=value.split('-').map(Number);return Date.UTC(y,m-1,d)/86400000}
  function isoFromDay(day){return new Date(day*86400000).toISOString().slice(0,10)}

  function setStatus(message,dirty=state.dirty){
    $('statusOut').innerHTML=`${esc(message||'')}${dirty?' <span class="rt-dirty">• Unsaved changes</span>':''}`;
  }

  function normalizeTerm(term,index){
    return {
      id:clean(term?.id)||newId(),
      code:clean(term?.code).toUpperCase(),
      name:clean(term?.name),
      start_date:clean(term?.start_date),
      end_date:clean(term?.end_date),
      assignment_term:term?.assignment_term!==false,
      locked:term?.locked===true,
      enabled:term?.enabled!==false,
      powerschool_term_id:clean(term?.powerschool_term_id),
      sort_order:index
    };
  }

  function currentConfig(){
    const terms=[...$('termsBody').querySelectorAll('tr[data-term-id]')].map((row,index)=>({
      id:row.dataset.termId,
      code:clean(row.querySelector('[data-field="code"]')?.value).toUpperCase(),
      name:clean(row.querySelector('[data-field="name"]')?.value),
      start_date:clean(row.querySelector('[data-field="start_date"]')?.value),
      end_date:clean(row.querySelector('[data-field="end_date"]')?.value),
      assignment_term:row.querySelector('[data-field="assignment_term"]')?.checked===true,
      locked:row.querySelector('[data-field="locked"]')?.checked===true,
      enabled:row.querySelector('[data-field="enabled"]')?.checked===true,
      powerschool_term_id:clean(row.querySelector('[data-field="powerschool_term_id"]')?.value),
      sort_order:index
    }));
    return {
      version:1,
      school_year_label:clean($('schoolYearLabel').value),
      timezone:'America/New_York',
      terms,
      updated_at_iso:state.config?.updated_at_iso||'',
      updated_by:state.config?.updated_by||''
    };
  }

  function validate(config){
    const errors=[]; const warnings=[]; const ids=new Map(); const codes=new Map(); const psIds=new Map();
    if(!clean(config.school_year_label))warnings.push('School year label is blank.');
    if(!config.terms.length)warnings.push('No reporting terms are configured yet.');
    for(const term of config.terms){
      const label=term.code||term.name||'Unnamed term';
      if(!term.code)errors.push(`${label}: code is required.`);
      if(!term.name)errors.push(`${label}: name is required.`);
      if(!isIsoDate(term.start_date))errors.push(`${label}: start date is invalid.`);
      if(!isIsoDate(term.end_date))errors.push(`${label}: end date is invalid.`);
      if(isIsoDate(term.start_date)&&isIsoDate(term.end_date)&&term.start_date>term.end_date)errors.push(`${label}: start date must be on or before end date.`);
      const idKey=clean(term.id).toLowerCase(); if(ids.has(idKey))errors.push(`${label}: duplicate internal term ID.`); else ids.set(idKey,label);
      const codeKey=clean(term.code).toLowerCase(); if(codeKey){if(codes.has(codeKey))errors.push(`${label}: duplicate code with ${codes.get(codeKey)}.`);else codes.set(codeKey,label)}
      const psKey=clean(term.powerschool_term_id).toLowerCase(); if(psKey){if(psIds.has(psKey))errors.push(`${label}: duplicate PowerSchool term ID with ${psIds.get(psKey)}.`);else psIds.set(psKey,label)}
    }
    const assignmentTerms=config.terms.filter((term)=>term.enabled&&term.assignment_term&&isIsoDate(term.start_date)&&isIsoDate(term.end_date)&&term.start_date<=term.end_date).slice().sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.end_date.localeCompare(b.end_date));
    if(config.terms.length&&!assignmentTerms.length)warnings.push('No enabled assignment terms are configured. Assignment due dates will not resolve to a quarter.');
    for(let i=1;i<assignmentTerms.length;i++){
      const prev=assignmentTerms[i-1],cur=assignmentTerms[i];
      if(cur.start_date<=prev.end_date){errors.push(`Assignment terms ${prev.code||prev.name} and ${cur.code||cur.name} overlap.`);continue}
      const gapStart=utcDay(prev.end_date)+1,gapEnd=utcDay(cur.start_date)-1;
      if(gapEnd>=gapStart){const days=gapEnd-gapStart+1;warnings.push(`No assignment term covers ${isoFromDay(gapStart)} through ${isoFromDay(gapEnd)} (${days} day${days===1?'':'s'}).`)}
    }
    return {ok:errors.length===0,errors,warnings,assignmentTerms};
  }

  function resolve(config,date){
    if(!isIsoDate(date))return {status:'invalid'};
    const terms=config.terms.filter((term)=>term.enabled&&term.assignment_term&&isIsoDate(term.start_date)&&isIsoDate(term.end_date)).slice().sort((a,b)=>a.start_date.localeCompare(b.start_date));
    const matches=terms.filter((term)=>term.start_date<=date&&date<=term.end_date);
    if(matches.length===1)return {status:'matched',term:matches[0]};
    if(matches.length>1)return {status:'ambiguous',matches};
    const previous=terms.filter((term)=>term.end_date<date).slice(-1)[0]||null;
    const next=terms.find((term)=>term.start_date>date)||null;
    return {status:'uncovered',previous,next};
  }

  function renderValidation(){
    const result=validate(currentConfig()); const out=$('validationOut'); const parts=[];
    for(const message of result.errors)parts.push(`<div class="rt-message error"><strong>Error:</strong> ${esc(message)}</div>`);
    for(const message of result.warnings)parts.push(`<div class="rt-message warning"><strong>Warning:</strong> ${esc(message)}</div>`);
    if(!parts.length)parts.push('<div class="rt-message ok"><strong>Looks good.</strong> Assignment-term date ranges are unambiguous.</div>');
    out.innerHTML=parts.join('');
    $('saveBtn').disabled=!result.ok;
    return result;
  }

  function renderSummary(){
    const config=currentConfig(); const date=state.asOfDate||new Date().toISOString().slice(0,10); const result=resolve(config,date);
    $('todayOut').textContent=date;
    if(result.status==='matched'){
      const term=result.term; $('currentTermOut').innerHTML=`<span class="rt-term-pill">${esc(term.code)} · ${esc(term.name)}</span>${term.locked?' <span class="rt-muted-lock">🔒 locked</span>':''}`;
    }else if(result.status==='ambiguous')$('currentTermOut').textContent='Ambiguous — fix overlapping assignment terms';
    else $('currentTermOut').textContent='No assignment term covers today';
    const stamp=state.config?.updated_at_iso?new Date(state.config.updated_at_iso).toLocaleString():'Never saved';
    $('savedOut').textContent=state.config?.updated_by?`${stamp} · ${state.config.updated_by}`:stamp;
  }

  function rowHtml(term,index,total){
    return `<tr data-term-id="${esc(term.id)}" data-enabled="${term.enabled?'true':'false'}">
      <td><input data-field="code" type="text" maxlength="24" value="${esc(term.code)}" placeholder="Q1"></td>
      <td><input class="rt-name" data-field="name" type="text" maxlength="120" value="${esc(term.name)}" placeholder="Quarter 1"></td>
      <td><input data-field="start_date" type="date" value="${esc(term.start_date)}"></td>
      <td><input data-field="end_date" type="date" value="${esc(term.end_date)}"></td>
      <td class="rt-check"><input data-field="assignment_term" type="checkbox" ${term.assignment_term?'checked':''}></td>
      <td class="rt-check"><input data-field="locked" type="checkbox" ${term.locked?'checked':''}></td>
      <td class="rt-check"><input data-field="enabled" type="checkbox" ${term.enabled?'checked':''}></td>
      <td><input class="rt-psid" data-field="powerschool_term_id" type="text" maxlength="80" value="${esc(term.powerschool_term_id)}" placeholder="optional"></td>
      <td class="rt-order"><button class="rt-icon-btn" type="button" data-action="up" ${index===0?'disabled':''}>↑</button> <button class="rt-icon-btn" type="button" data-action="down" ${index===total-1?'disabled':''}>↓</button></td>
      <td><button class="rt-icon-btn rt-delete" type="button" data-action="delete" aria-label="Delete ${esc(term.code||term.name||'term')}">×</button></td>
    </tr>`;
  }

  function renderTerms(terms){
    const normalized=(Array.isArray(terms)?terms:[]).map(normalizeTerm);
    $('termsBody').innerHTML=normalized.map((term,index)=>rowHtml(term,index,normalized.length)).join('');
    $('emptyTerms').hidden=normalized.length>0;
    renderValidation(); renderSummary();
  }

  function markDirty(message='Changed.'){
    state.dirty=true; setStatus(message,true); renderValidation(); renderSummary();
  }

  function addTerm(assignment){
    const config=currentConfig();
    const existing=config.terms.filter((term)=>term.assignment_term===assignment);
    const n=existing.length+1;
    config.terms.push({id:newId(),code:assignment?`Q${n}`:`T${n}`,name:assignment?`Quarter ${n}`:`Reporting Term ${n}`,start_date:'',end_date:'',assignment_term:assignment,locked:false,enabled:true,powerschool_term_id:'',sort_order:config.terms.length});
    renderTerms(config.terms); markDirty(assignment?'Assignment term added.':'Calculation term added.');
  }

  function moveRow(row,direction){
    const target=direction<0?row.previousElementSibling:row.nextElementSibling; if(!target)return;
    const body=$('termsBody'); if(direction<0)body.insertBefore(row,target); else body.insertBefore(target,row);
    renderTerms(currentConfig().terms); markDirty('Term order changed.');
  }

  function handleTableClick(event){
    const button=event.target.closest('button[data-action]'); if(!button)return;
    const row=button.closest('tr[data-term-id]'); if(!row)return;
    if(button.dataset.action==='delete'){
      const code=row.querySelector('[data-field="code"]')?.value||'this term';
      if(!confirm(`Delete ${code}?`))return;
      row.remove(); renderTerms(currentConfig().terms); markDirty('Term deleted.');
    }else if(button.dataset.action==='up')moveRow(row,-1);
    else if(button.dataset.action==='down')moveRow(row,1);
  }

  function renderResolution(){
    const date=$('testDate').value; const result=resolve(currentConfig(),date); const out=$('resolveOut');
    if(result.status==='invalid'){out.textContent='Choose a valid date.';return}
    if(result.status==='matched'){
      const term=result.term; out.innerHTML=`<strong>${esc(date)}</strong> → <span class="rt-term-pill">${esc(term.code)} · ${esc(term.name)}</span>${term.locked?' · 🔒 locked':''}`;return;
    }
    if(result.status==='ambiguous'){out.innerHTML=`<strong>${esc(date)}</strong> matches multiple assignment terms. Fix the overlap before saving.`;return}
    const parts=[]; if(result.previous)parts.push(`previous: ${result.previous.code} ended ${result.previous.end_date}`); if(result.next)parts.push(`next: ${result.next.code} starts ${result.next.start_date}`);
    out.innerHTML=`<strong>${esc(date)}</strong> is not covered by an assignment term${parts.length?` (${esc(parts.join('; '))})`:''}.`;
  }

  async function load(){
    setStatus('Loading…',false);
    const data=await api('/admin/reporting_terms');
    state.config=data.config||{school_year_label:'',timezone:'America/New_York',terms:[]};
    state.asOfDate=data.as_of_date||''; state.dirty=false;
    $('schoolYearLabel').value=state.config.school_year_label||'';
    $('timezoneSelect').value='America/New_York';
    if(!$('testDate').value)$('testDate').value=state.asOfDate||'';
    renderTerms(state.config.terms||[]);
    setStatus('Loaded.',false);
  }

  async function save(){
    const config=currentConfig(); const validation=validate(config); renderValidation();
    if(!validation.ok){setStatus('Fix the validation errors before saving.',true);return}
    $('saveBtn').disabled=true; setStatus('Saving…',true);
    try{
      const data=await api('/admin/reporting_terms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({config})});
      state.config=data.config; state.asOfDate=data.as_of_date||state.asOfDate; state.dirty=false;
      $('schoolYearLabel').value=state.config.school_year_label||''; renderTerms(state.config.terms||[]); setStatus('Saved.',false);
    }catch(error){
      const serverValidation=error?.payload?.validation;
      if(serverValidation?.errors?.length){$('validationOut').innerHTML=serverValidation.errors.map((row)=>`<div class="rt-message error"><strong>Error:</strong> ${esc(row.message||row.code)}</div>`).join('')}
      setStatus(`Save failed: ${error.message}`,true);
    }finally{$('saveBtn').disabled=!validate(currentConfig()).ok}
  }

  async function boot(){
    const access=await api('/admin/access');
    if(access?.can?.reporting_terms!==true)throw new Error('Reporting Terms administrative access required.');
    state.access=access; $('loginCard').hidden=true; $('appCard').hidden=false;
    $('viewerMeta').textContent=`${access.email||''}${access.role?` (${String(access.role).replace('_',' ')})`:''}`;
    await load();
  }

  async function googleLogin(resp){
    try{
      const response=await fetch(new URL('/admin/session/login_google',API_BASE),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:resp.credential}),credentials:'include'});
      const data=await response.json().catch(()=>({})); if(data.sid)setSid(data.sid); if(!response.ok||!data.ok)throw new Error(data.error||`HTTP ${response.status}`); await boot();
    }catch(error){$('loginOut').textContent=`Login failed: ${error.message}`}
  }

  async function init(){
    $('termsBody').addEventListener('click',handleTableClick);
    $('termsBody').addEventListener('input',(event)=>{const row=event.target.closest('tr[data-term-id]');if(row&&event.target.dataset.field==='enabled')row.dataset.enabled=event.target.checked?'true':'false';markDirty('Changed.');});
    $('termsBody').addEventListener('change',(event)=>{const row=event.target.closest('tr[data-term-id]');if(row&&event.target.dataset.field==='enabled')row.dataset.enabled=event.target.checked?'true':'false';markDirty('Changed.');});
    $('schoolYearLabel').addEventListener('input',()=>markDirty('Changed.'));
    $('addAssignmentBtn').addEventListener('click',()=>addTerm(true));
    $('addCalculationBtn').addEventListener('click',()=>addTerm(false));
    $('saveBtn').addEventListener('click',()=>save());
    $('refreshBtn').addEventListener('click',async()=>{if(state.dirty&&!confirm('Discard unsaved reporting-term changes and reload?'))return;try{await load()}catch(error){setStatus(`Refresh failed: ${error.message}`,state.dirty)}});
    $('testDateBtn').addEventListener('click',renderResolution);
    $('testDate').addEventListener('change',renderResolution);
    window.addEventListener('beforeunload',(event)=>{if(!state.dirty)return;event.preventDefault();event.returnValue=''});

    try{await boot();return}catch(error){$('loginOut').textContent=error.message.includes('required')?error.message:''}
    try{
      const start=Date.now();while(!window.google?.accounts?.id){if(Date.now()-start>8000)throw new Error('Google sign-in failed to load');await new Promise((resolve)=>setTimeout(resolve,50))}
      google.accounts.id.initialize({client_id:document.querySelector('meta[name="google-client-id"]')?.content||'',callback:googleLogin,ux_mode:'popup',use_fedcm_for_prompt:true});
      google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});
      if(!$('loginOut').textContent)$('loginOut').textContent='Please sign in…';
    }catch(error){$('loginOut').textContent=error.message}
  }

  window.addEventListener('DOMContentLoaded',init);
})();

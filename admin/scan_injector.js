(() => {
  'use strict';
  const API_BASE = (() => {
    const raw = String(document.querySelector('meta[name="api-base"]')?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/'); } catch { return location.origin + '/'; }
  })();
  const SESSION_KEYS = ['ss_admin_session_sid_v1','admin_session_v1','admin_session_sid'];
  const SESSION_HEADER = 'x-admin-session';
  const $ = (id) => document.getElementById(id);
  const state = { students: [], filtered: [], selected: new Set(), practice: true, liveAllowed: false, date: '' };

  function sessionSid(){
    try { for (const key of SESSION_KEYS) { const v = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim(); if (v) return v; } } catch {}
    return '';
  }
  function storeSid(v){
    const sid = String(v || '').trim(); if (!sid) return;
    for (const key of SESSION_KEYS) { try { sessionStorage.setItem(key, sid); } catch {} try { localStorage.setItem(key, sid); } catch {} }
  }
  async function adminFetch(path, init = {}){
    const headers = new Headers(init.headers || {}); const sid = sessionSid(); if (sid) headers.set(SESSION_HEADER, sid);
    const response = await fetch(new URL(path, API_BASE), { ...init, headers, credentials:'include', cache:'no-store' });
    try { storeSid(response.headers.get(SESSION_HEADER) || response.headers.get('X-Admin-Session')); } catch {}
    return response;
  }
  function esc(value){ return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function setStatus(msg, ok = true){ const el=$('resultBox'); el.className=`status ${ok?'ok':'bad'}`; el.textContent=String(msg||''); }
  function localDateTimeValue(date = new Date()){
    const p = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(date);
    const o=Object.fromEntries(p.map(x=>[x.type,x.value])); return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}:${o.second}`;
  }
  function updateButton(){
    const loc=String($('locationSelect')?.value||'').trim(); const when=String($('whenInput')?.value||'').trim();
    const liveOk=state.practice || (state.liveAllowed && String($('liveConfirm')?.value||'').trim()==='INJECT LIVE SCANS');
    $('injectBtn').disabled=!(loc && when && state.selected.size && liveOk);
    $('selectedCount').textContent=String(state.selected.size);
  }
  function renderRoster(){
    const q=String($('searchInput')?.value||'').trim().toLowerCase();
    state.filtered=state.students.filter(s=>!q||String(s.name).toLowerCase().includes(q)||String(s.osis).includes(q)).slice(0,800);
    const body=$('rosterBody'); body.innerHTML='';
    for(const s of state.filtered){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td></td><td>${esc(s.name)}</td><td class="mono">${esc(s.osis)}</td><td>${esc(s.grade)}</td>`;
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=state.selected.has(s.osis);
      cb.addEventListener('change',()=>{ if(cb.checked)state.selected.add(s.osis); else state.selected.delete(s.osis); updateButton(); });
      tr.children[0].appendChild(cb); body.appendChild(tr);
    }
    updateButton();
  }
  function normalizePastedOsis(value){
    const token=String(value||'').trim();
    if(!/^\d{6,12}$/.test(token))return '';
    return token;
  }
  function addPastedOsis(){
    const box=$('osisPasteInput');
    const raw=String(box?.value||'');
    const tokens=raw.split(/[\r\n\t,; ]+/).map(v=>v.trim()).filter(Boolean);
    if(!tokens.length){setStatus('Paste one or more OSIS numbers first.',false);return;}
    const unique=Array.from(new Set(tokens));
    const known=new Set(state.students.map(s=>String(s.osis||'')));
    const notFound=[];
    let invalid=0;
    let added=0;
    for(const token of unique){
      const osis=normalizePastedOsis(token);
      if(!osis){invalid+=1;continue;}
      if(!known.has(osis)){notFound.push(osis);continue;}
      if(!state.selected.has(osis))added+=1;
      state.selected.add(osis);
    }
    if($('searchInput'))$('searchInput').value='';
    renderRoster();
    const parts=[`Added ${added} student(s) to the selection.`];
    if(notFound.length)parts.push(`${notFound.length} OSIS not found: ${notFound.slice(0,12).join(', ')}${notFound.length>12?'…':''}.`);
    if(invalid)parts.push(`${invalid} invalid entr${invalid===1?'y':'ies'} ignored.`);
    setStatus(parts.join(' '),notFound.length===0&&invalid===0);
  }

  function renderResults(rows){
    const body=$('resultsBody'); body.innerHTML='';
    if(!rows.length){body.innerHTML='<tr><td colspan="4" class="muted">No results.</td></tr>';return;}
    for(const row of rows){
      const tr=document.createElement('tr');
      const status=row.ok?'INJECTED':'FAILED';
      const detail=row.ok ? [row.allowed||'default IN',row.period_id?`period ${row.period_id}`:''].filter(Boolean).join(' • ') : String(row.error||'failed');
      tr.innerHTML=`<td>${status}</td><td>${esc(row.name||row.osis)}<div class="mono muted">${esc(row.osis)}</div></td><td class="mono">${esc(row.local_time||row.whenISO||'')}</td><td>${esc(detail)}</td>`;
      body.appendChild(tr);
    }
  }
  async function loadOptions(){
    const response=await adminFetch('/admin/scan_injector/options',{method:'GET'}); const data=await response.json().catch(()=>null);
    if(response.status===401){$('authCard').style.display='';return;}
    if(!response.ok||!data?.ok)throw new Error(data?.error||`options HTTP ${response.status}`);
    state.students=Array.isArray(data.students)?data.students:[]; state.practice=!!data.practice; state.liveAllowed=!!data.live_injection_allowed; state.date=String(data.date||'');
    $('dateLabel').textContent=state.date; $('modePill').textContent=state.practice?'Mode: PRACTICE':'Mode: LIVE'; $('modePill').className=`pill ${state.practice?'practice':'live'}`;
    $('liveControls').style.display=state.practice?'none':'';
    const loc=$('locationSelect'); loc.innerHTML='<option value="">Select location…</option>';
    for(const row of Array.isArray(data.locations)?data.locations:[]){const o=document.createElement('option');o.value=row.name;o.textContent=[row.name,row.type||row.mode].filter(Boolean).join(' — ');loc.appendChild(o);}
    $('whenInput').value=localDateTimeValue(); $('app').style.display=''; renderRoster(); updateButton();
    if(!state.practice&&!state.liveAllowed)setStatus('Live scan injection is restricted to super-admin accounts.',false);
  }
  async function inject(){
    const local=String($('whenInput').value||'').trim(); const parsed=new Date(local);
    if(!Number.isFinite(parsed.getTime())){setStatus('Choose a valid scan time.',false);return;}
    const payload={location:String($('locationSelect').value||''),whenISO:parsed.toISOString(),spacing_seconds:Number($('spacingInput').value||0),osisList:Array.from(state.selected)};
    if(!state.practice)payload.live_confirmation=String($('liveConfirm').value||'').trim();
    $('injectBtn').disabled=true; setStatus(`Injecting ${payload.osisList.length} scan-in(s)…`,true);
    try{
      const response=await adminFetch('/admin/scan_injector/inject',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}); const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(data?.error||`inject HTTP ${response.status}`);
      renderResults(Array.isArray(data.results)?data.results:[]);
      setStatus(`Injected ${data.injected||0} of ${data.requested||0} at ${data.location}.${data.failed?` ${data.failed} failed.`:''}`,Number(data.failed||0)===0);
    }catch(error){setStatus(String(error?.message||error),false);}finally{updateButton();}
  }
  function boot(){
    $('searchInput')?.addEventListener('input',renderRoster); $('locationSelect')?.addEventListener('change',updateButton); $('whenInput')?.addEventListener('input',updateButton); $('liveConfirm')?.addEventListener('input',updateButton);
    $('selectVisibleBtn')?.addEventListener('click',()=>{for(const s of state.filtered)state.selected.add(s.osis);renderRoster();});
    $('clearVisibleBtn')?.addEventListener('click',()=>{for(const s of state.filtered)state.selected.delete(s.osis);renderRoster();});
    $('addOsisBtn')?.addEventListener('click',addPastedOsis);
    $('clearOsisBoxBtn')?.addEventListener('click',()=>{if($('osisPasteInput'))$('osisPasteInput').value='';});
    $('osisPasteInput')?.addEventListener('keydown',(event)=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();addPastedOsis();}});
    $('clearBtn')?.addEventListener('click',()=>{state.selected.clear();renderRoster();}); $('injectBtn')?.addEventListener('click',inject);
    loadOptions().catch(err=>{ $('authCard').style.display=''; setStatus(String(err?.message||err),false); });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

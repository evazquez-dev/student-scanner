// EAGLENEST_PS_PERIOD_MATCHING_V1
(() => {
  const base = String(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
  const el=id=>document.getElementById(id);
  const date=el('date'),rows=el('rows'),meta=el('meta'),msg=el('message'),save=el('save'),status=el('status');
  const keys=['ss_admin_session_sid_v1','teacher_att_admin_session_v1','admin_session_v1','attendance_status_admin_session_v1'];
  let state=null;
  function sid(){for(const k of keys){try{const v=sessionStorage.getItem(k)||localStorage.getItem(k);if(v)return v;}catch{}}return window.EAGLENEST_AUTH?.getSid?.()||'';}
  async function request(path,options={}){
    const h=new Headers(options.headers||{}),token=sid();if(token)h.set('x-admin-session',token);
    const r=await fetch(new URL(path,base),{...options,headers:h,credentials:'include',cache:'no-store'});
    const j=await r.json().catch(()=>({ok:false,error:`HTTP ${r.status}`}));
    if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`);return j;
  }
  function say(text,warning=false){msg.textContent=text;msg.className=warning?'warn':'ok';}
  function esc(x){return String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function localOptions(s){return [{value:'',label:'Select source…'},{value:'daily',label:'Official PowerSchool Daily Attendance'},
    ...s.local_periods.map(p=>({value:'local:'+p.id,label:`EagleNEST ${p.id} (${p.start}–${p.end})`})),{value:'skip',label:'Do Not Send'}];}
  function display(){
    rows.textContent='';save.disabled=true;
    if(!state?.found){meta.textContent='PowerSchool day context unavailable. Push schedule and refresh PowerSchool meeting support first.';return;}
    meta.textContent=`Date ${state.date} • PS bell schedule ${state.bell_schedule_id} • ${state.ps_periods.length} PowerSchool periods • ${state.local_periods.length} EagleNEST periods • Active mapping: ${state.scope||'automatic aliases'}`;
    status.textContent=state.status.replace(/_/g,' ');
    el('scope').value=state.scope||'date';
    if(!state.ps_periods.length){rows.innerHTML='<tr><td colspan="3">No PowerSchool meeting periods.</td></tr>';return;}
    const opts=localOptions(state);
    for(const p of state.ps_periods){
      const tr=document.createElement('tr');tr.dataset.pid=String(p.period_id);
      const label=document.createElement('td');label.innerHTML=`<strong>${esc(p.abbreviation||p.name||p.period_number||p.period_id)}</strong><div class="sub mono">ID ${esc(p.period_id)} • #${esc(p.period_number)}</div>`;
      const time=document.createElement('td');time.textContent=`${p.start||'—'} – ${p.end||'—'}`;
      const tc=document.createElement('td'),sel=document.createElement('select');sel.setAttribute('aria-label',`Source for ${p.abbreviation||p.period_id}`);
      for(const option of opts){const o=new Option(option.label,option.value);sel.add(o);}
      const current=state.mappings[p.period_id]||state.suggestions[p.period_id];
      if(current)sel.value=current.kind==='local'?'local:'+current.local_period:current.kind;
      sel.addEventListener('change',()=>{save.disabled=false;say('Unsaved changes. Review all period sources before approval.',true);});
      tc.appendChild(sel);tr.append(label,time,tc);rows.appendChild(tr);
    }
    save.disabled=false;
    say(state.approved ? `Approved mapping loaded (${state.scope}). Saving will update it.` :
      state.needs_review ? 'Unmatched schedule: select a source for every PowerSchool period and approve before meeting attendance can be sent.' :
      'Existing unambiguous matches are suggested. Review and approve if you want to customize them.',state.needs_review);
  }
  async function load(){try{say('Loading…');state=await request('/admin/ps_period_matching?date='+encodeURIComponent(date.value));display();}catch(e){state=null;rows.textContent='';save.disabled=true;say('Could not load mapping: '+e.message,true);}}
  async function submit(){
    if(!state?.found)return;
    const mappings={};for(const tr of rows.querySelectorAll('tr[data-pid]')){
      const v=tr.querySelector('select')?.value||'';
      if(!v){say('Please select a source for every PowerSchool period.',true);return;}
      mappings[tr.dataset.pid]=v.startsWith('local:')?{kind:'local',local_period:v.slice(6)}:{kind:v};
    }
    if(!confirm(`Approve ${Object.keys(mappings).length} mappings for ${el('scope').value==='bell'?'every use of this PowerSchool bell schedule':'this date only'}? This does not send attendance.`))return;
    save.disabled=true;
    try{state=await request('/admin/ps_period_matching',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:date.value,bell_schedule_id:state.bell_schedule_id,scope:el('scope').value,mappings})});display();say('Approved and saved. Next attendance sender run will use these mappings. No attendance was sent by this save.');}
    catch(e){save.disabled=false;say('Not saved: '+e.message,true);}
  }
  const now=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  date.value=now;el('load').addEventListener('click',load);save.addEventListener('click',submit);load();
})();

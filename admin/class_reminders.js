(() => {
  const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
  const SESSION_HEADER='x-admin-session';
  const SESSION_KEYS=['notifications_admin_session_v1','ss_admin_session_sid_v1','teacher_att_admin_session_v1','my_schedule_admin_session_v1','dreamer_of_week_admin_session_v1','admin_session_v1','admin_session_sid'];
  const FALLBACK_LEADS=[1,3,5,10,15];

  const toggle=document.getElementById('classReminderToggle');
  const leadSelect=document.getElementById('classReminderLead');
  const status=document.getElementById('classReminderStatus');
  const device=document.getElementById('classReminderDevice');
  if(!toggle||!leadSelect||!status||!device)return;

  let state=null;
  let busy=false;
  let retryTimer=null;
  let retries=0;

  function getSid(){try{for(const key of SESSION_KEYS){const value=String(sessionStorage.getItem(key)||localStorage.getItem(key)||'').trim();if(value)return value;}}catch{}return '';}
  function stashSid(resp,data){try{const sid=String(data?.sid||resp?.headers?.get(SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim();if(!sid)return;for(const key of SESSION_KEYS){sessionStorage.setItem(key,sid);localStorage.setItem(key,sid);}}catch{}}
  async function apiFetch(path,init={}){const headers=new Headers(init.headers||{});const sid=getSid();if(sid&&!headers.has(SESSION_HEADER))headers.set(SESSION_HEADER,sid);const resp=await fetch(new URL(path,API_BASE),{...init,headers,credentials:'include',cache:'no-store'});let data={};try{data=await resp.clone().json();}catch{}stashSid(resp,data);return{resp,data};}
  function leadLabel(value){const n=Number(value||5);return`${n} minute${n===1?'':'s'} before`;}
  function allowedLeads(){const raw=Array.isArray(state?.allowed_lead_minutes)?state.allowed_lead_minutes:FALLBACK_LEADS;const values=raw.map(Number).filter(n=>Number.isFinite(n)&&n>0);return values.length?values:FALLBACK_LEADS;}
  function ensureLeadOptions(){const selected=Number(state?.lead_minutes||5);const values=allowedLeads();const signature=values.join(',');if(leadSelect.dataset.optionsSignature!==signature){leadSelect.replaceChildren();for(const value of values){const option=document.createElement('option');option.value=String(value);option.textContent=leadLabel(value);leadSelect.appendChild(option);}leadSelect.dataset.optionsSignature=signature;}leadSelect.value=String(values.includes(selected)?selected:Number(state?.default_lead_minutes||5));}
  function render(){
    if(!state){toggle.disabled=true;leadSelect.disabled=true;status.textContent='Checking';status.classList.remove('on');device.textContent='Checking notification setup…';return;}
    ensureLeadOptions();
    const enabled=state.enabled===true;
    const lead=Number(state.lead_minutes||5);
    const count=Number(state.subscription_count||0);
    toggle.checked=enabled;
    toggle.disabled=busy;
    leadSelect.disabled=busy;
    status.textContent=busy?'Saving…':(enabled?'On':'Off');
    status.classList.toggle('on',enabled&&!busy);
    if(state.push_configured!==true){device.textContent='Push delivery is not configured on the Worker yet.';return;}
    if(count>0){device.textContent=`${enabled?'On':'Off'} · ${leadLabel(lead)} · ${count} push-enabled device${count===1?'':'s'} on your account.`;return;}
    device.textContent=`${enabled?'On':'Off'} · ${leadLabel(lead)} · Enable notifications for this device above to receive reminders.`;
  }
  async function load({retry=true}={}){
    try{
      const {resp,data}=await apiFetch('/admin/class_reminders/preferences',{method:'GET'});
      if(!resp.ok||!data?.ok){if(resp.status===401&&retry&&retries<20){retries+=1;clearTimeout(retryTimer);retryTimer=setTimeout(()=>load({retry:true}),1500);return;}throw new Error(data?.error||`HTTP ${resp.status}`);}
      retries=0;state=data;render();
    }catch(error){toggle.disabled=true;leadSelect.disabled=true;status.textContent='Unavailable';status.classList.remove('on');device.textContent=`Could not load class reminder settings: ${error?.message||error}`;}
  }
  async function save(patch){
    if(busy||!state)return false;
    busy=true;render();
    try{
      const {resp,data}=await apiFetch('/admin/class_reminders/preferences',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});
      if(!resp.ok||!data?.ok)throw new Error(data?.error||`HTTP ${resp.status}`);
      state=data;return true;
    }catch(error){device.textContent=`Could not save class reminder setting: ${error?.message||error}`;return false;}
    finally{busy=false;render();}
  }

  toggle.addEventListener('change',async()=>{const wanted=!!toggle.checked;const previous=state?.enabled===true;if(wanted===previous)return;const ok=await save({enabled:wanted});if(!ok)toggle.checked=previous;});
  leadSelect.addEventListener('change',async()=>{if(!state)return;const lead=Number(leadSelect.value);const previous=Number(state.lead_minutes||5);if(lead===previous)return;const ok=await save({lead_minutes:lead});if(!ok)leadSelect.value=String(previous);});
  window.addEventListener('focus',()=>load({retry:!state}));
  window.addEventListener('beforeunload',()=>{if(retryTimer)clearTimeout(retryTimer);});
  render();
  load({retry:true});
})();

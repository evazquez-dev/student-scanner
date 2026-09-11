const CLASS_REMINDER_API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const CLASS_REMINDER_SESSION_HEADER='x-admin-session';
const CLASS_REMINDER_SESSION_KEYS=['my_schedule_admin_session_v1','ss_admin_session_sid_v1','teacher_att_admin_session_v1','dreamer_of_week_admin_session_v1','admin_session_v1'];

const reminderToggle=document.getElementById('classReminderToggle');
const reminderStatus=document.getElementById('classReminderStatus');
const reminderDevice=document.getElementById('classReminderDevice');
let reminderState=null;
let reminderBusy=false;
let reminderRetryTimer=null;
let reminderRetries=0;

function classReminderSid(){try{for(const key of CLASS_REMINDER_SESSION_KEYS){const value=String(sessionStorage.getItem(key)||localStorage.getItem(key)||'').trim();if(value)return value;}}catch{}return '';}
function stashClassReminderSid(resp,data){try{const sid=String(data?.sid||resp?.headers?.get(CLASS_REMINDER_SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim();if(sid){sessionStorage.setItem('my_schedule_admin_session_v1',sid);localStorage.setItem('my_schedule_admin_session_v1',sid);}}catch{}}
async function classReminderFetch(path,init={}){const headers=new Headers(init.headers||{});const sid=classReminderSid();if(sid&&!headers.has(CLASS_REMINDER_SESSION_HEADER))headers.set(CLASS_REMINDER_SESSION_HEADER,sid);const resp=await fetch(new URL(path,CLASS_REMINDER_API_BASE),{...init,headers,credentials:'include',cache:'no-store'});let data=null;try{data=await resp.clone().json();}catch{}stashClassReminderSid(resp,data);return {resp,data:data||{}};}

function renderClassReminder(){
  if(!reminderToggle||!reminderStatus||!reminderDevice)return;
  if(!reminderState){reminderToggle.disabled=true;reminderToggle.textContent='Checking…';reminderStatus.textContent='';reminderDevice.textContent='Checking notification setup…';return;}
  const enabled=reminderState.enabled===true;
  const count=Number(reminderState.subscription_count||0);
  reminderToggle.disabled=reminderBusy;
  reminderToggle.textContent=reminderBusy?'Saving…':(enabled?'Turn off':'Turn on');
  reminderStatus.textContent=enabled?'On — reminders will be sent about 5 minutes before your assigned class.':'Off — this is the default.';
  if(reminderState.push_configured!==true){reminderDevice.innerHTML='Push delivery is not configured on the Worker yet.';return;}
  if(count>0){reminderDevice.textContent=`Push is enabled on ${count} EagleNEST device${count===1?'':'s'} for your account.`;return;}
  reminderDevice.innerHTML='No push-enabled device is registered yet. <a href="./notifications.html">Open Notification settings</a> to enable one.';
}

async function loadClassReminderState({retry=true}={}){
  try{
    const {resp,data}=await classReminderFetch('/admin/class_reminders/preferences',{method:'GET'});
    if(!resp.ok||!data?.ok){
      if(resp.status===401&&retry&&reminderRetries<20){
        reminderRetries+=1;
        clearTimeout(reminderRetryTimer);
        reminderRetryTimer=setTimeout(()=>loadClassReminderState({retry:true}),1500);
        return;
      }
      throw new Error(data?.error||`HTTP ${resp.status}`);
    }
    reminderRetries=0;
    reminderState=data;
    renderClassReminder();
  }catch(error){
    reminderToggle.disabled=true;
    reminderToggle.textContent='Unavailable';
    reminderStatus.textContent='Could not load class reminder settings.';
    reminderDevice.textContent=String(error?.message||error);
  }
}

async function toggleClassReminder(){
  if(reminderBusy||!reminderState)return;
  reminderBusy=true;renderClassReminder();
  try{
    const {resp,data}=await classReminderFetch('/admin/class_reminders/preferences',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({enabled:reminderState.enabled!==true})
    });
    if(!resp.ok||!data?.ok)throw new Error(data?.error||`HTTP ${resp.status}`);
    reminderState=data;
  }catch(error){
    reminderStatus.textContent=`Could not save: ${error?.message||error}`;
  }finally{
    reminderBusy=false;renderClassReminder();
  }
}

window.addEventListener('DOMContentLoaded',()=>{
  reminderToggle?.addEventListener('click',toggleClassReminder);
  renderClassReminder();
  loadClassReminderState({retry:true});
});
window.addEventListener('focus',()=>loadClassReminderState({retry:!reminderState}));
window.addEventListener('beforeunload',()=>{if(reminderRetryTimer)clearTimeout(reminderRetryTimer);});

const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const GOOGLE_CLIENT_ID=document.querySelector('meta[name="google-client-id"]')?.content||'';
const ADMIN_SESSION_KEY='notifications_admin_session_v1';
const ADMIN_SESSION_FALLBACK_KEYS=['ss_admin_session_sid_v1','teacher_att_admin_session_v1','admin_session_v1','admin_session_sid'];
const ADMIN_SESSION_HEADER='x-admin-session';
const $=(id)=>document.getElementById(id);
const loginCard=$('loginCard'),loginOut=$('loginOut'),app=$('app'),viewerPill=$('viewerPill');
const deviceSummary=$('deviceSummary'),deviceBadge=$('deviceBadge'),platformHint=$('platformHint');
const enableBtn=$('enableBtn'),disableBtn=$('disableBtn'),refreshBtn=$('refreshBtn'),testBtn=$('testBtn'),testOut=$('testOut'),notice=$('notice'),deanEmail=$('deanEmail'),phoneReturnRouting=$('phoneReturnRouting');
const prefList=$('prefList'),prefSaveOut=$('prefSaveOut');
const showDefaultExternalLinks=$('showDefaultExternalLinks'),defaultExternalLinksPreview=$('defaultExternalLinksPreview'),personalExternalLinksRows=$('personalExternalLinksRows');
const addPersonalExternalLinkBtn=$('addPersonalExternalLinkBtn'),savePersonalExternalLinksBtn=$('savePersonalExternalLinksBtn'),externalLinksSaveOut=$('externalLinksSaveOut');
let ACCESS=null,CONFIG=null,REG=null,CURRENT_SUB=null,BUSY=false;
let EXTERNAL_LINK_PREFS={show_defaults:true,default_links:[],personal_links:[]};

function getStoredAdminSessionSid(){try{for(const k of [ADMIN_SESSION_KEY,...ADMIN_SESSION_FALLBACK_KEYS]){const v=String(sessionStorage.getItem(k)||localStorage.getItem(k)||'').trim();if(v)return v;}}catch{}return '';}
function setStoredAdminSessionSid(sid){const v=String(sid||'').trim();if(!v)return;try{for(const k of [ADMIN_SESSION_KEY,...ADMIN_SESSION_FALLBACK_KEYS]){sessionStorage.setItem(k,v);localStorage.setItem(k,v);}}catch{}}
function stash(resp){try{const sid=String(resp?.headers?.get(ADMIN_SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim();if(sid)setStoredAdminSessionSid(sid);}catch{}}
async function adminFetch(path,init={}){const u=new URL(path,API_BASE);const headers=new Headers(init.headers||{});const sid=getStoredAdminSessionSid();if(sid&&!headers.has(ADMIN_SESSION_HEADER))headers.set(ADMIN_SESSION_HEADER,sid);const r=await fetch(u,{...init,headers,credentials:'include',cache:'no-store'});stash(r);return r;}
async function waitForGoogle(timeoutMs=8000){const start=Date.now();while(!window.google?.accounts?.id){if(Date.now()-start>timeoutMs)throw new Error('Google sign-in script failed to load');await new Promise(r=>setTimeout(r,50));}return window.google.accounts.id;}
async function doLogin(idToken){const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:idToken}).toString()});const j=await r.json().catch(()=>({}));if(j?.sid)setStoredAdminSessionSid(String(j.sid));if(!r.ok||!j?.ok)throw new Error(j?.error||`login_http_${r.status}`);}
async function getAccess(){const r=await adminFetch('/admin/access',{method:'GET'});const j=await r.json().catch(()=>null);return r.ok&&j?.ok?j:null;}
function setBusy(v){BUSY=!!v;for(const b of [enableBtn,disableBtn,refreshBtn,testBtn,addPersonalExternalLinkBtn,savePersonalExternalLinksBtn])if(b)b.disabled=BUSY;if(showDefaultExternalLinks)showDefaultExternalLinks.disabled=BUSY;for(const el of document.querySelectorAll('.prefToggle')){const eligible=el.dataset.eligible==='1';const available=el.dataset.available==='1';el.disabled=BUSY||!eligible||!available;}for(const el of document.querySelectorAll('.externalLinkInput,.externalRemoveBtn'))el.disabled=BUSY;}
function showNotice(msg,kind='ok'){notice.textContent=String(msg||'');notice.className=`notice ${kind}`;notice.hidden=!msg;}
function base64urlToUint8Array(base64url){const padded=String(base64url||'')+'='.repeat((4-(String(base64url||'').length%4))%4);const binary=atob(padded.replace(/-/g,'+').replace(/_/g,'/'));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
function supported(){return !!(window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window);}
function platformMessage(){const ua=navigator.userAgent||'';const ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;if(ios&&!standalone)return 'On iPhone/iPad, install EagleNEST to the Home Screen first, open the installed app, then enable notifications from this page.';return 'Browser notification permission is controlled by this device. You can enable more than one device for the same EagleNEST account.';}
async function ensureRegistration(){if(!supported())throw new Error('Push notifications are not supported in this browser/context.');const swUrl=new URL('../sw.js',location.href).href;const scopeUrl=new URL('../',location.href);REG=await navigator.serviceWorker.register(swUrl,{scope:scopeUrl.pathname});await navigator.serviceWorker.ready;REG=await navigator.serviceWorker.getRegistration(scopeUrl.pathname)||REG;return REG;}

function preferenceStatusLabel(row){if(row.status==='coming_soon')return 'Coming soon';if(!row.eligible)return 'Not eligible';return row.enabled?'On':'Off';}
function renderPreferences(){
  if(!prefList)return;
  const rows=Array.isArray(CONFIG?.notification_categories)?CONFIG.notification_categories:[];
  prefList.innerHTML='';
  if(!rows.length){prefList.innerHTML='<p class="muted">No notification categories are available yet.</p>';return;}
  for(const row of rows){
    const wrap=document.createElement('label');
    wrap.className=`prefRow ${row.available?'':'prefFuture'} ${row.eligible?'prefEligible':'prefIneligible'}`;
    const input=document.createElement('input');
    input.type='checkbox';
    input.className='prefToggle';
    input.dataset.prefKey=String(row.key||'');
    input.dataset.available=row.available?'1':'0';
    input.dataset.eligible=row.eligible?'1':'0';
    input.checked=!!row.enabled;
    input.disabled=BUSY||!row.available||!row.eligible;
    const copy=document.createElement('span');
    copy.className='prefCopy';
    const top=document.createElement('span');
    top.className='prefTop';
    const title=document.createElement('strong');
    title.textContent=String(row.label||row.key||'Notification');
    const badge=document.createElement('span');
    badge.className=`prefBadge ${row.status==='available'&&row.enabled?'on':''} ${row.status==='coming_soon'?'future':''}`;
    badge.textContent=preferenceStatusLabel(row);
    top.append(title,badge);
    const desc=document.createElement('span');
    desc.className='prefDescription';
    desc.textContent=String(row.description||'');
    const audience=document.createElement('span');
    audience.className='prefAudience';
    audience.textContent=`Audience: ${String(row.audience||'Staff')}`;
    copy.append(top,desc,audience);
    wrap.append(input,copy);
    prefList.appendChild(wrap);
  }
}

function normalizeExternalLinkForUi(item){return{label:String(item?.label||'').trim(),url:String(item?.url||item?.href||'').trim()};}
function addPersonalExternalLinkRow(item={}){
  if(!personalExternalLinksRows)return;
  const link=normalizeExternalLinkForUi(item);
  const row=document.createElement('div');
  row.className='personalExternalLinkRow';
  const label=document.createElement('input');
  label.type='text';label.maxLength=80;label.className='externalLinkInput personalExternalLabel';label.placeholder='Label';label.value=link.label;label.disabled=BUSY;
  const url=document.createElement('input');
  url.type='url';url.maxLength=2048;url.className='externalLinkInput personalExternalUrl';url.placeholder='https://example.com';url.value=link.url;url.disabled=BUSY;
  const remove=document.createElement('button');
  remove.type='button';remove.className='btn externalRemoveBtn';remove.textContent='Remove';remove.disabled=BUSY;remove.addEventListener('click',()=>row.remove());
  row.append(label,url,remove);
  personalExternalLinksRows.appendChild(row);
}
function renderDefaultExternalLinks(){
  if(!defaultExternalLinksPreview)return;
  defaultExternalLinksPreview.replaceChildren();
  const links=Array.isArray(EXTERNAL_LINK_PREFS.default_links)?EXTERNAL_LINK_PREFS.default_links:[];
  if(!links.length){const empty=document.createElement('span');empty.className='muted small';empty.textContent='No default external links are currently configured.';defaultExternalLinksPreview.appendChild(empty);return;}
  for(const item of links){const link=normalizeExternalLinkForUi(item);if(!link.label||!link.url)continue;const a=document.createElement('a');a.className='externalPreviewLink';a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${link.label} ↗`;defaultExternalLinksPreview.appendChild(a);}
}
function renderExternalLinkPreferences(){
  if(showDefaultExternalLinks)showDefaultExternalLinks.checked=EXTERNAL_LINK_PREFS.show_defaults!==false;
  renderDefaultExternalLinks();
  if(personalExternalLinksRows){personalExternalLinksRows.replaceChildren();const links=Array.isArray(EXTERNAL_LINK_PREFS.personal_links)?EXTERNAL_LINK_PREFS.personal_links:[];for(const item of links)addPersonalExternalLinkRow(item);if(!links.length)addPersonalExternalLinkRow();}
  setBusy(BUSY);
}
function collectPersonalExternalLinks(){
  const links=[];
  for(const row of personalExternalLinksRows?.querySelectorAll('.personalExternalLinkRow')||[]){
    const label=String(row.querySelector('.personalExternalLabel')?.value||'').trim().replace(/\s+/g,' ');
    const rawUrl=String(row.querySelector('.personalExternalUrl')?.value||'').trim();
    if(!label&&!rawUrl)continue;
    if(!label||!rawUrl)throw new Error('Each personal link needs both a label and a URL.');
    let parsed;try{parsed=new URL(rawUrl);}catch{throw new Error(`Invalid URL for “${label}”.`);}
    if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')throw new Error(`“${label}” must use an http:// or https:// URL.`);
    links.push({label:label.slice(0,80),url:parsed.href});
    if(links.length>=30)break;
  }
  return links;
}
async function loadExternalLinkPreferences(){
  const r=await adminFetch('/admin/user_external_links',{method:'GET'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j?.ok)throw new Error(j?.error||`external_links_http_${r.status}`);
  EXTERNAL_LINK_PREFS={show_defaults:j.show_defaults!==false,default_links:Array.isArray(j.default_links)?j.default_links:[],personal_links:Array.isArray(j.personal_links)?j.personal_links:[]};
  renderExternalLinkPreferences();
  return EXTERNAL_LINK_PREFS;
}
async function postExternalLinkPreferences(links,showDefaults){
  const r=await adminFetch('/admin/user_external_links',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({show_defaults:showDefaults!==false,links:Array.isArray(links)?links:[]})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j?.ok)throw new Error(j?.message||j?.detail||j?.error||`external_links_http_${r.status}`);
  EXTERNAL_LINK_PREFS={show_defaults:j.show_defaults!==false,default_links:Array.isArray(j.default_links)?j.default_links:EXTERNAL_LINK_PREFS.default_links,personal_links:Array.isArray(j.personal_links)?j.personal_links:links};
  return j;
}
async function savePersonalExternalLinks(){
  setBusy(true);if(externalLinksSaveOut)externalLinksSaveOut.textContent='Saving…';showNotice('');
  try{const links=collectPersonalExternalLinks();await postExternalLinkPreferences(links,showDefaultExternalLinks?.checked!==false);renderExternalLinkPreferences();if(externalLinksSaveOut)externalLinksSaveOut.textContent='Saved. Your navigation menu will use these links on every device.';}
  catch(e){if(externalLinksSaveOut)externalLinksSaveOut.textContent='';showNotice(e?.message||String(e),'bad');}
  finally{setBusy(false);}
}
async function saveDefaultExternalLinkVisibility(){
  const next=showDefaultExternalLinks?.checked!==false;
  setBusy(true);if(externalLinksSaveOut)externalLinksSaveOut.textContent='Saving…';showNotice('');
  try{await postExternalLinkPreferences(EXTERNAL_LINK_PREFS.personal_links,next);EXTERNAL_LINK_PREFS.show_defaults=next;if(externalLinksSaveOut)externalLinksSaveOut.textContent=next?'Default links will be shown with your personal links.':'Default links are hidden. Your personal links will still be shown.';}
  catch(e){if(showDefaultExternalLinks)showDefaultExternalLinks.checked=EXTERNAL_LINK_PREFS.show_defaults!==false;if(externalLinksSaveOut)externalLinksSaveOut.textContent='';showNotice(e?.message||String(e),'bad');}
  finally{setBusy(false);}
}

async function savePreference(key,enabled){
  setBusy(true);
  prefSaveOut.textContent='Saving…';
  try{
    const r=await adminFetch('/admin/push/preferences',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({preferences:{[key]:!!enabled}})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j?.ok)throw new Error(j?.error||`push_preferences_http_${r.status}`);
    if(Array.isArray(j.notification_categories))CONFIG.notification_categories=j.notification_categories;
    prefSaveOut.textContent='Saved. This preference applies to all of your enabled EagleNEST devices.';
    renderPreferences();
  }catch(e){
    prefSaveOut.textContent='';
    showNotice(e?.message||String(e),'bad');
    await loadConfig().catch(()=>{});
  }finally{setBusy(false);}
}

async function loadConfig(){
  const r=await adminFetch('/admin/push/config',{method:'GET'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j?.ok)throw new Error(j?.error||`push_config_http_${r.status}`);
  CONFIG=j;
  deanEmail.textContent=j.dean_email||'jgarcia@theamericandreamschool.org';
  if(phoneReturnRouting){phoneReturnRouting.textContent=j.phone_return_alerts_eligible?'Eligible for this account':'Ops / Hallway Monitor group only';phoneReturnRouting.classList.toggle('routeEnabled',!!j.phone_return_alerts_eligible);}
  renderPreferences();
  return j;
}

async function refreshState(){showNotice('');platformHint.textContent=platformMessage();await loadConfig();if(!supported()){CURRENT_SUB=null;deviceBadge.textContent='Unsupported';deviceBadge.className='badge bad';deviceSummary.textContent='This browser cannot receive EagleNEST push notifications.';enableBtn.hidden=true;disableBtn.hidden=true;testBtn.disabled=true;return;}await ensureRegistration();CURRENT_SUB=await REG.pushManager.getSubscription();const permission=Notification.permission;if(!CONFIG.configured){deviceBadge.textContent='Setup needed';deviceBadge.className='badge warn';deviceSummary.textContent='The Worker VAPID keys have not been configured yet.';enableBtn.hidden=false;enableBtn.disabled=true;disableBtn.hidden=true;testBtn.disabled=true;return;}if(permission==='denied'){deviceBadge.textContent='Blocked';deviceBadge.className='badge bad';deviceSummary.textContent='Notifications are blocked in this browser’s site settings.';enableBtn.hidden=false;enableBtn.disabled=true;disableBtn.hidden=!CURRENT_SUB;testBtn.disabled=true;return;}if(CURRENT_SUB){deviceBadge.textContent='Enabled';deviceBadge.className='badge ok';deviceSummary.textContent=`This device is enabled. ${Number(CONFIG.subscription_count||0)} device${Number(CONFIG.subscription_count||0)===1?'':'s'} registered to your EagleNEST email.`;enableBtn.hidden=true;disableBtn.hidden=false;testBtn.disabled=false;}else{deviceBadge.textContent=permission==='granted'?'Not registered':'Off';deviceBadge.className='badge';deviceSummary.textContent=`This device is not enabled. ${Number(CONFIG.subscription_count||0)} other device${Number(CONFIG.subscription_count||0)===1?'':'s'} currently registered to your EagleNEST email.`;enableBtn.hidden=false;enableBtn.disabled=false;disableBtn.hidden=true;testBtn.disabled=Number(CONFIG.subscription_count||0)<1;}}
async function enableNotifications(){setBusy(true);showNotice('');try{if(!CONFIG?.configured)await loadConfig();await ensureRegistration();const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error(permission==='denied'?'Notification permission was blocked. Change the site notification setting in your browser to enable it.':'Notification permission was not granted.');let sub=await REG.pushManager.getSubscription();if(!sub){sub=await REG.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64urlToUint8Array(CONFIG.vapid_public_key)});}const r=await adminFetch('/admin/push/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subscription:sub.toJSON()})});const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok)throw new Error(j?.error||`push_subscribe_http_${r.status}`);showNotice('Notifications enabled on this device.','ok');await refreshState();}catch(e){showNotice(e?.message||String(e),'bad');}finally{setBusy(false);}}
async function disableNotifications(){setBusy(true);showNotice('');try{await ensureRegistration();const sub=await REG.pushManager.getSubscription();if(sub){const r=await adminFetch('/admin/push/unsubscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})});const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok)throw new Error(j?.error||`push_unsubscribe_http_${r.status}`);await sub.unsubscribe();}showNotice('Notifications disabled on this device.','ok');await refreshState();}catch(e){showNotice(e?.message||String(e),'bad');}finally{setBusy(false);}}
async function sendTest(){setBusy(true);testOut.textContent='Sending…';try{const r=await adminFetch('/admin/push/test',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok)throw new Error(j?.delivery?.error||j?.error||`push_test_http_${r.status}`);const sent=Number(j?.delivery?.sent||0);testOut.textContent=`Sent to ${sent} enabled device${sent===1?'':'s'}.`;showNotice('Test push sent. You should receive an EagleNEST notification shortly.','ok');}catch(e){testOut.textContent='';showNotice(e?.message||String(e),'bad');}finally{setBusy(false);}}
async function boot(){enableBtn.addEventListener('click',enableNotifications);disableBtn.addEventListener('click',disableNotifications);refreshBtn.addEventListener('click',()=>{setBusy(true);refreshState().catch(e=>showNotice(e?.message||e,'bad')).finally(()=>setBusy(false));});testBtn.addEventListener('click',sendTest);prefList?.addEventListener('change',(ev)=>{const el=ev.target?.closest?.('.prefToggle');if(!el)return;savePreference(String(el.dataset.prefKey||''),!!el.checked);});addPersonalExternalLinkBtn?.addEventListener('click',()=>addPersonalExternalLinkRow());savePersonalExternalLinksBtn?.addEventListener('click',savePersonalExternalLinks);showDefaultExternalLinks?.addEventListener('change',saveDefaultExternalLinkVisibility);ACCESS=await getAccess();if(!ACCESS){loginOut.textContent='Please sign in.';const gsi=await waitForGoogle();gsi.initialize({client_id:GOOGLE_CLIENT_ID,ux_mode:'popup',callback:async(resp)=>{try{loginOut.textContent='Signing in…';await doLogin(resp.credential);location.reload();}catch(e){loginOut.textContent=`Login failed: ${e.message||e}`;}}});gsi.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return;}if(!ACCESS?.can?.notifications&&!ACCESS?.can?.teacher_attendance&&!ACCESS?.can?.admin)throw new Error('forbidden');loginCard.hidden=true;app.hidden=false;viewerPill.textContent=ACCESS.email||'Staff';await Promise.all([refreshState(),loadExternalLinkPreferences()]);}
boot().catch(e=>{loginOut.textContent=String(e?.message||e);showNotice(e?.message||e,'bad');});

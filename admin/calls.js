// EAGLENEST_CALLS_LIVE_WORKSPACE_V1
const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const GOOGLE_CLIENT_ID=document.querySelector('meta[name="google-client-id"]')?.content||'';
const SID_KEYS=['ss_admin_session_sid_v1','notifications_admin_session_v1','admin_session_v1','admin_session_sid'];
const SESSION_HEADER='x-admin-session',DRAFT_PREFIX='eaglenest_call_note_draft_v1:',CLIENT_KEY='eaglenest_calls_live_client_v1';
const $=id=>document.getElementById(id);
let ACCESS=null,CONFIG=null,HISTORY={rows:[]},LIVE={active_calls:[]},LAST=new Map(),ENDED=[],ABORT=null,MODAL=null,MODAL_KIND='';
const LIVE_HISTORY=new Map(),LIVE_HISTORY_PENDING=new Set(); // EAGLENEST_LIVE_CALLER_HISTORY_V1
let HISTORY_LOADING=false; // EAGLENEST_CALLS_HISTORY_LOAD_GUARD_V1

function sid(){try{for(const k of SID_KEYS){const v=String(sessionStorage.getItem(k)||localStorage.getItem(k)||'').trim();if(v)return v}}catch{}return ''}
function stash(r){try{const v=String(r.headers.get(SESSION_HEADER)||r.headers.get('X-Admin-Session')||'').trim();if(v)for(const k of SID_KEYS){sessionStorage.setItem(k,v);localStorage.setItem(k,v)}}catch{}}
async function api(path,init={}){const h=new Headers(init.headers||{}),s=sid();if(s)h.set(SESSION_HEADER,s);const r=await fetch(new URL(path,API_BASE),{...init,headers:h,credentials:'include',cache:'no-store'});stash(r);return r}
const norm=v=>String(v||'').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dirLabel(v){return v==='incoming'?'Incoming':v==='outgoing'?'Outgoing':v==='internal'?'Internal':'Unknown'}
function fmtDate(v){const s=norm(v);if(!s)return'—';const d=new Date(s.includes('T')?s:s.replace(' ','T'));return Number.isFinite(d.getTime())?d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):s}
function fmtClock(sec){const n=Math.max(0,Math.floor(Number(sec||0))),m=Math.floor(n/60),s=n%60;return`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
// EAGLENEST_CALLS_LIVE_TIMER_V2
// Live calls use the Worker's timezone-safe first-seen ISO anchor.
function elapsed(c){const s=norm(c.live_started_at||c.started_at||c.start_local);if(!s)return Number(c.billsec_sec||c.duration_sec||0);const d=new Date(s.includes('T')?s:s.replace(' ','T'));return Number.isFinite(d.getTime())?Math.max(0,(Date.now()-d.getTime())/1000):Number(c.billsec_sec||c.duration_sec||0)}
function matches(c){return Array.isArray(c.matches)?c.matches:(Array.isArray(c.contact_matches)?c.contact_matches:[])}
function contactLabel(m){return[m.name,m.relationship].map(norm).filter(Boolean).join(' • ')||'Matched family contact'}
function students(c){const out=[],seen=new Set();for(const m of matches(c)){const n=norm(m.student_number);if(n&&!seen.has(n)){seen.add(n);out.push(m)}}return out}
function studentUrl(m){const u=new URL('./student_view.html',location.href);u.searchParams.set('osis',norm(m.student_number));u.searchParams.set('source','calls_workspace');return u.href}
function idOf(c,kind){return`${kind}:${kind==='live'?norm(c.call_id):norm(c.call_key)}`}
function draft(c,k){try{return localStorage.getItem(DRAFT_PREFIX+idOf(c,k))||''}catch{return''}}
function putDraft(c,k,v){try{const key=DRAFT_PREFIX+idOf(c,k);v?localStorage.setItem(key,String(v).slice(0,4000)):localStorage.removeItem(key)}catch{}}
function endpointList(rows){return(Array.isArray(rows)?rows:[]).map(x=>[x.name,x.extension?`Ext. ${x.extension}`:''].map(norm).filter(Boolean).join(' • ')).filter(Boolean).join(', ')}
function route(c){const d=norm(c.direction).toLowerCase();if(d==='internal'){const a=[c.src_name,c.src_extension?`Ext. ${c.src_extension}`:''].map(norm).filter(Boolean).join(' • ')||'Internal extension',b=[c.dst_name,c.dst_extension?`Ext. ${c.dst_extension}`:''].map(norm).filter(Boolean).join(' • ')||'Internal extension';return`${a} → ${b}`}const m=matches(c)[0],outside=m?contactLabel(m):((c.phone_last4||c.external_phone_last4)?`External ••••${c.phone_last4||c.external_phone_last4}`:'External caller'),staff=[c.staff_name,c.staff_extension?`Ext. ${c.staff_extension}`:''].map(norm).filter(Boolean).join(' • ')||'School phone';return d==='outgoing'?`${staff} → ${outside}`:`${outside} → ${staff}`}
function statusLine(c){const a=endpointList(c.connected_endpoints),b=endpointList(c.ringing_endpoints);return a?`Connected: ${a}`:(b?`Ringing: ${b}`:'')}
function badgeHtml(c){const d=norm(c.direction).toLowerCase();return`<div class="badges"><span class="badge ${esc(d)}">${esc(dirLabel(d))}</span>${c.campus?`<span class="badge">${esc(c.campus)}</span>`:''}${c.front_office_call?'<span class="badge office">Front Office</span>':''}</div>`}

function renderScope(){const p=CONFIG?.preferences||{},a=[];if(p.scope==='my_extension'&&CONFIG?.my_extension)a.push(`My extension ${CONFIG.my_extension}`);if(p.scope==='campus')a.push((p.campuses||[]).join(', ')||'Selected campus');if(p.scope==='all')a.push('All calls');if(CONFIG?.office_staff_campuses?.length)a.push(`${CONFIG.office_staff_campuses.join(', ')} front office`);$('scopeSummary').textContent=(a.length?a.join(' + '):'Calls')+'. Live and recent calls follow My Settings.';$('viewerPill').textContent=[ACCESS?.email,CONFIG?.my_extension?`Ext. ${CONFIG.my_extension}`:''].filter(Boolean).join(' • ')}

function canSeeLiveCallerHistory(){
  return CONFIG?.admin_like===true || (Array.isArray(CONFIG?.office_staff_campuses) && CONFIG.office_staff_campuses.length>0);
}
function historyStaffLabel(row){
  const d=norm(row?.direction).toLowerCase();
  if(d==='outgoing') return norm(row?.src_label||row?.staff_label)||(row?.src_extension?`Ext. ${row.src_extension}`:'School extension unavailable');
  if(d==='incoming'){
    if(!row?.answered) return 'No answer at school';
    return norm(row?.dst_label||row?.staff_label)||(row?.dst_extension?`Ext. ${row.dst_extension}`:'School phone');
  }
  return 'School phone';
}
function liveCallerHistoryHtml(call){
  if(!canSeeLiveCallerHistory() || norm(call?.direction).toLowerCase()==='internal') return '';
  const key=norm(call?.call_id),data=LIVE_HISTORY.get(key);
  if(!data){
    return `<div class="callerHistory loading"><div class="callerHistoryTitle">Recent with this number</div><div class="callerHistoryEmpty">Loading recent call history…</div></div>`;
  }
  if(data.error){
    return `<div class="callerHistory"><div class="callerHistoryTitle">Recent with this number</div><div class="callerHistoryEmpty">Recent history unavailable right now.</div></div>`;
  }
  const rows=Array.isArray(data.rows)?data.rows:[];
  const lastSchoolCall=rows.find(r=>norm(r.direction).toLowerCase()==='outgoing');
  const lastSchoolHtml=lastSchoolCall
    ? `<div class="lastSchoolCall"><strong>Most recent school call:</strong><span>${esc(fmtDate(lastSchoolCall.start_local))} • ${esc(historyStaffLabel(lastSchoolCall))} • ${fmtClock(lastSchoolCall.billsec_sec||lastSchoolCall.duration_sec||0)}</span></div>`
    : `<div class="lastSchoolCall"><strong>Most recent school call:</strong><span>No outgoing call found in the last ${Number(data.days||30)} days.</span></div>`;
  const rowsHtml=rows.length
    ? rows.map(r=>`<div class="callerHistoryRow"><span>${esc(fmtDate(r.start_local))}</span><strong>${esc(dirLabel(norm(r.direction).toLowerCase()))}</strong><span>${esc(historyStaffLabel(r))}</span><span>${fmtClock(r.billsec_sec||r.duration_sec||0)}</span></div>`).join('')
    : `<div class="callerHistoryEmpty">No prior calls with this number in the last ${Number(data.days||30)} days.</div>`;
  return `<div class="callerHistory">${lastSchoolHtml}<details><summary>Recent with this number${rows.length?` (${rows.length})`:''}</summary><div class="callerHistoryRows">${rowsHtml}</div></details></div>`;
}
async function loadLiveCallerHistory(call){
  const id=norm(call?.call_id);
  if(!id || norm(call?.direction).toLowerCase()==='internal' || !canSeeLiveCallerHistory()) return;
  if(LIVE_HISTORY.has(id)||LIVE_HISTORY_PENDING.has(id)) return;
  LIVE_HISTORY_PENDING.add(id);
  try{
    const r=await api(`/admin/integrations/grandstream/live/history?call_id=${encodeURIComponent(id)}`);
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok) throw new Error(j.error||`history_http_${r.status}`);
    LIVE_HISTORY.set(id,j);
  }catch(e){
    LIVE_HISTORY.set(id,{error:String(e?.message||e)});
  }finally{
    LIVE_HISTORY_PENDING.delete(id);
    if((LIVE.active_calls||[]).some(c=>norm(c.call_id)===id)) renderLive();
  }
}
function hydrateLiveCallerHistory(calls){
  if(!canSeeLiveCallerHistory()) return;
  for(const call of calls||[]) loadLiveCallerHistory(call);
  const active=new Set((calls||[]).map(c=>norm(c.call_id)).filter(Boolean));
  for(const key of [...LIVE_HISTORY.keys()]) if(!active.has(key)) LIVE_HISTORY.delete(key);
}

function renderLive(){
  const calls=LIVE.active_calls||[];
  $('liveCount').textContent=calls.length;
  const el=$('liveCalls');
  if(!calls.length){
    el.innerHTML='<div class="panel empty">No active calls right now.</div>';
    return;
  }
  hydrateLiveCallerHistory(calls);
  el.innerHTML=calls.map(c=>{
    const st=norm(c.state).toLowerCase(),ss=students(c),can=ss.length&&norm(c.direction).toLowerCase()!=='internal',dr=draft(c,'live');
    return `<article class="panel liveCard ${esc(st)}">
      <div class="callTop">
        <div>
          <div class="callTitle"><span class="pulse"></span>${esc(st==='connected'?'CONNECTED':st==='ringing'?'RINGING':'ACTIVE')} • ${esc(route(c))}</div>
          <div class="muted">${esc(fmtDate(c.live_started_at||c.started_at))}</div>
        </div>
        <div class="timer" data-timer="${esc(c.call_id)}">${fmtClock(elapsed(c))}</div>
      </div>
      ${badgeHtml(c)}
      <div class="route">${esc(route(c))}</div>
      ${statusLine(c)?`<div class="endpoint">${esc(statusLine(c))}</div>`:''}
      ${ss.slice(0,3).map(m=>`<div class="contact"><div><strong>${esc(contactLabel(m))}</strong><span class="muted">${esc(m.student_name||'Student')} • OSIS ${esc(m.student_number)}</span></div><a class="btn small" href="${esc(studentUrl(m))}">Open Student</a></div>`).join('')}
      ${liveCallerHistoryHtml(c)}
      <div class="actions">${can?`<button class="btn primary" data-note-live="${esc(c.call_id)}">${dr?'Continue Notes':'Start Notes'}</button>`:''}${dr?'<span class="draft">Draft saved</span>':''}</div>
    </article>`;
  }).join('');
  for(const b of el.querySelectorAll('[data-note-live]')) b.onclick=()=>{
    const c=calls.find(x=>x.call_id===b.dataset.noteLive);
    if(c) openNotes(c,'live');
  };
}
function endedRow(c){return{...c,_ended:true,answered:c.state==='connected'||(c.connected_endpoints||[]).length>0,start_local:c.live_started_at||c.started_at,billsec_sec:elapsed(c)}}
function renderRecent(){const q=norm($('searchInput').value).toLowerCase(),hist=HISTORY.rows||[];let rows=[...ENDED.map(endedRow),...hist];if(q)rows=rows.filter(c=>JSON.stringify({route:route(c),campus:c.campus,matches:matches(c)}).toLowerCase().includes(q));const el=$('recentCalls');if(!rows.length){el.innerHTML='<div class="panel empty">No recent calls in this view.</div>';return}el.innerHTML=rows.slice(0,180).map(c=>{const kind=c._ended?'live':'history',ss=students(c),can=ss.length&&norm(c.direction).toLowerCase()!=='internal';return`<article class="panel recentCard ${c._ended?'syncing':''}"><div class="recentRow"><div><div class="recentTitleText">${esc(route(c))}</div><div class="recentMeta">${esc(fmtDate(c.start_local||c.started_at))} • ${esc(dirLabel(norm(c.direction).toLowerCase()))} • ${fmtClock(c.billsec_sec||c.duration_sec||0)}${c._ended?' • syncing to PBX history':''}</div>${statusLine(c)?`<div class="endpoint">${esc(statusLine(c))}</div>`:''}</div><div class="actions">${ss[0]?`<a class="btn small" href="${esc(studentUrl(ss[0]))}">Open Student</a>`:''}${can?`<button class="btn small primary" data-note="${esc(kind==='live'?c.call_id:c.call_key)}" data-kind="${kind}">Log Communication</button>`:''}</div></div></article>`}).join('');for(const b of el.querySelectorAll('[data-note]'))b.onclick=()=>{const c=b.dataset.kind==='live'?ENDED.find(x=>x.call_id===b.dataset.note):hist.find(x=>x.call_key===b.dataset.note);if(c)openNotes(c,b.dataset.kind)}}
function renderAll(){renderLive();renderRecent();renderScope()}
function tick(){for(const e of document.querySelectorAll('[data-timer]')){const c=(LIVE.active_calls||[]).find(x=>x.call_id===e.dataset.timer);if(c)e.textContent=fmtClock(elapsed(c))}}

function openNotes(c,kind){const ss=students(c);if(!ss.length)return;MODAL=c;MODAL_KIND=kind;$('noteCallSummary').textContent=`${dirLabel(c.direction)} • ${c.campus||'Campus not resolved'} • ${route(c)}`;$('noteStudent').replaceChildren(...ss.map(m=>new Option(`${m.student_name||m.student_number} • OSIS ${m.student_number}`,m.student_number)));$('noteStudent').onchange=fillContacts;fillContacts();$('noteOutcome').value=(c.state==='connected'||c.answered)?'Spoke/Connected':'No Answer';$('noteText').value=draft(c,kind);$('noteOut').textContent='';$('noteBackdrop').hidden=false;$('noteText').focus()}
function fillContacts(){const n=$('noteStudent').value,rows=matches(MODAL).filter(m=>norm(m.student_number)===n);$('noteContact').replaceChildren(...rows.map(m=>new Option(contactLabel(m),JSON.stringify(m))))}
function closeNotes(){if(MODAL)putDraft(MODAL,MODAL_KIND,$('noteText').value);$('noteBackdrop').hidden=true;MODAL=null;MODAL_KIND=''}
async function saveCommunication(){if(!MODAL)return;const notes=norm($('noteText').value);if(!notes){$('noteOut').textContent='Write a note before saving.';return}let m={};try{m=JSON.parse($('noteContact').value||'{}')}catch{}const seconds=Math.max(0,Math.round(MODAL.billsec_sec||MODAL.duration_sec||(MODAL_KIND==='live'?elapsed(MODAL):0))),mins=Math.floor(seconds/60),secs=seconds%60,context=[`${dirLabel(norm(MODAL.direction).toLowerCase())} phone call`,MODAL.campus,seconds?`Duration ${mins}m ${secs}s`:''].filter(Boolean).join(' • ');const body={student_number:m.student_number||$('noteStudent').value,student_name:m.student_name||'',contact_assoc_id:m.contact_assoc_id||'',person_id:m.person_id||'',contact_display_name:m.name||'',contact_relationship:m.relationship||'',method:'Phone',direction:norm(MODAL.direction).toLowerCase()==='incoming'?'Incoming':(norm(MODAL.direction).toLowerCase()==='outgoing'?'Outgoing':'Two-way'),category:'General',outcome:$('noteOutcome').value,notes:`${context}\n\n${notes}`,source:'phone_dashboard'};$('saveNote').disabled=true;$('noteOut').textContent='Saving communication…';try{const r=await api('/admin/communications/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`);putDraft(MODAL,MODAL_KIND,'');$('noteOut').textContent='✓ Communication logged.';setTimeout(closeNotes,500)}catch(e){$('noteOut').textContent=`Could not save: ${e.message||e}`}finally{$('saveNote').disabled=false}}

function captureEnded(next){
  const map=new Map((next||[]).map(c=>[c.call_id,c]));
  let changed=false;
  for(const[id,c]of LAST){
    if(!map.has(id)&&!ENDED.some(x=>x.call_id===id)){
      ENDED.unshift({...c,_ended_at:new Date().toISOString()});
      changed=true;
    }
  }
  ENDED=ENDED.slice(0,25);
  LAST=map;
  return changed;
}
function clientId(){try{let x=sessionStorage.getItem(CLIENT_KEY);if(/^tab-[A-Za-z0-9_-]{8,80}$/.test(x||''))return x;x='tab-'+crypto.randomUUID().replace(/-/g,'').slice(0,24);sessionStorage.setItem(CLIENT_KEY,x);return x}catch{return'tab-'+Date.now().toString(36)+'calls'}}
function liveStatus(t,s=''){$('liveStatus').textContent=t;$('liveStatus').dataset.state=s}
async function connectLive(){if(ABORT)ABORT.abort();ABORT=new AbortController();liveStatus('● Connecting');try{const r=await api(`/admin/integrations/grandstream/live/stream?client_id=${encodeURIComponent(clientId())}`,{signal:ABORT.signal});if(!r.ok||!r.body)throw new Error(`live_http_${r.status}`);liveStatus('● Live','live');const reader=r.body.getReader(),dec=new TextDecoder();let buf='';while(true){const{value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let n;while((n=buf.indexOf('\n'))>=0){const line=buf.slice(0,n).trim();buf=buf.slice(n+1);if(!line)continue;let j;try{j=JSON.parse(line)}catch{continue}if(j.type==='snapshot'){const rows=j.active_calls||[];const recentChanged=captureEnded(rows);LIVE=j;renderLive();if(recentChanged)renderRecent()}}}throw new Error('live_stream_closed')}catch(e){if(e.name==='AbortError')return;liveStatus('● Reconnecting','error');setTimeout(connectLive,2500)}}
async function loadConfig(){const r=await api('/admin/calls/config'),j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||`config_http_${r.status}`);CONFIG=j;renderScope()}
async function loadHistory(show=true){
  if(HISTORY_LOADING)return;
  HISTORY_LOADING=true;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await api(`/admin/calls/list?days=${encodeURIComponent($('daysSelect').value||'1')}&limit=300`,{signal:controller.signal});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok)throw new Error(j.error||`history_http_${r.status}`);
    HISTORY=j;
    renderRecent();
  }catch(e){
    if(show&&e?.name!=='AbortError'){
      $('errorBox').textContent=e.message||e;
      $('errorBox').hidden=false;
    }
  }finally{
    clearTimeout(timeout);
    HISTORY_LOADING=false;
  }
}
async function getAccess(){const r=await api('/admin/access'),j=await r.json().catch(()=>null);return r.ok&&j?.ok?j:null}
async function waitGoogle(){for(let i=0;i<160;i++){if(window.google?.accounts?.id)return google.accounts.id;await new Promise(r=>setTimeout(r,50))}throw new Error('Google sign-in failed to load')}
async function login(token){const r=await api('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:token}).toString()}),j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`)}
async function boot(){ACCESS=await getAccess();if(!ACCESS){$('loginOut').textContent='Please sign in.';const g=await waitGoogle();g.initialize({client_id:GOOGLE_CLIENT_ID,ux_mode:'popup',callback:async r=>{try{await login(r.credential);location.reload()}catch(e){$('loginOut').textContent=e.message||e}}});g.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return}if(!ACCESS.can?.phone_dashboard)throw new Error('phone_dashboard_extension_or_office_access_required');$('loginCard').hidden=true;$('app').hidden=false;$('daysSelect').onchange=()=>loadHistory();$('searchInput').oninput=renderRecent;$('closeNote').onclick=closeNotes;$('noteBackdrop').onclick=e=>{if(e.target===$('noteBackdrop'))closeNotes()};$('noteText').oninput=()=>{if(MODAL)putDraft(MODAL,MODAL_KIND,$('noteText').value)};$('clearNote').onclick=()=>{if(MODAL){$('noteText').value='';putDraft(MODAL,MODAL_KIND,'')}};$('saveNote').onclick=saveCommunication;await Promise.all([loadConfig(),loadHistory()]);connectLive();setInterval(tick,1000);setInterval(()=>loadHistory(false),30000)}
window.addEventListener('beforeunload',()=>{try{ABORT?.abort()}catch{}});
boot().catch(e=>{$('loginOut').textContent=String(e.message||e);$('errorBox').textContent=e.message||e;$('errorBox').hidden=false});

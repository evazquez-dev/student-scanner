// EAGLENEST_GRANDSTREAM_NATIVE_CANARY_PROMOTION_PAGE_V2
const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const GOOGLE_CLIENT_ID=document.querySelector('meta[name="google-client-id"]')?.content||'';
const SID_KEYS=['ss_admin_session_sid_v1','notifications_admin_session_v1','admin_session_v1','admin_session_sid'],SESSION_HEADER='x-admin-session';
const REPORT_KEY='eaglenest_native_canary_promotion_soak_v2',SAMPLE_MS=5000,FRESH_MS=35000,GAP_MS=15000;
const $=id=>document.getElementById(id),norm=v=>String(v??'').trim(),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let REPORT=null,mismatch={key:'',count:0,confirmed:false,index:-1},lastTickMs=0;
const S={global:{status:null,calls:[],last:0,snap:0,ctl:null,transitions:[],lastSig:''},native:{status:null,calls:[],last:0,snap:0,ctl:null,transitions:[],lastSig:''}};

function sid(){try{for(const k of SID_KEYS){const v=norm(sessionStorage.getItem(k)||localStorage.getItem(k));if(v)return v}}catch{}return''}
function stash(r){try{const v=norm(r.headers.get(SESSION_HEADER));if(v)for(const k of SID_KEYS){sessionStorage.setItem(k,v);localStorage.setItem(k,v)}}catch{}}
async function api(p,i={}){const h=new Headers(i.headers||{}),s=sid();if(s)h.set(SESSION_HEADER,s);const r=await fetch(new URL(p,API_BASE),{...i,headers:h,credentials:'include',cache:'no-store'});stash(r);return r}
async function access(){const r=await api('/admin/access'),j=await r.json().catch(()=>null);return r.ok&&j?.ok?j:null}
async function waitGoogle(){for(let i=0;i<160;i++){if(window.google?.accounts?.id)return google.accounts.id;await new Promise(r=>setTimeout(r,50))}throw Error('Google sign-in failed to load')}
async function login(t){const r=await api('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:t})}),j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw Error(j.error||`HTTP ${r.status}`)}

function blank(){const now=Date.now();return{v:2,started_at_iso:new Date(now).toISOString(),samples:0,comparable:0,matching:0,stale:0,active_samples:0,max_calls:0,events:[],markers:[],gaps:[],total_gap_ms:0,longest_gap_ms:0,base:{global:null,native:null},latest:{global:null,native:null}}}
function load(){try{const x=JSON.parse(localStorage.getItem(REPORT_KEY)||'null');if(x?.v===2)return x}catch{}return blank()}
function save(){try{localStorage.setItem(REPORT_KEY,JSON.stringify(REPORT))}catch{}}
function safeStatus(s){const w=s?.websocket_diagnostics||{};return{mode:norm(s?.mode),pbx:s?.pbx_connected===true,ws:s?.websocket_connected===true,engine:s?.engine_started===true,transport:norm(s?.transport_profile),reconcile:Number(s?.native_canary_reconciliation_failure_count||0),unexpected:Number(w.unexpected_disconnects||0),reconnect:Number(w.reconnect_attempts||0),fallback:Number(w.polling_fallbacks||0),last_error:norm(s?.last_error),last_message:norm(w.last_message_at_iso),last_disconnect_reason:norm(w.last_disconnect_reason)}}
function baseline(p){if(S[p].status&&!REPORT.base[p])REPORT.base[p]=safeStatus(S[p].status)}
function d(p,k){return Math.max(0,Number(REPORT.latest[p]?.[k]||0)-Number(REPORT.base[p]?.[k]||0))}
function eps(a){return(Array.isArray(a)?a:[]).map(x=>norm(x?.extension)).filter(Boolean).sort().join(',')}
function sig(c){return[norm(c?.direction),norm(c?.state),norm(c?.src_extension),norm(c?.dst_extension),norm(c?.staff_extension),norm(c?.campus),c?.front_office_call===true?'office':'',c?.transfer_consult===true?'consult':'',`r:${eps(c?.ringing_endpoints)}`,`c:${eps(c?.connected_endpoints)}`].join('|')}
function calls(p){return(S[p].calls||[]).map(sig).sort()}
function safeCall(c){return{call_id:norm(c?.call_id),direction:norm(c?.direction),state:norm(c?.state),src_extension:norm(c?.src_extension),dst_extension:norm(c?.dst_extension),staff_extension:norm(c?.staff_extension),extensions:(Array.isArray(c?.extensions)?c.extensions:[]).map(norm).filter(Boolean).sort(),campus:norm(c?.campus),front_office_call:c?.front_office_call===true,transfer_consult:c?.transfer_consult===true,ringing_endpoints:eps(c?.ringing_endpoints),connected_endpoints:eps(c?.connected_endpoints),started_at:norm(c?.started_at),live_started_at:norm(c?.live_started_at),pbx_started_at:norm(c?.pbx_started_at),channel_count:Number(c?.channel_count||0)}}
function fresh(p){return Date.now()-S[p].last<=FRESH_MS}
function equal(){const a=calls('global'),b=calls('native');return a.length===b.length&&a.every((x,i)=>x===b[i])}
function pair(c){const a=norm(c?.src_extension),b=norm(c?.dst_extension);return a&&b?[a,b].sort().join('|'):''}
function classify(){
  const g=(S.global.calls||[]).map(safeCall),n=(S.native.calls||[]).map(safeCall);
  const gNon=g.filter(x=>x.direction!=='internal').map(x=>[x.direction,x.state,x.src_extension,x.dst_extension,x.staff_extension,x.campus,x.ringing_endpoints,x.connected_endpoints].join('|')).sort();
  const nNon=n.filter(x=>x.direction!=='internal').map(x=>[x.direction,x.state,x.src_extension,x.dst_extension,x.staff_extension,x.campus,x.ringing_endpoints,x.connected_endpoints].join('|')).sort();
  const gi=g.filter(x=>x.direction==='internal'),ni=n.filter(x=>x.direction==='internal');
  if(JSON.stringify(gNon)===JSON.stringify(nNon)&&gi.length===ni.length&&gi.length){
    const used=new Set();let reversed=true;
    for(const a of gi){let found=-1;for(let i=0;i<ni.length;i++){if(used.has(i))continue;const b=ni[i];if(pair(a)===pair(b)&&a.state===b.state){found=i;if(!(a.src_extension===b.dst_extension&&a.dst_extension===b.src_extension))reversed=false;break}}if(found<0){reversed=false;break}used.add(found)}
    if(reversed)return'internal_orientation';
  }
  if(g.length!==n.length||(!g.length&&n.length)||(g.length&&!n.length))return'presence';
  const gEndpoints=g.map(x=>[x.direction,pair(x),x.src_extension,x.dst_extension].join('|')).sort();
  const nEndpoints=n.map(x=>[x.direction,pair(x),x.src_extension,x.dst_extension].join('|')).sort();
  if(JSON.stringify(gEndpoints)===JSON.stringify(nEndpoints))return'state_or_endpoint_detail';
  return'mixed';
}
function recordTransition(p){
  const key=JSON.stringify(calls(p));if(key===S[p].lastSig)return;S[p].lastSig=key;
  S[p].transitions.push({at_iso:new Date().toISOString(),calls:(S[p].calls||[]).map(safeCall)});
  if(S[p].transitions.length>80)S[p].transitions.splice(0,S[p].transitions.length-80);
}
function recentMarker(){const now=Date.now();return[...(REPORT.markers||[])].reverse().find(m=>now-Date.parse(m.at_iso)<=120000)||null}
async function diag(p){const r=await api(`/admin/integrations/grandstream/live/canary_compare/snapshot?profile=${encodeURIComponent(p)}`),j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw Error(j.error||`HTTP ${r.status}`);return j}
async function captureEvidence(index){
  const e=REPORT.events[index];if(!e)return;
  try{
    const [g,n]=await Promise.all([diag('global'),diag('native')]);
    e.evidence={captured_at_iso:new Date().toISOString(),global:g,native:n};
  }catch(err){e.evidence_error=norm(err?.message||err)}
  save();render();
}
function closeMismatch(){if(mismatch.confirmed&&mismatch.index>=0){const e=REPORT.events[mismatch.index];if(e&&!e.resolved_at_iso)e.resolved_at_iso=new Date().toISOString()}mismatch={key:'',count:0,confirmed:false,index:-1}}

function recordGap(now){
  if(!lastTickMs){lastTickMs=now;return}
  const delta=now-lastTickMs;lastTickMs=now;
  if(delta<=GAP_MS)return;
  const gap=Math.max(0,delta-SAMPLE_MS);
  REPORT.total_gap_ms+=gap;REPORT.longest_gap_ms=Math.max(REPORT.longest_gap_ms,gap);
  REPORT.gaps.push({resumed_at_iso:new Date(now).toISOString(),gap_ms:gap});
  if(REPORT.gaps.length>50)REPORT.gaps.shift();
}
function sample(){
  const now=Date.now();recordGap(now);REPORT.samples++;
  for(const p of ['global','native']){baseline(p);if(S[p].status)REPORT.latest[p]=safeStatus(S[p].status)}
  if(!(fresh('global')&&fresh('native')&&S.global.snap&&S.native.snap)){REPORT.stale++;save();render();return}
  REPORT.comparable++;
  const n=Math.max(calls('global').length,calls('native').length);REPORT.max_calls=Math.max(REPORT.max_calls,n);if(n)REPORT.active_samples++;
  if(equal()){REPORT.matching++;closeMismatch()}
  else{
    const key=JSON.stringify([calls('global'),calls('native')]);
    if(mismatch.key===key)mismatch.count++;else{closeMismatch();mismatch={key,count:1,confirmed:false,index:-1}}
    if(mismatch.count>=2&&!mismatch.confirmed){
      const event={confirmed_at_iso:new Date().toISOString(),resolved_at_iso:'',classification:classify(),global:calls('global'),native:calls('native'),global_detail:(S.global.calls||[]).map(safeCall),native_detail:(S.native.calls||[]).map(safeCall),recent_transitions:{global:S.global.transitions.slice(-8),native:S.native.transitions.slice(-8)},marker:recentMarker()};
      REPORT.events.push(event);if(REPORT.events.length>100)REPORT.events.shift();mismatch.confirmed=true;mismatch.index=REPORT.events.length-1;captureEvidence(mismatch.index);
    }
  }
  save();render();
}

function cid(p){const k='eaglenest_canary_v2_'+p;try{let v=sessionStorage.getItem(k);if(!/^tab-[A-Za-z0-9_-]{8,80}$/.test(v||'')){v=`tab-canary2-${p}-${crypto.randomUUID().replace(/-/g,'').slice(0,18)}`;sessionStorage.setItem(k,v)}return v}catch{return`tab-canary2-${p}-fallback12345`}}
async function connect(p){try{S[p].ctl?.abort()}catch{}const ctl=new AbortController();S[p].ctl=ctl;try{const r=await api(`/admin/integrations/grandstream/live/canary_compare/stream?profile=${p}&client_id=${encodeURIComponent(cid(p))}`,{signal:ctl.signal});if(!r.ok)throw Error((await r.json().catch(()=>({}))).error||`HTTP ${r.status}`);const reader=r.body.getReader(),dec=new TextDecoder();let b='';while(true){const x=await reader.read();if(x.done)break;b+=dec.decode(x.value,{stream:true});let i;while((i=b.indexOf('\n'))>=0){const line=b.slice(0,i).trim();b=b.slice(i+1);if(!line)continue;let m;try{m=JSON.parse(line)}catch{continue}S[p].last=Date.now();S[p].status=m.status||S[p].status;if(Array.isArray(m.active_calls)){S[p].calls=m.active_calls;S[p].snap=Date.now();recordTransition(p)}baseline(p);render()}}if(!ctl.signal.aborted)throw Error('stream_ended')}catch(e){if(!ctl.signal.aborted){setError(`${p}: ${e.message||e}`);setTimeout(()=>connect(p),3000)}}}

function fmt(ms){const s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`}
function ratio(a,b){return b?`${(100*a/b).toFixed(2)}%`:'—'}
function observation(){const elapsed=Math.max(1,Date.now()-Date.parse(REPORT.started_at_iso)),expected=Math.max(1,Math.floor(elapsed/SAMPLE_MS));return{elapsed,expected,coverage:Math.min(1,REPORT.samples/expected)}}
function health(p){const s=S[p].status||{};return fresh(p)&&s.pbx_connected===true&&(p==='global'||s.websocket_connected===true)}
function classCounts(){const out={};for(const e of REPORT.events||[])out[e.classification||'unknown']=(out[e.classification||'unknown']||0)+1;return out}
function promote(){
  const mins=(Date.now()-Date.parse(REPORT.started_at_iso))/60000,availability=REPORT.samples?REPORT.comparable/REPORT.samples:0,obs=observation();
  const nativeOk=health('native')&&S.native.status?.transport_profile==='native_ws_v1',globalOk=health('global'),events=REPORT.events.length;
  const checks=[
    ['Minimum soak',mins>=60&&REPORT.comparable>=100,`${mins.toFixed(0)} min / ${REPORT.comparable} comparable`,'critical'],
    ['Both engines healthy',nativeOk&&globalOk,`GLOBAL ${globalOk} / Native ${nativeOk}`,'critical'],
    ['Stream comparability',availability>=.95,ratio(REPORT.comparable,REPORT.samples),'critical'],
    ['Browser observation coverage',obs.coverage>=.85,`${(obs.coverage*100).toFixed(1)}% · longest gap ${fmt(REPORT.longest_gap_ms)}`,'review'],
    ['Semantic agreement',events===0,`${events} confirmed mismatch event(s)`,'critical'],
    ['Live call coverage',REPORT.active_samples>=5,`${REPORT.active_samples} active samples`,'critical'],
    ['Native unexpected disconnects',d('native','unexpected')===0,`Δ ${d('native','unexpected')}`,'review'],
    ['Native reconciliation failures',d('native','reconcile')===0,`Δ ${d('native','reconcile')}`,'review']
  ];
  let state='INCOMPLETE',why='Keep the page open through the comparison window.';
  if(mins>=60&&REPORT.comparable>=100&&REPORT.active_samples>=5){
    if(checks.some(c=>c[3]==='critical'&&!c[1])){state='FAIL';why='A promotion-critical check failed.'}
    else if(checks.some(c=>c[3]==='review'&&!c[1])){state='REVIEW';why='Core call semantics pass, but observation/recovery evidence needs review.'}
    else{state='PASS';why='Native and GLOBAL agree with a clean observed soak.'}
  }
  return{state,why,checks};
}
function rows(p){const s=S[p].status||{},v=[['Transport',s.transport_profile||'—'],['Mode',s.mode||'—'],['PBX connected',String(s.pbx_connected===true)],['WebSocket',String(s.websocket_connected===true)],['Engine started',String(s.engine_started===true)],['Active calls',String(S[p].calls.length)],['Last event',s.last_event_at_iso||'—'],['Last error',s.last_error||'—'],['Unexpected disconnect Δ',String(d(p,'unexpected'))],['Reconnect attempt Δ',String(d(p,'reconnect'))],['Polling fallback Δ',String(d(p,'fallback'))],['Reconcile failure Δ',String(d(p,'reconcile'))]];return v.map(x=>`<div class="row"><span>${esc(x[0])}</span><span>${esc(x[1])}</span></div>`).join('')}
function evidenceText(e){if(!e.evidence)return e.evidence_error?`Evidence error: ${e.evidence_error}`:'Evidence capture pending…';return JSON.stringify(e.evidence,null,2)}
function render(){
  if(!REPORT)return;const p=promote(),obs=observation(),cc=classCounts();
  $('overall').textContent=p.state;$('overallWhy').textContent=p.why;$('duration').textContent=fmt(Date.now()-Date.parse(REPORT.started_at_iso));$('sampleCount').textContent=`${REPORT.samples} samples · ${REPORT.comparable} comparable`;
  $('observation').textContent=`${(obs.coverage*100).toFixed(1)}%`;$('gapSummary').textContent=`${REPORT.gaps.length} gap(s) · longest ${fmt(REPORT.longest_gap_ms)}`;
  $('mismatchCount').textContent=REPORT.events.length;$('mismatchRate').textContent=`${ratio(REPORT.matching,REPORT.comparable)} matching samples`;
  $('activeSamples').textContent=REPORT.active_samples;$('maxCalls').textContent=`Max ${REPORT.max_calls} simultaneous calls`;
  $('classes').textContent=Object.entries(cc).map(([k,v])=>`${k}: ${v}`).join(' · ')||'—';$('markerCount').textContent=`${REPORT.markers.length} controlled call marker(s)`;
  for(const q of ['global','native']){const ok=health(q);$(q+'Pill').textContent=ok?'ONLINE':fresh(q)?'DEGRADED':'OFFLINE';$(q+'Pill').className='pill '+(ok?'good':fresh(q)?'warn':'bad');$(q+'Rows').innerHTML=rows(q);$(q+'Calls').textContent=calls(q).join('\n')||'No active calls'}
  $('checks').innerHTML=p.checks.map(c=>`<div class="row"><span>${esc(c[0])}</span><span class="${c[1]?'good':'warn'}">${c[1]?'PASS':c[3]==='review'?'REVIEW':'WAIT/FAIL'} · ${esc(c[2])}</span></div>`).join('');
  $('markers').textContent=REPORT.markers.length?REPORT.markers.slice(-8).map(m=>`${m.at_iso} · ${m.from_extension} → ${m.to_extension}`).join(' | '):'No controlled calls marked.';
  $('events').innerHTML=REPORT.events.length?REPORT.events.slice().reverse().map(e=>`<div class="event"><div><strong>${esc(e.confirmed_at_iso)}</strong>${e.resolved_at_iso?' · resolved':''} · <span class="warn">${esc(e.classification||'unknown')}</span>${e.marker?` · marker ${esc(e.marker.from_extension)}→${esc(e.marker.to_extension)}`:''}</div><div class="calls">G: ${esc((e.global||[]).join(' ; '))}<br>N: ${esc((e.native||[]).join(' ; '))}</div><details><summary>Show lineage evidence + recent transitions</summary><div class="evidence">${esc(evidenceText(e))}</div><div class="evidence">${esc(JSON.stringify(e.recent_transitions||{},null,2))}</div></details></div>`).join(''):'No confirmed mismatches.';
}
function setError(x){$('errorBox').hidden=false;$('errorBox').textContent=x}
function reset(){REPORT=blank();mismatch={key:'',count:0,confirmed:false,index:-1};lastTickMs=0;for(const p of ['global','native']){S[p].transitions=[];S[p].lastSig='';baseline(p)}save();render()}
function addMarker(){const a=norm($('markerFrom').value).replace(/\D/g,''),b=norm($('markerTo').value).replace(/\D/g,'');if(!/^\d{1,6}$/.test(a)||!/^\d{1,6}$/.test(b)){setError('Controlled call marker requires valid internal extensions.');return}REPORT.markers.push({at_iso:new Date().toISOString(),from_extension:a,to_extension:b});if(REPORT.markers.length>50)REPORT.markers.shift();save();render()}
async function copy(){const p=promote(),obs=observation(),cc=classCounts(),t=[`Native canary V2 promotion: ${p.state}`,`Started: ${REPORT.started_at_iso}`,`Samples: ${REPORT.samples} (${REPORT.comparable} comparable)`,`Browser observation: ${(obs.coverage*100).toFixed(1)}% · longest gap ${fmt(REPORT.longest_gap_ms)}`,`Active-call samples: ${REPORT.active_samples}`,`Confirmed semantic mismatches: ${REPORT.events.length} · ${JSON.stringify(cc)}`,`Controlled markers: ${REPORT.markers.length}`,`Native unexpected disconnect Δ: ${d('native','unexpected')}`,`Native reconnect attempt Δ: ${d('native','reconnect')}`,`Native reconciliation failure Δ: ${d('native','reconcile')}`,`Reason: ${p.why}`].join('\n');await navigator.clipboard.writeText(t)}
function exportJson(){const p=promote(),obs=observation(),blob=new Blob([JSON.stringify({...REPORT,observation_coverage:obs.coverage,expected_samples:obs.expected,promotion_signal:p.state,promotion_reason:p.why,checks:p.checks,generated_at_iso:new Date().toISOString()},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`eaglenest-native-canary-v2-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function boot(){const a=await access();if(!a){$('loginOut').textContent='Please sign in.';const g=await waitGoogle();g.initialize({client_id:GOOGLE_CLIENT_ID,ux_mode:'popup',callback:async r=>{try{await login(r.credential);location.reload()}catch(e){$('loginOut').textContent=e.message||e}}});g.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return}if(a.role!=='super_admin')throw Error('super_admin_required');$('loginCard').hidden=true;$('app').hidden=false;REPORT=load();$('resetBtn').onclick=()=>{if(confirm('Start a new V2 soak and clear the current V2 local report?'))reset()};$('copyBtn').onclick=()=>copy().catch(()=>{});$('exportBtn').onclick=exportJson;$('markerBtn').onclick=addMarker;connect('global');connect('native');setInterval(sample,SAMPLE_MS);setInterval(render,1000);render()}
window.addEventListener('beforeunload',()=>{save();for(const x of Object.values(S))try{x.ctl?.abort()}catch{}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&lastTickMs&&Date.now()-lastTickMs>GAP_MS)recordGap(Date.now())});
boot().catch(e=>setError(e.message||e));

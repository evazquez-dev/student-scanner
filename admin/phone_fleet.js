// EAGLENEST_GRANDSTREAM_PHONE_FLEET_207_V1 — intentionally no schoolwide controls.
(() => {
'use strict';
const BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const SID_KEYS=['ss_admin_session_sid_v1','notifications_admin_session_v1','admin_session_v1','admin_session_sid'];
const EXT={staff:['121','329','319','325','214','304','122','305','115','203','318','215','125','113','123'],
  classroom:['112','204','205','206','207','209','211','212','306','308','309','310','314','315','316','317']};
const $=id=>document.getElementById(id), state={rows:new Map(),probes:new Map(),config:null,read207:null,answer207:null,dial207:null,refreshedAt:null,loading:false};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sid(){try{for(const k of SID_KEYS){const x=String(sessionStorage.getItem(k)||localStorage.getItem(k)||'').trim();if(x)return x;}}catch{}return '';}
function stash(r){try{const x=String(r.headers.get('x-admin-session')||'').trim();if(x)for(const k of SID_KEYS){sessionStorage.setItem(k,x);localStorage.setItem(k,x);}}catch{}}
async function api(path,post=null){const h=new Headers(),s=sid();if(s)h.set('x-admin-session',s);if(post!==null)h.set('content-type','application/json');const r=await fetch(new URL(path,BASE),{method:post===null?'GET':'POST',headers:h,credentials:'include',cache:'no-store',...(post===null?{}:{body:JSON.stringify(post)})});stash(r);const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(String(j.error||`HTTP ${r.status}`).slice(0,140));return j;}
function error(e){$('fleetError').hidden=false;$('fleetError').textContent=String(e?.message||e).slice(0,230);}
function busy(v){state.loading=v;$('refresh').disabled=v;document.querySelectorAll('[data-probe]').forEach(b=>b.disabled=v);refresh207Buttons();}
function refresh207Buttons(){const c=state.config,p=state.read207;const ready=!!c?.read_enabled;const able=!!c?.supervised_enabled&&!!p?.ok;
  $('credential207').disabled=state.loading||!ready;
  $('answer207').disabled=state.loading||!able||p?.answer_preflight_ready!==true;
  $('dial207').disabled=state.loading||!able||!c?.destination||p?.dial_preflight_ready!==true;
  $('dial207').textContent=c?.destination?`↗ Place Internal Call · 207 → ${c.destination}`:'↗ Place Internal Call from 207';
  const pill=$('configPill');pill.className='fleetPill '+(c?.supervised_enabled?'ok':ready?'wait':'bad');
  pill.textContent=!c?'Pilot configuration unavailable':c.supervised_enabled?'Supervised 207 test enabled':ready?'207 diagnostics only':'207 credential probe disabled';
  $('fleet207Explain').textContent=!c?'Check operator email and Super Admin session.':
    !ready?'Enable GRANDSTREAM_PHONE_FLEET_207_READ_ENABLED for authenticated 207 diagnostics.':
    !c.supervised_enabled?'Read-only diagnostics enabled; control remains independently disabled.':
    'Control is permitted only with the current verified/attested handset identity, proper line state, explicit physical supervision and confirmation. Manual identity fallback is not production proof.';
}
function badge(text,tone=''){return `<span class="fleetPill ${tone}">${esc(text)}</span>`;}
function detail(r){const p=state.probes.get(r.extension);if(!p)return 'Not tested';if(p.error)return `Diagnostic: ${p.error}`;
  const http=p.http||{};const a=http.phone_status||{},l=http.line_status||{};
  if(a.result==='redirect'&&a.redirect?.scheme==='https')return 'HTTP → HTTPS; check TLS';
  if(p.https?.phone_status?.result==='tls_handshake_or_certificate_error')return 'HTTPS TLS verification issue';
  const states=l.state_readable?' · Lines readable':'';
  return `${a.result||'No response'}${states}`;
}
function renderRows(){const q=$('fleetSearch').value.trim().toLowerCase();for(const [group,id] of [['staff','staffRows'],['classroom','classRows']]){
  const html=EXT[group].filter(ext=>{const r=state.rows.get(ext);return !q||ext.includes(q)||String(r?.phone?.model||'').toLowerCase().includes(q);}).map(ext=>{
    const r=state.rows.get(ext);const verified=r?.single_phone_verified===true;const model=verified?r.phone.model:'Unconfirmed';
    const registration=!r?'Not loaded':verified?'Single physical phone':r.reason||'Not verified';
    const control=ext==='113'?badge('113 pilot proven','ok'):ext==='207'?badge('207 supervised test','wait'):badge('Not enabled');
    return `<tr><td>${esc(ext)}</td><td>${esc(model)}</td><td>${badge(registration,verified?'ok':'wait')}</td><td>${esc(detail(r||{extension:ext}))}</td><td>${control}</td><td><button type="button" class="fleetBtn" data-probe="${ext}" ${!verified||state.loading?'disabled':''}>Diagnostics</button></td></tr>`;
  }).join('');$(id).innerHTML=html||'<tr><td colspan="6">No matching extensions.</td></tr>';
  }
  document.querySelectorAll('[data-probe]').forEach(b=>b.addEventListener('click',()=>probe(b.dataset.probe)));
}
function stats(data){const extensions=[...EXT.staff,...EXT.classroom],rows=extensions.map(ext=>state.rows.get(ext));
  const count=rows.filter(r=>r?.single_phone_verified).length;
  const models=new Set(rows.filter(r=>r?.single_phone_verified).map(r=>r.phone.model));
  const t=data?.refreshed_at_iso?new Date(data.refreshed_at_iso).toLocaleTimeString(): '—';
  $('fleetStats').innerHTML=`<div class="fleetStat"><strong>31</strong><span>Target extensions</span></div><div class="fleetStat"><strong>${count}</strong><span>Single registered phones</span></div><div class="fleetStat"><strong>${models.size}</strong><span>Live confirmed models</span></div><div class="fleetStat"><strong>${esc(t)}</strong><span>Last UCM refresh</span></div>`;
}
async function load(){busy(true);$('fleetError').hidden=true;try{const [registry,config]=await Promise.all([
  api('/admin/integrations/grandstream/phone_registry',{}),
  api('/admin/integrations/grandstream/phone_fleet_207/config').catch(()=>null)]);
  state.rows=new Map((registry.rows||[]).map(row=>[String(row.extension),row]));state.config=config;state.probes.clear();state.read207=null;
  $('fleet207Report').textContent='No authenticated test run. A fresh UCM identity match is required.';
  stats(registry);state.refreshedAt=registry.refreshed_at_iso||null;state.answer207=null;state.dial207=null;$('export').disabled=false;
}catch(e){error(e);}finally{busy(false);renderRows();}}
async function probe(ext){if(state.loading)return;busy(true);$('fleetError').hidden=true;
  $('fleetProbeTitle').textContent=`Extension ${ext} · live read-only diagnostic (no CTI credential or control)`;
  $('fleetProbeReport').textContent='Checking live UCM and physical handset…';
  try{const j=await api('/admin/integrations/grandstream/phone_readiness',{extension:ext});
    state.probes.set(ext,j);$('fleetProbeReport').textContent=JSON.stringify(j,null,2);
  }catch(e){state.probes.set(ext,{error:String(e.message||e)});$('fleetProbeReport').textContent=String(e.message||e);error(e);}
  finally{busy(false);renderRows();}}
async function read207(){if(state.loading)return;busy(true);$('fleetError').hidden=true;$('fleet207Report').textContent='Authenticating 207 against live, pinned GXP1628…';
  try{const j=await api('/admin/integrations/grandstream/phone_fleet_207/readiness',{});state.read207=j;
    $('fleet207Report').textContent=JSON.stringify(j,null,2);
  }catch(e){state.read207=null;$('fleet207Report').textContent=String(e.message||e);error(e);}finally{busy(false);}}
async function control207(action){if(state.loading||!state.config||!state.read207)return;
  const dest=state.config.destination;const display=action==='acceptcall'?'ANSWER on physical extension 207':`PLACE INTERNAL CALL from 207 to ${dest}`;
  if(!confirm(`SUPERVISED TEST ONLY\n\n${display}\n\nAre you physically supervising the 207 telephone and intentionally conducting this test?\n\nNo automatic retry occurs.`))return;
  const phrase=`I AUTHORIZE 207 ${action==='acceptcall'?'ACCEPTCALL':`CALL ${dest}`}`;
  if(prompt(`Enter the EXACT phrase to authorize this one physical phone command:\n\n${phrase}`)!==phrase)return;
  const manual=state.read207.handset_account_identity_confirmed!==true;
  if(manual&&!confirm('CTI account lookup has NOT independently proven handset SIP identity. Confirm you have physically verified that the ringing/idle GXP1628 is extension 207. This is a ONE-TIME supervised exception, not rollout authorization.'))return;
  busy(true);$('fleetError').hidden=true;$('fleet207Report').textContent=`Sending one ${action} command to 207; inspect the physical handset if the result is uncertain…`;
  try{const result=await api('/admin/integrations/grandstream/phone_fleet_207/control',{
    extension:'207',action,confirmation:phrase,operator_at_phone:true,intentionally_testing:true,
    manual_identity_acknowledgement:manual,destination:action==='place_internal_call'?dest:undefined});
    $('fleet207Report').textContent=JSON.stringify(result,null,2);
    if(action==='acceptcall')state.answer207=result.physical_answer_verified===true?'verified connected':'accepted, connection not observed';
    else state.dial207=result.dial_observed===true?'outgoing state observed':'accepted, outgoing state not observed';
  }catch(e){$('fleet207Report').textContent=`${e.message||e}\n\nCheck the physical telephone before trying again. Commands are never retried automatically.`;
    if(action==='acceptcall')state.answer207='failed or outcome unknown';else state.dial207='failed or outcome unknown';error(e);}
  finally{state.read207=null;busy(false);}
}
// EAGLENEST_GRANDSTREAM_PHONE_FLEET_121_READONLY_V1
let CONFIG121=null;
async function load121Config(){
  try {
    CONFIG121=await api('/admin/integrations/grandstream/phone_fleet_121/config');
    $('fleet121Pill').className='fleetPill '+(CONFIG121.read_enabled&&CONFIG121.secret_configured?'ok':'wait');
    $('fleet121Pill').textContent=CONFIG121.read_enabled&&CONFIG121.secret_configured?'121 authenticated diagnostic enabled':'121 diagnostic not yet configured';
    $('fleet121Explain').textContent=!CONFIG121.read_enabled?'Enable GRANDSTREAM_PHONE_FLEET_121_READ_ENABLED after CTS confirms credentials.':
      !CONFIG121.secret_configured?'Set GRANDSTREAM_PHONE_GXP2135_CTI_PASSCODE as a Worker secret; do not paste it into EagleNEST.':
      'Read-only credential probe only; 401 challenge_scheme helps distinguish HTTP authentication from CTI passcode rejection.';
    $('credential121').disabled=state.loading||!CONFIG121.read_enabled||!CONFIG121.secret_configured;
  } catch(e) {
    CONFIG121=null;$('fleet121Pill').textContent='121 diagnostic unavailable';
    $('fleet121Explain').textContent=String(e.message||e).slice(0,140);$('credential121').disabled=true;
  }
}
async function read121(){
  if(state.loading||!CONFIG121?.read_enabled||!CONFIG121?.secret_configured)return;
  busy(true);$('fleetError').hidden=true;$('credential121').disabled=true;
  $('fleet121Report').textContent='Checking live UCM identity, then sending credentialed READ-ONLY CTI to 121…';
  try {
    const report=await api('/admin/integrations/grandstream/phone_fleet_121/readiness',{});
    $('fleet121Report').textContent=JSON.stringify(report,null,2);
  } catch(e){$('fleet121Report').textContent=String(e.message||e);error(e);}
  finally {busy(false);$('credential121').disabled=!CONFIG121?.read_enabled||!CONFIG121?.secret_configured;}
}
// EAGLENEST_GRANDSTREAM_PHONE_FLEET_121_PHASE4B3_V1
function enable121B3Buttons(){
  const enabled=!!CONFIG121?.read_enabled&&!!CONFIG121?.secret_configured&&!state.loading;
  $('diagnose121b3').disabled=!enabled;
  $('ringing121b3').disabled=!enabled;
}
async function run121B3(observe){
  if(state.loading||!CONFIG121?.read_enabled||!CONFIG121?.secret_configured)return;
  if(observe&&!confirm('READ-ONLY ringing observation for 121. Have you called the physical 121 handset and confirmed it is actively ringing? No Answer/Dial command will be sent.'))return;
  busy(true);enable121B3Buttons();$('fleetError').hidden=true;
  $('report121b3').textContent=observe?'Reading authenticated 121 phone status and UCM ringing events (three short snapshots)…':
    'Checking 121 authenticated line-status HTTP 401, HTTPS transport, and current phone/UCM status…';
  const path=observe?'ringing_observation':'line_diagnostic';
  try {
    const report=await api('/admin/integrations/grandstream/phone_fleet_121/'+path,{});
    $('report121b3').textContent=JSON.stringify(report,null,2);
    $('explain121b3').textContent=report?.correlation?.both_ringing_observed===true?
      'The authenticated phone-status and UCM live-event snapshots both observed ringing; line-status remains a separate readiness issue. Still no call control enabled.':
      'This is a read-only observation. If ringing was not captured, repeat only while the 121 handset is visibly ringing; do not enable Answer control yet.';
  }catch(e){$('report121b3').textContent=String(e.message||e);error(e);}
  finally{busy(false);enable121B3Buttons();}
}
function exportCsv(){
  if(!state.refreshedAt)return;
  const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
  const header=['Snapshot UTC','Group','Extension','UCM model','Registered','UCM reason','Generic CTI result','Generic lines readable','207 credential verified','207 SIP account confirmed','207 answer test','207 dial test'];
  const rows=[header];for(const [group,numbers] of Object.entries(EXT))for(const ext of numbers){
    const r=state.rows.get(ext),p=state.probes.get(ext)||{},phone=p.http?.phone_status||{},lines=p.http?.line_status||{},verified=r?.single_phone_verified===true;
    rows.push([state.refreshedAt,group,ext,verified?r.phone.model:'Unconfirmed',verified?'yes':'no',r?.reason||'not_in_registry',phone.result||'not_tested',
      lines.state_readable===true?'yes':lines.state_readable===false?'no':'not_tested',
      ext==='207'?state.read207?.credential_verified===true?'yes':'not_verified':'not_tested',
      ext==='207'?state.read207?.handset_account_identity_confirmed===true?'yes':'not_confirmed':'not_tested',
      ext==='207'?state.answer207||'not_tested':'not_tested',ext==='207'?state.dial207||'not_tested':'not_tested']);
  }
  const csv=rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
  try{const a=document.createElement('a');a.href=url;a.download='EagleNEST-phone-fleet-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();}
  finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
async function init(){try{const access=await api('/admin/access');if(access.role!=='super_admin')throw new Error('Super Admin access required.');
  $('refresh').addEventListener('click',load);$('export').addEventListener('click',exportCsv);$('fleetSearch').addEventListener('input',renderRows);
  $('credential207').addEventListener('click',read207);
  $('credential121').addEventListener('click',read121);
  $('diagnose121b3').addEventListener('click',()=>run121B3(false));
  $('ringing121b3').addEventListener('click',()=>run121B3(true));
  $('answer207').addEventListener('click',()=>control207('acceptcall'));
  $('dial207').addEventListener('click',()=>control207('place_internal_call'));
  await load();await load121Config();enable121B3Buttons();
}catch(e){error(e);$('fleet207Explain').textContent='Sign in through EagleNEST Calls as Super Admin, then open this page again.';}}
init();
})();

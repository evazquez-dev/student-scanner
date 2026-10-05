/* EAGLENEST_MORNING_ARRIVAL_HISTORICAL_REPAIR_V1 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const API=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const CLIENT=document.querySelector('meta[name="google-client-id"]')?.content||'';
let access=null,audit=null,selected=new Set(),busy=false;

function sid(){return window.EAGLENEST_AUTH?.getSid?.()||''}
function stash(v){if(v)window.EAGLENEST_AUTH?.setSid?.(v)}
async function req(path,init={}){
  const headers=new Headers(init.headers||{});const s=sid();if(s)headers.set('x-admin-session',s);
  const r=await fetch(new URL(path,API),{credentials:'include',cache:'no-store',...init,headers});
  stash(r.headers.get('x-admin-session')||'');
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data?.ok)throw Error(data?.error||`HTTP ${r.status}`);
  return data;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function nyDate(d=new Date()){return d.toLocaleDateString('en-CA',{timeZone:'America/New_York'})}
function priorDay(){
  const t=new Date(`${nyDate()}T12:00:00Z`);t.setUTCDate(t.getUTCDate()-1);return t.toISOString().slice(0,10);
}
function timeNY(iso){if(!iso)return '—';const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}):'—'}
function parseOverrides(){
  const out={};const lines=String($('overrides').value||'').split(/\r?\n/);
  for(const raw of lines){const line=raw.trim();if(!line)continue;const m=line.match(/^(\d{4}-\d{2}-\d{2})\s*=\s*(\d{1,2}:\d{2})$/);if(!m)throw Error(`Invalid override: ${line}`);out[m[1]]=m[2];}
  return out;
}
function payloadBase(){
  return {
    start:$('startDate').value,
    end:$('endDate').value,
    fallback_start:$('fallbackStart').value||'',
    trust_fallback:$('trustFallback').checked,
    schedule_overrides:parseOverrides()
  };
}
function statusLabel(s){
  return ({
    repairable:'Repairable',
    needs_schedule:'Needs schedule',
    expected_late:'Expected late',
    single_scan_mismatch:'Single-scan mismatch',
    rescans_before_start:'Re-scans before start',
    manual_or_unknown_late:'Manual / unknown Late',
    protected_or_special:'Protected / special',
    review:'Review'
  })[s]||s||'Review';
}
function visibleRows(){
  const mode=$('statusFilter').value;
  const rows=Array.isArray(audit?.items)?audit.items:[];
  if(mode==='all')return rows;
  if(mode==='repairable')return rows.filter(x=>x.repairable);
  if(mode==='needs_schedule')return rows.filter(x=>x.status==='needs_schedule');
  return rows.filter(x=>x.status!=='expected_late');
}
function drawStats(){
  const s=audit?.summary||{};
  $('stats').innerHTML=[
    ['Repairable',s.repairable||0,'good'],
    ['Needs schedule',s.needs_schedule||0,'warnText'],
    ['Review only',s.review_only||0,'bad'],
    ['Expected late',s.expected_late||0,'muted'],
    ['Late + morning scan',s.late_rows_with_morning_scan||0,'info']
  ].map(([label,value,cls])=>`<div class="stat"><span class="muted">${esc(label)}</span><b class="${cls}">${esc(value)}</b></div>`).join('');
}
function drawRows(){
  const list=visibleRows();
  $('tbody').innerHTML=list.length?list.map(r=>{
    const checked=selected.has(r.key);
    const disabled=!r.repairable;
    const source=r.official_source?`EagleNEST ${r.official_source}`:(r.source_comment||'No EagleNEST source marker');
    return `<tr>
      <td><input type="checkbox" data-key="${esc(r.key)}" ${checked?'checked':''} ${disabled?'disabled':''}></td>
      <td>${esc(r.date)}</td>
      <td><strong>${esc(r.name||'Unknown')}</strong><div class="muted small">${esc(r.osis)} · Grade ${esc(r.grade||'—')}</div></td>
      <td><strong>${esc(timeNY(r.first_at_iso))}</strong><div class="muted small">${r.first_on_time?'On time':'After start'}</div></td>
      <td>${esc(timeNY(r.last_at_iso))}<div class="muted small">${r.later_rescan_after_start?'After start':'Not after start'}</div></td>
      <td>${esc(r.morning_scan_count)}</td>
      <td><strong>${esc(r.school_start||'Unknown')}</strong><div class="muted small">${esc(r.schedule_source)}${r.schedule_trusted?' · trusted':' · not trusted'}</div></td>
      <td><span class="pill ${r.official_eaglenest_late?'repairable':'manual_or_unknown_late'}">${esc(r.code_label||r.detail_code||'Late')}</span><div class="muted small">${esc(source)}</div></td>
      <td><span class="pill ${esc(r.status)}">${esc(statusLabel(r.status))}</span><div class="muted small" style="max-width:360px;margin-top:4px">${esc(r.reason)}</div></td>
    </tr>`;
  }).join(''):'<tr><td colspan="9" class="muted">No rows match this filter.</td></tr>';
  $('selectedCount').textContent=`${selected.size} selected`;
  $('applyBtn').disabled=busy||selected.size===0;
}
function selectAllRepairable(){
  selected.clear();
  if($('selectAllRepairable').checked){
    for(const r of audit?.items||[])if(r.repairable)selected.add(r.key);
  }
  drawRows();
}
function setBusy(v){busy=!!v;$('auditBtn').disabled=busy;$('applyBtn').disabled=busy||selected.size===0}
async function runAudit(){
  setBusy(true);$('auditStatus').textContent='Auditing immutable scan history against canonical PowerSchool…';$('applyResult').textContent='';
  try{
    audit=await req('/admin/morning_arrival_repair/audit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payloadBase())});
    $('resultsCard').hidden=false;$('applyCard').hidden=false;$('selectAllRepairable').checked=true;drawStats();selectAllRepairable();
    $('auditStatus').textContent=`Audit complete: ${audit.start} through ${audit.end}.`;
  }catch(e){$('auditStatus').textContent=`Audit failed: ${e.message}`;audit=null;$('resultsCard').hidden=true;$('applyCard').hidden=true;}
  finally{setBusy(false)}
}
async function applySelected(){
  const items=(audit?.items||[]).filter(r=>selected.has(r.key)).map(r=>({date:r.date,osis:r.osis}));
  if(!items.length)return;
  const dates=new Set(items.map(x=>x.date));
  if(!confirm(`Apply ${items.length} Late → Present repair(s) across ${dates.size} date(s)?\n\nOnly rows that still pass the server-side safety audit will be submitted to PowerSchool.`))return;
  setBusy(true);$('applyResult').textContent='Applying selected repairs…';
  try{
    const body={...payloadBase(),items};
    const data=await req('/admin/morning_arrival_repair/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    $('applyResult').textContent=JSON.stringify({
      ok:data.ok,submitted:data.submitted,skipped:data.skipped,date_count:data.date_count,
      results:(data.results||[]).map(x=>({date:x.date,students:x.osis?.length||0,ok:x.result?.ok,stats:x.result?.stats||null,error:x.result?.error||null})),
      next_step:data.next_step
    },null,2);
    for(const r of audit.items||[])if(selected.has(r.key))r.applied=true;
    selected.clear();$('selectAllRepairable').checked=false;drawRows();
  }catch(e){$('applyResult').textContent=`Apply failed: ${e.message}`;}
  finally{setBusy(false)}
}
function csv(){
  if(!audit)return;
  const cols=['date','name','osis','grade','first_at_iso','last_at_iso','morning_scan_count','school_start','schedule_source','schedule_trusted','detail_code','official_source','status','reason'];
  const q=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const text=[cols.join(','),...(audit.items||[]).map(r=>cols.map(c=>q(r[c])).join(','))].join('\n');
  const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`morning-arrival-audit-${audit.start}-to-${audit.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function init(){
  try{
    access=await req('/admin/access');
    if(access.role!=='super_admin')throw Error('super_admin_required');
    $('login').hidden=true;$('app').hidden=false;$('who').textContent=`${access.email||'Super admin'} · ${access.role}`;
    $('startDate').value='2026-08-31';$('endDate').value=priorDay();
  }catch(e){$('loginStatus').textContent=`Sign in required: ${e.message}`;throw e}
}
function wireLogin(){
  const started=Date.now();(function ready(){
    if(window.google?.accounts?.id){
      google.accounts.id.initialize({client_id:CLIENT,callback:async x=>{
        try{
          const v=await req('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:x.credential})});
          stash(v.sid);await init();
        }catch(e){$('loginStatus').textContent=e.message}
      },ux_mode:'popup'});
      google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return;
    }
    if(Date.now()-started<10000)setTimeout(ready,100);
  })();
}
window.addEventListener('DOMContentLoaded',()=>{
  $('auditBtn').onclick=()=>runAudit();
  $('applyBtn').onclick=()=>applySelected();
  $('exportBtn').onclick=csv;
  $('statusFilter').onchange=drawRows;
  $('selectAllRepairable').onchange=selectAllRepairable;
  $('tbody').addEventListener('change',e=>{const cb=e.target.closest('input[data-key]');if(!cb)return;cb.checked?selected.add(cb.dataset.key):selected.delete(cb.dataset.key);$('selectedCount').textContent=`${selected.size} selected`;$('applyBtn').disabled=busy||selected.size===0});
  init().catch(()=>wireLogin());
});
})();

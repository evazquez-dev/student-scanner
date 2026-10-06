/* EAGLENEST_RAW_SCAN_VIEWER_V1 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const API=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const CLIENT=document.querySelector('meta[name="google-client-id"]')?.content||'';
let access=null,meta=null,result=null,busy=false;

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
function localTime(iso){if(!iso)return '—';const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}):iso}
function fmtInt(v){return Number(v||0).toLocaleString('en-US')}
function optionLabel(row){return `${row.value} (${fmtInt(row.count)})`}
function fillSelect(id,rows,firstLabel){const el=$(id);const prior=el.value;el.innerHTML=`<option value="">${esc(firstLabel)}</option>`+(rows||[]).map(x=>`<option value="${esc(x.value)}">${esc(optionLabel(x))}</option>`).join('');if([...el.options].some(o=>o.value===prior))el.value=prior}
function filterParams(offset=0){
  const p=new URLSearchParams();
  const values={start:$('startDate').value,end:$('endDate').value,student:$('student').value.trim(),location:$('location').value,source:$('source').value,device:$('device').value,code:$('code').value,allowed:$('allowed').value,late:$('late').value,class_text:$('classText').value.trim(),period:$('period').value,page_size:$('pageSize').value,offset:String(offset)};
  Object.entries(values).forEach(([k,v])=>{if(v&&!(k==='late'&&v==='all')&&!(k==='offset'&&v==='0'))p.set(k,v)});
  return p;
}
function setBusy(v){busy=!!v;['applyFilters','clearFilters','refreshBtn','exportBtn','prevBtn','nextBtn','prevBtnBottom','nextBtnBottom'].forEach(id=>{const el=$(id);if(el)el.disabled=busy});if(!busy)syncPager()}
function syncPager(){const prev=result?.prev_offset;const next=result?.next_offset;['prevBtn','prevBtnBottom'].forEach(id=>$(id).disabled=busy||prev===null||prev===undefined);['nextBtn','nextBtnBottom'].forEach(id=>$(id).disabled=busy||next===null||next===undefined);$('exportBtn').disabled=busy||!(result?.rows||[]).length}
function drawStats(){
  const ds=meta?.stats||{};const total=result?.total??0;const shown=result?.count??0;
  $('stats').innerHTML=[['Matched rows',fmtInt(total)],['Rows on page',fmtInt(shown)],['All scan rows',fmtInt(ds.total_rows||0)],['Distinct students',fmtInt(ds.distinct_students||0)],['Dataset dates',ds.earliest_schedule_date&&ds.latest_schedule_date?`${ds.earliest_schedule_date} → ${ds.latest_schedule_date}`:'—']].map(([label,value])=>`<div class="stat"><span class="muted">${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
}
function drawRows(){
  const rows=result?.rows||[];
  $('tbody').innerHTML=rows.length?rows.map(r=>{
    const late=r.is_late==null?'<span class="muted">—</span>':Number(r.is_late)===1?`<span class="pill yes">Yes${r.late_by_min!=null?` +${esc(r.late_by_min)}m`:''}</span>`:'<span class="pill no">No</span>';
    const classInfo=[r.class_label,r.course_section,r.period_id?`Period ${r.period_id}`:''].filter(Boolean).map(esc).join('<br>')||'<span class="muted">—</span>';
    return `<tr>
      <td class="nowrap"><strong>${esc(localTime(r.event_at_iso))}</strong><div class="muted small">${esc(r.event_at_iso||'')}</div><div class="muted small">Received ${esc(localTime(r.received_at_iso))}</div></td>
      <td><strong>${esc(r.student_name||'Unknown')}</strong><div class="muted small">OSIS ${esc(r.osis||'—')}</div></td>
      <td>${esc(r.location||'—')}</td><td>${esc(r.source||'—')}</td><td class="mono">${esc(r.raw_code||'—')}</td><td>${esc(r.allowed||'—')}</td><td class="mono">${esc(r.device_id||'—')}</td>
      <td>${classInfo}</td><td>${late}</td><td class="mono">${esc(r.event_id||'')}</td><td><button class="btn" type="button" data-detail="${esc(r.event_id||'')}">Details</button></td>
    </tr>`;
  }).join(''):'<tr><td colspan="11" class="muted">No scans match these filters.</td></tr>';
  const start=(result?.total||0)?(result.offset+1):0;const end=(result?.offset||0)+(result?.count||0);
  $('rangeText').textContent=`Showing ${fmtInt(start)}–${fmtInt(end)} of ${fmtInt(result?.total||0)} matched scans`;
  drawStats();syncPager();
}
async function loadMeta(){
  meta=await req('/admin/raw_scans/meta');
  fillSelect('location',meta.options?.locations,'All locations');
  fillSelect('source',meta.options?.sources,'All sources');
  fillSelect('device',meta.options?.devices,'All devices');
  fillSelect('allowed',meta.options?.allowed,'All outcomes');
  fillSelect('period',meta.options?.periods,'All periods');
}
async function loadPage(offset=0){
  setBusy(true);$('status').textContent='Loading D1 scan history…';
  try{result=await req(`/admin/raw_scans/query?${filterParams(offset).toString()}`);drawRows();$('status').textContent=`Loaded ${fmtInt(result.count)} row${result.count===1?'':'s'} from D1.`;}
  catch(e){result={rows:[],total:0,count:0,offset:0,prev_offset:null,next_offset:null};drawRows();$('status').textContent=`Load failed: ${e.message}`;}
  finally{setBusy(false)}
}
async function showDetail(eventId){
  if(!eventId)return;$('detailId').textContent=eventId;$('detailJson').textContent='Loading…';$('detailDialog').showModal();
  try{const data=await req(`/admin/raw_scans/detail?event_id=${encodeURIComponent(eventId)}`);$('detailJson').textContent=JSON.stringify(data.row,null,2);}
  catch(e){$('detailJson').textContent=`Failed to load record: ${e.message}`;}
}
function clearFilters(){['startDate','endDate','student','location','source','device','code','allowed','classText','period'].forEach(id=>{$(id).value=''});$('late').value='all';$('pageSize').value='100';loadPage(0)}
function exportCsv(){
  const rows=result?.rows||[];if(!rows.length)return;
  const cols=['event_id','event_at_iso','received_at_iso','schedule_date','osis','student_name','raw_code','source','location','device_id','allowed','class_label','period_id','course_section','scan_local_min','schedule_tz','period_start_min','period_end_min','late_threshold_min','late_by_min','is_late','held_by_email','held_by_title','held_by_role','held_since_iso','held_duration_min','pulled_from_room','pulled_from_period','locker_number','locker_color','created_at_iso'];
  const q=v=>`"${String(v??'').replaceAll('"','""')}"`;const text=[cols.join(','),...rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\n');
  const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`eaglenest-raw-scans-${new Date().toISOString().slice(0,10)}-offset-${result.offset}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function init(){
  try{
    access=await req('/admin/access');if(access.role!=='super_admin')throw Error('super_admin_required');
    $('login').hidden=true;$('app').hidden=false;$('who').textContent=`${access.email||'Super admin'} · ${access.role}`;
    await loadMeta();await loadPage(0);
  }catch(e){$('loginStatus').textContent=`Sign in required: ${e.message}`;throw e}
}
function wireLogin(){
  const started=Date.now();(function ready(){
    if(window.google?.accounts?.id){google.accounts.id.initialize({client_id:CLIENT,callback:async x=>{try{const v=await req('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:x.credential})});stash(v.sid);await init()}catch(e){$('loginStatus').textContent=e.message}} ,ux_mode:'popup'});google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return}
    if(Date.now()-started<10000)setTimeout(ready,100);
  })();
}
window.addEventListener('DOMContentLoaded',()=>{
  $('filters').addEventListener('submit',e=>{e.preventDefault();loadPage(0)});
  $('clearFilters').onclick=clearFilters;$('refreshBtn').onclick=async()=>{const offset=result?.offset||0;setBusy(true);try{await loadMeta()}finally{setBusy(false)}await loadPage(offset)};$('exportBtn').onclick=exportCsv;
  const prev=()=>loadPage(result?.prev_offset||0);const next=()=>{if(result?.next_offset!=null)loadPage(result.next_offset)};
  $('prevBtn').onclick=prev;$('prevBtnBottom').onclick=prev;$('nextBtn').onclick=next;$('nextBtnBottom').onclick=next;
  $('tbody').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(b)showDetail(b.dataset.detail)});
  $('closeDetail').onclick=()=>$('detailDialog').close();$('detailDialog').addEventListener('click',e=>{if(e.target===$('detailDialog'))$('detailDialog').close()});
  init().catch(()=>wireLogin());
});
})();

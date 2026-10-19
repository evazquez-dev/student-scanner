(() => {
'use strict';
// EAGLENEST_AFTER_SCHOOL_ROSTER_AUDIT_V1
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const API_BASE=document.querySelector('meta[name="api-base"]')?.content||location.origin+'/';
const KEYS=['my_rosters_admin_session_v1','ss_admin_session_sid_v1','teacher_att_admin_session_v1','admin_session_v1','admin_session_sid'];
let report=null;
function sid(){try{for(const k of KEYS){const v=String(sessionStorage.getItem(k)||localStorage.getItem(k)||'').trim();if(v)return v;}}catch{}return '';}
function stash(r){const v=String(r.headers.get('x-admin-session')||'').trim();if(v)for(const k of KEYS)try{sessionStorage.setItem(k,v);localStorage.setItem(k,v);}catch{}}
async function api(path){const h=new Headers(),s=sid();if(s)h.set('x-admin-session',s);const r=await fetch(new URL(path,API_BASE),{headers:h,credentials:'include',cache:'no-store'});stash(r);const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||j?.detail||`HTTP ${r.status}`);return j;}
function notice(message,good=true){$('notice').textContent=message;$('notice').style.color=good?'':'#ef4444';}
function dateNY(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const q=k=>p.find(x=>x.type===k)?.value;return `${q('year')}-${q('month')}-${q('day')}`;}
const statusName=s=>({session_recorded:'Activity record',scanner_supported:'Scanner supported',seen_elsewhere:'Seen elsewhere',not_confirmed:'Not confirmed'})[s]||s;
function render(r){report=r;$('export').disabled=false;$('results').hidden=false;$('disclaimer').textContent=r.disclaimer;
 const metrics=[['Selected dates',r.counts.selected_dates],['Opened sessions',r.counts.recorded_sessions],['Scan-group evidence',r.counts.scan_group_supported_dates],['No confirmed session',r.counts.no_session_confirmed]];
 $('metrics').innerHTML=metrics.map(([label,value])=>`<div class="card metric"><strong>${Number(value)}</strong><span class="muted">${esc(label)}</span></div>`).join('');
 $('daysBody').innerHTML=r.days.map((d,i)=>{
  const rooms=d.room_matches.map(z=>`${esc(z.location)}: ${z.matched}/${z.observed} roster matches (${z.room_purity_pct}%) ${z.majority_match?'✓ majority':'• not majority'}`).join(' · ')||'No qualifying activity-room scans';
  const detail=`<details><summary>Student evidence · ${d.roster_count}</summary><p class="muted tiny">${rooms}</p><div class="subtable"><table><thead><tr><th>Student</th><th>OSIS</th><th>Evidence</th><th>Locations</th></tr></thead><tbody>${d.students.map(s=>`<tr><td>${esc(s.name)}${s.guest?' (guest)':''}</td><td><code>${esc(s.osis)}</code></td><td>${esc(statusName(s.status))}</td><td>${esc(s.scan_locations.join(', ')||'—')}</td></tr>`).join('')}</tbody></table></div></details>`;
  return `<tr><td>${esc(d.date)}</td><td><span class="chip">${d.status==='SESSION_RECORDED'?'Session opened':d.status==='SCAN_GROUP_SUPPORT'?'Room-majority supported':'Session unconfirmed'}</span></td><td>${d.session_present}</td><td>${d.scanner_supported}</td><td>${d.seen_elsewhere}</td><td>${d.not_confirmed}</td><td>${detail}</td></tr>`;
 }).join('')||'<tr><td colspan="7">No dates match the selected weekdays.</td></tr>';
}
function csvExport(){if(!report)return;const cols=['date','roster','type','osis','student','evidence','scan_locations','session_recorded','guest_checkin','session_observed'];const cell=s=>'"'+String(s??'').replace(/"/g,'""')+'"';const lines=[cols.map(cell).join(',')];
 for(const d of report.days)for(const s of d.students)lines.push([d.date,report.roster.name,report.roster.type,s.osis,s.name,s.status,s.scan_locations.join('; '),s.session_recorded,s.guest_checkin,d.observed_session].map(cell).join(','));
 const blob=new Blob([lines.join('\n')+'\n'],{type:'text/csv;charset=utf-8'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=`eaglenest-after-school-audit-${report.from}-${report.to}.csv`;a.click();URL.revokeObjectURL(href);
}
async function run(){try{$('run').disabled=true;notice('Loading historical activity and scan evidence…');const days=[...document.querySelectorAll('#weekdays input:checked')].map(x=>x.value).join(',');
 const qs=new URLSearchParams({roster_id:$('roster').value,from:$('from').value,to:$('to').value,weekdays:days,start:$('startTime').value,end:$('endTime').value});const r=await api('/admin/after_school_attendance_audit/report?'+qs);render(r);notice(`Report loaded for ${r.roster.name}. These are participation indicators, not official attendance.`);
 }catch(e){notice(e.message,false);}finally{$('run').disabled=false;}}
async function init(){try{const today=dateNY(),d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-13);$('from').value=d.toISOString().slice(0,10);$('to').value=today;
 const data=await api('/admin/my_rosters');const items=[...(data.custom_rosters||[]),...(data.shared_rosters||[])].filter(x=>['club','sports_team','regents'].includes(x.special_action_type));
 $('roster').innerHTML=items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} (${x.special_action_label||x.special_action_type})</option>`).join('');$('formSection').hidden=false;
 $('run').disabled=!items.length;notice(items.length?`Found ${items.length} accessible activity rosters. Select the days this activity normally meets.`:'No activity rosters are currently owned by or shared with you.');
 $('run').addEventListener('click',run);$('export').addEventListener('click',csvExport);
 }catch(e){notice(`Could not load activity rosters: ${e.message}`,false);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

/* EAGLENEST_OUTSIDE_LUNCH_V1 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const API=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
const CLIENT=document.querySelector('meta[name="google-client-id"]')?.content||'';
const KEYS=['outside_lunch_admin_session_v1','ss_admin_session_sid_v1','admin_session_v1','admin_session_sid'];
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let access=null, rows=[], studentOsis='',busy=false;
function session(){try{for(const k of KEYS){const x=sessionStorage.getItem(k)||localStorage.getItem(k);if(x)return x;}}catch{}return '';}
function stash(s){if(!s)return;for(const k of KEYS){try{sessionStorage.setItem(k,s);localStorage.setItem(k,s);}catch{}}}
async function req(path,init={}){let head=new Headers(init.headers||{});const sid=session();if(sid)head.set('x-admin-session',sid);
 const resp=await fetch(new URL(path,API),{credentials:'include',cache:'no-store',...init,headers:head});stash(resp.headers.get('x-admin-session')||'');
 const data=await resp.json().catch(()=>({}));if(!resp.ok||!data.ok)throw Error(data.error||`HTTP ${resp.status}`);return data;}
const pct=v=>v==null?'—':`${Number(v).toFixed(1)}%`;
function flag(b,label='Eligible'){return `<span class="pill ${b?'good':'bad'}">${escape(b?label:'Not eligible')}</span>`;}
function table(headers,lines){return `<div class="scroll"><table><thead><tr>${headers.map(x=>`<th>${escape(x)}</th>`).join('')}</tr></thead><tbody>${lines.length?lines.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">No records</td></tr>`}</tbody></table></div>`;}
function showError(v){$('error').textContent=String(v||'');}
async function drawBoard(){if(!access?.can?.admin)return;
 const r=await req('/admin/outside_lunch/dashboard');rows=r.students||[];$('counts').textContent=`${r.counts.eligible} eligible · ${r.counts.ineligible} not eligible · ${r.counts.permission_slips} approved slips`;filterBoard();}
function filterBoard(){const q=$('search').value.trim().toLowerCase();const list=rows.filter(r=>!q||`${r.name} ${r.osis} ${r.reasons.join(' ')}`.toLowerCase().includes(q));
 $('board').innerHTML=table(['Student','Permission','School / arrival','Classes','Grades','Penalty','Eligibility'],list.map(r=>[
 `<button class="btn" data-student="${escape(r.osis)}">${escape(r.name)}</button><div class="small muted">${escape(r.osis)} · Grade ${escape(r.grade)}</div>`,
 escape(r.permission_slip?'Approved':'Missing'),
 `${escape(r.attendance.school_present)}/${escape(r.attendance.school_denominator)} present<br>${pct(r.attendance.arrival_pct)} on time`,
 `${pct(r.attendance.class_pct)} (${r.attendance.class_ontime}/${r.attendance.class_total})`,
 escape(r.academics.ready?`${r.academics.failing_course_count} below ${r.academics.passing_score}`:'Pending grades'),
 escape(r.penalty_pending?'Pending':'None'),
 `${flag(r.eligible)}<div class="small">${escape(r.reason||'All checks met')}</div>`]));}
function showStudent(r){if(!r?.ok)return;
 const a=r.attendance||{},g=r.academics||{},pen=r.penalty||{};
 const daily=(a.days||[]).map(x=>[escape(x.date),escape(x.daily_status),escape(x.detail_code),escape(x.counted_present?'Yes':'No'),escape(x.on_time_arrival?'Yes':'No'),escape(x.class_status),escape((x.periods||[]).map(p=>`${p.period_local}: ${p.status}`).join(' · ')||'—')]);
 const courses=(g.courses||[]).map(x=>[escape(x.course_code),escape(x.course_name),escape(x.grade??'Not entered'),escape(x.status)]);
 const actions=(r.admin_actions||[]).map(x=>[escape(x.action_type),escape(x.reason),escape(x.begins_on),escape(x.expires_on),escape(x.revoked_at_iso?'Retracted':'Active / historical'),
 x.revoked_at_iso?'—':`<button class="btn" data-retract="${escape(x.id)}">Retract</button>`]);
 $('student').innerHTML=`<div class="row" style="justify-content:space-between"><h2>${escape(r.name)} · ${escape(r.osis)}</h2>${flag(r.eligible)}</div>
 <div class="notice">${r.reasons.length?escape(r.reasons.join(' · ')):'All eligibility requirements satisfied.'}${r.admin_pass?' · Administrative pass active':''}</div>
 <div class="grid" style="margin:15px 0">
 <div class="card">Permission slip<br><strong>${escape(r.permission_slip?'APPROVED':'MISSING — mandatory')}</strong></div>
 <div class="card">School attendance<br><strong>${a.school_present}/${a.school_denominator} · ${pct(a.school_pct)}</strong></div>
 <div class="card">On-time school arrivals<br><strong>${a.school_on_time}/${a.school_denominator} · ${pct(a.arrival_pct)}</strong></div>
 <div class="card">On-time class meetings<br><strong>${a.class_ontime}/${a.class_total} · ${pct(a.class_pct)}</strong></div>
 <div class="card">Marking period<br><strong>${escape(g.marking_period||'—')} · ${escape(g.snapshot_date||'—')}</strong><br>Passing threshold ${escape(g.passing_score??'configured')}</div>
 <div class="card">Lunch penalty<br><strong>${escape(pen.pending?'PENDING':'None')}</strong><br>${escape(pen.last_violation_type||'')} ${escape(pen.last_violation_date||'')}</div>
 </div><h3>Daily and class-attendance evidence</h3>${table(['Day','Daily status','Code','Counts present','On time','Class data','Meeting details'],daily)}
 <h3>Current marking-period courses</h3>${g.courses?table(['Course','Name','Grade','Result'],courses):'<div class="muted">Course-level grades hidden by your permissions.</div>'}
 <h3>Lunch history / penalty</h3>${table(['Time','Date','Action','Result','Period','Device'],(r.lunch_history||[]).map(x=>[escape(x.event_at_iso),escape(x.schedule_date),escape(x.location),escape(x.allowed),escape(x.period_id),escape(x.device_id)]))}<div class="notice">Last late return: ${escape(pen.last_late_return_at||'—')} · Last violation: ${escape(pen.last_violation_type||'—')} · Pending: ${escape(pen.pending?'Yes':'No')}</div>
 ${access?.can?.admin?`<h3>Penalty retraction history</h3>${table(['Violation','Date','Reason','Retracted at','Staff'],(r.penalty_retractions||[]).map(x=>[escape(x.violation_type),escape(x.violation_date),escape(x.reason),escape(x.retracted_at_iso),escape(x.retracted_by_email)]))}<div class="stack" style="margin:14px 0"><button class="btn" data-add="pass">Issue administrative pass</button><button class="btn" data-add="restriction">Add restriction</button>${pen.pending?'<button class="btn" data-penalty="retract">Retract lunch penalty</button>':''}</div><h3>Administrative actions</h3>${table(['Type','Reason','From','Through','Status','Action'],actions)}`:''}`;
}
async function loadStudent(osis){const id=String(osis||'').replace(/\D/g,'');if(!id)return;studentOsis=id;$('osis').value=id;history.replaceState(null,'',`?osis=${encodeURIComponent(id)}`);
 $('student').textContent='Loading eligibility detail…';showStudent(await req(`/admin/outside_lunch/detail?osis=${encodeURIComponent(id)}`));}
async function mutate(path,body){if(busy)return;busy=true;showError('');try{await req(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});await loadStudent(studentOsis);if(access?.can?.admin)await drawBoard();}catch(e){showError(e.message);}finally{busy=false;}}
async function init(){try{access=await req('/admin/access');$('who').textContent=`${access.email||'Staff'} · ${access.role||''}`;$('login').hidden=true;$('app').hidden=false;
 $('adminBoard').hidden=!access?.can?.admin;const osis=new URL(location.href).searchParams.get('osis');
 if(osis)await loadStudent(osis);if(access?.can?.admin)await drawBoard();
 }catch(e){$('loginStatus').textContent=`Sign in required: ${e.message}`;}}
window.addEventListener('DOMContentLoaded',()=>{
 $('refresh').onclick=()=>{showError('');(async()=>{if(access?.can?.admin)await drawBoard();if(studentOsis)await loadStudent(studentOsis);})().catch(e=>showError(e.message));};
 $('search').oninput=filterBoard;$('open').onclick=()=>loadStudent($('osis').value).catch(e=>showError(e.message));
 document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-student],[data-add],[data-retract],[data-penalty]');if(!b)return;
 if(b.dataset.student){await loadStudent(b.dataset.student).catch(e=>showError(e.message));$('student').scrollIntoView({behavior:'smooth'});return;}
 if(!access?.can?.admin||!studentOsis)return;
 if(b.dataset.add){const kind=b.dataset.add,reason=prompt(`Reason for ${kind}?`);if(!reason||reason.trim().length<3)return;
 const expires=prompt('Last day of this action (YYYY-MM-DD)?',new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}));if(!expires)return;
 await mutate('/admin/outside_lunch/action',{osis:studentOsis,action_type:kind,reason,expires_on:expires});}
 if(b.dataset.retract){const reason=prompt('Reason for retracting this administrative action?');if(reason?.trim().length>=3)await mutate('/admin/outside_lunch/action/retract',{id:b.dataset.retract,reason});}
 if(b.dataset.penalty){const reason=prompt('Reason for retracting this lunch-return penalty?');if(reason?.trim().length>=3)await mutate('/admin/outside_lunch/penalty/retract',{osis:studentOsis,reason});}
 });
 init().then(()=>{if(!$('app').hidden)return;const t=Date.now();(function ready(){if(window.google?.accounts?.id){google.accounts.id.initialize({client_id:CLIENT,callback:async x=>{
 try{const v=await req('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:x.credential})});stash(v.sid);await init();}catch(e){$('loginStatus').textContent=e.message;}},ux_mode:'popup'});google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return;}
 if(Date.now()-t<10000)setTimeout(ready,100);})();});
});
})();

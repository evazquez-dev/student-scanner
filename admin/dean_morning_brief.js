/* EAGLENEST_DEAN_MORNING_BRIEF_V2 — Today's room walkthrough + historical patterns. Read-only. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={data:null,report:null,selected:'',generation:0,showAll:false,showAllRooms:false};
 const urlBase=()=>new URL(document.querySelector('meta[name="api-base"]')?.content||location.origin,location.origin);
 const note={
  late_first_class:'A campus entrance preceded a first-class kiosk IN recorded as late. Threshold: 3 dates.',
  unconfirmed_first_class:'An entrance was observed, but there is no accepted first-class kiosk check-in. Verify; do not infer lateness or absence.',
  late_transitions:'A later class kiosk check-in was recorded late, with earlier classroom evidence.',
  unexpected_rooms:'A kiosk check-in differs from the dated assigned room; temporary moves may explain it.',
  official_presence_conflict:'PowerSchool marked absent on a complete day, but a credible on-campus observation exists.'
 };
 const fmtTime=iso=>{if(!iso)return'—';const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}):'—';};
 const fmtDate=str=>{const d=new Date(`${str}T12:00:00Z`);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):str;};
 const hhmm=min=>Number.isFinite(Number(min))?`${Math.floor(Number(min)/60)%24}:${String(Number(min)%60).padStart(2,'0')}`:'—';
 const lookingToday=()=>$('morningDays')?.value==='today';
 const filters=()=>({grade:$('gradeFilter')?.value||'',search:$('searchInput')?.value?.trim().toLowerCase()||''});
 const matches=(s,f)=>(!f.grade||String(s.grade)===f.grade)&&(!f.search||`${s.name} ${s.osis}`.toLowerCase().includes(f.search));
 const moduleRows=mod=>(mod.students||[]).filter(s=>matches(s,filters()));
 function morningFacts(data){const s=data?.summary||{};const followups=(data?.interventions||[]).filter(x=>x.follow_up_status==='open').length;
  if($('deanFollowupCount'))$('deanFollowupCount').textContent=`${followups} open`;
  if($('morningGrade')&&$('gradeFilter')){$('morningGrade').innerHTML=$('gradeFilter').innerHTML;$('morningGrade').value=$('gradeFilter').value;}
  const facts=[['Needs outreach today',s.today_outreach,'outreach'],['Overdue follow-ups',s.overdue_followups,'followups'],['Open incidents',s.open_incidents,'incidents']];
  $('morningFacts').innerHTML=facts.map(([label,val,key])=>`<button type="button" class="morningFact" data-morning-focus="${key}"><strong>${Number(val||0)}</strong><span>${esc(label)}</span></button>`).join('');
 }
 function clearPanel(){const p=$('morningDetail');p.hidden=true;p.innerHTML='';}
 function render(){const report=state.report,coverage=$('morningCoverage'),modules=$('morningModules');clearPanel();
  if(!report){modules.innerHTML='<div class="empty">Loading the Dean briefing…</div>';coverage.textContent='Loading…';return;}
  if(report.available===false){
   const reason={dean_scope_not_configured:'No Dean assignment is configured.',today_day_context_unavailable:'Today’s dated schedule has not been synced yet.',today_schedule_unverified:'Today’s schedule has not passed readiness checks.',today_schedule_date_mismatch:'The available student/room map does not match today.',today_room_map_unavailable:'The student-room map has not been synced today.',no_student_classes:'Today is configured without regular student classes.',not_in_session:'PowerSchool says this is not an instructional school day.',no_bell:'No bell periods are available for today.',after_school:'Regular scheduled periods have ended.',no_verified_dated_schedules:'No verified historical schedules were found.',no_qualifying_scan_evidence:'No qualifying historical kiosk evidence was found.'};
   modules.innerHTML=`<div class="empty">${esc(reason[report.reason]||'The selected attendance view is unavailable.')} ${lookingToday()?'Check the Schedule + Classes / Day Context sync, or choose a historical lookback.':'This is not proof of zero attendance concerns.'}</div>`;
   coverage.textContent=lookingToday()?`Today · ${esc(report.date||'')} · no verified current-room view`:'Historical evidence unavailable';return;
  }
  if(lookingToday())renderToday(report);else renderHistorical(report);
 }
 function renderToday(j){const f=filters();const all=(j.rooms||[]).map(r=>({...r,shown:r.students.filter(s=>matches(s,f))})).filter(r=>r.shown.length);
  const review=all.reduce((n,r)=>n+r.shown.filter(s=>s.review).length,0),total=all.reduce((n,r)=>n+r.shown.length,0);
  const p=j.period||{},phase=j.phase==='upcoming'?`Next period ${esc(p.id)} begins ${hhmm(p.start)}`:`Current period ${esc(p.id)} · ${hhmm(p.start)}–${hhmm(p.end)}`;
  $('morningCoverage').innerHTML=`${j.schedule_verification==='provisional'?'<span class="pill warn">Schedule readiness incomplete — verify room assignments</span> ':''}<strong>Today ${esc(fmtDate(j.date))} · ${phase}</strong> · refreshed ${esc(fmtTime(j.as_of_iso))} · ${all.length} expected rooms · ${total} students · ${review} to verify <button type="button" id="todayAllRooms" class="morningInlineBtn">${state.showAllRooms?'Only rooms to verify':'Show all rooms'}</button><br><span class="muted">Grouped by expected room from today's schedule. Latest kiosk observations may not reflect present location.</span>`;
  const activeRooms=state.showAllRooms?all:all.filter(r=>r.shown.some(s=>s.review));
  $('morningModules').innerHTML=activeRooms.length?activeRooms.map(r=>{const n=r.shown.filter(s=>s.review).length;return `<button class="morningModule morningRoom${state.selected===r.room?' active':''}" type="button" data-morning-room="${esc(r.room)}" aria-expanded="${state.selected===r.room?'true':'false'}" aria-controls="morningDetail"><span class="morningModuleName">Room ${esc(r.room)}</span><strong>${n}</strong><span class="morningModuleSub">need verification · ${r.shown.length} assigned</span></button>`;}).join(''):'<div class="empty">No rooms currently need verification, or no students match the selected filters. Select “Show all rooms” to inspect expected rosters.</div>';
  if(state.selected){const r=activeRooms.find(x=>x.room===state.selected);if(r)showTodayRoom(r);else state.selected='';}
 }
 function showTodayRoom(r){const panel=$('morningDetail');panel.hidden=false;const students=state.showAll?r.shown:r.shown.filter(s=>s.review),review=r.shown.filter(s=>s.review).length;
  panel.innerHTML=`<div class="morningDetailTop"><div><h3>Room ${esc(r.room)}</h3><p>${review} to verify · ${r.shown.length} assigned. Expected room is the current schedule assignment, not a live location measurement.</p></div><button type="button" id="morningClose">Close</button></div>
  <div class="morningToggle"><button type="button" data-today-view="review" class="${!state.showAll?'active':''}" aria-pressed="${!state.showAll}">Needs verification (${review})</button><button type="button" data-today-view="all" class="${state.showAll?'active':''}" aria-pressed="${state.showAll}">All assigned (${r.shown.length})</button><button type="button" data-today-refresh>Refresh today</button></div>`+
  (students.length?students.map(s=>`<details class="morningPerson"><summary><span><strong>${esc(s.name||s.osis)}</strong><small>Grade ${esc(s.grade||'—')} · OSIS ${esc(s.osis)}</small></span><span class="pill ${s.review?'warn':'good'}">${esc(s.label||s.status)}</span></summary>
    <div class="morningHistory"><div class="morningEvidence"><strong>Expected now: Room ${esc(s.expected_room||'unmapped')} · Period ${esc(s.period||'—')}</strong><span>Latest qualifying kiosk: ${esc(s.last_scan_location||'none')} · ${esc(fmtTime(s.last_scan_at))}</span><span>Expected-room IN: ${esc(fmtTime(s.confirmed_room_at))} · Teacher action: ${esc(s.teacher_code||'not recorded')}</span>${s.staff_pull_seen_at_scan?`<small>Staff hold noted on a previous scan: ${esc(s.staff_pull_seen_at_scan)} (not proof it remains active)</small>`:''}<small>${esc(s.evidence_note||'No scan is not proof of absence or lateness.')}</small></div></div>
    <button type="button" data-morning-student="${esc(s.osis)}">Open student / log intervention</button></details>`).join(''):'<div class="empty">No students currently need verification in this room. Select “All assigned” to see its full roster.</div>');
 }
 function renderHistorical(j){const mods=j.modules||[];
  $('morningCoverage').textContent=`${j.days_analyzed}/${j.days_requested} verified instructional dates · scan evidence on ${j.scan_days_observed}/${j.days_analyzed} · ${fmtDate(j.first_date)}–${fmtDate(j.last_date)} · Read-only`;
  $('morningModules').innerHTML=mods.map(m=>{const n=moduleRows(m).length;return `<button class="morningModule${state.selected===m.key?' active':''}" type="button" data-morning-module="${esc(m.key)}" aria-expanded="${state.selected===m.key?'true':'false'}" aria-controls="morningDetail"><span class="morningModuleName">${esc(m.label)}</span><strong>${n}</strong><span class="morningModuleSub">students · ${m.threshold>1?`${m.threshold}+ dates`:'at least 1 date'} · review evidence</span></button>`;}).join('');
  if(state.selected){const chosen=mods.find(m=>m.key===state.selected);if(chosen)showHistorical(chosen);else state.selected='';}
 }
 function showHistorical(m){const students=moduleRows(m),panel=$('morningDetail');panel.hidden=false;
  panel.innerHTML=`<div class="morningDetailTop"><div><h3>${esc(m.label)}</h3><p>${esc(note[m.key]||'Read-only historical evidence review')}</p></div><button type="button" id="morningClose">Close</button></div>`+
  (students.length?students.map(s=>`<details class="morningPerson"><summary><span><strong>${esc(s.name)}</strong><small>Grade ${esc(s.grade||'—')} · OSIS ${esc(s.osis)}</small></span><span class="pill">${s.occurrences} date${s.occurrences===1?'':'s'}</span></summary><div class="morningHistory">${(s.events||[]).map(e=>`<div class="morningEvidence"><strong>${esc(fmtDate(e.date))} · ${esc(e.period||'Period')} · ${esc(e.room||'Room unavailable')}</strong><span>Entrance ${esc(fmtTime(e.entrance))} · Classroom ${esc(fmtTime(e.class_scan))}</span><small>${esc(e.note||'')}</small></div>`).join('')}</div><button type="button" data-morning-student="${esc(s.osis)}">Open student / log intervention</button></details>`).join(''):'<div class="empty">No students meet this threshold in the selected grade/search filter.</div>');
 }
 async function fetchView({quiet=false}={}){const gen=++state.generation,today=lookingToday(),lookback=$('morningDays').value;
  if(!quiet){state.report=null;state.selected='';render();}
  try{const url=new URL(today?'/admin/dean/today_rooms':'/admin/dean/attendance_patterns',urlBase());if(!today)url.searchParams.set('days',lookback);
   const sid=window.EAGLENEST_AUTH?.getSid?.()||'';
   const resp=await fetch(url,{headers:sid?{'x-admin-session':sid}:{},credentials:'include',cache:'no-store'});
   const renewed=resp.headers.get('x-admin-session');if(renewed)window.EAGLENEST_AUTH?.setSid?.(renewed);
   const doc=await resp.json().catch(()=>({}));if(!resp.ok||!doc.ok)throw Error(doc.message||doc.error||`HTTP ${resp.status}`);
   if(gen!==state.generation||today!==lookingToday())return;state.report=doc;render();
  }catch(e){if(gen!==state.generation)return;if(quiet&&state.report){$('morningCoverage').textContent+=` · Refresh failed: ${e.message}`;return;}
   $('morningModules').innerHTML=`<div class="empty">Could not load ${today?'today’s rooms':'historical patterns'}: ${esc(e.message)}. Other Dean Dashboard data remains available below.</div>`;$('morningCoverage').textContent='Attendance detail unavailable';}
 }
 function refresh(j){state.data=j;morningFacts(j);fetchView();}
 function refilter(){if(state.report)render();}
 function focus(key){const name=key==='followups'?'deanFollowupsFold':'deanQueueFold',p=$(name);if(p){p.open=true;p.scrollIntoView({behavior:'smooth',block:'start'});}if(key==='incidents'){$('focusFilter').value='incident';$('focusFilter').dispatchEvent(new Event('change'));}else if(key==='outreach'){$('focusFilter').value='attendance';$('focusFilter').dispatchEvent(new Event('change'));}}
 function bind(){
  $('morningGrade')?.addEventListener('change',()=>{if($('gradeFilter')){$('gradeFilter').value=$('morningGrade').value;$('gradeFilter').dispatchEvent(new Event('change'));}});
  $('morningDays')?.addEventListener('change',()=>{state.selected='';state.showAll=false;state.showAllRooms=false;fetchView();});
  $('morningCoverage')?.addEventListener('click',e=>{if(e.target.closest('#todayAllRooms')){state.showAllRooms=!state.showAllRooms;state.selected='';render();}});
  $('morningModules')?.addEventListener('click',e=>{const a=e.target.closest('[data-morning-room],[data-morning-module]');if(!a)return;const key=a.dataset.morningRoom||a.dataset.morningModule;state.selected=state.selected===key?'':key;render();});
  $('morningDetail')?.addEventListener('click',e=>{
   if(e.target.closest('#morningClose')){state.selected='';render();return;}
   const b=e.target.closest('[data-morning-student]');if(b){window.dispatchEvent(new CustomEvent('eaglenest-dean-open-student',{detail:{osis:b.dataset.morningStudent}}));return;}
   const choice=e.target.closest('[data-today-view]');if(choice){state.showAll=choice.dataset.todayView==='all';render();return;}
   if(e.target.closest('[data-today-refresh]'))fetchView({quiet:true});
  });
  $('morningFacts')?.addEventListener('click',e=>{const a=e.target.closest('[data-morning-focus]');if(a)focus(a.dataset.morningFocus);});
  $('gradeFilter')?.addEventListener('change',()=>{if($('morningGrade'))$('morningGrade').value=$('gradeFilter').value;refilter();});$('searchInput')?.addEventListener('input',refilter);
  $('mtssAwarenessCollapse')?.addEventListener('click',()=>{const panel=$('mtssAwarenessPanel');if(!panel)return;const collapsed=panel.classList.toggle('dean-collapsed');$('mtssAwarenessCollapse').textContent=collapsed?'Expand':'Collapse';$('mtssAwarenessCollapse').setAttribute('aria-expanded',String(!collapsed));});
  // Read fresh D1 observations every 60 seconds only while Today is visible; no location claim from stale data.
  setInterval(()=>{if(lookingToday()&&!document.hidden&&state.data)fetchView({quiet:true});},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&lookingToday()&&state.data)fetchView({quiet:true});});
 }
 window.EAGLENEST_DEAN_BRIEF={refresh,refilter};
 window.addEventListener('DOMContentLoaded',bind);
})();

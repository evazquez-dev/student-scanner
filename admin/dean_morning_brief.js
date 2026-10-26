/* EAGLENEST_DEAN_MORNING_BRIEF_V1 — incremental, read-only UI */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={data:null,patterns:null,selected:'',generation:0};
 const urlBase=()=>{const raw=document.querySelector('meta[name="api-base"]')?.content||location.origin;return new URL(raw,location.origin);};
 const note={
  late_first_class:'A campus entrance preceded a first-class kiosk IN recorded as late. Threshold: 3 dates.',
  unconfirmed_first_class:'Campus entrance recorded, but no accepted first-class kiosk IN. This is a verification queue, not a late/absent finding.',
  late_transitions:'A later class kiosk check-in was recorded late with earlier classroom scan evidence. Threshold: 3 dates.',
  unexpected_rooms:'Accepted kiosk activity differs from the dated assigned room. Authorized moves may explain it.',
  official_presence_conflict:'PowerSchool marked absent on a complete official day, but a credible on-campus observation exists.'
 };
 const time=iso=>{if(!iso)return'—';const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}):'—';};
 const date=str=>{const d=new Date(`${str}T12:00:00Z`);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):str;};
 function filters(){return {grade:$('gradeFilter')?.value||'',search:$('searchInput')?.value?.trim().toLowerCase()||''};}
 function moduleRows(mod){const f=filters();return (mod.students||[]).filter(s=>(!f.grade||String(s.grade)===f.grade)&&(!f.search||`${s.name} ${s.osis}`.toLowerCase().includes(f.search)));}
 function morningFacts(data){const s=data?.summary||{};const followups=(data?.interventions||[]).filter(x=>x.follow_up_status==='open').length;if($('deanFollowupCount'))$('deanFollowupCount').textContent=`${followups} open`;const facts=[
  ['Needs outreach today',s.today_outreach,'outreach'],['Overdue follow-ups',s.overdue_followups,'followups'],['Open incidents',s.open_incidents,'incidents']
 ];$('morningFacts').innerHTML=facts.map(([label,val,key])=>`<button type="button" class="morningFact" data-morning-focus="${key}"><strong>${Number(val||0)}</strong><span>${esc(label)}</span></button>`).join('');}
 function clearPanel(){const p=$('morningDetail');p.hidden=true;p.innerHTML='';}
 function render(){const j=state.patterns;clearPanel();if(!j){$('morningModules').innerHTML='<div class="empty">Loading historical attendance patterns…</div>';return;}
  if(j.available===false){$('morningModules').innerHTML='<div class="empty">Historical patterns unavailable: insufficient verified schedule or kiosk evidence for this lookback. This does not mean there are zero concerns.</div>';$('morningCoverage').textContent='No eligible historical days';return;}
  const mods=j.modules||[];$('morningCoverage').textContent=`${j.days_analyzed}/${j.days_requested} verified instructional dates · scan evidence on ${j.scan_days_observed}/${j.days_analyzed} · ${date(j.first_date)}–${date(j.last_date)} · Read-only`;
  $('morningModules').innerHTML=mods.map(m=>{const ss=moduleRows(m);const n=ss.length;return `<button class="morningModule${state.selected===m.key?' active':''}" type="button" data-morning-module="${esc(m.key)}" aria-expanded="${state.selected===m.key?'true':'false'}" aria-controls="morningDetail"><span class="morningModuleName">${esc(m.label)}</span><strong>${n}</strong><span class="morningModuleSub">students · ${m.threshold>1?`on ${m.threshold}+ dates`:'at least 1 date'} · review evidence</span></button>`}).join('');
  if(state.selected){const selected=mods.find(m=>m.key===state.selected);if(selected)showDetails(selected);}
 }
 function showDetails(mod){const rows=moduleRows(mod),p=$('morningDetail');p.hidden=false;
  p.innerHTML=`<div class="morningDetailTop"><div><h3>${esc(mod.label)}</h3><p>${esc(note[mod.key]||'Read-only evidence review')}</p></div><button type="button" id="morningClose">Close</button></div>`+
   (rows.length?rows.map(s=>`<details class="morningPerson"><summary><span><strong>${esc(s.name)}</strong><small>Grade ${esc(s.grade||'—')} · OSIS ${esc(s.osis)}</small></span><span class="pill">${s.occurrences} date${s.occurrences===1?'':'s'}</span></summary><div class="morningHistory">${(s.events||[]).map(e=>`<div class="morningEvidence"><strong>${esc(date(e.date))} · ${esc(e.period||'Period')} · ${esc(e.room||'Room unavailable')}</strong><span>Entrance ${esc(time(e.entrance))} · Classroom ${esc(time(e.class_scan))}</span><small>${esc(e.note||'')}</small></div>`).join('')}</div><button type="button" data-morning-student="${esc(s.osis)}">Open student / log intervention</button></details>`).join(''):'<div class="empty">No students meet this module’s threshold in the current grade/search filter.</div>');
 }
 async function fetchPatterns(){const gen=++state.generation;state.patterns=null;state.selected='';render();const days=+$('morningDays').value||10;
  try{const base=urlBase(),url=new URL('/admin/dean/attendance_patterns',base);url.searchParams.set('days',String(days));
   const sid=window.EAGLENEST_AUTH?.getSid?.()||'';const resp=await fetch(url,{headers:sid?{'x-admin-session':sid}:{},credentials:'include',cache:'no-store'});
   const renewed=resp.headers.get('x-admin-session');if(renewed)window.EAGLENEST_AUTH?.setSid?.(renewed);
   const j=await resp.json().catch(()=>({}));if(!resp.ok||!j.ok)throw Error(j.message||j.error||`HTTP ${resp.status}`);
   if(gen!==state.generation)return;state.patterns=j;render();
  }catch(e){if(gen!==state.generation)return;$('morningModules').innerHTML=`<div class="empty">Could not load historical patterns: ${esc(e.message)}. Current Dean data is still available below.</div>`;$('morningCoverage').textContent='Historical data not loaded';}
 }
 function refresh(j){state.data=j;morningFacts(j);fetchPatterns();}
 function refilter(){if(state.patterns)render();}
 function focus(key){const name=key==='followups'?'deanFollowupsFold':'deanQueueFold',p=$(name);if(p){p.open=true;p.scrollIntoView({behavior:'smooth',block:'start'});}if(key==='incidents'){$('focusFilter').value='incident';$('focusFilter').dispatchEvent(new Event('change'));}else if(key==='outreach'){$('focusFilter').value='attendance';$('focusFilter').dispatchEvent(new Event('change'));}}
 function bind(){
  $('morningDays')?.addEventListener('change',fetchPatterns);
  $('morningModules')?.addEventListener('click',e=>{const b=e.target.closest('[data-morning-module]');if(!b)return;const key=b.dataset.morningModule;state.selected=state.selected===key?'':key;render();});
  $('morningDetail')?.addEventListener('click',e=>{if(e.target.closest('#morningClose')){state.selected='';render();return;}const b=e.target.closest('[data-morning-student]');if(b)window.dispatchEvent(new CustomEvent('eaglenest-dean-open-student',{detail:{osis:b.dataset.morningStudent}}));});
  $('morningFacts')?.addEventListener('click',e=>{const b=e.target.closest('[data-morning-focus]');if(b)focus(b.dataset.morningFocus);});
  $('gradeFilter')?.addEventListener('change',refilter);$('searchInput')?.addEventListener('input',refilter);
  $('mtssAwarenessCollapse')?.addEventListener('click',()=>{const panel=$('mtssAwarenessPanel');if(!panel)return;const collapsed=panel.classList.toggle('dean-collapsed');$('mtssAwarenessCollapse').textContent=collapsed?'Expand':'Collapse';$('mtssAwarenessCollapse').setAttribute('aria-expanded',String(!collapsed));});
 }
 window.EAGLENEST_DEAN_BRIEF={refresh,refilter};
 window.addEventListener('DOMContentLoaded',bind);
})();

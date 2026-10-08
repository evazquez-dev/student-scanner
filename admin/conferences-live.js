/* EAGLENEST_FASC_LIVE_HUB_V2
 * Additive live-day workspace: existing advisor bookings and separate subject/support
 * meetings. Worker may be deployed separately; the UI degrades safely without it.
 */
(()=>{
  'use strict';
  const ROOT_ID='fascLiveRoot';
  const TODAY_TZ='America/New_York';
  const POLL_MS=30000;
  let mode='live', groupMode='advisees', myGroups=[], availableStudents=[], studentLookup=new Map();
  let activeBookingId='', activeStudent=null, lastSync=null, pollBusy=false, initialized=false;
  let selectedLane='', searchDebounce=0, searchSeq=0, eventInitialized=false;
  let academicSeq=0, noteDirty=false, activeMeetingLocal='', notesRecorded=false, classLoaded=false;
  let liveMeetings=[],liveBackend='unknown',liveLoading=false;
  const $l=(id)=>document.getElementById(id);
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sid=(v)=>String(v||'').replace(/\D/g,'').slice(0,20);
  const me=()=>String(access?.email||'').toLowerCase();
  const admin=()=>access?.can?.conference_event_admin===true;
  const proxy=()=>!admin()&&access?.can?.conference_booking_proxy===true;
  const activeEvent=()=>bundle?.event||null;
  const getEventId=()=>activeEvent()?.event_id||'';
  const allowedLanes=()=>new Set([me(),...(bundle?.viewer?.coverage_lanes||[]).map(x=>String(x.advisor_email||'').toLowerCase())]);
  const isAllLanes=()=>admin()||proxy();
  const reportOnly=()=>bundle?.viewer?.report_only===true;
  function localToday(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:TODAY_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
  function clock(iso){if(!iso)return '—';const d=new Date(iso);return Number.isNaN(+d)?'—':new Intl.DateTimeFormat('en-US',{timeZone:TODAY_TZ,hour:'numeric',minute:'2-digit'}).format(d);}
  function fmtDate(iso){if(!iso)return '';const d=new Date(iso);return Number.isNaN(+d)?'':new Intl.DateTimeFormat('en-US',{timeZone:TODAY_TZ,month:'short',day:'numeric'}).format(d);}
  function relative(iso){const n=new Date(iso).getTime()-Date.now();const min=Math.round(n/60000);if(!Number.isFinite(min))return '';if(min>1)return `in ${min} min`;if(min>=-1)return 'now';return `${Math.abs(min)} min ago`;}
  function showStatus(txt,level=''){const o=$l('fascLiveStatus');if(!o)return;o.textContent=txt||'';o.dataset.level=level;}
  function slotFor(b){return (bundle?.slots||[]).find(x=>x.slot_id===b.slot_id)||null;}
  function ownBooking(b){
    if(isAllLanes())return true;
    const lane=String(b.staff_email||'').toLowerCase();
    if(lane===me())return true;
    const slot=b._live?b._slot:slotFor(b);
    if(!slot?.start_iso)return false;
    const time=new Intl.DateTimeFormat('en-GB',{timeZone:activeEvent()?.timezone||TODAY_TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(slot.start_iso));
    return (bundle?.viewer?.coverage_lanes||[]).some(c=>String(c.advisor_email||'').toLowerCase()===lane&&time>=c.start_time&&time<c.end_time);
  }
  function bookings(){
    const booked=(bundle?.bookings||[]).filter(ownBooking).map(b=>({...b,_slot:slotFor(b)}));
    const walkins=liveMeetings.map(m=>({
      booking_id:`live:${m.meeting_id}`,student_number:m.student_number,student_name:m.student_name,
      staff_email:m.host_email,staff_name:m.host_name,family_contact_name:m.family_contact_name,
      status:m.status,_live:m,_slot:{start_iso:m.started_at_iso,end_iso:m.ended_at_iso||m.started_at_iso}
    })).filter(ownBooking);
    return [...booked,...walkins].filter(b=>!selectedLane||b.staff_email===selectedLane)
      .sort((a,b)=>(a._slot?.start_iso||'').localeCompare(b._slot?.start_iso||''));
  }
  function selectedBooking(){return bookings().find(b=>b.booking_id===activeBookingId)||null;}
  function roleNote(){return reportOnly()?'Leadership reporting is read-only. Your own appointments can be managed in your personal scope.':isAllLanes()?'Authorized schoolwide staff can choose a conference lane.':'Your scheduled appointments and delegated coverage appear here.';}
  function template(){
    const app=$l('app'),head=app?.querySelector('.pageHead');if(!app||!head)return;
    const nav=document.createElement('div');nav.id='fascLiveTabs';nav.className='fascLiveTabs';
    nav.innerHTML=`<div class="fascLiveTabButtons" role="group" aria-label="Conference workspace"><button id="fascTabLive" class="primary" type="button" aria-pressed="true">● Live view</button><button id="fascTabManage" type="button" aria-pressed="false">Manage / Scheduling</button></div><div class="fascLiveSync"><span id="fascLiveSyncAt">Not synchronized yet</span><button type="button" id="fascLiveRefresh">↻ Refresh</button></div>`;
    head.insertAdjacentElement('afterend',nav);
    const root=document.createElement('section');root.id=ROOT_ID;root.className='fascLiveStack';
    root.innerHTML=`
      <section class="card fascLiveHero"><div class="fascLiveHeroTop"><div><h2>Conference live hub</h2><p id="fascLiveEventLabel" class="muted small">Loading today's event…</p></div><div class="fascLiveEventBox"><label>Event<select id="fascLiveEvent"><option value="">Loading…</option></select></label><label id="fascLiveLaneBox">Viewing staff<select id="fascLiveLane"></select></label><label id="fascLiveScopeBox" hidden>Reporting scope<select id="fascLiveScope"></select></label></div></div><div class="fascLiveMetrics" id="fascLiveMetrics"></div><p id="fascLiveStatus" role="status" class="fascLiveStatus"></p></section>
      <section class="fascLiveColumns"><div class="card"><div class="fascLiveSectionHead"><div><h2>My conference queue</h2><p class="muted small">Now, next, upcoming and completed</p></div><select id="fascLiveQueueFilter" aria-label="Filter appointments"><option value="all">All appointments</option><option value="upcoming">Upcoming</option><option value="finished">Finished</option></select></div><div id="fascLiveAgenda"></div></div>
      <div class="card"><div class="fascLiveSectionHead"><div><h2>Meeting workspace</h2><p class="muted small">One student, one conversation</p></div></div><div id="fascLiveMeeting" class="fascLiveMeeting"><p class="muted">Select an appointment or a student to get started.</p></div></div></section>
      <section class="card"><div class="fascLiveSectionHead"><div><h2>Find a student / Walk-in</h2><p class="muted small">Your advisees, class students and authorized student search</p></div><div class="fascLiveRow"><button id="fascLiveManageBooking" type="button">Open full booking tools</button></div></div><div class="fascLiveStudentToolbar"><label>Group<select id="fascLiveGroup"><option value="advisees">My advisees</option><option value="classes">My class students</option><option value="search">Find student</option></select></label><label id="fascLiveClassWrap" hidden>Course / section<select id="fascLiveClass"></select></label><label class="fascLiveStudentSearch">Find by name / OSIS<input id="fascLiveStudentSearch" type="search" autocomplete="off" placeholder="Type at least 2 characters…"></label></div><div id="fascLiveStudentHelp" class="muted small"></div><div id="fascLiveStudentResults" class="fascLiveStudentResults"></div></section>
      <section id="fascLiveLeadership" class="card" hidden><h2>Team conference pulse</h2><div id="fascLiveTeamRows"></div><p class="muted small">Leadership progress does not grant access to edit another advisor's appointments.</p></section>`;
    nav.insertAdjacentElement('afterend',root);
    // Reuse current module authorization: the full management page remains intact.
    $l('fascTabLive').addEventListener('click',()=>setMode('live'));
    $l('fascTabManage').addEventListener('click',()=>setMode('manage'));
    $l('fascLiveRefresh').addEventListener('click',refresh);
    $l('fascLiveQueueFilter').addEventListener('change',renderAgenda);
    $l('fascLiveEvent').addEventListener('change',e=>$l('eventSelect').value=e.target.value, true);
    $l('fascLiveEvent').addEventListener('change',()=>{eventInitialized=true;resetMeeting();liveMeetings=[];loadBundle($l('fascLiveEvent').value);});
    $l('fascLiveLane').addEventListener('change',()=>{selectedLane=$l('fascLiveLane').value;resetMeeting();renderLive();});
    $l('fascLiveScope').addEventListener('change',()=>{const native=$l('requirementReportingScopeSelect');if(native){native.value=$l('fascLiveScope').value;native.dispatchEvent(new Event('change'));}});
    $l('fascLiveGroup').addEventListener('change',()=>{groupMode=$l('fascLiveGroup').value;if(groupMode==='classes')loadGroupStudents();else renderStudents();});
    $l('fascLiveClass').addEventListener('change',loadGroupStudents);
    $l('fascLiveStudentSearch').addEventListener('input',()=>{clearTimeout(searchDebounce);searchDebounce=setTimeout(renderStudents,250);});
    $l('fascLiveManageBooking').addEventListener('click',()=>setMode('manage',true));
    $l('fascLiveAgenda').addEventListener('click',e=>{const btn=e.target.closest('button[data-booking]');if(btn)openBooking(btn.dataset.booking);});
    $l('fascLiveStudentResults').addEventListener('click',e=>{const btn=e.target.closest('button[data-student]');if(btn)openStudent(btn.dataset.student,btn.dataset.name||'');});
    $l('fascLiveMeeting').addEventListener('click',onMeetingClick);
    $l('fascLiveMeeting').addEventListener('input',e=>{if(e.target.matches('textarea,input[type=checkbox]'))noteDirty=true;});
    const pref=new URL(location.href).searchParams.get('view');
    setMode(pref==='manage'?'manage':'live');
  }
  function setMode(next,focusBooking=false){mode=next;document.body.dataset.fascLiveMode=mode;$l('fascTabLive')?.setAttribute('aria-pressed',String(mode==='live'));$l('fascTabManage')?.setAttribute('aria-pressed',String(mode==='manage'));$l('fascTabLive')?.classList.toggle('primary',mode==='live');$l('fascTabManage')?.classList.toggle('primary',mode==='manage');if(focusBooking&&mode==='manage')requestAnimationFrame(()=>$l('studentSearch')?.focus());if(mode==='live')renderLive();}
  function resetMeeting(){activeBookingId='';activeStudent=null;activeMeetingLocal='';academicSeq++;noteDirty=false;notesRecorded=false;}
  function eventOptions(){const sel=$l('fascLiveEvent');if(!sel)return;const orig=sel.value;sel.replaceChildren();for(const e of events||[])sel.add(new Option(`${e.event_date||''} • ${e.title||'Conference'}`,e.event_id));if(getEventId())sel.value=getEventId();else if(orig)sel.value=orig;
    // Auto-pick today's active event on initial page load, but never override a deliberate choice.
    if(!eventInitialized&&events?.length){eventInitialized=true;const todays=events.find(e=>e.event_date===localToday()&&e.status==='active');if(todays&&todays.event_id!==getEventId()){const native=$l('eventSelect');native.value=todays.event_id;loadBundle(todays.event_id);}}
  }
  function lanes(){const sel=$l('fascLiveLane');if(!sel)return;const old=sel.value;sel.replaceChildren();sel.add(new Option(isAllLanes()?'All staff lanes':'My / covered appointments',''));const valid=new Set();for(const s of bundle?.staff||[]){const email=String(s.staff_email||'').toLowerCase();if(!isAllLanes()&&!allowedLanes().has(email))continue;valid.add(email);sel.add(new Option(`${s.staff_name||s.staff_email}${s.location?' • '+s.location:''}`,s.staff_email));}if(valid.has(selectedLane))sel.value=selectedLane;else if(valid.has(old)){selectedLane=old;sel.value=old;}else{selectedLane='';sel.value='';}$l('fascLiveLaneBox').hidden=sel.options.length<3;}
  function renderScopes(){
    const req=bundle?.requirement||{},sel=$l('fascLiveScope'),wrap=$l('fascLiveScopeBox');
    if(!sel||!wrap)return;
    const rows=Array.isArray(req.available_scopes)?req.available_scopes:[];
    wrap.hidden=rows.length<=1;
    const previous=sel.value;
    sel.replaceChildren();
    for(const row of rows)sel.add(new Option(row.label||row.key||'View',row.key||''));
    const preferred=req.scope?.key||previous;
    if([...sel.options].some(x=>x.value===preferred))sel.value=preferred;
  }
  function renderMetrics(){const bs=bookings(), scheduled=bs.filter(b=>b.status==='scheduled');const now=Date.now();const upcoming=scheduled.filter(b=>new Date(b._slot?.end_iso||0).getTime()>=now).length;const complete=bs.filter(b=>b.status==='completed').length;const noShow=bs.filter(b=>b.status==='no_show').length;const current=scheduled.filter(b=>new Date(b._slot?.start_iso||0)<=now&&new Date(b._slot?.end_iso||0)>now).length+bs.filter(b=>['arrived','in_progress'].includes(b.status)).length;
    const items=[['Booked',scheduled.length],['Upcoming',upcoming],['Here / meeting',current],['Completed',complete],['No-show',noShow]];
    $l('fascLiveMetrics').innerHTML=items.map(([k,v])=>`<div class="fascLiveMetric"><b>${v}</b><span>${esc(k)}</span></div>`).join('');
    $l('fascLiveEventLabel').textContent=`${activeEvent()?.title||'Select an event'} • ${activeEvent()?.event_date||'—'} • ${roleNote()}`;
    if(lastSync)$l('fascLiveSyncAt').textContent=`Updated ${clock(lastSync.toISOString())}`;
  }
  function renderAgenda(){const host=$l('fascLiveAgenda');if(!host)return;const rows=bookings().filter(x=>x.status!=='cancelled');const filter=$l('fascLiveQueueFilter').value;const filtered=rows.filter(x=>filter==='all'||(filter==='finished'?['completed','no_show'].includes(x.status):['scheduled','arrived','in_progress'].includes(x.status)));
    if(!filtered.length){host.innerHTML='<p class="muted">No appointments in this view. Use the student finder to prepare a walk-in or switch to Manage to book an open time.</p>';return;}
    const now=Date.now();host.innerHTML=filtered.map(b=>{const time=new Date(b._slot?.start_iso||0).getTime(),end=new Date(b._slot?.end_iso||0).getTime();const isNow=b.status==='in_progress'||(b.status==='scheduled'&&time<=now&&end>now);const status=b.status==='completed'?'Completed':b.status==='no_show'?'No show':b.status==='arrived'?'Arrived':b.status==='in_progress'?'In progress':isNow?'Now':time>now?'Upcoming':'Past due';const st=b._slot?.start_iso||'';const lane=(b.staff_name||b.staff_email||'')+(b._live?' • '+b._live.meeting_kind+' walk-in':'');const open=b.booking_id===activeBookingId;
      return `<button class="fascLiveAgendaItem ${open?'selected':''}" data-booking="${esc(b.booking_id)}" type="button"><span class="fascLiveAgendaTime">${esc(clock(st))}<small>${esc(relative(st))}</small></span><span class="fascLiveAgendaWho"><strong>${esc(b.student_name||b.student_number)}</strong><small>${esc(lane)}${b.family_contact_name?' • '+esc(b.family_contact_name):''}</small></span><span class="fascLiveQueueStatus ${b.status==='completed'?'done':isNow?'now':''}">${esc(status)}</span></button>`;
    }).join('');
  }
  function renderLeadership(){const section=$l('fascLiveLeadership');const host=$l('fascLiveTeamRows');const rows=bundle?.requirement?.advisor_progress||[];section.hidden=!rows.length||(!admin()&&!['grade','department','school'].includes(String(bundle?.requirement?.scope?.type||'')));if(section.hidden)return;
    host.innerHTML=`<div class="fascLiveTeamTable"><div class="fascLiveTeamHeader"><span>Advisor</span><span>Booked</span><span>Completed</span><span>Need booking</span></div>${rows.map(r=>`<div class="fascLiveTeamRow"><span>${esc(r.advisor_name||r.advisor_email)}</span><span>${Number(r.booked||0)}</span><span>${Number(r.completed||0)}</span><span>${Number(r.needs_booking||0)}</span></div>`).join('')}</div><button id="fascLiveGoCoverage" type="button">Manage conference coverage</button>`;
    $l('fascLiveGoCoverage')?.addEventListener('click',()=>{setMode('manage');$l('fascCoverageSection')?.scrollIntoView({behavior:'smooth'});});
  }
  function renderLive(){if(!$l(ROOT_ID)||mode==='manage')return;eventOptions();lanes();renderScopes();if(!activeEvent()){$l('fascLiveAgenda').innerHTML='<p class="muted">No active event selected.</p>';return;}renderMetrics();renderAgenda();renderLeadership();if(activeBookingId&&!selectedBooking()&&!noteDirty){resetMeeting();$l('fascLiveMeeting').innerHTML='<p class="muted">Appointment no longer available in your scope. Select another.</p>';}}
  function meetingMarkup(b,studentName,osis){const s=b?(b._live?b._slot:slotFor(b)):null;const state=b?.status||'';const isScheduled=['scheduled','arrived','in_progress'].includes(state),selected=!!b;const canStatus=selected&&!proxy()&&!reportOnly()&&ownBooking(b);const phone=b?.family_phone||'';const safePhone=String(phone).replace(/[^\d+]/g,'');
    return `<div class="fascLiveSelectedStudent"><h3>${esc(studentName||osis)}</h3><p class="muted small">${osis?'OSIS '+esc(osis):''} ${selected?' • '+esc(clock(s?.start_iso))+'–'+esc(clock(s?.end_iso))+' • '+esc(b?.staff_name||b?.staff_email||''):''}</p>${selected?`<p>${esc(b?.family_contact_name||'Family contact not specified')}${b?.family_relationship?' • '+esc(b.family_relationship):''} ${safePhone?`<a href="tel:${esc(safePhone)}">${esc(phone)}</a>`:''}</p>`:''}</div>
    <div class="fascLiveMeetingActions"><button data-meeting="lookup" type="button">Full student lookup ↗</button><button data-meeting="contacts" type="button">Student Contacts ↗</button>${!selected?`<button data-meeting="book" type="button">Book available time</button>${liveBackend==='ready'&&!proxy()&&!reportOnly()?`<label class="fascLiveKindLabel">Meeting type<select id="fascLiveNewKind"><option value="subject">Subject / class</option><option value="advisor">Advisor</option><option value="support">Counselor / Dean</option></select></label><button data-meeting="walkin" type="button" class="primary">Start walk-in meeting</button>`:''}`:''}${canStatus&&isScheduled?`<button data-meeting="begin" type="button">${b._live?(b.status==='in_progress'?'Meeting in progress':'Start conversation'):(activeMeetingLocal===b.booking_id?'Meeting opened here':'Open meeting')}</button><button data-meeting="no_show" type="button">No show</button>`:''}</div>
    <div class="fascLiveAcademics"><h4>Grades &amp; attendance</h4><div id="fascLiveAcademic">Loading authorized student overview…</div></div>
    <div class="fascLiveMeetingNotes"><label>Conference discussion / follow-up notes<textarea id="fascLiveNotes" rows="4" maxlength="3200" placeholder="Strengths, questions, concerns, commitments, next steps…">${esc(b?._live?.notes||'')}</textarea></label><label class="fascLiveCheck"><input id="fascLiveFollowup" type="checkbox" ${b?._live?.follow_up_needed?'checked':''}> Flag follow-up in discussion log (assign staff below)</label><div class="muted small">Advisor booking notes are logged to communications; walk-in notes are saved to the live meeting record. Neither is saved only in the browser.</div><div class="fascLiveMeetingActions"><button data-meeting="log" type="button">Log discussion</button>${canStatus&&isScheduled?`<button data-meeting="complete" type="button" class="primary">Save &amp; complete</button><button data-meeting="complete_only" type="button">Complete without notes</button>`:''}</div><div id="fascLiveMeetingMessage" role="status" class="fascLiveStatus"></div></div>`;
  }
  function openBooking(id){const b=bookings().find(x=>x.booking_id===id);if(!b)return;resetMeeting();activeBookingId=id;activeStudent={osis:sid(b.student_number),name:b.student_name||''};$l('fascLiveMeeting').innerHTML=meetingMarkup(b,b.student_name,b.student_number);renderAgenda();loadAcademic(activeStudent.osis);}
  function openStudent(osis,name=''){if(!sid(osis))return;resetMeeting();activeStudent={osis:sid(osis),name:name||studentLookup.get(sid(osis))?.name||osis};$l('fascLiveMeeting').innerHTML=meetingMarkup(null,activeStudent.name,activeStudent.osis);renderAgenda();loadAcademic(activeStudent.osis);$l('fascLiveMeeting')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
  function noteStatus(msg,level=''){const s=$l('fascLiveMeetingMessage');if(s){s.textContent=msg;s.dataset.level=level;}}
  async function loadAcademic(osis){const seq=++academicSeq;const slot=$l('fascLiveAcademic');if(!slot||!osis)return;
    const [g,a]=await Promise.allSettled([api(`/admin/grades/student?osis=${encodeURIComponent(osis)}`),api(`/admin/grades/attendance/student?osis=${encodeURIComponent(osis)}&preset=marking_period`)]);
    if(seq!==academicSeq||activeStudent?.osis!==osis||!$l('fascLiveAcademic'))return;
    const grades=g.status==='fulfilled'?g.value?.student:null;
    const att=a.status==='fulfilled'?a.value?.attendance:null;
    if(!grades&&!att){slot.textContent='No academic overview available for this student in your authorized scope. Use Student Lookup if you need more detail.';return;}
    let html='';if(grades){const courses=Array.isArray(grades.grades)?grades.grades:[];html+=`<div class="fascLiveAcademicStat">Current grades: ${Number(grades.passing_count||0)} passing • ${Number(grades.below_passing_count||0)} below passing • ${Number(grades.missing_count||0)} not entered</div><div class="fascLiveGradeList">${courses.map(r=>{const n=Number(r.grade_numeric);const grade=r.grade_numeric==null||String(r.grade_numeric).trim()===''||n===0||!Number.isFinite(n)?'Not entered':`${esc(r.grade_numeric)}%`;return `<div><span>${esc(r.course_name||r.course_code||'Course')}</span><strong>${grade}</strong></div>`;}).join('')||'<p class="muted">No grades found.</p>'}</div>`;}
    if(att){const d=att.daily_attendance_requirement||{},m=att.on_time_class_requirement||{};const fmt=p=>p==null||!Number.isFinite(Number(p))?'—':`${Math.round(Number(p)*10)/10}%`;html+=`<div class="fascLiveAcademicStat">Daily attendance: ${fmt(d.percentage)} (${Number(d.attended_days||0)}/${Number(d.denominator_days||0)} days) • On-time class meetings: ${fmt(m.percentage)}</div>`;}
    if(g.status==='rejected'||a.status==='rejected')html+='<p class="muted small">Some academic data is unavailable for your current role.</p>';slot.innerHTML=html;
  }
  function studentContactsLink(){if(!activeStudent)return '';const url=new URL('./student_contacts.html',location.href);url.searchParams.set('osis',activeStudent.osis);return url.toString();}
  function lookupLink(){if(!activeStudent)return '';const url=new URL('./student_view.html',location.href);url.searchParams.set('osis',activeStudent.osis);return url.toString();}
  async function onMeetingClick(e){const button=e.target.closest('button[data-meeting]');if(!button||!activeStudent)return;const action=button.dataset.meeting,booking=selectedBooking();
    if(action==='lookup'){window.open(lookupLink(),'_blank','noopener');return;}
    if(action==='contacts'){window.open(studentContactsLink(),'_blank','noopener');return;}
    if(action==='book'){await openBookingTools();return;}
    if(action==='walkin'){await createLiveMeeting();return;}
    if(action==='begin'&&booking?._live){if(booking.status==='arrived')await saveLiveMeeting(booking,'in_progress');return;}
    if(action==='begin'){if(booking?.status==='scheduled'){activeMeetingLocal=booking.booking_id;button.textContent='Meeting opened here';noteStatus('Meeting open on this device only. Completion will be saved to EagleNEST.');}return;}
    if(action==='no_show'){if(!booking||!canAct(booking))return;if(!confirm(`Mark ${booking.student_name} as a no-show?`))return;if(booking._live)await saveLiveMeeting(booking,'no_show');else await setBookingStatus(booking,'no_show');return;}
    if(action==='complete_only'){if(!booking||!canAct(booking))return;if(($l('fascLiveNotes')?.value||'').trim()&&!confirm('There are unsaved notes. Complete WITHOUT saving those notes?'))return;if(booking._live)await saveLiveMeeting(booking,'completed',true);else await setBookingStatus(booking,'completed');return;}
    if(action==='log'||action==='complete'){if(booking?._live)await saveLiveMeeting(booking,action==='complete'?'completed':booking.status);else await logDiscussion(action==='complete',booking);}
  }
  function canAct(b){return !!b&&(b._live?['arrived','in_progress'].includes(b.status):b.status==='scheduled')&&!proxy()&&!reportOnly()&&ownBooking(b);}
  function submissionId(){return 'fasc-live-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
  async function logDiscussion(complete,booking){if(complete&&!canAct(booking))return;const notes=($l('fascLiveNotes')?.value||'').trim(),followup=$l('fascLiveFollowup')?.checked===true;
    if(!notes&&!followup){if(complete){await setBookingStatus(booking,'completed');return;}noteStatus('Write a note or select follow-up needed before logging.');return;}
    if(!getEventId())return;if(notesRecorded){if(complete&&booking)await setBookingStatus(booking,'completed',true);else noteStatus('Discussion already logged.');return;}const button=$l('fascLiveMeeting').querySelector('[data-meeting="'+(complete?'complete':'log')+'"]');if(button)button.disabled=true;
    noteStatus('Saving conference communication…');try{
      const payload={event_id:getEventId(),student_number:activeStudent.osis,submission_id:submissionId(),contact_at_iso:new Date().toISOString(),method:'In Person',outcome:followup?'Follow-up Needed':'Spoke/Connected',notes,follow_up_needed:followup,slot_id:'',contact_assoc_id:booking?.family_contact_assoc_id||'',contact_display_name:booking?.family_contact_name||'',contact_relationship:booking?.family_relationship||'',contact_phone:booking?.family_phone||'',contact_email:booking?.family_email||''};
      await api('/admin/conferences/engagement/log',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});noteDirty=false;notesRecorded=true;
      if(complete){await setBookingStatus(booking,'completed',true);return;}
      noteStatus('Discussion logged in conference communications.','ok');if($l('fascLiveNotes'))$l('fascLiveNotes').value='';if($l('fascLiveFollowup'))$l('fascLiveFollowup').checked=followup; // EAGLENEST_FASC_FOLLOWUP_CONDITIONAL_PICKER_V6: keep flagged task available after logging
    }catch(error){noteStatus(`Notes were not saved: ${error.message}. Use Student Contacts to record this discussion, or complete without notes.`, 'error');}
    finally{if(button)button.disabled=false;}
  }
  async function setBookingStatus(b,status,notesLogged=false){if(!canAct(b))return;const root=$l('fascLiveMeeting');root?.querySelectorAll('button[data-meeting]').forEach(x=>x.disabled=true);noteStatus('Updating conference…');try{await api('/admin/conferences/booking/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({booking_id:b.booking_id,status})});await loadBundle(getEventId());resetMeeting();$l('fascLiveMeeting').innerHTML=`<p class="fascLiveSuccess">${esc(b.student_name||'Student')} — ${status==='completed'?'conference completed':'marked no-show'}${notesLogged?' and discussion logged':''}.</p><p class="muted small">Select the next appointment to continue.</p>`;showStatus('Conference updated successfully.','ok');}
    catch(error){noteStatus(`Could not update conference: ${error.message}${notesLogged?'. The communication was saved; please retry completion.':''}`,'error');root?.querySelectorAll('button[data-meeting]').forEach(x=>x.disabled=false);}
  }
  async function fetchLiveMeetings(){
    if(!getEventId()||reportOnly()||liveLoading||liveBackend==='unavailable')return;
    const eventId=getEventId();liveLoading=true;
    try{
      const result=await api(`/admin/conferences/live/list?event_id=${encodeURIComponent(eventId)}`);
      if(eventId!==getEventId())return;
      liveBackend='ready';liveMeetings=Array.isArray(result.meetings)?result.meetings:[];
      if(mode==='live')renderLive();
    }catch(error){
      if(error.status===404||error.status===405){liveBackend='unavailable';liveMeetings=[];showStatus('Live walk-in service is not deployed yet. Existing booked conferences still work.','error');}
      else showStatus(`Live meetings unavailable: ${error.message}`,'error');
    }finally{liveLoading=false;}
  }
  async function createLiveMeeting(){
    if(!activeStudent||liveBackend!=='ready'||proxy()||reportOnly())return;
    const kind=$l('fascLiveNewKind')?.value||'subject';
    if(admin()&&!selectedLane){noteStatus('Choose a specific staff lane at the top before creating a walk-in. This prevents assigning the visit to the wrong teacher.','error');return;}
    const host=selectedLane||me();
    const button=$l('fascLiveMeeting').querySelector('[data-meeting="walkin"]');
    if(button)button.disabled=true;
    noteStatus('Starting secure walk-in record…');
    try{
      const body={event_id:getEventId(),student_number:activeStudent.osis,student_name:activeStudent.name,host_email:host,meeting_kind:kind,status:'arrived'};
      const created=await api('/admin/conferences/live/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      if(created.meeting?.meeting_id){liveMeetings=[...liveMeetings.filter(x=>x.meeting_id!==created.meeting.meeting_id),created.meeting];renderLive();openBooking(`live:${created.meeting.meeting_id}`);}
      fetchLiveMeetings().catch(()=>{});
      showStatus(`${activeStudent?.name||'Student'} checked in for a ${kind} meeting.`, 'ok');
    }catch(error){noteStatus(`Walk-in not created: ${error.message}. Verify the student is in your authorized roster and the event is active.`,'error');}
    finally{if(button)button.disabled=false;}
  }
  async function saveLiveMeeting(b,nextStatus,withoutNotes=false){
    if(!b?._live||!canAct(b))return;
    const notes=withoutNotes?String(b._live.notes||''):($l('fascLiveNotes')?.value||'').trim();
    const followup=withoutNotes?b._live.follow_up_needed:$l('fascLiveFollowup')?.checked===true;
    const root=$l('fascLiveMeeting');root.querySelectorAll('button[data-meeting]').forEach(x=>x.disabled=true);
    noteStatus('Saving live meeting…');
    try{
      const result=await api('/admin/conferences/live/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:getEventId(),meeting_id:b._live.meeting_id,status:nextStatus,notes,follow_up_needed:followup})});
      noteDirty=false;
      if(result.meeting?.meeting_id){liveMeetings=liveMeetings.map(x=>x.meeting_id===result.meeting.meeting_id?result.meeting:x);renderLive();}
      fetchLiveMeetings().catch(()=>{});
      if(['completed','no_show'].includes(result.meeting?.status)){
        resetMeeting();$l('fascLiveMeeting').innerHTML=`<p class="fascLiveSuccess">${esc(b.student_name)} — ${esc(result.meeting.status)} and notes saved.</p><p class="muted small">Select another meeting to continue.</p>`;
      }else{openBooking(`live:${b._live.meeting_id}`);}
      showStatus('Live meeting saved successfully.','ok');
    }catch(error){noteStatus(`Live meeting was not saved: ${error.message}`,'error');root.querySelectorAll('button[data-meeting]').forEach(x=>x.disabled=false);}
  }
  async function openBookingTools(){if(!activeStudent)return;const wanted=activeStudent;setMode('manage',true);await selectStudent({osis:wanted.osis,name:wanted.name});const own=me();const sel=$l('staffFilter');if(sel&&[...sel.options].some(x=>x.value===own))sel.value=own;sel?.dispatchEvent(new Event('change'));$l('conferenceBookingTools')?.scrollIntoView({behavior:'smooth'});}
  function renderStudents(){const host=$l('fascLiveStudentResults'),hint=$l('fascLiveStudentHelp'),search=$l('fascLiveStudentSearch'),q=String(search?.value||'').trim().toLowerCase();const cls=$l('fascLiveClassWrap');if(!host)return;
    groupMode=$l('fascLiveGroup').value;cls.hidden=groupMode!=='classes';if(groupMode==='search'){
      hint.textContent='Search is subject to the existing EagleNEST student-directory permissions.';
      if(q.length<2){host.innerHTML='<p class="muted">Enter at least two characters to search.</p>';return;}
      fetchStudentSearch(q);return;
    }
    if(groupMode==='classes'){hint.textContent='From authorized PowerSchool-linked academic group memberships. Choose a class above.';if(!myGroups.length){host.innerHTML='<p class="muted">Class groups unavailable for this account. Use the authorized search or Student Contacts.</p>';return;}}
    else hint.textContent='Advisees are read from this conference event’s required roster snapshot.';
    const candidates=groupMode==='advisees'?(bundle?.requirement?.students||[]).filter(r=>String(r.advisor_email||'').toLowerCase()===me()||(isAllLanes()&&String(bundle?.requirement?.scope?.type||'')==='my')).map(r=>({osis:r.student_number,name:r.student_name,subtitle:r.status||'Advisee'})):availableStudents.map(x=>({osis:x.osis,name:x.name,subtitle:x.grade_level?'Grade '+x.grade_level:''}));
    const unique=[...new Map(candidates.filter(x=>sid(x.osis)).map(x=>[sid(x.osis),x])).values()].filter(x=>!q||`${x.name} ${x.osis}`.toLowerCase().includes(q)).slice(0,120);
    drawStudents(unique);if(!unique.length)host.innerHTML='<p class="muted">No students in this group. Choose another group or use authorized search.</p>';
  }
  function drawStudents(list){const root=$l('fascLiveStudentResults');if(!root)return;for(const s of list)studentLookup.set(sid(s.osis),{osis:sid(s.osis),name:s.name||s.osis});root.innerHTML=list.map(s=>`<button data-student="${esc(sid(s.osis))}" data-name="${esc(s.name||'')}" type="button"><strong>${esc(s.name||s.osis)}</strong><small>${esc(s.subtitle||'')}${s.subtitle?' • ':''}OSIS ${esc(s.osis)}</small></button>`).join('');}
  async function fetchStudentSearch(q){const seq=++searchSeq;const host=$l('fascLiveStudentResults');host.textContent='Searching authorized student directory…';try{const r=await api(`/admin/roster/search?q=${encodeURIComponent(q)}`);if(seq!==searchSeq||groupMode!=='search')return;const rows=(r.results||[]).slice(0,40).map(x=>({osis:x.osis,name:x.name,subtitle:x.grade_level?'Grade '+x.grade_level:''}));drawStudents(rows);if(!rows.length)host.textContent='No matching students.';}
    catch(error){if(seq===searchSeq)host.textContent=`Search unavailable: ${error.message}`;}
  }
  async function loadClassOptions(){if(classLoaded||!access?.can?.grades){return;}classLoaded=true;try{const r=await api('/admin/grades/overview');myGroups=(r.my_groups||[]).filter(g=>['course','section'].includes(g.type));const select=$l('fascLiveClass');const prior=select.value;select.replaceChildren();for(const g of myGroups)select.add(new Option(`${g.type==='section'?'Section':'Course'}: ${g.label||g.id}`,g.id));if(myGroups.some(g=>g.id===prior))select.value=prior;if(groupMode==='classes')loadGroupStudents();}catch(error){myGroups=[];$l('fascLiveStudentHelp').textContent=`Class scope unavailable: ${error.message}`;}}
  async function loadGroupStudents(){const group=$l('fascLiveClass')?.value;if(!group){availableStudents=[];renderStudents();return;}const seq=++searchSeq;$l('fascLiveStudentResults').textContent='Loading class roster…';try{const r=await api(`/admin/grades/students?group=${encodeURIComponent(group)}&status=all`);if(seq!==searchSeq)return;availableStudents=(r.rows||[]).map(x=>({osis:x.osis,name:x.name,grade_level:x.grade_level}));renderStudents();}catch(error){if(seq===searchSeq){availableStudents=[];$l('fascLiveStudentResults').textContent=`Class roster unavailable: ${error.message}`;}}}
  async function refresh(){if(pollBusy||!getEventId())return;pollBusy=true;const requested=getEventId();try{await loadBundle(requested);if(!bundle?.event||bundle.event.event_id!==requested){showStatus($l('pageStatus')?.textContent||'Could not refresh conference.','error');return;}lastSync=new Date();renderLive();}finally{pollBusy=false;}}
  async function tick(){if(mode!=='live'||document.hidden||pollBusy||!getEventId())return; // Do not discard unsaved meeting notes.
    await refresh();
  }
  function onBundle(){if(!initialized)return;lastSync=new Date();eventOptions();if(mode==='live'){renderLive();if(!classLoaded&&access?.can?.grades)loadClassOptions();renderStudents();fetchLiveMeetings().catch(e=>showStatus(e.message,'error'));}}
  function init(){if(initialized)return;initialized=true;template();const previous=renderBundle;renderBundle=function(){previous();onBundle();};
    window.EagleNESTFaSCLiveHub=Object.freeze({refresh,showLive:()=>setMode('live'),showManage:()=>setMode('manage'),
      // EAGLENEST_FASC_FOLLOWUPS_V4: return source IDs only for current authorized meeting.
      getFollowupContext:()=>{const b=selectedBooking();return b&&activeStudent?.osis?{
        event_id:getEventId(),source_kind:b._live?'live':'scheduled',
        source_id:b._live?.meeting_id||b.booking_id,
        student_number:activeStudent.osis,student_name:activeStudent.name,
        can_assign:!proxy()&&!reportOnly()&&ownBooking(b)&&activeEvent()?.status==='active'
      }:null;}
    });
    // Native boot runs independently. Poll safely after it has authenticated and selected an event.
    window.setInterval(()=>{tick().catch(error=>showStatus(`Live refresh failed: ${error.message}`,'error'));},POLL_MS);
    window.setInterval(()=>{if(mode==='live'&&activeEvent()){renderMetrics();renderAgenda();}},60000);
    // Class group discovery once access becomes available.
    let attempts=0;const wait=window.setInterval(()=>{attempts++;if(access){clearInterval(wait);loadClassOptions();if(bundle)onBundle();}else if(attempts>120)clearInterval(wait);},100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

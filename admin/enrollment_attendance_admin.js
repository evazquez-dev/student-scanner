// EAGLENEST_ENROLLMENT_AWARE_ATTENDANCE_V1 — Super Admin system card.
(()=>{
  'use strict';
  const root=document.getElementById('enrollmentAttendanceAdminCard');
  if(!root)return;
  const id=x=>document.getElementById(x);
  const keys=['admin_session_v1','ss_admin_session_sid_v1','my_schedule_admin_session_v1','teacher_att_admin_session_v1','admin_session_sid'];
  const api=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
  const names=['badge_grades','incentive_trips','outside_lunch_recess','mtss_streaks'];
  let settings=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const sid=()=>{for(const k of keys){try{const value=sessionStorage.getItem(k)||localStorage.getItem(k);if(value)return value;}catch{}}return '';};
  const message=(s,err=false)=>{const el=id('enrollAttendanceMessage');el.textContent=s;el.style.color=err?'var(--danger,#df7777)':'var(--muted,#9daabe)';};
  async function request(path,opts={}){
    const headers=new Headers(opts.headers||{});
    if(sid())headers.set('x-admin-session',sid());
    if(opts.body)headers.set('content-type','application/json');
    const r=await fetch(new URL(path,api),{...opts,headers,credentials:'include',cache:'no-store'});
    const j=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!r.ok||j.ok===false)throw Error(j.error||`HTTP ${r.status}`);
    return j;
  }
  function dates(){
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const prev=new Date(today+'T12:00:00Z');prev.setUTCDate(prev.getUTCDate()-1);
    const end=prev.toISOString().slice(0,10);prev.setUTCDate(prev.getUTCDate()-29);
    id('enrollmentStart').value=prev.toISOString().slice(0,10);
    id('enrollmentEnd').value=end;
  }
  async function load(){
    const j=await request('/admin/enrollment_attendance/settings');settings=j.settings;
    for(const name of names)id('enrollFlag_'+name).checked=settings.switches?.[name]===true;
    id('enrollAttendanceRevision').textContent=`Settings revision ${settings.revision} · updated ${settings.updated_at_iso||'never'}${settings.updated_by_email?' by '+settings.updated_by_email:''}`;
    message('All switches are off until a Super Admin explicitly saves them. Historical attendance records are never rewritten.');
  }
  async function save(){
    if(!settings)await load();
    const switches={};for(const name of names)switches[name]=id('enrollFlag_'+name).checked;
    if(!confirm('Save enrollment-aware calculation switches? Enabled consumers may show different eligibility results. No historical records will be rewritten.'))return;
    const j=await request('/admin/enrollment_attendance/settings',{
      method:'POST',body:JSON.stringify({switches,expected_revision:settings.revision})
    });
    settings=j.settings;
    id('enrollAttendanceRevision').textContent=`Settings revision ${settings.revision} · updated ${settings.updated_at_iso}`;
    message('Settings saved. Review the source comparison and affected student results before enabling other switches.');
  }
  function query(){const q=new URLSearchParams({start:id('enrollmentStart').value,end:id('enrollmentEnd').value});return q;}
  async function health(){
    message('Loading historical canonical membership health…');
    const j=await request('/admin/enrollment_attendance/health?'+query());
    id('enrollmentAttendanceHealth').textContent=JSON.stringify(j,null,2);
    message(`${j.verified_days}/${j.canonical_days} imported canonical days have verified membership counts; ${j.incomplete_days?.length||0} mismatched manifests, ${j.orphan_official_attendance_sample?.length||0} sample orphan attendance rows.`);
  }
  function summary(s){
    if(!s)return 'Student has no row in this historical source window.';
    const d=s.daily||{},m=s.meeting||{},q=s.data_quality||{};
    return `Daily: ${d.status} · ${d.attended_days} attended, ${d.absent_days} absent, ${d.denominator_days} days, ${d.percentage??'—'}%\n`+
      `Class on-time: ${m.status} · ${m.on_time_meetings}/${m.denominator_meetings}, ${m.percentage??'—'}%\n`+
      `Missing official days: ${(q.missing_daily_dates||[]).length}\n`+
      `Verified pre-/outside-enrollment exclusions: ${(q.excluded_not_enrolled_dates||[]).length}`;
  }
  async function compare(){
    const osis=id('enrollmentCompareOsis').value.trim();
    if(!/^\d{5,15}$/.test(osis))throw Error('Enter a valid student OSIS number.');
    const q=query();q.set('osis',osis);
    message('Computing original and proposed attendance side by side…');
    const j=await request('/admin/enrollment_attendance/compare?'+q);
    id('enrollmentAttendanceCompare').textContent=
      `PowerSchool current episode: ${j.active_current_enrollment?.entry_date||'Not verified'}\n`+
      `Verified canonical dates: ${j.verified_membership?.verified_days??'—'} · enrolled: ${j.verified_membership?.enrolled_school_days??'—'} · not enrolled: ${j.verified_membership?.verified_not_enrolled_days??'—'}\n`+
      `Observed enrollment episodes: ${JSON.stringify(j.verified_membership?.observed_episodes||[])}\n`+
      `Earlier membership than current nightly entry: ${j.verified_membership?.current_entry_date_has_earlier_verified_membership??'Unknown'}\n\n`+
      `CURRENT CALCULATION\n${summary(j.original)}\n\n`+
      `ENROLLMENT-AWARE CALCULATION\n${summary(j.enrollment_aware)}\n\n`+
      `Note: ${j.note}`;
    message('Comparison complete (read-only). No grade, badge, trip, lunch, or intervention state was changed.');
  }
  id('enrollSettingsReload')?.addEventListener('click',()=>load().catch(e=>message(e.message,true)));
  id('enrollSettingsSave')?.addEventListener('click',()=>save().catch(e=>message(e.message,true)));
  id('enrollHealthRefresh')?.addEventListener('click',()=>health().catch(e=>message(e.message,true)));
  id('enrollCompareRun')?.addEventListener('click',()=>compare().catch(e=>message(e.message,true)));
  dates();
  // Follow the existing System Admin session initialization without reading secrets.
  let tries=0;const timer=setInterval(async()=>{
    if(++tries>60){clearInterval(timer);return;}
    if(!sid()||document.hidden)return;
    try{await load();clearInterval(timer);}catch{}
  },1500);
})();

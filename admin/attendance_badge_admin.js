// EAGLENEST_ATTENDANCE_BADGE_ELIGIBILITY_V1
// Additive System Administration panel. No badge grants/revocations from this page.
(() => {
  'use strict';
  const root=document.getElementById('badgeAttendanceAdminCard');
  if(!root)return;
  const api=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
  const keys=['admin_session_v1','ss_admin_session_sid_v1','my_schedule_admin_session_v1','teacher_att_admin_session_v1','admin_session_sid'];
  const id=x=>document.getElementById(x);
  let current=null,lastPreview=null;
  function sid(){for(const k of keys){let v='';try{v=sessionStorage.getItem(k)||localStorage.getItem(k)||'';}catch{}if(v)return v;}return '';}
  async function request(path,init={}){
    const headers=new Headers(init.headers||{});if(sid())headers.set('x-admin-session',sid());
    const r=await fetch(new URL(path,api),{...init,credentials:'include',headers,cache:'no-store'});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||data.ok===false)throw new Error(data.error||`HTTP ${r.status}`);
    return data;
  }
  const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  function localDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  function isoAdd(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function fmt(p){return p==null?'—':`${Number(p).toFixed(2).replace(/\.00$/,'')}%`;}
  function setMessage(text,error=false){const el=id('badgeAttendanceAdminMessage');el.textContent=text;el.style.color=error?'var(--danger,#d55)':'var(--muted,#8da2b5)';}
  function renderPreview(){
    const result=lastPreview;if(!result)return;
    const {summary,coverage}=result;
    id('badgeAttendanceCounts').textContent=`${summary.eligible} eligible · ${summary.not_eligible} not eligible · ${summary.pending_data} pending data · ${result.school_days_in_source} official school dates`;
    const search=String(id('badgeAttendanceSearch').value||'').trim().toLowerCase();
    const students=(result.students||[]).filter(r=>!search||String(r.student_name||'').toLowerCase().includes(search)||String(r.student_number||'').includes(search));
    id('badgeAttendancePreviewBody').innerHTML=students.map(row=>{
      const d=row.daily_attendance_requirement,c=row.on_time_class_requirement,b=row.attendance_badge;
      const pending=(row.data_quality?.missing_meeting_dates||[]).length;
      const note=[pending?`${pending} missing meeting export(s)`:null,row.data_quality?.outside_coverage?'outside official daily date coverage':null,
        row.data_quality?.unknown_meeting_count?`${row.data_quality.unknown_meeting_count} unmapped meeting code(s)`:null]
        .filter(Boolean).join(' · ');
      return `<tr><td><strong>${esc(row.student_name||row.student_number)}</strong><br><small>${esc(row.student_number)} · ${esc(row.grade||'—')}</small></td>
        <td>${esc(fmt(d.percentage))}<br><small>${d.attended_days}/${d.denominator_days} school days</small></td>
        <td>${esc(d.status.replaceAll('_',' '))}</td>
        <td>${esc(fmt(c.percentage))}<br><small>${c.on_time_meetings}/${c.denominator_meetings} meetings</small></td>
        <td>${esc(c.status.replaceAll('_',' '))}</td>
        <td><strong>${esc(b.status.replaceAll('_',' '))}</strong>${note?`<br><small>${esc(note)}</small>`:''}</td></tr>`;
    }).join('')||'<tr><td colspan="6">No matching student rows. Check imported PowerSchool data and the selected dates.</td></tr>';
    id('badgeAttendanceCoverage').textContent=`Official daily source: ${coverage.first_official_daily_date||'not imported'} – ${coverage.last_official_daily_date||'not imported'}. `+
      `Meeting imports in range: ${result.imported_meeting_days}. Badge daily imports in range: ${result.imported_badge_daily_days}. `+
      `Missing source dates are pending, not counted as Present.`;
  }
  async function loadSettings(){
    const j=await request('/admin/attendance_badge/settings');current=j.settings;
    id('badgeDailyThreshold').value=current.daily_threshold_pct;
    id('badgeClassThreshold').value=current.class_threshold_pct;
    id('badgeRulesRevision').textContent=`Revision ${current.revision} · updated ${current.updated_at_iso||'initial settings'}${current.updated_by_email?' by '+current.updated_by_email:''}`;
    setMessage('Attendance Badge settings loaded. Both requirements must be MET for overall ELIGIBLE.');
  }
  async function saveSettings(){
    if(!current)await loadSettings();
    const d=Number(id('badgeDailyThreshold').value),c=Number(id('badgeClassThreshold').value);
    if(!Number.isFinite(d)||!Number.isFinite(c)||d<0||d>100||c<0||c>100){setMessage('Thresholds must be between 0 and 100.',true);return;}
    id('badgeSaveRules').disabled=true;
    try{
      const j=await request('/admin/attendance_badge/settings',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({daily_threshold_pct:d,class_threshold_pct:c,expected_revision:current.revision})
      });
      current=j.settings;
      id('badgeRulesRevision').textContent=`Revision ${current.revision} · saved by ${current.updated_by_email}`;
      setMessage('Saved. The eligibility preview will recalculate using the new thresholds; no previously awarded badge is changed.');
      await loadPreview();
    }catch(e){setMessage('Could not save: '+String(e?.message||e),true);}
    finally{id('badgeSaveRules').disabled=false;}
  }
  async function loadPreview(){
    const start=id('badgeStart').value,end=id('badgeEnd').value;
    if(!start||!end||start>end){setMessage('Choose a valid start/end date range.',true);return;}
    id('badgeLoadPreview').disabled=true;setMessage('Calculating official attendance requirements…');
    try{
      const query=new URLSearchParams({start,end});
      const student=id('badgeStudentNumber').value.trim();if(student)query.set('student_number',student);
      lastPreview=await request('/admin/attendance_badge/eligibility?'+query);
      renderPreview();setMessage('Preview refreshed. This calculates eligibility only; it does not award or revoke badges.');
    }catch(e){setMessage('Could not calculate: '+String(e?.message||e),true);}
    finally{id('badgeLoadPreview').disabled=false;}
  }
  let yesterday=isoAdd(localDate(),-1);
  while([0,6].includes(new Date(yesterday+'T12:00:00Z').getUTCDay()))yesterday=isoAdd(yesterday,-1);
  const dow=new Date(yesterday+'T12:00:00Z').getUTCDay();
  id('badgeStart').value=isoAdd(yesterday,-((dow+6)%7));
  id('badgeEnd').value=yesterday;
  id('badgeSaveRules')?.addEventListener('click',saveSettings);
  id('badgeLoadRules')?.addEventListener('click',()=>loadSettings().catch(e=>setMessage(String(e?.message||e),true)));
  id('badgeLoadPreview')?.addEventListener('click',loadPreview);
  id('badgeAttendanceSearch')?.addEventListener('input',renderPreview);
  // Separate from admin.js module scope; it uses the same existing session token.
  // Wait for Admin sign-in to populate its session, but never show settings to a non-super-admin.
  let tries=0;const timer=setInterval(async()=>{
    tries++;
    if(!sid()||document.hidden)return;
    try{await loadSettings();clearInterval(timer);}catch(e){
      if(tries>=60)clearInterval(timer);
    }
  },1500);
})();

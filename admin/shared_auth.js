// EAGLENEST_SHARED_AUTH_V1
(() => {
  const SESSION_KEYS = [
  "ss_admin_session_sid_v1",
  "admin_session_v1",
  "admin_session_sid",
  "admin_roles_admin_session_v1",
  "after_school_monitor_admin_session_v1",
  "attendance_change_admin_session_v1",
  "attendance_outreach_admin_session_v1",
  "attendance_status_admin_session_v1",
  "behavior_history_admin_session_v1",
  "communications_admin_session_v1",
  "conference_scheduler_admin_session_v1",
  "counselor_dashboard_admin_session_v1",
  "coverage_planner_admin_session_v1",
  "dreamer_of_week_admin_session_v1",
  "early_dismissal_admin_session_v1",
  "esas_admin_session_v1",
  "esas_guest_session_v1",
  "excused_apply_admin_session_v1",
  "grades_admin_session_v1",
  "hallway_admin_session_v1",
  "mtss_admin_session_v1",
  "my_schedule_admin_session_v1",
  "notifications_admin_session_v1",
  "phone_pass_admin_session_v1",
  "reflection_hold_admin_session_v1",
  "scan_injector_admin_session_v1",
  "senior_lunch_audit_admin_session_v1",
  "staff_pull_admin_session_v1",
  "student_contacts_admin_session_v1",
  "student_scans_admin_session_v1",
  "supervised_lunch_admin_session_v1",
  "teacher_att_admin_session_v1",
  "teacher_trace_lookup_admin_session_v1",
  "visitor_desk_admin_session_v1"
];
  function stores(){const a=[];try{a.push(sessionStorage)}catch{}try{a.push(localStorage)}catch{}return a}
  function clean(v){v=String(v||'').trim();return v&&v.length<=512?v:''}
  function getSid(){for(const s of stores())for(const k of SESSION_KEYS){try{const v=clean(s.getItem(k));if(v)return v}catch{}}return ''}
  function setSid(v){const sid=clean(v);if(!sid)return '';for(const s of stores())for(const k of SESSION_KEYS){try{if(s.getItem(k)!==sid)s.setItem(k,sid)}catch{}}return sid}
  function sync(){const sid=getSid();if(sid)setSid(sid);return sid}
  function clear(){for(const s of stores())for(const k of SESSION_KEYS){try{s.removeItem(k)}catch{}}}
  window.EAGLENEST_AUTH=Object.freeze({version:1,canonicalKey:'ss_admin_session_sid_v1',sessionKeys:Object.freeze([...SESSION_KEYS]),getSid,setSid,sync,clear});
  sync();
  window.addEventListener('pageshow',sync);
  window.addEventListener('storage',e=>{if(SESSION_KEYS.includes(String(e?.key||''))&&e?.newValue)sync()});
})();

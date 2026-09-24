// admin/nav.js
(() => {
  const metaApiBase = (document.querySelector('meta[name="api-base"]')?.content || '').trim();
  const API_BASE = (metaApiBase ? metaApiBase.replace(/\/*$/, '') : location.origin) + '/';
  const DEMO_MODE = new URLSearchParams(location.search).get('demo') === '1';

  const LS_OPEN = 'ss_nav_open_v1';
  const LS_SECTION_OPEN = 'ss_nav_sections_open_v1'; // EAGLENEST_COMPACT_ACCORDION_NAV_V1
  const ESAS_TAKEOVER_POLL_MS = 4000;
  // Give authenticated admin pages a consistent installable Staff PWA identity.
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = './manifest.webmanifest';
    document.head.appendChild(manifestLink);
  }


  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const BRAND = window.EAGLENEST_BRAND?.name || 'EagleNEST';
  const MODULES = window.EAGLENEST_BRAND?.modules || {
    my_schedule: 'My Schedule',
    grades: 'Grades',
    teacher_attendance: 'Teacher Attendance',
    teacher_trace_lookup: 'Attendance Trace Lookup',
    attendance_status: 'Attendance Status',
    attendance_outreach: 'Attendance Outreach',
    outside_lunch: 'Outside Lunch Eligibility', // EAGLENEST_OUTSIDE_LUNCH_V1
    recess_eligibility: 'Recess Eligibility', // EAGLENEST_RECESS_OUTIN_V1
    student_scans: 'Student Scan Report',
    scan_injector: 'Scan Injector',
    student_view: 'Student Snapshot',
    communications: 'Parent & Family Communications',
    calls: 'Calls',
    coverage_planner: 'Coverage Planner',
    student_contacts: 'Student Contacts',
    counselor_dashboard: 'Counselor Dashboard', // EAGLENEST_COUNSELOR_DASHBOARD_V1
    conference_scheduler: 'Student & Family Conferences', // EAGLENEST_FAMILY_CONFERENCES_V1
    contact_review: 'Contact Correction Review',
    hallway: 'Hallway Monitor',
    esas: 'Emergency Accountability',
    visitor_desk: 'Visitor Desk',
    early_dismissal: 'Early Dismissal',
    after_school_monitor: 'After-School Monitor',
    staff_pull: 'Staff Pull',
    phone_pass: 'Phone Pass',
    phone_free_pass: 'Free Phone Pass', // EAGLENEST_DAILY_FREE_PHONE_PASS_V1
    notifications: 'My Settings',
    incident_creator: 'Incident Creator',
    behavior_history: 'Logged Behaviors',
    fidelity_dashboard: 'Operational Health',
    mtss: 'MTSS Case Management', // EAGLENEST_MTSS_V1_NAV_LABEL
    attendance_change: 'Attendance Corrections',
    supervised_lunch: 'Supervised Lunch',
    reflection_hold: 'Reflection Hold',
    dreamer_of_week: 'Dreamer of the Week',
    excused_apply: 'Attendance Corrections', // legacy alias
    admin_roles: 'Roles & Access',
    admin: 'System Administration'
  };

  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const NAV_SESSION_KEYS = [
    'early_dismissal_admin_session_v1',
    'esas_admin_session_v1',
    'ss_admin_session_sid_v1',
    'teacher_att_admin_session_v1',
    'my_schedule_admin_session_v1',
    'grades_admin_session_v1',
    'teacher_trace_lookup_admin_session_v1',
    'attendance_status_admin_session_v1',
    'attendance_outreach_admin_session_v1',
    'outside_lunch_admin_session_v1',
    'recess_admin_session_v1',
    'after_school_monitor_admin_session_v1',
    'visitor_desk_admin_session_v1',
    'staff_pull_admin_session_v1',
    'phone_pass_admin_session_v1',
    'phone_free_pass_admin_session_v1',
    'notifications_admin_session_v1',
    'student_scans_admin_session_v1',
    'conference_scheduler_admin_session_v1', // EAGLENEST_FAMILY_CONFERENCES_V1
    'counselor_dashboard_admin_session_v1', // EAGLENEST_COUNSELOR_DASHBOARD_V1
    'mtss_admin_session_v1', // EAGLENEST_MTSS_V1_NAV_SESSION
    'communications_admin_session_v1',
    'coverage_planner_admin_session_v1',
    'scan_injector_admin_session_v1',
    'behavior_history_admin_session_v1',
    'admin_roles_admin_session_v1',
    'attendance_change_admin_session_v1',
    'supervised_lunch_admin_session_v1',
    'reflection_hold_admin_session_v1',
    'dreamer_of_week_admin_session_v1',
    'excused_apply_admin_session_v1', // legacy
    'admin_session_v1',
    'admin_session_sid' // legacy generic key
  ];

  function clearStoredAdminSessionSid(){
    try{
      for (const k of NAV_SESSION_KEYS){
        sessionStorage.removeItem(k);
        localStorage.removeItem(k);
      }
    }catch{}
  }

  function getStoredAdminSessionSid(){
    try{
      for (const k of NAV_SESSION_KEYS){
        const v = String(sessionStorage.getItem(k) || localStorage.getItem(k) || '').trim();
        if (v) return v;
      }
    }catch{}
    return '';
  }

  function setStoredAdminSessionSid(sid){
    const v = String(sid || '').trim();
    if (!v) return;
    try{
      for (const k of NAV_SESSION_KEYS){
        sessionStorage.setItem(k, v);
        localStorage.setItem(k, v);
      }
    }catch{}
  }

  function stashAdminSessionFromResponse(resp){
    try{
      const sid = String(
        resp?.headers?.get(ADMIN_SESSION_HEADER) ||
        resp?.headers?.get('X-Admin-Session') ||
        ''
      ).trim();
      if (sid) setStoredAdminSessionSid(sid);
    }catch{}
  }

  async function adminFetch(path, init = {}) {
    const u = new URL(path, API_BASE);
    const headers = new Headers(init.headers || {});
    const sid = getStoredAdminSessionSid();
    if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);

    const resp = await fetch(u, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });

    stashAdminSessionFromResponse(resp);
    return resp;
  }


  function isVisitorPage(){
    return /visitor_desk\.html$/i.test(location.pathname || '');
  }

  function isEsasPage(){
    return /esas\.html$/i.test(location.pathname || '');
  }

  function isEsasTakeoverExemptPage(){
    // Visitor Desk must remain usable during an emergency. Public visitor,
    // student, scanner, and kiosk surfaces live outside /admin/ and never load
    // this shared admin navigation guard.
    return isEsasPage() || isVisitorPage();
  }

  let esasTakeoverInFlight = false;
  let esasRedirecting = false;

  async function refreshEsasTakeover(){
    if (DEMO_MODE || isEsasTakeoverExemptPage() || esasRedirecting || esasTakeoverInFlight) return null;
    esasTakeoverInFlight = true;
    try{
      const r = await adminFetch('/admin/esas/status', { method:'GET' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) return null;
      if (j.active === true && j.incident?.incident_id){
        esasRedirecting = true;
        location.replace('./esas.html?takeover=1');
      }
      return j;
    }catch{
      // Never redirect from a guessed or stale client-side state. ESAS takeover
      // requires a fresh authenticated server response.
      return null;
    }finally{
      esasTakeoverInFlight = false;
    }
  }

  let practiceBannerResizeObserver = null;

  function syncPracticeBannerLayout(el){
    if (!el || !document.body) return;
    const height = Math.max(0, Math.ceil(el.getBoundingClientRect().height || 0));
    document.documentElement.style.setProperty('--eaglenest-practice-banner-height', `${height}px`);
    if (!document.body.dataset.practiceBannerOffsetApplied){
      document.body.dataset.practiceBannerOffsetApplied = '1';
      document.body.dataset.practiceBannerOriginalPaddingTop = getComputedStyle(document.body).paddingTop || '0px';
    }
    document.body.style.paddingTop = `calc(${document.body.dataset.practiceBannerOriginalPaddingTop} + ${height}px)`;
  }

  function clearPracticeBannerLayout(){
    try{ practiceBannerResizeObserver?.disconnect(); }catch{}
    practiceBannerResizeObserver = null;
    document.documentElement.style.setProperty('--eaglenest-practice-banner-height', '0px');
    if (document.body?.dataset?.practiceBannerOffsetApplied){
      document.body.style.paddingTop = document.body.dataset.practiceBannerOriginalPaddingTop || '';
      delete document.body.dataset.practiceBannerOffsetApplied;
      delete document.body.dataset.practiceBannerOriginalPaddingTop;
    }
  }

  function renderSystemModeBanner(info){
    let el = document.getElementById('eaglenestSystemModeBanner');
    const practice = info?.practice === true || String(info?.mode || '').toLowerCase() === 'practice';
    if (!practice){
      if (el) el.remove();
      clearPracticeBannerLayout();
      document.documentElement.dataset.systemMode = 'live';
      return;
    }
    document.documentElement.dataset.systemMode = 'practice';
    if (!el){
      el = document.createElement('div');
      el.id = 'eaglenestSystemModeBanner';
      Object.assign(el.style, {
        position:'fixed', left:'0', right:'0', top:'0', zIndex:'2147483646',
        padding:'10px 54px', textAlign:'center', fontWeight:'900', letterSpacing:'.02em',
        background:'#f59e0b', color:'#111827', borderBottom:'2px solid rgba(17,24,39,.4)',
        boxShadow:'0 4px 16px rgba(0,0,0,.28)'
      });
      document.body.appendChild(el);
    }
    el.textContent = isEsasPage()
      ? '🧪 PRACTICE MODE is active elsewhere — ESAS IS LIVE AND PERSISTENT'
      : (isVisitorPage()
          ? '🧪 PRACTICE MODE is active elsewhere — VISITOR MANAGEMENT IS LIVE AND PERSISTENT'
          : '🧪 PRACTICE MODE — activity here is temporary, will be purged, and will NOT be exported. Visitor Management remains LIVE.');

    // Measure the real banner height so wrapped text on phones/tablets also
    // pushes both the page content and the fixed navigation down correctly.
    syncPracticeBannerLayout(el);
    if (!practiceBannerResizeObserver && 'ResizeObserver' in window){
      practiceBannerResizeObserver = new ResizeObserver(() => syncPracticeBannerLayout(el));
      practiceBannerResizeObserver.observe(el);
    }
  }

  let viewAsBannerResizeObserver = null;
  function syncViewAsBannerLayout(el){
    const height = Math.max(0, Math.ceil(el?.getBoundingClientRect?.().height || 0));
    document.documentElement.style.setProperty('--eaglenest-view-as-banner-height', `${height}px`);
  }
  function clearViewAsBanner(){
    try{ viewAsBannerResizeObserver?.disconnect(); }catch{}
    viewAsBannerResizeObserver = null;
    document.getElementById('eaglenestViewAsBanner')?.remove();
    document.documentElement.style.setProperty('--eaglenest-view-as-banner-height', '0px');
    delete document.documentElement.dataset.viewAs;
  }
  function renderViewAsBanner(viewAs){
    if (!viewAs?.active){ clearViewAsBanner(); return; }
    document.documentElement.dataset.viewAs = 'true';
    let el = document.getElementById('eaglenestViewAsBanner');
    if (!el){
      el = document.createElement('div');
      el.id = 'eaglenestViewAsBanner';
      Object.assign(el.style, {
        position:'sticky', top:'var(--eaglenest-practice-banner-height, 0px)', zIndex:'2147483645',
        display:'flex', alignItems:'center', justifyContent:'center', gap:'12px', flexWrap:'wrap',
        padding:'9px 54px', textAlign:'center', fontWeight:'900', letterSpacing:'.01em',
        background:'#7c3aed', color:'#fff', borderBottom:'2px solid rgba(255,255,255,.28)',
        boxShadow:'0 4px 14px rgba(0,0,0,.2)'
      });
      document.body.prepend(el);
    }
    const target = viewAs.target || {};
    const actor = viewAs.actor || {};
    el.replaceChildren();
    const text = document.createElement('span');
    text.textContent = `👁 VIEWING AS: ${target.name || target.email || 'Staff'}${target.email ? ` (${target.email})` : ''} — READ ONLY`;
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.textContent = 'Exit View';
    Object.assign(exit.style, {
      border:'1px solid rgba(255,255,255,.8)', borderRadius:'999px', padding:'5px 12px',
      background:'rgba(255,255,255,.14)', color:'#fff', fontWeight:'900', cursor:'pointer'
    });
    exit.title = actor.email ? `Return to ${actor.email}` : 'Return to Super Admin';
    exit.addEventListener('click', async () => {
      exit.disabled = true;
      try{
        const r = await adminFetch('/admin/session/view_as', {
          method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ email:'' })
        });
        const j = await r.json().catch(()=>({}));
        if (!r.ok || !j?.ok) throw new Error(j?.message || j?.error || `HTTP ${r.status}`);
        location.href = './index.html';
      }catch(e){
        exit.disabled = false;
        alert(`Could not exit View as Teacher: ${e?.message || e}`);
      }
    });
    el.append(text, exit);
    syncViewAsBannerLayout(el);
    if (!viewAsBannerResizeObserver && 'ResizeObserver' in window){
      viewAsBannerResizeObserver = new ResizeObserver(() => syncViewAsBannerLayout(el));
      viewAsBannerResizeObserver.observe(el);
    }
  }

  async function refreshSystemMode(){
    try{
      const r = await fetch(new URL('/system/mode', API_BASE), { cache:'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok){
        renderSystemModeBanner(j);
        try{ window.dispatchEvent(new CustomEvent('eaglenest-system-mode', { detail:j })); }catch{}
        return j;
      }
    }catch{}
    return null;
  }
  function currentFile() {
    const p = (location.pathname || '').split('/').pop() || '';
    return p || 'index.html';
  }

  function wantsOffset() {
    // teacher_attendance has a fixed top-left button; avoid overlap
    return !!(document.getElementById('viewToggleBtn') || document.querySelector('.viewToggle'));
  }

  async function getAccess() {
    if (DEMO_MODE) {
      return {
        ok: true,
        email: 'demo@example.invalid',
        role: 'demo',
        can: {
          teacher_attendance: true,
          my_schedule: true,
          fidelity: true
        }
      };
    }

    // Preferred: one fast call
    try {
      const r = await adminFetch('/admin/access', { method: 'GET' });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) return j;
    } catch {}

    // Fallback (if you haven’t deployed worker patch yet): session-check + probe
    try {
      const r = await adminFetch('/admin/session/check', { method: 'GET' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) return { ok:false };

      const role = String(j.role || '');
      const isSuperAdmin = role === 'super_admin';
      const isAdminLike = role === 'super_admin' || role === 'admin';
      const out = {
        ok:true,
        email: j.email || null,
        role,
        actor_email: j.actor_email || j.email || null,
        actor_role: j.actor_role || j.role || null,
        view_as: j.view_as || null,
        can: {
          super_admin: isSuperAdmin,
          admin: isAdminLike,
          admin_dashboard: isSuperAdmin,
          admin_roles: isSuperAdmin,
          hallway: isAdminLike,
          after_school_monitor: isAdminLike,
          staff_pull: isAdminLike,
          visitor_desk: isAdminLike,
          early_dismissal: true,
          teacher_attendance: true,
          grades: true,
          attendance_status: isAdminLike,
          attendance_outreach: isAdminLike,
          coverage_planner: isAdminLike,
          outside_lunch: isAdminLike,
          recess_eligibility: isAdminLike,
          student_scans: true,
          student_view: isSuperAdmin,
          student_contacts: true,
          counselor_dashboard: isSuperAdmin, // EAGLENEST_COUNSELOR_DASHBOARD_V1
          contact_review: isAdminLike,
          incident_creator: true,
          notifications: true,
          behavior_history: true,
          supervised_lunch: true,
          reflection_hold: true,
          dreamer_of_week: true,
          dow_manage: isAdminLike,
          phone_pass: isAdminLike,
          phone_free_pass: isAdminLike,
          phone_dashboard: isAdminLike,
          teacher_trace_lookup: isAdminLike,
          attendance_change: isSuperAdmin,
          excused_apply: isSuperAdmin // legacy alias
        }
      };

      try {
        const hr = await adminFetch('/admin/hallway_state_monitor', { method: 'GET' });
        out.can.hallway = hr.ok;
        out.can.after_school_monitor = hr.ok;
      } catch {}
      try {
        const sr = await adminFetch('/admin/staff_pull/options', { method: 'GET' });
        out.can.staff_pull = sr.ok;
      } catch {}
      try {
        const pr = await adminFetch('/admin/phone_pass/options', { method: 'GET' });
        out.can.phone_pass = pr.ok;
      } catch {}

      try {
        const cr = await adminFetch('/admin/calls/config', { method: 'GET' });
        out.can.phone_dashboard = cr.ok;
        if (cr.ok) {
          const cj = await cr.json().catch(() => ({}));
          out.phone_extension = cj?.my_extension || null;
        }
      } catch {}

      return out;
    } catch {
      return { ok:false };
    }
  }

  function mountNav(access) {
    if (document.getElementById('ssNavDrawer') || document.getElementById('ssNavToggle')) return;
    if (!access?.ok) return;

    renderViewAsBanner(access?.view_as || null);
    if (wantsOffset()) document.body.classList.add('ssNav-offset');

    // Toggle
    const btn = document.createElement('button');
    btn.id = 'ssNavToggle';
    btn.type = 'button';
    btn.textContent = '\u2630';
    btn.title = 'Open navigation';
    btn.setAttribute('aria-label', 'Open navigation');

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'ssNavBackdrop';

    // Drawer
    const drawer = document.createElement('aside');
    drawer.id = 'ssNavDrawer';
    drawer.setAttribute('role', 'navigation');
    drawer.setAttribute('aria-label', `${BRAND} navigation`);

    const title = document.createElement('div');
    title.className = 'ssNavTitle';
    title.textContent = BRAND;

    const meta = document.createElement('div');
    meta.className = 'ssNavMeta';
    const roleLabel = access.role === 'super_admin'
      ? 'super admin'
      : (access.role === 'admin' ? 'admin' : access.role || '');
    meta.textContent = access?.view_as?.active
      ? `${access.email || '\u2014'}${roleLabel ? ` (${roleLabel})` : ''} · read-only preview`
      : `${access.email || '\u2014'}${roleLabel ? ` (${roleLabel})` : ''}`;

    const linksWrap = document.createElement('div');
    linksWrap.className = 'ssNavLinks';

    const sections = [
      {
        section_key: 'emergency',
        title: 'Emergency',
        always_open: true,
        items: [
          { key:'esas', label: MODULES.esas || 'Emergency Accountability', href:'./esas.html', description:'Live emergency student accountability' },
        ]
      },
      {
        section_key: 'attendance',
        title: 'Attendance & Today',
        items: [
          { key:'my_schedule', label: MODULES.my_schedule || 'My Schedule', href:'./my_schedule.html', description:"Today's classes and schedule" },
          { key:'teacher_attendance', label: MODULES.teacher_attendance || 'Teacher Attendance', href:'./teacher_attendance.html', description:'Class attendance and roster actions' },
          { key:'attendance_status', label: MODULES.attendance_status || 'Attendance Status', href:'./attendance_status.html', description:'Period attendance audit and status' },
          { key:'attendance_outreach', label: MODULES.attendance_outreach || 'Attendance Outreach', href:'./attendance_outreach.html', description:'Morning absence and late outreach' },
          { key:'attendance_change', label: MODULES.attendance_change || MODULES.excused_apply || 'Attendance Corrections', href:'./attendance_change.html', description:'Bulk attendance-code corrections' },
          { key:'coverage_planner', label: MODULES.coverage_planner || 'Coverage Planner', href:'./coverage_planner.html', description:"Today's staff coverage gaps" },
        ]
      },
      {
        section_key: 'students_families',
        title: 'Students & Families',
        items: [
          { key:'student_view', label: MODULES.student_view || 'Student Lookup', href:'./student_view.html', description:'Student dashboard, location and attendance' },
          { key:'grades', label: MODULES.grades || 'Grades', href:'./grades.html', description:'Current grades, sections, advisories and grade history' },
          { key:'gradebook_analytics', label:'Gradebook Analytics', href:'./gradebook_analytics.html', description:'Weekly, role-scoped gradebook assignment and score-entry snapshots' },
          { key:'student_scans', label: MODULES.student_scans || 'Student Scan Report', href:'./student_scans.html', description:'Scan and bathroom history' },
          { key:'communications', label: MODULES.communications || 'Parent & Family Communications', href:'./communications.html', description:'Outreach, required communication and follow-ups' },
          { key:'phone_dashboard', label: MODULES.calls || 'Calls', href:'./calls.html', description:'Live calls, recent calls and follow-up logging' },
          { key:'student_contacts', label: MODULES.student_contacts || 'Student Contacts', href:'./student_contacts.html', description:'Family contacts and communication tools' },
          { key:'conference_scheduler', label: MODULES.conference_scheduler || 'Student & Family Conferences', href:'./conferences.html', description:'Conference scheduling and appointments' },
        ]
      },
      {
        section_key: 'support_culture',
        title: 'Support & Culture',
        items: [
          { key:'counselor_dashboard', label: MODULES.counselor_dashboard || 'Counselor Dashboard', href:'./counselor_dashboard.html', description:'Counselor notes and follow-ups' },
          { key:'mtss', label: MODULES.mtss || 'MTSS Case Management', href:'./mtss.html', description:'MTSS tiers, cases and interventions' },
          { key:'supervised_lunch', label: MODULES.supervised_lunch || 'Supervised Lunch', href:'./supervised_lunch.html', description:'Supervised lunch assignments' },
          { key:'reflection_hold', label: MODULES.reflection_hold || 'Reflection Hold', href:'./reflection_hold.html', description:'After-school reflection holds' },
          { key:'incident_creator', label: MODULES.incident_creator || 'Incident Creator', href:'./incident_creator.html', description:'Create and submit incident reports' },
          { key:'behavior_history', label: MODULES.behavior_history || 'Logged Behaviors', href:'./behavior_history.html', description:'Review and edit behavior logs' },
          { key:'dreamer_of_week', label: MODULES.dreamer_of_week || 'Dreamer of the Week', href:'./dreamer_of_week.html', description:'Student recognition selections and history' },
        ]
      },
      {
        section_key: 'operations',
        title: 'Operations',
        items: [
          { key:'hallway', label: MODULES.hallway || 'Hallway Monitor', href:'./hallway.html', description:'Live student locations' },
          { key:'staff_pull', label: MODULES.staff_pull || 'Staff Pull', href:'./staff_pull.html', description:'Pull and release students' },
          { key:'phone_pass', label: MODULES.phone_pass || 'Phone Pass', href:'./phone_pass.html', description:'Phone checkout, pickup and return workflow' },
          { key:'phone_free_pass', label: MODULES.phone_free_pass || 'Free Phone Pass', href:'./phone_free_pass.html', description:'Build today’s one-free-pickup student list' },
          { key:'outside_lunch', label: MODULES.outside_lunch || 'Outside Lunch Eligibility', href:'./outside_lunch.html', description:'Permission slips, attendance, grades and exceptions' },
          { key:'recess_eligibility', label: MODULES.recess_eligibility || 'Recess Eligibility', href:'./recess.html', description:'Supervised recess: attendance, grades and return tracking; all grades, no slip' },
          { key:'after_school_monitor', label: MODULES.after_school_monitor || 'After-School Monitor', href:'./after_school_monitor.html', description:'After-school attendance and holds' },
          { key:'visitor_desk', label: MODULES.visitor_desk || 'Visitor Desk', href:'./visitor_desk.html', description:'Visitor check-in, queue and history' },
          { key:'early_dismissal', label: MODULES.early_dismissal || 'Early Dismissal', href:'./early_dismissal.html', description:'Student early-dismissal workflow' },
        ]
      },
      {
        section_key: 'administration',
        title: 'Administration',
        items: [
          { key:'teacher_trace_lookup', label: MODULES.teacher_trace_lookup || 'Attendance Trace Lookup', href:'./teacher_trace_lookup.html', description:'Trace attendance submissions and diagnostics' },
          { key:'contact_review', label: MODULES.contact_review || 'Contact Correction Review', href:'./contact_review.html', description:'Review contact-data correction suggestions' },
          { key:'incentive_trips', label:'Incentive Trip Eligibility', href:'./incentive_trips.html', description:'Configurable behavior, attendance and grade eligibility for incentive trips' }, // EAGLENEST_INCENTIVE_TRIPS_V1
          { key:'exports', label:'Exports', href:'./exports.html', description:'Filtered historical CSV exports across EagleNEST modules' },
          { key:'fidelity_dashboard', label: MODULES.fidelity_dashboard || 'Operational Health', href:'./fidelity.html', description:'Attendance fidelity and operational health' },
          { key:'scan_injector', label: MODULES.scan_injector || 'Scan Injector', href:'./scan_injector.html', description:'Admin scan simulation and testing' },
          { key:'admin_roles', label: MODULES.admin_roles || 'Roles & Access', href:'./admin_roles.html', description:'Permissions and staff access' },
          { key:'admin_dashboard', label: MODULES.admin || 'System Administration', href:'./index.html', description:'System mode and configuration' },
        ]
      }
    ];

    const cur = currentFile();

    const itemIsCurrent = (it) => {
      const targetFile = String(it?.href || '').split('/').pop();
      return it?.key === 'attendance_change'
        ? (cur === 'attendance_change.html' || cur === 'excused_apply.html')
        : !!(targetFile && targetFile === cur);
    };

    const savedSectionOpen = (() => {
      try {
        const raw = JSON.parse(localStorage.getItem(LS_SECTION_OPEN) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
      } catch {
        return {};
      }
    })();

    const saveSectionOpen = (key, open) => {
      if (!key) return;
      savedSectionOpen[key] = !!open;
      try { localStorage.setItem(LS_SECTION_OPEN, JSON.stringify(savedSectionOpen)); } catch {}
    };

    const visibleByAccess = (it) => !!(
      access?.can?.[it.key] ||
      (it.key === 'gradebook_analytics' && access?.can?.grades) ||
      (it.key === 'incentive_trips' && (access?.role === 'super_admin' || access?.role === 'admin') && !access?.view_as?.active) ||
      (it.key === 'exports' && (access?.role === 'super_admin' || access?.role === 'admin') && !access?.view_as?.active) ||
      (it.key === 'conference_scheduler' && access?.can?.student_contacts) ||
      (it.key === 'esas' && !!access?.email) ||
      (it.key === 'attendance_change' && access?.can?.excused_apply) ||
      (it.key === 'scan_injector' && (access?.role === 'super_admin' || access?.role === 'admin'))
    );

    const appendNavLink = (parent, it) => {
      const a = document.createElement('a');
      a.className = 'ssNavLink';
      a.href = it.href;

      const left = document.createElement('span');
      left.textContent = it.label;
      a.appendChild(left);

      // Keep the useful descriptor, but move it out of the visible drawer.
      // Hover/focus still exposes it as a native tooltip/accessible label.
      if (it.description) {
        a.title = it.description;
        a.setAttribute('aria-label', `${it.label}. ${it.description}`);
      }

      if (itemIsCurrent(it)) a.setAttribute('aria-current', 'page');
      parent.appendChild(a);
    };

    const appendSection = (section) => {
      const visibleItems = section.items.filter(visibleByAccess);
      if (!visibleItems.length) return;

      const sectionHasCurrent = visibleItems.some(itemIsCurrent);

      if (section.always_open) {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'ssNavSection ssNavSectionAlwaysOpen';

        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'ssNavSectionTitle';
        sectionTitle.textContent = section.title;
        sectionEl.appendChild(sectionTitle);

        const body = document.createElement('div');
        body.className = 'ssNavSectionBody';
        for (const it of visibleItems) appendNavLink(body, it);
        sectionEl.appendChild(body);
        linksWrap.appendChild(sectionEl);
        return;
      }

      const details = document.createElement('details');
      details.className = 'ssNavSection ssNavSectionCollapsible';
      details.dataset.sectionKey = section.section_key;
      details.open = sectionHasCurrent || savedSectionOpen[section.section_key] === true;

      const summary = document.createElement('summary');
      summary.className = 'ssNavSectionTitle';
      const label = document.createElement('span');
      label.textContent = section.title;
      const count = document.createElement('span');
      count.className = 'ssNavSectionCount';
      count.textContent = String(visibleItems.length);
      summary.append(label, count);
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'ssNavSectionBody';
      for (const it of visibleItems) appendNavLink(body, it);
      details.appendChild(body);

      details.addEventListener('toggle', () => saveSectionOpen(section.section_key, details.open));
      linksWrap.appendChild(details);
    };

    for (const section of sections) appendSection(section);

    // ===== Collapsible external links =====
    const externalLinks = Array.isArray(access?.external_links) ? access.external_links : [];
    const safeExternalLinks = externalLinks.filter((item) => {
      const label = String(item?.label || '').trim();
      const href = String(item?.url || item?.href || '').trim();
      return !!label && /^https?:\/\//i.test(href);
    });

    if (safeExternalLinks.length) {
      const details = document.createElement('details');
      details.className = 'ssNavSection ssNavSectionCollapsible ssNavExternalSection';
      details.dataset.sectionKey = 'external_links';
      details.open = savedSectionOpen.external_links === true;

      const summary = document.createElement('summary');
      summary.className = 'ssNavSectionTitle';
      const label = document.createElement('span');
      label.textContent = 'External Links';
      const count = document.createElement('span');
      count.className = 'ssNavSectionCount';
      count.textContent = String(safeExternalLinks.length);
      summary.append(label, count);
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'ssNavSectionBody';
      for (const item of safeExternalLinks) {
        const labelText = String(item?.label || '').trim();
        const href = String(item?.url || item?.href || '').trim();
        const a = document.createElement('a');
        a.className = 'ssNavLink ssNavExternalLink';
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = `${labelText} ↗`;
        a.title = 'Open external link in a new tab';
        body.appendChild(a);
      }
      details.appendChild(body);
      details.addEventListener('toggle', () => saveSectionOpen('external_links', details.open));
      linksWrap.appendChild(details);
    }

    // ===== Theme (shared) =====
    const THEME_KEY = 'ss_theme_v1';
    const LEGACY_THEME_KEYS = ['teacher_att_theme', 'staff_pull_theme'];

    function resolveTheme(){
      // 1) dataset already set?
      const cur = String(document.documentElement?.dataset?.theme || '').trim().toLowerCase();
      if (cur === 'light' || cur === 'dark') return cur;

      // 2) shared key
      let t = '';
      try { t = String(localStorage.getItem(THEME_KEY) || '').trim().toLowerCase(); } catch {}
      if (t === 'light' || t === 'dark') return t;

      // 3) migrate legacy keys
      for (const k of LEGACY_THEME_KEYS){
        try{
          const v = String(localStorage.getItem(k) || '').trim().toLowerCase();
          if (v === 'light' || v === 'dark'){
            try{ localStorage.setItem(THEME_KEY, v); }catch{}
            return v;
          }
        }catch{}
      }

      // 4) system default
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
        ? 'light' : 'dark';
    }

    function applyTheme(theme){
      const t = (String(theme || '').toLowerCase() === 'light') ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      try{ localStorage.setItem(THEME_KEY, t); }catch{}
      try{ window.dispatchEvent(new CustomEvent('ss-theme-change', { detail:{ theme:t } })); }catch{}
    }

    // Ensure something is set (in case the page didn't bootstrap early)
    applyTheme(resolveTheme());

    const footer = document.createElement('div');
    footer.className = 'ssNavFooter';

    const themeBtn = document.createElement('button');
    themeBtn.className = 'ssNavBtn';
    themeBtn.type = 'button';

    const syncThemeBtn = () => {
      const t = resolveTheme();
      themeBtn.textContent = (t === 'light') ? '\u2600\ufe0f Light' : '\ud83c\udf19 Dark';
      themeBtn.title = (t === 'light') ? 'Switch to dark mode' : 'Switch to light mode';
      themeBtn.setAttribute('aria-pressed', String(t === 'light'));
    };

    syncThemeBtn();
    themeBtn.addEventListener('click', () => {
      const next = (resolveTheme() === 'light') ? 'dark' : 'light';
      applyTheme(next);
      syncThemeBtn();
    });

    // keep label in sync if another tab/page changes it
    window.addEventListener('storage', (e) => { if (e.key === THEME_KEY) syncThemeBtn(); });
    window.addEventListener('ss-theme-change', syncThemeBtn);

    // ===== Logout =====
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'ssNavBtn';
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Logout';
    logoutBtn.addEventListener('click', async () => {
      if (!DEMO_MODE) {
        try { await adminFetch('/admin/session/logout', { method: 'POST' }); } catch {}
      }
      clearStoredAdminSessionSid();
      location.reload();
    });

    if (access?.can?.notifications) {
      const settingsLink = document.createElement('a');
      settingsLink.className = 'ssNavBtn ssNavFooterLink';
      settingsLink.href = './notifications.html';
      settingsLink.textContent = MODULES.notifications || 'My Settings';
      settingsLink.title = 'Notifications, call pop-ups, preferences and personal links';
      if (cur === 'notifications.html') settingsLink.setAttribute('aria-current', 'page');
      footer.appendChild(settingsLink);
    }
    footer.appendChild(themeBtn);
    footer.appendChild(logoutBtn);

    drawer.appendChild(title);
    drawer.appendChild(meta);
    drawer.appendChild(linksWrap);
    drawer.appendChild(footer);

    function setOpen(on) {
      const open = !!on;
      document.body.classList.toggle('ssNav-open', open);
      btn.textContent = open ? '\u2715' : '\u2630';
      btn.title = open ? 'Close navigation' : 'Open navigation';
      btn.setAttribute('aria-label', btn.title);
      try { localStorage.setItem(LS_OPEN, open ? '1' : '0'); } catch {}
    }

    btn.addEventListener('click', () => setOpen(!document.body.classList.contains('ssNav-open')));
    backdrop.addEventListener('click', () => setOpen(false));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

    document.body.appendChild(btn);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    // restore open state
    try { if (localStorage.getItem(LS_OPEN) === '1') setOpen(true); } catch {}
  }

  // EAGLENEST_GRANDSTREAM_PHASE3_PHONE_LIVE
  // EAGLENEST_GRANDSTREAM_LIVE_SCOPE_V1
  async function bootPhoneLive(access){
    if (access?.can?.phone_dashboard !== true) return;
    if (/calls\.html$/i.test(location.pathname || '')) return;
    if (access?.view_as?.active === true || access?.view_as?.read_only === true) return;
    if (document.getElementById('eaglenestPhoneLiveScript')) return;

    // EAGLENEST_CALL_POPUP_PREF_V1
    try {
      const response = await adminFetch('/admin/calls/config', { method:'GET' });
      const config = await response.json().catch(() => null);
      if (!response.ok || !config?.ok || config?.preferences?.show_floating_popups === false) return;
    } catch {
      return; // fail closed: no floating PBX stream when preference cannot be confirmed
    }

    const script = document.createElement('script');
    script.id = 'eaglenestPhoneLiveScript';
    script.src = './phone_live.js';
    script.defer = true;
    document.head.appendChild(script);
  }

  async function bootPhonePickupPopup(access){
    const campuses=Array.isArray(access?.office_staff_campuses) ? access.office_staff_campuses : [];
    const mainOffice=campuses.some((value)=>String(value||'').trim().toLowerCase()==='high school');
    if(!mainOffice)return;
    if(/phone_pass\.html$/i.test(location.pathname||''))return;
    if(access?.view_as?.active===true||access?.view_as?.read_only===true)return;
    if(document.getElementById('eaglenestPhonePickupPopupScript'))return;

    try{
      const response=await adminFetch('/admin/phone_pass/popup_preferences',{method:'GET'});
      const pref=await response.json().catch(()=>null);
      if(!response.ok||!pref?.ok||pref?.enabled !== true)return;
    }catch{
      return;
    }

    const script=document.createElement('script');
    script.id='eaglenestPhonePickupPopupScript';
    script.src='./phone_pickup_popup.js';
    script.defer=true;
    document.head.appendChild(script);
  }

  async function bootNav() {
    // Poll briefly so it appears right after a user logs in via popup
    for (let i = 0; i < 40; i++) {
      const access = await getAccess();
      if (access?.ok) {
        const esas = await refreshEsasTakeover();
        if (esas?.active === true && esas?.incident?.incident_id) return;
        mountNav(access);
        await bootPhoneLive(access);
        await bootPhonePickupPopup(access);
        return;
      }
      await sleep(500);
    }
  }

  function bootModeWatcher(){
    refreshSystemMode();
    setInterval(refreshSystemMode, 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSystemMode(); });
  }

  function bootEsasTakeoverWatcher(){
    if (isEsasTakeoverExemptPage()) return;
    refreshEsasTakeover();
    setInterval(refreshEsasTakeover, ESAS_TAKEOVER_POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshEsasTakeover(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bootModeWatcher(); bootEsasTakeoverWatcher(); bootNav(); });
  } else {
    bootModeWatcher();
    bootEsasTakeoverWatcher();
    bootNav();
  }
})();

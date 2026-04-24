// admin/nav.js
(() => {
  const metaApiBase = (document.querySelector('meta[name="api-base"]')?.content || '').trim();
  const API_BASE = (metaApiBase ? metaApiBase.replace(/\/*$/, '') : location.origin) + '/';

  const LS_OPEN = 'ss_nav_open_v1';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const BRAND = window.EAGLENEST_BRAND?.name || 'EagleNEST';
  const MODULES = window.EAGLENEST_BRAND?.modules || {
    teacher_attendance: 'Teacher Attendance',
    teacher_trace_lookup: 'Attendance Trace Lookup',
    attendance_status: 'Attendance Status',
    senior_lunch_audit: 'Senior Lunch Audit',
    student_scans: 'Student Scans',
    student_view: 'Student View',
    hallway: 'Hallway Monitor',
    staff_pull: 'Staff Pull',
    phone_pass: 'Phone Pass',
    behavior_history: 'Logged Behaviors',
    attendance_change: 'Attendance Change',
    supervised_lunch: 'Supervised Lunch',
    excused_apply: 'Attendance Change', // legacy alias
    admin_roles: 'Admin Roles',
    admin: 'Super Admin Dashboard'
  };

  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const NAV_SESSION_KEYS = [
    'teacher_att_admin_session_v1',
    'teacher_trace_lookup_admin_session_v1',
    'attendance_status_admin_session_v1',
    'senior_lunch_audit_admin_session_v1',
    'staff_pull_admin_session_v1',
    'phone_pass_admin_session_v1',
    'student_scans_admin_session_v1',
    'behavior_history_admin_session_v1',
    'admin_roles_admin_session_v1',
    'attendance_change_admin_session_v1',
    'supervised_lunch_admin_session_v1',
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

  function currentFile() {
    const p = (location.pathname || '').split('/').pop() || '';
    return p || 'index.html';
  }

  function wantsOffset() {
    // teacher_attendance has a fixed top-left button; avoid overlap
    return !!(document.getElementById('viewToggleBtn') || document.querySelector('.viewToggle'));
  }

  async function getAccess() {
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
        can: {
          super_admin: isSuperAdmin,
          admin: isAdminLike,
          admin_dashboard: isSuperAdmin,
          admin_roles: isSuperAdmin,
          hallway: isAdminLike,
          staff_pull: isAdminLike,
          teacher_attendance: true,
          attendance_status: isAdminLike,
          senior_lunch_audit: isAdminLike,
          student_scans: true,
          student_view: isSuperAdmin,
          behavior_history: true,
          supervised_lunch: true,
          phone_pass: isAdminLike,
          teacher_trace_lookup: isAdminLike,
          attendance_change: isSuperAdmin,
          excused_apply: isSuperAdmin // legacy alias
        }
      };

      try {
        const hr = await adminFetch('/admin/hallway_state_monitor', { method: 'GET' });
        out.can.hallway = hr.ok;
      } catch {}
      try {
        const sr = await adminFetch('/admin/staff_pull/options', { method: 'GET' });
        out.can.staff_pull = sr.ok;
      } catch {}
      try {
        const pr = await adminFetch('/admin/phone_pass/options', { method: 'GET' });
        out.can.phone_pass = pr.ok;
      } catch {}

      return out;
    } catch {
      return { ok:false };
    }
  }

  function mountNav(access) {
    if (document.getElementById('ssNavDrawer') || document.getElementById('ssNavToggle')) return;
    if (!access?.ok) return;

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
    meta.textContent = `${access.email || '\u2014'}${roleLabel ? ` (${roleLabel})` : ''}`;

    const linksWrap = document.createElement('div');
    linksWrap.className = 'ssNavLinks';

    const sections = [
      {
        title: 'Attendance',
        items: [
          { key:'teacher_attendance', label: MODULES.teacher_attendance || 'Teacher Attendance', href:'./teacher_attendance.html', badge:'take attendance' },
          { key:'attendance_status',  label: MODULES.attendance_status || 'Attendance Status',   href:'./attendance_status.html',  badge:'live status' },
          { key:'teacher_trace_lookup', label: MODULES.teacher_trace_lookup || 'Attendance Trace Lookup', href:'./teacher_trace_lookup.html', badge:'submission trace' },
          { key:'attendance_change',  label: (MODULES.attendance_change || MODULES.excused_apply || 'Attendance Change'), href:'./attendance_change.html', badge:'edit records' },
        ]
      },
      {
        title: 'Students',
        items: [
          { key:'student_scans',      label: MODULES.student_scans || 'Scans Report',            href:'./student_scans.html',      badge:'scan history' },
          { key:'student_view',       label: MODULES.student_view || 'Student View',             href:'./student_view.html',       badge:'student lookup' },
          { key:'senior_lunch_audit', label: MODULES.senior_lunch_audit || 'Senior Lunch Audit', href:'./senior_lunch_audit.html', badge:'lunch audit' },
          { key:'supervised_lunch',   label: MODULES.supervised_lunch || 'Supervised Lunch',     href:'./supervised_lunch.html',   badge:'room setup' },
        ]
      },
      {
        title: 'Passes',
        items: [
          { key:'hallway',            label: MODULES.hallway || 'Hallway Monitor',               href:'./hallway.html',            badge:'hall monitor' },
          { key:'staff_pull',         label: MODULES.staff_pull || 'Staff Pull',                 href:'./staff_pull.html',         badge:'staff request' },
          { key:'phone_pass',         label: MODULES.phone_pass || 'Phone Pass',                 href:'./phone_pass.html',         badge:'phone locker' },
        ]
      },
      {
        title: 'Behavior And Admin',
        items: [
          { key:'behavior_history',   label: MODULES.behavior_history || 'Logged Behaviors',     href:'./behavior_history.html',   badge:'behavior log' },
          { key:'admin_roles',        label: MODULES.admin_roles || 'Admin Roles',               href:'./admin_roles.html',        badge:'role access' },
          { key:'admin_dashboard',    label: MODULES.admin || 'Super Admin Dashboard',           href:'./index.html',              badge:'system settings' },
        ]
      }
    ];

    const cur = currentFile();

    for (const section of sections) {
      const visibleItems = section.items.filter((it) => !!(
        access?.can?.[it.key] ||
        (it.key === 'attendance_change' && access?.can?.excused_apply)
      ));
      if (!visibleItems.length) continue;

      const sectionEl = document.createElement('div');
      sectionEl.className = 'ssNavSection';

      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'ssNavSectionTitle';
      sectionTitle.textContent = section.title;
      sectionEl.appendChild(sectionTitle);

      for (const it of visibleItems) {
        const a = document.createElement('a');
        a.className = 'ssNavLink';
        a.href = it.href;

        const left = document.createElement('span');
        left.textContent = it.label;

        const right = document.createElement('span');
        right.className = 'ssNavBadge';
        right.textContent = it.badge;

        a.appendChild(left);
        a.appendChild(right);

        const targetFile = it.href.split('/').pop();
        const isCurrent = (it.key === 'attendance_change')
          ? (cur === 'attendance_change.html' || cur === 'excused_apply.html')
          : (targetFile && targetFile === cur);
        if (isCurrent) a.setAttribute('aria-current', 'page');

        sectionEl.appendChild(a);
      }

      linksWrap.appendChild(sectionEl);
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
      try { await adminFetch('/admin/session/logout', { method: 'POST' }); } catch {}
      clearStoredAdminSessionSid();
      location.reload();
    });

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

  async function bootNav() {
    // Poll briefly so it appears right after a user logs in via popup
    for (let i = 0; i < 40; i++) {
      const access = await getAccess();
      if (access?.ok) {
        mountNav(access);
        return;
      }
      await sleep(500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootNav);
  } else {
    bootNav();
  }
})();

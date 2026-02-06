// admin/nav.js
(() => {
  const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
    .replace(/\/*$/, '') + '/';

  const LS_OPEN = 'ss_nav_open_v1';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const BRAND = window.EAGLENEST_BRAND?.name || 'EagleNEST';
  const MODULES = window.EAGLENEST_BRAND?.modules || {
    teacher_attendance: 'Teacher Attendance',
    student_scans: 'Student Scans',
    student_view: 'Student View',
    hallway: 'Hallway Monitor',
    staff_pull: 'Staff Pull',
    phone_pass: 'Phone Pass',
    admin: 'Admin Dashboard'
  };

  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const NAV_SESSION_KEYS = [
    'teacher_att_admin_session_v1',
    'staff_pull_admin_session_v1',
    'phone_pass_admin_session_v1',
    'student_scans_admin_session_v1',
    'admin_session_v1'
  ];

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
      const out = {
        ok:true,
        email: j.email || null,
        role,
        can: {
          admin: role === 'admin',
          hallway: false,
          staff_pull: false,
          teacher_attendance: true,
          student_scans: true
        }
      };

      // Probe hallway
      if (out.can.admin) out.can.hallway = true;
      else {
        const pr = await adminFetch('/admin/hallway_state_monitor', { method: 'GET' });
        out.can.hallway = pr.ok;
      }

      // Probe staff pull
      const sr = await adminFetch('/admin/staff_pull/options', { method: 'GET' });
      out.can.staff_pull = sr.ok;

      // Probe phone pass
      const pr2 = await adminFetch('/admin/phone_pass/options', { method: 'GET' });
      out.can.phone_pass = pr2.ok;

      return out;
    } catch {
      return { ok:false };
    }
  }

  function mountNav(access) {
    if (!access?.ok) return;

    if (wantsOffset()) document.body.classList.add('ssNav-offset');

    // Toggle
    const btn = document.createElement('button');
    btn.id = 'ssNavToggle';
    btn.type = 'button';
    btn.textContent = '☰';
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
    meta.textContent = `${access.email || '—'}${access.role ? ` (${access.role})` : ''}`;

    const linksWrap = document.createElement('div');
    linksWrap.className = 'ssNavLinks';

    const items = [
      { key:'teacher_attendance', label: MODULES.teacher_attendance || 'Teacher Attendance', href:'./teacher_attendance.html', badge:'staff' },
      { key:'student_scans',      label: MODULES.student_scans || 'Scans Report',            href:'./student_scans.html',      badge:'reports' },
      { key:'student_view',       label: MODULES.student_view || 'Student View',               href:'./student_view.html',       badge:'student' },
      { key:'hallway',            label: MODULES.hallway || 'Hallway Monitor',                 href:'./hallway.html',            badge:'monitor' },
      { key:'staff_pull',         label: MODULES.staff_pull || 'Staff Pull',                   href:'./staff_pull.html',         badge:'pull' },
      { key:'phone_pass',         label: MODULES.phone_pass || 'Phone Pass',                   href:'./phone_pass.html',         badge:'phones' },
      { key:'admin',              label: MODULES.admin || 'Admin Dashboard',                   href:'./index.html',              badge:'admin' },
    ];

    const cur = currentFile();

    for (const it of items) {
      if (!access?.can?.[it.key]) continue;

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

      // mark current
      const targetFile = it.href.split('/').pop();
      if (targetFile && targetFile === cur) a.setAttribute('aria-current', 'page');

      linksWrap.appendChild(a);
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
      themeBtn.textContent = (t === 'light') ? '☀️ Light' : '🌙 Dark';
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
      btn.textContent = open ? '✕' : '☰';
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

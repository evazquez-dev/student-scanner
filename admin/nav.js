// admin/nav.js
(() => {
  const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
    .replace(/\/*$/, '') + '/';

  const LS_OPEN = 'ss_nav_open_v1';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function adminFetch(path, init = {}) {
    const u = new URL(path, API_BASE);
    return fetch(u, { ...init, credentials: 'include' });
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
    drawer.setAttribute('aria-label', 'Student Scanner navigation');

    const title = document.createElement('div');
    title.className = 'ssNavTitle';
    title.textContent = 'Student Scanner';

    const meta = document.createElement('div');
    meta.className = 'ssNavMeta';
    meta.textContent = `${access.email || '—'}${access.role ? ` (${access.role})` : ''}`;

    const linksWrap = document.createElement('div');
    linksWrap.className = 'ssNavLinks';

    const items = [
      { key:'teacher_attendance', label:'Teacher Attendance', href:'./teacher_attendance.html', badge:'staff' },
      { key:'student_scans',      label:'Student Scans',      href:'./student_scans.html',      badge:'reports' },
      { key:'hallway',           label:'Hallway Monitor',    href:'./hallway.html',           badge:'monitor' },
      { key:'staff_pull',        label:'Staff Pull',         href:'./staff_pull.html',        badge:'pull' },
      { key:'admin',             label:'Admin Dashboard',    href:'./index.html',             badge:'admin' },
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

    const footer = document.createElement('div');
    footer.className = 'ssNavFooter';

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'ssNavBtn';
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Logout';
    logoutBtn.addEventListener('click', async () => {
      try { await adminFetch('/admin/session/logout', { method: 'POST' }); } catch {}
      location.reload();
    });

    footer.appendChild(logoutBtn);

    drawer.appendChild(title);
    drawer.appendChild(meta);
    drawer.appendChild(linksWrap);
    drawer.appendChild(footer);

    function setOpen(on) {
      document.body.classList.toggle('ssNav-open', !!on);
      try { localStorage.setItem(LS_OPEN, on ? '1' : '0'); } catch {}
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

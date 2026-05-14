(() => {
  'use strict';

  const API_BASE = (() => {
    const m = document.querySelector('meta[name="api-base"]');
    const raw = (m?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/') || (location.origin + '/'); }
    catch { return location.origin + '/'; }
  })();

  const ADMIN_SESSION_KEYS = [
    'after_school_monitor_admin_session_v1',
    'ss_admin_session_sid_v1',
    'teacher_att_admin_session_v1',
    'admin_session_v1',
    'admin_session_sid'
  ];
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const $ = (id) => document.getElementById(id);

  const state = {
    date: '',
    user: '',
    students: [],
    counts: {},
    filter: 'all'
  };

  (function initTheme(){
    const root = document.documentElement;
    const key = 'ss_theme_v1';
    const stored = localStorage.getItem(key);
    const initial = stored || ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark');
    root.dataset.theme = initial;
    const btn = $('themeToggle');
    const refresh = () => { if (btn) btn.textContent = root.dataset.theme === 'light' ? 'Dark' : 'Light'; };
    refresh();
    btn?.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(key, root.dataset.theme); } catch {}
      refresh();
    });
  })();

  function esc(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function getStoredAdminSessionSid(){
    try {
      for (const k of ADMIN_SESSION_KEYS) {
        const v = String(sessionStorage.getItem(k) || localStorage.getItem(k) || '').trim();
        if (v) return v;
      }
    } catch {}
    return '';
  }
  function setStoredAdminSessionSid(sid){
    const v = String(sid || '').trim();
    if (!v) return;
    for (const k of ADMIN_SESSION_KEYS) {
      try { sessionStorage.setItem(k, v); } catch {}
      try { localStorage.setItem(k, v); } catch {}
    }
  }
  function clearStoredAdminSessionSid(){
    for (const k of ADMIN_SESSION_KEYS) {
      try { sessionStorage.removeItem(k); } catch {}
      try { localStorage.removeItem(k); } catch {}
    }
  }
  function stashAdminSessionFromResponse(resp){
    try {
      const sid = String(resp?.headers?.get(ADMIN_SESSION_HEADER) || resp?.headers?.get('X-Admin-Session') || '').trim();
      if (sid) setStoredAdminSessionSid(sid);
    } catch {}
  }
  async function adminFetch(pathOrUrl, init = {}){
    const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
    const headers = new Headers(init.headers || {});
    const sid = getStoredAdminSessionSid();
    if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
    const resp = await fetch(u, { ...init, headers, credentials: 'include', cache: 'no-store' });
    stashAdminSessionFromResponse(resp);
    if (resp.status === 401) clearStoredAdminSessionSid();
    return resp;
  }

  function setStatus(msg, bad = false){
    const el = $('statusBox');
    if (!el) return;
    el.className = 'status' + (bad ? ' bad' : '');
    el.textContent = msg;
  }
  function fmtClock(iso){
    const ms = Date.parse(String(iso || ''));
    if (!Number.isFinite(ms)) return '';
    try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    catch { return String(iso || ''); }
  }
  function chipForHold(hold){
    const type = String(hold?.type || '').trim();
    if (type === 'regents_prep') return '<span class="chip regents">Regents Prep</span>';
    if (type === 'reflection') return '<span class="chip reflection">Reflection</span>';
    if (type === 'late_arrival') return '<span class="chip late">Late Arrival</span>';
    return '';
  }
  function rowMatchesFilter(row){
    if (state.filter === 'all') return true;
    if (state.filter === 'in_after_school') return !!row.in_after_school;
    return Array.isArray(row.hold_types) && row.hold_types.includes(state.filter);
  }
  function rowMatchesSearch(row, q){
    if (!q) return true;
    const hay = [
      row.name,
      row.osis,
      row.grade,
      row.phone_locker_number,
      row.phone_locker_color,
      row.location_label,
      row.loc,
      ...(Array.isArray(row.holds) ? row.holds.map((h) => `${h.type} ${h.label} ${h.room} ${h.reason} ${h.owner_email}`) : [])
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }
  function renderKpis(){
    const c = state.counts || {};
    const kpis = [
      ['Total', c.total || 0],
      ['In After-School', c.in_after_school || 0],
      ['Regents Prep', c.regents_prep || 0],
      ['Reflection', c.reflection || 0],
      ['Late Arrival', c.late_arrival || 0],
      ['No Locker', c.no_phone_locker || 0]
    ];
    $('kpis').innerHTML = kpis.map(([label, value]) => `
      <div class="kpi">
        <div class="label">${esc(label)}</div>
        <div class="value mono">${esc(value)}</div>
      </div>
    `).join('');
  }
  function renderRows(){
    const q = String($('searchInput')?.value || '').trim().toLowerCase();
    const rows = state.students.filter((row) => rowMatchesFilter(row) && rowMatchesSearch(row, q));
    const body = $('studentBody');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="muted">No students match this view.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => {
      const holds = Array.isArray(row.holds) ? row.holds : [];
      const holdHtml = [
        row.in_after_school ? '<span class="chip after">In After-School</span>' : '',
        ...holds.map(chipForHold)
      ].filter(Boolean).join(' ');
      const holdDetails = holds.map((h) => {
        const pieces = [h.room, h.owner_email, h.reason].filter(Boolean);
        return pieces.length ? `<div class="muted">${esc(pieces.join(' • '))}</div>` : '';
      }).join('');
      const locker = [row.phone_locker_color, row.phone_locker_number].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
      const loc = row.location_label || row.loc || row.zone || '';
      return `
        <tr>
          <td>${esc(row.name || '')}</td>
          <td class="mono">${esc(row.osis || '')}</td>
          <td class="mono">${esc(row.grade || '')}</td>
          <td>${holdHtml || '<span class="muted">—</span>'}${holdDetails}</td>
          <td class="mono">${esc(locker || '—')}</td>
          <td>${esc(loc || '—')}<div class="muted">${esc(row.zone || '')}</div></td>
          <td class="mono">${esc(fmtClock(row.updated_at) || '')}</td>
        </tr>
      `;
    }).join('');
  }

  async function loadData(){
    setStatus('Loading after-school monitor data...');
    $('refreshBtn').disabled = true;
    try {
      const r = await adminFetch('/admin/after_school_monitor', { method: 'GET' });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.ok) throw new Error(data?.error || `after_school_monitor HTTP ${r.status}`);
      state.date = String(data.date || '');
      state.user = String(data?.who?.email || '');
      state.students = Array.isArray(data.students) ? data.students : [];
      state.counts = data.counts || {};
      $('dateLabel').textContent = state.date || '—';
      $('updatedLabel').textContent = fmtClock(data.generated_at) || '—';
      $('userLabel').textContent = state.user || '—';
      renderKpis();
      renderRows();
      setStatus(`Loaded ${state.students.length} student(s).`);
      $('authCard').style.display = 'none';
      $('app').style.display = '';
    } catch (err) {
      $('authCard').style.display = '';
      $('app').style.display = 'none';
      setStatus(String(err?.message || err), true);
    } finally {
      $('refreshBtn').disabled = false;
    }
  }

  function bootEvents(){
    $('refreshBtn')?.addEventListener('click', loadData);
    $('searchInput')?.addEventListener('input', renderRows);
    document.querySelectorAll('.filterBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = String(btn.dataset.filter || 'all');
        document.querySelectorAll('.filterBtn').forEach((b) => b.classList.toggle('active', b === btn));
        renderRows();
      });
    });
  }

  bootEvents();
  loadData();
})();

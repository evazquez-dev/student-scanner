(() => {
  'use strict';

  const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
  const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const ADMIN_SESSION_KEYS = [
    'early_dismissal_admin_session_v1',
    'ss_admin_session_sid_v1',
    'admin_session_v1',
    'admin_session_sid',
    'teacher_att_admin_session_v1'
  ];

  const $ = (id) => document.getElementById(id);
  const loginCard = $('loginCard');
  const loginOut = $('loginOut');
  const appShell = $('appShell');
  const statusBox = $('statusBox');
  const body = $('dismissalBody');
  const searchInput = $('searchInput');
  const refreshBtn = $('refreshBtn');

  let ACCESS = null;
  let ROWS = [];
  let CAN_UNDO = false;
  let BUSY_TOKEN = '';

  function show(el){ if (el) el.style.display = ''; }
  function hide(el){ if (el) el.style.display = 'none'; }

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

    const resp = await fetch(u, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });

    stashAdminSessionFromResponse(resp);
    if (resp.status === 401) {
      try {
        const j = await resp.clone().json().catch(() => null);
        const err = String(j?.error || '').toLowerCase();
        if (err === 'expired' || err === 'no_session' || err === 'bad_session') clearStoredAdminSessionSid();
      } catch {}
    }
    return resp;
  }

  function esc(v){
    return String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function fmtDateTime(iso){
    const s = String(iso || '').trim();
    if (!s) return '-';
    try {
      return new Date(s).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return s;
    }
  }

  function setStatus(text, bad = false){
    statusBox.textContent = String(text || '');
    statusBox.classList.toggle('bad', !!bad);
  }

  function renderCounts(data){
    $('dateText').textContent = data?.date || '-';
    $('updatedText').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    $('accessText').textContent = CAN_UNDO ? 'Hallway Monitor' : 'View only';
    $('totalCount').textContent = String(data?.counts?.total ?? ROWS.length);
    $('activeCount').textContent = String(data?.counts?.active ?? 0);
    $('changedCount').textContent = String(data?.counts?.changed ?? 0);
    $('undoneCount').textContent = String(data?.counts?.undone ?? 0);
  }

  function statusTag(row){
    const s = String(row?.status || '').toLowerCase();
    if (s === 'active') return '<span class="tag active">Active</span>';
    if (s === 'changed') return '<span class="tag changed">Changed</span>';
    if (s === 'undone') return '<span class="tag undone">Undone</span>';
    return `<span class="tag">${esc(s || '-')}</span>`;
  }

  function canUndoRow(row){
    return !!(CAN_UNDO && row?.can_undo && row?.token);
  }

  function filteredRows(){
    const q = String(searchInput?.value || '').trim().toLowerCase();
    if (!q) return ROWS;
    return ROWS.filter((r) => [
      r.name,
      r.osis,
      r.reason,
      r.status,
      r.current_label,
      r.current_source
    ].some((v) => String(v || '').toLowerCase().includes(q)));
  }

  function renderRows(){
    const rows = filteredRows();
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="muted">No early dismissals found.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => {
      const token = String(row.token || '');
      const undoable = canUndoRow(row);
      const busy = BUSY_TOKEN && BUSY_TOKEN === token;
      const action = undoable
        ? `<button class="danger undoBtn" type="button" data-token="${esc(token)}"${busy ? ' disabled' : ''}>${busy ? 'Undoing...' : 'Undo'}</button>`
        : `<span class="muted">${CAN_UNDO ? esc(row.undo_blocked_reason || '-') : 'View only'}</span>`;
      const location = row.current_label
        ? `<div>${esc(row.current_label)}</div><div class="muted mono">${esc(row.current_source || '')}</div>`
        : '<span class="muted">-</span>';
      return `<tr>
        <td><strong>${esc(row.name || '-')}</strong><div class="muted mono">${esc(row.osis || '')}</div></td>
        <td><div>${esc(fmtDateTime(row.dismissal_when_iso || row.created_at))}</div><div class="muted mono">${esc(row.dismissal_when_iso || '')}</div></td>
        <td>${esc(row.reason || '-')}</td>
        <td>${statusTag(row)}${row.used_at ? `<div class="muted mono">${esc(fmtDateTime(row.used_at))}</div>` : ''}</td>
        <td>${location}</td>
        <td>${action}</td>
      </tr>`;
    }).join('');
  }

  async function fetchAccess(){
    const resp = await adminFetch('/admin/access', { method: 'GET' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) throw new Error(data?.error || `access_http_${resp.status}`);
    return data;
  }

  async function refresh(){
    refreshBtn.disabled = true;
    setStatus('Loading...');
    try {
      if (!ACCESS) ACCESS = await fetchAccess();
      const resp = await adminFetch('/admin/early_dismissals', { method: 'GET' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) throw new Error(data?.error || `early_dismissals_http_${resp.status}`);
      ROWS = Array.isArray(data.rows) ? data.rows : [];
      CAN_UNDO = !!data.can_undo;
      renderCounts(data);
      renderRows();
      setStatus(ROWS.length ? `${ROWS.length} early dismissal record(s).` : 'No early dismissals for today.');
    } catch (err) {
      setStatus(err?.message || String(err), true);
      body.innerHTML = '<tr><td colspan="6" class="muted">Unable to load early dismissals.</td></tr>';
    } finally {
      refreshBtn.disabled = false;
    }
  }

  async function undoDismissal(token){
    const row = ROWS.find((r) => String(r.token || '') === String(token || ''));
    if (!row) return;
    const label = `${row.name || 'this student'}${row.osis ? ` (${row.osis})` : ''}`;
    if (!window.confirm(`ARE YOU SURE YOU WANT TO UNDO THE EARLY DISMISSAL OF ${label}?`)) return;

    BUSY_TOKEN = String(token || '');
    renderRows();
    setStatus('Undoing early dismissal...');
    try {
      const resp = await adminFetch('/admin/early_dismissals/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) throw new Error(data?.error || `undo_http_${resp.status}`);
      await refresh();
      if (data?.log_cleanup && data.log_cleanup.ok === false) {
        setStatus(`Undone: ${data.name || row.name || row.osis || 'student'}. Warning: the Early Dismissal log row could not be deleted (${data.log_cleanup.error || 'cleanup failed'}).`, true);
      } else {
        setStatus(`Undone: ${data.name || row.name || row.osis || 'student'}.`);
      }
    } catch (err) {
      setStatus(err?.message || String(err), true);
      await refresh();
    } finally {
      BUSY_TOKEN = '';
      renderRows();
    }
  }

  function initTheme(){
    const root = document.documentElement;
    const btn = $('themeToggle');
    const sync = () => { btn.textContent = root.dataset.theme === 'light' ? 'Dark' : 'Light'; };
    sync();
    btn?.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('ss_theme_v1', root.dataset.theme); } catch {}
      sync();
    });
  }

  async function waitForGoogle(timeoutMs = 8000){
    const start = Date.now();
    while (!window.google?.accounts?.id) {
      if (Date.now() - start > timeoutMs) throw new Error('Google sign-in failed to load');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return window.google.accounts.id;
  }

  async function onGoogleCredential(resp){
    try {
      loginOut.textContent = 'Signing in...';
      const r = await adminFetch('/admin/session/login_google', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ id_token: resp.credential }).toString()
      });
      const data = await r.json().catch(() => ({}));
      if (data?.sid) setStoredAdminSessionSid(String(data.sid));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `login_http_${r.status}`);
      hide(loginCard);
      show(appShell);
      ACCESS = null;
      await refresh();
    } catch (err) {
      show(loginCard);
      hide(appShell);
      loginOut.textContent = `Login failed: ${err?.message || err}`;
    }
  }

  async function bootstrap(){
    initTheme();
    refreshBtn?.addEventListener('click', refresh);
    searchInput?.addEventListener('input', renderRows);
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.undoBtn');
      if (!btn) return;
      const token = String(btn.getAttribute('data-token') || '').trim();
      if (token) undoDismissal(token);
    });

    try {
      ACCESS = await fetchAccess();
      hide(loginCard);
      show(appShell);
      await refresh();
      return;
    } catch {}

    show(loginCard);
    hide(appShell);
    if (!GOOGLE_CLIENT_ID) {
      loginOut.textContent = 'Missing Google client ID.';
      return;
    }
    try {
      const googleId = await waitForGoogle();
      googleId.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential });
      googleId.renderButton(document.getElementById('g_id_signin'), {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular'
      });
      loginOut.textContent = '';
    } catch (err) {
      loginOut.textContent = err?.message || String(err);
    }
  }

  window.addEventListener('DOMContentLoaded', bootstrap);
})();

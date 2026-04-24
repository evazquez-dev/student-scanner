(() => {
  'use strict';

  const API_BASE = (() => {
    const m = document.querySelector('meta[name="api-base"]');
    const raw = (m?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/') || (location.origin + '/'); }
    catch { return location.origin + '/'; }
  })();

  const ADMIN_SESSION_KEYS = ['admin_roles_admin_session_v1', 'admin_session_v1', 'admin_session_sid'];
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const loginCard = document.getElementById('loginCard');
  const appCard = document.getElementById('appCard');
  const loginOut = document.getElementById('loginOut');
  const viewerMeta = document.getElementById('viewerMeta');
  const emailBox = document.getElementById('emailBox');
  const statusOut = document.getElementById('statusOut');
  const refreshBtn = document.getElementById('refreshBtn');
  const saveBtn = document.getElementById('saveBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  function getStoredAdminSessionSid() {
    try {
      for (const k of ADMIN_SESSION_KEYS) {
        const v = String(sessionStorage.getItem(k) || localStorage.getItem(k) || '').trim();
        if (v) return v;
      }
    } catch {}
    return '';
  }

  function setStoredAdminSessionSid(sid) {
    const v = String(sid || '').trim();
    if (!v) return;
    for (const k of ADMIN_SESSION_KEYS) {
      try { sessionStorage.setItem(k, v); } catch {}
      try { localStorage.setItem(k, v); } catch {}
    }
  }

  function clearStoredAdminSessionSid() {
    for (const k of ADMIN_SESSION_KEYS) {
      try { sessionStorage.removeItem(k); } catch {}
      try { localStorage.removeItem(k); } catch {}
    }
  }

  function stashAdminSessionFromResponse(resp) {
    try {
      const sid = String(resp?.headers?.get(ADMIN_SESSION_HEADER) || resp?.headers?.get('X-Admin-Session') || '').trim();
      if (sid) setStoredAdminSessionSid(sid);
    } catch {}
  }

  async function adminFetch(pathOrUrl, init = {}) {
    const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
    const headers = new Headers(init.headers || {});
    const sid = getStoredAdminSessionSid();
    if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
    const resp = await fetch(url, { ...init, headers, credentials: 'include', cache: 'no-store' });
    stashAdminSessionFromResponse(resp);
    return resp;
  }

  async function waitForGoogle(timeoutMs = 8000) {
    const start = Date.now();
    while (!window.google?.accounts?.id) {
      if (Date.now() - start > timeoutMs) throw new Error('Google script failed to load');
      await new Promise((r) => setTimeout(r, 50));
    }
    return window.google.accounts.id;
  }

  function normalizeEmails(text) {
    return Array.from(new Set(
      String(text || '')
        .split(/[\n,; \t\r]+/g)
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  function showLogin(msg = '') {
    loginCard.hidden = false;
    appCard.hidden = true;
    loginOut.textContent = msg;
  }

  function showApp(access) {
    loginCard.hidden = true;
    appCard.hidden = false;
    const roleLabel = access?.role === 'super_admin' ? 'super admin' : String(access?.role || '');
    viewerMeta.textContent = `${access?.email || '—'}${roleLabel ? ` (${roleLabel})` : ''}`;
  }

  async function fetchAccess() {
    const r = await adminFetch('/admin/access', { method: 'GET' });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || `access HTTP ${r.status}`);
    return j;
  }

  async function loadRoleList() {
    statusOut.textContent = 'Loading…';
    const r = await adminFetch('/admin/admin_role_allowlist', { method: 'GET' });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || `admin_role_allowlist HTTP ${r.status}`);
    emailBox.value = (Array.isArray(j.emails) ? j.emails : []).join('\n');
    statusOut.textContent = `Loaded ${Number(j.count || 0)} admin email${Number(j.count || 0) === 1 ? '' : 's'}.`;
  }

  async function saveRoleList() {
    const emails = normalizeEmails(emailBox.value);
    statusOut.textContent = 'Saving…';
    const r = await adminFetch('/admin/admin_role_allowlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ emails })
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || `admin_role_allowlist HTTP ${r.status}`);
    emailBox.value = emails.join('\n');
    statusOut.textContent = `Saved ${emails.length} admin email${emails.length === 1 ? '' : 's'}.`;
  }

  async function onGoogleCredential(resp) {
    try {
      loginOut.textContent = 'Signing in…';
      const r = await adminFetch('/admin/session/login_google', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ id_token: resp.credential }).toString()
      });
      const data = await r.json().catch(() => ({}));
      if (data?.sid) setStoredAdminSessionSid(String(data.sid));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      await boot();
    } catch (err) {
      showLogin(`Login failed: ${err?.message || err}`);
    }
  }

  async function tryBootstrapSession() {
    try {
      const r = await adminFetch('/admin/session/check', { method: 'GET' });
      const data = await r.json().catch(() => null);
      return !!(r.ok && data?.ok);
    } catch {
      return false;
    }
  }

  async function boot() {
    const access = await fetchAccess();
    if (!(access?.can?.admin_roles || access?.can?.super_admin)) {
      throw new Error('forbidden');
    }
    showApp(access);
    await loadRoleList();
  }

  refreshBtn?.addEventListener('click', () => loadRoleList().catch((e) => { statusOut.textContent = `Refresh failed: ${e?.message || e}`; }));
  saveBtn?.addEventListener('click', () => saveRoleList().catch((e) => { statusOut.textContent = `Save failed: ${e?.message || e}`; }));
  logoutBtn?.addEventListener('click', async () => {
    try { await adminFetch('/admin/session/logout', { method: 'POST' }); } catch {}
    clearStoredAdminSessionSid();
    showLogin('Signed out.');
  });

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      if (await tryBootstrapSession()) {
        await boot();
        return;
      }
      const gsi = await waitForGoogle();
      gsi.initialize({
        client_id: document.querySelector('meta[name="google-client-id"]')?.content || '',
        callback: onGoogleCredential,
        ux_mode: 'popup',
        use_fedcm_for_prompt: true
      });
      gsi.renderButton(document.getElementById('g_id_signin'), { theme: 'outline', size: 'large' });
      showLogin('Please sign in…');
    } catch (e) {
      showLogin(String(e?.message || e));
    }
  });
})();

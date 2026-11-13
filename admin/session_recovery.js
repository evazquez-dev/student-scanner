// EAGLENEST_SESSION_RECOVERY_V1
// Shared staff/admin session guard. Deliberately independent of nav.js and all page login UIs.
// No silent renewal; the Worker remains the sole authority for authenticated sessions.
(() => {
  'use strict';
  if (window.__EAGLENEST_SESSION_RECOVERY_V1__) return;
  if (new URLSearchParams(location.search).get('demo') === '1') return;
  if (/(?:^|\/)auth_return\.html$/i.test(location.pathname) || /(?:^|\/)signin\.html$/i.test(location.pathname)) return;
  // ESAS temporary emergency-access links are an intentional, separate guest auth
  // mechanism. Never block an active guest responder with the regular staff login.
  if (/(?:^|\/)esas\.html$/i.test(location.pathname)) {
    let guest = '';
    try {
      const fromLink = new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get('esas_access') || '';
      const stored = sessionStorage.getItem('esas_guest_session_v1') || '';
      guest = String(fromLink || stored).trim();
    } catch {}
    if (guest.startsWith('esasg_')) return;
  }

  const meta = document.querySelector('meta[name="api-base"]');
  const baseRaw = String(meta?.content || '').trim();
  if (!baseRaw) {
    console.warn('[EagleNEST recovery] Missing api-base meta; recovery was not installed.');
    return;
  }

  const apiBase = new URL(baseRaw.replace(/\/*$/, '') + '/', location.href);
  const checkUrl = new URL('admin/session/check', apiBase);
  const adminPrefix = new URL('admin/', apiBase);
  const nativeFetch = window.fetch;
  let currentState = 'unknown';
  let pendingCheck = null;
  let guardElement = null;
  let activeCheckAt = 0;
  let authLossObserved = false;
  let sessionRestorationReloaded = false;
  let retryTimer = null;

  function normalizeUrl(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input);
      return new URL(raw, location.href);
    } catch {
      return null;
    }
  }

  function isProtectedWorkerUrl(input) {
    const url = normalizeUrl(input);
    if (!url || url.origin !== apiBase.origin) return false;
    if (!url.pathname.startsWith(adminPrefix.pathname)) return false;
    const endpoint = url.pathname.slice(adminPrefix.pathname.length);
    return !/^session\/(?:check|login_google|logout)(?:\/|$)/i.test(endpoint);
  }

  function sessionHeader() {
    const sid = String(window.EAGLENEST_AUTH?.getSid?.() || '').trim();
    return sid ? { 'x-admin-session': sid } : {};
  }

  function signinUrl() {
    const u = new URL('./signin.html', location.href);
    u.searchParams.set('return_to', location.href);
    return u.href;
  }

  function installDialog() {
    if (guardElement) return guardElement;
    if (!document.body) return null;

    const style = document.createElement('style');
    style.dataset.eaglenestSessionRecoveryStyle = 'v1';
    style.textContent = `
      #enSessionRecovery {
        position:fixed!important; inset:0!important; z-index:2147483645!important;
        display:none; justify-content:center; align-items:center; padding:20px;
        box-sizing:border-box; overflow:auto;
        background:rgba(2,6,23,.80); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px);
      }
      #enSessionRecovery[aria-hidden="false"] { display:flex!important; }
      #enSessionRecovery .enRecoveryDialog {
        background:#fff; color:#0f172a; width:min(100%,430px); padding:30px 25px;
        box-sizing:border-box; border:1px solid #cbd5e1; border-radius:18px;
        box-shadow:0 20px 75px rgba(0,0,0,.4); font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      }
      #enSessionRecovery h2 { font:bold 23px/1.22 system-ui,sans-serif; margin:0 0 12px; color:#0f172a; }
      #enSessionRecovery p { margin:0 0 17px; color:#475569; }
      #enSessionRecovery .enRecoveryActions { display:flex; flex-wrap:wrap; gap:10px; }
      #enSessionRecovery button {
        font:600 15px system-ui,sans-serif; cursor:pointer; border-radius:9px;
        border:1px solid #cbd5e1; padding:11px 15px; min-height:44px;
      }
      #enSessionRecovery .enRecoveryPrimary { background:#1d4ed8; border-color:#1d4ed8; color:#fff; flex:1; }
      #enSessionRecovery .enRecoverySecondary { background:#fff; color:#0f172a; }
      #enSessionRecovery button:focus-visible { outline:3px solid #60a5fa; outline-offset:3px; }
      #enSessionRecovery .enRecoveryInfo { color:#64748b; font-size:12px; margin-top:17px; margin-bottom:0; }
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'enSessionRecovery';
    backdrop.setAttribute('aria-hidden', 'true');
    const dialog = document.createElement('section');
    dialog.className = 'enRecoveryDialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'enRecoveryTitle');
    const title = document.createElement('h2');
    title.id = 'enRecoveryTitle';
    title.textContent = 'Your EagleNEST session has expired';
    const explanation = document.createElement('p');
    explanation.textContent = 'Sign in again with your school Google account. We will bring you back to this page.';
    const actions = document.createElement('div');
    actions.className = 'enRecoveryActions';
    const loginButton = document.createElement('button');
    loginButton.className = 'enRecoveryPrimary';
    loginButton.type = 'button';
    loginButton.textContent = 'Sign in with Google';
    loginButton.addEventListener('click', () => { location.assign(signinUrl()); });
    const retryButton = document.createElement('button');
    retryButton.className = 'enRecoverySecondary';
    retryButton.type = 'button';
    retryButton.textContent = 'Try again';
    retryButton.addEventListener('click', async () => {
      retryButton.disabled = true;
      retryButton.textContent = 'Checking…';
      await checkSession(true);
      retryButton.textContent = 'Try again';
      retryButton.disabled = false;
    });
    const info = document.createElement('p');
    info.className = 'enRecoveryInfo';
    info.textContent = 'Your session will not be renewed automatically. Unsaved form changes may be lost when you sign in again.';
    actions.append(loginButton, retryButton);
    // A session-expired modal should not let keyboard focus reach underlying data.
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.key !== 'Tab') return;
      const first = loginButton;
      const last = retryButton.disabled ? loginButton : retryButton;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    dialog.append(title, explanation, actions, info);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    guardElement = backdrop;
    return guardElement;
  }

  function showExpired() {
    authLossObserved = true;
    currentState = 'expired';
    // Clear stale SIDs, not other local preferences or page data.
    window.EAGLENEST_AUTH?.clear?.();
    const modal = installDialog();
    if (!modal) return;
    if (modal.getAttribute('aria-hidden') !== 'false') {
      modal.setAttribute('aria-hidden', 'false');
      modal.querySelector('.enRecoveryPrimary')?.focus();
    }
  }

  function restoreSession() {
    currentState = 'valid';
    if (guardElement) guardElement.setAttribute('aria-hidden', 'true');
    // If the page initialized before reauthentication, reinitialize its page-specific
    // authenticated data, navigation, and access checks by reloading this exact URL.
    if (authLossObserved && !sessionRestorationReloaded) {
      sessionRestorationReloaded = true;
      location.reload();
    }
  }

  async function checkSession(force = false) {
    if (pendingCheck) return pendingCheck;
    if (!force && document.hidden) return null;
    if (!force && Date.now() - activeCheckAt < 4000) return null;
    activeCheckAt = Date.now();
    pendingCheck = (async () => {
      try {
        const response = await nativeFetch.call(window, checkUrl.href, {
          method:'GET', credentials:'include', cache:'no-store', headers:sessionHeader()
        });
        if (response.status === 401) {
          showExpired();
          return false;
        }
        if (response.ok) {
          restoreSession();
          return true;
        }
        // Do not log out or erase a session because of a 403, 429, 5xx, or network fault.
        return null;
      } catch (error) {
        console.warn('[EagleNEST recovery] Session verification unavailable:', error);
        return null;
      } finally {
        pendingCheck = null;
      }
    })();
    return pendingCheck;
  }

  // Observe 401s from this Worker's protected /admin/* APIs, without consuming
  // any response body or changing the response seen by individual pages.
  window.fetch = function (...args) {
    const requestInput = args[0];
    return nativeFetch.apply(this, args).then((response) => {
      if (response.status === 401 && isProtectedWorkerUrl(requestInput)) {
        void checkSession(true);
      }
      return response;
    });
  };

  function boot() {
    if (retryTimer != null) return;
    void checkSession(true);
    retryTimer = setInterval(() => void checkSession(false), 60 * 1000);
    window.addEventListener('focus', () => void checkSession(false));
    window.addEventListener('pageshow', () => void checkSession(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkSession(false); });
    window.addEventListener('storage', (event) => {
      if (event.key && window.EAGLENEST_AUTH?.sessionKeys?.includes(event.key) && event.newValue) {
        void checkSession(true);
      }
    });
  }

  window.__EAGLENEST_SESSION_RECOVERY_V1__ = Object.freeze({
    version:1,
    checkNow: () => checkSession(true),
    getState: () => currentState
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();

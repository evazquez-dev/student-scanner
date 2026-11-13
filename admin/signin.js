// EAGLENEST_SESSION_RECOVERY_SIGNIN_V1
// Isolated Google sign-in avoids overriding Google Identity callbacks on the original staff page.
(() => {
  'use strict';
  const message = document.getElementById('enSignInStatus');
  const signInButton = document.getElementById('enSignInGoogleButton');
  const retryButton = document.getElementById('enSignInRetry');
  const apiBaseRaw = String(document.querySelector('meta[name="api-base"]')?.content || '').trim();
  const googleClientId = String(document.querySelector('meta[name="google-client-id"]')?.content || '').trim();
  const apiBase = apiBaseRaw ? new URL(apiBaseRaw.replace(/\/*$/, '') + '/', location.href) : null;
  const auth = window.EAGLENEST_AUTH;
  const params = new URLSearchParams(location.search);
  let signingIn = false;

  function status(text, isError = false) {
    message.textContent = String(text);
    message.style.color = isError ? '#b91c1c' : '';
  }

  function destination() {
    const raw = params.get('return_to') || '';
    if (!raw) return new URL('./teacher_attendance.html', location.href);
    const value = new URL(raw, location.href);
    const root = new URL('./', location.href);
    if (value.origin !== root.origin || !value.pathname.startsWith(root.pathname)) throw new Error('unsafe_return_url');
    if (/\/(?:signin|auth_return)\.html$/i.test(value.pathname)) throw new Error('recursive_return_url');
    return value;
  }

  function goBack() {
    const url = destination();
    status('Signed in. Returning to EagleNEST…');
    location.replace(url.href);
  }

  function sidHeaders() {
    const sid = String(auth?.getSid?.() || '').trim();
    return sid ? { 'x-admin-session': sid } : {};
  }

  async function existingSession() {
    if (!apiBase) throw new Error('missing_api_base');
    const url = new URL('admin/session/check', apiBase);
    const response = await fetch(url, { credentials:'include', cache:'no-store', headers:sidHeaders() });
    return response.ok;
  }

  async function credentialReceived(reply) {
    if (signingIn) return;
    signingIn = true;
    status('Signing in…');
    try {
      const idToken = String(reply?.credential || '').trim();
      if (!idToken) throw new Error('missing_google_credential');
      if (!apiBase) throw new Error('missing_api_base');
      const endpoint = new URL('admin/session/login_google', apiBase);
      const response = await fetch(endpoint, {
        method:'POST', credentials:'include', cache:'no-store',
        headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
        body:new URLSearchParams({ id_token:idToken }).toString()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.sid) throw new Error(String(data?.error || `login_http_${response.status}`));
      if (!auth?.setSid?.(String(data.sid))) throw new Error('session_store_unavailable');
      goBack();
    } catch (error) {
      signingIn = false;
      status(`Sign-in failed: ${String(error?.message || error)}. Please try again.`, true);
    }
  }

  async function waitForGoogle() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (window.google?.accounts?.id?.initialize && window.google?.accounts?.id?.renderButton) return window.google.accounts.id;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('google_signin_library_unavailable');
  }

  async function showGoogleButton() {
    if (!apiBase || !googleClientId) throw new Error('missing_google_configuration');
    const gsi = await waitForGoogle();
    gsi.initialize({
      client_id:googleClientId,
      callback:credentialReceived,
      auto_select:false,
      cancel_on_tap_outside:false,
      use_fedcm_for_prompt:true
    });
    signInButton.replaceChildren();
    gsi.renderButton(signInButton, { theme:'outline', size:'large', width:300, text:'signin_with' });
    status('Use your school Google account to continue.');
  }

  async function boot() {
    try {
      destination();
      if (await existingSession()) { goBack(); return; }
    } catch (error) {
      if (String(error?.message) === 'unsafe_return_url' || String(error?.message) === 'recursive_return_url') {
        status('The return destination was rejected for security. Open EagleNEST directly and try again.', true);
        return;
      }
      console.warn('[EagleNEST sign in] Initial session check failed:', error);
    }
    try { await showGoogleButton(); }
    catch (error) { status(`Unable to load Google sign-in (${String(error?.message || error)}). Refresh to retry.`, true); }
  }

  retryButton.addEventListener('click', async () => {
    try { status('Checking your session…'); if (await existingSession()) goBack(); else status('No active session. Please sign in with Google.'); }
    catch { status('Cannot reach EagleNEST right now. Check your connection and try again.', true); }
  });
  void boot();
})();

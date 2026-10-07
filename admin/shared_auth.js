// EAGLENEST_SHARED_AUTH_V1
// EAGLENEST_IOS_GOOGLE_REDIRECT_V1
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
  "dean_dashboard_admin_session_v1", // EAGLENEST_DEAN_DASHBOARD_V1
  "coverage_planner_admin_session_v1",
  "dreamer_of_week_admin_session_v1",
  "early_dismissal_admin_session_v1",
  "esas_admin_session_v1",
  "esas_guest_session_v1",
  "excused_apply_admin_session_v1",
  "grades_admin_session_v1",
  "grading_admin_session_v1", // EAGLENEST_GRADING_V1
  "reporting_terms_admin_session_v1", // EAGLENEST_REPORTING_TERMS_V1
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

  let googleRedirectStatePromise = null;
  let googlePatchTimer = null;
  let googlePatchObserver = null;

  function stores(){const a=[];try{a.push(sessionStorage)}catch{}try{a.push(localStorage)}catch{}return a}
  function clean(v){v=String(v||'').trim();return v&&v.length<=512?v:''}
  function getSid(){for(const s of stores())for(const k of SESSION_KEYS){try{const v=clean(s.getItem(k));if(v)return v}catch{}}return ''}
  function setSid(v){const sid=clean(v);if(!sid)return '';for(const s of stores())for(const k of SESSION_KEYS){try{if(s.getItem(k)!==sid)s.setItem(k,sid)}catch{}}return sid}
  function sync(){const sid=getSid();if(sid)setSid(sid);return sid}
  function clear(){for(const s of stores())for(const k of SESSION_KEYS){try{s.removeItem(k)}catch{}}}

  function isIOS(){
    try {
      const ua = String(navigator.userAgent || '');
      const platform = String(navigator.platform || '');
      return /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
    } catch {
      return false;
    }
  }

  function apiBase(){
    try {
      const raw = String(document.querySelector('meta[name="api-base"]')?.content || '').trim();
      return raw ? raw.replace(/\/*$/, '') + '/' : '';
    } catch {
      return '';
    }
  }

  function loginUri(){
    const base = apiBase();
    if (!base) throw new Error('Missing api-base meta for iOS Google sign-in.');
    return new URL('admin/session/login_google', base).href;
  }

  function returnUrl(){
    const u = new URL(location.href);
    u.searchParams.delete('handoff');
    u.searchParams.delete('auth_error');
    return u.href;
  }

  async function prepareGoogleRedirectState(){
    if (!isIOS()) return '';
    if (googleRedirectStatePromise) return googleRedirectStatePromise;
    googleRedirectStatePromise = (async () => {
      const u = new URL(loginUri());
      u.searchParams.set('prepare_redirect', '1');
      u.searchParams.set('return_to', returnUrl());
      const response = await fetch(u, { method:'GET', credentials:'include', cache:'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.state) {
        throw new Error(data?.error || `Google redirect preparation failed (HTTP ${response.status})`);
      }
      return String(data.state);
    })();
    try { return await googleRedirectStatePromise; }
    catch (error) { googleRedirectStatePromise = null; throw error; }
  }

  function showGoogleRedirectError(parent, error){
    try {
      console.error('[EagleNEST iOS Google redirect]', error);
      if (parent && !parent.hasChildNodes()) {
        const box = document.createElement('div');
        box.setAttribute('role', 'alert');
        box.style.cssText = 'font:14px system-ui,sans-serif;color:#b91c1c;max-width:420px';
        box.textContent = 'Google sign-in could not be prepared. Refresh this page and try again.';
        parent.appendChild(box);
      }
    } catch {}
  }

  function patchGoogleIdentity(){
    if (!isIOS()) return false;
    const id = window.google?.accounts?.id;
    if (!id) return false;
    if (id.__EAGLENEST_IOS_REDIRECT_PATCHED__) return true;
    const originalInitialize = id.initialize?.bind(id);
    const originalRenderButton = id.renderButton?.bind(id);
    if (typeof originalInitialize !== 'function' || typeof originalRenderButton !== 'function') return false;

    id.initialize = function(config = {}){
      const next = { ...(config || {}) };
      next.ux_mode = 'redirect';
      next.login_uri = loginUri();
      next.itp_support = true;
      delete next.callback;
      delete next.use_fedcm_for_prompt;
      void prepareGoogleRedirectState().catch((error) => console.error('[EagleNEST iOS Google redirect prepare]', error));
      return originalInitialize(next);
    };

    id.renderButton = function(parent, options = {}){
      void prepareGoogleRedirectState()
        .then((state) => originalRenderButton(parent, { ...(options || {}), state }))
        .catch((error) => showGoogleRedirectError(parent, error));
    };

    try {
      Object.defineProperty(id, '__EAGLENEST_IOS_REDIRECT_PATCHED__', { value:true, configurable:false, enumerable:false, writable:false });
    } catch {
      id.__EAGLENEST_IOS_REDIRECT_PATCHED__ = true;
    }
    return true;
  }

  function attachGoogleScriptListener(script){
    try {
      if (!script || script.__EAGLENEST_AUTH_LISTENER__) return;
      const src = String(script.src || script.getAttribute?.('src') || '');
      if (!src.includes('accounts.google.com/gsi/client')) return;
      script.__EAGLENEST_AUTH_LISTENER__ = true;
      script.addEventListener('load', () => patchGoogleIdentity(), { once:true });
    } catch {}
  }

  function installGoogleRedirectPatch(){
    if (!isIOS()) return;
    if (patchGoogleIdentity()) return;
    try { document.querySelectorAll('script[src*="accounts.google.com/gsi/client"]').forEach(attachGoogleScriptListener); } catch {}

    if (typeof MutationObserver === 'function') {
      try {
        googlePatchObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes || []) {
              if (node?.tagName === 'SCRIPT') attachGoogleScriptListener(node);
              else if (node?.querySelectorAll) node.querySelectorAll('script[src*="accounts.google.com/gsi/client"]').forEach(attachGoogleScriptListener);
            }
          }
          if (patchGoogleIdentity()) {
            googlePatchObserver?.disconnect();
            googlePatchObserver = null;
          }
        });
        googlePatchObserver.observe(document.documentElement || document, { childList:true, subtree:true });
      } catch {}
    }

    let attempts = 0;
    googlePatchTimer = setInterval(() => {
      attempts += 1;
      if (patchGoogleIdentity() || attempts >= 240) {
        clearInterval(googlePatchTimer);
        googlePatchTimer = null;
        googlePatchObserver?.disconnect();
        googlePatchObserver = null;
      }
    }, 50);
  }

  window.EAGLENEST_AUTH=Object.freeze({
    version:2,
    canonicalKey:'ss_admin_session_sid_v1',
    sessionKeys:Object.freeze([...SESSION_KEYS]),
    getSid,setSid,sync,clear,isIOS,prepareGoogleRedirectState,patchGoogleIdentity
  });
  sync();
  installGoogleRedirectPatch();
  window.addEventListener('pageshow',sync);
  window.addEventListener('storage',e=>{if(SESSION_KEYS.includes(String(e?.key||''))&&e?.newValue)sync()});
})();

/* EAGLENEST_STUDENT_PHOTOS_V1_1 — System Administration controls.
 * Settings are persisted by the Worker; local storage is never the authority.
 */
(() => {
  'use strict';
  const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
    .replace(/\/*$/, '') + '/';
  const $ = (id) => document.getElementById(id);
  const global = $('studentPhotosEnabled');
  const hover = $('studentPhotosHoverEnabled');
  const delay = $('studentPhotosHoverDelay');
  const status = $('studentPhotosSettingsStatus');
  const save = $('studentPhotosSettingsSave');
  const reload = $('studentPhotosSettingsReload');
  if (!global || !hover || !delay || !status || !save || !reload) return;

  function sid() {
    return window.EAGLENEST_AUTH?.getSid?.() || '';
  }
  async function request(method, body) {
    const headers = new Headers();
    const token = sid();
    if (token) headers.set('x-admin-session', token);
    if (body) headers.set('content-type', 'application/json');
    const resp = await fetch(new URL('/admin/student/photo/settings', API_BASE), {
      method, headers, credentials:'include', cache:'no-store',
      ...(body ? {body:JSON.stringify(body)} : {})
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data?.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }
  function updateForm(settings) {
    global.checked = !!settings.enabled;
    hover.checked = !!settings.hover_enabled;
    delay.value = (Number(settings.hover_delay_ms || 500) / 1000).toFixed(1);
    hover.disabled = !global.checked;
    delay.disabled = !global.checked || !hover.checked;
  }
  function setStatus(message, failed = false) {
    status.textContent = message;
    status.style.color = failed ? 'var(--bad, #b91c1c)' : 'var(--muted, #64748b)';
  }
  global.addEventListener('change', () => {
    hover.disabled = !global.checked;
    delay.disabled = !global.checked || !hover.checked;
  });
  hover.addEventListener('change', () => {
    delay.disabled = !global.checked || !hover.checked;
  });
  async function load() {
    save.disabled = true;
    setStatus('Loading shared settings…');
    try {
      updateForm(await request('GET'));
      setStatus('Settings loaded. Changes affect staff when their pages refresh (or within about a minute).');
    } catch (e) {
      setStatus(`Cannot load settings: ${e.message}`, true);
    } finally {
      save.disabled = false;
    }
  }
  async function submit() {
    const seconds = Number(delay.value);
    if (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 5 ||
        Math.abs(seconds * 10 - Math.round(seconds * 10)) > 1e-8) {
      setStatus('Choose a delay from 0.1 to 5.0 seconds in 0.1-second increments.', true);
      return;
    }
    const data = {
      enabled:global.checked,
      hover_enabled:hover.checked,
      hover_delay_ms:Math.round(seconds * 1000)
    };
    save.disabled = true;
    setStatus('Saving shared settings…');
    try {
      updateForm(await request('POST', data));
      setStatus('Saved for all EagleNEST staff. Existing open pages refresh these settings within about one minute.');
    } catch (e) {
      setStatus(`Save failed: ${e.message}`, true);
    } finally {
      save.disabled = false;
    }
  }
  reload.addEventListener('click', load);
  save.addEventListener('click', submit);

  // Admin JS emits this only after it has confirmed the super-admin session.
  document.addEventListener('eaglenest:sysadmin-ready', load);
  if (document.documentElement.dataset.studentPhotoSysAdminReady === '1') load();
})();

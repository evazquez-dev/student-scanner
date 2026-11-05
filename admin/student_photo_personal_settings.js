/* EAGLENEST_STUDENT_PHOTOS_V1_2 — staff-owned portrait sizing in My Settings.
 * The Worker is authoritative: browser storage only announces a change to
 * another already-open EagleNEST tab, never stores the actual preference.
 */
(() => {
  'use strict';
  const app = document.getElementById('app');
  const select = document.getElementById('studentPhotoSizeMultiplier');
  const save = document.getElementById('saveStudentPhotoSize');
  const reload = document.getElementById('reloadStudentPhotoSize');
  const status = document.getElementById('studentPhotoSizeStatus');
  if (!app || !select || !save || !reload || !status) return;
  const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
    .replace(/\/*$/, '') + '/';
  const SIZES = new Set([0.5, 1, 1.5, 2, 2.5, 3]);
  let loaded = false;
  let busy = false;

  async function request(method, value) {
    const headers = new Headers();
    const sid = window.EAGLENEST_AUTH?.getSid?.() || '';
    if (sid) headers.set('x-admin-session', sid);
    const options = {method, headers, credentials:'include', cache:'no-store'};
    if (method === 'POST') {
      headers.set('content-type', 'application/json');
      options.body = JSON.stringify({size_multiplier:value});
    }
    const response = await fetch(new URL('/admin/student/photo/preferences', API_BASE), options);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    const multiplier = Number(data.size_multiplier);
    if (!SIZES.has(multiplier)) throw new Error('Unsupported photo size returned by server');
    return multiplier;
  }
  function message(text, error = false) {
    status.textContent = text;
    status.style.color = error ? 'var(--bad, #b91c1c)' : 'var(--muted, #64748b)';
  }
  function lock(on) {
    busy = on;
    select.disabled = on;
    save.disabled = on;
    reload.disabled = on;
  }
  async function load() {
    if (busy) return;
    lock(true);
    message('Loading your photo size…');
    try {
      const multiplier = await request('GET');
      select.value = String(multiplier);
      loaded = true;
      message(`Current size: ${multiplier}×. Your preference follows your school account.`);
    } catch (error) {
      message(`Could not load your photo size: ${error.message}`, true);
    } finally { lock(false); }
  }
  async function persist() {
    if (busy || !loaded) return;
    const chosen = Number(select.value);
    if (!SIZES.has(chosen)) { message('Choose one of the provided photo sizes.', true); return; }
    lock(true);
    message('Saving your preferred photo size…');
    try {
      const value = await request('POST', chosen);
      select.value = String(value);
      message(`Saved ${value}×. Student Lookup and Teacher Attendance will use your size.`);
      try { localStorage.setItem('eaglenest_student_photo_preference_changed_v1', String(Date.now())); }
      catch { /* Cross-tab announcement is optional. */ }
    } catch (error) {
      message(`Save failed: ${error.message}`, true);
    } finally { lock(false); }
  }
  save.addEventListener('click', persist);
  reload.addEventListener('click', load);
  const observer = new MutationObserver(() => {
    if (app.hidden || loaded) return;
    load();
  });
  observer.observe(app, {attributes:true, attributeFilter:['hidden']});
  if (!app.hidden) load();
})();

// EAGLENEST_COURSE_GRADE_POLICY_V1 - super-admin course toggles in Admin Settings.
(() => {
  'use strict';
  const el = (tag, cls = '') => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const API = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
  const keys = ['admin_session_v1', 'ss_admin_session_sid_v1', 'teacher_att_admin_session_v1', 'staff_pull_admin_session_v1'];
  const sid = () => { try { for (const k of keys) { const v = sessionStorage.getItem(k) || localStorage.getItem(k); if (v) return v; } } catch {} return ''; };
  async function api(path, init = {}) {
    const headers = new Headers(init.headers || {});
    if (sid()) headers.set('x-admin-session', sid());
    const response = await fetch(new URL(path, API), { ...init, headers, credentials:'include', cache:'no-store' });
    const next = response.headers.get('x-admin-session');
    if (next) { try { sessionStorage.setItem('ss_admin_session_sid_v1', next); } catch {} }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) throw Error(data?.error || `HTTP ${response.status}`);
    return data;
  }
  let rows = [], originals = {}, saving = false, mounted = false;
  function mount() {
    if (mounted) return;
    const anchor = document.getElementById('gradesSettingsCard');
    if (!anchor) return;
    mounted = true;
    const card = el('section', 'card'); card.id = 'courseGradeEligibilityCard';
    const heading = el('h2'); heading.textContent = 'Course Grade Eligibility'; card.append(heading);
    const info = el('p', 'muted');
    info.textContent = 'Schoolwide grade calculations only. Excluded courses remain on schedules, class rosters and attendance. College Advising defaults to excluded.';
    card.append(info);
    const tools = el('div', 'row'); tools.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0;';
    const search = el('input'); search.type = 'search'; search.placeholder = 'Search course name or code';
    search.style.cssText = 'flex:1;min-width:210px;max-width:420px;'; search.setAttribute('aria-label', 'Find course');
    const save = el('button', 'btn primary'); save.type = 'button'; save.textContent = 'Save course exclusions';
    const reload = el('button', 'btn'); reload.type = 'button'; reload.textContent = 'Reload';
    tools.append(search, save, reload); card.append(tools);
    const status = el('div', 'muted'); status.setAttribute('role', 'status'); status.textContent = 'Loading courses…'; card.append(status);
    const listing = el('div'); listing.style.cssText = 'max-height:390px;overflow:auto;margin-top:12px;'; card.append(listing);
    anchor.insertAdjacentElement('afterend', card);
    function render() {
      listing.replaceChildren();
      const q = search.value.trim().toLowerCase();
      const visible = rows.filter(r => `${r.name} ${r.course_code}`.toLowerCase().includes(q));
      for (const row of visible) {
        const label = el('label'); label.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 3px;border-bottom:1px solid var(--border,#8884);cursor:pointer;';
        const text = el('div'); const title = el('strong'); title.textContent = row.name || row.course_code;
        const sub = el('div', 'muted'); sub.textContent = `${row.course_code} · ${row.included ? 'Included in grade calculations' : 'Not counted in grades'}`;
        text.append(title, sub);
        const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = row.included; checkbox.setAttribute('aria-label', `Include ${row.name || row.course_code} in grade calculations`);
        checkbox.addEventListener('change', () => { row.included = checkbox.checked; render(); });
        label.append(text, checkbox); listing.append(label);
      }
      status.textContent = `${rows.filter(x => x.included).length} included · ${rows.filter(x => !x.included).length} excluded · ${visible.length} displayed`;
    }
    async function load() {
      try {
        status.textContent = 'Loading course catalog…';
        const data = await api('/admin/grades/course-policy');
        rows = Array.isArray(data.courses) ? data.courses.map(r => ({ ...r })) : [];
        originals = { ...(data.settings?.course_overrides || {}) };
        render();
      } catch (error) { status.textContent = `Unable to load courses: ${error?.message || error}`; }
    }
    search.addEventListener('input', render); reload.addEventListener('click', load);
    save.addEventListener('click', async () => {
      if (saving) return;
      saving = true; save.disabled = true;
      try {
        // Send all displayed catalog choices. Preserve orphaned overrides on the server.
        const overrides = { ...originals };
        for (const row of rows) overrides[row.course_code] = row.included;
        const data = await api('/admin/grades/settings', {
          method:'POST', headers:{'content-type':'application/json'},
          body:JSON.stringify({ course_overrides:overrides })
        });
        originals = { ...(data.settings?.course_overrides || {}) };
        status.textContent = 'Saved. Grade-related eligibility and alerts now use these settings.';
      } catch (error) { status.textContent = `Save failed: ${error?.message || error}`; }
      finally { saving = false; save.disabled = false; }
    });
    load();
  }
  let attempts = 0;
  const timer = setInterval(() => {
    if (document.getElementById('gradesSettingsCard')) { clearInterval(timer); mount(); }
    else if (++attempts >= 120) clearInterval(timer);
  }, 250);
})();

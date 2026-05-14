(() => {
  'use strict';

  const API_BASE = (() => {
    const m = document.querySelector('meta[name="api-base"]');
    const raw = (m?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/') || (location.origin + '/'); }
    catch { return location.origin + '/'; }
  })();

  const ADMIN_SESSION_KEYS = [
    'reflection_hold_admin_session_v1',
    'teacher_att_admin_session_v1',
    'attendance_change_admin_session_v1',
    'admin_session_v1',
    'admin_session_sid'
  ];
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const $ = (id) => document.getElementById(id);

  const state = {
    today: '',
    adminEmail: '',
    roster: [],
    filtered: [],
    selectedOsis: new Set(),
    previewRows: [],
    previewSignature: '',
    eligibleOsis: [],
    activeHolds: []
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
      for (const k of ADMIN_SESSION_KEYS){
        const v = String(sessionStorage.getItem(k) || localStorage.getItem(k) || '').trim();
        if (v) return v;
      }
    } catch {}
    return '';
  }
  function setStoredAdminSessionSid(sid){
    const v = String(sid || '').trim();
    if (!v) return;
    for (const k of ADMIN_SESSION_KEYS){
      try { sessionStorage.setItem(k, v); } catch {}
      try { localStorage.setItem(k, v); } catch {}
    }
  }
  function clearStoredAdminSessionSid(){
    for (const k of ADMIN_SESSION_KEYS){
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
    const u = (pathOrUrl instanceof URL) ? pathOrUrl : new URL(pathOrUrl, API_BASE);
    const headers = new Headers(init.headers || {});
    const sid = getStoredAdminSessionSid();
    if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
    const resp = await fetch(u, { ...init, headers, credentials: 'include', cache: 'no-store' });
    stashAdminSessionFromResponse(resp);
    if (resp.status === 401) clearStoredAdminSessionSid();
    return resp;
  }

  function normalizeOsis(v){
    const d = String(v || '').replace(/\D/g, '').trim();
    if (!d) return '';
    if (d.length < 6 || d.length > 12) return '';
    return d;
  }
  function formPayload(){
    return {
      date: state.today,
      holdLabel: String($('holdLabel')?.value || '').trim() || 'Reflection Hold',
      teacherName: String($('teacherName')?.value || '').trim(),
      room: String($('roomInput')?.value || '').trim(),
      reason: String($('reasonInput')?.value || '').trim(),
      osisList: Array.from(state.selectedOsis).sort()
    };
  }
  function currentSignature(){
    return JSON.stringify(formPayload());
  }
  function setStatus(msg, ok = true){
    const el = $('resultBox');
    if (!el) return;
    el.className = 'status ' + (ok ? 'ok' : 'bad');
    el.textContent = msg;
  }
  function fmtClock(iso){
    const ms = Date.parse(String(iso || ''));
    if (!Number.isFinite(ms)) return '';
    try {
      return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return String(iso || '');
    }
  }
  function updateCounts(){
    $('selectedCount').textContent = String(state.selectedOsis.size);
    $('rosterSelectedCount').textContent = String(state.selectedOsis.size);
    $('eligibleCount').textContent = String(state.eligibleOsis.length);
    $('confirmBtn').disabled = !(state.eligibleOsis.length && state.previewSignature === currentSignature());
  }

  function renderRoster(){
    const q = String($('rosterSearch')?.value || '').trim().toLowerCase();
    state.filtered = state.roster.filter((s) => {
      if (!q) return true;
      return String(s.name || '').toLowerCase().includes(q) || String(s.osis || '').includes(q);
    }).slice(0, 600);

    const body = $('rosterBody');
    body.innerHTML = '';
    for (const s of state.filtered) {
      const tr = document.createElement('tr');
      const td0 = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.selectedOsis.has(String(s.osis));
      cb.addEventListener('change', () => {
        if (cb.checked) state.selectedOsis.add(String(s.osis));
        else state.selectedOsis.delete(String(s.osis));
        state.previewRows = [];
        state.previewSignature = '';
        state.eligibleOsis = [];
        updateCounts();
        renderPreview();
      });
      td0.appendChild(cb);
      const td1 = document.createElement('td'); td1.textContent = String(s.name || '');
      const td2 = document.createElement('td'); td2.className = 'mono'; td2.textContent = String(s.osis || '');
      const td3 = document.createElement('td'); td3.className = 'mono'; td3.textContent = String(s.grade || '');
      tr.append(td0, td1, td2, td3);
      body.appendChild(tr);
    }
    updateCounts();
  }

  function renderPreview(){
    const body = $('previewBody');
    body.innerHTML = '';
    if (!state.previewRows.length) {
      body.innerHTML = '<tr><td colspan="4" class="muted">No hold check loaded yet.</td></tr>';
      updateCounts();
      return;
    }
    for (const row of state.previewRows) {
      const tr = document.createElement('tr');
      let chip = '<span class="chip ok">Ready</span>';
      let detail = row?.current?.label || row?.current?.loc || '';
      if (!row.in_roster) {
        chip = '<span class="chip bad">Unknown</span>';
        detail = 'Not found in current roster';
      } else if (row.already_held) {
        chip = '<span class="chip warn">Already held</span>';
        const hold = row.hold || {};
        detail = [
          hold.held_by_title || hold.held_target_label || hold.held_by_role || 'Hold active',
          hold.held_by_email || '',
          hold.held_by_since ? `since ${fmtClock(hold.held_by_since)}` : ''
        ].filter(Boolean).join(' • ');
      }
      tr.innerHTML = `
        <td>${chip}</td>
        <td>${esc(row.name || '')}</td>
        <td class="mono">${esc(row.osis || '')}</td>
        <td>${esc(detail || '—')}</td>
      `;
      body.appendChild(tr);
    }
    updateCounts();
  }

  function renderActiveHolds(){
    const body = $('activeBody');
    body.innerHTML = '';
    if (!state.activeHolds.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">No active reflection holds today.</td></tr>';
      return;
    }
    for (const row of state.activeHolds) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(row.name || '')}</td>
        <td class="mono">${esc(row.osis || '')}</td>
        <td>${esc(row.label || 'Reflection Hold')}</td>
        <td class="mono">${esc(fmtClock(row.held_by_since) || '')}</td>
        <td><button type="button" class="danger releaseBtn" data-osis="${esc(row.osis || '')}">Release</button></td>
      `;
      body.appendChild(tr);
    }
    body.querySelectorAll('.releaseBtn').forEach((btn) => {
      btn.addEventListener('click', () => releaseHold(String(btn.dataset.osis || '')));
    });
  }

  async function loadOptions(){
    const accessResp = await adminFetch('/admin/access', { method: 'GET' });
    const access = await accessResp.json().catch(() => null);
    if (!accessResp.ok || !access?.ok) throw new Error(access?.error || `access HTTP ${accessResp.status}`);
    if (!access?.can?.reflection_hold && !access?.can?.admin) throw new Error('reflection_hold_forbidden');

    const optsResp = await adminFetch('/admin/reflection_hold/options', { method: 'GET' });
    const opts = await optsResp.json().catch(() => null);
    if (!optsResp.ok || !opts?.ok) throw new Error(opts?.error || `reflection_hold/options HTTP ${optsResp.status}`);

    const rosterResp = await adminFetch('/admin/roster/all?limit=5000', { method: 'GET' });
    const rosterData = await rosterResp.json().catch(() => null);
    if (!rosterResp.ok || !rosterData?.ok) throw new Error(rosterData?.error || `roster/all HTTP ${rosterResp.status}`);

    state.today = String(opts.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
    state.adminEmail = String(opts?.who?.email || access.email || '');
    state.activeHolds = Array.isArray(opts.active_holds) ? opts.active_holds : [];
    state.roster = (Array.isArray(rosterData.students) ? rosterData.students : []).map((s) => ({
      osis: String(s.osis || ''),
      name: String(s.name || ''),
      grade: String(s.grade || '')
    })).filter((s) => !!s.osis);

    $('todayLabel').textContent = state.today;
    $('adminLabel').textContent = state.adminEmail || '—';
    renderRoster();
    renderActiveHolds();
  }

  async function loadHoldCheck(){
    if (!state.selectedOsis.size) {
      setStatus('Select students first.', false);
      return;
    }
    const payload = formPayload();
    setStatus('Checking selected students for existing holds...', true);
    $('loadCheckBtn').disabled = true;
    $('confirmBtn').disabled = true;
    try {
      const resp = await adminFetch('/admin/reflection_hold/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) throw new Error(data?.error || `preview HTTP ${resp.status}`);
      state.previewRows = Array.isArray(data.rows) ? data.rows : [];
      state.eligibleOsis = state.previewRows.filter((row) => row.eligible).map((row) => normalizeOsis(row.osis)).filter(Boolean);
      state.previewSignature = currentSignature();
      renderPreview();
      const counts = data.counts || {};
      setStatus(`Checked ${counts.total || 0}. Ready: ${counts.eligible || 0}. Already held: ${counts.already_held || 0}. Unknown: ${counts.unknown || 0}.`, (counts.eligible || 0) > 0);
    } catch (err) {
      state.previewRows = [];
      state.eligibleOsis = [];
      state.previewSignature = '';
      renderPreview();
      setStatus(String(err?.message || err), false);
    } finally {
      $('loadCheckBtn').disabled = false;
      updateCounts();
    }
  }

  async function confirmHold(){
    if (!state.eligibleOsis.length) {
      setStatus('No eligible students to confirm.', false);
      return;
    }
    if (state.previewSignature !== currentSignature()) {
      setStatus('Selection or hold details changed. Load the hold check again before confirming.', false);
      return;
    }
    const payload = formPayload();
    setStatus('Confirming reflection hold...', true);
    $('confirmBtn').disabled = true;
    try {
      const resp = await adminFetch('/admin/reflection_hold/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) throw new Error(data?.error || `confirm HTTP ${resp.status}`);
      setStatus(`Confirmed ${data.applied_count || 0} hold(s). Skipped ${data.skipped_count || 0}. Unknown ${data.unknown_count || 0}.`, true);
      state.previewRows = [];
      state.eligibleOsis = [];
      state.previewSignature = '';
      renderPreview();
      await loadOptions();
    } catch (err) {
      setStatus(String(err?.message || err), false);
    } finally {
      updateCounts();
    }
  }

  async function releaseHold(osisRaw){
    const osis = normalizeOsis(osisRaw);
    if (!osis) return;
    setStatus(`Releasing ${osis}...`, true);
    try {
      const resp = await adminFetch('/admin/reflection_hold/release', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: state.today, osisList: [osis] })
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) throw new Error(data?.error || `release HTTP ${resp.status}`);
      setStatus(`Released ${data.released_count || 0} reflection hold(s).`, true);
      await loadOptions();
    } catch (err) {
      setStatus(String(err?.message || err), false);
    }
  }

  function bootEvents(){
    $('rosterSearch')?.addEventListener('input', renderRoster);
    for (const id of ['holdLabel', 'teacherName', 'roomInput', 'reasonInput']) {
      $(id)?.addEventListener('input', () => {
        state.previewRows = [];
        state.previewSignature = '';
        state.eligibleOsis = [];
        renderPreview();
        updateCounts();
      });
    }
    $('selVisibleBtn')?.addEventListener('click', () => {
      for (const s of state.filtered) state.selectedOsis.add(String(s.osis));
      state.previewRows = [];
      state.previewSignature = '';
      state.eligibleOsis = [];
      renderRoster();
      renderPreview();
    });
    $('clrVisibleBtn')?.addEventListener('click', () => {
      for (const s of state.filtered) state.selectedOsis.delete(String(s.osis));
      state.previewRows = [];
      state.previewSignature = '';
      state.eligibleOsis = [];
      renderRoster();
      renderPreview();
    });
    $('loadCheckBtn')?.addEventListener('click', loadHoldCheck);
    $('confirmBtn')?.addEventListener('click', confirmHold);
    $('refreshBtn')?.addEventListener('click', async () => {
      try {
        setStatus('Refreshing active holds...', true);
        await loadOptions();
        setStatus('Active holds refreshed.', true);
      } catch (err) {
        setStatus(String(err?.message || err), false);
      }
    });
  }

  async function init(){
    bootEvents();
    try {
      await loadOptions();
      $('authCard').style.display = 'none';
      $('app').style.display = '';
      setStatus('Select students, then load the hold check before confirming.', true);
    } catch (err) {
      $('authCard').style.display = '';
      $('app').style.display = 'none';
      setStatus(String(err?.message || err), false);
    }
  }

  init();
})();

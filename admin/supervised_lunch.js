(() => {
  'use strict';

  const API_BASE = (() => {
    const m = document.querySelector('meta[name="api-base"]');
    const raw = (m?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/') || (location.origin + '/'); }
    catch { return location.origin + '/'; }
  })();

  const ADMIN_SESSION_KEYS = [
    'supervised_lunch_admin_session_v1',
    'teacher_att_admin_session_v1',
    'attendance_change_admin_session_v1',
    'admin_session_v1',
    'admin_session_sid'
  ];
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const $ = (id) => document.getElementById(id);

  const state = {
    roster: [],
    rosterByPeriod: {},
    lastUsedByPeriod: {},
    filtered: [],
    selectedOsis: new Set(),
    assignments: new Map(),
    today: '',
    teacherEmail: '',
    periods: [],
    rooms: []
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
  function currentKey(){
    return `${String($('periodLocal')?.value || '').trim().toUpperCase()}|${String($('roomInput')?.value || '').trim()}`;
  }
  function currentAssignment(){
    return state.assignments.get(currentKey()) || [];
  }
  function setStatus(msg, ok = true){
    const el = $('resultBox');
    if (!el) return;
    el.className = 'status ' + (ok ? 'ok' : 'bad');
    el.textContent = msg;
  }
  function sourceRosterForCurrentPeriod(){
    const periodLocal = String($('periodLocal')?.value || '').trim().toUpperCase();
    return Array.isArray(state.rosterByPeriod?.[periodLocal]) ? state.rosterByPeriod[periodLocal] : state.roster;
  }
  function currentLastUsed(){
    const periodLocal = String($('periodLocal')?.value || '').trim().toUpperCase();
    const rec = state.lastUsedByPeriod?.[periodLocal];
    return rec && typeof rec === 'object' ? rec : null;
  }
  function renderLastUsed(){
    const box = $('lastSetBox');
    const btn = $('useLastSetBtn');
    if (!box || !btn) return;
    const periodLocal = String($('periodLocal')?.value || '').trim().toUpperCase();
    const rec = currentLastUsed();
    if (!periodLocal) {
      box.textContent = 'Choose a lunch to view the last used set.';
      box.className = 'status';
      btn.disabled = true;
      return;
    }
    if (!rec || !Array.isArray(rec.osisList) || !rec.osisList.length) {
      box.textContent = `No last used set saved for ${periodLocal} yet.`;
      box.className = 'status';
      btn.disabled = true;
      return;
    }
    const when = String(rec.updatedAt || '').trim();
    box.textContent = `Last used for ${periodLocal}: ${rec.count} student(s)` + (rec.room ? ` from room ${rec.room}` : '') + (when ? ` • saved ${when}` : '');
    box.className = 'status ok';
    btn.disabled = false;
  }
  function applyLastUsedSet(){
    const rec = currentLastUsed();
    if (!rec || !Array.isArray(rec.osisList) || !rec.osisList.length) {
      setStatus('No last used set is available for this lunch.', false);
      return;
    }
    const eligible = new Set(sourceRosterForCurrentPeriod().map((s) => String(s.osis || '')).filter(Boolean));
    const next = rec.osisList.map(normalizeOsis).filter((osis) => !!osis && eligible.has(osis));
    const skipped = rec.osisList.length - next.length;
    state.selectedOsis = new Set(next);
    renderRoster();
    renderSelection();
    setStatus(skipped > 0 ? `Loaded last set for this lunch. ${skipped} student(s) were skipped because they are not lunch-assigned for this period now.` : `Loaded last set for this lunch.`, skipped === 0);
  }

  function renderRoster(){
    const source = sourceRosterForCurrentPeriod();
    const q = String($('rosterSearch')?.value || '').trim().toLowerCase();
    state.filtered = source.filter((s) => {
      if (!q) return true;
      return String(s.name || '').toLowerCase().includes(q) || String(s.osis || '').includes(q);
    }).slice(0, 500);

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
        renderSelection();
      });
      td0.appendChild(cb);
      const td1 = document.createElement('td'); td1.textContent = String(s.name || '');
      const td2 = document.createElement('td'); td2.className = 'mono'; td2.textContent = String(s.osis || '');
      const td3 = document.createElement('td'); td3.className = 'mono'; td3.textContent = String(s.grade || '');
      tr.append(td0, td1, td2, td3);
      body.appendChild(tr);
    }
    $('rosterSelectedCount').textContent = String(state.selectedOsis.size);
  }

  function renderSelection(){
    $('finalCount').textContent = String(state.selectedOsis.size);
    $('rosterSelectedCount').textContent = String(state.selectedOsis.size);
    const list = Array.from(state.selectedOsis).sort();
    const kpis = $('kpis');
    kpis.innerHTML = '';
    for (const [label, value] of [
      ['Selected', list.length],
      ['Lunch', String($('periodLocal')?.value || '—')],
      ['Room', String($('roomInput')?.value || '—')]
    ]) {
      const span = document.createElement('span');
      span.className = 'kpi mono';
      span.textContent = `${label}: ${value}`;
      kpis.appendChild(span);
    }
    const namesByOsis = new Map(state.roster.map((s) => [String(s.osis), String(s.name || '')]));
    const preview = list.slice(0, 200).map((osis) => `${osis}  ${namesByOsis.get(osis) || ''}`.trim());
    $('resolvedPreview').textContent = preview.length ? preview.join('\n') + (list.length > preview.length ? `\n... (+${list.length - preview.length} more)` : '') : 'No students selected yet.';
  }

  function renderAssignmentSummary(){
    const wrap = $('assignmentSummary');
    wrap.innerHTML = '';
    const rows = Array.from(state.assignments.entries()).map(([key, osisList]) => {
      const [periodLocal, room] = key.split('|');
      return { key, periodLocal, room, count: osisList.length };
    }).sort((a, b) => a.periodLocal.localeCompare(b.periodLocal) || a.room.localeCompare(b.room, undefined, { numeric: true, sensitivity: 'base' }));
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'summaryItem muted';
      empty.textContent = 'No supervised lunch groups saved yet.';
      wrap.appendChild(empty);
      return;
    }
    for (const row of rows) {
      const item = document.createElement('div');
      item.className = 'summaryItem';
      item.innerHTML = `<b>${row.periodLocal}</b> • Room ${row.room} • <span class="mono">${row.count}</span> student(s)`;
      wrap.appendChild(item);
    }
  }

  function loadCurrentAssignmentIntoSelection(){
    state.selectedOsis = new Set(currentAssignment().map(normalizeOsis).filter(Boolean));
    renderRoster();
    renderSelection();
    renderLastUsed();
  }

  async function loadOptionsAndRoster(){
    const accessResp = await adminFetch('/admin/access', { method: 'GET' });
    const access = await accessResp.json().catch(() => null);
    if (!accessResp.ok || !access?.ok) throw new Error(access?.error || `access HTTP ${accessResp.status}`);

    const optsResp = await adminFetch('/admin/supervised_lunch/options', { method: 'GET' });
    const opts = await optsResp.json().catch(() => null);
    if (!optsResp.ok || !opts?.ok) throw new Error(opts?.error || `supervised_lunch/options HTTP ${optsResp.status}`);

    const rosterResp = await adminFetch('/admin/roster/all?limit=5000', { method: 'GET' });
    const rosterData = await rosterResp.json().catch(() => null);
    if (!rosterResp.ok || !rosterData?.ok) throw new Error(rosterData?.error || `roster/all HTTP ${rosterResp.status}`);

    state.today = String(opts.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
    state.teacherEmail = String(opts.teacherEmail || access.email || '');
    state.periods = Array.isArray(opts.lunch_periods) ? opts.lunch_periods : [];
    state.rooms = Array.isArray(opts.rooms) ? opts.rooms : [];
    state.roster = (Array.isArray(rosterData.students) ? rosterData.students : []).map((s) => ({
      osis: String(s.osis || ''),
      name: String(s.name || ''),
      grade: String(s.grade || '')
    })).filter((s) => !!s.osis);
    state.rosterByPeriod = {};
    state.lastUsedByPeriod = {};
    for (const periodLocal of state.periods) {
      const rows = Array.isArray(opts?.eligible_by_period?.[periodLocal]) ? opts.eligible_by_period[periodLocal] : state.roster;
      state.rosterByPeriod[periodLocal] = rows.map((s) => ({
        osis: String(s.osis || ''),
        name: String(s.name || ''),
        grade: String(s.grade || '')
      })).filter((s) => !!s.osis);
      const lastRaw = opts?.last_used_by_period?.[periodLocal];
      if (lastRaw && typeof lastRaw === 'object' && Array.isArray(lastRaw.osisList) && lastRaw.osisList.length) {
        state.lastUsedByPeriod[periodLocal] = {
          room: String(lastRaw.room || ''),
          count: Number(lastRaw.count || lastRaw.osisList.length || 0),
          updatedAt: String(lastRaw.updatedAt || ''),
          osisList: lastRaw.osisList.map(normalizeOsis).filter(Boolean)
        };
      }
    }
    state.assignments = new Map();
    for (const rec of Array.isArray(opts.assignments) ? opts.assignments : []) {
      const key = `${String(rec.periodLocal || '').trim().toUpperCase()}|${String(rec.room || '').trim()}`;
      state.assignments.set(key, Array.isArray(rec.osisList) ? rec.osisList.map(normalizeOsis).filter(Boolean) : []);
    }

    $('todayLabel').textContent = state.today;
    $('teacherLabel').textContent = state.teacherEmail || '—';

    const periodSel = $('periodLocal');
    const roomSel = $('roomInput');
    periodSel.innerHTML = '';
    roomSel.innerHTML = '<option value="">Select room…</option>';
    for (const p of state.periods) {
      const opt = document.createElement('option');
      opt.value = String(p);
      opt.textContent = String(p);
      periodSel.appendChild(opt);
    }
    for (const room of state.rooms) {
      const opt = document.createElement('option');
      opt.value = String(room);
      opt.textContent = String(room);
      roomSel.appendChild(opt);
    }

    if (state.periods.length) periodSel.value = state.periods[0];
    const firstSaved = Array.from(state.assignments.keys())[0] || '';
    if (firstSaved) {
      const [p, room] = firstSaved.split('|');
      periodSel.value = p;
      roomSel.value = room;
    }

    renderRoster();
    renderAssignmentSummary();
    loadCurrentAssignmentIntoSelection();
  }

  async function saveAssignment(clearOnly = false){
    const periodLocal = String($('periodLocal').value || '').trim().toUpperCase();
    const room = String($('roomInput').value || '').trim();
    if (!periodLocal || !room) {
      setStatus('Choose a lunch and room first.', false);
      return;
    }
    const osisList = clearOnly ? [] : Array.from(state.selectedOsis).sort();
    setStatus(clearOnly ? 'Clearing assignment…' : 'Saving assignment…', true);
    const saveBtn = $('saveBtn'); const clearBtn = $('clearBtn');
    saveBtn.disabled = true; clearBtn.disabled = true;
    try {
      const resp = await adminFetch('/admin/supervised_lunch/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: state.today, periodLocal, room, osisList })
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) throw new Error(data?.error || `save HTTP ${resp.status}`);
      const key = `${periodLocal}|${room}`;
      if (osisList.length) state.assignments.set(key, osisList);
      else state.assignments.delete(key);
      renderAssignmentSummary();
      loadCurrentAssignmentIntoSelection();
      setStatus(osisList.length ? `Saved ${osisList.length} student(s) for ${periodLocal} in room ${room}.` : `Cleared supervised lunch assignment for ${periodLocal} in room ${room}.`, true);
    } catch (err) {
      setStatus(String(err?.message || err), false);
    } finally {
      saveBtn.disabled = false; clearBtn.disabled = false;
    }
  }

  function bootEvents(){
    $('rosterSearch')?.addEventListener('input', renderRoster);
    $('selVisibleBtn')?.addEventListener('click', () => {
      for (const s of state.filtered) state.selectedOsis.add(String(s.osis));
      renderRoster(); renderSelection();
    });
    $('clrVisibleBtn')?.addEventListener('click', () => {
      for (const s of state.filtered) state.selectedOsis.delete(String(s.osis));
      renderRoster(); renderSelection();
    });
    $('periodLocal')?.addEventListener('change', loadCurrentAssignmentIntoSelection);
    $('roomInput')?.addEventListener('change', loadCurrentAssignmentIntoSelection);
    $('loadAssignmentBtn')?.addEventListener('click', loadCurrentAssignmentIntoSelection);
    $('useLastSetBtn')?.addEventListener('click', applyLastUsedSet);
    $('saveBtn')?.addEventListener('click', () => saveAssignment(false));
    $('clearBtn')?.addEventListener('click', () => saveAssignment(true));
  }

  async function init(){
    try {
      await loadOptionsAndRoster();
      bootEvents();
      $('authCard').style.display = 'none';
      $('app').style.display = '';
    } catch (err) {
      $('authCard').style.display = '';
      $('app').style.display = 'none';
      setStatus(String(err?.message || err), false);
    }
  }

  init();
})();

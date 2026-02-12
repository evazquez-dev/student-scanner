(() => {
  'use strict';

  const API_BASE = (() => {
    const m = document.querySelector('meta[name="api-base"]');
    const raw = (m?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/') || (location.origin + '/'); }
    catch { return location.origin + '/'; }
  })();

  const ADMIN_SESSION_KEY = 'admin_session_sid';
  const ADMIN_SESSION_HEADER = 'x-admin-session';

  const $ = (id) => document.getElementById(id);

  const state = {
    roster: [],
    selectedOsis: new Set(),
    filtered: [],
    csvOsis: [],
    pasteOsis: [],
    finalOsis: [],
    today: null,
    periodOptions: []
  };

  // ---------- theme ----------
  (function initTheme(){
    const root = document.documentElement;
    const key = 'ss_theme_v1';
    const stored = localStorage.getItem(key);
    const initial = stored || ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark');
    root.dataset.theme = initial;
    const btn = $('themeToggle');
    const refresh = () => btn.textContent = root.dataset.theme === 'light' ? 'Dark' : 'Light';
    refresh();
    btn.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(key, root.dataset.theme); } catch {}
      refresh();
    });
  })();

  function getStoredAdminSessionSid(){
    try{
      return String(
        sessionStorage.getItem(ADMIN_SESSION_KEY) ||
        localStorage.getItem(ADMIN_SESSION_KEY) || ''
      ).trim();
    } catch { return ''; }
  }
  function setStoredAdminSessionSid(sid){
    const v = String(sid || '').trim();
    if (!v) return;
    try { sessionStorage.setItem(ADMIN_SESSION_KEY, v); } catch {}
    try { localStorage.setItem(ADMIN_SESSION_KEY, v); } catch {}
  }
  function clearStoredAdminSessionSid(){
    try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch {}
    try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch {}
  }
  function stashAdminSessionFromResponse(resp){
    try{
      const sid = String(
        resp?.headers?.get(ADMIN_SESSION_HEADER) ||
        resp?.headers?.get('X-Admin-Session') ||
        ''
      ).trim();
      if (sid) setStoredAdminSessionSid(sid);
    } catch {}
  }

  async function adminFetch(pathOrUrl, init = {}){
    const u = (pathOrUrl instanceof URL) ? pathOrUrl : new URL(pathOrUrl, API_BASE);
    const headers = new Headers(init.headers || {});

    const sidFromUrl = new URL(location.href).searchParams.get('sid');
    if (sidFromUrl) setStoredAdminSessionSid(String(sidFromUrl));

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
        if (err === 'expired' || err === 'bad_session') clearStoredAdminSessionSid();
      } catch {}
    }

    return resp;
  }

  function normalizeOsis(v){
    const d = String(v || '').replace(/\D/g, '').trim();
    if (!d) return '';
    if (d.length < 6 || d.length > 12) return '';
    return d;
  }

  function parseMixedTextToOsis(text){
    const parts = String(text || '').split(/[,\n\r\t; ]+/g).filter(Boolean);
    const out = [];
    for (const p of parts) {
      const n = normalizeOsis(p);
      if (n) out.push(n);
    }
    return Array.from(new Set(out));
  }

  function parseCsvOneColumn(text){
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return [];
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const delim = line.includes(',') ? ',' : (line.includes('\t') ? '\t' : (line.includes(';') ? ';' : null));
      const firstCell = delim ? String(line.split(delim)[0] || '').trim() : line;
      const n = normalizeOsis(firstCell);
      if (!n) continue;
      out.push(n);
    }
    return Array.from(new Set(out));
  }

  function formatJson(obj){
    try { return JSON.stringify(obj, null, 2); }
    catch { return String(obj); }
  }

  function setResult(msg, ok = true){
    const el = $('resultBox');
    el.className = 'status ' + (ok ? 'ok' : 'bad');
    el.textContent = msg;
  }

  function renderRoster(){
    const q = String($('rosterSearch').value || '').trim().toLowerCase();
    state.filtered = state.roster.filter(s => {
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
        renderCounts();
      });
      td0.appendChild(cb);

      const td1 = document.createElement('td');
      td1.textContent = String(s.name || '');

      const td2 = document.createElement('td');
      td2.className = 'mono';
      td2.textContent = String(s.osis || '');

      const td3 = document.createElement('td');
      td3.className = 'mono';
      td3.textContent = String(s.grade || '');

      tr.append(td0, td1, td2, td3);
      body.appendChild(tr);
    }
  }

  function computeFinalList(){
    state.pasteOsis = parseMixedTextToOsis($('osisText').value || '');

    const combined = [
      ...Array.from(state.selectedOsis),
      ...state.pasteOsis,
      ...state.csvOsis
    ];
    const dedup = Array.from(new Set(combined.map(normalizeOsis).filter(Boolean)));
    state.finalOsis = dedup;

    renderCounts();
    renderPreview();
  }

  function renderCounts(){
    $('rosterSelectedCount').textContent = String(state.selectedOsis.size);
    $('finalCount').textContent = String(state.finalOsis.length);
  }

  function renderPreview(){
    const k = $('kpis');
    const total = state.finalOsis.length;
    const fromRoster = Array.from(state.selectedOsis).length;
    const fromPaste = state.pasteOsis.length;
    const fromCsv = state.csvOsis.length;
    k.innerHTML = '';
    const mk = (label, v) => {
      const span = document.createElement('span');
      span.className = 'kpi mono';
      span.textContent = `${label}: ${v}`;
      return span;
    };
    k.append(
      mk('Total unique', total),
      mk('From roster', fromRoster),
      mk('From paste', fromPaste),
      mk('From CSV', fromCsv)
    );

    const preview = $('resolvedPreview');
    if (!total) {
      preview.textContent = 'No students selected yet.';
      return;
    }
    const top = state.finalOsis.slice(0, 200);
    preview.textContent = top.join('\n') + (state.finalOsis.length > top.length ? `\n... (+${state.finalOsis.length - top.length} more)` : '');
  }

  async function loadOptionsAndRoster(){
    // access check first
    const accessResp = await adminFetch('/admin/access', { method: 'GET' });
    const access = await accessResp.json().catch(() => null);
    if (!accessResp.ok || !access?.ok) {
      throw new Error(access?.error || `access HTTP ${accessResp.status}`);
    }

    // period options
    const optsResp = await adminFetch('/admin/teacher_att/options', { method: 'GET' });
    const opts = await optsResp.json().catch(() => null);
    if (!optsResp.ok || !opts?.ok) {
      throw new Error(opts?.error || `teacher_att/options HTTP ${optsResp.status}`);
    }

    // full roster
    const rosterResp = await adminFetch('/admin/roster/all?limit=5000', { method: 'GET' });
    const rosterData = await rosterResp.json().catch(() => null);
    if (!rosterResp.ok || !rosterData?.ok) {
      throw new Error(rosterData?.error || `roster/all HTTP ${rosterResp.status}`);
    }

    state.periodOptions = Array.isArray(opts.period_options) ? opts.period_options : [];
    state.roster = (Array.isArray(rosterData.students) ? rosterData.students : []).map(s => ({
      osis: String(s.osis || ''),
      name: String(s.name || ''),
      grade: String(s.grade || '')
    })).filter(s => !!s.osis);

    // period dropdown
    const sel = $('periodLocal');
    sel.innerHTML = '';
    for (const p of state.periodOptions) {
      const o = document.createElement('option');
      o.value = String(p.value || '');
      o.textContent = String(p.label || p.value || '');
      sel.appendChild(o);
    }
    const current = String(opts.current_period_local || '').trim();
    if (current) sel.value = current;

    state.today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    $('todayLabel').textContent = state.today;

    renderRoster();
    computeFinalList();
  }

  async function applyExcused(){
    computeFinalList();
    if (!state.finalOsis.length) {
      setResult('No OSIS selected. Add students first.', false);
      return;
    }

    const periodLocal = String($('periodLocal').value || '').trim();
    if (!periodLocal) {
      setResult('Please choose a start period.', false);
      return;
    }

    const markOffCampus = !!$('markOffCampus').checked;
    const payload = {
      date: state.today,
      periodLocal,
      markOffCampus,
      osisList: state.finalOsis
    };

    $('applyBtn').disabled = true;
    setResult('Applying…', true);

    try{
      const r = await adminFetch('/admin/excused/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.ok) {
        setResult(formatJson(data || { ok:false, error:`HTTP ${r.status}` }), false);
        return;
      }

      const summary = {
        ok: true,
        date: data.date,
        periodLocal: data.periodLocal,
        targetPeriods: data.targetPeriods,
        requested: data.requested,
        lockSet: data.lockSet,
        overridesApplied: data.overridesApplied,
        offCampusApplied: data.offCampusApplied,
        unknownCount: data.unknownCount,
        noRoomCount: data.noRoomCount,
        rowErrorCount: data.rowErrorCount,
        finalPatchedRooms: data.finalPatchedRooms,
        deltaRowsCount: data.deltaRowsCount,
        gas: data.gas
      };
      setResult(formatJson(summary), true);

      // optional: show a compact warning if there are row errors
      if ((data.rowErrorCount || 0) > 0 || (data.noRoomCount || 0) > 0) {
        $('resultBox').textContent += '\n\nWarnings:\n' + formatJson({
          noRoomSample: (data.noRoomSample || []).slice(0, 20),
          rowErrorSample: (data.rowErrorSample || []).slice(0, 20),
          unknownOsis: (data.unknownOsis || []).slice(0, 20)
        });
      }
    } catch (e){
      setResult(String(e?.message || e), false);
    } finally {
      $('applyBtn').disabled = false;
    }
  }

  function wireEvents(){
    $('rosterSearch').addEventListener('input', () => renderRoster());

    $('selVisibleBtn').addEventListener('click', () => {
      for (const s of state.filtered) state.selectedOsis.add(String(s.osis));
      computeFinalList();
      renderRoster();
    });

    $('clrVisibleBtn').addEventListener('click', () => {
      for (const s of state.filtered) state.selectedOsis.delete(String(s.osis));
      computeFinalList();
      renderRoster();
    });

    $('osisText').addEventListener('input', () => computeFinalList());

    $('csvFile').addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) {
        state.csvOsis = [];
        $('csvHint').textContent = 'No CSV loaded yet.';
        computeFinalList();
        return;
      }
      try{
        const text = await file.text();
        state.csvOsis = parseCsvOneColumn(text);
        $('csvHint').textContent = `Loaded ${state.csvOsis.length} OSIS from CSV.`;
      } catch (e){
        state.csvOsis = [];
        $('csvHint').textContent = `Could not parse CSV: ${String(e?.message || e)}`;
      }
      computeFinalList();
    });

    $('recalcBtn').addEventListener('click', () => computeFinalList());
    $('applyBtn').addEventListener('click', () => applyExcused());
  }

  async function init(){
    try{
      wireEvents();
      await loadOptionsAndRoster();

      $('authCard').style.display = 'none';
      $('app').style.display = 'block';
      setResult('Ready.', true);
    } catch (e){
      $('authCard').style.display = 'block';
      $('app').style.display = 'none';
      setResult(String(e?.message || e), false);
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();

(() => {
  'use strict';

  const API_BASE = (() => {
    const m = document.querySelector('meta[name="api-base"]');
    const raw = (m?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/') || (location.origin + '/'); }
    catch { return location.origin + '/'; }
  })();

  const ADMIN_SESSION_KEYS = ['attendance_change_admin_session_v1', 'excused_apply_admin_session_v1', 'admin_session_v1', 'admin_session_sid'];
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
      return '';
    } catch { return ''; }
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
    for (const line of lines) {
      const delim = line.includes(',') ? ',' : (line.includes('\t') ? '\t' : (line.includes(';') ? ';' : null));
      const firstCell = delim ? String(line.split(delim)[0] || '').trim() : line;
      const n = normalizeOsis(firstCell);
      if (n) out.push(n);
    }
    return Array.from(new Set(out));
  }

  function formatJson(obj){
    try { return JSON.stringify(obj, null, 2); }
    catch { return String(obj); }
  }

  function setBox(id, msg, ok = true){
    const el = $(id);
    if (!el) return;
    el.className = 'status ' + (ok ? 'ok' : 'bad');
    el.textContent = msg;
  }

  function setResult(msg, ok = true){ setBox('resultBox', msg, ok); }
  function setScanResult(msg, ok = true){ setBox('scanBox', msg, ok); }

  function getAllStudentsMode(){
    return !!$('allStudents')?.checked;
  }

  function getApplyOsisList(){
    if (getAllStudentsMode()) {
      return state.roster.map(s => String(s.osis || '')).filter(Boolean);
    }
    return state.finalOsis.slice();
  }

  function getSelectedCurrentStatusFilters(){
    return Array.from(document.querySelectorAll('.curStatusFilter:checked'))
      .map(el => String(el.value || '').trim().toUpperCase())
      .filter(Boolean);
  }

  function updateTargetDependentUI(){
    const code = String($('targetCode')?.value || 'E').toUpperCase();
    const offCampus = $('markOffCampus');
    if (!offCampus) return;
    offCampus.disabled = code !== 'E';
    if (code !== 'E') offCampus.checked = false;
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

      const td1 = document.createElement('td'); td1.textContent = String(s.name || '');
      const td2 = document.createElement('td'); td2.className = 'mono'; td2.textContent = String(s.osis || '');
      const td3 = document.createElement('td'); td3.className = 'mono'; td3.textContent = String(s.grade || '');

      tr.append(td0, td1, td2, td3);
      body.appendChild(tr);
    }
  }

  function computeFinalList(){
    state.pasteOsis = parseMixedTextToOsis($('osisText').value || '');
    const combined = [...Array.from(state.selectedOsis), ...state.pasteOsis, ...state.csvOsis];
    state.finalOsis = Array.from(new Set(combined.map(normalizeOsis).filter(Boolean)));
    renderCounts();
    renderPreview();
  }

  function renderCounts(){
    $('rosterSelectedCount').textContent = String(state.selectedOsis.size);
    const allMode = getAllStudentsMode();
    const total = allMode ? state.roster.length : state.finalOsis.length;
    $('finalCount').textContent = String(total);
    $('scopeLabel').textContent = allMode ? 'All students' : 'Selected list';
  }

  function renderPreview(){
    const allMode = getAllStudentsMode();
    const previewList = allMode ? state.roster.map(s => s.osis) : state.finalOsis;

    const k = $('kpis');
    k.innerHTML = '';
    const mk = (label, v) => {
      const span = document.createElement('span');
      span.className = 'kpi mono';
      span.textContent = `${label}: ${v}`;
      return span;
    };

    k.append(
      mk('Total unique', previewList.length),
      mk('From roster picks', state.selectedOsis.size),
      mk('From paste', state.pasteOsis.length),
      mk('From CSV', state.csvOsis.length),
      mk('All students', allMode ? 'ON' : 'OFF')
    );

    const preview = $('resolvedPreview');
    if (!previewList.length) {
      preview.textContent = allMode ? 'No roster loaded yet for All Students mode.' : 'No students selected yet.';
      return;
    }
    const top = previewList.slice(0, 200);
    const header = allMode ? `ALL STUDENTS MODE (${previewList.length})` : `SELECTED LIST (${previewList.length})`;
    preview.textContent = header + '\n' + top.join('\n') + (previewList.length > top.length ? `\n... (+${previewList.length - top.length} more)` : '');
  }

  async function loadOptionsAndRoster(){
    const accessResp = await adminFetch('/admin/access', { method: 'GET' });
    const access = await accessResp.json().catch(() => null);
    if (!accessResp.ok || !access?.ok) throw new Error(access?.error || `access HTTP ${accessResp.status}`);

    const optsResp = await adminFetch('/admin/teacher_att/options', { method: 'GET' });
    const opts = await optsResp.json().catch(() => null);
    if (!optsResp.ok || !opts?.ok) throw new Error(opts?.error || `teacher_att/options HTTP ${optsResp.status}`);

    const rosterResp = await adminFetch('/admin/roster/all?limit=5000', { method: 'GET' });
    const rosterData = await rosterResp.json().catch(() => null);
    if (!rosterResp.ok || !rosterData?.ok) throw new Error(rosterData?.error || `roster/all HTTP ${rosterResp.status}`);

    state.periodOptions = Array.isArray(opts.period_options) ? opts.period_options : [];
    state.roster = (Array.isArray(rosterData.students) ? rosterData.students : []).map(s => ({
      osis: String(s.osis || ''),
      name: String(s.name || ''),
      grade: String(s.grade || '')
    })).filter(s => !!s.osis);

    const startSel = $('periodLocal');
    const endSel = $('endPeriodLocal');
    startSel.innerHTML = '';
    endSel.innerHTML = '';

    const endBlank = document.createElement('option');
    endBlank.value = '';
    endBlank.textContent = 'End of day';
    endSel.appendChild(endBlank);

    for (const p of state.periodOptions) {
      const value = String(p.value || '');
      const label = String(p.label || p.value || '');

      const o1 = document.createElement('option');
      o1.value = value;
      o1.textContent = label;
      startSel.appendChild(o1);

      const o2 = document.createElement('option');
      o2.value = value;
      o2.textContent = label;
      endSel.appendChild(o2);
    }

    const current = String(opts.current_period_local || '').trim();
    if (current) startSel.value = current;
    endSel.value = '';

    state.today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    $('todayLabel').textContent = state.today;

    renderRoster();
    computeFinalList();
    updateTargetDependentUI();
  }

  function buildPayload(dryRun){
    computeFinalList();

    const allStudents = getAllStudentsMode();
    const osisList = allStudents ? [] : getApplyOsisList();
    if (!allStudents && !osisList.length) {
      throw new Error('No OSIS selected. Add students first or use All Students.');
    }

    const periodLocal = String($('periodLocal').value || '').trim();
    if (!periodLocal) throw new Error('Please choose a start period.');

    const endPeriodLocal = String($('endPeriodLocal').value || '').trim();
    const targetCodeLetter = String($('targetCode').value || 'E').trim().toUpperCase();
    const onlyIfCurrentCodes = getSelectedCurrentStatusFilters();

    return {
      date: state.today,
      periodLocal,
      endPeriodLocal: endPeriodLocal || undefined,
      targetCodeLetter,
      markOffCampus: !!$('markOffCampus').checked,
      allStudents,
      osisList,
      onlyIfCurrentCodes,
      dryRun: !!dryRun
    };
  }

  function summarizeScanResponse(data){
    const counts = data?.currentStatusCounts || {};
    const summary = {
      ok: !!data?.ok,
      dryRun: !!data?.dryRun,
      date: data?.date,
      periodRange: data?.endPeriodLocal ? `${data?.periodLocal} → ${data?.endPeriodLocal}` : `${data?.periodLocal} → EOD`,
      targetCodeLetter: data?.targetCodeLetter,
      targetPeriods: data?.targetPeriods,
      allStudents: !!data?.allStudents,
      requestedStudents: data?.requested,
      scannedRowsCount: data?.scannedRowsCount,
      wouldApplyCount: data?.wouldApplyCount,
      filterActive: !!data?.filterActive,
      onlyIfCurrentCodes: data?.onlyIfCurrentCodes || [],
      matchedByCurrentStatusCount: data?.matchedByCurrentStatusCount,
      skippedByCurrentStatusCount: data?.skippedByCurrentStatusCount,
      currentStatusCounts: {
        Absent_A: counts.A || 0,
        Present_P: counts.P || 0,
        Late_L: counts.L || 0,
        Excused_E: counts.E || 0,
        NoStatus: counts.NONE || 0
      },
      unknownCount: data?.unknownCount || 0,
      noRoomCount: data?.noRoomCount || 0
    };
    return formatJson(summary);
  }

  function summarizeApplyResponse(data){
    const counts = data?.currentStatusCounts || null;
    const summary = {
      ok: !!data?.ok,
      date: data?.date,
      periodRange: data?.endPeriodLocal ? `${data?.periodLocal} → ${data?.endPeriodLocal}` : `${data?.periodLocal} → EOD`,
      targetCodeLetter: data?.targetCodeLetter,
      targetPeriods: data?.targetPeriods,
      allStudents: !!data?.allStudents,
      requestedStudents: data?.requested,
      studentsAffectedCount: data?.studentsAffectedCount,
      overridesApplied: data?.overridesApplied,
      lockSet: data?.lockSet,
      locksCleared: data?.locksCleared,
      offCampusApplied: data?.offCampusApplied,
      filterActive: !!data?.filterActive,
      onlyIfCurrentCodes: data?.onlyIfCurrentCodes || [],
      scannedRowsCount: data?.scannedRowsCount,
      matchedByCurrentStatusCount: data?.matchedByCurrentStatusCount,
      skippedByCurrentStatusCount: data?.skippedByCurrentStatusCount,
      currentStatusCounts: counts ? {
        Absent_A: counts.A || 0,
        Present_P: counts.P || 0,
        Late_L: counts.L || 0,
        Excused_E: counts.E || 0,
        NoStatus: counts.NONE || 0
      } : null,
      unknownCount: data?.unknownCount,
      noRoomCount: data?.noRoomCount,
      rowErrorCount: data?.rowErrorCount,
      finalPatchedRooms: data?.finalPatchedRooms,
      deltaRowsCount: data?.deltaRowsCount,
      gas: data?.gas
    };
    return formatJson(summary);
  }

  async function submitAttendanceChange({ dryRun }){
    const payload = buildPayload(dryRun);
    const applyBtn = $('applyBtn');
    const scanBtn = $('scanBtn');
    applyBtn.disabled = true;
    scanBtn.disabled = true;

    if (dryRun) setScanResult('Scanning current statuses…', true);
    else setResult('Applying attendance change…', true);

    try {
      const r = await adminFetch('/admin/excused/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.ok) {
        const msg = formatJson(data || { ok:false, error:`HTTP ${r.status}` });
        if (dryRun) setScanResult(msg, false);
        else setResult(msg, false);
        return;
      }

      if (dryRun) {
        setScanResult(summarizeScanResponse(data), true);
        if ((data.noRoomCount || 0) > 0 || (data.unknownCount || 0) > 0) {
          $('scanBox').textContent += '\n\nWarnings:\n' + formatJson({
            noRoomSample: (data.noRoomSample || []).slice(0, 20),
            unknownOsis: (data.unknownOsis || []).slice(0, 20)
          });
        }
      } else {
        setResult(summarizeApplyResponse(data), true);
        if ((data.rowErrorCount || 0) > 0 || (data.noRoomCount || 0) > 0 || (data.unknownCount || 0) > 0) {
          $('resultBox').textContent += '\n\nWarnings:\n' + formatJson({
            noRoomSample: (data.noRoomSample || []).slice(0, 20),
            rowErrorSample: (data.rowErrorSample || []).slice(0, 20),
            unknownOsis: (data.unknownOsis || []).slice(0, 20)
          });
        }
      }
    } catch (e) {
      if (dryRun) setScanResult(String(e?.message || e), false);
      else setResult(String(e?.message || e), false);
    } finally {
      applyBtn.disabled = false;
      scanBtn.disabled = false;
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
    $('allStudents').addEventListener('change', () => { renderCounts(); renderPreview(); });
    $('targetCode').addEventListener('change', updateTargetDependentUI);

    $('csvFile').addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) {
        state.csvOsis = [];
        $('csvHint').textContent = 'No CSV loaded yet.';
        computeFinalList();
        return;
      }
      try {
        const text = await file.text();
        state.csvOsis = parseCsvOneColumn(text);
        $('csvHint').textContent = `Loaded ${state.csvOsis.length} OSIS from CSV.`;
      } catch (e) {
        state.csvOsis = [];
        $('csvHint').textContent = `Could not parse CSV: ${String(e?.message || e)}`;
      }
      computeFinalList();
    });

    $('recalcBtn').addEventListener('click', () => computeFinalList());
    $('scanBtn').addEventListener('click', () => submitAttendanceChange({ dryRun: true }));
    $('applyBtn').addEventListener('click', () => submitAttendanceChange({ dryRun: false }));
  }

  async function init(){
    try {
      wireEvents();
      await loadOptionsAndRoster();
      $('authCard').style.display = 'none';
      $('app').style.display = 'block';
      setResult('Ready.', true);
      setScanResult('Run “Scan Current Statuses” to preview current codes and filter impact.', true);
    } catch (e) {
      $('authCard').style.display = 'block';
      $('app').style.display = 'none';
      setResult(String(e?.message || e), false);
      setScanResult(String(e?.message || e), false);
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();

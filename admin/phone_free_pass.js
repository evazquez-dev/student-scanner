(() => {
  'use strict';

  const API_BASE = (() => {
    const raw = (document.querySelector('meta[name="api-base"]')?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/') || `${location.origin}/`; }
    catch { return `${location.origin}/`; }
  })();
  const ADMIN_SESSION_KEYS = [
    'phone_free_pass_admin_session_v1', 'ss_admin_session_sid_v1', 'teacher_att_admin_session_v1',
    'attendance_change_admin_session_v1', 'admin_session_v1', 'admin_session_sid'
  ];
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const $ = (id) => document.getElementById(id);

  const state = {
    students: [],
    byOSIS: new Map(),
    savedOsis: new Set(),
    selectedOsis: new Set(),
    pasteOsis: [],
    csvOsis: [],
    filtered: [],
    date: '',
    practice: false,
    counts: {}
  };

  (function initTheme(){
    const root = document.documentElement;
    const key = 'ss_theme_v1';
    let theme = null;
    try { theme = localStorage.getItem(key); } catch {}
    if (!theme) theme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    root.dataset.theme = theme;
    const refresh = () => { if ($('themeToggle')) $('themeToggle').textContent = root.dataset.theme === 'light' ? 'Dark' : 'Light'; };
    refresh();
    $('themeToggle')?.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(key, root.dataset.theme); } catch {}
      refresh();
    });
  })();

  function getSid(){
    try {
      for (const key of ADMIN_SESSION_KEYS) {
        const value = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
        if (value) return value;
      }
    } catch {}
    return '';
  }

  function saveSid(value){
    const sid = String(value || '').trim();
    if (!sid) return;
    for (const key of ADMIN_SESSION_KEYS) {
      try { sessionStorage.setItem(key, sid); } catch {}
      try { localStorage.setItem(key, sid); } catch {}
    }
  }

  async function adminFetch(path, init = {}){
    const headers = new Headers(init.headers || {});
    const sidFromUrl = new URL(location.href).searchParams.get('sid');
    if (sidFromUrl) saveSid(sidFromUrl);
    const sid = getSid();
    if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
    const response = await fetch(new URL(path, API_BASE), { ...init, headers, credentials:'include', cache:'no-store' });
    const returned = String(response.headers.get(ADMIN_SESSION_HEADER) || response.headers.get('X-Admin-Session') || '').trim();
    if (returned) saveSid(returned);
    return response;
  }

  function normalizeOsis(value){
    const digits = String(value || '').replace(/\D/g, '');
    return /^\d{6,12}$/.test(digits) ? digits : '';
  }

  function parseMixed(text){
    return Array.from(new Set(String(text || '').split(/[,\n\r\t; ]+/g).map(normalizeOsis).filter(Boolean)));
  }

  function parseCsv(text){
    const out = [];
    for (const line of String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      const first = line.includes(',') ? line.split(',')[0] : (line.includes('\t') ? line.split('\t')[0] : (line.includes(';') ? line.split(';')[0] : line));
      const osis = normalizeOsis(first);
      if (osis) out.push(osis);
    }
    return Array.from(new Set(out));
  }

  function setResult(message, kind = ''){
    const el = $('resultBox');
    el.className = `status${kind ? ` ${kind}` : ''}`;
    el.textContent = message;
  }

  function statusForStudent(student){
    const osis = String(student.osis || '');
    const nowSelected = currentFinal().known.includes(osis);
    const wasSaved = state.savedOsis.has(osis);
    if (nowSelected && !wasSaved) return { cls:'pending-save', text:'Will be eligible after save' };
    if (!nowSelected && wasSaved) return { cls:'remove-save', text:'Will be removed when saved' };
    if (!wasSaved) return { cls:'', text:'Not on today\'s saved list' };
    return { cls:String(student.status || ''), text:String(student.label || 'Saved today') };
  }

  function currentFinal(){
    state.pasteOsis = parseMixed($('osisText')?.value || '');
    const all = new Set([...state.selectedOsis, ...state.pasteOsis, ...state.csvOsis]);
    const known = [];
    const unknown = [];
    for (const osis of all) (state.byOSIS.has(osis) ? known : unknown).push(osis);
    known.sort((a, b) => String(state.byOSIS.get(a)?.name || '').localeCompare(String(state.byOSIS.get(b)?.name || ''), undefined, { sensitivity:'base' }));
    unknown.sort();
    return { known, unknown };
  }

  function renderCounts(){
    const final = currentFinal();
    $('savedCount').textContent = String(state.savedOsis.size);
    $('selectedCount').textContent = String(final.known.length);
    $('checkedCount').textContent = String(state.selectedOsis.size);
    $('availableCount').textContent = String(state.counts?.available || 0);
    $('usedCount').textContent = String(state.counts?.used_today || 0);
    $('outCount').textContent = String(state.counts?.phone_out || 0);
    $('regularPendingCount').textContent = String(state.counts?.regular_pending || 0);
  }

  function renderPreview(){
    const final = currentFinal();
    renderCounts();
    if (!final.known.length && !final.unknown.length) {
      $('previewBox').className = 'status';
      $('previewBox').textContent = 'No students selected. Saving now would replace today\'s list with an empty list.';
      return;
    }
    const lines = final.known.map((osis) => {
      const student = state.byOSIS.get(osis);
      return `✓ ${student?.name || 'Unknown'} — ${osis}${student?.grade ? ` — Grade ${student.grade}` : ''}`;
    });
    if (final.unknown.length) lines.push('', `⚠ Unknown OSIS: ${final.unknown.join(', ')}`);
    $('previewBox').className = `status${final.unknown.length ? ' warn' : ' ok'}`;
    $('previewBox').textContent = lines.join('\n');
  }

  function renderRoster(){
    const q = String($('rosterSearch')?.value || '').trim().toLowerCase();
    state.filtered = state.students.filter((student) => !q || `${student.name} ${student.osis} ${student.grade}`.toLowerCase().includes(q)).slice(0, 700);
    const body = $('rosterBody');
    body.innerHTML = '';
    for (const student of state.filtered) {
      const tr = document.createElement('tr');
      const pick = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.selectedOsis.has(String(student.osis));
      cb.addEventListener('change', () => {
        if (cb.checked) state.selectedOsis.add(String(student.osis));
        else state.selectedOsis.delete(String(student.osis));
        renderRoster();
        renderPreview();
      });
      pick.appendChild(cb);
      const name = document.createElement('td'); name.textContent = student.name || '—';
      const osis = document.createElement('td'); osis.className = 'mono'; osis.textContent = student.osis || '—';
      const grade = document.createElement('td'); grade.textContent = student.grade || '—';
      const status = document.createElement('td');
      const info = statusForStudent(student);
      const badge = document.createElement('span'); badge.className = `badge ${info.cls || ''}`; badge.textContent = info.text;
      status.appendChild(badge);
      tr.append(pick, name, osis, grade, status);
      body.appendChild(tr);
    }
    renderCounts();
  }

  function applyServerState(data){
    state.students = Array.isArray(data.students) ? data.students : [];
    state.byOSIS = new Map(state.students.map((student) => [String(student.osis || ''), student]));
    state.savedOsis = new Set((Array.isArray(data.saved_osis) ? data.saved_osis : []).map(String));
    state.selectedOsis = new Set(state.savedOsis);
    state.date = String(data.date || '');
    state.practice = data.practice === true;
    state.counts = data.counts || {};
    state.csvOsis = [];
    $('osisText').value = '';
    $('csvFile').value = '';
    $('csvHint').textContent = 'No CSV loaded.';
    $('dateLabel').textContent = `${state.date || '—'}${state.practice ? ' · PRACTICE' : ''}`;
    $('savedMeta').textContent = data.updated_at
      ? `Last saved ${new Date(data.updated_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}${data.updated_by ? ` by ${data.updated_by}` : ''}`
      : 'Not saved today.';
    renderRoster();
    renderPreview();
  }

  async function loadState(){
    setResult('Loading today\'s Free Phone Pass list…', 'warn');
    const response = await adminFetch('/admin/phone_free_pass/state');
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      $('authCard').style.display = '';
      $('app').style.display = 'none';
      return;
    }
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    $('authCard').style.display = 'none';
    $('app').style.display = '';
    applyServerState(data);
    setResult(state.savedOsis.size ? `Loaded ${state.savedOsis.size} student(s) saved for today.` : 'Today starts empty. Build and save the list when ready.', 'ok');
  }

  async function saveToday(osis){
    const response = await adminFetch('/admin/phone_free_pass/save', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ osis })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      const suffix = Array.isArray(data?.invalid_osis) && data.invalid_osis.length ? `: ${data.invalid_osis.join(', ')}` : '';
      throw new Error(`${data?.error || `HTTP ${response.status}`}${suffix}`);
    }
    applyServerState(data);
    return data;
  }

  $('rosterSearch')?.addEventListener('input', renderRoster);
  $('osisText')?.addEventListener('input', () => { renderRoster(); renderPreview(); });
  $('selectVisibleBtn')?.addEventListener('click', () => {
    for (const student of state.filtered) state.selectedOsis.add(String(student.osis));
    renderRoster(); renderPreview();
  });
  $('clearVisibleBtn')?.addEventListener('click', () => {
    for (const student of state.filtered) state.selectedOsis.delete(String(student.osis));
    renderRoster(); renderPreview();
  });
  $('freshBtn')?.addEventListener('click', () => {
    state.selectedOsis.clear(); state.csvOsis = []; $('osisText').value = ''; $('csvFile').value = ''; $('csvHint').textContent = 'No CSV loaded.';
    renderRoster(); renderPreview(); setResult('Local selection cleared. Nothing has changed on the saved daily list yet.', 'warn');
  });
  $('reloadBtn')?.addEventListener('click', () => loadState().catch((error) => setResult(`Reload failed: ${error?.message || error}`, 'bad')));
  $('csvFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) { state.csvOsis = []; $('csvHint').textContent = 'No CSV loaded.'; renderPreview(); return; }
    try {
      state.csvOsis = parseCsv(await file.text());
      $('csvHint').textContent = `${file.name}: ${state.csvOsis.length} OSIS found.`;
      renderRoster(); renderPreview();
    } catch (error) {
      state.csvOsis = []; $('csvHint').textContent = `Could not read CSV: ${error?.message || error}`; renderPreview();
    }
  });
  $('saveBtn')?.addEventListener('click', async () => {
    const final = currentFinal();
    if (final.unknown.length) { setResult(`Cannot save until these unknown OSIS are removed or corrected: ${final.unknown.join(', ')}`, 'bad'); return; }
    $('saveBtn').disabled = true;
    setResult(`Replacing today's list with ${final.known.length} student(s)…`, 'warn');
    try {
      await saveToday(final.known);
      setResult(`Saved today's Free Phone Pass list: ${final.known.length} student(s).`, 'ok');
    } catch (error) { setResult(`Save failed: ${error?.message || error}`, 'bad'); }
    finally { $('saveBtn').disabled = false; }
  });
  $('clearSavedBtn')?.addEventListener('click', async () => {
    if (!confirm('Save an EMPTY Free Phone Pass list for today?')) return;
    $('clearSavedBtn').disabled = true;
    setResult('Clearing today\'s saved list…', 'warn');
    try { await saveToday([]); setResult('Today\'s Free Phone Pass list is empty.', 'ok'); }
    catch (error) { setResult(`Clear failed: ${error?.message || error}`, 'bad'); }
    finally { $('clearSavedBtn').disabled = false; }
  });

  loadState().catch((error) => {
    $('app').style.display = '';
    setResult(`Could not load Free Phone Pass: ${error?.message || error}`, 'bad');
  });
})();

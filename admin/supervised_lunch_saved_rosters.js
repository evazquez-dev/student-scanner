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
    'ss_admin_session_sid_v1',
    'teacher_att_admin_session_v1',
    'attendance_change_admin_session_v1',
    'admin_session_v1',
    'admin_session_sid'
  ];
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  let savedRosters = [];

  function getStoredAdminSessionSid(){
    try {
      for (const key of ADMIN_SESSION_KEYS) {
        const value = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
        if (value) return value;
      }
    } catch {}
    return '';
  }

  function setStoredAdminSessionSid(sid){
    const value = String(sid || '').trim();
    if (!value) return;
    for (const key of ADMIN_SESSION_KEYS) {
      try { sessionStorage.setItem(key, value); } catch {}
      try { localStorage.setItem(key, value); } catch {}
    }
  }

  async function adminFetch(pathOrUrl, init = {}){
    const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
    const headers = new Headers(init.headers || {});
    const sid = getStoredAdminSessionSid();
    if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
    const response = await fetch(url, { ...init, headers, credentials: 'include', cache: 'no-store' });
    try {
      const nextSid = String(response.headers.get(ADMIN_SESSION_HEADER) || response.headers.get('X-Admin-Session') || '').trim();
      if (nextSid) setStoredAdminSessionSid(nextSid);
    } catch {}
    return response;
  }

  function setPageStatus(message, ok = true){
    const box = document.getElementById('resultBox');
    if (!box) return;
    box.className = `status ${ok ? 'ok' : 'bad'}`;
    box.textContent = String(message || '');
  }

  function selectedRoster(){
    const id = String(document.getElementById('savedRosterSelect')?.value || '').trim();
    return savedRosters.find((row) => String(row?.id || '') === id) || null;
  }

  function renderCatalog(preferredId = ''){
    const select = document.getElementById('savedRosterSelect');
    const loadBtn = document.getElementById('loadSavedRosterBtn');
    const deleteBtn = document.getElementById('deleteSavedRosterBtn');
    if (!select) return;
    const current = String(preferredId || select.value || '').trim();
    select.innerHTML = '<option value="">Select saved roster…</option>';
    for (const row of savedRosters) {
      const option = document.createElement('option');
      option.value = String(row?.id || '');
      option.textContent = `${row?.name || 'Saved roster'} — ${row?.periodLocal || ''}${row?.room ? ` • Room ${row.room}` : ''} • ${Number(row?.student_count || 0)} student(s)`;
      select.appendChild(option);
    }
    if (current && savedRosters.some((row) => String(row?.id || '') === current)) select.value = current;
    const hasSelection = !!select.value;
    if (loadBtn) loadBtn.disabled = !hasSelection;
    if (deleteBtn) deleteBtn.disabled = !hasSelection;
  }

  async function refreshCatalog(preferredId = ''){
    const response = await adminFetch('/admin/supervised_lunch/saved_rosters', { method: 'GET' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `saved rosters HTTP ${response.status}`);
    savedRosters = Array.isArray(data.saved_rosters) ? data.saved_rosters : [];
    renderCatalog(preferredId);
  }

  function filterSummary(counts = {}){
    const parts = [];
    if (Number(counts.not_present_today || 0)) parts.push(`${counts.not_present_today} not present today`);
    if (Number(counts.left_early || 0)) parts.push(`${counts.left_early} left early`);
    if (Number(counts.off_campus || 0)) parts.push(`${counts.off_campus} already off campus`);
    if (Number(counts.not_lunch_eligible || 0)) parts.push(`${counts.not_lunch_eligible} no longer assigned to that lunch`);
    if (Number(counts.not_in_current_roster || 0)) parts.push(`${counts.not_in_current_roster} no longer in the roster`);
    return parts.join(', ');
  }

  function ensureRoomOption(room){
    const select = document.getElementById('roomInput');
    const value = String(room || '').trim();
    if (!select || !value) return;
    if (!Array.from(select.options).some((option) => String(option.value || '') === value)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = `${value} (saved)`;
      select.appendChild(option);
    }
  }

  function applySelectedOsis(osisList){
    const search = document.getElementById('rosterSearch');
    if (search && search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const wanted = new Set((Array.isArray(osisList) ? osisList : []).map((value) => String(value || '').trim()));
    const rows = Array.from(document.querySelectorAll('#rosterBody tr'));
    for (const row of rows) {
      const checkbox = row.querySelector('input[type="checkbox"]');
      const cells = row.querySelectorAll('td');
      const osis = String(cells?.[2]?.textContent || '').trim();
      if (!checkbox || !osis) continue;
      const shouldCheck = wanted.has(osis);
      if (checkbox.checked !== shouldCheck) {
        checkbox.checked = shouldCheck;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  async function loadSavedRoster(){
    const roster = selectedRoster();
    if (!roster) return;
    setPageStatus('Loading saved roster and checking who is eligible today…', true);
    try {
      const response = await adminFetch(`/admin/supervised_lunch/saved_rosters/load?id=${encodeURIComponent(roster.id)}`, { method: 'GET' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || `saved roster load HTTP ${response.status}`);

      const periodSelect = document.getElementById('periodLocal');
      const roomSelect = document.getElementById('roomInput');
      const periodLocal = String(data?.periodLocal || roster?.periodLocal || '').trim().toUpperCase();
      const room = String(data?.room || roster?.room || '').trim();
      if (periodSelect && Array.from(periodSelect.options).some((option) => String(option.value || '') === periodLocal)) {
        periodSelect.value = periodLocal;
        periodSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      ensureRoomOption(room);
      if (roomSelect && room) {
        roomSelect.value = room;
        roomSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      applySelectedOsis(data.osis_list || []);
      const counts = data.counts || {};
      const filtered = filterSummary(counts);
      setPageStatus(`Loaded ${counts.selected || 0} of ${counts.saved || 0} from “${data?.saved_roster?.name || roster.name || 'saved roster'}”.${filtered ? ` Filtered out: ${filtered}.` : ''} Click Apply today’s assignment when ready.`, true);
    } catch (error) {
      setPageStatus(String(error?.message || error), false);
    }
  }

  async function saveRoster(){
    const periodLocal = String(document.getElementById('periodLocal')?.value || '').trim().toUpperCase();
    const room = String(document.getElementById('roomInput')?.value || '').trim();
    if (!periodLocal || !room) {
      setPageStatus('Choose a lunch and room first.', false);
      return;
    }
    const name = String(window.prompt('Name this saved lunch roster:', '') || '').trim();
    if (!name) return;
    try {
      const date = String(document.getElementById('todayLabel')?.textContent || '').trim();
      const response = await adminFetch('/admin/supervised_lunch/saved_rosters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', name, date, periodLocal, room })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        const error = String(data?.error || `saved roster save HTTP ${response.status}`);
        if (error === 'apply_assignment_before_saving_roster') {
          throw new Error('Apply today’s supervised lunch assignment first, then save the roster.');
        }
        throw new Error(error);
      }
      await refreshCatalog(String(data?.saved_roster?.id || ''));
      setPageStatus(`${data.replaced ? 'Updated' : 'Saved'} roster “${data?.saved_roster?.name || name}” with ${data?.saved_roster?.student_count || 0} student(s).`, true);
    } catch (error) {
      setPageStatus(String(error?.message || error), false);
    }
  }

  async function deleteSavedRoster(){
    const roster = selectedRoster();
    if (!roster) return;
    if (!window.confirm(`Delete saved roster “${roster.name || 'Saved roster'}”?`)) return;
    try {
      const response = await adminFetch('/admin/supervised_lunch/saved_rosters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: roster.id })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || `saved roster delete HTTP ${response.status}`);
      await refreshCatalog();
      setPageStatus(`Deleted saved roster “${roster.name || 'Saved roster'}”.`, true);
    } catch (error) {
      setPageStatus(String(error?.message || error), false);
    }
  }

  function install(){
    document.getElementById('savedRosterSelect')?.addEventListener('change', () => renderCatalog());
    document.getElementById('loadSavedRosterBtn')?.addEventListener('click', loadSavedRoster);
    document.getElementById('saveRosterBtn')?.addEventListener('click', saveRoster);
    document.getElementById('deleteSavedRosterBtn')?.addEventListener('click', deleteSavedRoster);
    refreshCatalog().catch(() => renderCatalog());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

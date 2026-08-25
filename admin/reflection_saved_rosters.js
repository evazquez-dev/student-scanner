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
    'ss_admin_session_sid_v1',
    'teacher_att_admin_session_v1',
    'admin_session_v1',
    'admin_session_sid'
  ];
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  let savedRosters = [];

  function getStoredSid() {
    try {
      for (const key of ADMIN_SESSION_KEYS) {
        const value = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
        if (value) return value;
      }
    } catch {}
    return '';
  }

  async function adminFetch(pathOrUrl, init = {}) {
    const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
    const headers = new Headers(init.headers || {});
    const sid = getStoredSid();
    if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
    return fetch(url, { ...init, headers, credentials: 'include', cache: 'no-store' });
  }

  function setPageStatus(message, ok = true) {
    const el = document.getElementById('resultBox');
    if (!el) return;
    el.className = `status ${ok ? 'ok' : 'bad'}`;
    el.textContent = message;
  }

  function selectedRosterId() {
    return String(document.getElementById('savedRosterSelect')?.value || '').trim();
  }

  function renderCatalog(preferredId = '') {
    const select = document.getElementById('savedRosterSelect');
    if (!select) return;
    const current = String(preferredId || select.value || '').trim();
    select.innerHTML = '<option value="">Select saved roster...</option>';
    for (const roster of savedRosters) {
      const option = document.createElement('option');
      option.value = String(roster?.id || '');
      option.textContent = `${String(roster?.name || 'Saved roster')} (${Number(roster?.student_count || 0)})`;
      select.appendChild(option);
    }
    if (current && Array.from(select.options).some((option) => option.value === current)) select.value = current;
    const chosen = !!select.value;
    document.getElementById('loadSavedRosterBtn').disabled = !chosen;
    document.getElementById('deleteSavedRosterBtn').disabled = !chosen;
  }

  async function refreshCatalog(preferredId = '') {
    const response = await adminFetch('/admin/reflection_hold/saved_rosters', { method: 'GET' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `saved_rosters HTTP ${response.status}`);
    savedRosters = Array.isArray(data.saved_rosters) ? data.saved_rosters : [];
    renderCatalog(preferredId);
  }

  async function activeHoldOsis() {
    const response = await adminFetch('/admin/reflection_hold/options', { method: 'GET' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `reflection_hold/options HTTP ${response.status}`);
    const rows = Array.isArray(data.my_active_holds) ? data.my_active_holds : [];
    return rows.map((row) => String(row?.osis || '').replace(/\D/g, '').trim()).filter(Boolean);
  }

  async function saveActiveRoster() {
    try {
      const osisList = await activeHoldOsis();
      if (!osisList.length) {
        setPageStatus('Confirm a Reflection Hold before saving this roster.', false);
        return;
      }
      const name = String(window.prompt('Name this saved roster:', '') || '').trim();
      if (!name) return;
      const response = await adminFetch('/admin/reflection_hold/saved_rosters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', name, osisList })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || `saved roster save HTTP ${response.status}`);
      await refreshCatalog(String(data?.saved_roster?.id || ''));
      setPageStatus(`${data.replaced ? 'Updated' : 'Saved'} roster “${data?.saved_roster?.name || name}” with ${data?.saved_roster?.student_count || osisList.length} student(s).`, true);
    } catch (error) {
      setPageStatus(String(error?.message || error), false);
    }
  }

  function applySelectedOsis(osisList) {
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

  function filterSummary(counts = {}) {
    const parts = [];
    if (Number(counts.not_present_today || 0)) parts.push(`${counts.not_present_today} not present today`);
    if (Number(counts.left_early || 0)) parts.push(`${counts.left_early} left early`);
    if (Number(counts.off_campus || 0)) parts.push(`${counts.off_campus} already off campus`);
    if (Number(counts.not_in_current_roster || 0)) parts.push(`${counts.not_in_current_roster} no longer in the roster`);
    return parts.join(', ');
  }

  async function loadSavedRoster() {
    const id = selectedRosterId();
    if (!id) return;
    setPageStatus('Loading saved roster and checking who is on campus today...', true);
    try {
      const response = await adminFetch(`/admin/reflection_hold/saved_rosters/load?id=${encodeURIComponent(id)}`, { method: 'GET' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || `saved roster load HTTP ${response.status}`);
      applySelectedOsis(data.osis_list || []);
      const counts = data.counts || {};
      const filtered = filterSummary(counts);
      setPageStatus(`Loaded ${counts.selected || 0} of ${counts.saved || 0} from “${data?.saved_roster?.name || 'saved roster'}”.${filtered ? ` Filtered out: ${filtered}.` : ''} Load the hold check when ready.`, true);
    } catch (error) {
      setPageStatus(String(error?.message || error), false);
    }
  }

  async function deleteSavedRoster() {
    const id = selectedRosterId();
    if (!id) return;
    const roster = savedRosters.find((row) => String(row?.id || '') === id) || null;
    const name = String(roster?.name || 'this saved roster');
    if (!window.confirm(`Delete saved roster “${name}”?`)) return;
    try {
      const response = await adminFetch('/admin/reflection_hold/saved_rosters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || `saved roster delete HTTP ${response.status}`);
      await refreshCatalog();
      setPageStatus(`Deleted saved roster “${name}”.`, true);
    } catch (error) {
      setPageStatus(String(error?.message || error), false);
    }
  }

  function installUi() {
    const activePanel = document.getElementById('activeHoldPanel');
    const activeButtons = activePanel?.querySelector('.row');
    if (activeButtons && !document.getElementById('saveRosterBtn')) {
      const button = document.createElement('button');
      button.id = 'saveRosterBtn';
      button.type = 'button';
      button.textContent = 'Save this roster';
      button.addEventListener('click', saveActiveRoster);
      activeButtons.insertBefore(button, activeButtons.children[1] || null);
    }

    const holdLabel = document.getElementById('holdLabel');
    const holdRow = holdLabel?.closest('.row');
    if (holdRow && !document.getElementById('savedRosterSelect')) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="row" id="savedRosterControls" style="margin-top:10px;align-items:flex-end;">
          <div class="grow">
            <label for="savedRosterSelect">Saved rosters</label>
            <select id="savedRosterSelect"><option value="">Loading saved rosters...</option></select>
          </div>
          <button id="loadSavedRosterBtn" type="button" disabled>Load saved roster</button>
          <button id="deleteSavedRosterBtn" class="danger" type="button" disabled>Delete saved roster</button>
        </div>
        <div class="muted" id="savedRosterHelp" style="margin-top:6px;">Loading a saved roster automatically removes students who are not on campus today, including early dismissals.</div>`;
      holdRow.parentNode.insertBefore(wrapper.firstElementChild, holdRow);
      holdRow.parentNode.insertBefore(wrapper.firstElementChild, holdRow);
      document.getElementById('savedRosterSelect')?.addEventListener('change', () => renderCatalog());
      document.getElementById('loadSavedRosterBtn')?.addEventListener('click', loadSavedRoster);
      document.getElementById('deleteSavedRosterBtn')?.addEventListener('click', deleteSavedRoster);
    }
  }

  window.addEventListener('DOMContentLoaded', async () => {
    installUi();
    try { await refreshCatalog(); }
    catch { renderCatalog(); }
  });
})();

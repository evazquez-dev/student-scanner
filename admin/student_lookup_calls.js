/* EAGLENEST_GRANDSTREAM_PHASE2 — Student Lookup phone-call history */
(() => {
  'use strict';

  const API_BASE = ((document.querySelector('meta[name="api-base"]')?.content || location.origin)
    .replace(/\/*$/, '') + '/');
  const SESSION_HEADER = 'x-admin-session';
  const SESSION_KEYS = [
    'ss_admin_session_sid_v1',
    'admin_session_v1',
    'teacher_att_admin_session_v1',
    'staff_pull_admin_session_v1',
    'phone_pass_admin_session_v1',
    'student_scans_admin_session_v1'
  ];

  let currentOsis = '';
  let loadedForOsis = '';
  let loading = false;
  let access = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function storedSession() {
    try {
      for (const key of SESSION_KEYS) {
        const value = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
        if (value) return value;
      }
    } catch {}
    return '';
  }

  async function apiFetch(path, init = {}) {
    const headers = new Headers(init.headers || {});
    const sid = storedSession();
    if (sid && !headers.has(SESSION_HEADER)) headers.set(SESSION_HEADER, sid);
    return fetch(new URL(path, API_BASE), {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });
  }

  function selectedOsis() {
    const fromUrl = String(new URL(location.href).searchParams.get('osis') || '').replace(/\D/g, '');
    if (fromUrl) return fromUrl;
    const meta = String(document.getElementById('studentMeta')?.textContent || '');
    return meta.match(/OSIS\s+(\d{6,12})/i)?.[1] || '';
  }

  function isAdminLike() {
    const role = String(access?.role || '').trim().toLowerCase();
    return role === 'admin' || role === 'super_admin';
  }

  function isViewAs() {
    return access?.view_as?.active === true || access?.view_as?.read_only === true;
  }

  function localDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0));
      if (Number.isFinite(date.getTime())) {
        return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      }
    }
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return raw;
  }

  function durationLabel(secondsRaw) {
    const seconds = Math.max(0, Number(secondsRaw || 0));
    if (!Number.isFinite(seconds) || seconds <= 0) return '0 sec';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (!mins) return `${secs} sec`;
    if (!secs) return `${mins} min`;
    return `${mins}m ${secs}s`;
  }

  function directionLabel(value) {
    const raw = String(value || '').toLowerCase();
    if (raw === 'incoming') return 'Incoming';
    if (raw === 'outgoing') return 'Outgoing';
    if (raw === 'internal') return 'Internal';
    return 'Unknown';
  }

  function dispositionLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Unknown';
    return raw.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function pillClass(row) {
    const disposition = String(row?.disposition || '').toLowerCase();
    if (/answer|connected/.test(disposition)) return 'good';
    if (/no answer|busy|failed|cancel/.test(disposition)) return 'warn';
    return 'info';
  }

  function callContactLabel(row) {
    const matches = Array.isArray(row?.contact_matches) ? row.contact_matches : [];
    if (!matches.length) return 'Matched contact';
    const first = matches[0];
    const parts = [String(first?.name || '').trim(), String(first?.relationship || '').trim()].filter(Boolean);
    let label = parts.join(' • ') || 'Matched contact';
    if (first?.phone_last4) label += ` • ••••${first.phone_last4}`;
    if (matches.length > 1) label += ` • +${matches.length - 1} linked contact${matches.length === 2 ? '' : 's'}`;
    return label;
  }

  function staffLabel(row) {
    const name = String(row?.staff_name || '').trim();
    const ext = String(row?.staff_extension || '').trim();
    if (name && ext) return `${name} • Ext. ${ext}`;
    if (ext) return `Ext. ${ext}`;
    if (name) return name;
    return '';
  }

  function syncLine(sync) {
    if (!sync?.last_completed_at_iso) return 'PBX call history has not been synced yet.';
    const bits = [`Last PBX sync ${localDateTime(sync.last_completed_at_iso)}`];
    if (sync.last_days) bits.push(`${sync.last_days}-day window`);
    if (sync.cdr_truncated) bits.push('CDR result limit reached');
    if (sync.last_error) bits.push(`Last error: ${sync.last_error}`);
    return bits.join(' • ');
  }

  function ensureUi() {
    const tabs = document.querySelector('#tabsShell .tabs[role="tablist"]');
    const communicationsPanel = document.getElementById('panelCommunications');
    if (!tabs || !communicationsPanel) return false;

    let tab = document.getElementById('tabCalls');
    if (!tab) {
      tab = document.createElement('button');
      tab.id = 'tabCalls';
      tab.className = 'tab';
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-controls', 'panelCalls');
      tab.dataset.tab = 'calls';
      tab.tabIndex = -1;
      tab.innerHTML = 'Calls <span id="callsCount" class="count"></span>';
      tabs.appendChild(tab);
    }

    let panel = document.getElementById('panelCalls');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'panelCalls';
      panel.className = 'card panelCard tabPanel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', 'tabCalls');
      panel.dataset.panel = 'calls';
      panel.hidden = true;
      panel.innerHTML = `
        <div class="panelHead">
          <div>
            <h2>Phone Calls</h2>
            <p id="callsMeta" class="muted small">PBX metadata matched to this student's contact phone numbers. Call recordings are not accessed.</p>
          </div>
          <div class="inlineActions">
            <button id="syncPbxBtn" class="btn secondary small" type="button" hidden>Sync PBX</button>
            <button id="refreshCallsBtn" class="btn secondary small" type="button">Refresh calls</button>
          </div>
        </div>
        <div id="callsSyncStatus" class="muted small" style="margin:-4px 0 12px"></div>
        <div id="callsList" class="list"><div class="loadingState">Open this tab to load phone-call history.</div></div>`;
      communicationsPanel.insertAdjacentElement('afterend', panel);
    }

    if (!tab.dataset.callsWired) {
      tab.dataset.callsWired = '1';
      tab.addEventListener('click', () => activateCallsTab());
      tab.addEventListener('keydown', (event) => {
        const allTabs = [...document.querySelectorAll('.tab[role="tab"]')];
        const index = allTabs.indexOf(tab);
        let next = null;
        if (event.key === 'ArrowRight') next = allTabs[(index + 1) % allTabs.length];
        if (event.key === 'ArrowLeft') next = allTabs[(index - 1 + allTabs.length) % allTabs.length];
        if (event.key === 'Home') next = allTabs[0];
        if (event.key === 'End') next = allTabs[allTabs.length - 1];
        if (!next) return;
        event.preventDefault();
        if (next === tab) activateCallsTab(true);
        else next.click();
      });
      new MutationObserver(() => {
        if (tab.getAttribute('aria-selected') === 'true') loadCalls(false);
      }).observe(tab, { attributes: true, attributeFilter: ['aria-selected'] });
    }

    const refresh = document.getElementById('refreshCallsBtn');
    if (refresh && !refresh.dataset.callsWired) {
      refresh.dataset.callsWired = '1';
      refresh.addEventListener('click', () => loadCalls(true));
    }
    const sync = document.getElementById('syncPbxBtn');
    if (sync && !sync.dataset.callsWired) {
      sync.dataset.callsWired = '1';
      sync.addEventListener('click', syncPbx);
    }
    return true;
  }

  function activateCallsTab(focus = false) {
    if (!ensureUi()) return;
    const tab = document.getElementById('tabCalls');
    document.querySelectorAll('.tab[role="tab"]').forEach((item) => {
      const active = item === tab;
      item.setAttribute('aria-selected', active ? 'true' : 'false');
      item.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.tabPanel').forEach((panel) => {
      panel.hidden = panel.id !== 'panelCalls';
    });
    if (focus) tab?.focus();
    loadCalls(false);
  }

  async function loadAccess() {
    if (access) return access;
    try {
      const response = await apiFetch('/admin/access', { method: 'GET' });
      const data = await response.json().catch(() => null);
      access = response.ok && data?.ok ? data : null;
    } catch {
      access = null;
    }
    const button = document.getElementById('syncPbxBtn');
    if (button) button.hidden = !(isAdminLike() && !isViewAs());
    return access;
  }

  function renderRows(data) {
    const list = document.getElementById('callsList');
    const meta = document.getElementById('callsMeta');
    const count = document.getElementById('callsCount');
    const syncStatus = document.getElementById('callsSyncStatus');
    if (!list || !meta || !count || !syncStatus) return;

    const rows = Array.isArray(data?.rows) ? data.rows : [];
    count.textContent = rows.length ? String(rows.length) : '';
    syncStatus.textContent = syncLine(data?.sync || {});

    if (!Number(data?.contact_phone_count || 0)) {
      meta.textContent = 'No usable contact phone numbers are currently available for this student in EagleNEST Student Contacts.';
      list.innerHTML = '<div class="emptyState">No contact phone numbers are available to match against PBX history.</div>';
      return;
    }

    meta.textContent = `${rows.length} matched call${rows.length === 1 ? '' : 's'} • ${data.contact_phone_count} contact phone number${data.contact_phone_count === 1 ? '' : 's'} checked.`;
    if (!rows.length) {
      list.innerHTML = data?.sync?.last_completed_at_iso
        ? '<div class="emptyState">No PBX calls matched this student\'s contact phone numbers in the stored call-history window.</div>'
        : '<div class="emptyState">No PBX sync has been completed yet. An EagleNEST admin can use “Sync PBX” to load the first call-history window.</div>';
      return;
    }

    list.innerHTML = rows.map((row) => {
      const staff = staffLabel(row);
      const talk = Number(row?.billsec_sec || 0);
      const total = Number(row?.duration_sec || 0);
      const campus=String(row?.campus||'').trim(), route=String(row?.route_target||'').trim(), trunk=String(row?.source_trunk_name||'').trim();
      const routing=campus?campus:(trunk?`Via ${trunk}`:(route?`Route ${route}`:''));
      const details = [
        routing,
        directionLabel(row?.direction),
        localDateTime(row?.start_local),
        staff,
        talk > 0 ? `Talk ${durationLabel(talk)}` : `Duration ${durationLabel(total)}`,
        row?.action_type ? String(row.action_type).replaceAll('_', ' ') : ''
      ].filter(Boolean);
      return `<article class="listItem">
        <div class="listTop">
          <div>
            <div class="listTitle">${esc(callContactLabel(row))}</div>
            <div class="listMeta">${details.map(esc).join(' • ')}</div>
          </div>
          <span class="pill ${pillClass(row)}">${esc(dispositionLabel(row?.disposition))}</span>
        </div>
      </article>`;
    }).join('');
  }

  async function loadCalls(force = false) {
    if (!ensureUi()) return;
    const osis = selectedOsis();
    if (!osis) return;
    if (loading || (!force && loadedForOsis === osis)) return;
    loading = true;
    currentOsis = osis;
    const list = document.getElementById('callsList');
    const meta = document.getElementById('callsMeta');
    if (list) list.innerHTML = '<div class="loadingState">Loading matched PBX calls…</div>';
    if (meta) meta.textContent = 'Matching PBX metadata to this student\'s contact phone numbers…';

    await loadAccess();
    try {
      const response = await apiFetch(`/admin/student/phone_history?osis=${encodeURIComponent(osis)}&limit=50`, { method: 'GET' });
      const data = await response.json().catch(() => null);
      if (osis !== selectedOsis()) return;
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      renderRows(data);
      loadedForOsis = osis;
    } catch (error) {
      if (osis !== selectedOsis()) return;
      if (list) list.innerHTML = `<div class="errorState">Could not load phone-call history: ${esc(error?.message || error)}</div>`;
      if (meta) meta.textContent = 'Phone-call history is currently unavailable.';
    } finally {
      loading = false;
    }
  }

  async function syncPbx() {
    const button = document.getElementById('syncPbxBtn');
    const status = document.getElementById('callsSyncStatus');
    if (!button || !isAdminLike() || isViewAs()) return;
    if (!confirm('Sync the last 30 days of Grandstream extension and CDR metadata into EagleNEST?')) return;
    button.disabled = true;
    if (status) status.textContent = 'Syncing PBX… this may take a moment.';
    try {
      const response = await apiFetch('/admin/integrations/grandstream/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days: 30 })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      loadedForOsis = '';
      if (status) {
        status.textContent = `PBX sync complete • ${data.extension_count} extensions • ${data.call_rows_upserted} call rows • ${data.range_start.slice(0, 10)} through ${data.range_end.slice(0, 10)}${data.cdr_truncated ? ' • result limit reached' : ''}`;
      }
      await loadCalls(true);
    } catch (error) {
      if (status) status.textContent = `PBX sync failed: ${error?.message || error}`;
    } finally {
      button.disabled = false;
    }
  }

  function resetForStudentChange() {
    const osis = selectedOsis();
    if (osis === currentOsis) return;
    currentOsis = osis;
    loadedForOsis = '';
    const count = document.getElementById('callsCount');
    const list = document.getElementById('callsList');
    const meta = document.getElementById('callsMeta');
    if (count) count.textContent = '';
    if (list) list.innerHTML = '<div class="loadingState">Open this tab to load phone-call history.</div>';
    if (meta) meta.textContent = 'PBX metadata matched to this student\'s contact phone numbers. Call recordings are not accessed.';
    if (document.getElementById('tabCalls')?.getAttribute('aria-selected') === 'true' && osis) loadCalls(true);
  }

  async function init() {
    if (!ensureUi()) return;
    await loadAccess();
    currentOsis = selectedOsis();

    const meta = document.getElementById('studentMeta');
    const card = document.getElementById('studentCard');
    const observer = new MutationObserver(resetForStudentChange);
    if (meta) observer.observe(meta, { childList: true, characterData: true, subtree: true });
    if (card) observer.observe(card, { attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('popstate', resetForStudentChange);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

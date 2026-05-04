const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY = 'teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';

const loginCard = document.getElementById('loginCard');
const loginOut = document.getElementById('loginOut');
const appShell = document.getElementById('appShell');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dateText = document.getElementById('dateText');
const latestDateText = document.getElementById('latestDateText');
const boundDevicesText = document.getElementById('boundDevicesText');
const inactiveDevicesText = document.getElementById('inactiveDevicesText');
const dateInput = document.getElementById('dateInput');
const loadBtn = document.getElementById('loadBtn');
const todayBtn = document.getElementById('todayBtn');
const summaryCards = document.getElementById('summaryCards');
const attendanceEvidenceCards = document.getElementById('attendanceEvidenceCards');
const workflowBody = document.getElementById('workflowBody');
const eventTypesBody = document.getElementById('eventTypesBody');
const noEntranceBody = document.getElementById('noEntranceBody');
const inBuildingNoEntranceBody = document.getElementById('inBuildingNoEntranceBody');
const deviceTbody = document.getElementById('deviceTbody');
const errorBox = document.getElementById('errorBox');

function getStoredAdminSessionSid() {
  try {
    return String(
      sessionStorage.getItem(ADMIN_SESSION_KEY) ||
      localStorage.getItem(ADMIN_SESSION_KEY) ||
      sessionStorage.getItem(ADMIN_SESSION_LEGACY_KEY) ||
      localStorage.getItem(ADMIN_SESSION_LEGACY_KEY) ||
      ''
    ).trim();
  } catch { return ''; }
}

function setStoredAdminSessionSid(sid) {
  const v = String(sid || '').trim();
  try {
    if (!v) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_SESSION_KEY);
      sessionStorage.removeItem(ADMIN_SESSION_LEGACY_KEY);
      localStorage.removeItem(ADMIN_SESSION_LEGACY_KEY);
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, v);
    localStorage.setItem(ADMIN_SESSION_KEY, v);
    sessionStorage.setItem(ADMIN_SESSION_LEGACY_KEY, v);
    localStorage.setItem(ADMIN_SESSION_LEGACY_KEY, v);
  } catch {}
}

function clearStoredAdminSessionSid() {
  setStoredAdminSessionSid('');
}

function stashAdminSessionFromResponse(resp) {
  try {
    const sid = String(
      resp?.headers?.get('x-admin-session') ||
      resp?.headers?.get('X-Admin-Session') ||
      ''
    ).trim();
    if (sid) setStoredAdminSessionSid(sid);
  } catch {}
}

async function adminFetch(pathOrUrl, init = {}) {
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  const headers = new Headers(init.headers || {});
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
      const j = await resp.clone().json();
      if (j?.error === 'expired' || j?.error === 'no_session') clearStoredAdminSessionSid();
    } catch {}
  }
  return resp;
}

function show(el) { if (el) el.style.display = 'block'; }
function hide(el) { if (el) el.style.display = 'none'; }

function setStatus(ok, msg) {
  if (!statusDot || !statusText) return;
  statusDot.className = `dot ${ok ? 'ok' : 'bad'}`;
  statusText.textContent = msg;
}

function setError(msg) {
  if (!errorBox) return;
  const text = String(msg || '').trim();
  if (!text) {
    errorBox.style.display = 'none';
    errorBox.textContent = '';
    return;
  }
  errorBox.style.display = 'block';
  errorBox.textContent = text;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function fmtPct(v) {
  const n = Number(v || 0);
  return `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
}

function fmtTs(iso) {
  const s = String(iso || '').trim();
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function scoreClass(score) {
  const n = Number(score || 0);
  if (n >= 80) return 'ok';
  if (n >= 55) return 'warn';
  return 'bad';
}

function renderSummaryCards(counts = {}) {
  if (!summaryCards) return;
  const cards = [
    ['Active kiosks', counts.active_kiosks, `${counts.devices_with_scans || 0} with scans`],
    ['Total scans', counts.total_scans, `${counts.unique_students_scanned || 0} unique students`],
    ['Manual rate', fmtPct(counts.manual_rate_pct), `${counts.manual_entries || 0} manual entries`],
    ['Scan errors', counts.scan_errors, `${fmtPct(counts.scan_error_rate_pct)} of scans`],
    ['Teacher submits', counts.teacher_submits, `${counts.teacher_submit_errors || 0} submit errors`],
    ['Location mismatches', counts.mismatch_devices, `${counts.bound_devices || 0} bound devices`],
    ['Bathroom open', counts.bathroom_open, 'students still out'],
    ['Staff pull open', counts.staff_pull_open, 'students not cleared']
  ];
  summaryCards.innerHTML = cards.map(([label, value, sub]) => `
    <article class="card">
      <h2>${esc(label)}</h2>
      <div class="big">${esc(value == null ? '—' : value)}</div>
      <div class="small">${esc(sub || '')}</div>
    </article>
  `).join('');
}

function renderWorkflow(workflow = {}) {
  if (!workflowBody) return;
  const bath = workflow.bathroom || {};
  const staff = workflow.staff_pull || {};
  workflowBody.innerHTML = `
    <div class="miniRow"><div class="miniLabel">Bathroom out</div><div class="miniValue">${esc(bath.out_count ?? 0)}</div></div>
    <div class="miniRow"><div class="miniLabel">Bathroom back</div><div class="miniValue">${esc(bath.back_count ?? 0)}</div></div>
    <div class="miniRow"><div class="miniLabel">Bathroom still open</div><div class="miniValue">${esc(bath.open_count ?? 0)}</div></div>
    <div class="miniRow"><div class="miniLabel">Staff pull start</div><div class="miniValue">${esc(staff.start_count ?? 0)}</div></div>
    <div class="miniRow"><div class="miniLabel">Staff pull end</div><div class="miniValue">${esc(staff.end_count ?? 0)}</div></div>
    <div class="miniRow"><div class="miniLabel">Staff pull still open</div><div class="miniValue">${esc(staff.open_count ?? 0)}</div></div>
  `;
}

function renderAttendanceEvidence(evidence = {}) {
  if (!attendanceEvidenceCards) return;
  const counts = evidence?.counts || {};
  const configured = evidence?.configured !== false;
  const ok = evidence?.ok !== false;
  const cards = !configured
    ? [
        ['Attendance evidence', 'Not configured', 'Run setupFidelityAttendanceSource() in the fidelity GAS project']
      ]
    : [
        ['Entrance scans', counts.entrance_scanned ?? 0, `${counts.total_roster ?? 0} rostered students`],
        ['No entrance scan', counts.no_entrance_scan ?? 0, `${fmtPct(counts.entrance_coverage_pct ?? 0)} coverage`],
        ['Any scans today', counts.any_scan_today ?? 0, 'students with any kiosk evidence'],
        ['In-building no entrance', counts.in_building_scan_no_entrance ?? 0, 'students seen inside without entry evidence']
      ];
  attendanceEvidenceCards.innerHTML = cards.map(([label, value, sub]) => `
    <article class="card">
      <h2>${esc(label)}</h2>
      <div class="big">${esc(value == null ? '—' : value)}</div>
      <div class="small">${esc(ok ? (sub || '') : (evidence?.error || sub || ''))}</div>
    </article>
  `).join('');

  renderStudentSampleList(
    noEntranceBody,
    evidence?.samples?.no_entrance_scan || [],
    'No rostered students are missing entrance evidence for this date.'
  );
  renderStudentSampleList(
    inBuildingNoEntranceBody,
    evidence?.samples?.in_building_scan_no_entrance || [],
    'No students were seen in-building without an entrance scan for this date.'
  );
}

function renderStudentSampleList(target, items = [], emptyText = 'No rows.') {
  if (!target) return;
  const list = Array.isArray(items) ? items : [];
  target.innerHTML = list.length
    ? list.map((row) => {
        const name = row.name || row.osis || 'Unknown';
        const grade = row.grade ? `Grade ${row.grade}` : '';
        const extra = row.first_seen_location
          ? `${row.first_seen_location}${row.first_seen_at_iso ? ` • ${fmtTs(row.first_seen_at_iso)}` : ''}`
          : grade || 'No additional evidence';
        return `
          <div class="miniRow">
            <div class="miniLabel">
              <div>${esc(name)}</div>
              <div class="muted mono">${esc(row.osis || '')}</div>
            </div>
            <div class="miniValue">
              <div>${esc(grade || '—')}</div>
              <div class="muted">${esc(extra)}</div>
            </div>
          </div>
        `;
      }).join('')
    : `<div class="miniRow"><div class="miniLabel muted">${esc(emptyText)}</div><div class="miniValue">—</div></div>`;
}

function renderEventTypes(items = []) {
  if (!eventTypesBody) return;
  const list = Array.isArray(items) ? items.slice(0, 12) : [];
  eventTypesBody.innerHTML = list.length
    ? list.map((row) => `
      <div class="miniRow">
        <div class="miniLabel">${esc(row.event_type || '')}</div>
        <div class="miniValue">${esc(row.count ?? 0)}</div>
      </div>
    `).join('')
    : `<div class="miniRow"><div class="miniLabel muted">No events for this date.</div><div class="miniValue">—</div></div>`;
}

function renderDevices(devices = []) {
  if (!deviceTbody) return;
  deviceTbody.innerHTML = Array.isArray(devices) && devices.length
    ? devices.map((row) => {
        const flags = Array.isArray(row.flags) ? row.flags : [];
        const periods = Array.isArray(row.periods) ? row.periods : [];
        return `
          <tr>
            <td>
              <div class="mono">${esc(row.device_id || '')}</div>
              <div class="muted">${row.kiosk_active_today ? 'Active today' : 'No activity'}</div>
            </td>
            <td>
              <div>${esc(row.last_bound_location || row.last_reported_location || '—')}</div>
              <div class="muted">${esc(row.last_reported_location && row.last_bound_location && row.last_reported_location !== row.last_bound_location ? `Reported: ${row.last_reported_location}` : '')}</div>
            </td>
            <td><span class="score ${scoreClass(row.trust_score)}">${esc(row.trust_score ?? 0)}</span></td>
            <td>
              <div>${esc(fmtTs(row.first_scan_time))}</div>
              <div class="muted">${esc(fmtTs(row.last_scan_time))}</div>
            </td>
            <td>
              <div>${esc(row.scan_success_count ?? 0)} success</div>
              <div class="muted">${esc(row.heartbeat_count ?? 0)} heartbeat</div>
            </td>
            <td>${esc(row.unique_students_scanned ?? 0)}</td>
            <td>
              <div>${esc(row.manual_entry_count ?? 0)} entries</div>
              <div class="muted">${esc(fmtPct(row.manual_rate_pct))}</div>
            </td>
            <td>${esc(row.scan_error_count ?? 0)}</td>
            <td>${esc(row.location_mismatch_count ?? 0)}</td>
            <td>
              <div class="chips">
                ${periods.length
                  ? periods.map((p) => `<span class="chip info">${esc(p.period_local)}: ${esc(p.count)}</span>`).join('')
                  : `<span class="muted">—</span>`}
              </div>
            </td>
            <td>
              <div class="chips">
                ${flags.length
                  ? flags.map((flag) => `<span class="chip ${/error|mismatch|no activity/i.test(flag) ? 'bad' : 'warn'}">${esc(flag)}</span>`).join('')
                  : `<span class="chip">Healthy</span>`}
              </div>
            </td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="11" class="muted">No fidelity device data for this date.</td></tr>`;
}

async function fetchDashboard(date = '') {
  const u = new URL('/admin/fidelity_dashboard', API_BASE);
  if (date) u.searchParams.set('date', date);
  const r = await adminFetch(u, { method: 'GET' });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) {
    throw new Error(data?.detail || data?.error || `HTTP ${r.status}`);
  }
  return data;
}

async function loadDashboard(date = '') {
  setError('');
  setStatus(true, 'Loading…');
  loadBtn.disabled = true;
  todayBtn.disabled = true;
  try {
    const data = await fetchDashboard(date);
    dateText.textContent = data.date || '—';
    latestDateText.textContent = data.latest_date || '—';
    boundDevicesText.textContent = String(data.counts?.bound_devices ?? '—');
    inactiveDevicesText.textContent = String(data.counts?.inactive_bound_devices ?? '—');
    if (data.date) dateInput.value = data.date;
    renderSummaryCards(data.counts || {});
    renderWorkflow(data.workflow || {});
    renderEventTypes(data.event_types || []);
    renderAttendanceEvidence(data.attendance_evidence || {});
    renderDevices(data.devices || []);
    setStatus(true, 'Live');
  } catch (err) {
    setStatus(false, 'Error');
    setError(err?.message || String(err));
  } finally {
    loadBtn.disabled = false;
    todayBtn.disabled = false;
  }
}

async function waitForGoogle(timeoutMs = 8000) {
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise((r) => setTimeout(r, 50));
  }
  return window.google.accounts.id;
}

async function onGoogleCredential(resp) {
  try {
    loginOut.textContent = 'Signing in...';
    const r = await adminFetch('/admin/session/login_google', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString()
    });
    const data = await r.json().catch(() => ({}));
    if (data?.sid) setStoredAdminSessionSid(String(data.sid));
    if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
    hide(loginCard);
    show(appShell);
    await loadDashboard('');
  } catch (e) {
    show(loginCard);
    hide(appShell);
    loginOut.textContent = `Login failed: ${e?.message || e}`;
  }
}

async function tryBootstrapSession() {
  try {
    const r = await adminFetch('/admin/session/check', { method: 'GET' });
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    if (!j?.ok) return false;
    hide(loginCard);
    show(appShell);
    await loadDashboard('');
    return true;
  } catch {
    return false;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const booted = await tryBootstrapSession();
  if (booted) return;

  try {
    if (!GOOGLE_CLIENT_ID) {
      show(loginCard);
      loginOut.textContent = 'Missing google-client-id meta.';
      return;
    }
    const gsi = await waitForGoogle();
    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true
    });
    gsi.renderButton(document.getElementById('g_id_signin'), { theme: 'outline', size: 'large' });
    show(loginCard);
    loginOut.textContent = '—';
  } catch (e) {
    show(loginCard);
    loginOut.textContent = `Google init failed: ${e?.message || e}`;
  }
});

loadBtn.addEventListener('click', () => {
  loadDashboard(String(dateInput.value || '').trim()).catch(() => {});
});

todayBtn.addEventListener('click', () => {
  dateInput.value = '';
  loadDashboard('').catch(() => {});
});

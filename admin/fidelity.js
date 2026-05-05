const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY = 'teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';
const DASHBOARD_CACHE_PREFIX = 'ss_fidelity_dashboard_daily_cache_v3:';
const DASHBOARD_CACHE_LEGACY_PREFIXES = [
  'ss_fidelity_dashboard_cache_v1:',
  'ss_fidelity_dashboard_daily_cache_v1:',
  'ss_fidelity_dashboard_daily_cache_v2:'
];

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
const teacherGapsBody = document.getElementById('teacherGapsBody');
const roomPeriodEvidenceBody = document.getElementById('roomPeriodEvidenceBody');
const teacherSubmissionsBody = document.getElementById('teacherSubmissionsBody');
const openWorkflowDetailsBody = document.getElementById('openWorkflowDetailsBody');
const lowTrustBody = document.getElementById('lowTrustBody');
const inBuildingNoEntranceBody = document.getElementById('inBuildingNoEntranceBody');
const deviceTbody = document.getElementById('deviceTbody');
const errorBox = document.getElementById('errorBox');
const busyOverlay = document.getElementById('busyOverlay');
const busyTitle = document.getElementById('busyTitle');
const busyDetail = document.getElementById('busyDetail');
let dashboardBusy = false;
let dashboardBusyButton = null;

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

function localTodayKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDashboardCacheDate(date = '') {
  return String(date || '').trim() || 'latest';
}

function dashboardCacheKey(date = '') {
  return `${DASHBOARD_CACHE_PREFIX}${localTodayKey()}:${normalizeDashboardCacheDate(date)}`;
}

function pruneDashboardCache() {
  try {
    const todayPrefix = `${DASHBOARD_CACHE_PREFIX}${localTodayKey()}:`;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isCurrentCache = key.startsWith(DASHBOARD_CACHE_PREFIX);
      const isLegacyCache = DASHBOARD_CACHE_LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix));
      if ((isCurrentCache && !key.startsWith(todayPrefix)) || isLegacyCache) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

function readDashboardCache(date = '') {
  pruneDashboardCache();
  try {
    const raw = localStorage.getItem(dashboardCacheKey(date));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached?.cache_day !== localTodayKey() || !cached?.data?.ok) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeDashboardCache(date = '', data = null) {
  if (!data?.ok) return;
  pruneDashboardCache();
  try {
    localStorage.setItem(dashboardCacheKey(date), JSON.stringify({
      cache_day: localTodayKey(),
      requested_date: normalizeDashboardCacheDate(date),
      saved_at_iso: new Date().toISOString(),
      data
    }));
  } catch {}
}

function setDashboardBusy(on, options = {}) {
  dashboardBusy = Boolean(on);
  const controls = [dateInput, loadBtn, todayBtn].filter(Boolean);
  for (const el of controls) el.disabled = dashboardBusy;

  if (appShell) appShell.setAttribute('aria-busy', dashboardBusy ? 'true' : 'false');

  if (dashboardBusy) {
    dashboardBusyButton = options.button || loadBtn || null;
    if (dashboardBusyButton) {
      if (!dashboardBusyButton.dataset.origText) {
        dashboardBusyButton.dataset.origText = dashboardBusyButton.textContent || '';
      }
      dashboardBusyButton.classList.add('is-loading');
      dashboardBusyButton.textContent = options.buttonText || options.title || 'Getting data…';
    }
    if (busyTitle) busyTitle.textContent = options.title || 'Getting data…';
    if (busyDetail) {
      busyDetail.textContent = options.detail || 'Please wait while the fidelity tracker loads.';
    }
    if (busyOverlay) {
      busyOverlay.classList.add('is-visible');
      busyOverlay.setAttribute('aria-hidden', 'false');
    }
    return;
  }

  if (dashboardBusyButton) {
    dashboardBusyButton.classList.remove('is-loading');
    dashboardBusyButton.textContent = dashboardBusyButton.dataset.origText || dashboardBusyButton.textContent || '';
  }
  dashboardBusyButton = null;
  if (busyOverlay) {
    busyOverlay.classList.remove('is-visible');
    busyOverlay.setAttribute('aria-hidden', 'true');
  }
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
    ['Teacher submits', counts.teacher_submits, `${counts.teacher_submitters || 0} submitters; ${counts.teacher_submit_errors || 0} errors`],
    ['No scan + no attendance', counts.teacher_no_scans_no_attendance ?? 0, `${counts.expected_teacher_room_periods || 0} expected teacher room/periods`],
    ['Weak room/periods', counts.weak_room_periods, 'need scan-evidence review'],
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
        ['Entrance scans', counts.entrance_scanned ?? 0, 'students with entry evidence'],
        ['Any scans today', counts.any_scan_today ?? 0, 'students with any kiosk evidence'],
        ['Inside no entrance', counts.in_building_scan_no_entrance ?? 0, 'students seen inside without entry evidence']
      ];
  attendanceEvidenceCards.innerHTML = cards.map(([label, value, sub]) => `
    <article class="card">
      <h2>${esc(label)}</h2>
      <div class="big">${esc(value == null ? '—' : value)}</div>
      <div class="small">${esc(ok ? (sub || '') : (evidence?.error || sub || ''))}</div>
    </article>
  `).join('');

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

function evidenceStatusLabel(status) {
  if (status === 'no_scan_evidence') return 'No scan evidence';
  if (status === 'weak_scan_evidence') return 'Weak scan evidence';
  return 'Scan evidence seen';
}

function teacherGapStatusLabel(status) {
  if (status === 'no_scans_no_attendance') return 'No scans + no attendance';
  if (status === 'no_scans_attendance_submitted') return 'No scans, attendance submitted';
  if (status === 'scans_no_attendance') return 'Scans, no attendance submit';
  if (status === 'weak_scan_evidence') return 'Weak scan evidence';
  return 'OK';
}

function teacherGapChipClass(status) {
  if (status === 'no_scans_no_attendance') return 'bad';
  if (status === 'no_scans_attendance_submitted' || status === 'scans_no_attendance' || status === 'weak_scan_evidence') return 'warn';
  return 'info';
}

function renderTeacherRoomPeriodFidelity(fidelity = {}) {
  if (!teacherGapsBody) return;
  if (fidelity?.configured === false) {
    teacherGapsBody.innerHTML = `
      <div class="miniRow">
        <div class="miniLabel muted">Teacher assignments are not configured in the Worker.</div>
        <div class="miniValue">—</div>
      </div>
    `;
    return;
  }
  if (fidelity?.baseline_stale) {
    teacherGapsBody.innerHTML = `
      <div class="miniRow">
        <div class="miniLabel">
          <div>Teacher assignment baseline date does not match this dashboard date.</div>
          <div class="muted">Dashboard: ${esc(fidelity.dashboard_date || '—')} • Teacher assignments: ${esc(fidelity.teacher_assignment_date || '—')}</div>
        </div>
        <div class="miniValue"><span class="chip warn">Historical caution</span></div>
      </div>
    `;
    return;
  }

  const gaps = Array.isArray(fidelity?.gaps) ? fidelity.gaps.slice(0, 40) : [];
  const counts = fidelity?.counts || {};
  const summary = `
    <div class="miniRow">
      <div class="miniLabel">
        <div>Expected teacher room/periods: ${esc(counts.expected_room_periods ?? 0)}</div>
        <div class="muted">${esc(counts.no_scan_room_periods ?? 0)} with no scans • ${esc(counts.no_attendance_submit_room_periods ?? 0)} with no teacher submit</div>
      </div>
      <div class="miniValue">
        <div><span class="chip bad">${esc(counts.no_scans_no_attendance ?? 0)} critical</span></div>
      </div>
    </div>
  `;

  teacherGapsBody.innerHTML = gaps.length
    ? summary + gaps.map((row) => {
        const teachers = Array.isArray(row.teacher_last_names) && row.teacher_last_names.length
          ? row.teacher_last_names.join(', ')
          : 'Unknown teacher';
        const sections = Array.isArray(row.sections)
          ? row.sections.map((s) => s?.section_name || '').filter(Boolean).slice(0, 3).join(', ')
          : '';
        const submitters = Array.isArray(row.submitter_emails) && row.submitter_emails.length
          ? `Submitted by: ${row.submitter_emails.slice(0, 2).join(', ')}`
          : '';
        const flags = Array.isArray(row.flags) ? row.flags : [];
        const flagText = flags.slice(0, 2).join(' • ');
        return `
          <div class="miniRow">
            <div class="miniLabel">
              <div>${esc(row.room || 'Unknown room')} / ${esc(row.period_local || 'Unknown period')} - ${esc(teachers)}</div>
              <div class="muted">${esc(sections || flagText || teacherGapStatusLabel(row.status))}</div>
              ${submitters ? `<div class="muted">${esc(submitters)}</div>` : ''}
            </div>
            <div class="miniValue">
              <div><span class="chip ${teacherGapChipClass(row.status)}">${esc(teacherGapStatusLabel(row.status))}</span></div>
              <div class="muted">${esc(row.scan_success_count || 0)} scans, ${esc(row.unique_students_scanned || 0)} unique</div>
              <div class="muted">${esc(row.teacher_submit_count || 0)} submits, ${esc(row.teacher_loaded_count || 0)} loads</div>
            </div>
          </div>
        `;
      }).join('')
    : summary + `<div class="miniRow"><div class="miniLabel muted">No teacher scan/attendance gaps found for this date.</div><div class="miniValue">—</div></div>`;
}

function renderRoomPeriodEvidence(items = []) {
  if (!roomPeriodEvidenceBody) return;
  const list = Array.isArray(items)
    ? items.filter((row) => row?.evidence_status !== 'scan_evidence_seen' || Number(row?.trust_score || 0) < 80).slice(0, 24)
    : [];
  roomPeriodEvidenceBody.innerHTML = list.length
    ? list.map((row) => {
        const flags = Array.isArray(row.flags) ? row.flags : [];
        const label = `${row.room || 'Unknown room'} / ${row.period_local || 'Unknown period'}`;
        const status = evidenceStatusLabel(row.evidence_status);
        const scanLine = `${row.scan_success_count || 0} scans, ${row.unique_students_scanned || 0} unique`;
        const teacherLine = `${row.teacher_submit_count || 0} submits, ${row.teacher_loaded_count || 0} loads`;
        const expectedTeachers = Array.isArray(row.expected_teacher_last_names)
          ? row.expected_teacher_last_names.filter(Boolean).slice(0, 4).join(', ')
          : '';
        return `
          <div class="miniRow">
            <div class="miniLabel">
              <div>${esc(label)}</div>
              <div class="muted">${esc(expectedTeachers ? `Expected: ${expectedTeachers}` : (flags.slice(0, 2).join(' • ') || status))}</div>
            </div>
            <div class="miniValue">
              <div><span class="score ${scoreClass(row.trust_score)}">${esc(row.trust_score ?? 0)}</span></div>
              <div class="muted">${esc(scanLine)}</div>
              <div class="muted">${esc(teacherLine)}</div>
            </div>
          </div>
        `;
      }).join('')
    : `<div class="miniRow"><div class="miniLabel muted">No weak room/period scan evidence flagged for this date.</div><div class="miniValue">—</div></div>`;
}

function renderTeacherSubmissions(items = []) {
  if (!teacherSubmissionsBody) return;
  const list = Array.isArray(items) ? items.slice(0, 30) : [];
  teacherSubmissionsBody.innerHTML = list.length
    ? list.map((row) => {
        const where = `${row.room || 'Unknown room'} / ${row.period_local || 'Unknown period'}`;
        const who = row.actor_email || 'Unknown teacher';
        const last = row.last_submit_at_iso || row.last_error_at_iso || '';
        const status = Number(row.error_count || 0) > 0
          ? `${row.submit_count || 0} submitted, ${row.error_count || 0} errors`
          : `${row.submit_count || 0} submitted`;
        return `
          <div class="miniRow">
            <div class="miniLabel">
              <div>${esc(who)}</div>
              <div class="muted">${esc(where)}</div>
            </div>
            <div class="miniValue">
              <div>${esc(status)}</div>
              <div class="muted">${esc(fmtTs(last))}</div>
            </div>
          </div>
        `;
      }).join('')
    : `<div class="miniRow"><div class="miniLabel muted">No teacher attendance submissions for this date.</div><div class="miniValue">—</div></div>`;
}

function renderOpenWorkflowDetails(workflow = {}) {
  if (!openWorkflowDetailsBody) return;
  const bathroom = Array.isArray(workflow?.bathroom?.open_students)
    ? workflow.bathroom.open_students.map((row) => ({ ...row, type: 'Bathroom' }))
    : [];
  const staff = Array.isArray(workflow?.staff_pull?.open_students)
    ? workflow.staff_pull.open_students.map((row) => ({ ...row, type: 'Staff pull' }))
    : [];
  const list = bathroom.concat(staff).slice(0, 30);
  openWorkflowDetailsBody.innerHTML = list.length
    ? list.map((row) => {
        const where = row.location || row.room || 'Unknown location';
        const period = row.period_local ? `Period ${row.period_local}` : 'No period';
        return `
          <div class="miniRow">
            <div class="miniLabel">
              <div>${esc(row.type)}: <span class="mono">${esc(row.osis || '')}</span></div>
              <div class="muted">${esc(where)} • ${esc(period)}</div>
            </div>
            <div class="miniValue">
              <div>${esc(row.open_count || 1)} open</div>
              <div class="muted">${esc(fmtTs(row.last_event_at_iso))}</div>
            </div>
          </div>
        `;
      }).join('')
    : `<div class="miniRow"><div class="miniLabel muted">No open bathroom or staff-pull workflows for this date.</div><div class="miniValue">—</div></div>`;
}

function renderLowTrust(data = {}) {
  if (!lowTrustBody) return;
  const devices = Array.isArray(data.devices) ? data.devices : [];
  const roomPeriods = Array.isArray(data.room_period_evidence) ? data.room_period_evidence : [];
  const teacherGaps = Array.isArray(data.teacher_room_period_fidelity?.gaps)
    ? data.teacher_room_period_fidelity.gaps
    : [];
  const lowDevices = devices
    .filter((row) => Number(row.trust_score || 0) < 80 || (Array.isArray(row.flags) && row.flags.length))
    .sort((a, b) => Number(a.trust_score || 0) - Number(b.trust_score || 0))
    .slice(0, 6)
    .map((row) => ({
      label: row.last_bound_location || row.last_reported_location || row.device_id || 'Unknown kiosk',
      sub: (Array.isArray(row.flags) ? row.flags[0] : '') || `${row.scan_success_count || 0} scans`,
      score: row.trust_score
    }));
  const lowRooms = roomPeriods
    .filter((row) => row?.evidence_status !== 'scan_evidence_seen' || Number(row?.trust_score || 0) < 80)
    .sort((a, b) => Number(a.trust_score || 0) - Number(b.trust_score || 0))
    .slice(0, 6)
    .map((row) => ({
      label: `${row.room || 'Unknown room'} / ${row.period_local || 'Unknown period'}`,
      sub: evidenceStatusLabel(row.evidence_status),
      score: row.trust_score
    }));
  const lowTeacherGaps = teacherGaps
    .filter((row) => row?.status !== 'ok')
    .sort((a, b) => Number(a.trust_score || 0) - Number(b.trust_score || 0))
    .slice(0, 6)
    .map((row) => ({
      label: `${row.room || 'Unknown room'} / ${row.period_local || 'Unknown period'}`,
      sub: `${teacherGapStatusLabel(row.status)} - ${Array.isArray(row.teacher_last_names) ? row.teacher_last_names.join(', ') : ''}`,
      score: row.trust_score
    }));
  const list = lowTeacherGaps.concat(lowDevices, lowRooms).slice(0, 10);
  lowTrustBody.innerHTML = list.length
    ? list.map((row) => `
      <div class="miniRow">
        <div class="miniLabel">
          <div>${esc(row.label)}</div>
          <div class="muted">${esc(row.sub || '')}</div>
        </div>
        <div class="miniValue"><span class="score ${scoreClass(row.score)}">${esc(row.score ?? 0)}</span></div>
      </div>
    `).join('')
    : `<div class="miniRow"><div class="miniLabel muted">No low-trust areas flagged for this date.</div><div class="miniValue">—</div></div>`;
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

function renderDashboard(data, statusLabel = 'Live') {
  dateText.textContent = data.date || '—';
  latestDateText.textContent = data.latest_date || '—';
  boundDevicesText.textContent = String(data.counts?.bound_devices ?? '—');
  inactiveDevicesText.textContent = String(data.counts?.inactive_bound_devices ?? '—');
  if (data.date) dateInput.value = data.date;
  renderSummaryCards(data.counts || {});
  renderWorkflow(data.workflow || {});
  renderEventTypes(data.event_types || []);
  renderAttendanceEvidence(data.attendance_evidence || {});
  renderTeacherRoomPeriodFidelity(data.teacher_room_period_fidelity || {});
  renderRoomPeriodEvidence(data.room_period_evidence || []);
  renderTeacherSubmissions(data.teacher_submissions || []);
  renderOpenWorkflowDetails(data.workflow || {});
  renderLowTrust(data || {});
  renderDevices(data.devices || []);
  setStatus(true, statusLabel);
}

async function loadDashboard(date = '', options = {}) {
  if (dashboardBusy) return null;
  setError('');
  setStatus(true, 'Getting data…');
  setDashboardBusy(true, {
    button: options.button || loadBtn,
    title: 'Getting data…',
    detail: options.detail || 'Please wait while the fidelity tracker loads fresh data.'
  });
  try {
    const data = await fetchDashboard(date);
    writeDashboardCache(date, data);
    if (data.date) writeDashboardCache(data.date, data);
    if (!date || (data.date && data.latest_date && data.date === data.latest_date)) {
      writeDashboardCache('', data);
    }
    renderDashboard(data, 'Live');
    return data;
  } catch (err) {
    setStatus(false, 'Error');
    setError(err?.message || String(err));
    return null;
  } finally {
    setDashboardBusy(false);
  }
}

async function loadInitialDashboard() {
  setError('');
  const cached = readDashboardCache('');
  if (cached?.data) {
    renderDashboard(cached.data, 'Cached');
    return cached.data;
  }
  return loadDashboard('', {
    button: loadBtn,
    detail: 'First dashboard load today. This may take a moment while the fidelity tracker is read.'
  });
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
    await loadInitialDashboard();
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
    await loadInitialDashboard();
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
  loadDashboard(String(dateInput.value || '').trim(), {
    button: loadBtn,
    detail: 'Refreshing from the fidelity tracker now.'
  }).catch(() => {});
});

todayBtn.addEventListener('click', () => {
  dateInput.value = '';
  loadDashboard('', {
    button: todayBtn,
    detail: 'Refreshing the latest available fidelity dashboard now.'
  }).catch(() => {});
});

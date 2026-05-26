const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY = 'teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';
const DASHBOARD_CACHE_PREFIX = 'ss_fidelity_dashboard_daily_cache_v3:';
const RANGE_DEFAULT_DAYS = 5;
const URL_PARAMS = new URLSearchParams(window.location.search);
const DEMO_MODE = URL_PARAMS.get('demo') === '1';
const DEMO_FIXTURE_URL = './demo/fidelity_demo.json';
const DASHBOARD_CACHE_LEGACY_PREFIXES = [
  'ss_fidelity_dashboard_cache_v1:',
  'ss_fidelity_dashboard_daily_cache_v1:',
  'ss_fidelity_dashboard_daily_cache_v2:'
];

const loginCard = document.getElementById('loginCard');
const loginOut = document.getElementById('loginOut');
const appShell = document.getElementById('appShell');
const demoBanner = document.getElementById('demoBanner');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dateText = document.getElementById('dateText');
const latestDateText = document.getElementById('latestDateText');
const latestSnapshotText = document.getElementById('latestSnapshotText');
const boundDevicesText = document.getElementById('boundDevicesText');
const inactiveDevicesText = document.getElementById('inactiveDevicesText');
const dateInput = document.getElementById('dateInput');
const loadBtn = document.getElementById('loadBtn');
const todayBtn = document.getElementById('todayBtn');
const rangeStartInput = document.getElementById('rangeStartInput');
const rangeEndInput = document.getElementById('rangeEndInput');
const rangeLoadBtn = document.getElementById('rangeLoadBtn');
const rangeMetaText = document.getElementById('rangeMetaText');
const summaryCards = document.getElementById('summaryCards');
const rangeSummaryCards = document.getElementById('rangeSummaryCards');
const attendanceEvidenceCards = document.getElementById('attendanceEvidenceCards');
const workflowBody = document.getElementById('workflowBody');
const eventTypesBody = document.getElementById('eventTypesBody');
const teacherAccountabilityBody = document.getElementById('teacherAccountabilityBody');
const roomAccountabilityBody = document.getElementById('roomAccountabilityBody');
const rangeTeacherAccountabilityBody = document.getElementById('rangeTeacherAccountabilityBody');
const rangeRoomAccountabilityBody = document.getElementById('rangeRoomAccountabilityBody');
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
let demoFixturePromise = null;
let googleIdentityScriptPromise = null;

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
  if (DEMO_MODE) throw new Error('Demo mode blocks live admin requests.');
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

function addDaysKey(dateKey, days) {
  const d = new Date(`${String(dateKey || localTodayKey()).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + Number(days || 0));
  return localTodayKey(d);
}

function normalizeDashboardCacheDate(date = '') {
  return String(date || '').trim() || 'latest';
}

function dashboardCacheKey(date = '') {
  return `${DASHBOARD_CACHE_PREFIX}${localTodayKey()}:${normalizeDashboardCacheDate(date)}`;
}

function pruneDashboardCache() {
  if (DEMO_MODE) return;
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
  if (DEMO_MODE) return null;
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
  if (DEMO_MODE) return;
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
  const controls = [dateInput, loadBtn, todayBtn, rangeStartInput, rangeEndInput, rangeLoadBtn].filter(Boolean);
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

function fmtDateTime(iso) {
  const s = String(iso || '').trim();
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function setLatestSnapshotMeta(meta = null) {
  const latest = meta?.latest_snapshot || meta || null;
  const stamp = latest?.snapshot_at_iso || '';
  const label = stamp ? `${latest.date || '—'} ${fmtTs(stamp)}` : '—';
  if (latestSnapshotText) latestSnapshotText.textContent = label;
  if (todayBtn) {
    const prefix = DEMO_MODE ? 'Use Demo Latest' : 'Use Latest';
    todayBtn.textContent = stamp ? `${prefix} (${fmtDateTime(stamp)})` : prefix;
    todayBtn.title = stamp
      ? `${DEMO_MODE ? 'Demo snapshot' : 'Latest Fidelity_Score_Daily snapshot'}: ${label}`
      : DEMO_MODE
        ? 'No demo snapshot metadata is available.'
        : 'No Fidelity_Score_Daily snapshot has been reported yet.';
  }
}

function scoreClass(score) {
  if (score == null || score === '—') return 'ok';
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
    ['Teacher score', fmtPct(counts.overall_score_pct), `${counts.points_earned || 0}/${counts.points_possible || 0} eligible students P/L`],
    ['No score earned', counts.teacher_no_scans_no_attendance ?? 0, `${counts.expected_teacher_room_periods || 0} expected teacher room/periods`],
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

function normalizeRoomKey(value) {
  return String(value || '').toLowerCase().trim().replace(/\s+/g, '').replace(/^rm/, '').replace(/^room/, '').replace(/[^a-z0-9]/g, '');
}

function teacherGapPriority(status) {
  if (status === 'no_scans_no_attendance') return 0;
  if (status === 'no_scans_attendance_submitted') return 1;
  if (status === 'scans_no_attendance') return 2;
  if (status === 'weak_scan_evidence') return 3;
  return 4;
}

function summarizeTeacherRows(rows = []) {
  const summary = {
    periods: rows.length,
    periodsWithScans: 0,
    periodsWithSubmits: 0,
    totalScans: 0,
    totalUnique: 0,
    totalSubmits: 0,
    totalLoads: 0,
    pointsEarned: 0,
    pointsPossible: 0,
    realClassScans: 0,
    critical: 0,
    noScanSubmitted: 0,
    scansNoAttendance: 0,
    weak: 0,
    worstTrust: rows.length ? 100 : 0
  };
  rows.forEach((row) => {
    const scans = Number(row.scan_success_count || 0);
    const submits = Number(row.teacher_submit_count || 0);
    summary.totalScans += scans;
    summary.totalUnique += Number(row.unique_students_scanned || 0);
    summary.totalSubmits += submits;
    summary.totalLoads += Number(row.teacher_loaded_count || 0);
    summary.pointsEarned += Number(row.points_earned || 0);
    summary.pointsPossible += Number(row.points_possible || 0);
    summary.realClassScans += Number(row.real_class_scan_count || 0);
    if (scans > 0) summary.periodsWithScans++;
    if (submits > 0) summary.periodsWithSubmits++;
    if (row.status === 'no_scans_no_attendance') summary.critical++;
    if (row.status === 'no_scans_attendance_submitted') summary.noScanSubmitted++;
    if (row.status === 'scans_no_attendance') summary.scansNoAttendance++;
    if (row.status === 'weak_scan_evidence') summary.weak++;
    summary.worstTrust = Math.min(summary.worstTrust, Number(row.trust_score ?? 100));
  });
  summary.scorePct = summary.pointsPossible > 0 ? Math.round(summary.pointsEarned / summary.pointsPossible * 1000) / 10 : null;
  return summary;
}

function groupStatusChip(summary) {
  if (summary.critical > 0) return `<span class="chip bad">${esc(summary.critical)} empty</span>`;
  if (summary.noScanSubmitted > 0) return `<span class="chip warn">${esc(summary.noScanSubmitted)} no scans</span>`;
  if (summary.scansNoAttendance > 0) return `<span class="chip warn">${esc(summary.scansNoAttendance)} no submit</span>`;
  if (summary.weak > 0) return `<span class="chip warn">${esc(summary.weak)} weak</span>`;
  return '<span class="chip info">OK</span>';
}

function scoreNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compareScoresAsc(a, b) {
  const an = scoreNumberOrNull(a);
  const bn = scoreNumberOrNull(b);
  if (an == null && bn == null) return 0;
  if (an == null) return 1;
  if (bn == null) return -1;
  return an - bn;
}

function roomAccountabilitySortScore(group) {
  const score = scoreNumberOrNull(group?.summary?.scorePct);
  if (score != null) return score;
  const device = group?.device;
  if (device && Array.isArray(device.devices) && device.devices.length) {
    const trust = scoreNumberOrNull(device.worstTrust);
    if (trust != null) return trust;
  }
  return 0;
}

function renderPeriodDetails(rows = [], options = {}) {
  const list = Array.isArray(rows) ? rows.slice().sort((a, b) =>
    teacherGapPriority(a.status) - teacherGapPriority(b.status) ||
    String(a.period_local || '').localeCompare(String(b.period_local || ''), undefined, { numeric:true, sensitivity:'base' }) ||
    String(a.room || '').localeCompare(String(b.room || ''), undefined, { numeric:true, sensitivity:'base' })
  ) : [];
  if (!list.length) {
    return `<div class="miniRow"><div class="miniLabel muted">${esc(options.emptyText || 'No expected class periods for this grouping.')}</div><div class="miniValue">—</div></div>`;
  }
  return list.map((row) => {
    const teachers = Array.isArray(row.teacher_last_names) ? row.teacher_last_names.join(', ') : '';
    const sections = Array.isArray(row.sections)
      ? row.sections.map((s) => s?.section_name || '').filter(Boolean).slice(0, 2).join(', ')
      : '';
    const where = options.showRoom === false ? `Period ${row.period_local || '—'}` : `${row.room || 'Unknown room'} / ${row.period_local || '—'}`;
    return `
      <div class="periodGrid">
        <div><strong>Where</strong>${esc(where)}</div>
        <div><strong>Teacher</strong>${esc(teachers || '—')}</div>
        <div><strong>Score</strong><span class="score ${scoreClass(row.score_pct)}">${esc(row.score_pct == null ? '—' : `${row.score_pct}%`)}</span></div>
        <div><strong>Points</strong>${esc(row.points_earned || 0)} / ${esc(row.points_possible || 0)} P/L</div>
        <div><strong>Scans</strong>${esc(row.real_class_scan_count || 0)} class scans / ${esc(row.unique_students_scanned || 0)} unique</div>
        <div><strong>Attendance</strong>${esc(row.teacher_submit_count || 0)} submits / ${esc(row.teacher_loaded_count || 0)} loads</div>
      </div>
    `;
  }).join('');
}

function buildTeacherGroups(rows = []) {
  const groups = {};
  rows.forEach((row) => {
    const teachers = Array.isArray(row.teacher_last_names) && row.teacher_last_names.length
      ? row.teacher_last_names
      : ['Unknown teacher'];
    teachers.forEach((teacher) => {
      const key = String(teacher || 'Unknown teacher').trim() || 'Unknown teacher';
      const rec = groups[key] || (groups[key] = { label: key, rows: [] });
      rec.rows.push(row);
    });
  });
  return Object.values(groups).map((group) => ({
    ...group,
    summary: summarizeTeacherRows(group.rows)
  })).sort((a, b) =>
    compareScoresAsc(a.summary.scorePct, b.summary.scorePct) ||
    b.summary.critical - a.summary.critical ||
    b.summary.noScanSubmitted - a.summary.noScanSubmitted ||
    b.summary.scansNoAttendance - a.summary.scansNoAttendance ||
    a.summary.worstTrust - b.summary.worstTrust ||
    a.label.localeCompare(b.label, undefined, { sensitivity:'base' })
  );
}

function buildDeviceRoomIndex(devices = []) {
  const byRoom = {};
  (Array.isArray(devices) ? devices : []).forEach((device) => {
    const label = device.last_bound_location || device.last_reported_location || 'Unbound';
    const key = normalizeRoomKey(label) || String(label).toLowerCase();
    const rec = byRoom[key] || (byRoom[key] = {
      label,
      devices: [],
      active: 0,
      heartbeats: 0,
      scans: 0,
      errors: 0,
      mismatches: 0,
      worstTrust: 100
    });
    rec.devices.push(device);
    if (device.kiosk_active_today) rec.active++;
    rec.heartbeats += Number(device.heartbeat_count || 0);
    rec.scans += Number(device.scan_success_count || 0);
    rec.errors += Number(device.scan_error_count || 0);
    rec.mismatches += Number(device.location_mismatch_count || 0);
    rec.worstTrust = Math.min(rec.worstTrust, Number(device.trust_score ?? 100));
  });
  return byRoom;
}

function roomScannerStatusChip(room, deviceRec) {
  if (!deviceRec || !deviceRec.devices.length) return '<span class="chip bad">No scanner</span>';
  if (deviceRec.active === 0) return '<span class="chip bad">Scanner inactive</span>';
  if (deviceRec.scans === 0) return '<span class="chip warn">Active, zero scans</span>';
  if (deviceRec.errors > 0 || deviceRec.mismatches > 0) return '<span class="chip warn">Scanner warnings</span>';
  if (room.summary.critical > 0) return `<span class="chip bad">${esc(room.summary.critical)} empty period(s)</span>`;
  return '<span class="chip info">Scanner working</span>';
}

function buildRoomGroups(rows = [], devices = []) {
  const deviceByRoom = buildDeviceRoomIndex(devices);
  const groups = {};
  rows.forEach((row) => {
    const key = normalizeRoomKey(row.room) || String(row.room || 'Unknown room').toLowerCase();
    const rec = groups[key] || (groups[key] = { label: row.room || 'Unknown room', key, rows: [] });
    rec.rows.push(row);
  });
  Object.entries(deviceByRoom).forEach(([key, deviceRec]) => {
    if (!groups[key]) groups[key] = { label: deviceRec.label || 'Unknown room', key, rows: [] };
  });
  return Object.values(groups).map((group) => ({
    ...group,
    summary: summarizeTeacherRows(group.rows),
    device: deviceByRoom[group.key] || null
  })).sort((a, b) => {
    const aNoDevice = !a.device || !a.device.devices.length ? 1 : 0;
    const bNoDevice = !b.device || !b.device.devices.length ? 1 : 0;
    const aInactive = a.device && a.device.active === 0 ? 1 : 0;
    const bInactive = b.device && b.device.active === 0 ? 1 : 0;
    return compareScoresAsc(roomAccountabilitySortScore(a), roomAccountabilitySortScore(b)) ||
      bNoDevice - aNoDevice ||
      bInactive - aInactive ||
      b.summary.critical - a.summary.critical ||
      b.summary.noScanSubmitted - a.summary.noScanSubmitted ||
      a.label.localeCompare(b.label, undefined, { numeric:true, sensitivity:'base' });
  });
}

function renderTeacherAccountability(fidelity = {}) {
  if (!teacherAccountabilityBody) return;
  if (fidelity?.configured === false) {
    teacherAccountabilityBody.innerHTML = `
      <div class="miniRow">
        <div class="miniLabel muted">Teacher assignments are not configured in the Worker.</div>
        <div class="miniValue">—</div>
      </div>
    `;
    return;
  }
  if (fidelity?.baseline_stale) {
    teacherAccountabilityBody.innerHTML = `
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
  const rows = Array.isArray(fidelity?.rows) ? fidelity.rows : [];
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
  const groups = buildTeacherGroups(rows);
  teacherAccountabilityBody.innerHTML = groups.length
    ? summary + groups.map((group) => `
      <details class="accountabilityGroup">
        <summary>
          <div class="groupSummary">
            <div>
              <div class="groupTitle">${esc(group.label)}</div>
              <div class="groupSub">${esc(group.summary.pointsEarned)}/${esc(group.summary.pointsPossible)} eligible students P/L • ${esc(group.summary.periodsWithSubmits)}/${esc(group.summary.periods)} attendance submitted • ${esc(group.summary.realClassScans)} class scans</div>
            </div>
            <div class="metricRow">
              ${groupStatusChip(group.summary)}
              <span class="score ${scoreClass(group.summary.scorePct)}">${esc(group.summary.scorePct == null ? '—' : `${group.summary.scorePct}%`)}</span>
            </div>
          </div>
        </summary>
        <div class="periodDetail">${renderPeriodDetails(group.rows)}</div>
      </details>
    `).join('')
    : summary + `<div class="miniRow"><div class="miniLabel muted">No expected teacher room/period data found for this date.</div><div class="miniValue">—</div></div>`;
}

function renderRoomAccountability(fidelity = {}, devices = []) {
  if (!roomAccountabilityBody) return;
  if (fidelity?.configured === false) {
    roomAccountabilityBody.innerHTML = `
      <div class="miniRow">
        <div class="miniLabel muted">Teacher assignments are not configured in the Worker.</div>
        <div class="miniValue">—</div>
      </div>
    `;
    return;
  }
  if (fidelity?.baseline_stale) {
    roomAccountabilityBody.innerHTML = `
      <div class="miniRow">
        <div class="miniLabel">
          <div>Teacher assignment baseline date does not match this dashboard date.</div>
          <div class="muted">Room scanner status can still be read from device rows below, but teacher/period accountability is historical-risky.</div>
        </div>
        <div class="miniValue"><span class="chip warn">Historical caution</span></div>
      </div>
    `;
    return;
  }
  const rows = Array.isArray(fidelity?.rows) ? fidelity.rows : [];
  const groups = buildRoomGroups(rows, devices);
  roomAccountabilityBody.innerHTML = groups.length
    ? groups.map((group) => {
        const device = group.device;
        const deviceLine = device
          ? `${device.active}/${device.devices.length} active scanner(s) • ${device.heartbeats} heartbeats • ${device.scans} device scans • ${device.errors} errors`
          : 'No scanner bound to this room';
        return `
          <details class="accountabilityGroup">
            <summary>
              <div class="groupSummary">
                <div>
                  <div class="groupTitle">${esc(group.label)}</div>
                  <div class="groupSub">${esc(deviceLine)} • ${esc(group.summary.pointsEarned)}/${esc(group.summary.pointsPossible)} eligible students P/L • ${esc(group.summary.realClassScans)} class scans</div>
                </div>
                <div class="metricRow">
                  ${roomScannerStatusChip(group, device)}
                  ${groupStatusChip(group.summary)}
                  <span class="score ${scoreClass(group.summary.scorePct)}">${esc(group.summary.scorePct == null ? '—' : `${group.summary.scorePct}%`)}</span>
                </div>
              </div>
            </summary>
            <div class="periodDetail">
              ${device ? `<div class="miniRow"><div class="miniLabel muted">${esc(device.devices.map((d) => d.device_id || 'unknown device').join(', '))}</div><div class="miniValue">${esc(device.scans)} scans</div></div>` : ''}
              ${renderPeriodDetails(group.rows, { showRoom:false, emptyText:'No expected class periods for this room today.' })}
            </div>
          </details>
        `;
      }).join('')
    : `<div class="miniRow"><div class="miniLabel muted">No room or scanner data found for this date.</div><div class="miniValue">—</div></div>`;
}

function renderTeacherRoomPeriodFidelity(fidelity = {}, devices = []) {
  renderTeacherAccountability(fidelity);
  renderRoomAccountability(fidelity, devices);
}

function rangeScoreText(value) {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
}

function rangeGroupChip(group = {}) {
  const noScore = Number(group.no_score_rows || 0);
  const weak = Number(group.weak_rows || 0);
  const possible = Number(group.points_possible || 0);
  if (noScore > 0) return `<span class="chip bad">${esc(noScore)} zero-score</span>`;
  if (weak > 0) return `<span class="chip warn">${esc(weak)} weak</span>`;
  if (possible <= 0) return '<span class="chip warn">No denominator</span>';
  return '<span class="chip info">OK</span>';
}

function renderRangeSummary(data = {}) {
  if (!rangeSummaryCards) return;
  const counts = data.counts || {};
  const cards = [
    ['Range score', rangeScoreText(counts.score_pct), `${counts.points_earned || 0}/${counts.points_possible || 0} eligible students P/L`],
    ['Snapshot days', counts.snapshot_days ?? 0, `${data.start || '—'} to ${data.end || '—'}`],
    ['Teachers', counts.teacher_count ?? 0, 'with saved daily accountability rows'],
    ['Rooms', counts.room_count ?? 0, 'with saved daily accountability rows'],
    ['Zero-score rows', counts.no_score_rows ?? 0, 'room/period snapshots with no P/L evidence'],
    ['Class scans', counts.real_class_scans ?? 0, `${counts.teacher_submits || 0} teacher submits`]
  ];
  rangeSummaryCards.innerHTML = cards.map(([label, value, sub]) => `
    <article class="card">
      <h2>${esc(label)}</h2>
      <div class="big">${esc(value == null ? '—' : value)}</div>
      <div class="small">${esc(sub || '')}</div>
    </article>
  `).join('');
  if (rangeMetaText) {
    const q = data.quarter ? ` • ${data.quarter.label}: ${data.quarter.start} to ${data.quarter.end}` : '';
    rangeMetaText.textContent = `Loaded ${data.start || '—'} to ${data.end || '—'} from saved daily snapshots${q}.`;
  }
}

function renderRangeDetails(rows = [], options = {}) {
  const list = Array.isArray(rows) ? rows.slice().sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) ||
    teacherGapPriority(a.status) - teacherGapPriority(b.status) ||
    String(a.period_local || '').localeCompare(String(b.period_local || ''), undefined, { numeric:true, sensitivity:'base' }) ||
    String(a.room || '').localeCompare(String(b.room || ''), undefined, { numeric:true, sensitivity:'base' })
  ) : [];
  if (!list.length) {
    return `<div class="miniRow"><div class="miniLabel muted">No saved daily snapshots for this grouping in the selected range.</div><div class="miniValue">—</div></div>`;
  }
  return list.map((row) => {
    const teachers = Array.isArray(row.teacher_last_names) ? row.teacher_last_names.join(', ') : '';
    const where = options.showRoom === false ? `Period ${row.period_local || '—'}` : `${row.room || 'Unknown room'} / ${row.period_local || '—'}`;
    return `
      <div class="periodGrid">
        <div><strong>Date</strong>${esc(row.date || '—')}</div>
        <div><strong>Where</strong>${esc(where)}</div>
        <div><strong>Teacher</strong>${esc(teachers || '—')}</div>
        <div><strong>Score</strong><span class="score ${scoreClass(row.score_pct)}">${esc(rangeScoreText(row.score_pct))}</span></div>
        <div><strong>Points</strong>${esc(row.points_earned || 0)} / ${esc(row.points_possible || 0)} P/L</div>
        <div><strong>Scans / Attendance</strong>${esc(row.real_class_scan_count || 0)} scans / ${esc(row.teacher_submit_count || 0)} submits</div>
      </div>
    `;
  }).join('');
}

function renderRangeGroups(target, groups = [], options = {}) {
  if (!target) return;
  const list = Array.isArray(groups)
    ? groups.slice().sort((a, b) =>
        compareScoresAsc(a?.score_pct, b?.score_pct) ||
        String(a?.label || '').localeCompare(String(b?.label || ''), undefined, { numeric:true, sensitivity:'base' })
      )
    : [];
  target.innerHTML = list.length
    ? list.map((group) => `
      <details class="accountabilityGroup">
        <summary>
          <div class="groupSummary">
            <div>
              <div class="groupTitle">${esc(group.label || 'Unknown')}</div>
              <div class="groupSub">${esc(group.points_earned || 0)}/${esc(group.points_possible || 0)} eligible students P/L • ${esc(group.rows || 0)} saved room/period rows • ${esc(group.snapshot_days || 0)} day(s) • ${esc(group.real_class_scans || 0)} class scans</div>
            </div>
            <div class="metricRow">
              ${rangeGroupChip(group)}
              <span class="score ${scoreClass(group.score_pct)}">${esc(rangeScoreText(group.score_pct))}</span>
            </div>
          </div>
        </summary>
        <div class="periodDetail">${renderRangeDetails(group.details || [], options)}</div>
      </details>
    `).join('')
    : `<div class="miniRow"><div class="miniLabel muted">No saved daily snapshots found for this range. Load a daily dashboard after the updated GAS is deployed to start filling this data.</div><div class="miniValue">—</div></div>`;
}

function renderRangeDashboard(data = {}) {
  renderRangeSummary(data);
  renderRangeGroups(rangeTeacherAccountabilityBody, data.teachers || [], { showRoom:true });
  renderRangeGroups(rangeRoomAccountabilityBody, data.rooms || [], { showRoom:false });
}

function renderRangePlaceholder() {
  if (rangeSummaryCards) {
    rangeSummaryCards.innerHTML = `
      <article class="card">
        <h2>Range score</h2>
        <div class="big">—</div>
        <div class="small">Choose dates and load a range.</div>
      </article>
    `;
  }
  const empty = `<div class="miniRow"><div class="miniLabel muted">Range data is not loaded yet.</div><div class="miniValue">—</div></div>`;
  if (rangeTeacherAccountabilityBody) rangeTeacherAccountabilityBody.innerHTML = empty;
  if (rangeRoomAccountabilityBody) rangeRoomAccountabilityBody.innerHTML = empty;
}

function initRangeInputsFromDaily(data = {}) {
  if (!rangeEndInput || !rangeStartInput) return;
  const end = String(data.date || data.latest_date || '').slice(0, 10);
  if (!end) return;
  if (!rangeEndInput.value) rangeEndInput.value = end;
  if (!rangeStartInput.value) rangeStartInput.value = addDaysKey(end, -(RANGE_DEFAULT_DAYS - 1));
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadDemoFixture() {
  if (!demoFixturePromise) {
    demoFixturePromise = fetch(DEMO_FIXTURE_URL, { cache: 'no-store' })
      .then(async (resp) => {
        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data?.ok) throw new Error(`Demo fixture failed to load: HTTP ${resp.status}`);
        return data;
      });
  }
  return demoFixturePromise;
}

async function demoDashboardForDate(date = '') {
  const fixture = await loadDemoFixture();
  const data = cloneJson(fixture.dashboard || fixture);
  const selectedDate = String(date || data.date || fixture.date || localTodayKey()).slice(0, 10);
  data.demo = true;
  data.date = selectedDate;
  data.latest_date = selectedDate;
  if (data.score_snapshot?.latest) {
    data.score_snapshot.latest.date = selectedDate;
  }
  return data;
}

async function demoRangeForDates(start = '', end = '') {
  const fixture = await loadDemoFixture();
  const data = cloneJson(fixture.range || {});
  data.ok = true;
  data.demo = true;
  data.start = String(start || data.start || addDaysKey(localTodayKey(), -(RANGE_DEFAULT_DAYS - 1))).slice(0, 10);
  data.end = String(end || data.end || localTodayKey()).slice(0, 10);
  return data;
}

async function fetchDashboard(date = '', options = {}) {
  if (DEMO_MODE) return demoDashboardForDate(date);
  const u = new URL('/admin/fidelity_dashboard', API_BASE);
  const requestDate = options.forceTodaySnapshot && (!date || date === localTodayKey())
    ? localTodayKey()
    : date;
  if (requestDate) u.searchParams.set('date', requestDate);
  if (options.forceTodaySnapshot) u.searchParams.set('score_snapshot', '1');
  const r = await adminFetch(u, { method: 'GET' });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) {
    throw new Error(data?.detail || data?.error || `HTTP ${r.status}`);
  }
  return data;
}

async function fetchScoreSnapshotMeta() {
  if (DEMO_MODE) {
    const fixture = await loadDemoFixture();
    return cloneJson(fixture.score_snapshot_meta || { ok: true, latest_snapshot: fixture.dashboard?.score_snapshot?.latest || null });
  }
  const r = await adminFetch('/admin/fidelity_score_snapshot_meta', { method: 'GET' });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) {
    throw new Error(data?.detail || data?.error || `HTTP ${r.status}`);
  }
  return data;
}

async function fetchRangeDashboard(start = '', end = '') {
  if (DEMO_MODE) return demoRangeForDates(start, end);
  const u = new URL('/admin/fidelity_range_dashboard', API_BASE);
  if (start) u.searchParams.set('start', start);
  if (end) u.searchParams.set('end', end);
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
  if (data.score_snapshot) setLatestSnapshotMeta(data.score_snapshot.latest || data.score_snapshot.meta || null);
  boundDevicesText.textContent = String(data.counts?.bound_devices ?? '—');
  inactiveDevicesText.textContent = String(data.counts?.inactive_bound_devices ?? '—');
  if (data.date) dateInput.value = data.date;
  initRangeInputsFromDaily(data);
  if (rangeSummaryCards && !rangeSummaryCards.innerHTML.trim()) renderRangePlaceholder();
  renderSummaryCards(data.counts || {});
  renderWorkflow(data.workflow || {});
  renderEventTypes(data.event_types || []);
  renderAttendanceEvidence(data.attendance_evidence || {});
  renderTeacherRoomPeriodFidelity(data.teacher_room_period_fidelity || {}, data.devices || []);
  renderRoomPeriodEvidence(data.room_period_evidence || []);
  renderTeacherSubmissions(data.teacher_submissions || []);
  renderOpenWorkflowDetails(data.workflow || {});
  renderLowTrust(data || {});
  renderDevices(data.devices || []);
  setStatus(true, statusLabel);
}

async function loadRangeDashboard(start = '', end = '', options = {}) {
  if (dashboardBusy) return null;
  setError('');
  setStatus(true, 'Getting range…');
  setDashboardBusy(true, {
    button: options.button || rangeLoadBtn,
    buttonText: 'Loading Range…',
    title: 'Getting range data…',
    detail: options.detail || 'Please wait while saved daily fidelity snapshots are loaded.'
  });
  try {
    const data = await fetchRangeDashboard(start, end);
    if (data.start && rangeStartInput) rangeStartInput.value = data.start;
    if (data.end && rangeEndInput) rangeEndInput.value = data.end;
    renderRangeDashboard(data);
    setStatus(true, data.demo ? 'Demo range' : 'Range loaded');
    return data;
  } catch (err) {
    setStatus(false, 'Error');
    setError(err?.message || String(err));
    return null;
  } finally {
    setDashboardBusy(false);
  }
}

async function loadDashboard(date = '', options = {}) {
  if (dashboardBusy) return null;
  setError('');
  setStatus(true, 'Refreshing view…');
  const forceTodaySnapshot = options.forceTodaySnapshot === true;
  setDashboardBusy(true, {
    button: options.button || loadBtn,
    buttonText: options.buttonText || (forceTodaySnapshot ? 'Saving Snapshot…' : 'Refreshing View…'),
    title: options.title || (forceTodaySnapshot ? 'Saving today’s snapshot…' : 'Refreshing dashboard view…'),
    detail: options.detail || 'Reading saved Fidelity_Score_Daily accountability rows and live device/event summaries.'
  });
  try {
    const data = await fetchDashboard(date, { forceTodaySnapshot });
    const cacheDate = forceTodaySnapshot && (!date || date === localTodayKey()) ? localTodayKey() : date;
    writeDashboardCache(cacheDate, data);
    if (data.date) writeDashboardCache(data.date, data);
    if (!cacheDate || (data.date && data.latest_date && data.date === data.latest_date)) {
      writeDashboardCache('', data);
    }
    renderDashboard(data, data.demo ? 'Demo' : (data.stale ? 'Cached' : 'Live'));
    if (data.warning) setError(data.warning);
    if (data.score_snapshot?.requested && data.score_snapshot?.result?.ok === false) {
      setError(`Dashboard loaded, but Fidelity_Score_Daily was not saved: ${data.score_snapshot.result.error || 'unknown error'}`);
    }
    return data;
  } catch (err) {
    setStatus(false, 'Error');
    const msg = err?.message || String(err);
    if (forceTodaySnapshot && /timeout|524|aborted/i.test(msg)) {
      setError(`${msg}. The snapshot request may still be finishing. Come back in about 5 minutes and use the latest snapshot.`);
    } else {
      setError(msg);
    }
    return null;
  } finally {
    setDashboardBusy(false);
  }
}

async function loadInitialDashboard() {
  setError('');
  refreshScoreSnapshotMeta().catch(() => {});
  const cached = readDashboardCache('');
  if (cached?.data) {
    renderDashboard(cached.data, 'Cached');
    return cached.data;
  }
  return loadDashboard('', {
    button: loadBtn,
    detail: DEMO_MODE
      ? 'Loading the local synthetic fidelity fixture. No live systems are contacted.'
      : 'First dashboard load today. Reading saved score rows plus live device/event summaries.'
  });
}

async function refreshScoreSnapshotMeta() {
  try {
    const meta = await fetchScoreSnapshotMeta();
    setLatestSnapshotMeta(meta);
    return meta;
  } catch {
    return null;
  }
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;
  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google script failed to load'));
    document.head.appendChild(script);
  });
  return googleIdentityScriptPromise;
}

async function waitForGoogle(timeoutMs = 8000) {
  await loadGoogleIdentityScript();
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

async function startDemoMode() {
  document.body.classList.add('demoMode');
  if (demoBanner) demoBanner.hidden = false;
  if (loadBtn) loadBtn.textContent = 'Reload Demo View';
  if (todayBtn) todayBtn.textContent = 'Use Demo Latest';
  if (rangeLoadBtn) rangeLoadBtn.textContent = 'Load Demo Range';
  hide(loginCard);
  show(appShell);
  setStatus(true, 'Demo');
  await loadInitialDashboard();
}

window.addEventListener('DOMContentLoaded', async () => {
  if (DEMO_MODE) {
    startDemoMode().catch((e) => {
      show(appShell);
      setStatus(false, 'Demo error');
      setError(e?.message || String(e));
    });
    return;
  }

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
  const selectedDate = String(dateInput.value || '').trim();
  loadDashboard(selectedDate, {
    button: loadBtn,
    buttonText: DEMO_MODE ? 'Reloading Demo…' : 'Refreshing View…',
    title: DEMO_MODE ? 'Reloading demo data…' : 'Refreshing dashboard view…',
    forceTodaySnapshot: false,
    detail: DEMO_MODE
      ? 'Loading the local synthetic fidelity fixture. No live systems are contacted.'
      : 'Reading saved Fidelity_Score_Daily accountability rows plus live device/event summaries. This does not rebuild the daily score snapshot.'
  }).catch(() => {});
});

todayBtn.addEventListener('click', () => {
  dateInput.value = '';
  loadDashboard('', {
    button: todayBtn,
    buttonText: DEMO_MODE ? 'Loading Demo…' : undefined,
    title: DEMO_MODE ? 'Loading demo latest…' : undefined,
    detail: DEMO_MODE
      ? 'Loading the latest synthetic demo dashboard.'
      : 'Loading the latest available fidelity dashboard without forcing a new score snapshot.'
  }).catch(() => {});
});

rangeLoadBtn.addEventListener('click', () => {
  const start = String(rangeStartInput?.value || '').trim();
  const end = String(rangeEndInput?.value || '').trim();
  loadRangeDashboard(start, end, {
    button: rangeLoadBtn,
    buttonText: DEMO_MODE ? 'Loading Demo Range…' : undefined,
    title: DEMO_MODE ? 'Loading demo range…' : undefined,
    detail: DEMO_MODE
      ? 'Loading the local synthetic multi-day accountability fixture.'
      : 'Loading saved daily accountability snapshots for the selected range.'
  }).catch(() => {});
});

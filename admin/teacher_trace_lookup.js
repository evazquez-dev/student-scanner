const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'teacher_trace_lookup_admin_session_v1';
const ADMIN_SESSION_LEGACY_KEYS = [
  'ss_admin_session_sid_v1',
  'teacher_att_admin_session_v1',
  'attendance_status_admin_session_v1',
  'admin_session_v1'
];
const ADMIN_SESSION_HEADER = 'x-admin-session';

function getStoredAdminSessionSid() {
  try {
    const own = String(sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY) || '').trim();
    if (own) return own;
    for (const k of ADMIN_SESSION_LEGACY_KEYS) {
      const v = String(sessionStorage.getItem(k) || localStorage.getItem(k) || '').trim();
      if (v) return v;
    }
  } catch {}
  return '';
}

function setStoredAdminSessionSid(sid) {
  const v = String(sid || '').trim();
  try {
    if (!v) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, v);
    localStorage.setItem(ADMIN_SESSION_KEY, v);
  } catch {}
}

function clearStoredAdminSessionSid() {
  setStoredAdminSessionSid('');
}

function stashAdminSessionFromResponse(resp) {
  try {
    const sid = String(resp?.headers?.get('x-admin-session') || resp?.headers?.get('X-Admin-Session') || '').trim();
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

function show(el) {
  if (!el) return;
  el.classList.remove('hidden');
  if (el.id === 'loginCard') el.style.display = 'block';
  else el.style.display = '';
}

function hide(el) {
  if (!el) return;
  el.classList.add('hidden');
  el.style.display = 'none';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function fmtTs(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return String(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

function readJson(resp) {
  return resp.json().catch(() => ({})).then((j) => {
    if (!resp.ok || !j?.ok) throw new Error(j?.error || `HTTP ${resp.status}`);
    return j;
  });
}

function setLive(ok, text) {
  liveDot.className = 'dot ' + (ok ? 'ok' : 'bad');
  liveText.textContent = text || (ok ? 'Live' : 'Error');
}

function setStatus(text) {
  statusText.textContent = text || '-';
}

function setError(msg) {
  if (!msg) {
    errorBox.textContent = '';
    hide(errorBox);
    return;
  }
  errorBox.textContent = String(msg);
  show(errorBox);
}

async function waitForGoogle(timeoutMs = 8000) {
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise((r) => setTimeout(r, 50));
  }
  return window.google.accounts.id;
}

const loginCard = document.getElementById('loginCard');
const loginOut = document.getElementById('loginOut');
const appShell = document.getElementById('appShell');
const liveDot = document.getElementById('liveDot');
const liveText = document.getElementById('liveText');
const datePill = document.getElementById('datePill');
const countPill = document.getElementById('countPill');
const scanPill = document.getElementById('scanPill');
const summaryRow = document.getElementById('summaryRow');
const statusText = document.getElementById('statusText');
const errorBox = document.getElementById('errorBox');
const resultsEl = document.getElementById('results');

const filterForm = document.getElementById('filterForm');
const dateInput = document.getElementById('dateInput');
const osisInput = document.getElementById('osisInput');
const roomInput = document.getElementById('roomInput');
const periodInput = document.getElementById('periodInput');
const submissionInput = document.getElementById('submissionInput');
const actorInput = document.getElementById('actorInput');
const levelInput = document.getElementById('levelInput');
const limitInput = document.getElementById('limitInput');
const runBtn = document.getElementById('runBtn');
const resetBtn = document.getElementById('resetBtn');

let lastLookup = null;

function todayLocalDateValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function bindEvents() {
  filterForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    runLookup().catch((err) => {
      console.error(err);
      setLive(false, 'Lookup error');
      setError(err?.message || String(err));
      setStatus('Lookup failed.');
    });
  });

  resetBtn?.addEventListener('click', () => {
    dateInput.value = todayLocalDateValue();
    osisInput.value = '';
    roomInput.value = '';
    periodInput.value = '';
    submissionInput.value = '';
    actorInput.value = '';
    levelInput.value = '';
    limitInput.value = '25';
    setError('');
    renderResults({ results: [], scannedKeys: 0, count: 0, date: dateInput.value });
    setStatus('Filters reset.');
  });
}

async function fetchAccess() {
  const r = await adminFetch('/admin/access', { method: 'GET' });
  return readJson(r);
}

async function runLookup() {
  setError('');
  setLive(true, 'Loading…');
  setStatus('Running trace lookup…');
  runBtn.disabled = true;

  try {
    const u = new URL('/admin/teacher_att_trace_lookup', API_BASE);
    u.searchParams.set('date', dateInput.value || todayLocalDateValue());
    if (osisInput.value.trim()) u.searchParams.set('osis', osisInput.value.trim());
    if (roomInput.value.trim()) u.searchParams.set('room', roomInput.value.trim());
    if (periodInput.value.trim()) u.searchParams.set('periodLocal', periodInput.value.trim());
    if (submissionInput.value.trim()) u.searchParams.set('submissionId', submissionInput.value.trim());
    if (actorInput.value.trim()) u.searchParams.set('actorEmail', actorInput.value.trim());
    if (levelInput.value.trim()) u.searchParams.set('level', levelInput.value.trim());
    u.searchParams.set('limit', String(limitInput.value || '25'));

    const r = await adminFetch(u, { method: 'GET' });
    const j = await readJson(r);
    lastLookup = j;
    renderResults(j);
    setLive(true, 'Live');
    setStatus(`Loaded ${j.count || 0} trace submission(s).`);
  } finally {
    runBtn.disabled = false;
  }
}

function renderSummary(data) {
  const rows = [
    { k: 'Submissions', v: Number(data?.count || 0) },
    { k: 'Errors', v: (data?.results || []).reduce((sum, item) => sum + Number(item?.summary?.errorCount || 0), 0) },
    { k: 'Warnings', v: (data?.results || []).reduce((sum, item) => sum + Number(item?.summary?.warnCount || 0), 0) },
    { k: 'Events', v: (data?.results || []).reduce((sum, item) => sum + Number(item?.summary?.eventCount || 0), 0) }
  ];
  summaryRow.innerHTML = rows.map((row) => `
    <div class="summary-chip">
      <div class="k">${esc(row.k)}</div>
      <div class="v mono">${esc(row.v)}</div>
    </div>
  `).join('');
}

function prettyJson(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw !== 'string') {
    try { return JSON.stringify(raw, null, 2); } catch { return String(raw); }
  }
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

function renderResults(data) {
  const list = Array.isArray(data?.results) ? data.results : [];
  datePill.textContent = String(data?.date || dateInput.value || '-');
  countPill.textContent = String(data?.count || 0);
  scanPill.textContent = String(data?.scannedKeys || 0);
  renderSummary(data);

  if (!list.length) {
    resultsEl.innerHTML = '<div class="empty">No trace submissions matched these filters.</div>';
    return;
  }

  resultsEl.innerHTML = list.map((item) => {
    const affected = Array.isArray(item?.summary?.affectedOsis) ? item.summary.affectedOsis.join(', ') : '';
    const events = Array.isArray(item?.events) ? item.events : [];
    const gasState = item?.fallback?.ok ? 'KV fallback' : (item?.gas?.ok ? 'GAS + KV' : 'KV only');
    return `
      <article class="trace-card">
        <div class="trace-head">
          <div>
            <div class="trace-title mono">${esc(item.submissionId || '-')}</div>
            <div class="meta">
              <span>${esc(item.actorEmail || '-')}</span>
              <span>Room ${esc(item.room || '-')}</span>
              <span>Period ${esc(item.periodLocal || '-')}</span>
              <span>${item.isCurrentPeriodSubmit ? 'Current period' : 'Not current period'}</span>
              <span>${esc(item.mode || '-')}</span>
            </div>
          </div>
          <div class="meta" style="justify-content:flex-end;">
            <span>${esc(gasState)}</span>
            <span>${esc(fmtTs(item.summary?.latestTs || item.persistedAtISO))}</span>
          </div>
        </div>
        <div class="trace-body">
          <div class="summary-row">
            <div class="summary-chip"><div class="k">Events</div><div class="v mono">${esc(item.summary?.eventCount || 0)}</div></div>
            <div class="summary-chip"><div class="k">Errors</div><div class="v mono">${esc(item.summary?.errorCount || 0)}</div></div>
            <div class="summary-chip"><div class="k">Warnings</div><div class="v mono">${esc(item.summary?.warnCount || 0)}</div></div>
            <div class="summary-chip"><div class="k">Affected OSIS</div><div class="v mono">${esc(affected || '-')}</div></div>
          </div>
          <details>
            <summary>Show ${events.length} event(s)</summary>
            <div class="event-list">
              ${events.map((ev) => {
                const level = String(ev?.level || 'info').toLowerCase();
                const detail = prettyJson(ev?.detail_json || ev?.detail || '');
                return `
                  <div class="event">
                    <div class="event-top">
                      <span class="tag ${level === 'error' ? 'error' : (level === 'warn' ? 'warn' : '')}">${esc(level.toUpperCase())}</span>
                      <span class="tag">${esc(ev?.step || '-')}</span>
                      <span class="tag mono">${esc(fmtTs(ev?.ts))}</span>
                      <span class="tag mono">${esc(ev?.osis || '-')}</span>
                      <span class="tag">${esc(ev?.code_letter || ev?.codeLetter || '-')}</span>
                    </div>
                    ${detail ? `<pre>${esc(detail)}</pre>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </details>
        </div>
      </article>
    `;
  }).join('');
}

async function initPage() {
  bindEvents();
  dateInput.value = todayLocalDateValue();
  limitInput.value = '25';
  setLive(true, 'Checking access…');
  setStatus('Checking access…');

  const access = await fetchAccess();
  const can = !!(access?.can?.teacher_trace_lookup || access?.can?.super_admin);
  if (!can) throw new Error('forbidden');

  renderResults({ results: [], scannedKeys: 0, count: 0, date: dateInput.value });
  await runLookup();
}

async function onGoogleCredential(resp) {
  try {
    loginOut.textContent = 'Signing in…';
    const r = await adminFetch('/admin/session/login_google', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString()
    });
    const data = await r.json().catch(() => ({}));
    if (data?.sid) setStoredAdminSessionSid(String(data.sid));
    stashAdminSessionFromResponse(r);
    if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);

    hide(loginCard);
    show(appShell);
    await initPage();
  } catch (e) {
    show(loginCard);
    hide(appShell);
    loginOut.textContent = `Login failed: ${e?.message || e}`;
  }
}

async function tryBootstrapSession() {
  try {
    const r = await adminFetch('/admin/session/check', { method: 'GET' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) return false;
    hide(loginCard);
    show(appShell);
    await initPage();
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
      hide(appShell);
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
    hide(appShell);
    loginOut.textContent = '-';
  } catch (e) {
    show(loginCard);
    hide(appShell);
    loginOut.textContent = `Google init failed: ${e?.message || e}`;
  }
});

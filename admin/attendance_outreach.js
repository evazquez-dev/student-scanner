const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const SESSION_KEY = 'attendance_outreach_admin_session_v1';
const SESSION_KEYS = [SESSION_KEY, 'ss_admin_session_sid_v1', 'teacher_att_admin_session_v1', 'attendance_status_admin_session_v1', 'admin_session_v1'];
const SESSION_HEADER = 'x-admin-session';
const OUTCOMES = ['Spoke/Connected', 'No Answer', 'Left Voicemail', 'Will Be Late', 'Absent Today', 'Wrong Number'];

const $ = (id) => document.getElementById(id);
const loginCard = $('loginCard');
const loginOut = $('loginOut');
const app = $('app');
const refreshBtn = $('refreshBtn');
const communicationsLink = $('communicationsLink');
const errorCard = $('errorCard');
const errorOut = $('errorOut');
const modeBanner = $('modeBanner');
const queueBody = $('queueBody');
const queueDate = $('queueDate');
const generatedAt = $('generatedAt');
const queueMeta = $('queueMeta');
const statusFilter = $('statusFilter');
const searchInput = $('searchInput');
const callBackdrop = $('callBackdrop');
const callStudent = $('callStudent');
const callError = $('callError');
const contactChoices = $('contactChoices');
const outcomeChoices = $('outcomeChoices');
const callNotes = $('callNotes');
const followUpNeeded = $('followUpNeeded');
const followUpFields = $('followUpFields');
const followUpAt = $('followUpAt');
const followUpOwner = $('followUpOwner');
const saveCall = $('saveCall');
const saveNextCall = $('saveNextCall');
const verifyBackdrop = $('verifyBackdrop');
const verifyStudent = $('verifyStudent');
const verifyEvidence = $('verifyEvidence');
const verifyNote = $('verifyNote');
const verifyError = $('verifyError');
const saveVerify = $('saveVerify');
const toast = $('toast');

let ACCESS = null;
let QUEUE = null;
let ACTIVE_CALL_ROW = null;
// D1_ATTENDANCE_CALL_SUBMISSION_V1
let ACTIVE_CALL_SUBMISSION_ID = '';
let ACTIVE_VERIFY_ROW = null;
let CONTACT_MAP = new Map();
let SELECTED_OUTCOME = OUTCOMES[0];
let loadSequence = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getStoredSid() {
  try {
    for (const key of SESSION_KEYS) {
      const value = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
      if (value) return value;
    }
  } catch {}
  return '';
}

function setStoredSid(sid) {
  const value = String(sid || '').trim();
  if (!value) return;
  try {
    for (const key of SESSION_KEYS) {
      sessionStorage.setItem(key, value);
      localStorage.setItem(key, value);
    }
  } catch {}
}

function clearStoredSid() {
  try {
    for (const key of SESSION_KEYS) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  } catch {}
}

async function adminFetch(pathOrUrl, init = {}) {
  const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  const headers = new Headers(init.headers || {});
  const sid = getStoredSid();
  if (sid && !headers.has(SESSION_HEADER)) headers.set(SESSION_HEADER, sid);
  const response = await fetch(url, { ...init, headers, credentials:'include', cache:'no-store' });
  const responseSid = String(response.headers.get(SESSION_HEADER) || response.headers.get('X-Admin-Session') || '').trim();
  if (responseSid) setStoredSid(responseSid);
  if (response.status === 401) {
    const data = await response.clone().json().catch(() => ({}));
    if (['expired','no_session','bad_session'].includes(String(data?.error || '').toLowerCase())) clearStoredSid();
  }
  return response;
}

async function jsonOrThrow(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
  return data;
}

function fmtDateTime(iso) {
  const text = String(iso || '').trim();
  if (!text) return '—';
  const d = new Date(text);
  if (!Number.isFinite(d.getTime())) return text;
  return d.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

function fmtTime(iso) {
  const text = String(iso || '').trim();
  if (!text) return '—';
  const d = new Date(text);
  if (!Number.isFinite(d.getTime())) return text;
  return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
}

function localDateTimeValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : '';
}

// D1_ATTENDANCE_CALL_SUBMISSION_V1
function makeClientSubmissionId(prefix = 'communication') {
  try {
    if (globalThis.crypto?.randomUUID) return `${prefix}:${crypto.randomUUID()}`;
  } catch {}
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}

function showToast(message) {
  toast.textContent = String(message || 'Saved.');
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
}

async function waitForGoogle(timeoutMs = 8000) {
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) throw new Error('Google sign-in failed to load');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.google.accounts.id;
}

async function login(idToken) {
  const response = await adminFetch('/admin/session/login_google', {
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},
    body:new URLSearchParams({ id_token:idToken }).toString()
  });
  const data = await jsonOrThrow(response);
  if (data.sid) setStoredSid(data.sid);
}

async function loadAccess() {
  const response = await adminFetch('/admin/access');
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  return data?.ok ? data : null;
}

async function ensureAccess() {
  ACCESS = await loadAccess();
  if (ACCESS) {
    if (!ACCESS?.can?.attendance_outreach && !ACCESS?.can?.attendance_status && !['admin','super_admin'].includes(String(ACCESS?.role || ''))) {
      throw new Error('Attendance Outreach is limited to office/admin staff.');
    }
    loginCard.hidden = true;
    app.hidden = false;
    if (communicationsLink) communicationsLink.hidden = ACCESS?.can?.communications !== true;
    return true;
  }

  app.hidden = true;
  loginCard.hidden = false;
  loginOut.textContent = 'Please sign in.';
  const gsi = await waitForGoogle();
  gsi.initialize({
    client_id: GOOGLE_CLIENT_ID,
    ux_mode:'popup',
    callback: async (response) => {
      try {
        loginOut.textContent = 'Signing in…';
        await login(response.credential);
        location.reload();
      } catch (error) {
        loginOut.textContent = `Login failed: ${error?.message || error}`;
      }
    }
  });
  gsi.renderButton($('g_id_signin'), { theme:'outline', size:'large' });
  return false;
}

function statusLabel(status) {
  return ({
    needs_call:'Needs Call',
    needs_verification:'Needs Verification',
    contacted:'Contacted',
    verified:'Verified',
    confirmed:'Morning Scan'
  })[status] || status || '—';
}

function evidenceMarkup(row) {
  if (row.has_morning_entry) {
    return `<strong>Morning entry</strong><div class="subline">${esc(fmtTime(row.morning_at))} · ${esc(row.morning_location || 'Morning Entrance')}</div>`;
  }
  if (row.has_today_evidence) {
    return `<strong>${row.evidence_kind === 'scan' ? 'Other scan/evidence' : 'Location evidence'}</strong><div class="subline">${esc(fmtTime(row.evidence_at))} · ${esc(row.evidence_location || 'Location recorded')} · ${esc(row.evidence_source || 'evidence')}</div>`;
  }
  return '<strong>No arrival evidence</strong><div class="subline">No morning entry or other physical evidence recorded today.</div>';
}

function communicationMarkup(row) {
  const comm = row.latest_attendance_communication;
  if (!comm) return '<span class="muted">—</span>';
  return `<strong>${esc(comm.outcome || 'Attendance contact')}</strong><div class="subline">${esc(fmtDateTime(comm.contact_at_iso || comm.created_at_iso))} · ${esc(comm.contact_display_name || 'General contact')} · ${esc(comm.actor_email || '—')}</div>`;
}

function studentLookupHref(row) {
  const url = new URL('./student_view.html', location.href);
  url.searchParams.set('osis', row.osis);
  return url.href;
}

function contactsHref(row) {
  const url = new URL('./student_contacts.html', location.href);
  url.searchParams.set('osis', row.osis);
  url.searchParams.set('name', row.name || '');
  url.searchParams.set('source', 'attendance_outreach');
  url.searchParams.set('category', 'Attendance');
  return url.href;
}

function actionMarkup(row) {
  if (ACCESS?.view_as?.active) return '<span class="muted">Read only</span>';
  if (row.status === 'needs_call') {
    return `<button class="primary callBtn" type="button" data-osis="${esc(row.osis)}">Call / Log</button>`;
  }
  if (row.status === 'needs_verification') {
    return `<button class="primary verifyBtn" type="button" data-osis="${esc(row.osis)}">Verify</button><button class="callBtn" type="button" data-osis="${esc(row.osis)}">Call / Log</button>`;
  }
  if (row.status === 'verified') {
    return `<button class="undoVerifyBtn" type="button" data-osis="${esc(row.osis)}">Undo Verified</button>`;
  }
  if (row.status === 'contacted') {
    return `<button class="callBtn" type="button" data-osis="${esc(row.osis)}">Log Another</button><a class="btn" href="${esc(contactsHref(row))}">History</a>`;
  }
  return `<a class="btn" href="${esc(studentLookupHref(row))}">Student</a>`;
}

function filteredRows() {
  const rows = Array.isArray(QUEUE?.rows) ? QUEUE.rows : [];
  const filter = String(statusFilter.value || 'needs_action');
  const q = String(searchInput.value || '').trim().toLowerCase();
  return rows.filter((row) => {
    const statusOk = filter === 'all'
      || (filter === 'needs_action' && ['needs_call','needs_verification'].includes(row.status))
      || row.status === filter;
    if (!statusOk) return false;
    if (!q) return true;
    return [row.name, row.osis, row.grade, row.current_location, row.status].some((value) => String(value || '').toLowerCase().includes(q));
  });
}

function renderQueue() {
  const summary = QUEUE?.summary || {};
  $('countNeedsCall').textContent = Number(summary.needs_call || 0);
  $('countNeedsVerification').textContent = Number(summary.needs_verification || 0);
  $('countContacted').textContent = Number(summary.contacted || 0);
  $('countVerified').textContent = Number(summary.verified || 0);
  $('countConfirmed').textContent = Number(summary.confirmed || 0);
  queueDate.textContent = QUEUE?.date || '—';
  generatedAt.textContent = QUEUE?.generated_at_iso ? `Generated ${fmtDateTime(QUEUE.generated_at_iso)}` : '—';

  const rows = filteredRows();
  if (!rows.length) {
    queueBody.innerHTML = '<tr><td colspan="6" class="empty">No students match this view.</td></tr>';
  } else {
    queueBody.innerHTML = rows.map((row) => `
      <tr data-osis="${esc(row.osis)}">
        <td><a class="studentLink" href="${esc(studentLookupHref(row))}">${esc(row.name || row.osis)}</a><div class="subline">Grade ${esc(row.grade || '—')} · ${esc(row.osis)}</div></td>
        <td><span class="status ${esc(row.status)}">${esc(statusLabel(row.status))}</span>${row.verification?.note ? `<div class="subline">${esc(row.verification.note)}</div>` : ''}</td>
        <td>${evidenceMarkup(row)}</td>
        <td><strong>${esc(row.current_location || '—')}</strong><div class="subline">${esc(row.current_zone || '')}</div></td>
        <td>${communicationMarkup(row)}</td>
        <td><div class="rowActions">${actionMarkup(row)}</div></td>
      </tr>`).join('');
  }
  queueMeta.textContent = `Showing ${rows.length} of ${Number(summary.total || 0)} students · ${Number(summary.needs_action || 0)} need action.`;
  bindRowActions();
}

function rowByOsis(osis) {
  return (QUEUE?.rows || []).find((row) => row.osis === String(osis || '')) || null;
}

function bindRowActions() {
  queueBody.querySelectorAll('.callBtn').forEach((button) => button.addEventListener('click', () => {
    const row = rowByOsis(button.dataset.osis);
    if (row) openCall(row);
  }));
  queueBody.querySelectorAll('.verifyBtn').forEach((button) => button.addEventListener('click', () => {
    const row = rowByOsis(button.dataset.osis);
    if (row) openVerify(row);
  }));
  queueBody.querySelectorAll('.undoVerifyBtn').forEach((button) => button.addEventListener('click', async () => {
    const row = rowByOsis(button.dataset.osis);
    if (!row || !confirm(`Undo the office verification for ${row.name || row.osis}?`)) return;
    button.disabled = true;
    try {
      await jsonOrThrow(await adminFetch('/admin/attendance_outreach/verify', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ osis:row.osis, action:'clear' })
      }));
      showToast('Verification cleared.');
      await loadQueue();
    } catch (error) {
      showToast(`Could not clear verification: ${error?.message || error}`);
      button.disabled = false;
    }
  }));
}

async function loadQueue() {
  const seq = ++loadSequence;
  refreshBtn.disabled = true;
  errorCard.hidden = true;
  queueBody.innerHTML = '<tr><td colspan="6" class="empty">Refreshing attendance outreach…</td></tr>';
  try {
    const data = await jsonOrThrow(await adminFetch('/admin/attendance_outreach'));
    if (seq !== loadSequence) return;
    QUEUE = data;
    modeBanner.hidden = !data.practice;
    modeBanner.textContent = data.practice ? '🧪 Practice Mode — outreach verification and communication records are isolated from live data.' : '';
    renderQueue();
  } catch (error) {
    if (seq !== loadSequence) return;
    errorOut.textContent = String(error?.message || error);
    errorCard.hidden = false;
    queueBody.innerHTML = '<tr><td colspan="6" class="empty">Queue unavailable.</td></tr>';
  } finally {
    if (seq === loadSequence) refreshBtn.disabled = false;
  }
}

function closeCallModal() {
  callBackdrop.hidden = true;
  ACTIVE_CALL_ROW = null;
  ACTIVE_CALL_SUBMISSION_ID = '';
  CONTACT_MAP.clear();
}

function renderOutcomeChoices() {
  outcomeChoices.innerHTML = '';
  for (const outcome of OUTCOMES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `outcomeChoice${outcome === SELECTED_OUTCOME ? ' active' : ''}`;
    button.textContent = outcome;
    button.addEventListener('click', () => {
      SELECTED_OUTCOME = outcome;
      renderOutcomeChoices();
    });
    outcomeChoices.appendChild(button);
  }
}

function contactKey(contact, index) {
  return String(contact?.contact_assoc_id || `contact_${index}`);
}

function renderContacts(data) {
  CONTACT_MAP.clear();
  const contacts = Array.isArray(data?.contacts) ? data.contacts : [];
  const items = [{ key:'general', contact:null }];
  contacts.forEach((contact, index) => items.push({ key:contactKey(contact, index), contact }));
  contactChoices.innerHTML = '';

  let firstPhoneKey = '';
  for (const item of items) {
    const contact = item.contact;
    const name = contact?.display?.name || 'General / No specific contact';
    const relationship = contact?.display?.relationship || '';
    const phone = String(contact?.display?.phone || '').trim();
    if (contact) CONTACT_MAP.set(item.key, contact);
    if (!firstPhoneKey && phone) firstPhoneKey = item.key;
    const label = document.createElement('label');
    label.className = 'contactChoice';
    const safePhone = phone.replace(/[^+\d]/g, '');
    label.innerHTML = `
      <input type="radio" name="attendanceContact" value="${esc(item.key)}">
      <div><strong>${esc(name)}</strong><div class="subline">${esc(relationship && relationship.toLowerCase() !== 'not set' ? relationship : (contact ? 'Relationship not set' : 'Use when no specific person was reached'))}</div></div>
      <div class="contactPhone">${phone ? `<a href="tel:${esc(safePhone)}">${esc(phone)}</a><button class="copyBtn" type="button" data-phone="${esc(phone)}">Copy</button>` : '<span class="muted">No phone</span>'}</div>`;
    contactChoices.appendChild(label);
  }

  const preferred = firstPhoneKey || 'general';
  const radio = Array.from(contactChoices.querySelectorAll('input[name="attendanceContact"]'))
    .find((input) => input.value === preferred);
  if (radio) radio.checked = true;
  contactChoices.querySelectorAll('.copyBtn').forEach((button) => button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(button.dataset.phone || '');
      showToast('Phone number copied.');
    } catch {
      showToast('Copy failed.');
    }
  }));
}

async function openCall(row) {
  ACTIVE_CALL_ROW = row;
  ACTIVE_CALL_SUBMISSION_ID = makeClientSubmissionId('attendance_call');
  callStudent.textContent = `${row.name || row.osis} · Grade ${row.grade || '—'} · OSIS ${row.osis}`;
  callError.hidden = true;
  callNotes.value = '';
  SELECTED_OUTCOME = 'Spoke/Connected';
  renderOutcomeChoices();
  followUpNeeded.checked = false;
  followUpFields.hidden = true;
  followUpAt.value = '';
  followUpOwner.value = ACCESS?.email || '';
  contactChoices.innerHTML = '<div class="muted">Loading family contacts…</div>';
  callBackdrop.hidden = false;
  try {
    const data = await jsonOrThrow(await adminFetch(`/admin/contacts/student?student_number=${encodeURIComponent(row.osis)}`));
    if (!ACTIVE_CALL_ROW || ACTIVE_CALL_ROW.osis !== row.osis) return;
    renderContacts(data);
  } catch (error) {
    if (!ACTIVE_CALL_ROW || ACTIVE_CALL_ROW.osis !== row.osis) return;
    contactChoices.innerHTML = '<div class="muted">Family contacts could not be loaded. You can still log a General attendance contact.</div>';
    renderContacts({ contacts:[] });
    callError.textContent = `Contact lookup warning: ${error?.message || error}`;
    callError.hidden = false;
  }
}

function selectedContact() {
  const key = String(contactChoices.querySelector('input[name="attendanceContact"]:checked')?.value || 'general');
  return CONTACT_MAP.get(key) || null;
}

function standardNoteForOutcome(outcome) {
  if (outcome === 'No Answer') return 'No answer.';
  if (outcome === 'Left Voicemail') return 'Left voicemail regarding attendance.';
  if (outcome === 'Wrong Number') return 'Number reached was incorrect / not associated with the student.';
  return '';
}

async function saveAttendanceCall(advance = false) {
  const row = ACTIVE_CALL_ROW;
  if (!row) return;
  const contact = selectedContact();
  let notes = callNotes.value.trim();
  if (!notes) notes = standardNoteForOutcome(SELECTED_OUTCOME);
  if (!notes) {
    callError.textContent = 'Add a short note for this outcome.';
    callError.hidden = false;
    callNotes.focus();
    return;
  }

  saveCall.disabled = true;
  saveNextCall.disabled = true;
  callError.hidden = true;
  try {
    const payload = {
      submission_id: ACTIVE_CALL_SUBMISSION_ID || (ACTIVE_CALL_SUBMISSION_ID = makeClientSubmissionId('attendance_call')),
      student_number: row.osis,
      student_name: row.name || '',
      contact_assoc_id: contact?.contact_assoc_id || '',
      contact_display_name: contact?.display?.name || 'General / No specific contact',
      contact_relationship: contact?.display?.relationship || '',
      contact_phone: contact?.display?.phone || '',
      contact_email: contact?.display?.email || '',
      person_id: contact?.person_id || contact?.source?.person_id || '',
      contact_snapshot: contact
        ? {
            contact_assoc_id: contact?.contact_assoc_id || '',
            person_id: contact?.person_id || contact?.source?.person_id || '',
            display: contact?.display || {},
            source: contact?.source || {},
            my_overrides: contact?.my_overrides || {}
          }
        : { general_contact: true },
      contact_at_iso: new Date().toISOString(),
      method: 'Phone',
      direction: 'Outgoing',
      category: 'Attendance',
      outcome: SELECTED_OUTCOME,
      notes,
      follow_up_needed: followUpNeeded.checked,
      follow_up_at_iso: followUpNeeded.checked ? localInputToIso(followUpAt.value) : '',
      follow_up_owner_email: followUpNeeded.checked ? followUpOwner.value.trim() : '',
      related_incident_id: '',
      source: 'attendance_outreach'
    };
    await jsonOrThrow(await adminFetch('/admin/communications/create', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)
    }));
    closeCallModal();
    showToast(`Attendance contact logged for ${row.name || row.osis}.`);
    await loadQueue();
    if (advance) {
      const next = (QUEUE?.rows || []).find((candidate) => candidate.status === 'needs_call');
      if (next) await openCall(next);
      else showToast('Attendance call queue is clear.');
    }
  } catch (error) {
    callError.textContent = `Could not save attendance contact: ${error?.message || error}`;
    callError.hidden = false;
  } finally {
    saveCall.disabled = false;
    saveNextCall.disabled = false;
  }
}

function closeVerifyModal() {
  verifyBackdrop.hidden = true;
  ACTIVE_VERIFY_ROW = null;
}

function openVerify(row) {
  ACTIVE_VERIFY_ROW = row;
  verifyStudent.textContent = `${row.name || row.osis} · Grade ${row.grade || '—'} · OSIS ${row.osis}`;
  verifyEvidence.innerHTML = `<strong>Why this student is flagged:</strong><br>No morning-entry scan was found, but EagleNEST has ${esc(row.evidence_kind === 'scan' ? 'another scan' : 'location evidence')} at <strong>${esc(fmtTime(row.evidence_at))}</strong> — ${esc(row.evidence_location || row.current_location || 'location recorded')}.`;
  verifyNote.value = '';
  verifyError.hidden = true;
  verifyBackdrop.hidden = false;
  setTimeout(() => verifyNote.focus(), 0);
}

async function saveVerification() {
  const row = ACTIVE_VERIFY_ROW;
  if (!row) return;
  saveVerify.disabled = true;
  verifyError.hidden = true;
  try {
    await jsonOrThrow(await adminFetch('/admin/attendance_outreach/verify', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ osis:row.osis, action:'verify', note:verifyNote.value.trim() })
    }));
    closeVerifyModal();
    showToast(`${row.name || row.osis} marked verified in building.`);
    await loadQueue();
  } catch (error) {
    verifyError.textContent = `Could not verify student: ${error?.message || error}`;
    verifyError.hidden = false;
  } finally {
    saveVerify.disabled = false;
  }
}

function bindPage() {
  refreshBtn.addEventListener('click', loadQueue);
  statusFilter.addEventListener('change', renderQueue);
  searchInput.addEventListener('input', renderQueue);
  document.querySelectorAll('.kpi[data-filter]').forEach((button) => button.addEventListener('click', () => {
    statusFilter.value = button.dataset.filter || 'needs_action';
    renderQueue();
  }));

  $('closeCall').addEventListener('click', closeCallModal);
  $('cancelCall').addEventListener('click', closeCallModal);
  callBackdrop.addEventListener('click', (event) => { if (event.target === callBackdrop) closeCallModal(); });
  saveCall.addEventListener('click', () => saveAttendanceCall(false));
  saveNextCall.addEventListener('click', () => saveAttendanceCall(true));
  followUpNeeded.addEventListener('change', () => {
    followUpFields.hidden = !followUpNeeded.checked;
    if (followUpNeeded.checked && !followUpAt.value) {
      followUpAt.value = localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
    }
  });

  $('closeVerify').addEventListener('click', closeVerifyModal);
  $('cancelVerify').addEventListener('click', closeVerifyModal);
  verifyBackdrop.addEventListener('click', (event) => { if (event.target === verifyBackdrop) closeVerifyModal(); });
  saveVerify.addEventListener('click', saveVerification);
}

window.addEventListener('DOMContentLoaded', async () => {
  bindPage();
  try {
    const ready = await ensureAccess();
    if (ready) await loadQueue();
  } catch (error) {
    loginCard.hidden = true;
    app.hidden = false;
    errorOut.textContent = String(error?.message || error);
    errorCard.hidden = false;
  }
});

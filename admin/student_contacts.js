/* admin/student_contacts.js */
function meta(name) {
  return document.querySelector(`meta[name="${name}"]`)?.content || '';
}

const API_BASE = (meta('api-base') || '').replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = meta('google-client-id') || '';
const ADMIN_SESSION_KEY = 'ss_admin_session_sid_v1';
const ADMIN_SESSION_LEGACY_KEY = 'teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';
const PAGE_PARAMS = new URLSearchParams(window.location.search);
const PAGE_SOURCE = String(PAGE_PARAMS.get('source') || 'student_contacts').trim() || 'student_contacts';

function getStoredAdminSessionSid() {
  try {
    return String(
      sessionStorage.getItem(ADMIN_SESSION_KEY) ||
      localStorage.getItem(ADMIN_SESSION_KEY) ||
      sessionStorage.getItem(ADMIN_SESSION_LEGACY_KEY) ||
      localStorage.getItem(ADMIN_SESSION_LEGACY_KEY) ||
      ''
    ).trim();
  } catch {
    return '';
  }
}

function setStoredAdminSessionSid(sid) {
  const value = String(sid || '').trim();
  try {
    for (const key of [ADMIN_SESSION_KEY, ADMIN_SESSION_LEGACY_KEY]) {
      if (value) {
        sessionStorage.setItem(key, value);
        localStorage.setItem(key, value);
      } else {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

async function adminFetch(pathOrUrl, init = {}) {
  const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
  const headers = new Headers(init.headers || {});
  const sid = getStoredAdminSessionSid();
  if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store'
  });

  const responseSid = String(response.headers.get('x-admin-session') || '').trim();
  if (responseSid) setStoredAdminSessionSid(responseSid);
  return response;
}

const $ = (id) => document.getElementById(id);
const loginCard = $('loginCard');
const loginOut = $('loginOut');
const app = $('app');
const studentSearch = $('studentSearch');
const searchMenu = $('searchMenu');
const searchStatus = $('searchStatus');
const studentHeader = $('studentHeader');
const studentName = $('studentName');
const studentMeta = $('studentMeta');
const contactCount = $('contactCount');
const contactsEl = $('contacts');
const emptyState = $('emptyState');
const syncStamp = $('syncStamp');
const communicationHistoryCard = $('communicationHistoryCard');
const communicationHistory = $('communicationHistory');

const editBackdrop = $('editBackdrop');
const editTitle = $('editTitle');
const editSubtitle = $('editSubtitle');
const editName = $('editName');
const editRelationship = $('editRelationship');
const editPhone = $('editPhone');
const editEmail = $('editEmail');
const editNote = $('editNote');
const publishSuggestion = $('publishSuggestion');
const editError = $('editError');
const saveEdit = $('saveEdit');
const resetEdits = $('resetEdits');

const commBackdrop = $('commBackdrop');
const commTitle = $('commTitle');
const commSubtitle = $('commSubtitle');
const commAt = $('commAt');
const commMethod = $('commMethod');
const commDirection = $('commDirection');
const commCategory = $('commCategory');
const commOutcome = $('commOutcome');
const commIncident = $('commIncident');
const commNotes = $('commNotes');
const commFollowUp = $('commFollowUp');
const followUpFields = $('followUpFields');
const commFollowUpAt = $('commFollowUpAt');
const commFollowUpOwner = $('commFollowUpOwner');
const commError = $('commError');
const saveComm = $('saveComm');

let access = null;
let currentStudent = null;
let currentData = null;
let currentCommunications = [];
let editing = null;
let communicatingWith = null;
let debounceTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatSync(iso) {
  if (!iso) return 'PowerSchool sync: —';
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? `PowerSchool sync: ${d.toLocaleString()}`
    : `PowerSchool sync: ${iso}`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(iso);
}

function localDateTimeValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : '';
}

async function waitForGoogle(timeoutMs = 8000) {
  const start = Date.now();
  while (!window.google?.accounts?.id) {
    if (Date.now() - start > timeoutMs) throw new Error('Google sign-in failed to load');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return google.accounts.id;
}

async function getAccess() {
  const r = await adminFetch('/admin/access');
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.ok ? j : null;
}

async function doLogin(idToken) {
  const r = await adminFetch('/admin/session/login_google', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ id_token: idToken }).toString()
  });
  const j = await r.json().catch(() => null);
  if (j?.sid) setStoredAdminSessionSid(j.sid);
  if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
}

function showSearchMenu(items) {
  searchMenu.innerHTML = '';
  if (!items?.length) {
    searchMenu.style.display = 'none';
    return;
  }
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `<strong>${esc(item.name || '—')}</strong> <span class="muted">(${esc(item.osis)})</span>${item.email ? `<div class="small muted">${esc(item.email)}</div>` : ''}`;
    button.addEventListener('click', () => selectStudent(item));
    searchMenu.appendChild(button);
  }
  searchMenu.style.display = 'block';
}

async function searchStudents(query) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    showSearchMenu([]);
    searchStatus.textContent = 'Type at least 2 characters.';
    return;
  }
  searchStatus.textContent = 'Searching…';
  const r = await adminFetch(`/admin/roster/search?q=${encodeURIComponent(q)}`);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) {
    searchStatus.textContent = `Search error: ${j?.error || r.status}`;
    showSearchMenu([]);
    return;
  }
  searchStatus.textContent = `${j.results?.length || 0} match(es)`;
  showSearchMenu(j.results || []);
}

function parseArray(raw) {
  try {
    const value = JSON.parse(raw || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function consensusBadges(contact) {
  const badges = [];
  for (const [field, value] of Object.entries(contact.consensus || {})) {
    if (Number(value.match_count || 0) >= 2) {
      badges.push(`<span class="badge consensus">${Number(value.match_count)} staff agree on ${esc(field)}</span>`);
    }
  }
  return badges.join('');
}

function mineBadges(contact) {
  return Object.keys(contact.my_overrides || {})
    .map((field) => `<span class="badge mine">My ${esc(field)} edit</span>`)
    .join('');
}

function qualityBadges(contact) {
  const badges = [];
  if (!contact.source?.name) badges.push('<span class="badge quality">PowerSchool name missing</span>');
  const rel = String(contact.source?.relationship || '').trim().toLowerCase();
  if (!rel || rel === 'not set') badges.push('<span class="badge quality">Relationship not set</span>');
  if (!contact.source?.phone && !contact.source?.email) badges.push('<span class="badge quality">No primary phone/email</span>');
  return badges.join('');
}

function phoneMarkup(contact) {
  const shown = String(contact.display?.phone || '').trim();
  const all = parseArray(contact.source?.phones_json);
  let html = shown ? `<a href="tel:${esc(shown.replace(/[^+\d]/g, ''))}">${esc(shown)}</a>` : '—';
  if (all.length > 1) {
    html += `<div class="sourceHint">${all.map((p) => esc(`${p.number || ''}${p.type ? ` (${p.type})` : ''}${p.preferred ? ' • preferred' : ''}`)).join('<br>')}</div>`;
  }
  if (contact.my_overrides?.phone && contact.source?.phone !== shown) {
    html += `<div class="sourceHint">PowerSchool: ${esc(contact.source?.phone || '—')}</div>`;
  }
  return html;
}

function emailMarkup(contact) {
  const shown = String(contact.display?.email || '').trim();
  const all = parseArray(contact.source?.emails_json);
  let html = shown ? `<a href="mailto:${esc(shown)}">${esc(shown)}</a>` : '—';
  if (all.length > 1) {
    html += `<div class="sourceHint">${all.map((e) => esc(`${e.email || ''}${e.type ? ` (${e.type})` : ''}${e.primary ? ' • primary' : ''}`)).join('<br>')}</div>`;
  }
  if (contact.my_overrides?.email && contact.source?.email !== shown) {
    html += `<div class="sourceHint">PowerSchool: ${esc(contact.source?.email || '—')}</div>`;
  }
  return html;
}

function renderContacts() {
  const rows = currentData?.contacts || [];
  contactsEl.innerHTML = '';
  emptyState.hidden = !!currentStudent;
  studentHeader.hidden = !currentStudent;
  communicationHistoryCard.hidden = !currentStudent;
  if (!currentStudent) return;

  studentName.textContent = currentData?.student_name || currentStudent.name || '—';
  studentMeta.textContent = `OSIS ${currentStudent.osis}${rows[0]?.grade_level ? ` • Grade ${rows[0].grade_level}` : ''}`;
  contactCount.textContent = `${rows.length} contact${rows.length === 1 ? '' : 's'}`;
  syncStamp.textContent = formatSync(currentData?.synced_at_iso);

  if (!rows.length) {
    emptyState.hidden = false;
    emptyState.textContent = 'No PowerSchool contacts found for this student.';
    return;
  }

  for (const contact of rows) {
    const card = document.createElement('article');
    card.className = 'card contactCard';
    const displayName = contact.display?.name || contact.source?.display_name || 'Unnamed Contact';
    const displayRel = String(contact.display?.relationship || '').trim();
    const relShown = (!displayRel || displayRel.toLowerCase() === 'not set') ? 'Relationship not set' : displayRel;
    const nameSourceHint = contact.my_overrides?.name && contact.source?.name !== displayName
      ? `<div class="sourceHint">PowerSchool: ${esc(contact.source?.name || 'No name')}</div>` : '';
    const relSourceHint = contact.my_overrides?.relationship && contact.source?.relationship !== displayRel
      ? `<div class="sourceHint">PowerSchool: ${esc(contact.source?.relationship || 'Not set')}</div>` : '';

    card.innerHTML = `
      <div class="contactTop">
        <div>
          <div class="contactName">${esc(displayName)}</div>${nameSourceHint}
          <div class="relationship">${esc(relShown)}</div>${relSourceHint}
        </div>
        <div class="priority">Priority ${esc(contact.contact_priority || '—')}</div>
      </div>
      <div class="detailList">
        <div class="detail"><div class="detailLabel">Phone</div><div class="detailValue">${phoneMarkup(contact)}</div></div>
        <div class="detail"><div class="detailLabel">Email</div><div class="detailValue">${emailMarkup(contact)}</div></div>
      </div>
      <div class="badges">${mineBadges(contact)}${consensusBadges(contact)}${qualityBadges(contact)}</div>
      <div class="cardActions">
        <button class="btn secondary editBtn" type="button">Edit / Suggest correction</button>
        <button class="btn primary commBtn" type="button">Log communication</button>
      </div>`;

    card.querySelector('.editBtn').addEventListener('click', () => openEditor(contact));
    card.querySelector('.commBtn').addEventListener('click', () => openCommunication(contact));
    contactsEl.appendChild(card);
  }
}

let contactLoadSequence = 0;
const CONTACT_LOADING_DELAY_MS = 220;

async function loadContacts() {
  if (!currentStudent) return;

  const requestSequence = ++contactLoadSequence;
  const studentNumber = String(currentStudent.osis || '');
  let loadingShown = false;
  const loadingTimer = setTimeout(() => {
    if (requestSequence !== contactLoadSequence) return;
    loadingShown = true;
    contactsEl.classList.add('loading');
    searchStatus.textContent = 'Loading contacts…';
  }, CONTACT_LOADING_DELAY_MS);

  try {
    const r = await adminFetch(`/admin/contacts/student?student_number=${encodeURIComponent(studentNumber)}`);
    const j = await r.json().catch(() => null);
    if (requestSequence !== contactLoadSequence) return;
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    currentData = j;
    searchStatus.textContent = '';
    renderContacts();
  } catch (e) {
    if (requestSequence !== contactLoadSequence) return;
    searchStatus.textContent = `Contact load failed: ${e.message || e}`;
    contactsEl.innerHTML = '';
    emptyState.hidden = false;
    emptyState.textContent = `Could not load contacts: ${e.message || e}`;
  } finally {
    clearTimeout(loadingTimer);
    if (requestSequence === contactLoadSequence && loadingShown) {
      contactsEl.classList.remove('loading');
    }
  }
}

async function loadCommunicationHistory() {
  if (!currentStudent) return;
  communicationHistory.innerHTML = '<div class="muted small">Loading communications…</div>';
  try {
    const r = await adminFetch(`/admin/communications/student?student_number=${encodeURIComponent(currentStudent.osis)}&limit=50`);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    currentCommunications = j.rows || [];
    renderCommunicationHistory();
  } catch (e) {
    communicationHistory.innerHTML = `<div class="errorText">Could not load communication history: ${esc(e.message || e)}</div>`;
  }
}

function renderCommunicationHistory() {
  communicationHistory.innerHTML = '';
  if (!currentCommunications.length) {
    communicationHistory.innerHTML = '<div class="muted small">No communications have been logged for this student yet.</div>';
    return;
  }
  for (const row of currentCommunications) {
    const item = document.createElement('article');
    item.className = 'historyItem';
    const follow = row.follow_up_needed
      ? `<div class="historyFollow">Follow-up: ${esc(row.follow_up_at_iso ? formatDateTime(row.follow_up_at_iso) : 'needed')}${row.follow_up_owner_email ? ` • ${esc(row.follow_up_owner_email)}` : ''}</div>`
      : '';
    item.innerHTML = `
      <div class="historyTop">
        <div>
          <div class="historyWho">${esc(row.contact_display_name || 'General / No specific contact')}</div>
          <div class="historyMeta">${esc(row.method)} • ${esc(row.direction)} • ${esc(row.category)} • ${esc(row.outcome)}</div>
        </div>
        <div class="historyMeta">${esc(formatDateTime(row.contact_at_iso || row.created_at_iso))}</div>
      </div>
      <div class="historyNotes">${esc(row.notes)}</div>
      ${follow}
      <div class="historyMeta">Logged by ${esc(row.actor_email || '—')}${row.related_incident_id ? ` • Incident ${esc(row.related_incident_id)}` : ''} • ${esc(row.communication_id || '')}</div>`;
    communicationHistory.appendChild(item);
  }
}

async function selectStudent(item) {
  currentStudent = { osis: String(item.osis || ''), name: item.name || '', email: item.email || '' };
  currentData = null;
  studentSearch.value = currentStudent.name || currentStudent.osis;
  showSearchMenu([]);

  // Update the student context immediately, but avoid flashing a loading state
  // for normal Worker/KV lookups that complete in a fraction of a second.
  studentHeader.hidden = false;
  communicationHistoryCard.hidden = false;
  studentName.textContent = currentStudent.name || '—';
  studentMeta.textContent = `OSIS ${currentStudent.osis}`;
  contactCount.textContent = '';
  syncStamp.textContent = '';
  contactsEl.innerHTML = '';
  contactsEl.classList.remove('loading');
  emptyState.hidden = true;
  searchStatus.textContent = '';

  const u = new URL(location.href);
  u.searchParams.set('osis', currentStudent.osis);
  history.replaceState(null, '', u);

  // Contact cards take the fast Worker/KV path. Communication history remains
  // independent so it cannot block the contact list from rendering.
  const contactsPromise = loadContacts();
  loadCommunicationHistory().catch(() => {});
  await contactsPromise;
}

function openEditor(contact) {
  editing = contact;
  editTitle.textContent = 'Edit contact for me';
  editSubtitle.textContent = `${contact.student_name || currentData?.student_name || ''} • Contact priority ${contact.contact_priority || '—'}`;
  editName.value = contact.display?.name || '';
  if (!contact.source?.name && /^Unnamed(?:\s+.*)?$/i.test(editName.value)) editName.value = '';
  editRelationship.value = (String(contact.display?.relationship || '').toLowerCase() === 'not set') ? '' : (contact.display?.relationship || '');
  editPhone.value = contact.display?.phone || '';
  editEmail.value = contact.display?.email || '';
  editNote.value = '';
  publishSuggestion.checked = true;
  editError.hidden = true;
  editBackdrop.hidden = false;
  setTimeout(() => editName.focus(), 0);
}

function closeEditor() {
  editBackdrop.hidden = true;
  editing = null;
}

function changedFields() {
  if (!editing) return [];
  const values = {
    name: editName.value.trim(),
    relationship: editRelationship.value.trim(),
    phone: editPhone.value.trim(),
    email: editEmail.value.trim()
  };
  const current = {
    name: String(editing.display?.name || '').trim(),
    relationship: String(editing.display?.relationship || '').trim(),
    phone: String(editing.display?.phone || '').trim(),
    email: String(editing.display?.email || '').trim()
  };
  if (!editing.source?.name && /^Unnamed(?:\s+.*)?$/i.test(current.name)) current.name = '';
  if (current.relationship.toLowerCase() === 'not set') current.relationship = '';
  return Object.keys(values)
    .filter((field) => values[field] !== current[field] && values[field])
    .map((field) => ({ field, value: values[field] }));
}

async function saveChanges() {
  const changes = changedFields();
  if (!changes.length) {
    editError.textContent = 'No changes to save.';
    editError.hidden = false;
    return;
  }
  saveEdit.disabled = true;
  resetEdits.disabled = true;
  editError.hidden = true;
  try {
    for (const change of changes) {
      const r = await adminFetch('/admin/contacts/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          student_number: editing.student_number,
          contact_assoc_id: editing.contact_assoc_id,
          field: change.field,
          value: change.value,
          note: editNote.value.trim(),
          publish_suggestion: publishSuggestion.checked
        })
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    }
    closeEditor();
    await loadContacts();
  } catch (e) {
    editError.textContent = `Could not save: ${e.message || e}`;
    editError.hidden = false;
  } finally {
    saveEdit.disabled = false;
    resetEdits.disabled = false;
  }
}

async function resetMyEdits() {
  if (!editing) return;
  if (!confirm('Reset all of your personal edits for this contact? Shared correction suggestions already submitted will remain in the review history.')) return;
  resetEdits.disabled = true;
  editError.hidden = true;
  try {
    const r = await adminFetch('/admin/contacts/override/clear', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        student_number: editing.student_number,
        contact_assoc_id: editing.contact_assoc_id
      })
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    closeEditor();
    await loadContacts();
  } catch (e) {
    editError.textContent = `Could not reset: ${e.message || e}`;
    editError.hidden = false;
  } finally {
    resetEdits.disabled = false;
  }
}

function openCommunication(contact = null) {
  if (!currentStudent) return;
  communicatingWith = contact;
  const label = contact?.display?.name || 'General / No specific contact';
  const relationship = contact?.display?.relationship || '';
  commTitle.textContent = 'Log communication';
  commSubtitle.textContent = `${currentData?.student_name || currentStudent.name || currentStudent.osis} • ${label}${relationship && relationship.toLowerCase() !== 'not set' ? ` (${relationship})` : ''}`;
  commAt.value = localDateTimeValue();
  commMethod.value = 'Phone';
  commDirection.value = 'Outgoing';
  commCategory.value = 'General';
  commOutcome.value = 'Spoke/Connected';
  commIncident.value = '';
  commNotes.value = '';
  commFollowUp.checked = false;
  followUpFields.hidden = true;
  commFollowUpAt.value = '';
  commFollowUpOwner.value = access?.email || '';
  commError.hidden = true;
  commBackdrop.hidden = false;
  setTimeout(() => commNotes.focus(), 0);
}

function closeCommunication() {
  commBackdrop.hidden = true;
  communicatingWith = null;
}

async function saveCommunication() {
  if (!currentStudent) return;
  if (!commNotes.value.trim()) {
    commError.textContent = 'Communication notes are required.';
    commError.hidden = false;
    return;
  }
  saveComm.disabled = true;
  commError.hidden = true;
  try {
    const payload = {
      student_number: currentStudent.osis,
      student_name: currentData?.student_name || currentStudent.name || '',
      contact_assoc_id: communicatingWith?.contact_assoc_id || '',
      contact_display_name: communicatingWith?.display?.name || 'General / No specific contact',
      contact_at_iso: localInputToIso(commAt.value),
      method: commMethod.value,
      direction: commDirection.value,
      category: commCategory.value,
      outcome: commOutcome.value,
      notes: commNotes.value.trim(),
      follow_up_needed: commFollowUp.checked,
      follow_up_at_iso: commFollowUp.checked ? localInputToIso(commFollowUpAt.value) : '',
      follow_up_owner_email: commFollowUp.checked ? commFollowUpOwner.value.trim() : '',
      related_incident_id: commIncident.value.trim(),
      source: PAGE_SOURCE
    };
    const r = await adminFetch('/admin/communications/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    closeCommunication();
    await loadCommunicationHistory();
  } catch (e) {
    commError.textContent = `Could not save communication: ${e.message || e}`;
    commError.hidden = false;
  } finally {
    saveComm.disabled = false;
  }
}

async function boot() {
  studentSearch.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchStudents(e.target.value), 180);
  });
  studentSearch.addEventListener('focus', () => {
    if (searchMenu.children.length) searchMenu.style.display = 'block';
  });
  document.addEventListener('click', (e) => {
    if (e.target !== studentSearch && !searchMenu.contains(e.target)) showSearchMenu([]);
  });

  $('closeEdit').addEventListener('click', closeEditor);
  $('cancelEdit').addEventListener('click', closeEditor);
  saveEdit.addEventListener('click', saveChanges);
  resetEdits.addEventListener('click', resetMyEdits);
  editBackdrop.addEventListener('click', (e) => { if (e.target === editBackdrop) closeEditor(); });

  $('logGeneralComm').addEventListener('click', () => openCommunication(null));
  $('refreshHistory').addEventListener('click', loadCommunicationHistory);
  $('closeComm').addEventListener('click', closeCommunication);
  $('cancelComm').addEventListener('click', closeCommunication);
  saveComm.addEventListener('click', saveCommunication);
  commFollowUp.addEventListener('change', () => {
    followUpFields.hidden = !commFollowUp.checked;
    if (commFollowUp.checked && !commFollowUpAt.value) {
      const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
      commFollowUpAt.value = localDateTimeValue(next);
    }
  });
  commBackdrop.addEventListener('click', (e) => { if (e.target === commBackdrop) closeCommunication(); });

  access = await getAccess();
  if (!access) {
    loginOut.textContent = 'Please sign in.';
    const gsi = await waitForGoogle();
    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: 'popup',
      callback: async (response) => {
        try {
          loginOut.textContent = 'Signing in…';
          await doLogin(response.credential);
          location.reload();
        } catch (e) {
          loginOut.textContent = `Login failed: ${e.message || e}`;
        }
      }
    });
    gsi.renderButton($('g_id_signin'), { theme: 'outline', size: 'large' });
    return;
  }

  if (!access?.can?.student_contacts) throw new Error('forbidden');
  loginCard.hidden = true;
  app.hidden = false;

  const bootUrl = new URL(location.href);
  const osis = bootUrl.searchParams.get('osis');
  if (osis) {
    await selectStudent({
      osis,
      name: bootUrl.searchParams.get('name') || '',
      email: ''
    });

    if (bootUrl.searchParams.get('action') === 'log-communication') {
      // Consume the one-time action so a refresh does not reopen the modal.
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('action');
      history.replaceState(null, '', cleanUrl);
      openCommunication(null);
    }
  }
}

boot().catch((e) => {
  loginOut.textContent = String(e?.message || e);
});

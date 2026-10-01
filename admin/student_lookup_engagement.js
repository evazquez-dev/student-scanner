/* EAGLENEST_CONFERENCE_BOOKING_PROXY_V2 */
/* EAGLENEST_STUDENT_LOOKUP_ENGAGEMENT_V1
 * Student Lookup — active required communication campaigns + Family/Student Conferences.
 * Conference Log / Book writes through the existing conference engagement endpoint.
 */
(() => {
  'use strict';

  const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
  const ADMIN_SESSION_KEY = 'ss_admin_session_sid_v1';
  const ADMIN_SESSION_LEGACY_KEY = 'teacher_att_admin_session_v1';
  const ADMIN_SESSION_HEADER = 'x-admin-session';

  const $ = (id) => document.getElementById(id);
  let loadedForOsis = '';
  let loadSequence = 0;
  let conferenceContext = null;
  let activeConference = null;
  let contacts = [];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
  }

  function storedSid() {
    try {
      return String(
        sessionStorage.getItem(ADMIN_SESSION_KEY) ||
        localStorage.getItem(ADMIN_SESSION_KEY) ||
        sessionStorage.getItem(ADMIN_SESSION_LEGACY_KEY) ||
        localStorage.getItem(ADMIN_SESSION_LEGACY_KEY) || ''
      ).trim();
    } catch { return ''; }
  }

  async function adminFetch(path, init = {}) {
    const url = /^https?:/i.test(path) ? path : new URL(String(path).replace(/^\//, ''), API_BASE).toString();
    const headers = new Headers(init.headers || {});
    const sid = storedSid();
    if (sid) headers.set(ADMIN_SESSION_HEADER, sid);
    return fetch(url, { ...init, headers, credentials:'include' });
  }

  async function api(path, init = {}) {
    const response = await adminFetch(path, init);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function currentOsis() {
    return String(new URL(location.href).searchParams.get('osis') || '').trim();
  }

  function fmtDate(value) {
    const text = String(value || '').trim();
    if (!text) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' }) : text;
  }

  function fmtDateTime(value) {
    const d = new Date(String(value || ''));
    return Number.isFinite(d.getTime()) ? d.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '—';
  }

  function localDateTimeValue(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (!Number.isFinite(d.getTime())) return '';
    const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
  }

  function engagementContactAtIso() {
    const value = String($('engagementContactAt')?.value || '').trim();
    if (!value) return '';
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : '';
  }
  // EAGLENEST_STUDENT_LOOKUP_CONFERENCE_DATETIME_V1

  function fmtTime(value) {
    const d = new Date(String(value || ''));
    return Number.isFinite(d.getTime()) ? d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : '—';
  }

  function statusLabel(value) {
    return ({
      no_outreach:'No outreach', contacted:'Contact attempted', family_reached:'Family reached',
      booked:'Booked', completed:'Completed', no_show:'No show', needs_rescheduling:'Needs rescheduling'
    })[String(value || '')] || String(value || 'Active');
  }

  function campaignCard(summary, osis) {
    const campaign = summary?.campaign || {};
    const counts = summary?.counts || {};
    const complete = Number(counts.complete || 0) > 0;
    const match = summary?.completed?.[0]?.match || null;
    const url = new URL('./student_contacts.html', location.href);
    url.searchParams.set('osis', osis);
    url.searchParams.set('action', 'log-communication');
    url.searchParams.set('source', 'student_lookup_campaign');
    if (access?.can?.communications_proxy === true) url.searchParams.set('proxy','1'); // EAGLENEST_STUDENT_LOOKUP_COMMUNICATIONS_PROXY_V1
    if (campaign.category) url.searchParams.set('category', campaign.category);
    url.searchParams.set('comm_method', 'Phone');
    url.searchParams.set('comm_direction', 'Outgoing');
    url.searchParams.set('comm_outcome', 'Spoke/Connected');
    url.searchParams.set('comm_notes', `Campaign: ${campaign.name || 'Required communication'}`);

    const courseLabels = Array.isArray(campaign.course_labels) ? campaign.course_labels.filter(Boolean) : [];
    return `<article class="listItem" data-engagement-kind="campaign">
      <div class="listTop">
        <div>
          <div class="listTitle">${esc(campaign.name || 'Required communication campaign')}</div>
          <div class="listMeta">${esc(campaign.category || 'General')} • ${esc(fmtDate(campaign.start_date))}–${esc(fmtDate(campaign.due_date))}${courseLabels.length ? ` • ${esc(courseLabels.join(', '))}` : ''}</div>
        </div>
        <span class="pill ${complete ? 'good' : 'warn'}">${complete ? 'Complete' : 'Needs communication'}</span>
      </div>
      <div class="listBody small">${complete
        ? `Qualifying communication${match?.contact_at_iso ? ` logged ${esc(fmtDateTime(match.contact_at_iso))}` : ' is already logged'}.`
        : 'This student is in scope for the active campaign and still needs a qualifying family communication.'}</div>
      <div class="inlineActions" style="margin-top:10px">
        <a class="btn secondary small" href="${esc(url.toString())}">${complete ? 'Log another communication' : 'Log communication'}</a>
      </div>
    </article>`;
  }

  function conferenceCard(row) {
    const event = row?.event || {};
    const advisor = row?.advisor || {};
    const booking = row?.booking || null;
    const latest = row?.latest_communication || null;
    const slotText = booking?.start_iso
      ? `${fmtDateTime(booking.start_iso)}${booking.staff_name ? ` with ${booking.staff_name}` : ''}`
      : '';
    const detail = booking
      ? `${statusLabel(booking.status)}${slotText ? ` • ${slotText}` : ''}`
      : latest
        ? `${latest.outcome || 'Contact logged'} • ${fmtDateTime(latest.contact_at_iso)}`
        : 'No conference outreach logged yet.';

    return `<article class="listItem" data-engagement-kind="conference" data-conference-id="${esc(event.event_id)}">
      <div class="listTop">
        <div>
          <div class="listTitle">${esc(event.title || 'Family & Student Conference')}</div>
          <div class="listMeta">${esc(fmtDate(event.event_date))}${advisor.advisor_name || advisor.advisor_email ? ` • Advisor: ${esc(advisor.advisor_name || advisor.advisor_email)}` : ''}${advisor.assoc_section ? ` • ${esc(advisor.assoc_section)}` : ''}</div>
        </div>
        <span class="pill ${row.status === 'booked' || row.status === 'completed' ? 'good' : row.status === 'needs_rescheduling' || row.status === 'no_show' ? 'warn' : 'info'}">${esc(statusLabel(row.status))}</span>
      </div>
      <div class="listBody small">${esc(detail)}</div>
      ${row.booking_proxy_advisor_scoped ? '<div class="listMeta" style="margin-top:6px">Student Lookup proxy booking is restricted to this student’s advisor slots.</div>' : ''}
      ${row.action_reason ? `<div class="listMeta" style="margin-top:6px">${esc(row.action_reason)}</div>` : ''}
      <div class="inlineActions" style="margin-top:10px">
        ${row.can_log_book ? `<button class="btn primary small" type="button" data-engagement-logbook="${esc(event.event_id)}">Log / Book</button>` : ''}
        <a class="btn secondary small" href="./student_contacts.html?osis=${encodeURIComponent(currentOsis())}${access?.can?.communications_proxy===true?'&proxy=1':''}">Student contacts</a>
      </div>
    </article>`;
  }

  function render(campaignData, conferenceData, osis) {
    const host = $('engagementList');
    const meta = $('engagementMeta');
    const count = $('engagementCount');
    if (!host || !meta) return;

    const campaigns = (Array.isArray(campaignData?.campaigns) ? campaignData.campaigns : [])
      .filter((row) => Number(row?.counts?.expected || 0) > 0);
    const conferences = Array.isArray(conferenceData?.conferences) ? conferenceData.conferences : [];
    conferenceContext = conferenceData;
    const total = campaigns.length + conferences.length;
    if (count) count.textContent = total ? String(total) : '';
    meta.textContent = total
      ? `${campaigns.length} active campaign${campaigns.length === 1 ? '' : 's'} • ${conferences.length} active conference event${conferences.length === 1 ? '' : 's'}`
      : 'No active campaigns or conference events apply to this student.';

    if (!total) {
      host.innerHTML = '<div class="emptyState">No active campaign or Family & Student Conference item applies to this student right now.</div>';
      return;
    }

    const sections = [];
    if (conferences.length) {
      sections.push(`<div class="contextBox small"><strong>Family & Student Conferences</strong><div class="muted" style="margin-top:4px">Use Log / Book after speaking with the family. Proxy booking in Student Lookup is advisor-scoped.</div></div>`);
      sections.push(...conferences.map(conferenceCard));
    }
    if (campaigns.length) {
      sections.push(`<div class="contextBox small" style="margin-top:12px"><strong>Required communication campaigns</strong><div class="muted" style="margin-top:4px">Only campaigns that include this student are shown.${access?.can?.communications_proxy===true?' Family Communications Proxy is active; logs you create here can fulfill another staff member’s responsibility and remain attributed to you.':''}</div></div>`);
      sections.push(...campaigns.map((row) => campaignCard(row, osis)));
    }
    host.innerHTML = sections.join('');
    host.querySelectorAll('[data-engagement-logbook]').forEach((button) => {
      button.addEventListener('click', () => openLogBook(button.dataset.engagementLogbook));
    });
  }

  async function loadEngagement(force = false) {
    const osis = currentOsis();
    if (!osis) return;
    if (!force && loadedForOsis === osis && conferenceContext) return;
    const seq = ++loadSequence;
    const host = $('engagementList');
    const meta = $('engagementMeta');
    if (host) host.innerHTML = '<div class="loadingState">Loading active campaigns and conference events…</div>';
    if (meta) meta.textContent = 'Loading…';
    try {
      const [campaignData, conferenceData] = await Promise.all([
        api(`/admin/required_communications/coverage?student_number=${encodeURIComponent(osis)}`),
        api(`/admin/conferences/student_context?student_number=${encodeURIComponent(osis)}`)
      ]);
      if (seq !== loadSequence || currentOsis() !== osis) return;
      loadedForOsis = osis;
      render(campaignData, conferenceData, osis);
    } catch (error) {
      if (seq !== loadSequence) return;
      if (meta) meta.textContent = 'Could not load campaigns / conferences.';
      if (host) host.innerHTML = `<div class="errorState">Could not load campaigns / conferences: ${esc(error?.message || error)}</div>`;
    }
  }

  async function loadContacts(osis) {
    contacts = [];
    const select = $('engagementContactSelect');
    select.replaceChildren(new Option('No specific contact', ''));
    try {
      const data = await api(`/admin/contacts/student?student_number=${encodeURIComponent(osis)}`);
      contacts = Array.isArray(data.contacts) ? data.contacts : [];
      contacts.forEach((contact, index) => {
        const display = contact?.display || {};
        const source = contact?.source || {};
        const name = display.name || source.display_name || source.name || 'Unnamed contact';
        const relationship = display.relationship || source.relationship || '';
        select.appendChild(new Option(`${name}${relationship ? ` — ${relationship}` : ''}`, String(index)));
      });
    } catch (error) {
      $('engagementModalStatus').textContent = `Contacts could not be loaded: ${error.message}`;
    }
  }

  function selectedContact() {
    const index = Number($('engagementContactSelect').value);
    return Number.isInteger(index) && index >= 0 ? contacts[index] || null : null;
  }

  function populateSlots(row) {
    const select = $('engagementSlotSelect');
    select.replaceChildren(new Option('Log communication only — do not book yet', ''));
    const slots = Array.isArray(row?.open_slots) ? row.open_slots.slice() : [];
    slots.sort((a, b) => String(a.start_iso || '').localeCompare(String(b.start_iso || '')));
    for (const slot of slots) {
      const staff = slot.staff_name || slot.staff_email || 'Advisor';
      const location = slot.location ? ` • ${slot.location}` : '';
      select.appendChild(new Option(`${fmtTime(slot.start_iso)} – ${fmtTime(slot.end_iso)} • ${staff}${location}`, slot.slot_id));
    }
  }

  async function openLogBook(eventId) {
    const row = (conferenceContext?.conferences || []).find((item) => item?.event?.event_id === eventId);
    const osis = currentOsis();
    if (!row || !osis || !row.can_log_book) return;
    activeConference = row;
    contacts = [];
    $('engagementModalTitle').textContent = 'Conference Log / Book';
    $('engagementModalStudent').textContent = `${$('studentName')?.textContent || osis} • ${row.event.title || 'Conference'} • Advisor: ${row.advisor?.advisor_name || row.advisor?.advisor_email || 'Not assigned'}`;
    $('engagementMethod').value = 'Phone';
    $('engagementOutcome').value = 'Spoke/Connected';
    $('engagementContactAt').value = localDateTimeValue();
    $('engagementNotes').value = '';
    $('engagementModalStatus').textContent = '';
    populateSlots(row);
    $('engagementBackdrop').hidden = false;
    await loadContacts(osis);
  }

  function closeModal() {
    $('engagementBackdrop').hidden = true;
    activeConference = null;
    contacts = [];
  }

  function submissionId() {
    try { if (globalThis.crypto?.randomUUID) return `student-lookup-conference:${crypto.randomUUID()}`; } catch {}
    return `student-lookup-conference:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  }

  async function saveLogBook() {
    const row = activeConference;
    const osis = currentOsis();
    if (!row || !osis) return;
    const button = $('saveEngagementLogBook');
    const status = $('engagementModalStatus');
    const contact = selectedContact();
    const display = contact?.display || {};
    const source = contact?.source || {};
    const slotId = $('engagementSlotSelect').value;
    const contactAtIso = engagementContactAtIso();
    if (!contactAtIso) {
      status.textContent = 'Choose a valid communication date and time.';
      $('engagementContactAt')?.focus();
      return;
    }
    button.disabled = true;
    status.textContent = slotId ? 'Logging family contact and booking advisor slot…' : 'Logging family contact…';
    try {
      const result = await api('/admin/conferences/engagement/log', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({
          source_context:'student_lookup',
          event_id:row.event.event_id,
          student_number:osis,
          submission_id:submissionId(),
          contact_at_iso:contactAtIso,
          method:$('engagementMethod').value,
          outcome:$('engagementOutcome').value,
          notes:$('engagementNotes').value.trim(),
          follow_up_needed:$('engagementOutcome').value === 'Follow-up Needed',
          slot_id:slotId,
          contact_assoc_id:contact?.contact_assoc_id || '',
          person_id:contact?.person_id || source.person_id || '',
          contact_display_name:display.name || source.display_name || source.name || '',
          contact_relationship:display.relationship || source.relationship || '',
          contact_phone:display.phone || source.phone || '',
          contact_email:display.email || source.email || ''
        })
      });
      if (result.booking_error) {
        status.textContent = `Communication was logged, but the appointment was not booked: ${result.booking_error}`;
        await loadEngagement(true);
        return;
      }
      closeModal();
      await loadEngagement(true);
    } catch (error) {
      status.textContent = `Could not save: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  function bind() {
    $('tabEngagement')?.addEventListener('click', () => loadEngagement(false));
    $('refreshEngagementBtn')?.addEventListener('click', () => loadEngagement(true));
    $('closeEngagementLogBook')?.addEventListener('click', closeModal);
    $('cancelEngagementLogBook')?.addEventListener('click', closeModal);
    $('saveEngagementLogBook')?.addEventListener('click', saveLogBook);
    $('engagementBackdrop')?.addEventListener('click', (event) => {
      if (event.target === $('engagementBackdrop')) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('engagementBackdrop')?.hidden) closeModal();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
})();

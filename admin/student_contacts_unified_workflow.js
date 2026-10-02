/* EAGLENEST_STUDENT_CONTACTS_UNIFIED_WORKFLOW_V1
 * Collapses family-contact communication + meeting scheduling into one lightweight flow.
 * Extends Category with student-scoped required campaigns and conference events.
 */
(() => {
  'use strict';

  const CONTEXT_PREFIX = '__eaglenest_context__:';
  let contextCache = { osis: '', campaigns: [], conferences: [], loaded: false };
  let contextLoadSeq = 0;

  function el(id) { return document.getElementById(id); }
  function text(value) { return String(value == null ? '' : value).trim(); }
  function isFamilyContact() { return !!communicatingWith && communicatingWith?.direct_student !== true; }

  function statusLabel(value) {
    return ({
      no_outreach: 'No outreach',
      contacted: 'Contacted',
      family_reached: 'Family reached',
      booked: 'Booked',
      completed: 'Completed',
      no_show: 'No show',
      needs_rescheduling: 'Needs rescheduling'
    })[text(value)] || text(value) || 'Active';
  }

  function currentStudentName() {
    return text(currentData?.student_name || currentStudent?.name || currentStudent?.osis || 'Student') || 'Student';
  }

  function ensureUnifiedUi() {
    if (el('commScheduleMeeting')) return;

    const notesLabel = commNotes?.closest?.('label');
    if (!notesLabel) return;

    const meetingWrap = document.createElement('div');
    meetingWrap.id = 'commMeetingWorkflow';
    meetingWrap.innerHTML = `
      <label id="commScheduleRow" class="checkRow" hidden>
        <input id="commScheduleMeeting" type="checkbox">
        <span>Schedule a meeting from this communication</span>
      </label>
      <div id="commMeetingFields" hidden>
        <div class="fieldGrid" style="margin-top:10px">
          <label>Meeting starts<input id="commMeetingStart" class="input" type="datetime-local"></label>
          <label>Duration<select id="commMeetingDuration" class="input"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">90 minutes</option><option value="120">2 hours</option></select></label>
          <label>Meeting with / host email<input id="commMeetingHostEmail" class="input" type="email"></label>
          <label>Location / room<input id="commMeetingLocation" class="input" placeholder="Room 207, Main Office…"></label>
        </div>
        <label class="noteLabel">Purpose / calendar title<input id="commMeetingPurpose" class="input" maxlength="240" placeholder="Family meeting"></label>
        <label class="noteLabel">Visitor Desk note (optional)<textarea id="commMeetingDeskNotes" class="input textarea" maxlength="800" placeholder="Only information the front desk needs for arrival/check-in."></textarea></label>
        <div id="commMeetingHint" class="muted small" style="margin-top:6px"></div>
      </div>`;
    notesLabel.insertAdjacentElement('afterend', meetingWrap);

    const categoryLabel = commCategory?.closest?.('label');
    if (categoryLabel && !el('commContextHint')) {
      const hint = document.createElement('span');
      hint.id = 'commContextHint';
      hint.className = 'muted small';
      hint.style.display = 'block';
      hint.style.marginTop = '4px';
      categoryLabel.appendChild(hint);
    }

    el('commScheduleMeeting')?.addEventListener('change', updateMeetingVisibility);
    commCategory?.addEventListener('change', () => {
      updateContextHint();
      applyContextToMeeting();
    });
  }

  function processContactButtons(root = document) {
    root.querySelectorAll?.('.contactCard:not(.directStudentContactCard)').forEach((card) => {
      const schedule = card.querySelector('.scheduleBtn');
      if (schedule) schedule.hidden = true;
      const comm = card.querySelector('.commBtn');
      if (comm) comm.textContent = 'Log / Schedule';
    });
  }

  function roundedNextMeetingTime() {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15, 0, 0);
    return typeof localDateTimeValue === 'function' ? localDateTimeValue(next) : '';
  }

  function resetMeetingFields() {
    const row = el('commScheduleRow');
    const checkbox = el('commScheduleMeeting');
    const fields = el('commMeetingFields');
    if (!row || !checkbox || !fields) return;
    const family = isFamilyContact();
    row.hidden = !family;
    checkbox.disabled = false;
    checkbox.checked = false;
    fields.hidden = true;
    el('commMeetingStart').value = roundedNextMeetingTime();
    el('commMeetingDuration').value = '30';
    el('commMeetingHostEmail').value = text(access?.email);
    el('commMeetingLocation').value = '';
    el('commMeetingPurpose').value = `Family meeting — ${currentStudentName()}`;
    el('commMeetingDeskNotes').value = '';
    el('commMeetingHint').textContent = family
      ? 'Optional. The communication will save normally even when no meeting is scheduled.'
      : '';
  }

  function selectedContext() {
    const option = commCategory?.selectedOptions?.[0];
    const value = text(option?.value);
    if (!value.startsWith(CONTEXT_PREFIX)) return { kind: 'category', category: value };
    const raw = value.slice(CONTEXT_PREFIX.length);
    const split = raw.indexOf(':');
    const kind = split >= 0 ? raw.slice(0, split) : raw;
    const id = split >= 0 ? raw.slice(split + 1) : '';
    if (kind === 'campaign') {
      const summary = contextCache.campaigns.find((row) => text(row?.campaign?.campaign_id) === id) || null;
      return { kind, id, summary, campaign: summary?.campaign || null, category: text(summary?.campaign?.category) || 'General' };
    }
    if (kind === 'conference') {
      const conference = contextCache.conferences.find((row) => text(row?.event?.event_id) === id) || null;
      return { kind, id, conference, category: 'General' };
    }
    return { kind: 'category', category: value };
  }

  function updateContextHint() {
    const hint = el('commContextHint');
    if (!hint) return;
    const ctx = selectedContext();
    if (ctx.kind === 'campaign') {
      const campaign = ctx.campaign || {};
      hint.textContent = `Linked to required campaign “${text(campaign.name) || 'Required communication'}”; stored under its configured ${ctx.category} category.`;
    } else if (ctx.kind === 'conference') {
      const event = ctx.conference?.event || {};
      hint.textContent = `Linked directly to ${text(event.title) || 'Student & Family Conferences'} outreach history.`;
    } else {
      hint.textContent = '';
    }
  }

  function applyContextToMeeting() {
    const checkbox = el('commScheduleMeeting');
    const row = el('commScheduleRow');
    if (!checkbox || !row || row.hidden) return;
    const ctx = selectedContext();
    checkbox.disabled = false;

    if (ctx.kind === 'conference') {
      const conference = ctx.conference || {};
      if (conference.status === 'booked' || conference.status === 'completed') {
        checkbox.checked = false;
        checkbox.disabled = true;
        el('commMeetingFields').hidden = true;
        el('commMeetingHint').textContent = 'This conference already has a booked/completed appointment. You can still log this communication to the conference, but EagleNEST will not create another alternate conference meeting.';
        return;
      }
      const advisorEmail = text(conference?.advisor?.advisor_email);
      if (advisorEmail) el('commMeetingHostEmail').value = advisorEmail;
      const eventTitle = text(conference?.event?.title) || 'Student & Family Conference';
      el('commMeetingPurpose').value = `${eventTitle} — ${currentStudentName()}`;
      el('commMeetingHint').textContent = 'If scheduled, this becomes the alternate meeting for the selected conference event and counts in conference progress.';
    } else if (ctx.kind === 'campaign') {
      const name = text(ctx.campaign?.name) || 'Required communication';
      el('commMeetingPurpose').value = `${name} — ${currentStudentName()}`;
      el('commMeetingHint').textContent = 'The communication is linked to the campaign. The meeting remains a normal EagleNEST meeting.';
    } else {
      el('commMeetingHint').textContent = 'The meeting remains a normal EagleNEST visitor/meeting appointment.';
    }
  }

  function updateMeetingVisibility() {
    const checkbox = el('commScheduleMeeting');
    const fields = el('commMeetingFields');
    if (!checkbox || !fields) return;
    fields.hidden = !checkbox.checked;
    if (checkbox.checked) {
      if (!el('commMeetingStart').value) el('commMeetingStart').value = roundedNextMeetingTime();
      if (!el('commMeetingHostEmail').value) el('commMeetingHostEmail').value = text(access?.email);
      if (['No Answer', 'Voicemail', 'Left Voicemail'].includes(commOutcome?.value)) commOutcome.value = 'Spoke/Connected';
      applyContextToMeeting();
    }
  }

  function appendStandardCategories(group) {
    const categories = Array.isArray(communicationCategories) && communicationCategories.length
      ? communicationCategories
      : (Array.isArray(DEFAULT_COMMUNICATION_CATEGORIES) ? DEFAULT_COMMUNICATION_CATEGORIES : []);
    for (const category of categories) group.appendChild(new Option(category, category));
  }

  function requestedContextValue() {
    const params = new URLSearchParams(location.search);
    const explicit = text(params.get('context'));
    if (explicit.startsWith('campaign:')) return `${CONTEXT_PREFIX}${explicit}`;
    if (explicit.startsWith('conference:')) return `${CONTEXT_PREFIX}${explicit}`;

    if (text(PAGE_SOURCE) === 'student_lookup_campaign') {
      const note = text(PAGE_PREFILL_COMM_NOTES);
      const match = contextCache.campaigns.find((row) => {
        const name = text(row?.campaign?.name);
        return name && note.toLowerCase().includes(name.toLowerCase());
      });
      if (match?.campaign?.campaign_id) return `${CONTEXT_PREFIX}campaign:${match.campaign.campaign_id}`;
    }
    return '';
  }

  function renderContextOptions() {
    if (!commCategory) return;
    const previous = text(commCategory.value);
    commCategory.replaceChildren();

    const categories = document.createElement('optgroup');
    categories.label = 'Categories';
    appendStandardCategories(categories);
    commCategory.appendChild(categories);

    if (contextCache.campaigns.length) {
      const campaigns = document.createElement('optgroup');
      campaigns.label = 'Required communication campaigns';
      for (const summary of contextCache.campaigns) {
        const campaign = summary?.campaign || {};
        const id = text(campaign.campaign_id);
        if (!id) continue;
        const complete = Number(summary?.counts?.complete || 0) > 0;
        const label = `${text(campaign.name) || 'Required communication'} — ${text(campaign.category) || 'General'}${complete ? ' [complete]' : ''}`;
        campaigns.appendChild(new Option(label, `${CONTEXT_PREFIX}campaign:${id}`));
      }
      if (campaigns.children.length) commCategory.appendChild(campaigns);
    }

    if (contextCache.conferences.length) {
      const conferences = document.createElement('optgroup');
      conferences.label = 'Student & Family Conferences';
      for (const row of contextCache.conferences) {
        const event = row?.event || {};
        const id = text(event.event_id);
        if (!id) continue;
        const date = text(event.event_date);
        const label = `${text(event.title) || 'Conference'}${date ? ` — ${date}` : ''} [${statusLabel(row?.status)}]`;
        conferences.appendChild(new Option(label, `${CONTEXT_PREFIX}conference:${id}`));
      }
      if (conferences.children.length) commCategory.appendChild(conferences);
    }

    const requested = requestedContextValue();
    if (requested && [...commCategory.options].some((option) => option.value === requested)) {
      commCategory.value = requested;
    } else if (previous && [...commCategory.options].some((option) => option.value === previous)) {
      commCategory.value = previous;
    } else {
      const fallback = communicationCategories?.includes?.('General') ? 'General' : communicationCategories?.[0];
      if (fallback) commCategory.value = fallback;
    }
    updateContextHint();
    applyContextToMeeting();
  }

  async function loadCommunicationContexts() {
    if (!isFamilyContact() || !currentStudent?.osis) return;
    const osis = text(currentStudent.osis);
    const seq = ++contextLoadSeq;
    if (contextCache.loaded && contextCache.osis === osis) {
      renderContextOptions();
      return;
    }

    const hint = el('commContextHint');
    if (hint) hint.textContent = 'Loading campaigns and conference events for this student…';

    const [campaignResult, conferenceResult] = await Promise.allSettled([
      adminFetch(`/admin/required_communications/coverage?student_number=${encodeURIComponent(osis)}`).then(async (r) => ({ response: r, data: await r.json().catch(() => ({})) })),
      adminFetch(`/admin/conferences/student_context?student_number=${encodeURIComponent(osis)}`).then(async (r) => ({ response: r, data: await r.json().catch(() => ({})) }))
    ]);
    if (seq !== contextLoadSeq || text(currentStudent?.osis) !== osis) return;

    const campaignPayload = campaignResult.status === 'fulfilled' ? campaignResult.value : null;
    const conferencePayload = conferenceResult.status === 'fulfilled' ? conferenceResult.value : null;
    const campaigns = campaignPayload?.response?.ok && campaignPayload?.data?.ok && Array.isArray(campaignPayload.data.campaigns)
      ? campaignPayload.data.campaigns
      : [];
    const conferences = conferencePayload?.response?.ok && conferencePayload?.data?.ok && Array.isArray(conferencePayload.data.conferences)
      ? conferencePayload.data.conferences.filter((row) => row?.requirement?.configured === true && row?.can_log_book === true)
      : [];

    contextCache = { osis, campaigns, conferences, loaded: true };
    renderContextOptions();
  }

  function onCommunicationOpened() {
    ensureUnifiedUi();
    resetMeetingFields();
    if (isFamilyContact()) {
      void loadCommunicationContexts();
    } else {
      contextCache = { osis: '', campaigns: [], conferences: [], loaded: false };
      renderContextOptions();
    }
  }

  function contactFields() {
    const direct = communicatingWith?.direct_student === true;
    const display = communicatingWith?.display || {};
    const source = communicatingWith?.source || {};
    return {
      contact_assoc_id: direct ? '' : text(communicatingWith?.contact_assoc_id),
      contact_display_name: direct
        ? `Student — ${currentStudentName()}`
        : (text(display.name) || 'General / No specific contact'),
      contact_relationship: direct ? 'Student' : text(display.relationship),
      contact_phone: direct ? '' : text(display.phone),
      contact_email: direct ? '' : text(display.email),
      person_id: text(communicatingWith?.person_id || source.person_id),
      contact_snapshot: direct
        ? { direct_student: true }
        : (communicatingWith ? {
            contact_assoc_id: text(communicatingWith?.contact_assoc_id),
            person_id: text(communicatingWith?.person_id || source.person_id),
            display: communicatingWith?.display || {},
            source: communicatingWith?.source || {},
            my_overrides: communicatingWith?.my_overrides || {}
          } : { general_contact: true })
    };
  }

  function communicationNotesWithMeeting(notes, shouldSchedule) {
    const base = text(notes);
    if (!shouldSchedule) return base;
    const raw = el('commMeetingStart')?.value;
    const display = raw ? raw.replace('T', ' ') : '';
    return `${base}${base ? '\n\n' : ''}Meeting scheduled${display ? ` for ${display}` : ''}.`;
  }

  async function saveCommunicationForContext(ctx, notes) {
    const contact = contactFields();
    const submissionId = communicationSubmissionId || (communicationSubmissionId = makeClientSubmissionId('communication'));
    if (ctx.kind === 'conference') {
      const body = {
        source_context: 'student_contacts',
        event_id: ctx.id,
        student_number: text(currentStudent?.osis),
        submission_id: submissionId,
        contact_at_iso: localInputToIso(commAt.value),
        method: commMethod.value,
        direction: commDirection.value,
        outcome: commOutcome.value,
        notes,
        follow_up_needed: commFollowUp.checked,
        follow_up_at_iso: commFollowUp.checked ? localInputToIso(commFollowUpAt.value) : '',
        follow_up_owner_email: commFollowUp.checked ? text(commFollowUpOwner.value) : '',
        ...contact
      };
      const r = await adminFetch('/admin/conferences/engagement/log', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      return j;
    }

    const source = ctx.kind === 'campaign' ? `required_communication:${ctx.id}` : PAGE_SOURCE;
    const payload = {
      submission_id: submissionId,
      student_number: text(currentStudent?.osis),
      student_name: currentStudentName(),
      ...contact,
      contact_at_iso: localInputToIso(commAt.value),
      method: commMethod.value,
      direction: commDirection.value,
      category: ctx.kind === 'campaign' ? ctx.category : commCategory.value,
      outcome: commOutcome.value,
      notes,
      follow_up_needed: commFollowUp.checked,
      follow_up_at_iso: commFollowUp.checked ? localInputToIso(commFollowUpAt.value) : '',
      follow_up_owner_email: commFollowUp.checked ? text(commFollowUpOwner.value) : '',
      related_incident_id: text(commIncident.value),
      source,
      proxy_mode: PAGE_PROXY_MODE && access?.can?.communications_proxy === true
    };
    const r = await adminFetch('/admin/communications/create', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }

  async function createMeetingFromCommunication(ctx) {
    const startIso = localInputToIso(el('commMeetingStart').value);
    const startMs = Date.parse(startIso);
    const duration = Math.max(15, Number(el('commMeetingDuration').value || 30));
    const hostEmail = text(el('commMeetingHostEmail').value);
    if (!Number.isFinite(startMs) || !hostEmail) throw new Error('Meeting date/time and host email are required.');

    const display = communicatingWith?.display || {};
    const source = communicatingWith?.source || {};
    const name = splitVisitorName_(text(display.name || source.display_name || source.name));
    if (!name.first || !name.last) throw new Error('This contact needs a first and last name before a meeting can be scheduled.');

    const payload = {
      visitor_first_name: name.first,
      visitor_last_name: name.last,
      visitor_phone: text(display.phone || source.phone),
      visitor_email: text(display.email || source.email),
      relationship: text(display.relationship || source.relationship),
      organization: '',
      student_number: text(currentStudent?.osis),
      student_name: currentStudentName(),
      contact_assoc_id: text(communicatingWith?.contact_assoc_id),
      contact_snapshot: {
        contact_assoc_id: text(communicatingWith?.contact_assoc_id),
        person_id: text(communicatingWith?.person_id || source.person_id),
        display: communicatingWith?.display || {},
        source: communicatingWith?.source || {},
        my_overrides: communicatingWith?.my_overrides || {}
      },
      start_iso: startIso,
      end_iso: new Date(startMs + duration * 60000).toISOString(),
      host_email: hostEmail,
      host_name: '',
      location: text(el('commMeetingLocation').value),
      purpose: text(el('commMeetingPurpose').value) || 'Family meeting',
      desk_notes: text(el('commMeetingDeskNotes').value),
      conference_event_id: ctx.kind === 'conference' ? ctx.id : '',
      source: ctx.kind === 'campaign' ? `required_communication:${ctx.id}`.slice(0, 80) : 'student_contacts'
    };
    const r = await adminFetch('/admin/visitor_appointments/create', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appointment: payload })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j.appointment || null;
  }

  async function saveUnified(e) {
    const family = isFamilyContact();
    const ctx = selectedContext();
    const schedule = family && el('commScheduleMeeting')?.checked === true;
    const customContext = ctx.kind === 'campaign' || ctx.kind === 'conference';
    if (!schedule && !customContext) return; // Let the existing lightweight save handler run unchanged.

    e.preventDefault();
    e.stopImmediatePropagation();

    if (!text(commNotes.value)) {
      commError.textContent = 'Communication notes are required.';
      commError.hidden = false;
      return;
    }
    if (schedule && !family) {
      commError.textContent = 'Choose a specific family contact before scheduling a meeting from this communication.';
      commError.hidden = false;
      return;
    }
    if (schedule && ctx.kind === 'conference' && ['booked', 'completed'].includes(text(ctx.conference?.status))) {
      commError.textContent = 'This conference already has a booked/completed appointment. Save the communication without scheduling another meeting.';
      commError.hidden = false;
      return;
    }

    saveComm.disabled = true;
    commError.hidden = true;
    try {
      const notes = communicationNotesWithMeeting(commNotes.value, schedule);
      await saveCommunicationForContext(ctx, notes);
      let appointment = null;
      if (schedule) {
        try {
          appointment = await createMeetingFromCommunication(ctx);
        } catch (meetingError) {
          commError.textContent = `Communication saved, but the meeting could not be scheduled: ${meetingError?.message || meetingError}`;
          commError.hidden = false;
          await loadCommunicationHistory();
          return;
        }
      }

      closeCommunication();
      await loadCommunicationHistory();
      if (schedule) await loadMyAppointments_();
      if (searchStatus) {
        if (schedule && appointment) searchStatus.textContent = `Communication logged and meeting scheduled for ${fmtAppointment_(appointment)}.`;
        else if (ctx.kind === 'campaign') searchStatus.textContent = `Communication logged to ${text(ctx.campaign?.name) || 'the selected campaign'}.`;
        else if (ctx.kind === 'conference') searchStatus.textContent = `Communication logged to ${text(ctx.conference?.event?.title) || 'the selected conference event'}.`;
      }
    } catch (error) {
      commError.textContent = `Could not save communication: ${error?.message || error}`;
      commError.hidden = false;
    } finally {
      saveComm.disabled = false;
    }
  }

  ensureUnifiedUi();
  processContactButtons();

  new MutationObserver((mutations) => {
    processContactButtons();
    for (const mutation of mutations) {
      if (mutation.target === commBackdrop && mutation.attributeName === 'hidden' && !commBackdrop.hidden) {
        onCommunicationOpened();
      }
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

  document.addEventListener('click', (event) => {
    const schedule = event.target.closest?.('.scheduleBtn');
    if (!schedule) return;
    const card = schedule.closest('.contactCard');
    if (!card || card.classList.contains('directStudentContactCard')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    card.querySelector('.commBtn')?.click();
  }, true);

  saveComm?.addEventListener('click', saveUnified, true);

  if (!commBackdrop?.hidden) onCommunicationOpened();
})();

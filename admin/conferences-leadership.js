/* EAGLENEST_CONFERENCE_LEADERSHIP_SUMMARY_V1
 * Leadership reporting layer for required advisee outreach + conference bookings.
 * Backend-authorized scopes only. Reporting visibility never grants write authority.
 */
(() => {
  'use strict';

  let reportingScopeKey = '';

  window.EagleNESTConferenceReporting = Object.freeze({
    currentScope: () => reportingScopeKey
  });

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function isAdmin(){
    return access?.can?.conference_event_admin === true;
  }

  function isBookingProxy(){
    return !isAdmin() && access?.can?.conference_booking_proxy === true;
  }

  function scopeType(req = bundle?.requirement){
    return String(req?.scope?.type || req?.scope?.key || 'my').split(':')[0].toLowerCase();
  }

  function isLeadershipView(req = bundle?.requirement){
    return ['grade','department'].includes(scopeType(req));
  }

  function canActOnRow(row, req = bundle?.requirement){
    return req?.can_act_all === true || row?.can_manage === true ||
      String(row?.advisor_email || '').toLowerCase() === String(access?.email || '').toLowerCase();
  }

  function injectScopePicker(){
    if(document.getElementById('requirementReportingScope')) return;
    const toolbar = document.querySelector('#conferenceRequirementCard .sectionHead .toolbar');
    if(!toolbar) return;
    const label = document.createElement('label');
    label.id = 'requirementReportingScope';
    label.className = 'conferenceReportingScope';
    label.hidden = true;
    label.innerHTML = '<span>View</span><select id="requirementReportingScopeSelect"></select>';
    toolbar.insertBefore(label, toolbar.firstChild);

    document.getElementById('requirementReportingScopeSelect').addEventListener('change', async (event) => {
      reportingScopeKey = String(event.target.value || '');
      const eventId = String(bundle?.event?.event_id || '');
      if(!eventId) return;
      setStatus(`Loading ${event.target.selectedOptions?.[0]?.textContent || 'conference'} progress…`);
      await loadBundle(eventId);
    });
  }

  function renderScopePicker(req){
    injectScopePicker();
    const wrap = document.getElementById('requirementReportingScope');
    const select = document.getElementById('requirementReportingScopeSelect');
    if(!wrap || !select) return;

    const scopes = Array.isArray(req?.available_scopes) ? req.available_scopes : [];
    reportingScopeKey = String(req?.scope?.key || reportingScopeKey || '');

    select.replaceChildren();
    for(const scope of scopes){
      select.appendChild(new Option(scope.label || scope.key || 'View', scope.key || ''));
    }
    if(reportingScopeKey && [...select.options].some((option) => option.value === reportingScopeKey)){
      select.value = reportingScopeKey;
    }
    wrap.hidden = scopes.length <= 1;
  }

  function renderLeadershipHead(req){
    const heading = document.getElementById('requirementHeading');
    const subhead = document.getElementById('requirementSubhead');
    if(!heading || !subhead || !req?.configured) return;

    const type = scopeType(req);
    const label = String(req?.scope?.label || 'Conference');
    if(type === 'school' && isAdmin()){
      heading.textContent = 'Whole school conference progress';
      subhead.textContent = 'Whole-school summary of required advisee outreach and conference booking progress across participating advisors.';
      return;
    }
    if(isLeadershipView(req)){
      heading.textContent = `${label} conference progress`;
      subhead.textContent = `Leadership summary for ${label}. Communication and booking progress for other advisors is read-only; your own advisees remain actionable.`;
      return;
    }
    if(type === 'school' && isBookingProxy()){
      heading.textContent = 'Conference booking desk';
    }
  }

  function renderAdvisorProgress(req){
    const wrap = document.getElementById('requirementAdminProgress');
    const table = wrap?.querySelector('table');
    const body = document.getElementById('requirementAdvisorBody');
    if(!wrap || !table || !body) return;

    const type = scopeType(req);
    const shouldShow = type !== 'my' || req?.can_act_all === true;
    wrap.hidden = !shouldShow;
    if(!shouldShow) return;

    const head = table.querySelector('thead');
    if(head){
      head.innerHTML = '<tr><th>Advisor</th><th>Required</th><th>Contacted</th><th>Family reached</th><th>Booked</th><th>Completed</th><th>Still need booking</th></tr>';
    }

    const rows = Array.isArray(req?.advisor_progress) ? req.advisor_progress : [];
    body.innerHTML = rows.length ? rows.map((row) => `<tr>
      <td><strong>${esc(row.advisor_name || row.advisor_email)}</strong><div class="muted small">${esc(row.advisor_email || '')}</div></td>
      <td>${Number(row.required || 0)}</td>
      <td>${Number(row.contacted || 0)} <span class="muted small">(${Number(row.contact_percent || 0)}%)</span></td>
      <td>${Number(row.family_reached || 0)}</td>
      <td>${Number(row.booked || 0)}</td>
      <td>${Number(row.completed || 0)}</td>
      <td><strong>${Number(row.needs_booking || 0)}</strong></td>
    </tr>`).join('') : '<tr><td colspan="7" class="muted">No advisor progress yet.</td></tr>';
  }

  function renderSnapshotScope(req){
    if(!req?.configured) return;
    const note = document.getElementById('requirementSnapshotNote');
    const title = document.getElementById('requirementRosterTitle');
    const summary = req?.summary || {};
    const scope = req?.scope || {};
    if(note){
      const full = Number(req?.full_required_count || summary.required || 0);
      const shown = Number(summary.required || 0);
      const advisors = Array.isArray(req?.advisor_progress) ? req.advisor_progress.length : 0;
      note.textContent = `Scope: ${scope.label || 'My Advisees'} • showing ${shown} of ${full} required students • ${advisors} advisor${advisors === 1 ? '' : 's'} in this view.`;
    }
    if(title && scopeType(req) !== 'my'){
      title.textContent = `${scope.label || 'Required'} students (${Number(summary.required || 0)})`;
    }
  }

  function enforceRowActions(req){
    for(const row of Array.isArray(req?.students) ? req.students : []){
      if(canActOnRow(row, req)) continue;
      const tr = document.querySelector(`[data-required-student="${CSS.escape(String(row.student_number || ''))}"]`);
      if(!tr) continue;
      const button = tr.querySelector('[data-req-action="contact"]');
      if(button){
        const label = document.createElement('span');
        label.className = 'muted small conferenceLeadershipReadOnly';
        label.textContent = 'Leadership view';
        button.replaceWith(label);
      }
    }
  }

  function renderReportOnlyState(){
    const reportOnly = bundle?.viewer?.report_only === true;
    const bookingTools = document.getElementById('conferenceBookingTools');
    const schedule = document.getElementById('conferenceScheduleCard');
    if(bookingTools) bookingTools.hidden = reportOnly;
    if(schedule) schedule.hidden = reportOnly;
  }

  function renderLeadership(){
    injectScopePicker();
    const req = bundle?.requirement;
    renderReportOnlyState();
    if(!req) return;
    renderScopePicker(req);
    renderLeadershipHead(req);
    renderAdvisorProgress(req);
    renderSnapshotScope(req);
    enforceRowActions(req);
  }

  const baseRenderBundle = renderBundle;
  renderBundle = function(){
    baseRenderBundle();
    renderLeadership();
  };

  injectScopePicker();

  const timer = setInterval(() => {
    if(typeof access !== 'undefined' && access){
      clearInterval(timer);
      renderLeadership();
    }
  }, 120);
  setTimeout(() => clearInterval(timer), 12000);
})();

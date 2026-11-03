/* EAGLENEST_ASYNC_FORM_OUTREACH_V3
 * Renders from the already-authorized Attendance Outreach queue response.
 * No extra endpoint or new access permissions; no physical scan is implied.
 */
(function (global) {
  'use strict';
  const byId = (name) => document.getElementById(name);
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g,
    (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function fmtTime(iso) {
    const date = new Date(String(iso || ''));
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York',
      hour:'numeric', minute:'2-digit', hour12:true }).format(date);
  }
  function amStatus(row) {
    const value = String(row.async_am_att_only_status || 'unverified');
    const action = String(row.async_am_att_only_action || '');
    if (value === 'confirmed') {
      if (action === 'physical_or_manual_preserved') return {
        type:'confirmed', label:'Confirmed · arrival preserved',
        hint:'The existing physical or office arrival row was not replaced.'
      };
      return {type:'confirmed',label:'AM write acknowledged',
        hint:'A later physical scan may replace the form-only sheet row.'};
    }
    if (value === 'retry') return {type:'retry',label:'Retry needed',
      hint:'EagleNEST retained the validated submission, but the AM write was not acknowledged.'};
    return {type:'unverified',label:'Not yet verified',
      hint:'Legacy submissions may already be in AM_Att_Only; re-sync to confirm.'};
  }
  function eligibleRows(queue) {
    return Array.isArray(queue?.rows)
      ? queue.rows.filter((row) => row?.async_daily_present === true)
      : [];
  }
  function hide() {
    const panel=byId('asyncDailyPanel');
    if (panel) panel.hidden=true;
    const option=byId('asyncStatusOption');
    if (option) {option.hidden=true; option.disabled=true;}
    const filter=byId('statusFilter');
    if (filter?.value==='asynchronous') filter.value='needs_action';
  }
  function render(queue) {
    const panel=byId('asyncDailyPanel'), option=byId('asyncStatusOption');
    if (!panel) return;
    const rows=queue?.practice ? [] : eligibleRows(queue);
    if (!rows.length) {hide();return;}
    panel.hidden=false;
    if (option) {option.hidden=false;option.disabled=false;}
    const count=byId('asyncDailyCount');
    if (count) count.textContent=String(rows.length);
    const date=byId('asyncDailyDate');
    if (date) date.textContent=String(queue.date || '');
    const tbody=byId('asyncDailyBody');
    if (tbody) tbody.innerHTML=rows.slice().sort((a,b)=>
      String(a.name || a.osis).localeCompare(String(b.name || b.osis),undefined,{sensitivity:'base'})
    ).map((row)=>{
      const receipt=amStatus(row);
      const physical=row.has_morning_entry || row.has_today_evidence;
      const studentHref='./student_view.html?osis='+encodeURIComponent(String(row.osis || ''));
      return `<tr><td><a class="studentLink" href="${esc(studentHref)}">${esc(row.name || row.osis)}</a>`+
        `<div class="subline">Grade ${esc(row.grade || '—')} · ${esc(row.osis)}</div></td>`+
        `<td>${esc(fmtTime(row.async_form_submitted_at_iso))}</td>`+
        `<td>${physical ? 'Physical evidence also recorded' : 'Remote daily present (off campus)'}</td>`+
        `<td><span class="asyncAmStatus ${esc(receipt.type)}">${esc(receipt.label)}</span>`+
        `<div class="subline">${esc(receipt.hint)}</div></td></tr>`;
    }).join('');
  }
  global.EagleNestAsyncOutreach = { render, hide, eligibleRows, amStatus };
})(window);

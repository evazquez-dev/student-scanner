/* EAGLENEST_GENERIC_DAILY_ATTENDANCE_REPORT_V1
 * Generic Daily Attendance / ISAR-inspired report for CURRENT High School students.
 * Official PowerSchool daily classification determines counts and chart segments.
 * The first verified morning entrance scan is supplementary TIMING evidence only.
 * Never treat a scan as official attendance or an early scan as lateness.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
  let selectedOsis = '', data = null, generation = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const selected = () => selectedOsis || String(new URL(location.href).searchParams.get('osis') || '').replace(/\D/g, '').slice(0,20);
  const templateActive = () => $('studentReportsTemplate')?.value === 'daily';
  const view = () => $('studentReportsDailyRows')?.value === 'all' ? 'all' : 'recorded';
  const percentage = (part, total) => total ? `${(100 * part / total).toFixed(1)}%` : '—';
  const ymd = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const formatDay = value => {
    const s = ymd(value);
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return `${m}/${d}/${y.slice(2)}`;
  };
  const formatTime = raw => {
    const date = new Date(String(raw || ''));
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour:'numeric', minute:'2-digit', hour12:true }).format(date)
      : '';
  };
  const nyToday = () => {
    const items = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' })
      .formatToParts(new Date());
    const parts = Object.fromEntries(items.map(x => [x.type, x.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  function sid() {
    try { return String(sessionStorage.getItem('ss_admin_session_sid_v1') ||
      localStorage.getItem('ss_admin_session_sid_v1') ||
      sessionStorage.getItem('teacher_att_admin_session_v1') ||
      localStorage.getItem('teacher_att_admin_session_v1') || '').trim(); }
    catch { return ''; }
  }
  async function get(path) {
    const headers = new Headers();
    if (sid()) headers.set('x-admin-session', sid());
    const response = await fetch(new URL(path.replace(/^\//, ''), API), {
      method:'GET', credentials:'include', cache:'no-store', headers
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      const error = new Error(result?.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function notice(message, kind='info') {
    const el = $('studentReportsStatus');
    if (el) { el.textContent = message; el.dataset.kind = kind; }
  }
  function statusLabel(row) {
    const cls = row.classification;
    const code = String(row.detail_code || '').toLowerCase();
    if (cls === 'not_enrolled') return 'Not enrolled';
    if (cls === 'unknown') return 'Unverified';
    if (cls === 'present') return 'On time';
    if (cls === 'late') return code === 'excused_late' ? 'Late (excused)' : 'Late';
    if (cls === 'absent') {
      if (['excused_absent', 'quarantine_excused'].includes(code)) return 'Absent (excused)';
      if (code === 'oss') return 'OSS';
      if (code === 'iss') return 'ISS';
      return 'Absent';
    }
    return 'Unverified';
  }
  function modelFromResponse(response, osis, name) {
    const input = Array.isArray(response?.daily_rows) ? response.daily_rows : [];
    const seen = new Set(), issues = [];
    const rows = [];
    for (const src of input) {
      const schoolDate = ymd(src?.school_date);
      if (!schoolDate || seen.has(schoolDate)) { issues.push('Duplicate or invalid school-day entry'); continue; }
      seen.add(schoolDate);
      const status = String(src?.classification || 'unknown').toLowerCase();
      const cls = ['present','late','absent','not_enrolled'].includes(status) ? status : 'unknown';
      const row = {
        school_date:schoolDate,
        classification:cls,
        detail_code:String(src?.detail_code || '').slice(0,80),
        source:String(src?.source || '').slice(0,80),
        arrival_time:formatTime(src?.arrival_at_iso),
        canonical_membership:String(src?.canonical_membership || 'unverified')
      };
      row.label = statusLabel(row);
      rows.push(row);
    }
    rows.sort((a,b) => b.school_date.localeCompare(a.school_date));
    const attended = rows.filter(x => x.classification === 'present' || x.classification === 'late').length;
    const onTime = rows.filter(x => x.classification === 'present').length;
    const late = rows.filter(x => x.classification === 'late').length;
    const absent = rows.filter(x => x.classification === 'absent').length;
    const notEnrolled = rows.filter(x => x.classification === 'not_enrolled').length;
    const unknown = rows.filter(x => x.classification === 'unknown').length;
    const days = onTime + late + absent;
    const quality = response?.attendance?.data_quality || {};
    if (!rows.length || days === 0) issues.push('No completed official attendance days are available');
    if (unknown) issues.push(`${unknown} day(s) have unknown official attendance`);
    if (quality.outside_coverage === true || response?.coverage?.outside_coverage === true)
      issues.push('Some dates are outside completed PowerSchool attendance coverage');
    const start = ymd(response?.window?.start), end = ymd(response?.window?.end);
    if (!start || !end) issues.push('Reporting date range is unavailable');
    if (!name || /^(unknown student|loading student|—)$/i.test(name)) issues.push('Student name is unavailable');
    if (!response?.window?.entry_date) issues.push('PowerSchool entry date is unavailable');
    return {
      osis, name, start, end,
      entryDate:ymd(response?.window?.entry_date),
      generated:nyToday(), rows,
      counts:{days,attended,onTime,late,absent,unknown,notEnrolled},
      issues:[...new Set(issues)]
    };
  }
  function displayRows(report) {
    return report.rows.filter(row => view() === 'all' ||
      row.classification === 'absent' || row.classification === 'late' ||
      row.classification === 'unknown' || Boolean(row.arrival_time));
  }
  function donut(c) {
    const slices = [
      {name:'On time',count:c.onTime,color:'#16A34A'},
      {name:'Late',count:c.late,color:'#D97706'},
      {name:'Absent',count:c.absent,color:'#D94343'}
    ];
    const radius = 61, length = 2 * Math.PI * radius;
    let offset = 0;
    const circles = slices.map(s => {
      const frac = c.days ? s.count / c.days : 0;
      const segment = `<circle cx="96" cy="96" r="${radius}" fill="none" stroke="${s.color}"
         stroke-width="30" stroke-dasharray="${(length * frac).toFixed(4)} ${(length * (1-frac)).toFixed(4)}"
         stroke-dashoffset="${(-length * offset).toFixed(4)}" transform="rotate(-90 96 96)"/>`;
      offset += frac;
      return segment;
    }).join('');
    const legend = slices.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)} ${percentage(s.count,c.days)}</span>`).join('');
    return `<div class="dailyReportChart"><svg viewBox="0 0 192 192" role="img" aria-label="Official daily attendance breakdown">
      <circle cx="96" cy="96" r="61" fill="none" stroke="#E5E7EB" stroke-width="30"/>
      ${circles}<circle cx="96" cy="96" r="45" fill="#FFFFFF"/>
      <text x="96" y="88" text-anchor="middle" font-size="30" font-weight="800" fill="#111827">${c.days}</text>
      <text x="96" y="106" text-anchor="middle" font-size="10.5" fill="#6B7280">school days</text>
      </svg><div class="dailyReportLegend">${legend}</div></div>`;
  }
  function line(row) {
    const type = row.classification;
    return `<div class="dailyReportLine dailyReportLine--${type}">
      <span class="dailyReportDate">${formatDay(row.school_date)}</span>
      <span class="dailyReportStatus">${esc(row.label)}</span>
      <span class="dailyReportTime">${esc(row.arrival_time || '—')}</span>
    </div>`;
  }
  const printCss = `
    @page { size: letter; margin:0; }
    * { box-sizing:border-box; }
    body { margin:0; background:#eee; color:#111827; font-family:Arial,Helvetica,sans-serif; }
    .dailyReportSheet { width:8.5in; height:11in; padding:.39in .42in .32in; margin:12px auto;
      background:white; page-break-after:always; break-after:page; overflow:hidden; }
    .dailyReportSheet:last-child { page-break-after:auto; break-after:auto; }
    .dailyReportTop { display:flex; justify-content:space-between; align-items:start; gap:12px; border-bottom:2px solid #A395C6; padding-bottom:10px; }
    .dailyReportSchool { color:#746497; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:.08em; }
    .dailyReportTop h1 { margin:5px 0 2px; font-size:19px; line-height:1.18; }
    .dailyReportTop p { margin:3px 0 0; font-size:11px; color:#4B5563; }
    .dailyReportStamp { font-size:10px; color:#667085; text-align:right; line-height:1.5; white-space:nowrap; }
    .dailyReportFacts { display:grid; grid-template-columns:repeat(5,1fr); gap:5px; margin:10px 0; }
    .dailyReportFact { padding:7px 6px; border:1px solid #DDD9E8; background:#F7F5FC; border-radius:5px; text-align:center; }
    .dailyReportFact strong { display:block; font-size:17px; color:#231E35; }
    .dailyReportFact small { font-size:9px; color:#5F6470; }
    .dailyReportContent { display:grid; grid-template-columns:1fr 1fr; gap:11px; align-items:start; }
    .dailyReportPane { min-width:0; }
    .dailyReportTableHead { display:grid; grid-template-columns:72px 1fr 85px; gap:6px; align-items:center;
      background:#B0A2D2; font-size:10px; color:#191429; font-weight:700; padding:6px 7px; border-radius:3px 3px 0 0; }
    .dailyReportLine { display:grid; grid-template-columns:72px 1fr 85px; gap:6px; padding:4px 7px;
      align-items:center; border-bottom:1px solid #EFEFEF; font-size:10px; line-height:1.22; min-height:21px; }
    .dailyReportDate { font-weight:600; } .dailyReportTime { text-align:right; font-variant-numeric:tabular-nums; }
    .dailyReportLine--late { background:#FFF1D9; }
    .dailyReportLine--absent { background:#FCE4E4; }
    .dailyReportLine--present { background:#EAF6EF; }
    .dailyReportLine--unknown { background:#EDEDED; }
    .dailyReportLine--not_enrolled { background:#F5F5F5; color:#777; }
    .dailyReportChart { display:flex; align-items:center; gap:9px; padding:6px; border:1px solid #E6E3EE;
      border-radius:5px; margin-bottom:8px; min-height:144px; }
    .dailyReportChart svg { display:block; width:136px; height:136px; flex-shrink:0; }
    .dailyReportLegend { display:flex; flex-direction:column; gap:8px; font-size:10px; }
    .dailyReportLegend span { display:flex; align-items:center; gap:6px; }
    .dailyReportLegend i { display:inline-block; width:9px; height:9px; border-radius:2px; }
    .dailyReportFoot { margin-top:9px; padding-top:8px; border-top:1px solid #E4E4E7;
      font-size:9.3px; line-height:1.4; color:#626471; }
    @media print { body { background:white; } .dailyReportSheet { margin:0; } }
  `;
  function fact(label, value) {
    return `<div class="dailyReportFact"><strong>${esc(value)}</strong><small>${esc(label)}</small></div>`;
  }
  const head = '<div class="dailyReportTableHead"><span>Date</span><span>Official status</span><span>First entry scan</span></div>';
  function documentPages(report) {
    const lines = displayRows(report);
    const c = report.counts;
    const chunks = [];
    // The first page reserves room for the chart; continuation pages show 35 rows per column.
    const first = lines.slice(0,56);
    chunks.push({number:1,left:first.slice(0,36),right:first.slice(36),chart:true});
    for (let from=56; from<lines.length; from+=70) {
      const rest = lines.slice(from,from+70);
      chunks.push({number:chunks.length+1,left:rest.slice(0,35),right:rest.slice(35),chart:false});
    }
    return chunks.map(page => `<section class="dailyReportSheet">
      <header class="dailyReportTop"><div>
        <div class="dailyReportSchool">The American Dream School · High School</div>
        <h1>Daily Attendance Report</h1>
        <p><strong>${esc(report.name)}</strong> · ${esc(report.osis)}</p>
        <p>${esc(formatDay(report.start))} – ${esc(formatDay(report.end))} · PowerSchool entry ${esc(formatDay(report.entryDate))}</p>
      </div><div class="dailyReportStamp">Generated ${esc(formatDay(report.generated))}<br>Page ${page.number} of ${chunks.length}<br>Official daily attendance</div></header>
      ${page.number===1 ? `<div class="dailyReportFacts">
        ${fact('School days',c.days)}${fact('On time',c.onTime)}${fact('Late',c.late)}
        ${fact('Absent',c.absent)}${fact('Attendance rate',percentage(c.attended,c.days))}
      </div>` : ''}
      <div class="dailyReportContent"><div class="dailyReportPane">${head}${page.left.map(line).join('')}</div>
      <div class="dailyReportPane">${page.chart?donut(c):''}${head}${page.right.map(line).join('')}</div></div>
      ${page.number===chunks.length ? `<footer class="dailyReportFoot">
        Data source: official PowerSchool daily attendance in EagleNEST. “First entry scan” is the earliest
        Front/Rear Morning Entrance scan captured for the date; it does not determine the official attendance code.
        A blank scan means no qualifying scan record was available. Excused absences are included in Absent.
        Not-enrolled days are excluded from percentages. View: ${view()==='all'?'All school days':'Recorded arrivals + exceptions'}.
      </footer>` : ''}
    </section>`).join('');
  }
  function render() {
    if (!templateActive() || !data) return;
    const report = data, c = report.counts;
    const pairs = [
      ['School days',c.days], ['On time',c.onTime], ['Late',c.late], ['Absent',c.absent],
      ['Attendance rate',percentage(c.attended,c.days)]
    ];
    $('studentReportsMetrics').innerHTML = pairs.map(([label,value]) =>
      `<div class="studentReportsMetric"><strong>${esc(value)}</strong><small>${esc(label)}</small></div>`).join('');
    $('studentReportsPreview').innerHTML = `<p><strong>Student:</strong> ${esc(report.name)}<br>
      <strong>Reporting period:</strong> ${esc(report.start)} to ${esc(report.end)}<br>
      <strong>Enrollment entry:</strong> ${esc(report.entryDate)}<br>
      <strong>Entries displayed:</strong> ${displayRows(report).length} of ${report.rows.length} dated records</p>
      <p>Official Present is reported as <strong>On time</strong>; official Late is <strong>Late</strong>.
      Entrance scans provide a time only and never override PowerSchool attendance. Counts and the chart
      use all verified-classification school days, regardless of the entries shown.</p>`;
    $('studentReportsPrint').disabled = report.issues.length !== 0;
    notice(report.issues.length
      ? 'Not ready to print: '+report.issues.join(' • ')
      : `Daily attendance report through ${report.end}. Review the preview, then Print / Save as PDF.`,
      report.issues.length?'error':'ok');
    $('studentReportsPaperPreview').srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${printCss}</style></head><body>${documentPages(report)}</body></html>`;
  }
  async function load(force=false) {
    if (!templateActive()) return;
    const osis=selected();
    if (!/^\d{5,15}$/.test(osis)) { notice('Select a student before generating a report.','error'); return; }
    if (data && data.osis===osis && !force) {render();return;}
    const id=++generation;
    $('studentReportsPrint').disabled = true;
    notice('Loading PowerSchool daily attendance and available first entrance scan times…');
    try {
      const response = await get(`/admin/grades/attendance/student?osis=${encodeURIComponent(osis)}`+
        `&preset=ytd&report_enrollment_scoped=1&include_arrival_times=1`);
      if (id!==generation || osis!==selected() || !templateActive()) return;
      data = modelFromResponse(response,osis,String($('studentName')?.textContent || '').trim());
      render();
    } catch(err) {
      if (id!==generation || !templateActive()) return;
      data = null;
      $('studentReportsMetrics').innerHTML='';
      $('studentReportsPreview').innerHTML='';
      $('studentReportsPaperPreview').srcdoc='';
      $('studentReportsPrint').disabled=true;
      const friendly={
        powerschool_entry_date_not_synced:'PowerSchool entry date is not yet synchronized. Push the nightly student cache.',
        powerschool_nightly_student_cache_unavailable:'The PowerSchool student cache is unavailable. Verify the nightly cache push.',
        student_not_current_high_school_enrollment:'This version supports current high-school students only.',
        student_entry_after_completed_attendance:'No completed official attendance exists after this student entered.'
      };
      notice(err.status===403?'You are not authorized to view this student.':
        (friendly[err.message] || `Unable to load report: ${err.message}`),'error');
    }
  }
  function print() {
    if (!templateActive() || !data || data.issues.length || $('studentReportsPrint').disabled) return;
    const win = window.open('','_blank');
    if (!win) {notice('Please allow pop-ups for the print-ready report.','error');return;}
    win.opener=null;
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Daily Attendance Report</title>
      <style>${printCss} .print-actions{position:fixed;left:8px;top:8px;z-index:3;background:white;padding:9px;border:1px solid #ccc;border-radius:5px} @media print{.print-actions{display:none}}</style>
      </head><body><div class="print-actions"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>${documentPages(data)}</body></html>`);
    win.document.close();
    win.focus();
  }
  function reset() { generation++; data=null; }
  function bind() {
    $('studentReportsDailyRows')?.addEventListener('change',render);
    document.addEventListener('eaglenest:student-lookup-selected',event=>{
      selectedOsis=String(event.detail?.osis||'').replace(/\D/g,'');reset();
    });
    // The existing Student Reports controller already triggers load(true) when
    // Reports is visible. Do not invalidate that in-flight request afterward.
    document.addEventListener('eaglenest:student-lookup-refreshed',()=>{
      if ($('tabStudentReports')?.getAttribute('aria-selected') !== 'true') reset();
    });
  }
  window.EagleNESTDailyAttendanceReport = {load,print,reset,render};
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();

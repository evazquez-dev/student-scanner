/* EAGLENEST_STUDENT_REPORTS_V1_1
 * School-year-to-date bilingual attendance letter for CURRENT EagleNEST students.
 * Uses the EXISTING student-scoped Grades & Attendance endpoint; never reads
 * raw scans or grants broader student access. PDF is the browser's Print/Save.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
  const ENGLISH = 'en', SPANISH = 'es', BOTH = 'both';
  let osis = '';
  let data = null;
  let loadId = 0;
  let currentLanguage = BOTH;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const studentOsis = () => osis || String(new URL(location.href).searchParams.get('osis') || '').replace(/\D/g, '').slice(0,20);
  const isVisible = () => $('tabStudentReports')?.getAttribute('aria-selected') === 'true';
  // EAGLENEST_GENERIC_DAILY_ATTENDANCE_REPORT_V1: keep both report templates independent.
  const isDaily = () => $('studentReportsTemplate')?.value === 'daily';
  const fmtPct = n => Number.isFinite(n) ? `${n.toFixed(1).replace(/\.0$/, '')}%` : '—';
  const dateFmt = (iso, lang='en-US') => {
    const d = new Date(`${iso}T12:00:00Z`);
    return Number.isFinite(d.getTime())
      ? new Intl.DateTimeFormat(lang, { timeZone:'UTC', year:'numeric', month:'long', day:'numeric' }).format(d)
      : '';
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
    if (!response.ok || !result?.ok) {
      const error = new Error(result?.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function setNotice(msg, kind='info') {
    const node = $('studentReportsStatus');
    if (!node) return;
    node.textContent = msg;
    node.dataset.kind = kind;
  }
  function reset() {
    loadId++;
    window.EagleNESTDailyAttendanceReport?.reset?.();
    data = null;
    $('studentReportsMetrics').innerHTML = '';
    $('studentReportsPreview').innerHTML = '';
    $('studentReportsPrint').disabled = true;
    const iframe=$('studentReportsPaperPreview'); if(iframe) iframe.srcdoc='';
    setNotice('Open Reports to retrieve this student\'s attendance letter.');
  }
  function counts(result) {
    const rows = Array.isArray(result.daily_rows) ? result.daily_rows : [];
    const aggregate = result.attendance?.daily_attendance_requirement || {};
    const q = result.attendance?.data_quality || {};
    const present = Number(aggregate.attended_days ?? NaN);
    const absent = Number(aggregate.absent_days ?? NaN);
    const late = Number(aggregate.late_days ?? NaN);
    const days = Number(aggregate.denominator_days ?? NaN);
    const unknown = rows.filter(x => !['present','late','absent'].includes(String(x.classification).toLowerCase())).map(x=>x.school_date);
    const rowPresent = rows.filter(x=>['present','late'].includes(String(x.classification).toLowerCase())).length;
    const rowAbsent = rows.filter(x=>String(x.classification).toLowerCase()==='absent').length;
    const rowLate = rows.filter(x=>String(x.classification).toLowerCase()==='late').length;
    const issues = [];
    if (!rows.length || !Number.isFinite(days) || days <= 0) issues.push('No completed attendance records for this reporting period');
    if (q.outside_coverage === true || result.coverage?.outside_coverage === true) issues.push('Reporting period extends outside official data coverage');
    if (unknown.length) issues.push(`${unknown.length} school day(s) have unknown daily attendance`);
    if ((q.missing_daily_dates || []).length) issues.push(`${q.missing_daily_dates.length} missing daily attendance date(s)`);
    if ([present,absent,late,days].some(n=>!Number.isInteger(n)||n<0)) issues.push('Invalid attendance totals');
    else if (present !== rowPresent || absent !== rowAbsent || late !== rowLate || days !== rows.length || present + absent !== days)
      issues.push('Attendance totals do not agree with the day-by-day detail');
    // This report intentionally does not use per-class on-time rates.
    const onTimePct = present > 0 ? (present - late) / present * 100 : null;
    if (present === 0) issues.push('On-time arrival rate cannot be calculated without an attended day');
    return {
      days, present, absent, late,
      rate: days > 0 ? present / days * 100 : null,
      onTimePct, issues
    };
  }
  function getName() { return String($('studentName')?.textContent || '').trim(); }
  function renderMetrics(c) {
    const pairs = [
      ['School days', c.days], ['Attended', c.present], ['Absent', c.absent],
      ['Attendance rate', fmtPct(c.rate)], ['On-time arrival rate', fmtPct(c.onTimePct)]
    ];
    $('studentReportsMetrics').innerHTML = pairs.map(([label,value])=>`<div class="studentReportsMetric"><strong>${escapeHtml(value)}</strong><small>${escapeHtml(label)}</small></div>`).join('');
  }
  function logoUrl(filename) { return new URL('./'+filename, location.href).href; }
  function htmlPage(lang, report, preview=false) {
    const v = report.counts;
    const name = escapeHtml(report.name);
    const advisor = escapeHtml(report.advisor);
    const today = escapeHtml(dateFmt(report.generated, lang===SPANISH?'es-ES':'en-US'));
    const sig = logoUrl('student_reports_signature.jpg');
    const logo = logoUrl('student_reports_logo.png');
    const joinedLate = Boolean(report.enrollmentAdjusted);
    const joinDate = joinedLate ? dateFmt(report.enrollmentDate,lang===SPANISH?'es-ES':'en-US') : '';
    const schoolDaysLabel = joinedLate ? (lang===SPANISH ? 'Días escolares desde su ingreso' : 'School days since enrollment') : (lang===SPANISH ? 'Total de días escolares' : 'Total School Days');
    const absenceScope = joinedLate
      ? (lang===SPANISH ? `desde que ingresó el ${escapeHtml(joinDate)}` : `since enrolling on ${escapeHtml(joinDate)}`)
      : (lang===SPANISH ? 'este año escolar' : 'this school year');
    const txt = lang===ENGLISH ? `
      <div class="letter-head"><span>${today}</span><span>Advisor: ${advisor}</span></div>
      <p>Dear parent/guardian of ${name},</p>
      <p>As a part of our ongoing efforts to support our students’ academic success, we regularly monitor attendance data. We are writing to inform you that your student, ${name}, has been absent ${v.absent} days ${absenceScope}. We’d like to speak with you about what is causing these absences and how we can help.</p>
      <div class="attendance-facts"><b>Attendance Data for ${name}</b><ul>
        <li>${schoolDaysLabel}: ${v.days}</li><li>Days Attended: ${v.present}</li>
        <li>Days Absent: ${v.absent}</li><li>Attendance Rate: ${fmtPct(v.rate)}</li>
        <li>On time Rate: ${fmtPct(v.onTimePct)}</li>
      </ul></div>
      <p>As you know, regular attendance is an important component of your child’s success academically. Students fall behind when they miss school (both for excused as well as unexcused reasons) and we often hear from parents and guardians that they are unaware of the impact that missing school has on their student’s academic performance.</p>
      <p>You can play a significant role in improving ${name}’s attendance moving forward and we appreciate your efforts. We are committed to partnering with families to ensure students are present and engaging in learning. Please feel free to contact us if there is anything we can do to support you and your student.</p>
      <div class="letter-signature"><p>Sincerely,</p><img alt="Signature" src="${sig}"><div>Dr.Melissa Melkonian<br>High School Director</div></div>` : `
      <div class="letter-head"><span>${today}</span><span>Tutor: ${advisor}</span></div>
      <p>Estimado padre/tutor de ${name},</p>
      <p>Como parte de nuestros esfuerzos continuos para apoyar el éxito académico de nuestros estudiantes, monitoreamos periódicamente los datos de asistencia. Le escribimos para informarle que su estudiante, ${name}, ha estado ausente ${v.absent} días ${absenceScope}. Nos gustaría hablar con usted sobre la causa de estas ausencias y cómo podemos ayudar.</p>
      <div class="attendance-facts"><b>Datos de asistencia para ${name}</b><ul>
        <li>${schoolDaysLabel}: ${v.days}</li><li>Días de asistencia: ${v.present}</li>
        <li>Días de ausencia: ${v.absent}</li><li>Tasa de asistencia: ${fmtPct(v.rate)}</li>
      </ul></div>
      <p>Como usted sabe, la asistencia regular es un componente importante del éxito académico de su estudiante. Los estudiantes se atrasan cuando faltan a la escuela (tanto por razones justificadas como injustificadas) y a menudo escuchamos de padres y tutores que no son conscientes del impacto que la falta de escuela tiene en el rendimiento académico de sus estudiantes.</p>
      <p>Usted puede desempeñar un papel importante para mejorar la asistencia de ${name} en el futuro y apreciamos sus esfuerzos. Estamos comprometidos a asociarnos con las familias para garantizar que los estudiantes estén presentes y participen en el aprendizaje. No dude en contactarnos si hay algo que podamos hacer para apoyarlo a usted y a su estudiante.</p>
      <div class="letter-signature"><p>Atentamente,</p><img alt="Firma" src="${sig}"><div>Dr.Melissa Melkonian<br>Director de escuela secundaria</div></div>`;
    const note = preview ? '<div class="letter-preview-note">PREVIEW — NOT FOR DISTRIBUTION</div>' : '';
    return `<article class="report-sheet" lang="${lang}">${note}<img class="school-logo" src="${logo}" alt="The American Dream School logo">${txt}
      <footer><div><strong style="color:#e32329">Somos un equipo.</strong> <strong style="color:#004eaf">Somos Familia.</strong> <span>Somos ADS.</span></div>
      <div>403 Concord Avenue, Bronx, NY 10454 • 718.924.2809</div>
      <div>www.theamericandreamschool.org</div></footer></article>`;
  }
  const printCss = `
    @page { size:letter; margin:0; }
    * { box-sizing:border-box; }
    body { margin:0; color:#131313; background:#efefef; font-family:Arial, Helvetica, sans-serif; }
    .report-sheet { width:8.5in; height:11in; padding:.42in .55in .3in; margin:12px auto; background:white; position:relative;
      display:flex; flex-direction:column; gap:.04in; page-break-after:always; break-after:page; overflow:hidden; }
    .report-sheet:last-child { page-break-after:auto; break-after:auto; }
    .school-logo { width:0.78in; height:0.78in; object-fit:contain; align-self:center; margin-bottom:-.15in; }
    .letter-head { display:flex; justify-content:space-between; font-size:12px; margin:0 0 .13in; }
    .report-sheet p { font-size:12.6px; line-height:1.52; margin:.1in 0; }
    .attendance-facts { font-size:12.5px; margin:.12in 0; }
    .attendance-facts ul { padding-left:.48in; margin:.05in 0; }
    .attendance-facts li { line-height:1.45; }
    .letter-signature { margin-top:.13in; font-size:12.5px; line-height:1.5; }
    .letter-signature p { margin-bottom:.05in; }
    .letter-signature img { display:block; width:1.42in; height:.72in; object-fit:contain; object-position:left center; }
    .report-sheet footer { margin-top:auto; text-align:center; font-size:11.4px; line-height:1.4; color:#5091bf; }
    .report-sheet footer span { color:#888; }
    .letter-preview-note{position:absolute;top:1.1in;right:.48in;color:#a33;font-size:10px;letter-spacing:.06em;}
    @media print { body { background:#fff; } .report-sheet { margin:0; box-shadow:none; } .letter-preview-note{display:none;} }
  `;
  function renderPreview(report) {
    const lang=currentLanguage;
    const pages=(lang===BOTH?[ENGLISH,SPANISH]:[lang]);
    const c=report.counts;
    renderMetrics(c);
    const problems = [...c.issues];
    if (!report.advisor || report.advisor.includes('@')) problems.push('Advisor name is not available from EagleNEST');
    if (!report.name || /^(unknown student|loading student|—)$/i.test(report.name)) problems.push('Student name is unavailable');
    $('studentReportsPrint').disabled = problems.length !== 0;
    setNotice(problems.length ? 'Not ready to print: '+problems.join(' • ') :
      `Verified attendance through ${report.end}. Review the bilingual letter and select Print / Save as PDF.`,
      problems.length?'error':'ok');
    $('studentReportsPreview').innerHTML = `
      <p><strong>Student:</strong> ${escapeHtml(report.name)}<br>
         <strong>Advisor:</strong> ${escapeHtml(report.advisor || 'Unavailable')}<br>
         <strong>Reporting period:</strong> ${escapeHtml(report.start)} to ${escapeHtml(report.end)}</p>
      <p>This letter uses total daily absences (excused and unexcused). The on-time rate is arrival to school among days attended, not classroom punctuality. It does not establish eligibility for a Level 1 unexcused-absence intervention.</p>
      <p><strong>PowerSchool entry date:</strong> ${escapeHtml(report.enrollmentDate || 'Unavailable')}<br>
         <strong>Attendance window:</strong> ${report.enrollmentAdjusted ? 'Starts at enrollment date' : 'Full school year'}</p>
      <p><strong>Languages:</strong> ${pages.map(l=>l===ENGLISH?'English':'Spanish').join(' + ')}.</p>`;
    const iframe=$('studentReportsPaperPreview');
    if (iframe) iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${printCss}</style></head><body>${pages.map(l=>htmlPage(l,report,true)).join('')}</body></html>`;
  }
  async function load(force=false) {
    if (isDaily()) return window.EagleNESTDailyAttendanceReport?.load(force);
    const current = studentOsis();
    if (!/^\d{5,15}$/.test(current)) return;
    if (data && data.osis===current && !force) { renderPreview(data); return; }
    const id=++loadId;
    $('studentReportsPrint').disabled=true;
    setNotice('Loading official school-year-to-date attendance and advisor information…');
    try {
      const [result,advisorResult] = await Promise.all([
        get(`/admin/grades/attendance/student?osis=${encodeURIComponent(current)}&preset=ytd&report_enrollment_scoped=1`),
        get(`/admin/conferences/student_context?osis=${encodeURIComponent(current)}`).catch(()=>null)
      ]);
      if (id!==loadId || current!==studentOsis()) return;
      const stats=counts(result);
      const advisor=String(advisorResult?.current_advisor?.advisor_name || '').trim();
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
      const now=`${parts.year}-${parts.month}-${parts.day}`;
      data={osis:current,name:getName(),advisor,counts:stats,start:String(result.window?.start||''),
        end:String(result.window?.end||''),generated:now,
        enrollmentDate:String(result.window?.entry_date||''),
        enrollmentAdjusted:result.window?.enrollment_adjusted===true};
      renderPreview(data);
    } catch(e) {
      if (id!==loadId) return;
      data=null;
      $('studentReportsPreview').innerHTML='';
      $('studentReportsMetrics').innerHTML='';
      $('studentReportsPrint').disabled=true;
      const errors = {
        powerschool_entry_date_not_synced:'Entry date not yet included in the nightly PowerSchool push. Update its Apps Script and run Push Contacts to Worker cache now.',
        powerschool_nightly_student_cache_unavailable:'PowerSchool nightly student cache is unavailable. Verify the contact-cache push.',
        powerschool_nightly_student_cache_incomplete:'PowerSchool nightly student cache is incomplete. Rerun the Worker cache push.',
        powerschool_student_not_found:'Student is not in the nightly PowerSchool cache. Check the student identifier.',
        student_entry_after_completed_attendance:'No completed attendance days exist since this student enrolled.'
      };
      setNotice(e.status===403?'Your account is not authorized to view this student’s attendance report.':
        (errors[e.message] || `Unable to load report: ${e.message||e}`), 'error');
    }
  }
  function printLetter() {
    if (isDaily()) return window.EagleNESTDailyAttendanceReport?.print();
    if (!data || $('studentReportsPrint').disabled) return;
    const languages=currentLanguage===BOTH?[ENGLISH,SPANISH]:[currentLanguage];
    const pages=languages.map(l=>htmlPage(l,data,false)).join('');
    const win=window.open('', '_blank');
    if(!win) { setNotice('Please allow pop-ups to open the print-ready letter.','error'); return; }
    win.opener=null;
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>ADS Attendance Letter</title><style>${printCss} .print-actions{position:fixed;left:8px;top:8px;z-index:3;background:#fff;padding:9px;border:1px solid #bbb;border-radius:8px} @media print{.print-actions{display:none}}</style></head><body><div class="print-actions"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>${pages}</body></html>`);
    win.document.close();
    // The user clicks Print/Save as PDF in the new window; avoid early image-less printing.
    win.focus();
  }
  function bind() {
    const tab=$('tabStudentReports');
    if(!tab) return;
    const selector = $('studentReportsTemplate');
    selector?.addEventListener('change', () => {
      const daily = isDaily();
      const entries = $('studentReportsDailyRowsControl');
      const language = $('studentReportsLanguageControl');
      if (entries) entries.hidden = !daily;
      if (language) language.hidden = daily;
      $('studentReportsPrint').textContent = daily
        ? 'Open print-ready daily report / Save as PDF'
        : 'Open print-ready letter / Save as PDF';
      reset();
      if (isVisible()) load(true);
    });
    tab.addEventListener('click',()=>load());
    $('studentReportsRefresh')?.addEventListener('click',()=>load(true));
    $('studentReportsLanguage')?.addEventListener('change',e=>{currentLanguage=e.target.value; if(data)renderPreview(data);});
    $('studentReportsPrint')?.addEventListener('click',printLetter);
    document.addEventListener('eaglenest:student-lookup-selected',e=>{
      osis=String(e.detail?.osis||'').replace(/\D/g,'');reset();
    });
    document.addEventListener('eaglenest:student-lookup-refreshed',()=>{ if(isVisible())load(true); });
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      try { if(typeof access !== 'undefined' && access){
        // Mirrors the existing scoped Grades & Attendance tab: no widened permissions.
        tab.hidden=access?.can?.grades !== true;
        clearInterval(timer);
      }} catch {}
      if(attempts>100)clearInterval(timer);
    },100);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();

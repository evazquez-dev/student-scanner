/* EAGLENEST_STUDENT_LOOKUP_GRADES_ATTENDANCE_V1
 * Student Lookup — current Grades & Attendance summary.
 * Reuses the existing scoped Grades & Attendance endpoints. No new academic
 * authorization path is introduced here.
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
    return fetch(url, { ...init, headers, credentials:'include', cache:'no-store' });
  }

  async function getJson(path) {
    const response = await adminFetch(path, { method:'GET' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      const error = new Error(data?.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = String(data?.error || '');
      throw error;
    }
    return data;
  }

  function currentOsis() {
    return String(new URL(location.href).searchParams.get('osis') || '').replace(/\D/g, '').slice(0, 20);
  }

  function fmtDate(value) {
    const text = String(value || '').trim();
    if (!text) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text);
    return Number.isFinite(d.getTime())
      ? d.toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' })
      : text;
  }

  function pct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(n % 1 ? 1 : 0)}%`;
  }

  function gradeNumber(row) {
    const raw = row?.grade_numeric;
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n !== 0 ? n : null;
  }

  function gradeText(row) {
    const n = gradeNumber(row);
    return n == null ? 'Not entered' : `${n.toFixed(n % 1 ? 1 : 0)}%`;
  }

  function gradeKind(row, passing) {
    const n = gradeNumber(row);
    if (n == null) return 'missing';
    return n >= passing ? 'pass' : 'fail';
  }

  function qualityText(attendance) {
    const q = attendance?.data_quality || {};
    const issues = [];
    if (q.outside_coverage === true) issues.push('outside imported coverage');
    if (Array.isArray(q.missing_daily_dates) && q.missing_daily_dates.length) issues.push(`${q.missing_daily_dates.length} missing daily date(s)`);
    if (Array.isArray(q.missing_meeting_dates) && q.missing_meeting_dates.length) issues.push(`${q.missing_meeting_dates.length} missing meeting date(s)`);
    if (Number(q.unknown_meeting_count || 0) > 0) issues.push(`${Number(q.unknown_meeting_count)} unknown meeting record(s)`);
    return issues.join(' • ');
  }

  function renderGradeCourses(grades, passing) {
    const host = $('lookupAcademicCourses');
    if (!host) return;
    if (!grades.length) {
      host.innerHTML = '<div class="emptyState">No current course grades are stored for this student.</div>';
      return;
    }
    host.innerHTML = grades.map((grade) => {
      const kind = gradeKind(grade, passing);
      return `<article class="lookupAcademicCourse ${kind}">
        <div class="lookupAcademicCourseMain">
          <div class="listMeta">${esc(grade.academic_course_code || grade.course_code || 'Course')}</div>
          <div class="listTitle">${esc(grade.course_name || grade.academic_course_code || grade.course_code || 'Course')}</div>
        </div>
        <strong class="lookupAcademicGrade">${esc(gradeText(grade))}</strong>
      </article>`;
    }).join('');
  }

  function render(gradesData, attendanceData) {
    const grades = gradesData?.student || null;
    const settings = gradesData?.settings || {};
    const current = gradesData?.current || {};
    const attendance = attendanceData?.attendance || {};
    const daily = attendance?.daily_attendance_requirement || {};
    const meeting = attendance?.on_time_class_requirement || {};
    const passing = Number(settings.passing_score ?? 70);

    const gradeCount = Array.isArray(grades?.grades) ? grades.grades.length : 0;
    const below = Number(grades?.below_passing_count || 0);
    const missing = Number(grades?.missing_count || 0);
    const passingCount = Number(grades?.passing_count || 0);

    $('lookupAcademicMeta').textContent = [
      current.marking_period ? `Grades: ${current.marking_period}` : 'Current grades',
      current.snapshot_date ? `snapshot ${fmtDate(current.snapshot_date)}` : '',
      attendanceData?.window?.label || (attendanceData?.window?.start && attendanceData?.window?.end
        ? `${fmtDate(attendanceData.window.start)} – ${fmtDate(attendanceData.window.end)}`
        : 'Current marking period attendance')
    ].filter(Boolean).join(' • ');

    $('lookupGradeStatus').textContent = gradeCount
      ? (below ? `${below} below ${passing}%` : (missing ? 'Passing with missing grades' : 'All entered grades passing'))
      : 'No current grades';
    $('lookupGradeStatus').className = `statusBig${below ? ' academicBad' : missing ? ' academicWarn' : ' academicGood'}`;
    $('lookupGradeDetail').textContent = gradeCount
      ? `${passingCount} passing • ${below} below passing • ${missing} not entered`
      : `Passing threshold ${passing}%`;

    $('lookupDailyAttendance').textContent = pct(daily.percentage);
    $('lookupDailyDetail').textContent = `${Number(daily.attended_days || 0)}/${Number(daily.denominator_days || 0)} present • ${Number(daily.absent_days || 0)} absent • ${Number(daily.late_days || 0)} late`;

    $('lookupMeetingAttendance').textContent = pct(meeting.percentage);
    $('lookupMeetingDetail').textContent = `${Number(meeting.on_time_meetings || 0)}/${Number(meeting.denominator_meetings || 0)} on time • ${Number(meeting.not_on_time_meetings || 0)} not on time • ${Number(meeting.excluded_full_day_absence_meetings || 0)} excluded for full-day absence`;

    const quality = qualityText(attendance);
    $('lookupAcademicQuality').textContent = quality
      ? `Attendance data note: ${quality}.`
      : 'Attendance data is complete for the resolved window.';

    renderGradeCourses(Array.isArray(grades?.grades) ? grades.grades : [], passing);
    $('lookupAcademicContent').hidden = false;
    $('lookupAcademicStatus').textContent = '';
  }

  function renderPartial(gradesResult, attendanceResult) {
    const gradeOk = gradesResult.status === 'fulfilled';
    const attendanceOk = attendanceResult.status === 'fulfilled';

    if (gradeOk && attendanceOk) {
      render(gradesResult.value, attendanceResult.value);
      return;
    }

    const errors = [gradesResult, attendanceResult]
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason);

    const forbidden = errors.find((e) => e?.status === 403 || ['forbidden', 'student_out_of_scope'].includes(String(e?.code || '')));
    if (forbidden && !gradeOk && !attendanceOk) {
      $('lookupAcademicContent').hidden = true;
      $('lookupAcademicStatus').innerHTML = '<div class="emptyState">Grades &amp; Attendance is not available for this student in your current academic scope.</div>';
      return;
    }

    render(gradeOk ? gradesResult.value : {}, attendanceOk ? attendanceResult.value : {});
    const messages = [];
    if (!gradeOk) messages.push(`Grades unavailable: ${gradesResult.reason?.message || gradesResult.reason}`);
    if (!attendanceOk) messages.push(`Attendance unavailable: ${attendanceResult.reason?.message || attendanceResult.reason}`);
    $('lookupAcademicStatus').textContent = messages.join(' • ');
  }

  async function load(force = false) {
    const osis = currentOsis();
    if (!osis) return;
    if (!force && loadedForOsis === osis) return;
    const seq = ++loadSequence;

    $('lookupAcademicContent').hidden = true;
    $('lookupAcademicStatus').innerHTML = '<div class="loadingState">Loading current grades and marking-period attendance…</div>';

    const [gradesResult, attendanceResult] = await Promise.allSettled([
      getJson(`/admin/grades/student?osis=${encodeURIComponent(osis)}`),
      getJson(`/admin/grades/attendance/student?osis=${encodeURIComponent(osis)}&preset=marking_period`)
    ]);

    if (seq !== loadSequence || currentOsis() !== osis) return;
    loadedForOsis = osis;
    renderPartial(gradesResult, attendanceResult);
  }

  function academicTabSelected() {
    return $('tabGradesAttendance')?.getAttribute('aria-selected') === 'true';
  }

  function bind() {
    const tab = $('tabGradesAttendance');
    const panel = $('panelGradesAttendance');
    if (!tab || !panel) return;

    tab.addEventListener('click', () => load(false));
    $('refreshGradesAttendanceBtn')?.addEventListener('click', () => load(true));
    $('refreshStudentBtn')?.addEventListener('click', () => {
      if (academicTabSelected()) load(true);
    });

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      try {
        if (typeof access !== 'undefined' && access) {
          const allowed = access?.can?.grades === true;
          tab.hidden = !allowed;
          if (!allowed) panel.hidden = true;
          clearInterval(timer);
          return;
        }
      } catch {}
      if (tries >= 100) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
})();

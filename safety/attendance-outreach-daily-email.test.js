const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const ROUTE = 'cf-redcake/red-cake-77d5/src/routes/attendance-outreach.js';
const SERVICE = 'cf-redcake/red-cake-77d5/src/services/attendance-daily-email.js';
const FRONT_HTML = 'student-scanner/admin/attendance_outreach.html';
const FRONT_JS = 'student-scanner/admin/attendance_daily_email.js';
const GAS = 'Google Apps Script/clasp-projects/behavioral-endpoint/AttendanceDailyEmail.js';

function nodeCheck(rel) {
  const result = spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding:'utf8' });
  assert.equal(result.status, 0, `${rel} must parse: ${result.stderr || result.stdout}`);
}

test('SAFETY: daily attendance email endpoints stay office-scoped, mutation guarded, and Practice-safe', () => {
  for (const rel of [ROUTE, SERVICE, FRONT_HTML, FRONT_JS, GAS]) assert.equal(exists(rel), true, `${rel} must exist`);
  const route = read(ROUTE);
  for (const endpoint of [
    '/admin/attendance_outreach/email_preview',
    '/admin/attendance_outreach/email_status',
    '/admin/attendance_outreach/email_send',
    '/internal/attendance_email_dispatch'
  ]) assert.ok(route.includes(endpoint), `missing ${endpoint}`);
  assert.match(route, /canUseAttendanceOutreach/);
  assert.match(route, /mutationOriginAllowed/);
  assert.match(route, /viewAsReadOnlyResponse/);
  assert.match(route, /practice_mode_email_send_blocked/);
  assert.match(route, /attendance_daily_email_status_update/);
  assert.match(route, /practice:\s*modeInfo\?\.practice\s*===\s*true/);
  assert.match(route, /attendance_email_outreach_incomplete/);
  assert.match(route, /attendance_email_already_sent/);
});

test('SAFETY: email generation uses authoritative EagleNEST attendance context and one-time signed delivery', () => {
  const service = read(SERVICE);
  assert.match(service, /queryCommunicationsRangeD1/);
  assert.match(service, /bell_schedule_v1/);
  assert.match(service, /morningEntryEvidence/);
  assert.match(service, /todayPresenceEvidence/);
  assert.match(service, /attendance_outreach_email_dispatch:v1:/);
  assert.match(service, /DISPATCH_TTL_SEC\s*=\s*5\s*\*\s*60/);
  assert.match(service, /crypto\.subtle\.sign\('HMAC'/);
  assert.match(service, /hsdreamteam@theamericandreamschool\.org/);
  assert.match(service, /Percentage Absent/);
  assert.match(service, /Students Present/);
});

test('SAFETY: Apps Script relay adds only doGet mail delivery and does not replace behavioral doPost', () => {
  const gas = read(GAS);
  assert.match(gas, /function doGet\(e\)/);
  assert.doesNotMatch(gas, /function doPost\(/);
  assert.match(gas, /Utilities\.computeHmacSha256Signature/);
  assert.match(gas, /\/internal\/attendance_email_dispatch/);
  assert.match(gas, /MailApp\.sendEmail/);
  assert.match(gas, /ATTENDANCE_DAILY_EMAIL_DEFAULT_TO_\s*=\s*'hsdreamteam@theamericandreamschool\.org'/);
});

test('SAFETY: Attendance Outreach uses communication logs as the email draft and keeps edits in preview', () => {
  const html = read(FRONT_HTML);
  const js = read(FRONT_JS);
  const service = read(SERVICE);
  assert.doesNotMatch(html, /id="attendanceEmailResult"/);
  assert.doesNotMatch(html, /id="attendanceEmailReason"/);
  assert.match(html, /latest Attendance communication note will prefill/i);
  assert.match(html, /Reason \/ Note is prefilled from the latest Attendance communication log/i);
  assert.match(html, /id="reviewDailyEmailBtn"/);
  assert.match(html, /id="dailyEmailBackdrop"/);
  assert.match(html, /attendance_daily_email\.js/);
  assert.match(js, /\/admin\/communications\/create/);
  assert.match(js, /isCommunicationCreate\|\|isQueueRead/);
  assert.doesNotMatch(js, /attendance_email_status_failed/);
  assert.match(js, /\/admin\/attendance_outreach\/email_status/);
  assert.match(js, /\/admin\/attendance_outreach\/email_preview/);
  assert.match(js, /\/admin\/attendance_outreach\/email_send/);
  assert.match(service, /comm\?\.notes \|\| safeDailyReasonFromCommunication/);
  assert.match(service, /hasExplicitDraft \? explicit\?\.reason : communicationReason/);
  assert.match(js, /confirm_incomplete/);
  assert.match(js, /confirm_resend/);
  assert.match(js, /Practice Mode — Send Disabled/);
});

test('SAFETY: new daily attendance email JavaScript parses', () => {
  for (const rel of [ROUTE, SERVICE, FRONT_JS, GAS]) nodeCheck(rel);
});

test('daily attendance preview classifies post-start arrival as late and contacted no-show as absent', async () => {
  const moduleUrl = `${pathToFileURL(path.join(ROOT, SERVICE)).href}?attendance_email_test=${Date.now()}`;
  const mod = await import(moduleUrl);
  const date = '2026-09-11';
  const preview = mod.buildAttendanceDailyEmailPreview({
    date,
    recipient:'hsdreamteam@theamericandreamschool.org',
    bell:{ periods:[{ id:'PR1', start:'08:00', end:'08:45' }] },
    roster:[
      { osis:'1001', name:'Late Student', grade:'9' },
      { osis:'1002', name:'Absent Student', grade:'10' }
    ],
    locations:{
      '1001':{
        morning_entry_date:date,
        morning_entry_at:'2026-09-11T12:10:00.000Z',
        morning_entry_location:'Front Entrance (Morning)',
        date,
        location_evidence_at:'2026-09-11T12:10:00.000Z',
        location_label:'Front Entrance (Morning)'
      }
    },
    communications:[{
      communication_id:'COM-1',
      contact_at_iso:'2026-09-11T12:30:00.000Z',
      student_number:'1002',
      category:'Attendance',
      outcome:'Spoke/Connected',
      notes:'Student sick',
      contact_phone:'555-0102'
    }],
    statuses:{},
    verifications:{}
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.late.length, 1);
  assert.equal(preview.late[0].osis, '1001');
  assert.equal(preview.absent.length, 1);
  assert.equal(preview.absent[0].osis, '1002');
  assert.equal(preview.absent[0].reason, 'Student sick');
  assert.equal(preview.absent[0].phone, '555-0102');
  assert.equal(preview.summary.enrolled, 2);
  assert.equal(preview.summary.present, 1);
  assert.equal(preview.summary.percent_absent, 50);
  assert.equal(preview.subject, 'Absentee List : 9/11/26');
});


test('daily email preview edits override log defaults without rewriting the Attendance communication', async () => {
  const moduleUrl = `${pathToFileURL(path.join(ROOT, SERVICE)).href}?attendance_email_override_test=${Date.now()}`;
  const mod = await import(moduleUrl);
  const date = '2026-09-11';
  const base = {
    date,
    bell:{ periods:[{ id:'PR1', start:'08:00', end:'08:45' }] },
    roster:[{ osis:'2001', name:'Student Override', grade:'11' }],
    locations:{},
    communications:[{
      communication_id:'COM-2',
      contact_at_iso:'2026-09-11T12:30:00.000Z',
      student_number:'2001',
      category:'Attendance',
      outcome:'Spoke/Connected',
      notes:'Parent said student is sick',
      contact_phone:'555-0201'
    }],
    verifications:{}
  };
  const fromLog = mod.buildAttendanceDailyEmailPreview({ ...base, statuses:{} });
  assert.equal(fromLog.absent[0].reason, 'Parent said student is sick');
  assert.equal(fromLog.absent[0].phone, '555-0201');

  const edited = mod.buildAttendanceDailyEmailPreview({
    ...base,
    statuses:{ '2001':{ classification:'absent', reason:'', phone:'' } }
  });
  assert.equal(edited.absent[0].reason, '');
  assert.equal(edited.absent[0].phone, '');
  assert.equal(base.communications[0].notes, 'Parent said student is sick');
});

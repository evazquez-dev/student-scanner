const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const serviceUrl = pathToFileURL(path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/src/services/communications-dashboard.js')).href;
async function loadService(){ return import(`${serviceUrl}?communications=${Date.now()}-${Math.random()}`); }

const roster = [
  { osis:'1001', name:'Alpha, A', grade:'9' },
  { osis:'1002', name:'Bravo, B', grade:'9' },
  { osis:'1003', name:'Charlie, C', grade:'10' },
  { osis:'1004', name:'Delta, D', grade:'10' }
];

const academic = {
  staff_mapping_by_email: {
    'teacher@school.org': { email:'teacher@school.org', name:'Teacher One', department:'Math', grade_team:'9', leadership_roles:[] },
    'gtl@school.org': { email:'gtl@school.org', name:'GTL Nine', department:'History', grade_team:'9', leadership_roles:['grade_team_lead'], is_grade_team_lead:true },
    'dc@school.org': { email:'dc@school.org', name:'DC Math', department:'Math', grade_team:'10', leadership_roles:['district_chair'], is_district_chair:true },
    'math2@school.org': { email:'math2@school.org', name:'Math Two', department:'Math', grade_team:'10', leadership_roles:[] }
  },
  teachers_by_email: {
    'teacher@school.org': { courses:{ MTH:{ students:['1001','1003'] } } },
    'dc@school.org': { courses:{ MTH:{ students:['1003'] } } },
    'math2@school.org': { courses:{ MTH:{ students:['1004'] } } }
  }
};

const classesDoc = {
  advisor_links: [
    { teacher_name:'Teacher One', teacher_email:'teacher@school.org', room:'201' },
    { teacher_name:'GTL Nine', teacher_email:'gtl@school.org', room:'202' }
  ],
  courses: {
    '1001': { ADV:'Teacher One' },
    '1002': { ADV:'GTL Nine' },
    '1003': { ADV:'Someone Else' },
    '1004': { ADV:'Someone Else' }
  }
};

test('teacher personal campaign scope prefers StudentToAdvisorLink over broad course enrollment', async () => {
  const svc = await loadService();
  const context = svc.buildCommunicationScopeContext({
    access:{ email:'teacher@school.org', role:'editor', staff_profile:{ name:'Teacher One' } },
    requestedScope:'my', rosterStudents:roster, academicRoster:academic, classesDoc
  });
  assert.equal(context.scope.key, 'my');
  assert.equal(context.scope.student_scope_source, 'advisory');
  assert.deepEqual(context.student_numbers, ['1001']);
  assert.deepEqual(context.activity_actor_emails, ['teacher@school.org']);
});

test('GTL grade scope is bound to staff_profile grade and cannot request school scope', async () => {
  const svc = await loadService();
  const access = { email:'gtl@school.org', role:'editor', staff_profile:{ name:'GTL Nine', grade_team:'9', is_grade_team_lead:true } };
  const context = svc.buildCommunicationScopeContext({ access, requestedScope:'school', rosterStudents:roster, academicRoster:academic, classesDoc });
  assert.equal(context.scope.key, 'grade');
  assert.equal(context.scope.grade, '9');
  assert.deepEqual(context.student_numbers.sort(), ['1001','1002']);
  assert.equal(context.students.find(s => s.student_number === '1001').owner_email, 'teacher@school.org');
});

test('District Chair department scope uses department staff and de-duplicated department students', async () => {
  const svc = await loadService();
  const context = svc.buildCommunicationScopeContext({
    access:{ email:'dc@school.org', role:'editor', staff_profile:{ name:'DC Math', department:'Math', is_district_chair:true } },
    requestedScope:'department', rosterStudents:roster, academicRoster:academic, classesDoc
  });
  assert.equal(context.scope.department, 'Math');
  assert.deepEqual(context.activity_actor_emails.sort(), ['dc@school.org','math2@school.org','teacher@school.org']);
  assert.deepEqual(context.student_numbers.sort(), ['1001','1003','1004']);
  assert.equal(context.students.find(s => s.student_number === '1004').responsible_staff[0].email, 'math2@school.org');
});

test('required campaign coverage accepts exact category and legacy notes without double-counting students', async () => {
  const svc = await loadService();
  const context = svc.buildCommunicationScopeContext({
    access:{ email:'admin@school.org', role:'admin', staff_profile:{} }, requestedScope:'school', rosterStudents:roster, academicRoster:academic, classesDoc
  });
  const campaign = { campaign_id:'curriculum', name:'Curriculum Night Calls', category:'Curriculum Night', start_date:'2026-09-01', due_date:'2026-09-16', grades:['9'], active:true, legacy_phrases:['curriculum night call'] };
  const rows = [
    { communication_id:'a', student_number:'1001', student_name:'Alpha, A', contact_at_iso:'2026-09-02T16:00:00Z', category:'General', notes:'Completed curriculum night call with mom.', actor_email:'teacher@school.org' },
    { communication_id:'b', student_number:'1001', student_name:'Alpha, A', contact_at_iso:'2026-09-03T16:00:00Z', category:'Curriculum Night', notes:'Follow-up', actor_email:'teacher@school.org' },
    { communication_id:'c', student_number:'1003', student_name:'Charlie, C', contact_at_iso:'2026-09-03T16:00:00Z', category:'Curriculum Night', notes:'Not in grade scope', actor_email:'dc@school.org' }
  ];
  const result = svc.buildDashboardCampaigns([campaign], rows, context, '2026-09-08')[0];
  assert.equal(result.counts.expected, 2);
  assert.equal(result.counts.complete, 1);
  assert.equal(result.counts.missing, 1);
  assert.equal(result.counts.qualifying_records, 2);
  assert.equal(result.counts.duplicate_qualifying_records, 1);
  assert.equal(result.completed[0].match.match_type, 'category_match');
  assert.equal(result.missing[0].student_number, '1002');
});

test('dashboard activity and follow-up queue honor personal actor/owner scope', async () => {
  const svc = await loadService();
  const context = svc.buildCommunicationScopeContext({
    access:{ email:'teacher@school.org', role:'editor', staff_profile:{ name:'Teacher One' } }, requestedScope:'my', rosterStudents:roster, academicRoster:academic, classesDoc
  });
  const rows = [
    { communication_id:'1', student_number:'1001', student_name:'Alpha, A', contact_at_iso:'2026-09-08T15:00:00Z', actor_email:'teacher@school.org', category:'General', outcome:'Spoke/Connected', notes:'Connected', follow_up_needed:true, follow_up_at_iso:'2026-09-07T15:00:00Z', follow_up_owner_email:'teacher@school.org' },
    { communication_id:'2', student_number:'1001', student_name:'Alpha, A', contact_at_iso:'2026-09-08T14:00:00Z', actor_email:'other@school.org', category:'General', outcome:'No Answer', notes:'Other staff', follow_up_needed:true, follow_up_at_iso:'2026-09-07T15:00:00Z', follow_up_owner_email:'other@school.org' }
  ];
  const dashboard = svc.buildCommunicationsDashboard({ rows, campaigns:[], context, today:'2026-09-08', nowIso:'2026-09-08T18:00:00Z' });
  assert.equal(dashboard.summary.communications_today, 1);
  assert.equal(dashboard.summary.followups_open, 1);
  assert.equal(dashboard.summary.followups_overdue, 1);
  assert.equal(dashboard.recent[0].communication_id, '1');
  assert.equal(dashboard.followups[0].communication_id, '1');
});

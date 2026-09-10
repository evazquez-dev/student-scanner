const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
const requiredUrl = pathToFileURL(path.join(root, 'cf-redcake/red-cake-77d5/src/services/required-communications.js')).href;
const dashboardUrl = pathToFileURL(path.join(root, 'cf-redcake/red-cake-77d5/src/services/communications-dashboard.js')).href;

async function modules() {
  const nonce = `${Date.now()}-${Math.random()}`;
  const required = await import(`${requiredUrl}?course-scope=${nonce}`);
  const dashboard = await import(`${dashboardUrl}?course-scope=${nonce}`);
  return { required, dashboard };
}

const roster = [
  { osis:'1001', name:'Advisor Student', grade:'9' },
  { osis:'1002', name:'Math Student A', grade:'9' },
  { osis:'1003', name:'Math Student B', grade:'10' },
  { osis:'1004', name:'Other Student', grade:'9' }
];

const academic = {
  students_by_osis: {
    '1001': { osis:'1001', grade:'9' },
    '1002': { osis:'1002', grade:'9' },
    '1003': { osis:'1003', grade:'10' },
    '1004': { osis:'1004', grade:'9' }
  },
  staff_mapping_by_email: {
    'teacher@school.org': { email:'teacher@school.org', name:'Teacher One', department:'Math', grade_team:'9', leadership_roles:[] },
    'other@school.org': { email:'other@school.org', name:'Other Teacher', department:'English', grade_team:'9', leadership_roles:[] },
    'advisor@school.org': { email:'advisor@school.org', name:'Advisor Nine', department:'Advisory', grade_team:'9', leadership_roles:[] }
  },
  teachers_by_email: {
    'teacher@school.org': { email:'teacher@school.org', name:'Teacher One', courses:{ MTH:{ course_code:'MTH', name:'Algebra I', students:['1002','1003'], sections:['MTH.1'] } } },
    'other@school.org': { email:'other@school.org', name:'Other Teacher', courses:{ ELA:{ course_code:'ELA', name:'English 9', students:['1002','1004'], sections:['ELA.1'] } } }
  },
  courses: {
    MTH: { course_code:'MTH', name:'Algebra I', students:['1002','1003'], teachers:['teacher@school.org'], sections:{} },
    ELA: { course_code:'ELA', name:'English 9', students:['1002','1004'], teachers:['other@school.org'], sections:{} }
  }
};

const classesDoc = {
  advisor_links: [
    { teacher_name:'Advisor Nine', teacher_email:'advisor@school.org', room:'201' },
    { teacher_name:'Teacher One', teacher_email:'teacher@school.org', room:'202' }
  ],
  courses: {
    '1001': { ADV:'Teacher One' },
    '1002': { ADV:'Advisor Nine' },
    '1003': { ADV:'Someone Else' },
    '1004': { ADV:'Advisor Nine' }
  }
};

test('campaign sanitizer preserves optional multi-course scope including grade advisories', async () => {
  const { required } = await modules();
  const rows = required.sanitizeRequiredCampaigns([{
    campaign_id:'progress-calls', name:'Progress Calls', category:'Academic',
    start_date:'2026-09-01', due_date:'2026-09-20', grades:['9','10'],
    course_keys:['course:mth', 'advisory:9', 'COURSE:MTH', 'advisory:12'], active:true
  }], { categories:['Academic'] });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].course_keys, ['course:MTH','advisory:9','advisory:12']);
});

test('course options include academic courses plus all four high-school advisories', async () => {
  const { required } = await modules();
  const options = required.buildRequiredCourseOptions(academic);
  const keys = options.map((row) => row.key);
  for (const grade of ['9','10','11','12']) assert.ok(keys.includes(`advisory:${grade}`));
  assert.ok(keys.includes('course:MTH'));
  assert.ok(keys.includes('course:ELA'));
  assert.equal(options.find((row) => row.key === 'course:MTH').label.includes('Algebra I'), true);
});

test('responsibility is section/course teacher based and advisory responsibility is grade-aware', async () => {
  const { required } = await modules();
  const campaign = { course_keys:['course:MTH','advisory:9'] };
  const responsibility = required.buildRequiredCampaignResponsibility(campaign, {
    academicRoster:academic, classesDoc, rosterStudents:roster
  });
  assert.equal(responsibility.course_scoped, true);
  assert.deepEqual(responsibility.by_teacher['teacher@school.org'].student_numbers.sort(), ['1001','1002','1003']);
  assert.deepEqual(responsibility.by_teacher['advisor@school.org'].student_numbers.sort(), ['1002','1004']);
  assert.equal(responsibility.by_student['1003'].staff.some((row) => row.email === 'teacher@school.org'), true);
  assert.equal(responsibility.by_student['1003'].staff.some((row) => row.email === 'advisor@school.org'), false);
});

test('personal course campaign uses selected-course roster even when normal My Communications prefers advisory', async () => {
  const { dashboard } = await modules();
  const campaign = {
    campaign_id:'math-calls', name:'Math Calls', category:'Academic',
    start_date:'2026-09-01', due_date:'2026-09-20', grades:[], course_keys:['course:MTH'], active:true, legacy_phrases:[]
  };
  const context = dashboard.buildCommunicationScopeContext({
    access:{ email:'teacher@school.org', role:'editor', staff_profile:{ name:'Teacher One' } },
    requestedScope:'my', rosterStudents:roster, academicRoster:academic, classesDoc, campaigns:[campaign]
  });
  assert.equal(context.scope.student_scope_source, 'advisory');
  assert.deepEqual(context.student_numbers, ['1001']);
  assert.deepEqual(context.campaign_query_student_numbers.sort(), ['1001','1002','1003']);

  const rows = [
    { communication_id:'good', student_number:'1002', student_name:'Math Student A', contact_at_iso:'2026-09-05T15:00:00Z', category:'Academic', notes:'Math progress call', actor_email:'teacher@school.org' },
    { communication_id:'wrong-teacher', student_number:'1003', student_name:'Math Student B', contact_at_iso:'2026-09-05T16:00:00Z', category:'Academic', notes:'Unrelated teacher call', actor_email:'other@school.org' }
  ];
  const result = dashboard.buildDashboardCampaigns([campaign], rows, context, '2026-09-10')[0];
  assert.equal(result.counts.expected, 2);
  assert.equal(result.counts.complete, 1);
  assert.equal(result.counts.missing, 1);
  assert.equal(result.missing[0].student_number, '1003');
  assert.equal(result.missing[0].responsible_staff[0].email, 'teacher@school.org');
});

test('teacher with no assignment in selected course does not receive the personal campaign', async () => {
  const { dashboard } = await modules();
  const campaign = {
    campaign_id:'math-calls', name:'Math Calls', category:'Academic',
    start_date:'2026-09-01', due_date:'2026-09-20', grades:[], course_keys:['course:MTH'], active:true, legacy_phrases:[]
  };
  const context = dashboard.buildCommunicationScopeContext({
    access:{ email:'other@school.org', role:'editor', staff_profile:{ name:'Other Teacher' } },
    requestedScope:'my', rosterStudents:roster, academicRoster:academic, classesDoc, campaigns:[campaign]
  });
  const campaigns = dashboard.buildDashboardCampaigns([campaign], [], context, '2026-09-10');
  assert.deepEqual(campaigns, []);
});

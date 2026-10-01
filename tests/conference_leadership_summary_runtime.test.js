const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const serviceUrl = pathToFileURL(path.resolve(
  __dirname,
  '../../cf-redcake/red-cake-77d5/src/services/conference-leadership.js'
)).href;

async function loadService(){
  return import(`${serviceUrl}?conferenceLeadership=${Date.now()}-${Math.random()}`);
}

const academic = {
  staff_mapping_by_email: {
    'advisor9@school.org': { email:'advisor9@school.org', department:'Math', departments:['Math'], grade_team:'9' },
    'advisor10@school.org': { email:'advisor10@school.org', department:'Science', departments:['Science'], grade_team:'10' },
    'advisor9b@school.org': { email:'advisor9b@school.org', department:'Math', departments:['Math'], grade_team:'9' }
  }
};

const rows = [
  { student_number:'1001', grade:'9', advisor_email:'advisor9@school.org' },
  { student_number:'1002', grade:'9', advisor_email:'advisor9b@school.org' },
  { student_number:'1003', grade:'10', advisor_email:'advisor10@school.org' }
];

test('grade team lead gets only authorized grade scopes and defaults to grade', async () => {
  const svc = await loadService();
  const access = {
    email:'gtl@school.org',
    role:'editor',
    staff_profile:{ is_grade_team_lead:true, grade_team:'9', grade_teams:['9'] }
  };
  const scopes = svc.availableConferenceReportingScopes(access);
  assert.deepEqual(scopes.map((s) => s.key), ['grade:9','my']);
  const resolved = svc.resolveConferenceReportingScope(access, 'school');
  assert.equal(resolved.scope.key, 'grade:9');
  assert.deepEqual(
    svc.filterConferenceRequirementRows(rows, resolved.scope, access.email, academic).map((r) => r.student_number),
    ['1001','1002']
  );
});

test('department chair scope is based on advisor department, not courses taught', async () => {
  const svc = await loadService();
  const access = {
    email:'chair@school.org',
    role:'editor',
    staff_profile:{ is_district_chair:true, department:'Math', departments:['Math'] }
  };
  const resolved = svc.resolveConferenceReportingScope(access, 'department:math');
  assert.equal(resolved.scope.type, 'department');
  assert.deepEqual(
    svc.filterConferenceRequirementRows(rows, resolved.scope, access.email, academic).map((r) => r.student_number),
    ['1001','1002']
  );
});

test('multi-scope leaders get each explicit team and cannot invent another one', async () => {
  const svc = await loadService();
  const access = {
    email:'leader@school.org',
    role:'editor',
    staff_profile:{
      is_grade_team_lead:true,
      is_district_chair:true,
      grade_teams:['9','10'],
      departments:['Math','Science']
    }
  };
  const keys = svc.availableConferenceReportingScopes(access).map((s) => s.key);
  assert.deepEqual(keys, ['grade:9','grade:10','department:math','department:science','my']);
  const bad = svc.resolveConferenceReportingScope(access, 'department:english');
  assert.equal(bad.scope.key, 'grade:9');
});

test('school scope is available only when the route explicitly authorizes it', async () => {
  const svc = await loadService();
  const admin = { email:'admin@school.org', role:'admin', staff_profile:{} };
  assert.equal(svc.resolveConferenceReportingScope(admin, 'school').scope.key, 'my');
  assert.equal(svc.resolveConferenceReportingScope(admin, '', { allowSchool:true }).scope.key, 'school');
  assert.equal(
    svc.filterConferenceRequirementRows(rows, {key:'school',type:'school'}, admin.email, academic).length,
    3
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const serviceUrl = pathToFileURL(path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/src/services/coverage-planner.js')).href;
async function loadService(){ return import(`${serviceUrl}?coverage=${Date.now()}-${Math.random()}`); }

const teacherAssignments = {
  date:'2026-09-09',
  by_teacher:{
    smith:{ teacher_key:'smith', teacher_last_name:'Smith', sections:[{ section_code:'ELA300.1', section_name:'ELA 10', match_key:'ela3001' }] },
    jones:{ teacher_key:'jones', teacher_last_name:'Jones', sections:[{ section_code:'ELA300.1', section_name:'ELA 10', match_key:'ela3001' }] },
    vacancyteacher:{ teacher_key:'vacancyteacher', teacher_last_name:'vacancy_teacher', sections:[{ section_code:'SCI451.2', section_name:'Chemistry', match_key:'sci4512' }] }
  },
  by_room_period_section:{
    '207||PR1||ela3001':{
      key:'207||PR1||ela3001', room:'207', period_local:'PR1', section_name:'ELA 10', match_key:'ela3001', student_count:22,
      teachers:[{teacher_key:'smith',teacher_last_name:'Smith'},{teacher_key:'jones',teacher_last_name:'Jones'}]
    },
    '308||PR2||sci4512':{
      key:'308||PR2||sci4512', room:'308', period_local:'PR2', section_name:'Chemistry', match_key:'sci4512', student_count:20,
      teachers:[{teacher_key:'vacancyteacher',teacher_last_name:'vacancy_teacher'}]
    }
  }
};

const bellDoc = { periods:[
  {id:'PR1',start:'08:00',end:'08:47'},
  {id:'PR2',start:'08:50',end:'09:37'}
] };

const academic = { staff_mapping_by_email:{
  'smith@school.org':{email:'smith@school.org',name:'Alex Smith',teacher_assignment_match:'Smith',department:'English',grade_team:'10'},
  'jones@school.org':{email:'jones@school.org',name:'Casey Jones',teacher_assignment_match:'Jones',department:'English',grade_team:'10'}
} };

test('vacancy_teacher remains a selectable unmapped Teacher Assignment option', async () => {
  const svc = await loadService();
  const model = svc.buildCoveragePlannerModel({teacherAssignments,bellDoc,academicRoster:academic,today:'2026-09-09'});
  const vacancy = model.teacher_options.find((r) => r.assignment_label === 'vacancy_teacher');
  assert.ok(vacancy);
  assert.equal(vacancy.teacher_key,'vacancyteacher');
  assert.equal(vacancy.unmapped,true);
});

test('a selected absent teacher does not create a gap when a co-teacher remains', async () => {
  const svc = await loadService();
  const model = svc.buildCoveragePlannerModel({teacherAssignments,bellDoc,academicRoster:academic,selectedTeacherKeys:['smith'],today:'2026-09-09'});
  assert.equal(model.summary.gap_count,0);
  assert.equal(model.summary.still_staffed_count,1);
  assert.deepEqual(model.still_staffed[0].remaining_teacher_keys,['jones']);
});

test('co-taught section becomes a gap when every assigned teacher is selected absent', async () => {
  const svc = await loadService();
  const model = svc.buildCoveragePlannerModel({teacherAssignments,bellDoc,academicRoster:academic,selectedTeacherKeys:['smith','jones'],today:'2026-09-09'});
  assert.equal(model.summary.gap_count,1);
  assert.equal(model.gaps[0].section_code,'ELA300.1');
  assert.equal(model.gaps[0].time_label,'8:00 AM – 8:47 AM');
  assert.deepEqual(model.gaps[0].remaining_teacher_keys,[]);
});

test('selecting vacancy_teacher shows its scheduled sections as coverage gaps', async () => {
  const svc = await loadService();
  const model = svc.buildCoveragePlannerModel({teacherAssignments,bellDoc,academicRoster:academic,selectedTeacherKeys:['vacancy_teacher'],today:'2026-09-09'});
  assert.equal(model.summary.gap_count,1);
  assert.equal(model.gaps[0].section_name,'Chemistry');
  assert.equal(model.gaps[0].room,'308');
  assert.equal(model.gaps[0].student_count,20);
});

test('stale Teacher Assignments never produce claimed today gaps', async () => {
  const svc = await loadService();
  const stale = {...teacherAssignments,date:'2026-09-08'};
  const model = svc.buildCoveragePlannerModel({teacherAssignments:stale,bellDoc,academicRoster:academic,selectedTeacherKeys:['vacancyteacher'],today:'2026-09-09'});
  assert.equal(model.schedule_stale,true);
  assert.equal(model.summary.gap_count,0);
  assert.deepEqual(model.gaps,[]);
});

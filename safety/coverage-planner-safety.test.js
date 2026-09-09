const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const route = read('cf-redcake/red-cake-77d5/src/routes/coverage-planner.js');
const service = read('cf-redcake/red-cake-77d5/src/services/coverage-planner.js');

const pathMod = require('node:path');
const { pathToFileURL } = require('node:url');
const serviceUrl = pathToFileURL(pathMod.resolve(__dirname, '../../cf-redcake/red-cake-77d5/src/services/coverage-planner.js')).href;

async function loadService(){ return import(`${serviceUrl}?safety=${Date.now()}-${Math.random()}`); }

test('SAFETY: Coverage Planner is GET-only, Admin-only, and unavailable during View-As', () => {
  assert.match(route,/req\.method !== 'GET'/);
  assert.match(route,/isAdminLike\(access\)/);
  assert.match(route,/access\?\.can\?\.coverage_planner/);
  assert.match(route,/access\?\.view_as\?\.active/);
  assert.match(route,/view_as_admin_only/);
});

test('SAFETY: the planner does not auto-declare unmapped sections vacant; only selected assignment keys can create gaps', () => {
  assert.match(service,/selectedAssigned\.length/);
  assert.match(service,/remaining\.length === 0/);
  assert.doesNotMatch(service,/roster_section_without_teacher/);
  assert.doesNotMatch(service,/automatic_vacancy/i);
});

test('SAFETY: a remaining co-teacher prevents a section from being classified as a coverage gap', async () => {
  const svc = await loadService();
  const teacherAssignments={date:'2026-09-09',by_teacher:{a:{teacher_key:'a',teacher_last_name:'A',sections:[]},b:{teacher_key:'b',teacher_last_name:'B',sections:[]}},by_room_period_section:{x:{key:'x',room:'1',period_local:'P1',section_name:'Shared',match_key:'shared',student_count:10,teachers:[{teacher_key:'a'},{teacher_key:'b'}]}}};
  const model=svc.buildCoveragePlannerModel({teacherAssignments,bellDoc:{periods:[{id:'P1',start:'08:00',end:'09:00'}]},academicRoster:{},selectedTeacherKeys:['a'],today:'2026-09-09'});
  assert.equal(model.gaps.length,0);
  assert.equal(model.still_staffed.length,1);
});

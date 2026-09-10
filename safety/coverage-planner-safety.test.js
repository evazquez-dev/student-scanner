const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const route = read('cf-redcake/red-cake-77d5/src/routes/coverage-planner.js');
const service = read('cf-redcake/red-cake-77d5/src/services/coverage-planner.js');
const serviceUrl = pathToFileURL(path.resolve(__dirname, '../../cf-redcake/red-cake-77d5/src/services/coverage-planner.js')).href;

async function loadService(){ return import(`${serviceUrl}?safety=${Date.now()}-${Math.random()}`); }

test('SAFETY: Coverage Planner supports guarded GET reads and POST mutations, stays Admin-only, and is unavailable during View-As', () => {
  assert.match(route,/req\.method === 'GET'/);
  assert.match(route,/req\.method !== 'POST'/);
  assert.match(route,/mutationOriginAllowed\(req, env\)/);
  assert.match(route,/origin_forbidden/);
  assert.match(route,/isAdminLike\(access\)/);
  assert.match(route,/access\?\.can\?\.coverage_planner/);
  assert.match(route,/access\?\.view_as\?\.active/);
  assert.match(route,/view_as_admin_only/);
  assert.match(route,/action === 'remove'/);
  assert.match(route,/action !== 'assign'/);
  assert.match(route,/coverageStaffEligibleForGap/);
});

test('SAFETY: the planner does not auto-declare unmapped sections vacant; only selected assignment keys can create gaps', () => {
  assert.match(service,/selectedAssigned\.length/);
  assert.match(service,/remaining\.length === 0/);
  assert.doesNotMatch(service,/roster_section_without_teacher/);
  assert.doesNotMatch(service,/automatic_vacancy/i);
});

test('SAFETY: a remaining co-teacher prevents a section from being classified as a coverage gap', async () => {
  const svc = await loadService();
  const teacherAssignments={date:'2026-09-10',by_teacher:{a:{teacher_key:'a',teacher_last_name:'A',sections:[]},b:{teacher_key:'b',teacher_last_name:'B',sections:[]}},by_room_period_section:{x:{key:'x',room:'1',period_local:'P1',section_name:'Shared',match_key:'shared',student_count:10,teachers:[{teacher_key:'a'},{teacher_key:'b'}]}}};
  const model=svc.buildCoveragePlannerModel({teacherAssignments,bellDoc:{periods:[{id:'P1',start:'08:00',end:'09:00'}]},academicRoster:{},selectedTeacherKeys:['a'],today:'2026-09-10'});
  assert.equal(model.gaps.length,0);
  assert.equal(model.still_staffed.length,1);
});

test('SAFETY: coverage assignment writes are Practice-isolated and expire within the Practice TTL', async () => {
  const svc = await loadService();
  const writes = [];
  const env = {
    ROSTER: {
      async get(key) {
        if (key === 'system:mode:v1') return { mode: 'practice' };
        return null;
      },
      async put(key, value, options) {
        writes.push({ key, value: JSON.parse(value), options });
      }
    }
  };
  const date = svc.coverageNYDate();
  const saved = await svc.saveCoverageAssignmentsForDate(env, date, { assignments: { x: { gap_key: 'x' } } }, 'admin@school.org');
  assert.equal(saved.scope, 'practice');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, `practice:v1:${date}:coverage_assignments_v1:${date}`);
  assert.ok(Number(writes[0].options?.expirationTtl) > 0);
  assert.ok(Number(writes[0].options?.expirationTtl) <= 36 * 60 * 60);
});

test('SAFETY: mode-store failures fail closed to Practice for coverage assignments', async () => {
  const svc = await loadService();
  const writes = [];
  const env = {
    ROSTER: {
      async get() { throw new Error('kv unavailable'); },
      async put(key, value, options) { writes.push({ key, value, options }); }
    }
  };
  const date = svc.coverageNYDate();
  const info = await svc.loadCoverageModeInfo(env);
  assert.equal(info.practice, true);
  assert.equal(info.fail_closed, true);
  await svc.saveCoverageAssignmentsForDate(env, date, { assignments: {} }, 'admin@school.org', info);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, `practice:v1:${date}:coverage_assignments_v1:${date}`);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..','..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');

const route=read('cf-redcake/red-cake-77d5/src/routes/grades.js');
const service=read('cf-redcake/red-cake-77d5/src/services/grades-dashboard.js');
const index=read('cf-redcake/red-cake-77d5/src/index.js');
const access=read('cf-redcake/red-cake-77d5/src/services/admin-session.js');
const nav=read('student-scanner/admin/nav.js');
const brand=read('student-scanner/admin/brand.js');
const html=read('student-scanner/admin/grades.html');
const js=read('student-scanner/admin/grades.js');
const css=read('student-scanner/admin/grades.css');
const settings=read('student-scanner/admin/grades_settings_admin.js');

test('Grades remains a modular authenticated staff feature',()=>{
  assert.match(index,/GRADES_PATHS/);
  assert.match(index,/handleGradesRequest/);
  assert.match(access,/grades:\s*true/);
  assert.match(route,/loadBaseAccess/);
  assert.match(route,/access\?\.can\?\.grades/);
  assert.match(route,/\/admin\/grades\/overview/);
  assert.match(route,/\/admin\/grades\/students/);
  assert.match(route,/\/admin\/grades\/student\/history/);
});

test('passing threshold defaults to 70 and is Super Admin configurable',()=>{
  assert.match(service,/DEFAULT_PASSING_SCORE\s*=\s*70/);
  assert.match(service,/GRADES_SETTINGS_KEY\s*=\s*'grades_settings_v1'/);
  assert.match(route,/access\.role !== 'super_admin'/);
  assert.match(route,/mutationOriginAllowed/);
  assert.match(route,/viewAsReadOnlyResponse/);
  assert.match(settings,/Passing grade \(%\)/);
  assert.match(settings,/passing_score:n/);
});

test('teacher view is assignment-first and keeps multi-section union selection',()=>{
  assert.match(html,/id="teacherScopeCard"/);
  assert.match(html,/All My Students/);
  assert.match(html,/Your assignments are your navigation/);
  assert.match(js,/MODE==='admin'/);
  assert.match(js,/renderTeacherNavigation/);
  assert.match(js,/toggleTeacherGroup/);
  assert.match(js,/SELECTED=new Set/);
  assert.match(js,/url\.searchParams\.append\('group',id\)/);
  assert.match(service,/`mycourse:\$\{courseCode\}`/);
  assert.match(service,/your assigned sections/);
});

test('leadership is layered onto teacher view without granting schoolwide admin scope',()=>{
  assert.match(html,/Leadership Scope/);
  assert.match(js,/renderLeadership/);
  assert.match(service,/Grade Team Lead scope/);
  assert.match(service,/District Chair scope/);
  assert.match(service,/const allowedIds = new Set\(\['mine:all', \.\.\.uniqueMyIds, \.\.\.leadershipGroupIds\]\)/);
  assert.match(service,/if \(isAdminLike\) for \(const id of allGroups\.keys\(\)\) allowedIds\.add\(id\)/);
});

test('admin view gets server-authorized grade department teacher course section and advisory scopes',()=>{
  assert.match(html,/Schoolwide Explorer/);
  assert.match(html,/id="adminGradePicker"/);
  assert.match(html,/id="adminDepartmentPicker"/);
  assert.match(html,/id="adminTeacherPicker"/);
  assert.match(html,/id="adminCoursePicker"/);
  assert.match(html,/id="adminSectionPicker"/);
  assert.match(html,/id="adminAdvisoryPicker"/);
  assert.match(service,/function addAdminScopeGroups/);
  assert.match(service,/type: 'teacher'/);
  assert.match(service,/type: 'department'/);
  assert.match(service,/type: 'grade'/);
  assert.match(service,/default_group_ids: isAdminLike[\s\S]*\['school:all'\]/);
  assert.match(js,/addAdminGroup/);
});

test('teacher and admin results intentionally render different information density',()=>{
  assert.match(html,/id="teacherKpis"/);
  assert.match(html,/id="adminKpis"/);
  assert.match(js,/if\(isAdminMode\(\)\)results\.innerHTML/);
  assert.match(js,/Need Attention|attentionHtml/);
  assert.match(css,/teacherKpis/);
  assert.match(css,/adminScopeGrid/);
});

test('advisory and population scopes show all courses while course selections focus grade rows',()=>{
  assert.match(service,/hasPopulationGroup/);
  assert.match(service,/\['advisory', 'mine', 'grade', 'department', 'school'\]/);
  assert.match(service,/focusCourses\.has\(course\.academic_course_code\)/);
});

test('navigation and branding continue to expose Grades',()=>{
  assert.match(nav,/key:'grades'/);
  assert.match(nav,/href:'\.\/grades\.html'/);
  assert.match(brand,/grades:\s*'Grades'/);
  assert.match(html,/data-module="grades"/);
});

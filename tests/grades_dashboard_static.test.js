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
const settings=read('student-scanner/admin/grades_settings_admin.js');

test('Grades is a modular authenticated staff feature',()=>{
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

test('My Groups supports advisory course and individual multi-section selection',()=>{
  assert.match(service,/type:\s*'advisory'/);
  assert.match(service,/type:\s*'course'/);
  assert.match(service,/type:\s*'section'/);
  assert.match(service,/id:\s*'mine:all'/);
  assert.match(service,/`mycourse:\$\{courseCode\}`/);
  assert.match(service,/your assigned sections/);
  assert.match(service,/unionStudents/);
  assert.match(html,/Choose one or more advisories, courses, or individual sections/);
  assert.match(js,/SELECTED=new Set/);
  assert.match(js,/row\?\.type==='section'/);
  assert.match(js,/url\.searchParams\.append\('group',id\)/);
});

test('advisory population shows all courses while course or section selections focus grade rows',()=>{
  assert.match(service,/hasPopulationGroup/);
  assert.match(service,/\['advisory', 'mine', 'grade', 'department', 'school'\]/);
  assert.match(service,/focusCourses\.has\(course\.academic_course_code\)/);
});

test('navigation and branding expose Grades',()=>{
  assert.match(nav,/key:'grades'/);
  assert.match(nav,/href:'\.\/grades\.html'/);
  assert.match(brand,/grades:\s*'Grades'/);
  assert.match(html,/data-module="grades"/);
});

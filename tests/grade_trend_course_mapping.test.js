// EAGLENEST_STUDENT_TREND_SOURCE_CODE_MAPPING_V1
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../admin/eaglenest_grade_bands.js'),'utf8');
const start = source.indexOf('  // EAGLENEST_STUDENT_TREND_SOURCE_CODE_MAPPING_V1');
const end = source.indexOf('  // EAGLENEST_TERM_AWARE_STUDENT_GRADE_TRENDS_V1',start);
assert.ok(start>=0 && end>start,'source mapping helper present');
const extract=source.slice(start,end);
const find=vm.runInNewContext(`(function(){
  function courseName(g){return String(g?.course_name||g?.name||'').trim().toLowerCase();}
  ${extract}
  return findTrendCourse;
})()`);
const courses={
  DNC1001:{course_code:'DNC1001',course_name:'Dance (All Grades)',points:[{student:93},{student:90}]},
  PE1001:{course_code:'PE1001',course_name:'Physical Education',points:[{student:94},{student:94}]},
  ART1001:{course_code:'ART1001',course_name:'Visual Arts',points:[{student:80},{student:95}]}
};
test('source course_code wins over mapped academic_course_code',()=>{
  assert.equal(find({course_code:'DNC1001',academic_course_code:'DANCE',course_name:'Dance (All Grades)'},courses),courses.DNC1001);
  assert.equal(find({course_code:'PE1001',academic_course_code:'PE',course_name:'Physical Education'},courses),courses.PE1001);
});
test('mapped code is considered if raw source code unavailable',()=>{
  assert.equal(find({academic_course_code:'PE1001',course_name:'Physical Education'},courses),courses.PE1001);
});
test('unambiguous name fallback works for familiar aliases',()=>{
  assert.equal(find({academic_course_code:'DANCE',course_name:'Dance (All Grades)'},courses),courses.DNC1001);
  assert.equal(find({academic_course_code:'ART',course_name:'Visual Arts'},courses),courses.ART1001);
});
test('ambiguous duplicate course names are not silently blended',()=>{
  assert.equal(find({academic_course_code:'ART',course_name:'Visual Arts'},
    {...courses,ART2002:{course_code:'ART2002',course_name:'Visual Arts',points:[{}]}}),null);
});
test('no fabricated graph when course is missing',()=>{
  assert.equal(find({course_code:'SCI051',course_name:'Biology'},courses),null);
});
test('term renderer actually uses the new mapping helper',()=>{
  assert.match(source,/const found=findTrendCourse\(current,payload\.courses\)/);
  assert.match(source,/const t=String\(term\|\|''\)/); // selected reporting term is retained
});

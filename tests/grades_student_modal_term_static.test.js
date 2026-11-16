// EAGLENEST_STUDENT_MODAL_TERM_SWITCH_V1
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=path.resolve(__dirname,'../admin');
const html=fs.readFileSync(path.join(src,'grades.html'),'utf8');
const grades=fs.readFileSync(path.join(src,'grades.js'),'utf8');
const attendance=fs.readFileSync(path.join(src,'grades_attendance.js'),'utf8');
const css=fs.readFileSync(path.join(src,'grades.css'),'utf8');

test('modal header has a compact, labeled term selector beside close button',()=>{
 assert.match(html,/id="studentDialogTermSelect" aria-label="Student reporting term"/);
 assert.match(html,/class="studentDialogControls"/);
 assert.match(html,/id="studentDialogClose"/);
 assert.match(css,/\.studentDialogTerm select/);
});

test('available quarter list comes from snapshot metadata and Y1 is gated after Q1',()=>{
 const a=grades.indexOf('function studentModalAvailableTerms(');
 const b=grades.indexOf('function setupStudentModalTerm(',a);
 assert.ok(a>=0&&b>a);
 const script=grades.slice(a,b)+'\nreturn studentModalAvailableTerms;';
 const get=new Function('OVERVIEW',script);
 assert.deepEqual(get(null)({available_quarters:['Q1'],active_term:'Q1'}),['Q1']);
 assert.deepEqual(get(null)({available_quarters:['Q1'],active_term:'Q2'}),['Q1','Y1']);
 assert.deepEqual(get(null)({available_quarters:['Q1','Q2'],active_term:'Q2'}),['Q1','Q2','Y1']);
 assert.deepEqual(get(null)({available_quarters:['Q3','Q1','Q2'],active_term:'Q3'}),['Q1','Q2','Q3','Y1']);
 assert.deepEqual(get(null)({available_quarters:['Q1'],active_term:'Q1',snapshots:{Q4:null}}),['Q1']);
});

test('modal request uses its own term, preserves main selector, and handles stale responses',()=>{
 assert.match(grades,/STUDENT_MODAL_OSIS='',STUDENT_MODAL_TERM='',STUDENT_MODAL_SEQ=0/);
 assert.match(grades,/scope\.set\('term',term\)/);
 assert.match(grades,/request===STUDENT_MODAL_SEQ/);
 assert.match(grades,/window\.EagleNESTGradesAttendance\?\.loadStudent\?\.\(osis,term\)/);
 assert.match(grades,/studentDialogTermSelect\.addEventListener\('change'/);
 assert.match(grades,/setupStudentModalTerm\(SELECTED_GRADE_TERM\)/);
 assert.match(grades,/if\(!studentDialog\.open\)studentDialog\.showModal\(\)/);
 assert.match(grades,/STUDENT_MODAL_TERM!=='Y1'/);
 assert.match(grades,/studentDialog\.addEventListener\('close'/);
});

test('quarter changes update daily and meeting attendance together, Y1 is YTD',()=>{
 assert.match(attendance,/async function loadStudent\(osis,selectedTerm=''\)/);
 assert.match(attendance,/term==='Y1'\?'ytd'/);
 assert.match(attendance,/\?term\.toLowerCase\(\)/);
 assert.match(attendance,/p\.set\('preset',modalPreset\)/);
 assert.match(attendance,/request!==state\.studentSeq/);
 assert.match(attendance,/renderStudentDaily\(data\);renderStudentMeeting\(data\)/);
 assert.match(attendance,/setStudentTab\('grades'\);setTab\('overview'\)/);
});

test('browser loads new frontend assets and history caption is term-aware',()=>{
 assert.match(html,/grades\.js\?v=20261116-modal-term-v1/);
 assert.match(html,/grades_attendance\.js\?v=20261116-modal-term-v1/);
 assert.match(html,/grades\.css\?v=20261116-modal-term-v1/);
 assert.match(html,/id="studentHistoryHelp"/);
});

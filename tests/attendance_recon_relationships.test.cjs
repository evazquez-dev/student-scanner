// EAGLENEST_PS_RELATIONSHIP_INSPECTOR_BATCH6A1
const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../admin/attendance_recon_relationships.js');
const file=(name,headers,rows,extra={})=>({name,sheet:'Data',headers,rows:rows.map(r=>r.map(String)),mapping:{},...extra});
const fixture=()=>[
 file('Students.export.csv',['ID','Student_Number','SchoolID','First_Name'],[['55','258837491','2','A'],['56','258837492','2','B'],['77','258837493','3','C']]),
 file('CC.export.csv',['ID','StudentID','SectionID','SchoolID','DateEnrolled','DateLeft'],[['101','55','909','2','2026-08-31','2027-06-25'],['102','56','910','2','2026-08-31','2027-06-25'],['103','77','911','3','2026-08-31','2027-06-25']]),
 file('Sections.export.csv',['ID','Course_Number','Teacher','SchoolID'],[['909','HEA','12','2'],['910','MAT','13','2'],['911','ENG','17','3']]),
 file('Section_Meeting.export.csv',['ID','SectionID','Period_Number','SchoolID'],[['9010','909','1','2'],['9011','910','2','2']]),
 file('Teachers.export.csv',['ID','Last_Name','SchoolID'],[['12','Chan','2'],['13','Smith','2']]),
 file('Calendar_Day.export.csv',['ID','Date','SchoolID','InSession'],[['401','2026-10-01','2','1']]),
 file('Attendance_Code.export.csv',['ID','Att_Code','SchoolID'],[['951','A','2']]),
 file('Attendance.export.csv',['ID','StudentID','CCID','Calendar_DayID','Attendance_CodeID','SchoolID'],[['6001','55','101','401','951','2'],['6002','56','102','401','951','2']])
];
test('detects PowerSchool reference-table roles including CC and Section_Meeting',()=>{
 const roles=fixture().map(x=>engine.roleFor(x));
 assert.deepEqual(roles,['students','cc','sections','section_meeting','teachers','calendar_days','attendance_codes','meeting_attendance']);
});
test('Students.ID to CC.StudentID bridges OSIS safely, with school scope',()=>{
 const src=fixture(),result=engine.analyze(src,{schoolId:'2'});
 assert.equal(result.id_bridge.uniquely_mapped_students,2);
 assert.equal(result.id_bridge.conflicts,0);
 assert.equal(engine.verifiedBridge(src,{schoolId:'2'}).get('258837491'),'55');
 const rel=result.relationships.find(x=>x.relationship==='CC.StudentID → Students.ID');
 assert.equal(rel.status,'matched');assert.equal(rel.matched,2);assert.equal(rel.unmatched,0);
});
test('never confuses CC.ID (CCID) with CC.SectionID',()=>{
 const src=fixture();let cc=engine.configure(src[1]);
 assert.equal(engine.pick(cc,cc.rows[0],'row_id'),'101');
 assert.equal(engine.pick(cc,cc.rows[0],'section_id'),'909');
 assert.equal(engine.pick(cc,cc.rows[0],'ccid'),'101');
 assert.equal(engine.analyze(src,{schoolId:'2'}).relationships.find(x=>x.relationship==='Attendance.CCID → CC.ID').matched,2);
});
test('preserves existing invalid SectionID-as-CCID mapping without trusting it',()=>{
 const src=fixture(),cc=src[1];cc.mapping.ccid=cc.headers.indexOf('SectionID');
 assert.equal(engine.pick(engine.configure(cc),cc.rows[0],'ccid'),'101');
 assert.equal(engine.analyze(src,{schoolId:'2'}).relationships.find(x=>x.relationship==='Attendance.CCID → CC.ID').matched,2);
});
test('audits all required schema edges and shows row-level counts without identifiers',()=>{
 const result=engine.analyze(fixture(),{schoolId:'2'});
 for(const relationship of ['CC.SectionID → Sections.ID','Section_Meeting.SectionID → Sections.ID','Attendance.StudentID → Students.ID','Attendance.CCID → CC.ID','Attendance.Calendar_DayID → Calendar_Day.ID','Attendance.Attendance_CodeID → Attendance_Code.ID']){
  const link=result.relationships.find(x=>x.relationship===relationship);assert.ok(link,relationship);assert.equal(link.status,'matched');
 }
 assert.equal(JSON.stringify(result).includes('258837491'),false);
});
test('records missing source table and missing column instead of constructing joins',()=>{
 const src=fixture().filter(x=>!x.name.startsWith('Sections'));
 const result=engine.analyze(src,{schoolId:'2'});
 assert.equal(result.relationships.find(x=>x.relationship==='CC.SectionID → Sections.ID').status,'missing_table');
 src.push(file('Sections.export.csv',['SchoolID'],[['2']]));
 assert.equal(engine.analyze(src,{schoolId:'2'}).relationships.find(x=>x.relationship==='CC.SectionID → Sections.ID').status,'missing_key');
});
test('duplicate primary keys remain ambiguous and never count as unique matches',()=>{
 const src=fixture();src[2].rows.push(['909','SCI','12','2']);
 const rel=engine.analyze(src,{schoolId:'2'}).relationships.find(x=>x.relationship==='CC.SectionID → Sections.ID');
 assert.equal(rel.status,'ambiguous');assert.equal(rel.ambiguous,1);assert.equal(rel.matched,1);
 assert.equal(rel.unmatched_row_examples[0].issue,'duplicate_parent_id');
});
test('crosswalk conflicts are excluded, not arbitrarily assigned',()=>{
 const src=fixture();src[0].rows.push(['99','258837491','2','Wrong']);
 const bridge=engine.verifiedBridge(src,{schoolId:'2'});
 assert.equal(bridge.has('258837491'),false);
 const result=engine.analyze(src,{schoolId:'2'});
 assert.equal(result.id_bridge.uniquely_mapped_students,1);
 assert.equal(result.id_bridge.osis_conflicts,1);
});
test('historical CC enrollment scope excludes records after DateLeft',()=>{
 const src=fixture();src[1].rows[0][5]='2026-09-30';
 const result=engine.analyze(src,{schoolId:'2',onDate:'2026-10-01'});
 const edge=result.relationships.find(x=>x.relationship==='CC.StudentID → Students.ID');
 assert.equal(edge.scoped_child_rows,1);assert.equal(edge.matched,1);
 assert.equal(engine.analyze(src,{schoolId:'2'}).relationships.find(x=>x.relationship==='CC.StudentID → Students.ID').matched,2);
});
test('student names / teacher names are not used as a join key',()=>{
 const src=[file('Students.export.csv',['Student_Number','First_Name','Last_Name'],[['258837491','Taylor','Smith']]),file('CC.export.csv',['StudentID','SectionID'],[['55','909']])];
 const result=engine.analyze(src,{schoolId:'2'});
 assert.equal(result.id_bridge.uniquely_mapped_students,0);
 assert.equal(result.relationships.find(x=>x.relationship==='CC.StudentID → Students.ID').status,'missing_key');
});
test('school filter excludes CC records from another school, even if same student',()=>{
 const src=fixture();const result=engine.analyze(src,{schoolId:'2'});
 const rel=result.relationships.find(x=>x.relationship==='CC.StudentID → Students.ID');
 assert.equal(rel.scoped_child_rows,2);
 assert.equal(result.files.find(f=>f.type==='cc').scoped_rows,2);
});
test('per-field overrides can explicitly disable absent relationship key',()=>{
 const src=fixture();src[1].mapping.section_id=-1;
 assert.equal(engine.analyze(src,{schoolId:'2'}).relationships.find(x=>x.relationship==='CC.SectionID → Sections.ID').status,'missing_key');
});

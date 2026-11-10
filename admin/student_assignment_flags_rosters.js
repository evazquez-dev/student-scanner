(()=>{
'use strict';
// EAGLENEST_STUDENT_FLAGS_ROSTER_BATCH_PRINT_V1
// EAGLENEST_FLAG_REPORT_COURSE_TITLES_V1
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
const state={groups:new Map(),selected:new Set(),rows:[],rosterLoaded:false,loading:false,requestId:0,reportDate:'',batchSize:60};
const FLAG_NAMES={M:'Missing',A:'Absent',I:'Incomplete'};
const FLAG_ORDER=['M','A','I'];
const GROUP_TYPES=[['grade','Grade'],['department','Department'],['teacher','Teacher'],['course','Course'],['section','Section'],['advisory','Advisory']];
// Keep labels tied to the Grades & Attendance course catalog; never guess course titles.
function prettySectionLabel(sectionCode, courseName){
  const code=String(sectionCode||'').trim(), name=String(courseName||'').trim();
  if(!code||!name||name.replace(/\s+/g,'').toUpperCase()===code.split('.')[0].replace(/\s+/g,'').toUpperCase())return code||name||'Section';
  const suffix=code.includes('.')?code.split('.').slice(1).join('.').trim():'';
  return `${name}${suffix?` (${suffix})`:''}`;
}
function status(text){$('flagRosterStatus').textContent=text;}
function choice(id){return state.groups.get(id);}
function renderSelected(){
  $('flagRosterSelected').innerHTML=[...state.selected].map(id=>{
    const item=choice(id);if(!item)return'';
    return `<span class="flagRosterChip">${esc(item.label)} <button type="button" data-remove-scope="${esc(id)}" aria-label="Remove ${esc(item.label)}">×</button></span>`;
  }).join('')||'<span class="gbMeta">No rosters selected.</span>';
  $('flagRosterLoad').disabled=!state.selected.size||state.loading;
}
function invalidateRoster(){
  // A roster selection change invalidates any in-flight result and any old
  // student overview. Never print reports for a different saved selection.
  state.requestId++;
  state.loading=false;state.rows=[];state.rosterLoaded=false;
  $('flagRosterOverview').hidden=true;
  status('Roster selection changed. Choose Load roster to refresh the report.');
}
function addScope(id){
  if(!choice(id)||state.selected.has(id))return;
  invalidateRoster();
  if(id==='school:all'||id==='mine:all')state.selected.clear();
  else {state.selected.delete('school:all');state.selected.delete('mine:all');}
  state.selected.add(id);renderSelected();
}
function renderPicker(select,groups,placeholder){
  select.replaceChildren(new Option(placeholder,''));
  for(const row of groups.sort((a,b)=>collator.compare(a.label,b.label)))select.add(new Option(`${row.label}${row.student_count==null?'':` (${row.student_count})`}`,row.id));
  select.disabled=groups.length===0;
}
async function initRosters(){
  const block=$('flagRosterPicker');
  block.hidden=false;status('Loading roster selections…');
  let overview=null,rosters=null;
  const result=await Promise.allSettled([api('/admin/grades/overview'),api('/admin/my_rosters')]);
  if(result[0].status==='fulfilled')overview=result[0].value;
  if(result[1].status==='fulfilled')rosters=result[1].value;
  if(!overview){status('Roster explorer requires Grades & Attendance access. Individual student search remains available.');return;}
  const admin=['admin','super_admin'].includes(String(overview.viewer?.role||''));
  const possible=admin?overview.all_groups||[]:[...(overview.my_groups||[]),...(overview.leadership_groups||[])];
  const courseNames=new Map(possible.filter(row=>row?.type==='course'&&row.course_code&&row.label)
    .map(row=>[String(row.course_code).toUpperCase(),String(row.label)]));
  for(const row of possible){if(!row?.id)continue;
    const sectionCode=String(row.section_code||row.label||'');
    const courseName=courseNames.get(String(row.course_code||'').toUpperCase()) ||
      (row.type==='section'&&String(row.subtitle||'').endsWith(` · ${sectionCode}`)
        ? String(row.subtitle).slice(0,-(` · ${sectionCode}`).length) : '');
    state.groups.set(row.id,{
    id:row.id,label:row.type==='section'?prettySectionLabel(sectionCode,courseName):row.label||row.id,
    type:row.type,student_count:row.student_count,source:'group'});}
  const allId=admin?'school:all':'mine:all';
  if(!state.groups.has(allId))state.groups.set(allId,{id:allId,label:admin?'Entire school':'All my students',type:'mine',source:'group'});
  const options=$('flagRosterPickers');options.replaceChildren();
  for(const [type,label] of GROUP_TYPES){
    const found=[...state.groups.values()].filter(g=>g.type===type);
    if(!found.length)continue;
    const wrap=document.createElement('label');wrap.textContent=`${label} `;
    const select=document.createElement('select');select.dataset.scopePicker=type;
    renderPicker(select,found,`Add ${label.toLowerCase()}…`);wrap.appendChild(select);options.appendChild(wrap);
  }
  const allWrap=document.createElement('label');allWrap.textContent=admin?'Schoolwide ':'My students ';
  const allSelect=document.createElement('select');allSelect.dataset.scopePicker='all';
  renderPicker(allSelect,[state.groups.get(allId)],'Add population…');allWrap.appendChild(allSelect);options.prepend(allWrap);
  const owned=(rosters?.custom_rosters||[]).map(r=>({...r,rel:'My roster'}));
  const shared=(rosters?.shared_rosters||[]).map(r=>({...r,rel:`Shared by ${r.owner_name||r.owner_email||'staff'}`}));
  for(const row of [...owned,...shared]){
    const id=`roster:custom:${row.id}`;
    state.groups.set(id,{id,label:row.name||'Saved roster',type:'roster',source:'roster',
      ref:`custom:${row.id}`,student_count:row.student_count,subtitle:row.rel});
  }
  const personal=[...state.groups.values()].filter(x=>x.type==='roster').sort((a,b)=>collator.compare(a.label,b.label));
  $('flagMyRosterChoices').innerHTML=personal.length?personal.map(row=>
    `<button type="button" class="flagSavedRoster" data-add-scope="${esc(row.id)}"><strong>${esc(row.label)}</strong><small>${esc(row.subtitle)} · ${Number(row.student_count)||0} students</small></button>`
  ).join(''):'<span class="gbMeta">No owned or shared My Rosters found.</span>';
  status('Select one or more populations, then select Load roster. Groups are combined without duplicate students.');
  renderSelected();
}
function reportCounts(r){return {missing:Number(r?.summary?.missing)||0,absent:Number(r?.summary?.absent)||0,
  incomplete:Number(r?.summary?.incomplete)||0,unique:Number(r?.summary?.unique_assignments)||0};}
function redrawRoster(){
  const rows=state.rows;
  $('flagRosterOverview').hidden=false;
  const ready=rows.filter(r=>r.report?.available);
  $('flagRosterOverviewMeta').textContent=`${rows.length} roster student(s) · ${ready.length} with accessible gradebook snapshots · ${rows.length-ready.length} unavailable in gradebook snapshot`;
  $('flagRosterBody').innerHTML=rows.map(r=>{
    const c=reportCounts(r.report),available=!!r.report?.available;
    return `<tr><td><input type="checkbox" data-roster-check="${esc(r.osis)}" ${available&&r.selected?'checked':''} ${available?'':'disabled'} aria-label="Include ${esc(r.name)} in batch printing"></td>`+
      `<td>${available?`<button type="button" class="flagRosterStudentLink" data-roster-open="${esc(r.osis)}">${esc(r.name)}</button>`:`<strong>${esc(r.name)}</strong>`}<small>${esc(r.osis)}</small></td>`+
      `<td>${esc(r.grade_level||'—')}</td><td>${available?c.missing:'—'}</td><td>${available?c.absent:'—'}</td><td>${available?c.incomplete:'—'}</td><td>${available?c.unique:'—'}</td>`+
      `<td>${available?(c.missing+c.absent+c.incomplete?'Flagged work':'No flags'):'No accessible gradebook record'}</td></tr>`;
  }).join('');
  $('flagRosterPrint').disabled=!rows.some(r=>r.selected&&r.report?.available);
  $('flagRosterToggleAll').disabled=!ready.length;
}
async function loadRoster(){
  if(!state.selected.size||state.loading)return;
  const request=++state.requestId;
  state.loading=true;renderSelected();$('flagRosterOverview').hidden=true;$('flagRosterPrint').disabled=true;
  status('Loading the selected roster population…');
  try{
    const params=new URLSearchParams();
    for(const id of state.selected){const row=choice(id);if(row.source==='roster')params.append('roster',row.ref);else params.append('group',id);}
    const grades=await api('/admin/grades/students?'+params.toString());
    if(request!==state.requestId)return;
    if(grades.configured===false)throw new Error('Grades & Attendance population is not configured.');
    let rows=(grades.rows||[]).map(r=>({osis:String(r.osis||''),name:String(r.name||r.osis||''),grade_level:String(r.grade_level||''),report:null,selected:false})).filter(r=>/^\d{5,20}$/.test(r.osis));
    const byOsis=new Map();for(const r of rows)if(!byOsis.has(r.osis))byOsis.set(r.osis,r);
    rows=[...byOsis.values()].sort((a,b)=>collator.compare(a.name,b.name)||collator.compare(a.osis,b.osis));
    if(grades.returned_student_count!=null&&Number(grades.returned_student_count)>rows.length)
      throw new Error('Roster population contains students without usable PowerSchool numbers; cannot safely prepare the entire roster.');
    if(!rows.length){state.rows=[];redrawRoster();status('No students in selected scope.');return;}
    const numbers=rows.map(r=>r.osis);
    const reports=new Map();let snapshotId=null,reportDate='';
    for(let i=0;i<numbers.length;i+=state.batchSize){
      if(request!==state.requestId)return;
      status(`Reading flag snapshots for students ${i+1}–${Math.min(i+state.batchSize,numbers.length)} of ${numbers.length}…`);
      const batch=numbers.slice(i,i+state.batchSize);
      const res=await api('/admin/gradebook-analytics/student-flags/roster-batch?numbers='+encodeURIComponent(batch.join(',')));
      if(res.index_ready===false)throw new Error('Student flag index missing. Publish analytics after the latest Worker deployment.');
      if(!res.snapshot_id)throw new Error('Batch report endpoint not deployed correctly.');
      if(snapshotId&&snapshotId!==res.snapshot_id)throw new Error('Gradebook snapshot changed during roster loading. Reload the roster.');
      snapshotId=res.snapshot_id;reportDate=res.snapshot_date||reportDate;
      for(const report of res.reports||[])reports.set(String(report.student_number),report);
    }
    if(request!==state.requestId)return;
    for(const row of rows){row.report=reports.get(row.osis)||{available:false};row.selected=!!row.report.available;}
    state.reportDate=reportDate;state.rows=rows;state.rosterLoaded=true;redrawRoster();
    const missingFromGrades=Math.max(0,Number(grades.selected_student_count||0)-Number(grades.returned_student_count||0));
    status(`Roster loaded from the published gradebook snapshot (${state.reportDate||'date unavailable'}). Select students to print, or click a name to view their report.${missingFromGrades?` ${missingFromGrades} student(s) are missing from the Grades & Attendance population source and cannot be included in this batch.`:''}`);
    $('flagRosterOverview').scrollIntoView({block:'start',behavior:'smooth'});
  }catch(e){if(request===state.requestId){status(`Unable to load roster: ${e.message||String(e)}`);state.rows=[];$('flagRosterOverview').hidden=true;}}
  finally{if(request===state.requestId){state.loading=false;renderSelected();}}
}
function asItems(report){
  const items=[];
  for(const section of report.sections||[])for(const flag of section.by_flag||[])for(const cat of flag.categories||[])
    for(const assignment of cat.assignments||[])items.push({section:section.section_display_name||section.section_code||section.course_number||'Section',
      flag:FLAG_NAMES[flag.code]||flag.code,category:cat.category||'Uncategorized',assignment});
  return items;
}
function newPrintPage(row,number,index){
  const element=document.createElement('section');element.className='flagPrintPage';element.dataset.student=number;
  element.innerHTML=`<header class="flagPrintHeader"><div><strong>${esc(row.name)}</strong><small>Student ${esc(row.osis)} · Published snapshot ${esc(state.reportDate||'—')}</small></div><span class="flagPrintPageNumber">Page ${index}</span></header>`+
    `<div class="flagPrintContent"><table class="flagPrintTable"><thead><tr><th>Assignment</th><th>Due</th><th>Entry</th><th>Out of</th><th>%</th></tr></thead><tbody></tbody></table></div>`+
    '<footer class="flagPrintFooter">EagleNEST · Missing / Absent / Incomplete flags · PowerSchool snapshot · Read only</footer>';
  $('flagPrintRoot').appendChild(element);
  return {element,body:element.querySelector('tbody'),content:element.querySelector('.flagPrintContent'),rows:0,groupKey:''};
}
function groupMarkup(item){return `<tr class="flagPrintGroup"><td colspan="5">${esc(item.section)} · ${esc(item.flag)} · ${esc(item.category)}</td></tr>`;}
function rowMarkup(a){return `<tr><td class="flagPrintAssignment">${esc(a.name||'Unnamed assignment')}</td><td>${esc(a.due||'—')}</td>`+
  `<td>${a.entry==null||a.entry===''?'—':esc(a.entry)}</td><td>${a.max==null?'—':esc(a.max)}</td>`+
  `<td>${a.percent==null?'—':esc(Number(a.percent).toFixed(1))+'%'}</td></tr>`;}
function pageOverflow(page){return page.content.scrollHeight > page.content.clientHeight+1;}
function makeStudentPages(row){
  const list=asItems(row.report),pages=[];let page=newPrintPage(row,row.osis,1);pages.push(page);
  if(!list.length){page.body.insertAdjacentHTML('beforeend','<tr><td colspan="5">No Missing, Absent, or Incomplete assignments in accessible sections in this snapshot.</td></tr>');return pages.length;}
  for(const item of list){
    const group=`${item.section}\u0000${item.flag}\u0000${item.category}`;
    const addOne=()=>{
      const needsGroup=page.groupKey!==group;
      const html=(needsGroup?groupMarkup(item):'')+rowMarkup(item.assignment);
      const before=page.body.children.length;
      page.body.insertAdjacentHTML('beforeend',html);
      return {before,needsGroup};
    };
    let op=addOne();
    if(pageOverflow(page) && page.rows>0){
      while(page.body.children.length>op.before)page.body.lastElementChild.remove();
      page=newPrintPage(row,row.osis,pages.length+1);pages.push(page);op=addOne();
    }
    if(pageOverflow(page)){
      // A single unusually long assignment can exceed one page. Leave the
      // complete entry visible rather than silently truncating its contents.
      throw new Error(`Assignment entry for ${row.name} is too long for one printed page; shorten it before printing.`);
    }
    page.groupKey=group;page.rows++;
  }
  return pages.length;
}
function blankPrintPage(){const element=document.createElement('section');element.className='flagPrintPage flagPrintBlank';element.setAttribute('aria-label','Blank reverse side for double-sided printing');$('flagPrintRoot').appendChild(element);}
function preparePrint(rows,duplex){
  const root=$('flagPrintRoot');root.replaceChildren();
  if(!rows.length)throw new Error('Select at least one student with an accessible gradebook report.');
  for(let i=0;i<rows.length;i++){
    const count=makeStudentPages(rows[i]);
    // Every new student starts on the front of a physical sheet. If the last
    // student consumes an odd number of pages, a blank is NOT needed at end.
    if(duplex&&i<rows.length-1&&count%2===1)blankPrintPage();
  }
  root.lastElementChild?.classList.add('flagPrintLast');
  return root.children.length;
}
function printStudents(rows){
  const duplex=$('flagDuplex').checked;
  try{const pages=preparePrint(rows,duplex);
    status(`Prepared ${pages} print page(s)${duplex?' with blank reverse sides between students when required':''}. Set your printer to two-sided printing in the print dialog.`);
    window.print();
  }catch(e){status('Print preparation failed: '+(e.message||e));$('flagPrintRoot').replaceChildren();}
}
function printRoster(){
  const onlyFlagged=$('flagOnlyFlagged').checked;
  const rows=state.rows.filter(r=>r.selected&&r.report?.available&&(!onlyFlagged||Object.values(reportCounts(r.report)).some(x=>x>0)));
  printStudents(rows);
}
function printSingle(){
  const report=window.EagleNESTFlagRosters?.currentReport?.();
  if(!report?.student){status('Select a student before printing.');return;}
  const row={name:report.student.name||'Student',osis:report.student.number||report.student.key,report:{...report,available:true}};
  state.reportDate=report.snapshot_date||state.reportDate;
  printStudents([row]);
}
function wire(){
  $('flagRosterPickers').addEventListener('change',e=>{const sel=e.target.closest('[data-scope-picker]');if(!sel||!sel.value)return;addScope(sel.value);sel.value='';});
  $('flagMyRosterChoices').addEventListener('click',e=>{const b=e.target.closest('[data-add-scope]');if(b)addScope(b.dataset.addScope);});
  $('flagRosterSelected').addEventListener('click',e=>{const b=e.target.closest('[data-remove-scope]');if(!b)return;state.selected.delete(b.dataset.removeScope);invalidateRoster();renderSelected();});
  $('flagRosterLoad').addEventListener('click',loadRoster);
  $('flagRosterPrint').addEventListener('click',printRoster);
  $('flagRosterToggleAll').addEventListener('click',()=>{const ready=state.rows.filter(r=>r.report?.available);const all=ready.every(r=>r.selected);for(const row of ready)row.selected=!all;redrawRoster();});
  $('flagRosterBody').addEventListener('change',e=>{const b=e.target.closest('[data-roster-check]');if(!b)return;const r=state.rows.find(x=>x.osis===b.dataset.rosterCheck);if(r)r.selected=b.checked;redrawRoster();});
  $('flagRosterBody').addEventListener('click',e=>{const b=e.target.closest('[data-roster-open]');if(!b)return;const r=state.rows.find(x=>x.osis===b.dataset.rosterOpen);if(r?.report?.student?.key)selectStudent(r.report.student.key);});
}
window.EagleNESTFlagRosters={printSingle,currentReport:()=>window.EAGLENEST_CURRENT_FLAG_REPORT||null};
document.addEventListener('eaglenest-flags-auth-ready',()=>{wire();initRosters().catch(e=>status('Roster picker unavailable: '+e.message));},{once:true});
})();

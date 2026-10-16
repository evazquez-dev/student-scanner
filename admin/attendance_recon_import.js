// EAGLENEST_ATTENDANCE_RECON_BATCH6_FILE_WORKSPACE_V1
// Privacy boundary: File objects and row contents stay IN THIS BROWSER.
// No POST/upload endpoint, no persistence, no analytics, and no remote script dependency.
(() => {
 'use strict';
 const MAX_FILES=12,MAX_BYTES=18*1024*1024,MAX_ROWS=50000;
 const FIELD_ALIASES={
  osis:['student_number','studentnumber','osis','state_student_id','stateid','nyc_student_id','student_number_osis','student_number_id','state_student_number'],
  ps_id:['student_id','students_id','studentid','dcid','studentsdcid','powerschool_student_id','ps_student_id'],
  date:['school_date','attendance_date','date','att_date','calendar_date','day_date','att_date_value'],
  period:['period_local','period','period_number','period_abbreviation','period_abbr','expression','periodid','period_id'],
  ccid:['ccid'], // SectionID is NOT CCID; use relationship inspector
  calendar_day:['calendar_day_id','calendardayid','calendardaydcid','day_id'],
  code:['attendance_code','code','attendance_code_id','attendancecodeid','code_id','att_code','attendance_status','status','attendancecode'],
  in_session:['in_session','insession','school_in_session','insession_flag'],
  school_id:['school_id','schoolid'],
  course:['course','course_name','section','section_name','course_number'],
  teacher:['teacher','teacher_name','staff','teacher_last_name'],
  first:['first_name','firstname','student_first_name'],
  last:['last_name','lastname','student_last_name']
 };
 const FIELDS=['osis','ps_id','date','period','ccid','calendar_day','code','in_session','school_id','course','teacher','first','last'];
 const label={osis:'Student OSIS',ps_id:'PowerSchool student ID',date:'School date',period:'Period',ccid:'Attendance CCID (CC.ID)',calendar_day:'Calendar Day ID',code:'Attendance code',in_session:'In session',school_id:'School ID',course:'Course / section',teacher:'Teacher',first:'First name',last:'Last name'};
 let imports=[],suiteResult=null;
 const relationships=globalThis.EagleNESTPowerSchoolRelationships;
 if(!relationships)throw new Error('PowerSchool relationships module was not loaded first');
 function getScope(){return {schoolId:String($('relSchoolId')?.value||'').trim(),yearId:String($('relYearId')?.value||'').trim(),onDate:String($('relMembershipDate')?.value||'').trim()};}
 const $=id=>document.getElementById(id);
 const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
 function infer(headers){const h=headers.map(norm),result={};for(const k of FIELDS){const opts=FIELD_ALIASES[k]||[];const i=h.findIndex(x=>opts.includes(x));if(i>=0)result[k]=i;}return result;}
 function classify(file){const m=file.mapping;const has=k=>Number.isInteger(m[k]);const name=norm(file.name);
  if((has('ccid')||has('period'))&&has('code')&&(has('osis')||has('ps_id')))return 'meeting_attendance';
  if(has('calendar_day')&&(has('date')||has('in_session'))||has('in_session')&&has('date'))return 'calendar_days';
  if(has('code')&&has('date')&&(has('osis')||has('ps_id')))return 'daily_attendance';
  if((has('teacher')&&has('course'))||name.includes('section')&&has('teacher'))return 'teacher_sections';
  if((has('osis')||has('ps_id'))&&(has('first')||has('last'))||name.includes('student')&&has('osis'))return 'students';
  return 'unclassified';
 }
 function detectDelimiter(text){const lines=text.split(/\r?\n/).slice(0,8).filter(Boolean),scores={',':0,'\t':0,';':0,'|':0};for(const line of lines)for(const c of Object.keys(scores))scores[c]+=(line.match(new RegExp(c==='|'?'\\|':c==='\t'?'\\t':c===';'?';':',','g'))||[]).length;return Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];}
 function parseDelimited(input){const delimiter=detectDelimiter(input),out=[];let col='',row=[],quoted=false;
  for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){col+='"';i++;}else quoted=!quoted;continue;}
   if(!quoted&&(c===delimiter||c==='\n'||c==='\r')){row.push(col);col='';if(c!==delimiter){if(row.some(x=>x.trim()))out.push(row);row=[];if(c==='\r'&&input[i+1]==='\n')i++;if(out.length>MAX_ROWS+1)throw new Error('Too many rows; limit 50,000 per file');}continue;}
   col+=c;
  }if(quoted)throw new Error('CSV has an unclosed quoted field');if(col||row.length){row.push(col);if(row.some(x=>x.trim()))out.push(row);}return out;
 }
 function excelNumDate(v){const n=Number(v);if(!Number.isFinite(n)||n<1||n>90000)return String(v||'');return new Date(Date.UTC(1899,11,30)+Math.round(n)*86400000).toISOString().slice(0,10);}
 function dateKey(v){const s=String(v??'').trim();if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(0,10);if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)){const [mm,dd,yy]=s.split('/').map(Number);const t=new Date(Date.UTC(yy,mm-1,dd));return t.toISOString().slice(0,10)==='Invalid Date'?'':`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;}if(/^\d{4,5}(?:\.0+)?$/.test(s))return excelNumDate(s);return '';
 }
 function xml(s){const doc=new DOMParser().parseFromString(s,'application/xml');if(doc.querySelector('parsererror'))throw new Error('Invalid Excel XML');return doc;}
 const names=(root,tag)=>Array.from(root.getElementsByTagName(tag));
 async function unzipEntries(buffer){const b=new DataView(buffer),u=new Uint8Array(buffer),eocd=(()=>{for(let i=u.length-22;i>=Math.max(0,u.length-65558);i--)if(b.getUint32(i,true)===0x06054b50)return i;return -1;})();if(eocd<0)throw new Error('Not a supported XLSX ZIP file');
  const count=b.getUint16(eocd+10,true),start=b.getUint32(eocd+16,true);if(count>1500)throw new Error('Too many Excel entries');let pos=start,total=0;const map=new Map();for(let i=0;i<count;i++){
   if(b.getUint32(pos,true)!==0x02014b50)throw new Error('Invalid Excel directory');const method=b.getUint16(pos+10,true),compressed=b.getUint32(pos+20,true),uncompressed=b.getUint32(pos+24,true),nl=b.getUint16(pos+28,true),extra=b.getUint16(pos+30,true),comment=b.getUint16(pos+32,true),offset=b.getUint32(pos+42,true);const name=new TextDecoder().decode(u.slice(pos+46,pos+46+nl));pos+=46+nl+extra+comment;
   if(!/^(xl\/worksheets\/sheet\d+\.xml|xl\/sharedStrings\.xml|xl\/workbook\.xml)$/.test(name))continue;
   if(uncompressed>22*1024*1024)throw new Error('Excel XML sheet too large');total+=uncompressed;if(total>35*1024*1024)throw new Error('Excel uncompressed content exceeds safety limit');
   if(b.getUint32(offset,true)!==0x04034b50)throw new Error('Invalid Excel file entry');const lnl=b.getUint16(offset+26,true),lextra=b.getUint16(offset+28,true),at=offset+30+lnl+lextra;const bytes=u.slice(at,at+compressed);
   let expanded;if(method===0)expanded=bytes;else if(method===8){if(typeof DecompressionStream!=='function')throw new Error('This browser does not support built-in XLSX decompression; export CSV instead');const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));expanded=new Uint8Array(await new Response(stream).arrayBuffer());}else throw new Error('Unsupported Excel compression');
   if(expanded.length>22*1024*1024)throw new Error('Excel XML decompression limit exceeded');map.set(name,new TextDecoder('utf-8').decode(expanded));
  }return map;
 }
 async function parseXlsx(file){const items=await unzipEntries(await file.arrayBuffer());const sstr=items.get('xl/sharedStrings.xml');const shared=sstr?names(xml(sstr),'si').map(si=>names(si,'t').map(t=>t.textContent).join('')):[];
  const sheets=[...items.keys()].filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/\d+/g).pop())-Number(b.match(/\d+/g).pop()));if(!sheets.length)throw new Error('No Excel worksheets found');
  const parsed=[];for(const sheet of sheets.slice(0,12)){const doc=xml(items.get(sheet));const rows=names(doc,'row');const grid=[];for(const row of rows){const cells=[];for(const c of names(row,'c')){const ref=c.getAttribute('r')||'';const letters=ref.match(/^[A-Z]+/i)?.[0]||'';let index=0;for(const l of letters.toUpperCase())index=index*26+l.charCodeAt(0)-64;index--;if(index<0||index>255)continue;
    const t=c.getAttribute('t'),v=names(c,'v')[0]?.textContent||'';cells[index]=t==='s'?(shared[Number(v)]??''):t==='inlineStr'?names(c,'t').map(x=>x.textContent).join(''):v;
   }if(cells.some(x=>String(x||'').trim()))grid.push(Array.from({length:cells.length},(_,i)=>String(cells[i]??'')));if(grid.length>MAX_ROWS+1)throw new Error('Too many Excel rows');}
   if(grid.length)parsed.push({sheet:sheet.split('/').pop(),grid});
  }return parsed;
 }
 function parseHtmlTable(source){const doc=new DOMParser().parseFromString(source,'text/html');const table=doc.querySelector('table');if(!table)throw new Error('No HTML table found');return [...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>td.textContent.trim())).filter(r=>r.length&&r.some(Boolean));}
 async function loadFile(file){if(file.size>MAX_BYTES)throw new Error('File exceeds 18 MB preview cap');const name=file.name.toLowerCase();let sheets=[];
  if(name.endsWith('.xlsx'))sheets=await parseXlsx(file);else if(name.endsWith('.csv')||name.endsWith('.tsv')||name.endsWith('.txt'))sheets=[{sheet:'Data',grid:parseDelimited(await file.text())}];
  else if(name.endsWith('.xls')||name.endsWith('.html')||name.endsWith('.htm')){const text=await file.text();if(/<table[\s>]/i.test(text))sheets=[{sheet:'PowerSchool HTML table',grid:parseHtmlTable(text)}];else throw new Error('Binary .xls is not supported in this safe browser preview. Export as CSV or .xlsx.');}
  else throw new Error('Use CSV, TSV, TXT, XLSX or HTML-table XLS');
  return sheets.filter(x=>x.grid.length).map(item=>{const [headers,...rows]=item.grid;const cleanHeaders=headers.map((h,i)=>String(h||`Column ${i+1}`).slice(0,150));const record={id:Math.random().toString(36).slice(2),name:file.name,sheet:item.sheet,headers:cleanHeaders,rows:rows.slice(0,MAX_ROWS),mapping:infer(cleanHeaders)};record.role=relationships.roleFor(record);record.roleOverride='';return record;});
 }
 function appendCell(tr,s){const td=document.createElement('td');td.textContent=String(s??'');tr.append(td);}
 const read=(f,row,k)=>{const index=f.mapping[k];return Number.isInteger(index)?String(row[index]??'').trim():'';};
 function idCrosswalk(){
  const byOsis=new Map(),byPs=new Map(),sources=[];
  for(const f of imports){if(!Number.isInteger(f.mapping.osis)||!Number.isInteger(f.mapping.ps_id))continue;
   let found=0;for(const row of f.rows){const osis=read(f,row,'osis'),ps=read(f,row,'ps_id');if(!osis||!ps)continue;
    if(!byOsis.has(osis))byOsis.set(osis,new Set());byOsis.get(osis).add(ps);
    if(!byPs.has(ps))byPs.set(ps,new Set());byPs.get(ps).add(osis);found++;
   }sources.push({file:f.name,sheet:f.sheet,rows_with_both_ids:found});
  }
  const verified=new Map();let conflicts=0;
  for(const [osis,psids] of byOsis)if(psids.size===1){const ps=[...psids][0];if(byPs.get(ps)?.size===1)verified.set(osis,ps);else conflicts++;}else conflicts++;
  return {verified,conflicts,sources};
 }
 function analyse(){suiteResult=relationships.analyze(imports,getScope());return suiteResult;}
 function render(){const status=$('importStatus'),root=$('importCards');root.replaceChildren();const result=analyse();status.textContent=`${imports.length} worksheet(s), ${imports.reduce((n,f)=>n+f.rows.length,0).toLocaleString()} rows examined. Files remain in this browser; no upload to EagleNEST.`;
  for(const file of imports){const c=document.createElement('div');c.className='result';const title=document.createElement('strong');title.textContent=`${file.name} · ${file.sheet}`;c.append(title);const p=document.createElement('p');p.textContent=`${file.rows.length.toLocaleString()} data rows · Suggested: ${file.role}`;c.append(p);
   const roleBox=document.createElement('label');roleBox.textContent='PowerSchool source table';
   const roleSel=document.createElement('select');
   for(const kind of ['students','cc','sections','section_meeting','teachers','section_teachers','calendar_days','cycle_days','bell_schedule_items','bell_schedules','periods','attendance_codes','meeting_attendance','daily_attendance','courses','unclassified']){
     const op=document.createElement('option');op.value=kind;op.textContent=kind.replaceAll('_',' ');roleSel.append(op);
   }roleSel.value=file.role;roleSel.addEventListener('change',()=>{file.role=roleSel.value;file.roleOverride=roleSel.value;render();});roleBox.append(roleSel);c.append(roleBox);
   const controls=document.createElement('div');controls.className='mapping-grid';for(const field of FIELDS){const labelNode=document.createElement('label');labelNode.textContent=label[field];const sel=document.createElement('select');const opt=document.createElement('option');opt.value='';opt.textContent='Not mapped';sel.append(opt);file.headers.forEach((h,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=h;sel.append(o);});sel.value=Number.isInteger(file.mapping[field])?String(file.mapping[field]):'';sel.addEventListener('change',()=>{if(sel.value==='')delete file.mapping[field];else file.mapping[field]=Number(sel.value);if(!file.roleOverride)file.role=relationships.roleFor(file);refreshSummary();});labelNode.append(sel);controls.append(labelNode);}c.append(controls);
   const relDetails=document.createElement('details');const relHead=document.createElement('summary');relHead.textContent='PowerSchool relationship keys (review / correct)';relDetails.append(relHead);
   const relExplain=document.createElement('p');relExplain.textContent='Important: generic ID is the record primary key. CC.ID is CCID; CC.SectionID points to Sections.ID. Editing these keys affects only this browser preview.';relDetails.append(relExplain);
   const relGrid=document.createElement('div');relGrid.className='mapping-grid';
   for(const field of relationships.ROLE_FIELDS[file.role]||[]){
     const wrapper=document.createElement('label');wrapper.textContent=relationships.FIELD_LABELS[field]||field;
     const select=document.createElement('select');const none=document.createElement('option');none.value='-1';none.textContent='Not present / disable';select.append(none);
     file.headers.forEach((h,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=h;select.append(option);});
     const current=relationships.headerIndex(file,field);select.value=current<0?'-1':String(current);
     select.addEventListener('change',()=>{file.mapping[field]=Number(select.value);refreshSummary();});
     wrapper.append(select);relGrid.append(wrapper);
   }relDetails.append(relGrid);c.append(relDetails);
   const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Preview first 3 rows (contains student data)';details.append(summary);const pre=document.createElement('pre');pre.textContent=[file.headers,...file.rows.slice(0,3)].map(r=>r.join(' | ')).join('\n');details.append(pre);c.append(details);root.append(c);
  }
  refreshSummary();
 }
 function refreshSummary(){const info=analyse();const out=$('importAnalysis');out.textContent=JSON.stringify(info,null,2);
  const summary=$('relSummary'),body=$('relResults');
  if(summary){summary.textContent=`${info.id_bridge.uniquely_mapped_students.toLocaleString()} unique OSIS → Students.ID links · ${info.id_bridge.conflicts} ID conflicts · ${info.summary.relationships_matched} fully matched joins · ${info.summary.relationships_partial} partial joins · ${info.summary.relationships_blocked} blocked joins`;} 
  if(body){body.replaceChildren();for(const rel of info.relationships){const row=document.createElement('tr');for(const cell of [rel.relationship,rel.status,rel.matched??'—',rel.unmatched??'—',rel.ambiguous??'—',rel.missing||((rel.school_scope_unverified)?'School scope unverified':'')]){const td=document.createElement('td');td.textContent=String(cell);row.append(td);}body.append(row);}}const remote=window.__evidenceLatestAuditCoverage;const cmp=$('importRemoteComparison');if(remote?.days?.length){const known=new Map(remote.days.map(d=>[d.school_date,d]));const inferred=info.files.map(f=>{const matches=(f.date_range||'').match(/\d{4}-\d\d-\d\d/g);if(!matches)return null;const inRange=remote.days.filter(d=>d.school_date>=matches[0]&&d.school_date<=matches[1]);return {file:f.file,sheet:f.sheet,role:f.type,overlapping_dates:inRange.length,remote_warning_dates:inRange.filter(d=>d.warnings?.length).length};}).filter(Boolean);cmp.textContent=JSON.stringify({comparison:'Date-window overlap only, not an imported PowerSchool reconciliation',summary:inferred},null,2);}else cmp.textContent='Run historical coverage first to compare import date ranges with existing D1 history.';
 }
 async function process(files){if(!files.length)return;const status=$('importStatus');status.textContent='Reading files locally…';for(const file of [...files].slice(0,MAX_FILES-imports.length)){try{const result=await loadFile(file);imports.push(...result);if(imports.length>=MAX_FILES)break;}catch(e){const line=document.createElement('p');line.className='bad';line.textContent=`${file.name}: ${e.message||e}`;$('importErrors').append(line);}}render();}
 function matchesFor(student,date){const match=[],bridge=relationships.verifiedBridge(imports,getScope()).get(student);
  for(const rawFile of imports){const f=relationships.configure(rawFile);
   const osisCol=relationships.headerIndex(f,'osis')>=0,psCol=relationships.headerIndex(f,'ps_id')>=0;
   if(!osisCol&&!psCol)continue;
   const rows=relationships.scopeRows(f,{...getScope(),onDate:date||getScope().onDate}).rows.map(r=>r.row);
   const matched=rows.filter(row=>((osisCol&&relationships.pick(f,row,'osis')===student)||(!osisCol&&bridge&&psCol&&relationships.pick(f,row,'ps_id')===bridge))&&
     (relationships.headerIndex(f,'date')<0||dateKey(relationships.pick(f,row,'date'))===date));
   if(matched.length)match.push({file:f.name,sheet:f.sheet,kind:f.role,row_count:matched.length,columns:f.headers,
     rows:matched.slice(0,30).map(row=>Object.fromEntries(f.headers.map((h,i)=>[h,row[i]??'']))),truncated:matched.length>30});
  }return match;}
 function init(){const picker=$('psFiles');if(!picker)return;for(const field of ['relSchoolId','relYearId','relMembershipDate'])$(''+field)?.addEventListener('change',refreshSummary);$('relUseSelectedDate')?.addEventListener('click',()=>{$('relMembershipDate').value=$('schoolDate').value;refreshSummary();});picker.addEventListener('change',()=>{process(picker.files);picker.value='';});$('clearImports').addEventListener('click',()=>{imports=[];suiteResult=null;$('importErrors').replaceChildren();render();});$('copyImport').addEventListener('click',async()=>{const result=analyse();const text=JSON.stringify(result,null,2);try{await navigator.clipboard.writeText(text);$('importStatus').textContent='Copied schema, counts and join hints only; no imported data rows copied.';}catch{$('importStatus').textContent='Clipboard denied; copy from the import analysis panel.';}});
  $('compareImportStudent').addEventListener('click',()=>{const student=String($('studentSearch').value.match(/\d{5,15}/)?.[0]||'');const chosen=window.__evidenceSelectedStudent?.()||student;const date=$('schoolDate').value;if(!/^\d{5,15}$/.test(chosen)){ $('importStatus').textContent='Select a student by name/OSIS first.';return;}const found=matchesFor(chosen,date);$('importStudentResults').textContent=JSON.stringify({date,student_number:chosen,source_rows:found,privacy_warning:'Contains raw PowerSchool student data. Do not paste this full view into chat.'},null,2);});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
 window.EagleNESTAuditImports={refreshSummary};
})();

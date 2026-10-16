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
  ccid:['ccid','course_section_id','sectionid','section_id','sectionsdcid'],
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
 const label={osis:'Student OSIS',ps_id:'PowerSchool student ID',date:'School date',period:'Period',ccid:'CCID / Section ID',calendar_day:'Calendar Day ID',code:'Attendance code',in_session:'In session',school_id:'School ID',course:'Course / section',teacher:'Teacher',first:'First name',last:'Last name'};
 let imports=[],suiteResult=null;
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
  return sheets.filter(x=>x.grid.length).map(item=>{const [headers,...rows]=item.grid;const cleanHeaders=headers.map((h,i)=>String(h||`Column ${i+1}`).slice(0,150));const record={id:Math.random().toString(36).slice(2),name:file.name,sheet:item.sheet,headers:cleanHeaders,rows:rows.slice(0,MAX_ROWS),mapping:infer(cleanHeaders)};record.role=classify(record);return record;});
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
 function analyse(){const inventories=[],matches=[];let osisIndex=new Map(),psIndex=new Map(),calendarIndex=new Map();const crosswalk=idCrosswalk();
  for(const f of imports){let osis=0,ps=0,dates=new Set(),codes=new Set();for(const row of f.rows){const a=read(f,row,'osis'),b=read(f,row,'ps_id'),d=dateKey(read(f,row,'date'));if(a){osis++;if(!osisIndex.has(a))osisIndex.set(a,new Set());osisIndex.get(a).add(f.id);}if(b){ps++;if(!psIndex.has(b))psIndex.set(b,new Set());psIndex.get(b).add(f.id);}if(d)dates.add(d);const c=read(f,row,'code');if(c)codes.add(c);}
   inventories.push({file:f.name,sheet:f.sheet,type:f.role,rows:f.rows.length,columns:f.headers.length,field_mapping:Object.fromEntries(Object.entries(f.mapping).map(([k,i])=>[k,f.headers[i]])),osis_nonempty:osis,ps_id_nonempty:ps,date_range:dates.size?[...dates].sort()[0]+' to '+[...dates].sort().at(-1):null,distinct_dates:dates.size,attendance_code_examples:[...codes].slice(0,15)});
  }
  for(let i=0;i<imports.length;i++)for(let j=i+1;j<imports.length;j++){const a=imports[i],b=imports[j];let key='',matched=0,unmatched=0,ambiguous=0;
   if(Number.isInteger(a.mapping.osis)&&Number.isInteger(b.mapping.osis))key='osis';else if(Number.isInteger(a.mapping.ps_id)&&Number.isInteger(b.mapping.ps_id))key='ps_id';
   if(!key){
     if((Number.isInteger(a.mapping.osis)&&Number.isInteger(b.mapping.ps_id))||(Number.isInteger(a.mapping.ps_id)&&Number.isInteger(b.mapping.osis))){
      const osisFile=Number.isInteger(a.mapping.osis)?a:b,psFile=osisFile===a?b:a;
      const psValues=new Set(psFile.rows.map(r=>read(psFile,r,'ps_id')).filter(Boolean));
      for(const row of osisFile.rows){const osis=read(osisFile,row,'osis');if(!osis)continue;const ps=crosswalk.verified.get(osis);if(ps&&psValues.has(ps))matched++;else unmatched++;}
      matches.push({left:a.name+' / '+a.sheet,right:b.name+' / '+b.sheet,join:crosswalk.verified.size?'verified_unique_osis_to_ps_id_export_crosswalk':'not_safe',matched_left_rows:matched,unmatched_left_rows:unmatched,reason:'ID bridge inferred only from exports containing both unique OSIS and internal PowerSchool ID; verify school/year/date before relying on it'});
     }else matches.push({left:a.name+' / '+a.sheet,right:b.name+' / '+b.sheet,join:'not_safe',reason:'No shared ID domain and no valid unique crosswalk'});
   }
   else{const set=new Set(b.rows.map(r=>read(b,r,key)).filter(Boolean));for(const r of a.rows){const v=read(a,r,key);if(!v)continue;if(set.has(v))matched++;else unmatched++;}matches.push({left:a.name+' / '+a.sheet,right:b.name+' / '+b.sheet,join:key,matched_left_rows:matched,unmatched_left_rows:unmatched,note:'Student ID overlap only; verify same dates and sections before reconciliation'});}
  }
  const roleSet=new Set(imports.map(f=>f.role));const recommendations=[];
  if(!roleSet.has('students'))recommendations.push('Add a dated PowerSchool student enrollment export with both OSIS and PowerSchool internal student ID to bridge source ID domains.');
  if(!roleSet.has('calendar_days'))recommendations.push('Add school calendar / Calendar_Day records to confirm in-session dates and PowerSchool period IDs.');
  if(!roleSet.has('meeting_attendance'))recommendations.push('Add PowerSchool meeting attendance records including student ID, date, CCID, period and attendance code.');
  if(!roleSet.has('daily_attendance'))recommendations.push('Add official PowerSchool daily attendance including explicit codes (absence, late, E/EL/ISS/OSS), plus dated enrollment membership.');
  recommendations.push('Verify Calendar_DayID + PeriodID + CCID against a dated section membership source before matching official meeting records to EagleNEST local periods.');
  recommendations.push('A complete PowerSchool export may omit default Present rows; do not treat missing records as absent.');
  suiteResult={read_only:true,local_browser_only:true,files:inventories,id_bridge:{uniquely_mapped_students:crosswalk.verified.size,conflicts:crosswalk.conflicts,source_files:crosswalk.sources},joins:matches,recommendations};return suiteResult;
 }
 function render(){const status=$('importStatus'),root=$('importCards');root.replaceChildren();const result=analyse();status.textContent=`${imports.length} worksheet(s), ${imports.reduce((n,f)=>n+f.rows.length,0).toLocaleString()} rows examined. Files remain in this browser; no upload to EagleNEST.`;
  for(const file of imports){const c=document.createElement('div');c.className='result';const title=document.createElement('strong');title.textContent=`${file.name} · ${file.sheet}`;c.append(title);const p=document.createElement('p');p.textContent=`${file.rows.length.toLocaleString()} data rows · Suggested: ${file.role}`;c.append(p);
   const controls=document.createElement('div');controls.className='mapping-grid';for(const field of FIELDS){const labelNode=document.createElement('label');labelNode.textContent=label[field];const sel=document.createElement('select');const opt=document.createElement('option');opt.value='';opt.textContent='Not mapped';sel.append(opt);file.headers.forEach((h,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=h;sel.append(o);});sel.value=Number.isInteger(file.mapping[field])?String(file.mapping[field]):'';sel.addEventListener('change',()=>{if(sel.value==='')delete file.mapping[field];else file.mapping[field]=Number(sel.value);file.role=classify(file);refreshSummary();});labelNode.append(sel);controls.append(labelNode);}c.append(controls);
   const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Preview first 3 rows (contains student data)';details.append(summary);const pre=document.createElement('pre');pre.textContent=[file.headers,...file.rows.slice(0,3)].map(r=>r.join(' | ')).join('\n');details.append(pre);c.append(details);root.append(c);
  }
  refreshSummary();
 }
 function refreshSummary(){const info=analyse();const out=$('importAnalysis');out.textContent=JSON.stringify(info,null,2);const remote=window.__evidenceLatestAuditCoverage;const cmp=$('importRemoteComparison');if(remote?.days?.length){const known=new Map(remote.days.map(d=>[d.school_date,d]));const inferred=info.files.map(f=>{const matches=(f.date_range||'').match(/\d{4}-\d\d-\d\d/g);if(!matches)return null;const inRange=remote.days.filter(d=>d.school_date>=matches[0]&&d.school_date<=matches[1]);return {file:f.file,sheet:f.sheet,role:f.type,overlapping_dates:inRange.length,remote_warning_dates:inRange.filter(d=>d.warnings?.length).length};}).filter(Boolean);cmp.textContent=JSON.stringify({comparison:'Date-window overlap only, not an imported PowerSchool reconciliation',summary:inferred},null,2);}else cmp.textContent='Run historical coverage first to compare import date ranges with existing D1 history.';
 }
 async function process(files){if(!files.length)return;const status=$('importStatus');status.textContent='Reading files locally…';for(const file of [...files].slice(0,MAX_FILES-imports.length)){try{const result=await loadFile(file);imports.push(...result);if(imports.length>=MAX_FILES)break;}catch(e){const line=document.createElement('p');line.className='bad';line.textContent=`${file.name}: ${e.message||e}`;$('importErrors').append(line);}}render();}
 function matchesFor(student,date){const match=[];const bridge=idCrosswalk().verified.get(student);for(const f of imports){if(!Number.isInteger(f.mapping.osis)&&!Number.isInteger(f.mapping.ps_id))continue;const rowMatches=f.rows.filter(row=>((Number.isInteger(f.mapping.osis)&&read(f,row,'osis')===student)||(!Number.isInteger(f.mapping.osis)&&bridge&&read(f,row,'ps_id')===bridge))&&( !Number.isInteger(f.mapping.date)||dateKey(read(f,row,'date'))===date));if(rowMatches.length)match.push({file:f.name,sheet:f.sheet,kind:f.role,row_count:rowMatches.length,columns:f.headers,rows:rowMatches.slice(0,30).map(row=>Object.fromEntries(f.headers.map((h,i)=>[h,row[i]??'']))),truncated:rowMatches.length>30});}return match;}
 function init(){const picker=$('psFiles');if(!picker)return;picker.addEventListener('change',()=>{process(picker.files);picker.value='';});$('clearImports').addEventListener('click',()=>{imports=[];suiteResult=null;$('importErrors').replaceChildren();render();});$('copyImport').addEventListener('click',async()=>{const result=analyse();const text=JSON.stringify(result,null,2);try{await navigator.clipboard.writeText(text);$('importStatus').textContent='Copied schema, counts and join hints only; no imported data rows copied.';}catch{$('importStatus').textContent='Clipboard denied; copy from the import analysis panel.';}});
  $('compareImportStudent').addEventListener('click',()=>{const student=String($('studentSearch').value.match(/\d{5,15}/)?.[0]||'');const chosen=window.__evidenceSelectedStudent?.()||student;const date=$('schoolDate').value;if(!/^\d{5,15}$/.test(chosen)){ $('importStatus').textContent='Select a student by name/OSIS first.';return;}const found=matchesFor(chosen,date);$('importStudentResults').textContent=JSON.stringify({date,student_number:chosen,source_rows:found,privacy_warning:'Contains raw PowerSchool student data. Do not paste this full view into chat.'},null,2);});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
 window.EagleNESTAuditImports={refreshSummary};
})();

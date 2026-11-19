/* EAGLENEST_DEVICE_MANAGEMENT_V1 — Sys Admin only, no teacher checkout workflow. */
(() => {
  'use strict';
  // EAGLENEST_DEVICE_SCANNER_STATIONS_V1
  const $ = id => document.getElementById(id);
  const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
  const CLIENT_ID=document.querySelector('meta[name="google-client-id"]')?.content||'';
  // EAGLENEST_DEVICE_BORROWING_LOG_V1
  const borrowing=window.EAGLENEST_DEVICE_BORROWING_V1;
  if(!borrowing)throw new Error('Device borrowing module failed to load');
  // EAGLENEST_DEVICE_STUDENT_SEARCH_V1
  const studentPicker=window.EAGLENEST_DEVICE_STUDENT_PICKER_V1;
  if(!studentPicker)throw new Error('Device student picker script failed to load');
  const h = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sid=()=>window.EAGLENEST_AUTH?.getSid?.()||'';
  const nice=(value)=>{if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'}):String(value)};
  const label=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
  const url=(path)=>new URL(path.replace(/^\//,''),API_BASE);
  const showError=(err)=>{const e=$('dmMessage');e.className='dmMessage error';e.textContent=err?.message||String(err)};
  const message=(msg)=>{const e=$('dmMessage');e.className='dmMessage success';e.textContent=msg};
  async function api(path,method='GET',payload){
    const headers=new Headers();if(sid())headers.set('x-admin-session',sid());
    if(payload!==undefined)headers.set('content-type','application/json');
    const res=await fetch(url(path),{method,headers,credentials:'include',cache:'no-store',...(payload!==undefined?{body:JSON.stringify(payload)}:{})});
    const next=res.headers.get('x-admin-session');if(next)window.EAGLENEST_AUTH?.setSid?.(next);
    const data=await res.json().catch(()=>null);
    if(!res.ok||!data?.ok)throw new Error(data?.error||`HTTP ${res.status}`);
    return data;
  }
  const state={tab:'queue',summary:null,devices:[],tickets:[],carts:[],stations:[],selectedDevice:null,selectedStudent:'',student:null,deviceQuery:'',deviceStatus:'',ticketStatus:'',ticketQuery:'',ready:false};
  const deviceName=d=>(d?.asset_tag||d?.serial_number||d?.id?.slice(0,8)||'Device');
  const statusBadge=(value)=>{const type=['missing','retired','unusable'].includes(value)?'bad':['needs_repair','under_repair','waiting_parts','damaged','reported'].includes(value)?'warn':['available','ready','in_use','closed'].includes(value)?'good':'';return `<span class="dmTag ${type}">${h(label(value||'unknown'))}</span>`};
  const empty=text=>`<div class="dmEmpty">${h(text)}</div>`;
  const button=(action,title,id='',klass='')=>`<button type="button" class="dmButton dmSmall ${klass}" data-action="${h(action)}" ${id?`data-id="${h(id)}"`:''}>${h(title)}</button>`;
  // EAGLENEST_GOOGLE_ADMIN_DEVICE_LINK_V1
  // Google Admin exposes a stable ChromeOS device LIST and a serial search URL.
  // Avoid guessing an undocumented device-detail deep-link or using a device ID
  // in the list query, which expects serial number (id:SERIAL).
  const googleAdminDeviceUrl=serial=>{
    const sn=String(serial||'').trim();
    if(!/^[A-Za-z0-9._-]{3,100}$/.test(sn))return '';
    return 'https://admin.google.com/ac/chrome/devices/?q='+encodeURIComponent('id:"'+sn+'"')+'&sf=2&so=2';
  };
  const googleAdminDeviceLink=serial=>{
    const href=googleAdminDeviceUrl(serial);
    return href?`<a class="dmButton dmSmall" href="${h(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;margin-top:5px" title="Find this Chromebook by serial in Google Admin; select its serial to open details">Open in Google Admin ↗</a>`:'';
  };
  // EAGLENEST_REPAIR_OWNERSHIP_V1: An existing under-repair Chromebook can keep a primary owner.
  const deviceOpts=(selected='',onlyAvailable=false)=>'<option value="">Select device…</option>'+state.devices.filter(d=>!onlyAvailable||(!d.active_assignment_id && !d.home_station_id &&(['available','in_use'].includes(d.operational_status) ||(d.id===selected && ['needs_repair','under_repair'].includes(d.operational_status))))).map(d=>`<option value="${h(d.id)}" ${d.id===selected?'selected':''}>${h(deviceName(d))} · ${h(d.model||d.serial_number||'Chromebook')}</option>`).join('');
  const devicePicker=(selected='',onlyAvailable=false)=>`<label>Find device by asset tag / serial<input type="search" data-device-search="1" placeholder="Search all registered devices…" autocomplete="off"></label><label>Device<select name="device_id" data-device-select="1" required>${deviceOpts(selected,onlyAvailable)}</select></label>`;
  const cartOpts=(selected='')=>'<option value="">No home cart</option>'+state.carts.map(c=>`<option value="${h(c.id)}" ${c.id===selected?'selected':''}>${h(c.code)} (${h(c.room||c.campus||'Cart')})</option>`).join('');
  const stationOpts=(selected='')=>'<option value="">No scanner station</option>'+state.stations.map(s=>`<option value="${h(s.id)}" ${s.id===selected?'selected':''}>${h(s.label)} (${h(s.room||s.campus||s.code)})</option>`).join('');
  const optionList=(items,selected)=>items.map(k=>`<option value="${h(k)}" ${k===selected?'selected':''}>${h(label(k))}</option>`).join('');
  const field=(text,name,value='',type='text',extra='')=>`<label>${h(text)}<input name="${h(name)}" type="${h(type)}" value="${h(value)}" ${extra}></label>`;
  const selectField=(text,name,opts)=>`<label>${h(text)}<select name="${h(name)}">${opts}</select></label>`;
  const textArea=(text,name,value='')=>`<label>${h(text)}<textarea name="${h(name)}">${h(value)}</textarea></label>`;
  const row=(...items)=>`<div class="dmFormGrid">${items.join('')}</div>`;
  async function load(){
    const [summary,inventory,tickets,carts,stations]=await Promise.all([api('/admin/device-management/summary'),api('/admin/device-management/devices?limit=150'),api('/admin/device-management/tickets?limit=150'),api('/admin/device-management/carts?limit=150'),api('/admin/device-management/stations?limit=150')]);
    Object.assign(state,{summary,devices:inventory.devices||[],tickets:tickets.tickets||[],carts:carts.carts||[],stations:stations.stations||[]});
    $('dmStats').innerHTML=[
      ['Registered devices',(summary.device_counts||[]).reduce((n,x)=>n+Number(x.total||0),0)],
      ['Open issues',(summary.ticket_counts||[]).reduce((n,x)=>n+Number(x.total||0),0)],
      ['Missing devices',summary.missing],['Active temporary loans',summary.active_loaners]
    ].map(([title,count])=>`<article class="dmStat"><small>${h(title)}</small><b>${h(count)}</b></article>`).join('');
    render();
  }
  function setTab(tab){state.tab=tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));render();}
  function render(){if(!state.ready)return;
    if(state.tab==='queue')renderQueue();else if(state.tab==='inventory')renderInventory();else if(state.tab==='students')renderStudent();else if(state.tab==='stations')renderStations();else renderCarts();}
  function renderQueue(){
    const open=state.tickets.filter(t=>t.status!=='closed');
    $('dmPane').innerHTML=`<section class="dmPanel"><div class="dmRowHeading"><div><h2 class="dmTitle">IT Work Queue</h2><p class="dmMuted dmSmall">Active repair and missing-device tickets. Updates keep their full audit history.</p></div>${button('new-ticket','+ New issue')}${button('export-tickets','Export CSV')}</div>
      <div class="dmToolbar"><input id="dmTicketSearch" type="search" placeholder="Search tickets, asset tag, student OSIS…" value="${h(state.ticketQuery)}"><select id="dmTicketStatus"><option value="">All statuses</option>${optionList(['reported','received','diagnosing','repairing','waiting_parts','ready','closed'],state.ticketStatus)}</select></div>
      <div id="dmTicketRows"></div></section>`;
    const draw=()=>{const query=state.ticketQuery.toLowerCase(),rows=state.tickets.filter(t=>(!state.ticketStatus||t.status===state.ticketStatus)&&(!query||[t.ticket_number,t.title,t.description,t.asset_tag,t.serial_number,t.student_osis].join(' ').toLowerCase().includes(query)));
      $('dmTicketRows').innerHTML=rows.length?`<div class="dmTableWrap"><table class="dmTable"><thead><tr><th>Ticket</th><th>Device</th><th>Issue / Student</th><th>Stage</th><th>Last update</th><th></th></tr></thead><tbody>${rows.map(t=>`<tr><td><button class="dmLink" data-action="ticket" data-id="${h(t.id)}">${h(t.ticket_number)}</button></td><td>${h(t.asset_tag||t.serial_number)}</td><td>${h(t.title)}<div class="dmSmall dmMuted">${h(t.student_osis||'No student linked')}</div></td><td>${statusBadge(t.status)}</td><td>${h(nice(t.updated_at))}</td><td>${button('ticket','Open',t.id)}</td></tr>`).join('')}</tbody></table></div>`:empty('No matching tickets.');};
    let queryVersion=0;
    $('dmTicketSearch').oninput=async e=>{state.ticketQuery=e.target.value;const v=++queryVersion;draw();
      try{const data=await api('/admin/device-management/tickets?limit=150&q='+encodeURIComponent(state.ticketQuery));if(v!==queryVersion||state.tab!=='queue')return;state.tickets=data.tickets||[];draw();}
      catch(err){if(v===queryVersion)showError(err)}
    };$('dmTicketStatus').onchange=e=>{state.ticketStatus=e.target.value;draw()};draw();
  }
  function renderInventory(){
    $('dmPane').innerHTML=`<section class="dmPanel"><div class="dmRowHeading"><div><h2 class="dmTitle">Device Inventory</h2><p class="dmMuted dmSmall">A permanent record for every Chromebook. Search by serial, asset tag, or current student.</p></div>${button('google-lookup','Find in Google Admin')}${button('create-device','+ Add device')}${button('export-devices','Export CSV')}${button('export-assignments','Assignment CSV')}</div>
      <div class="dmToolbar"><input id="dmDeviceSearch" type="search" placeholder="Find device or student" value="${h(state.deviceQuery)}"><select id="dmDeviceStatus"><option value="">All statuses</option>${optionList(['available','in_use','needs_repair','under_repair','missing','retired'],state.deviceStatus)}</select></div><div id="dmInventoryRows"></div></section>`;
    const draw=()=>{const q=state.deviceQuery.toLowerCase(),devices=state.devices.filter(d=>(!state.deviceStatus||state.deviceStatus===d.operational_status)&&(!q||[d.asset_tag,d.serial_number,d.model,d.manufacturer,d.current_student_name,d.current_student_osis,d.station_code,d.station_label].join(' ').toLowerCase().includes(q)));
      $('dmInventoryRows').innerHTML=devices.length?`<div class="dmTableWrap"><table class="dmTable"><thead><tr><th>Device</th><th>Model / Serial</th><th>Student / Home</th><th>Condition</th><th>Status</th><th></th></tr></thead><tbody>${devices.map(d=>`<tr><td><button class="dmLink" data-action="device" data-id="${h(d.id)}">${h(deviceName(d))}</button></td><td>${h([d.manufacturer,d.model].filter(Boolean).join(' ')||'Chromebook')}<div class="dmSmall dmMuted">${h(d.serial_number)}</div></td><td>${h(d.current_student_name||d.current_student_osis||d.station_label||d.station_code||d.cart_code||d.device_pool)}<div class="dmSmall dmMuted">${h(d.assignment_kind||d.last_known_location)}</div></td><td>${statusBadge(d.condition)}</td><td>${statusBadge(d.operational_status)}</td><td>${!d.active_assignment_id && ['available','needs_repair','under_repair'].includes(d.operational_status) && !d.home_station_id?button('issue','Assign student',d.id):''}${button('device','Details',d.id)}${googleAdminDeviceLink(d.serial_number)}${d.current_student_osis?button('borrow-log','Log borrowing',d.id):''}</td></tr>`).join('')}</tbody></table></div>`:empty('No matching devices.');};
    let queryVersion=0;
    $('dmDeviceSearch').oninput=async e=>{state.deviceQuery=e.target.value;const v=++queryVersion;draw();
      try{const data=await api('/admin/device-management/devices?limit=150&q='+encodeURIComponent(state.deviceQuery));if(v!==queryVersion||state.tab!=='inventory')return;state.devices=data.devices||[];draw();}
      catch(err){if(v===queryVersion)showError(err)}
    };$('dmDeviceStatus').onchange=e=>{state.deviceStatus=e.target.value;draw()};draw();
  }
  function renderStations(){
    $('dmPane').innerHTML=`<section class="dmPanel"><div class="dmRowHeading"><div><h2 class="dmTitle">Scanner Stations</h2><p class="dmMuted dmSmall">Permanent homes for dedicated check-in laptops: bathrooms, lunch, front entrance, and other kiosks. These are not student assignments.</p></div>${button('create-station','+ Add station')}</div>
      ${state.stations.length?`<div class="dmCards">${state.stations.map(s=>`<article class="dmMiniCard"><h3>${h(s.label)}</h3><p class="dmSmall dmMuted">${h(s.code)} · ${h(label(s.purpose))}</p><p class="dmSmall">${h(s.campus||'Campus not specified')} · ${h(s.room||'Room not specified')}</p><p class="dmSmall">${h(s.device_count)} device(s) assigned as home</p><p>${s.flagged_count?statusBadge('needs_repair')+' '+h(s.flagged_count)+' attention needed':'No flagged devices'}</p><div class="dmDetailActions">${button('station','Edit station',s.id)}${button('station-devices','Show devices',s.id)}</div></article>`).join('')}</div>`:empty('No scanner stations yet. Add a station, then select it as the home on a device record.')}
      </section>`;
  }
  function renderCarts(){
    $('dmPane').innerHTML=`<section class="dmPanel"><div class="dmRowHeading"><div><h2 class="dmTitle">ChromeCarts</h2><p class="dmSmall dmMuted">Cart membership is a home assignment. No teacher scanning required.</p></div>${button('create-cart','+ Add cart')}</div>
      ${state.carts.length?`<div class="dmCards">${state.carts.map(c=>`<article class="dmMiniCard"><h3>${h(c.code)}</h3><p>${h(c.label||'Chromebook Cart')}</p><p class="dmMuted dmSmall">${h(c.campus)} · ${h(c.room)} · ${h(c.device_count)} devices / ${h(c.capacity||'unspecified')} slots</p><p>${c.flagged_count?statusBadge('needs_repair')+' '+h(c.flagged_count)+' attention needed':'No flagged devices'}</p><div class="dmDetailActions">${button('cart','Edit cart',c.id)}${button('cart-devices','Show devices',c.id)}</div></article>`).join('')}</div>`:empty('No carts registered yet. Add a cart and then link devices to it.')}
      </section>`;
  }
  async function showStudent(osis){
    state.selectedStudent=osis;state.student=null;setTab('students');
    if(!/^\d{9}$/.test(osis))return;
    $('dmStudentResult').innerHTML=empty('Loading history…');
    try{const result=await api('/admin/device-management/student?osis='+encodeURIComponent(osis));if(state.selectedStudent!==osis)return;state.student=result;renderStudent();}
    catch(e){showError(e)}
  }
  function renderStudent(){
    const data=state.student,osis=state.selectedStudent;
    $('dmPane').innerHTML=`<section class="dmPanel"><div class="dmRowHeading"><div><h2 class="dmTitle">Student Device History</h2><p class="dmSmall dmMuted">Every primary assignment, temporary loaner, checkout, issue and return is retained.</p></div>${button('issue','+ Issue device / loaner')}${button('export-assignments','Assignment CSV')}</div>
      <div class="dmToolbar"><input id="dmStudentSearch" type="search" placeholder="Search student by name or OSIS" autocomplete="off"><button id="dmLoadOsis" class="dmButton">Lookup OSIS</button><input id="dmStudentOsis" type="text" inputmode="numeric" maxlength="9" placeholder="9-digit OSIS" value="${h(osis)}" aria-label="Student OSIS"></div><div id="dmStudentSuggestions" class="dmSearchSuggestions"></div>
      <div id="dmStudentResult">${!data?empty('Search for a student or enter their OSIS to view permanent device history.'):studentHTML(data)}</div></section>`;
    let pending=0;
    $('dmStudentSearch').oninput=async e=>{const text=e.target.value.trim(),key=++pending;if(text.length<2){$('dmStudentSuggestions').innerHTML='';return;}
      try{const r=await api('/admin/device-management/students?q='+encodeURIComponent(text));if(key!==pending)return;$('dmStudentSuggestions').innerHTML=(r.students||[]).map(s=>`<button type="button" data-action="select-student" data-id="${h(s.osis)}">${h(s.name)} · ${h(s.osis)}</button>`).join('')||'<span class="dmMuted">No current-roster matches. Historical OSIS lookup still works.</span>';}catch{if(key===pending)$('dmStudentSuggestions').textContent='Student search unavailable.';}
    };
    $('dmLoadOsis').onclick=()=>showStudent($('dmStudentOsis').value.trim());
    $('dmStudentOsis').onkeydown=e=>{if(e.key==='Enter')showStudent(e.target.value.trim());};
  }
  function studentHTML(data){
    const active=(data.assignments||[]).filter(a=>!a.returned_at),history=data.assignments||[],tickets=data.tickets||[];
    const name=history[0]?.student_name||'Student';
    return `<h3 class="dmSub">${h(name)} · ${h(data.osis)}</h3><div class="dmCards">${active.length?active.map(a=>`<article class="dmMiniCard"><b>${h(label(a.kind))} · ${h(a.asset_tag||a.serial_number)}</b><p>${h([a.manufacturer,a.model].filter(Boolean).join(' '))}</p><p>${statusBadge(a.operational_status)}</p><p class="dmSmall dmMuted">Issued ${h(nice(a.assigned_at))}</p><div class="dmDetailActions">${button('device','Device history',a.device_id)}${button('return','End / return',a.id)}</div></article>`).join(''):empty('No devices currently issued.')}</div>
      <h3 class="dmSub">All assignments (${history.length})</h3>${history.length?`<div class="dmTableWrap"><table class="dmTable"><thead><tr><th>Issued</th><th>Type</th><th>Device</th><th>Ended</th><th>Outcome</th><th></th></tr></thead><tbody>${history.map(a=>`<tr><td>${h(nice(a.assigned_at))}</td><td>${h(label(a.kind))}</td><td>${h(a.asset_tag||a.serial_number)}</td><td>${h(nice(a.returned_at))}</td><td>${h(a.end_reason||'Active')}</td><td>${button('device','View',a.device_id)}</td></tr>`).join('')}</tbody></table></div>`:empty('No historical assignments yet.')}
      <h3 class="dmSub">Student-linked issues (${tickets.length})</h3>${tickets.length?`<div class="dmCards">${tickets.map(t=>`<article class="dmMiniCard"><b>${h(t.ticket_number)}</b><p>${h(t.title)}</p><p>${statusBadge(t.status)}</p>${button('ticket','Open ticket',t.id)}</article>`).join('')}</div>`:empty('No device issues linked to this student.')}
      ${borrowing.historyShell('student',data.osis)}<h3 class="dmSub">Chronological events</h3>${eventList(data.events||[])}`;
  }
  function eventList(events){return events.length?events.map(e=>{let detail={};try{detail=JSON.parse(e.details_json||'{}')}catch{};const changedHome=Object.prototype.hasOwnProperty.call(detail,'home_station_id')||Object.prototype.hasOwnProperty.call(detail,'home_cart_id');const oldHome=detail.home_station_id?.from||detail.home_cart_id?.from;const nextHome=detail.home_station_id?.to||detail.home_cart_id?.to;const homeLabel=(id)=>state.stations.find(s=>s.id===id)?.label||state.carts.find(c=>c.id===id)?.code||id||'None';const summary=changedHome?('Home: '+homeLabel(oldHome)+' → '+homeLabel(nextHome)):(detail.note||detail.resolution||detail.title||detail.reason||detail.student_name||detail.status_to||'');return `<div class="dmEvent"><b>${h(label(e.action))}</b><time>${h(nice(e.at_iso))} · ${h(e.actor_email)}</time><div class="dmSmall dmMuted">${h(summary)}</div></div>`}).join(''):empty('No activity recorded yet.')}
  function showDialog(title,html,action,submitLabel='Save'){
    $('dmDialogContent').innerHTML=`<div class="dmDialogHeader"><h2>${h(title)}</h2><button type="button" class="dmButton dmSmall" data-action="close-dialog">✕ Close</button></div><form id="dmForm" class="dmForm" data-save="${h(action)}">${html}<div class="dmDialogActions"><button type="button" class="dmButton" data-action="close-dialog">Cancel</button><button class="dmButton dmPrimary" type="submit">${h(submitLabel)}</button></div><div id="dmFormStatus" role="status" class="dmMuted dmSmall"></div></form>`;
    $('dmDialog').showModal();
    $('dmForm').onsubmit=submitForm;
    studentPicker.attach($('dmForm'),api);
  }
  function formData(form){const o={};for(const [key,v] of new FormData(form).entries())o[key]=String(v).trim();return o;}
  async function submitForm(e){e.preventDefault();const form=e.target,action=form.dataset.save,body={...formData(form),action};
    if(action==='cart_create'||action==='cart_update')body.capacity=Number(body.capacity||0);
    if(action==='ticket_update')body.cost_cents=Math.round(Number(body.cost_dollars||0)*100);
    const studentError=studentPicker.validate(form);
    if(studentError){$('dmFormStatus').textContent=studentError;return;}
    if(action==='assignment_issue'&&!/^\d{9}$/.test(body.student_osis)){$('dmFormStatus').textContent='Select a valid 9-digit student OSIS.';return;}
    if(action==='ticket_create'&&!body.device_id){$('dmFormStatus').textContent='Choose a device.';return;}
    const btn=form.querySelector('[type="submit"]');btn.disabled=true;$('dmFormStatus').textContent='Saving…';
    try{await api('/admin/device-management/mutate','POST',body);$('dmDialog').close();message('Saved. Permanent history updated.');await load();if(state.tab==='students'&&state.selectedStudent)await showStudent(state.selectedStudent);}
    catch(err){$('dmFormStatus').textContent=err.message||String(err);btn.disabled=false;}
  }
  function deviceForm(d){
    const fields=row(field('Asset tag','asset_tag',d?.asset_tag,'text'),field('Serial number','serial_number',d?.serial_number,'text'))+
      row(field('Manufacturer','manufacturer',d?.manufacturer),field('Model','model',d?.model))+
      row(field('Campus','campus',d?.campus),selectField('Pool','device_pool',optionList(['student','cart','loaner','spare'],d?.device_pool||'student')))+
      row(selectField('Home ChromeCart','home_cart_id',cartOpts(d?.home_cart_id)),field('Cart slot (optional)','cart_slot',d?.cart_slot||'','number','min="1" max="200"'))+
      selectField('Home Scanner Station','home_station_id',stationOpts(d?.home_station_id))+
      `<div class="dmHint">Select one home: a ChromeCart or a Scanner Station. Station laptops remain school equipment and should not be issued to students while assigned to a station.</div>`+
      row(selectField('Physical condition','condition',optionList(['excellent','good','fair','damaged','unusable'],d?.condition||'good')),selectField('Operational status','operational_status',optionList(['available','in_use','needs_repair','under_repair','missing','retired'],d?.operational_status||'available')))+
      row(field('Last confirmed location','last_known_location',d?.last_known_location),field('Device type','device_type',d?.device_type||'chromebook'))+
      row(field('Purchase date','purchase_date',d?.purchase_date,'date'),field('Warranty end','warranty_end',d?.warranty_end,'date'))+textArea('Notes','notes',d?.notes);
    showDialog(d?'Edit device':'Register device',(d?`<input type="hidden" name="device_id" value="${h(d.id)}">`:'')+fields,d?'device_update':'device_create');
    const form=$('dmForm');
    form.querySelector('[name="home_cart_id"]').onchange=e=>{if(e.target.value){form.querySelector('[name="home_station_id"]').value='';}};
    form.querySelector('[name="home_station_id"]').onchange=e=>{if(e.target.value){form.querySelector('[name="home_cart_id"]').value='';form.querySelector('[name="cart_slot"]').value='';}};
  }
  function cartForm(c){showDialog(c?'Edit ChromeCart':'Add ChromeCart',(c?`<input type="hidden" name="cart_id" value="${h(c.id)}">`:'')+
    row(field('Cart code','code',c?.code,'text','required'),field('Label','label',c?.label))+
    row(field('Campus','campus',c?.campus),field('Room','room',c?.room))+
    field('Capacity (0 = unspecified)','capacity',c?.capacity??0,'number','min="0" max="200"')+textArea('Notes','notes',c?.notes),c?'cart_update':'cart_create');}
  function stationForm(s){showDialog(s?'Edit Scanner Station':'Add Scanner Station',(s?`<input type="hidden" name="station_id" value="${h(s.id)}">`:'')+
    row(field('Station code','code',s?.code,'text','required'),field('Station name','label',s?.label,'text','required'))+
    row(selectField('Purpose','purpose',optionList(['bathroom','lunch','entrance','other'],s?.purpose||'bathroom')),field('Campus','campus',s?.campus))+
    field('Room / physical location','room',s?.room)+textArea('Notes','notes',s?.notes),
    s?'station_update':'station_create');}
  function assignmentForm(deviceId='',studentOsis='',kind='primary'){
    const chosen=state.devices.find(d=>d.id===deviceId)||
      (state.selectedDevice?.device?.id===deviceId?state.selectedDevice.device:null);
    const repairing=Boolean(chosen&&['needs_repair','under_repair'].includes(chosen.operational_status));
    showDialog(repairing?'Record Primary Student (Under Repair)':'Issue Chromebook / Loaner',devicePicker(deviceId,true)+
      (repairing?'<div class="dmHint">This Chromebook needs repair. You are recording its official primary student, not issuing a working laptop. Repair status and existing tickets will NOT change.</div>':
      '<div class="dmHint">Available, unassigned devices can be issued. A student can have one active primary Chromebook and additional loaners.</div>')+
      studentPicker.field({required:true,osis:studentOsis})+
      selectField('Assignment type','kind',repairing?optionList(['primary'],'primary'):optionList(['primary','loaner','short_term'],kind))+
      field('Expected return (optional)','expected_return','','date')+textArea('Notes / reason','notes'), 'assignment_issue',repairing?'Record primary student':'Issue device');
    if(chosen && !state.devices.some(d=>d.id===deviceId)){
      const picker=$('dmForm')?.querySelector('[name="device_id"]');
      if(picker && ![...picker.options].some(o=>o.value===deviceId))
        picker.add(new Option(`${deviceName(chosen)} · ${chosen.model||chosen.serial_number||'Chromebook'}`,deviceId));
      if(picker)picker.value=deviceId;
    }
  }
  function returnForm(a){showDialog('End assignment / return device',`<input type="hidden" name="assignment_id" value="${h(a.id)}">`+
    `<p>Device <b>${h(a.asset_tag||a.device_id)}</b> · ${h(label(a.kind))} · ${h(a.student_osis)}</p>`+
    selectField('Reason','reason',optionList(['returned','replaced','graduated','transferred','lost','other'],'returned'))+
    selectField('Condition on return (optional)','condition_in','<option value="">Not inspected</option>'+optionList(['excellent','good','fair','damaged','unusable'],''))+
    textArea('Return notes','notes'),'assignment_end','Record return / end');}
  function newTicketForm(deviceId=''){
    // Preselect the recorded assignee, when one exists. This is a ticket
    // association, not a new or changed Chromebook assignment.
    const listing=state.devices.find(d=>d.id===deviceId);
    const active=state.selectedDevice?.device?.id===deviceId
      ? state.selectedDevice?.assignments?.find(a=>!a.returned_at) : null;
    const ticketOsis=active?.student_osis||listing?.current_student_osis||'';
    const ticketStudentName=active?.student_name||listing?.current_student_name||'';
    showDialog('New repair / missing-device issue',devicePicker(deviceId)+
      `<div class="dmHint">Not registered yet? <button type="button" class="dmButton dmSmall" data-action="google-lookup">Find this serial in Google Admin</button></div>`+
      row(selectField('Issue type','category',optionList(['screen','keyboard','power','physical','software','missing','other'],'screen')),selectField('Priority','priority',optionList(['low','normal','high'],'normal')))+
      selectField('Device physically with IT?','possession',optionList(['yes','no','unknown'],'unknown'))+
      studentPicker.field({required:false,osis:ticketOsis,name:ticketStudentName})+
      field('Issue title (optional)','title','')+textArea('Reported problem','description'), 'ticket_create','Create ticket');
  }
  function progressForm(t){showDialog('Update '+t.ticket_number,`<input type="hidden" name="ticket_id" value="${h(t.id)}">`+
    selectField('Repair stage','status',optionList(['reported','received','diagnosing','repairing','waiting_parts','ready'],t.status))+
    field('Assigned Sys Admin','assigned_to',t.assigned_to)+textArea('Diagnosis','diagnosis',t.diagnosis)+textArea('Work performed / update','note')+
    row(field('Parts used','parts',''),field('Add cost ($)','cost_dollars','0','number','step="0.01" min="0"')),'ticket_update','Save update');}
  function closeForm(t){showDialog('Resolve '+t.ticket_number,`<input type="hidden" name="ticket_id" value="${h(t.id)}">`+
    selectField('Outcome','outcome',optionList(['repaired','found','replaced','retired','unrepairable','no_fault','other'],'repaired'))+
    textArea('Work performed / final resolution','resolution')+
    `<label>Find replacement device (optional)<input data-device-search="1" type="search" placeholder="Search by serial / asset tag"></label>`+selectField('Replacement device (if outcome = Replaced)','replacement_device_id',deviceOpts())+
    `<div class="dmHint">If retiring a device, first end any active student assignment. A replaced ticket links the devices; primary assignment transfers are recorded separately.</div>`, 'ticket_close','Close ticket');}
  async function deviceDetails(id){
    const details=await api('/admin/device-management/device?id='+encodeURIComponent(id)),d=details.device;
    const googleInfo=await api('/admin/device-management/google/device?device_id='+encodeURIComponent(id)).catch(()=>({linked:false}));
    const ongoing=(details.tickets||[]).find(t=>t.status!=='closed'),active=(details.assignments||[]).find(a=>!a.returned_at);
    const assignmentHTML=(details.assignments||[]).map(a=>`<div class="dmEvent"><b>${h(label(a.kind))} · ${h(a.student_name||a.student_osis)}</b><time>Issued ${h(nice(a.assigned_at))} · Ended ${h(nice(a.returned_at))}</time><span class="dmMuted dmSmall">${h(a.end_reason||'Currently issued')}</span> ${!a.returned_at?button('return','End assignment',a.id):''}</div>`).join('');
    const ticketHTML=(details.tickets||[]).map(t=>`<div class="dmEvent"><b>${h(t.ticket_number)} · ${h(t.title)}</b><time>${h(nice(t.created_at))} · ${h(t.created_by)}</time>${statusBadge(t.status)} ${button('ticket','View ticket',t.id)}</div>`).join('');
    $('dmDialogContent').innerHTML=`<div class="dmDialogHeader"><h2>${h(deviceName(d))} · Device Record</h2>${button('close-dialog','Close')}</div>
      <p class="dmMuted">${h([d.manufacturer,d.model].filter(Boolean).join(' '))} · Serial ${h(d.serial_number||'not recorded')}</p>
      <div class="dmPillRow">${statusBadge(d.operational_status)}${statusBadge(d.condition)}${statusBadge(d.device_pool)}</div>
      <p class="dmSmall">Home: ${h(d.home_station_id?(state.stations.find(s=>s.id===d.home_station_id)?.label||'Scanner Station'):(d.home_cart_id?(state.carts.find(c=>c.id===d.home_cart_id)?.code||'ChromeCart'):'None assigned'))} · Campus: ${h(d.campus||'—')}</p>
      <p class="dmSmall">Last confirmed location: ${h(d.last_known_location||'Not confirmed')} ${d.location_confirmed_at?'(updated '+h(nice(d.location_confirmed_at))+')':''}</p>
      <div class="dmDetailActions">${button('edit-device','Edit details',d.id)}${!ongoing?button('new-ticket','Report issue',d.id):button('ticket','Open issue',ongoing.id)}${!active&&['available','needs_repair','under_repair'].includes(d.operational_status)&&!d.home_station_id?button('issue','Assign student',d.id):''}${button('note','Add note',d.id)}${active?button('borrow-log','Log borrowing',d.id):''}</div>
      <h3 class="dmSub">Google Admin reference</h3>
      <div class="dmDetailActions">${googleAdminDeviceLink(d.serial_number||googleInfo?.device?.serial_number)}</div>
      ${googleInfo.linked?`<div class="dmHint"><b>${h(googleInfo.device.model||'ChromeOS device')}</b> · ${h(googleInfo.device.google_status)}
      <p>Serial: ${h(googleInfo.device.serial_number)} · Google asset: ${h(googleInfo.device.asset_tag||'—')}</p>
      <p>OU: ${h(googleInfo.device.org_unit_path||'—')} · ChromeOS: ${h(googleInfo.device.chromeos_version||'—')} · Last sync: ${h(googleInfo.device.last_sync||'—')}</p>
      <p>Annotated user: ${h(googleInfo.device.annotated_user||'—')} (not a verified school assignment)</p>
      <p>Last imported: ${h(nice(googleInfo.last_fetched_at))}</p>
      ${button('google-refresh','Refresh Google metadata',d.id)}</div>`:
      `<p class="dmSmall dmMuted">No Google Admin record linked. ${button('google-lookup','Find by serial')}</p>`}
      <!-- EAGLENEST_DEVICE_GOOGLE_RECENT_USERS_ON_DEMAND_V1 -->
      <h3 class="dmSub">Recent Google users (on demand)</h3>
      <p class="dmSmall dmMuted">View recent Google sign-ins for this Chromebook. This does not change student assignments or repair records.</p>
      ${googleInfo.linked||d.serial_number?`<div class="dmDetailActions">${button('google-recent-users','Load recent users',d.id)}</div>
      <div id="dmGoogleRecentUsers" class="dmSmall dmMuted" role="status" aria-live="polite">Not loaded. Click the button to request live Google Admin data.</div>`:
      '<p class="dmSmall dmMuted">Add a serial number or link this Chromebook to Google Admin to look up recent users.</p>'}
      <h3 class="dmSub">Assignment history (${details.assignments.length})</h3>${assignmentHTML||empty('No assignments yet.')}
      <h3 class="dmSub">Issues and repairs (${details.tickets.length})</h3>${ticketHTML||empty('No repair tickets yet.')}
      ${borrowing.historyShell('device',d.id)}<h3 class="dmSub">Permanent activity log</h3>${eventList(details.events||[])}`;
    $('dmDialog').showModal();
    // Retain records in case an assignment-end button is clicked inside the detail dialog.
    state.selectedDevice=details;
  }
  async function ticketDetails(id){
    const ticket=state.tickets.find(t=>t.id===id)||state.selectedDevice?.tickets?.find(t=>t.id===id);if(!ticket)throw new Error('Ticket not in current page; refresh first.');
    const details=await api('/admin/device-management/device?id='+encodeURIComponent(ticket.device_id));
    const updates=(details.updates||[]).filter(u=>u.ticket_id===id);
    $('dmDialogContent').innerHTML=`<div class="dmDialogHeader"><h2>${h(ticket.ticket_number)}</h2>${button('close-dialog','Close')}</div>
      <h3>${h(ticket.title)}</h3><p>${statusBadge(ticket.status)} ${statusBadge(ticket.priority)}</p>
      <p class="dmSmall">Device: <button class="dmLink" data-action="device" data-id="${h(ticket.device_id)}">${h(ticket.asset_tag||ticket.serial_number)}</button> · Student OSIS: ${h(ticket.student_osis||'—')}</p>
      <p>${h(ticket.description)}</p><p><b>Diagnosis:</b> ${h(ticket.diagnosis||'Pending')}</p><p><b>Resolution:</b> ${h(ticket.resolution||'Pending')}</p><p class="dmSmall dmMuted">Assigned: ${h(ticket.assigned_to||'Unassigned')} · Total cost: $${(Number(ticket.cost_cents||0)/100).toFixed(2)}</p>
      <div class="dmDetailActions">${ticket.status!=='closed'?button('ticket-progress','Update / diagnosis',id)+button('ticket-close','Resolve ticket',id):''}</div>
      <h3 class="dmSub">Repair notes and stage history</h3>${updates.length?updates.map(u=>`<div class="dmEvent"><b>${h(label(u.update_type))} · ${h(label(u.status_to||u.status_from))}</b><time>${h(nice(u.at_iso))} · ${h(u.actor_email)}</time><p>${h(u.note||'Status/diagnosis updated')}</p>${u.parts?`<p class="dmSmall">Parts: ${h(u.parts)}</p>`:''}</div>`).join(''):empty('No updates yet.')}`;
    $('dmDialog').showModal();
  }
  function noteForm(id){showDialog('Add device note',`<input type="hidden" name="device_id" value="${h(id)}">`+
    field('Student OSIS (optional, to link this note to their history)','student_osis','')+textArea('Note','note'),'device_note','Add note');}
  // No student identifiers are sent to external services; exports stay local.
  async function exportCsv(type){
    const data=await api('/admin/device-management/export?type='+encodeURIComponent(type));
    const rows=data.rows||[];
    if(!rows.length){message('No '+type+' records to export yet.');return;}
    const keys=Object.keys(rows[0]);
    const escapeCsv=value=>{
      let raw=String(value??'');
      // Spreadsheet formula injection prevention for user-editable fields.
      if(/^[\s]*[=+@-]/.test(raw))raw="'"+raw;
      return '"'+raw.replaceAll('"','""')+'"';
    };
    const csv=[keys.join(','),...rows.map(row=>keys.map(key=>escapeCsv(row[key])).join(','))].join('\r\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const href=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=href;a.download=`eaglenest_${type}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(href);
    message('Exported '+rows.length+' '+type+' rows.'+(data.truncated?' WARNING: export capped at 10,000 rows.':''));
  }
  // EAGLENEST_DEVICE_GOOGLE_ADMIN_V1_UI
  // Google results never directly establish student custody. Import/register is
  // an explicit Sys Admin action; then issue primary/loaner using existing flows.
  let googleResults = [];
  let googleReturnToTicket = false;
  let googleRequestSeq = 0;
  let googleLookupMode = 'serial';
  let googleActiveEmail = '';
  let googleEmailNextToken = '';
  // EAGLENEST_GOOGLE_ROSTER_RECENT_USER_MATCH_V1
  // Existing Sys Admin roster lookup already searches name, OSIS and email.
  // Return only suggestions here; never download the entire student roster.
  let googleStudentMatches=[];
  let googleStudentSearchSeq=0;
  async function googleSearchStudentName(){
    const query=String($('dmGoogleStudentName')?.value||'').trim();
    const seq=++googleStudentSearchSeq;
    const list=$('dmGoogleStudentMatches');
    if(!list)return;
    googleStudentMatches=[];
    if(query.length<2){list.textContent='';$('dmGoogleStudentResolved').textContent='';return;}
    list.textContent='Searching EagleNEST student roster…';
    $('dmGoogleStudentResolved').textContent='Select a matching student to use their registered email.';
    try{
      const found=await api('/admin/device-management/students?q='+encodeURIComponent(query));
      if(seq!==googleStudentSearchSeq || !googleDialog().open || !list.isConnected)return;
      googleStudentMatches=Array.isArray(found.students)?found.students:[];
      list.innerHTML=googleStudentMatches.length?googleStudentMatches.map((student,index)=>
        `<button type="button" data-google-student-pick="${index}" ${!student.email?'disabled':''}>
          ${h(student.name||student.osis)} · ${h(student.osis)}
          <span class="dmMuted dmSmall">${h(student.email||'No email registered')}</span>
        </button>`).join(''):
        '<span class="dmMuted dmSmall">No roster matches. Try another name or OSIS.</span>';
      if(googleStudentMatches.length && !googleStudentMatches.some(student=>student.email))
        $('dmGoogleStudentResolved').textContent='Matching student(s) have no email in the current roster. You may enter an email manually.';
    }catch(error){
      if(seq===googleStudentSearchSeq && list.isConnected)
        list.textContent='Student lookup failed: '+(error?.message||String(error));
    }
  }
  function googleChooseStudent(index){
    const student=googleStudentMatches[index];
    if(!student?.email)return;
    ++googleStudentSearchSeq;
    $('dmGoogleRecentEmail').value=String(student.email).trim();
    $('dmGoogleStudentName').value=String(student.name||student.osis);
    $('dmGoogleStudentMatches').textContent='';
    $('dmGoogleStudentResolved').textContent=
      `Selected ${student.name||student.osis} · OSIS ${student.osis} · ${student.email}`;
    // Selecting a student is an explicit request: run the Google search now.
    void googleSearchRecentUser();
  }
  function googleDialog() { return $('dmGoogleDialog'); }
  async function openGoogleLookup(){
    googleReturnToTicket=Boolean($('dmDialog').open && $('dmForm')?.dataset.save==='ticket_create');
    googleResults=[];googleLookupMode='serial';googleActiveEmail='';googleEmailNextToken='';
    googleStudentMatches=[];++googleStudentSearchSeq;
    googleDialog().showModal();
    $('dmGoogleBody').innerHTML=`<div class="dmDialogHeader"><h2>Find Chromebook in Google Admin</h2><button type="button" class="dmButton dmSmall" data-google-close>Close</button></div>
      <p class="dmSmall dmMuted">Search enrolled and retained deprovisioned ChromeOS records by serial number. Google annotations are not student assignments.</p>
      <div class="dmInline"><input id="dmGoogleSerial" class="dmInput" aria-label="Chromebook serial number" placeholder="Scan or enter serial number" autocomplete="off">
      <button type="button" id="dmGoogleSearch" class="dmButton dmPrimary">Search Google</button></div>
      <p class="dmSmall dmMuted" style="margin:12px 0 5px">Find a student by name or OSIS (optional):</p>
      <input id="dmGoogleStudentName" class="dmInput" type="search" aria-label="Find student by name or OSIS" placeholder="Type a student name or OSIS…" autocomplete="off">
      <div id="dmGoogleStudentMatches" class="dmSearchSuggestions" role="listbox" aria-label="Matching students"></div>
      <p id="dmGoogleStudentResolved" class="dmMuted dmSmall" role="status"></p>
      <div class="dmInline" style="margin-top:12px;align-items:center;flex-wrap:wrap">
        <input id="dmGoogleRecentEmail" class="dmInput" type="email" aria-label="Student school email, recent Chromebook users" placeholder="Student email (recent users)" autocomplete="off">
        <button type="button" id="dmGoogleRecentSearch" class="dmButton">Find devices by email</button></div>
      <p class="dmSmall dmMuted">Recent-user results are Google login history, not verified ownership. Last sync is not a login time.</p>
      <p id="dmGoogleStatus" class="dmMuted dmSmall" role="status">Checking connection…</p><div id="dmGoogleMatches"></div>
      <div class="dmDetailActions"><button type="button" id="dmGoogleLoadMore" class="dmButton dmSmall" hidden>Load more matches</button></div>
      <div class="dmDetailActions"><button type="button" class="dmButton dmSmall" data-google-manual>Register a device manually</button></div>`;
    const currentSerial=$('dmForm')?.querySelector('[data-device-search]')?.value || '';
    $('dmGoogleSerial').value=currentSerial;
    $('dmGoogleSerial').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void googleSearch();}};
    $('dmGoogleSearch').onclick=()=>void googleSearch();
    $('dmGoogleStudentName').oninput=()=>void googleSearchStudentName();
    $('dmGoogleRecentEmail').oninput=()=>{$('dmGoogleStudentResolved').textContent='';};
    $('dmGoogleRecentEmail').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void googleSearchRecentUser();}};
    $('dmGoogleRecentSearch').onclick=()=>void googleSearchRecentUser();
    $('dmGoogleLoadMore').onclick=()=>void googleSearchRecentUser(true);
    $('dmGoogleSerial').focus();
    try{
      const status=await api('/admin/device-management/google/status');
      if(!googleDialog().open)return;
      $('dmGoogleStatus').textContent=status.configured?
        'Cloudflare credentials configured. Search to verify Google authorization.':
        'Google credentials not yet configured in Cloudflare. See the overlay README for setup.';
    }catch(e){if(googleDialog().open)$('dmGoogleStatus').textContent=e.message||String(e);}
  }
  async function googleSearch(){
    const serial=$('dmGoogleSerial')?.value.trim()||'';
    if(!/^[A-Za-z0-9_.-]{3,100}$/.test(serial)){
      $('dmGoogleStatus').textContent='Enter at least three serial-number characters (letters, digits, dash, dot or underscore).';return;
    }
    const seq=++googleRequestSeq;
    googleLookupMode='serial';googleEmailNextToken='';$('dmGoogleLoadMore').hidden=true;
    $('dmGoogleSearch').disabled=true;
    $('dmGoogleStatus').textContent='Searching Google Admin…';
    $('dmGoogleMatches').textContent='';
    try{
      const found=await api('/admin/device-management/google/lookup?serial='+encodeURIComponent(serial));
      if(seq!==googleRequestSeq||!googleDialog().open)return;
      googleResults=found.devices||[];
      $('dmGoogleStatus').textContent=googleResults.length?
        `${googleResults.length} matching Google record(s). Choose the correct serial.`:
        'No Google records found. The device may have been deleted, or it may never have been enrolled in this Workspace.';
      $('dmGoogleMatches').innerHTML=googleResults.map((d,index)=>`<div class="dmGoogleMatch">
          <div><strong>${h(d.model||'ChromeOS device')}</strong> ${statusBadge(d.google_status.toLowerCase())}
          <div class="dmSmall">Serial: <b>${h(d.serial_number)}</b> · Asset: ${h(d.asset_tag||'—')}</div>
          <div class="dmMuted dmSmall">${h(d.org_unit_path||'No OU')} · Last sync: ${h(d.last_sync||'Unknown')}</div>
          ${d.annotated_user?`<div class="dmMuted dmSmall">Google annotated user: ${h(d.annotated_user)} (not a confirmed assignment)</div>`:''}
          ${d.local_device_id?'<div class="dmSmall">Already in EagleNEST inventory</div>':''}
           ${googleAdminDeviceLink(d.serial_number)}
          </div><button type="button" class="dmButton dmSmall" data-google-pick="${index}">${d.local_device_id?'Select existing':'Import & select'}</button></div>`).join('');
    }catch(e){if(seq===googleRequestSeq&&googleDialog().open)$('dmGoogleStatus').textContent='Google lookup failed: '+(e.message||String(e));}
    finally{if(seq===googleRequestSeq&&$('dmGoogleSearch'))$('dmGoogleSearch').disabled=false;}
  }
  // EAGLENEST_GOOGLE_RECENT_USER_SEARCH_V1
  // Email searches use Google's own recent_user filter. The snapshot does not
  // contain this history, and "Last sync" is NOT a login timestamp.
  async function googleSearchRecentUser(append=false){
    const email=String($('dmGoogleRecentEmail')?.value||'').trim().toLowerCase();
    if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)||email.length>254){
      $('dmGoogleStatus').textContent='Enter a complete school email address.';return;
    }
    if(append && (!googleEmailNextToken||googleLookupMode!=='recent'||email!==googleActiveEmail))return;
    const seq=++googleRequestSeq;
    const cursor=append?googleEmailNextToken:'';
    if(!append){googleResults=[];googleEmailNextToken='';$('dmGoogleMatches').textContent='';}
    googleLookupMode='recent';googleActiveEmail=email;
    $('dmGoogleRecentSearch').disabled=true;
    $('dmGoogleLoadMore').disabled=true;
    $('dmGoogleStatus').textContent=append?'Loading more Google matches…':'Searching recent sign-ins across managed Chromebooks…';
    try{
      const qs=new URLSearchParams({email});if(cursor)qs.set('page_token',cursor);
      const found=await api('/admin/device-management/google/recent-user?'+qs);
      if(seq!==googleRequestSeq||!googleDialog().open)return;
      const existing=new Set(googleResults.map(d=>d.google_device_id));
      for(const d of found.devices||[]){if(!existing.has(d.google_device_id)){googleResults.push(d);existing.add(d.google_device_id);}}
      googleEmailNextToken=String(found.next_page_token||'');
      $('dmGoogleLoadMore').hidden=!googleEmailNextToken;
      const matchingLabel=found.student_name?`${found.student_name} (${email})`:email;
      $('dmGoogleStatus').textContent=googleResults.length?
        `${googleResults.length} Google-managed Chromebook(s) found for ${matchingLabel}${googleEmailNextToken?' · more available':''}.`:
        `No Chromebooks found in Google's recent-user index for ${matchingLabel}.`;
      $('dmGoogleMatches').innerHTML=googleResults.map((d,index)=>{
        const rank=d.recent_user_rank===1?'Most recent recorded user':
          d.recent_user_rank>1?`Recent user #${d.recent_user_rank}`:'Recent-user match (position unavailable)';
        return `<div class="dmGoogleMatch">
          <div><strong>${h(d.model||'ChromeOS device')}</strong> ${statusBadge(String(d.google_status||'').toLowerCase())}
          <div class="dmSmall">Serial: <b>${h(d.serial_number)}</b> · Asset: ${h(d.asset_tag||'—')}</div>
          <div class="dmSmall">${h(rank)}${d.most_recent_user?' · Most recent: '+h(d.most_recent_student_name?`${d.most_recent_student_name} (${d.most_recent_user})`:d.most_recent_user):''}</div>
          <div class="dmSmall dmMuted">${h(d.org_unit_path||'No OU')} · Google policy last sync: ${h(d.last_sync||'Unknown')}</div>
          <div class="dmSmall">${d.local_device_id?'Registered in EagleNEST':'Google-managed; not yet registered in EagleNEST'}</div>
          ${googleAdminDeviceLink(d.serial_number)}</div>
          <button type="button" class="dmButton dmSmall" ${d.local_device_id?`data-google-open="${index}"`:`data-google-pick="${index}"`}>
            ${d.local_device_id?'View device':'Register in EagleNEST'}
          </button></div>`;
      }).join('');
    }catch(e){
      if(seq===googleRequestSeq&&googleDialog().open)
        $('dmGoogleStatus').textContent='Recent-user lookup failed: '+(e.message||String(e));
    }finally{
      if(seq===googleRequestSeq){$('dmGoogleRecentSearch').disabled=false;$('dmGoogleLoadMore').disabled=false;}
    }
  }
  async function googleChoose(index){
    const record=googleResults[index];if(!record)return;
    const buttons=googleDialog().querySelectorAll('[data-google-pick]');
    buttons.forEach(b=>b.disabled=true);
    $('dmGoogleStatus').textContent='Confirming selected device with Google and registering its details…';
    try{
      const saved=await api('/admin/device-management/google/import','POST',{
        google_device_id:record.google_device_id,serial_number:record.serial_number
      });
      googleDialog().close();
      await load();
      const currentlyOpen=$('dmDialog').open && $('dmForm')?.dataset.save==='ticket_create';
      if(googleReturnToTicket&&currentlyOpen){
        const picker=$('dmForm').querySelector('[name="device_id"]');
        if(picker){
          if(![...picker.options].some(opt=>opt.value===saved.device_id))picker.add(new Option(
            `${record.asset_tag||record.serial_number} · ${record.model||'Chromebook'}`,saved.device_id));
          picker.value=saved.device_id;
        }
        const search=$('dmForm').querySelector('[data-device-search]');if(search)search.value=record.serial_number;
        const status=$('dmFormStatus');if(status)status.textContent='Google device selected. Finish the repair ticket below.';
      }else if(googleLookupMode==='recent'){
        if($('dmDialog').open)$('dmDialog').close();
        await deviceDetails(saved.device_id);
      }else{
        if($('dmDialog').open)$('dmDialog').close();
        newTicketForm(saved.device_id);
        const picker=$('dmForm').querySelector('[name="device_id"]');
        if(picker && ![...picker.options].some(opt=>opt.value===saved.device_id))picker.add(new Option(record.serial_number,saved.device_id));
        if(picker)picker.value=saved.device_id;
      }
      message(saved.created?'Chromebook registered from Google Admin.':'Existing Chromebook linked to Google Admin.');
    }catch(e){$('dmGoogleStatus').textContent='Could not select device: '+(e.message||String(e));}
    finally{buttons.forEach(b=>b.disabled=false);}
  }
  googleDialog().addEventListener('click',event=>{
    if(event.target.closest('[data-google-close]')){googleDialog().close();return;}
    if(event.target.closest('[data-google-manual]')){
      googleDialog().close();if($('dmDialog').open)$('dmDialog').close();deviceForm();return;
    }
    const open=event.target.closest('[data-google-open]');
    if(open){
      const record=googleResults[Number(open.dataset.googleOpen)];
      if(record?.local_device_id){
        googleDialog().close();if($('dmDialog').open)$('dmDialog').close();
        void deviceDetails(record.local_device_id).catch(showError);
      }
      return;
    }
    const studentPick=event.target.closest('[data-google-student-pick]');
    if(studentPick){googleChooseStudent(Number(studentPick.dataset.googleStudentPick));return;}
    const pick=event.target.closest('[data-google-pick]');
    if(pick)void googleChoose(Number(pick.dataset.googlePick));
  });
  async function clickAction(event){
    const b=event.target.closest('[data-action]');if(!b)return;
    const action=b.dataset.action,id=b.dataset.id||'';
    try{
      if(action==='close-dialog')return $('dmDialog').close();
      if(action.startsWith('export-'))return await exportCsv(action.slice('export-'.length));
      if(action==='google-lookup')return openGoogleLookup();
      // EAGLENEST_DEVICE_GOOGLE_RECENT_USERS_ON_DEMAND_V1
      if(action==='google-recent-users'){
        const panel=$('dmGoogleRecentUsers');
        if(!panel||state.selectedDevice?.device?.id!==id)return;
        b.disabled=true;
        panel.textContent='Loading recent users from Google Admin…';
        try{
          const result=await api('/admin/device-management/google/recent-users?device_id='+encodeURIComponent(id));
          if(!panel.isConnected||!$('dmDialog').open||state.selectedDevice?.device?.id!==id)return;
          const users=Array.isArray(result.recent_users)?result.recent_users:[];
          const top=`<p class="dmSmall dmMuted">Checked live: ${h(nice(result.checked_at))} · Google policy last sync: ${h(nice(result.last_sync))}</p>`;
          panel.innerHTML=top+(users.length?users.map((person,i)=>`<div class="dmEvent">
            <b>${person.student_name?h(person.student_name)+' · ':''}${h(person.email||'Email not supplied by Google')}</b>
            ${person.student_osis?`<div class="dmSmall dmMuted">Matched EagleNEST student · OSIS ${h(person.student_osis)}</div>`:''}
            <div class="dmSmall dmMuted">${i===0?'Most recent recorded user':'Recent user #'+(i+1)}${person.type?' · '+h(label(person.type)):''}</div>
          </div>`).join(''):
          '<p class="dmSmall">Google did not return a recent-user list for this device. Device-user tracking may be disabled or unavailable.</p>')+
          '<p class="dmSmall dmMuted">Order reflects Google-reported sign-ins, not Chromebook ownership. Individual login timestamps are not provided.</p>';
          b.textContent='Reload recent users';
        }catch(error){
          if(panel.isConnected&&state.selectedDevice?.device?.id===id)
            panel.textContent='Could not load recent users: '+(error?.message||String(error));
        }finally{if(b.isConnected)b.disabled=false;}
        return;
      }
      if(action==='google-refresh'){
        const saved=await api('/admin/device-management/google/device?device_id='+encodeURIComponent(id));
        if(!saved.linked)throw new Error('No Google record linked to this device.');
        await api('/admin/device-management/google/import','POST',{google_device_id:saved.device.google_device_id,serial_number:saved.device.serial_number});
        if($('dmDialog').open)$('dmDialog').close();
        await deviceDetails(id);message('Google Admin metadata refreshed; EagleNEST repair and assignment history unchanged.');return;
      }
      if(action==='borrow-log')return borrowing.openLog(id);
      if(action==='create-device')return deviceForm();
      if(action==='edit-device'){const d=state.devices.find(x=>x.id===id)||state.selectedDevice?.device;if(!d)throw new Error('Refresh inventory to edit.');$('dmDialog').close();return deviceForm(d)}
      if(action==='create-station')return stationForm();
      if(action==='station'){const st=state.stations.find(s=>s.id===id);if(!st)throw new Error('Station not found. Refresh and retry.');if($('dmDialog').open)$('dmDialog').close();return stationForm(st)}
      if(action==='station-devices'){const data=await api('/admin/device-management/devices?limit=150&station_id='+encodeURIComponent(id));state.deviceQuery='';setTab('inventory');state.deviceStatus='';const st=state.stations.find(x=>x.id===id);const rows=data.devices||[];$('dmDeviceSearch').value=st?.label||'';$('dmInventoryRows').innerHTML=rows.length?`<div class="dmCards">${rows.map(d=>`<div class="dmMiniCard"><b>${h(deviceName(d))}</b><p>${statusBadge(d.operational_status)}</p>${button('device','View device',d.id)}</div>`).join('')}</div>`:empty('This station has no registered devices.');return;}
      if(action==='create-cart')return cartForm();
      if(action==='cart')return cartForm(state.carts.find(c=>c.id===id));
      if(action==='cart-devices'){const data=await api('/admin/device-management/devices?limit=150&cart_id='+encodeURIComponent(id));state.deviceQuery='';setTab('inventory');state.deviceStatus='';const c=state.carts.find(x=>x.id===id);const rows=data.devices||[];$('dmDeviceSearch').value=c?.code||'';$('dmInventoryRows').innerHTML=rows.length?`<div class="dmCards">${rows.map(d=>`<div class="dmMiniCard"><b>${h(deviceName(d))}</b><p>${statusBadge(d.operational_status)}</p>${button('device','View device',d.id)}</div>`).join('')}</div>`:empty('This cart has no registered devices.');return;}
      if(action==='new-ticket'){if($('dmDialog').open)$('dmDialog').close();return newTicketForm(id)}
      if(action==='issue'){if($('dmDialog').open)$('dmDialog').close();return assignmentForm(id,state.tab==='students'?state.selectedStudent:'',id?'primary':'loaner')}
      if(action==='return'){const a=state.selectedDevice?.assignments?.find(x=>x.id===id)||state.student?.assignments?.find(x=>x.id===id);if(!a)throw new Error('Assignment not found in this view.');if($('dmDialog').open)$('dmDialog').close();return returnForm(a)}
      if(action==='note'){if($('dmDialog').open)$('dmDialog').close();return noteForm(id)}
      if(action==='ticket-progress'||action==='ticket-close'){const t=state.tickets.find(x=>x.id===id)||state.selectedDevice?.tickets?.find(x=>x.id===id);if(!t)throw new Error('Reload the ticket first.');if($('dmDialog').open)$('dmDialog').close();return action==='ticket-progress'?progressForm(t):closeForm(t)}
      if(action==='ticket'){if($('dmDialog').open)$('dmDialog').close();return await ticketDetails(id)}
      if(action==='device'){if($('dmDialog').open)$('dmDialog').close();return await deviceDetails(id)}
      if(action==='select-student')return await showStudent(id);
    }catch(e){showError(e)}
  }
  async function authenticate(){
    try{
      const access=await api('/admin/access');
      if(access.role!=='super_admin'||access.can?.super_admin!==true)throw new Error('Sys Admin access is required.');
      $('dmLogin').hidden=true;$('dmApp').hidden=false;state.ready=true;
      await load();const osis=new URLSearchParams(location.search).get('osis')||'';if(/^\d{9}$/.test(osis))await showStudent(osis);
    }catch(e){
      $('dmLoginStatus').textContent=e.message||String(e);
      if(e.message==='Sys Admin access is required.')return;
      let retries=0;while(!window.google?.accounts?.id&&retries++<60)await new Promise(r=>setTimeout(r,100));
      if(!window.google?.accounts?.id){$('dmLoginStatus').textContent='Google sign-in could not load.';return;}
      window.google.accounts.id.initialize({client_id:CLIENT_ID,callback:async result=>{
        try{
          const response=await fetch(url('/admin/session/login_google'),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:result.credential}).toString(),credentials:'include'});
          const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'Sign-in failed');
          window.EAGLENEST_AUTH?.setSid?.(payload.sid||response.headers.get('x-admin-session'));await authenticate();
        }catch(error){$('dmLoginStatus').textContent=error.message||String(error)}
      }});
      window.google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});
      $('dmLoginStatus').textContent='Sign in with your school account.';
    }
  }
  // Search the entire D1 inventory, not just the 150 most recently edited devices.
  // Results update only the current open form and never change the persisted ID.
  let pickerSearchSeq=0;
  document.addEventListener('input',async e=>{
    const input=e.target.closest('[data-device-search]');if(!input)return;
    const form=input.closest('form'),select=form?.querySelector('[data-device-select]')||form?.querySelector('[name="replacement_device_id"]');
    if(!select)return;
    const query=input.value.trim(),n=++pickerSearchSeq;
    if(query.length<2)return;
    try{
      const data=await api('/admin/device-management/devices?limit=150&q='+encodeURIComponent(query));
      if(n!==pickerSearchSeq||!input.isConnected)return;
      const onlyAvailable=form?.dataset.save==='assignment_issue';
      const current=select.value;
      const primary=form?.dataset.save==='assignment_issue' && form.querySelector('[name="kind"]')?.value==='primary';
      const devices=(data.devices||[]).filter(d=>!onlyAvailable || (!d.active_assignment_id&&!d.home_station_id && (['available','in_use'].includes(d.operational_status) || (primary&&['needs_repair','under_repair'].includes(d.operational_status)))));
      select.innerHTML='<option value="">Select a matching device…</option>'+devices.map(d=>`<option value="${h(d.id)}">${h(deviceName(d))} · ${h(d.model||d.serial_number||'Chromebook')}</option>`).join('');
      if(devices.some(d=>d.id===current))select.value=current;
      else if(devices.length===1)select.value=devices[0].id;
    }catch(err){$('dmFormStatus').textContent='Device search unavailable: '+(err.message||err)}
  });
  document.addEventListener('click',clickAction);
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  $('dmRefresh').onclick=()=>load().then(()=>message('Inventory refreshed.')).catch(showError);
  window.addEventListener('DOMContentLoaded',authenticate);
})();

/* EAGLENEST_DEVICE_BORROWING_LOG_V1 — Admin-only borrowing and unauthorized use log. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const API=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
  const sid=()=>window.EAGLENEST_AUTH?.getSid?.()||'';
  const validOsis=value=>/^\d{9}$/.test(String(value||''));
  const permissionLabel={yes:'Permission granted',no:'Without permission',unknown:'Permission not confirmed'};
  const dateLabel=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?
    d.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'}):String(iso||'—')};
  const localTime=()=>{const d=new Date(),t=new Date(d.getTime()-d.getTimezoneOffset()*60000);return t.toISOString().slice(0,16)};
  const asIso=value=>value?new Date(value).toISOString():'';
  let dialog=null;

  async function api(path,method='GET',payload){
    const headers=new Headers();if(sid())headers.set('x-admin-session',sid());
    if(payload!==undefined)headers.set('content-type','application/json');
    const response=await fetch(new URL(path.replace(/^\//,''),API),{
      method,headers,credentials:'include',cache:'no-store',
      ...(payload!==undefined?{body:JSON.stringify(payload)}:{})
    });
    const next=response.headers.get('x-admin-session');if(next)window.EAGLENEST_AUTH?.setSid?.(next);
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok)throw new Error(data?.error||`HTTP ${response.status}`);
    return data;
  }
  function ensureDialog(){
    if(dialog)return dialog;
    dialog=document.createElement('dialog');dialog.id='dmBorrowDialog';dialog.className='dmDialog dmBorrowDialog';
    dialog.innerHTML='<div id="dmBorrowBody"></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener('click',e=>{if(e.target.closest('[data-borrow-close]'))dialog.close();});
    return dialog;
  }
  function show(title,body,submitLabel){
    const modal=ensureDialog();
    if(modal.open)modal.close();
    const main=document.getElementById('dmDialog');if(main?.open)main.close();
    modal.querySelector('#dmBorrowBody').innerHTML=`<div class="dmDialogHeader"><h2>${esc(title)}</h2>
      <button type="button" class="dmButton dmSmall" data-borrow-close>Close</button></div>
      <form class="dmForm" id="dmBorrowForm">${body}<div class="dmDialogActions">
      <button type="button" class="dmButton" data-borrow-close>Cancel</button>
      <button type="submit" class="dmButton dmPrimary">${esc(submitLabel)}</button></div>
      <p id="dmBorrowFormStatus" class="dmSmall dmMuted" role="status"></p></form>`;
    modal.showModal();
    return modal.querySelector('#dmBorrowForm');
  }
  const permissionOptions = value => ['unknown','yes','no'].map(v=>
    `<option value="${v}" ${v===value?'selected':''}>${permissionLabel[v]}</option>`).join('');

  function borrowerSearch(form) {
    const field=form.querySelector('[data-borrower-query]'),hidden=form.querySelector('[name="borrower_osis"]');
    const results=form.querySelector('[data-borrower-results]'),unknown=form.querySelector('[data-borrower-unknown]');
    const status=form.querySelector('[data-borrower-status]');
    let n=0,timeout;
    unknown.addEventListener('change',()=>{
      n++;clearTimeout(timeout);hidden.value='';field.value='';field.disabled=unknown.checked;
      results.replaceChildren();status.textContent=unknown.checked?'Borrower recorded as unidentified.':'Select a student from the results.';
    });
    field.addEventListener('input',()=>{
      const seq=++n;clearTimeout(timeout);hidden.value='';results.replaceChildren();
      const q=field.value.trim();if(q.length<2){status.textContent='Enter at least 2 characters.';return;}
      status.textContent='Searching students…';
      timeout=setTimeout(async()=>{
        try{
          const data=await api('/admin/device-management/students?q='+encodeURIComponent(q));
          if(seq!==n||!field.isConnected)return;
          const matches=(data.students||[]).filter(s=>validOsis(s.osis)).slice(0,25);
          for(const st of matches){
            const b=document.createElement('button');b.type='button';b.className='dmBorrowMatch';
            b.textContent=`${st.name||'Student'} · ${st.osis}`;
            b.addEventListener('click',()=>{
              n++;clearTimeout(timeout);field.value=`${st.name||'Student'} · ${st.osis}`;
              hidden.value=st.osis;results.replaceChildren();status.textContent='Student selected.';
            });results.appendChild(b);
          }
          status.textContent=matches.length?'Choose the correct student.':'No matches; try another name or OSIS.';
        }catch(error){if(seq===n)status.textContent='Search error: '+(error?.message||String(error))}
      },180);
    });
  }

  async function openLog(deviceId) {
    if(!deviceId)return;
    try {
      const details=await api('/admin/device-management/device?id='+encodeURIComponent(deviceId));
      const d=details.device||{},active=(details.assignments||[]).find(a=>!a.returned_at);
      if(!active){
        window.alert('This device has no current student assignment. Assign the Chromebook to its official student first, then log another student using it.');
        return;
      }
      const form=show('Log student borrowing / other use',`
        <div class="dmHint"><b>Chromebook:</b> ${esc(d.asset_tag||d.serial_number||d.id)}<br>
        <b>Official assignee:</b> ${esc(active.student_name||active.student_osis)} · ${esc(active.student_osis)}<br>
        Logging borrowing does <b>not</b> change this assignment.</div>
        <label>Student using the Chromebook
          <input type="search" data-borrower-query autocomplete="off" placeholder="Search by name or OSIS">
        </label><input type="hidden" name="borrower_osis" value="">
        <div class="dmBorrowMatches" data-borrower-results></div>
        <p class="dmSmall dmMuted" data-borrower-status>Select a student from the results.</p>
        <label class="dmBorrowCheck"><input type="checkbox" data-borrower-unknown> Borrower not identified</label>
        <label>Was permission given?
          <select name="permission_status">${permissionOptions('unknown')}</select></label>
        <label>Date/time the borrowing or use occurred
          <input type="datetime-local" name="occurred_local" value="${localTime()}" required></label>
        <label class="dmBorrowCheck"><input type="checkbox" name="already_returned"> Chromebook already returned</label>
        <label>Details / how this was discovered (optional)
          <textarea name="notes" maxlength="4000" placeholder="Who reported it? Where was it found? What happened?"></textarea></label>`, 'Log incident');
      borrowerSearch(form);
      form.onsubmit=async e=>{
        e.preventDefault();const status=form.querySelector('#dmBorrowFormStatus');
        const borrower=form.elements.borrower_osis.value,unknown=form.querySelector('[data-borrower-unknown]').checked;
        if(!unknown&&!validOsis(borrower)){status.textContent='Select the borrower or mark the borrower unidentified.';return;}
        if(borrower===active.student_osis){status.textContent='The borrower must be a different student than the official assignee.';return;}
        const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='Recording incident…';
        try{
          await api('/admin/device-management/borrowing/log','POST',{
            device_id:deviceId,borrower_osis:borrower,
            permission_status:form.elements.permission_status.value,
            occurred_at:asIso(form.elements.occurred_local.value),
            already_returned:form.elements.already_returned.checked,
            notes:form.elements.notes.value
          });
          dialog.close();refreshHistory();
        }catch(error){status.textContent=error.message||String(error);button.disabled=false;}
      };
    } catch (error) {window.alert('Could not open borrowing log: '+(error.message||String(error)));}
  }

  function openReturn(row){
    const form=show('Mark Chromebook returned',`
      <div class="dmHint">Device: ${esc(row.asset_tag||row.serial_number||row.device_id)}<br>
        Borrower: ${esc(row.borrower_name||row.borrower_osis||'Unidentified')}<br>
        Originally recorded by ${esc(row.recorded_by)}.</div>
      <label>Returned date and time<input type="datetime-local" name="returned_local"
        value="${localTime()}" required></label>
      <label>Return notes (optional)<textarea name="return_notes" maxlength="2000"></textarea></label>`, 'Mark returned');
    form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
      try{await api('/admin/device-management/borrowing/return','POST',{
        borrowing_id:row.id,returned_at:asIso(form.elements.returned_local.value),
        return_notes:form.elements.return_notes.value
      });dialog.close();refreshHistory();}
      catch(error){form.querySelector('#dmBorrowFormStatus').textContent=error.message||String(error);button.disabled=false;}
    };
  }
  function openPermission(row){
    const form=show('Update recorded permission',`
      <div class="dmHint">Previous finding: ${esc(permissionLabel[row.permission_status]||row.permission_status)}.
        Corrections are recorded in the permanent audit history.</div>
      <label>Permission status<select name="permission_status">${permissionOptions(row.permission_status)}</select></label>
      <label>Reason for update / supporting information<textarea name="note" maxlength="2000"></textarea></label>`, 'Save correction');
    form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
      try{await api('/admin/device-management/borrowing/update','POST',{
        borrowing_id:row.id,permission_status:form.elements.permission_status.value,
        note:form.elements.note.value
      });dialog.close();refreshHistory();}
      catch(error){form.querySelector('#dmBorrowFormStatus').textContent=error.message||String(error);button.disabled=false;}
    };
  }

  function historyShell(kind,id){
    return `<section class="dmBorrowHistory" data-dm-borrow-history data-kind="${esc(kind)}" data-target="${esc(id)}">
      <h3 class="dmSub">Borrowing / other student use</h3>
      <p class="dmSmall dmMuted" data-borrow-content>Loading borrowing records…</p></section>`;
  }
  const rendered=new WeakMap();
  const rowStore=new Map();
  async function loadHistory(root,force=false){
    const kind=root.dataset.kind,id=root.dataset.target;
    if(!kind||!id)return;
    if(!force && rendered.get(root)===id)return;
    rendered.set(root,id);
    const area=root.querySelector('[data-borrow-content]');if(!area)return;
    area.textContent='Loading borrowing records…';
    try{
      const data=await api('/admin/device-management/borrowing/'+kind+'?'+
        (kind==='student'?'osis=':'device_id=')+encodeURIComponent(id));
      if(!root.isConnected||root.dataset.target!==id)return;
      const items=data.borrowings||[];
      if(!items.length){area.textContent='No borrowing or unauthorized-use incidents recorded.';return;}
      area.innerHTML=items.map(b=>{
        rowStore.set(b.id,b);
        const owner=esc(b.owner_name||b.owner_osis),borrower=esc(b.borrower_name||b.borrower_osis||'Unidentified');
        return `<article class="dmBorrowEntry">
          <div class="dmBorrowTop"><strong>${esc(b.asset_tag||b.serial_number||'Chromebook')}</strong>
          <span class="dmTag ${b.permission_status==='no'?'bad':b.permission_status==='yes'?'good':'warn'}">${esc(permissionLabel[b.permission_status]||b.permission_status)}</span></div>
          <div class="dmSmall">Assigned to <b>${owner}</b> · Used by <b>${borrower}</b></div>
          <div class="dmSmall dmMuted">Occurred ${esc(dateLabel(b.occurred_at))} · Recorded by ${esc(b.recorded_by)}</div>
          <div class="dmSmall">${b.returned_at?'Returned '+esc(dateLabel(b.returned_at)):'Return not yet recorded'}</div>
          ${b.notes?`<p class="dmSmall">${esc(b.notes)}</p>`:''}
          ${b.return_notes?`<p class="dmSmall">Return: ${esc(b.return_notes)}</p>`:''}
          <div class="dmDetailActions">
            ${!b.returned_at?`<button type="button" class="dmButton dmSmall" data-borrow-return="${esc(b.id)}">Mark returned</button>`:''}
            <button type="button" class="dmButton dmSmall" data-borrow-permission="${esc(b.id)}">Update permission</button>
            ${kind==='student'?`<button type="button" class="dmButton dmSmall" data-action="device" data-id="${esc(b.device_id)}">Device</button>`:''}
          </div></article>`;
      }).join('');
    }catch(error){if(root.isConnected)area.textContent='Borrowing history unavailable: '+(error.message||String(error));}
  }
  function scan(){document.querySelectorAll('[data-dm-borrow-history]').forEach(el=>void loadHistory(el));}
  function refreshHistory(){document.querySelectorAll('[data-dm-borrow-history]').forEach(el=>void loadHistory(el,true));}
  document.addEventListener('click',event=>{
    const ret=event.target.closest('[data-borrow-return]');if(ret){const row=rowStore.get(ret.dataset.borrowReturn);if(row)openReturn(row);return;}
    const update=event.target.closest('[data-borrow-permission]');if(update){const row=rowStore.get(update.dataset.borrowPermission);if(row)openPermission(row);}
  });
  const observer=new MutationObserver(scan);
  document.addEventListener('DOMContentLoaded',()=>{observer.observe(document.body,{childList:true,subtree:true});scan();});
  window.EAGLENEST_DEVICE_BORROWING_V1=Object.freeze({openLog,historyShell,refreshHistory});
})();

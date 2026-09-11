(function attendanceDailyEmailFeature(){
  'use strict';

  const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
  const SESSION_HEADER='x-admin-session';
  const SESSION_KEYS=['attendance_outreach_admin_session_v1','ss_admin_session_sid_v1','teacher_att_admin_session_v1','attendance_status_admin_session_v1','admin_session_v1'];
  const nativeFetch=window.fetch.bind(window);
  const $=(id)=>document.getElementById(id);

  let PREVIEW=null;
  let ACTIVE_OSIS='';
  let RESULT_TOUCHED=false;
  let loadTimer=null;
  let loadingPreview=false;

  function getSid(){
    try{
      for(const key of SESSION_KEYS){
        const value=String(sessionStorage.getItem(key)||localStorage.getItem(key)||'').trim();
        if(value)return value;
      }
    }catch{}
    return '';
  }

  function stashSid(resp){
    try{
      const sid=String(resp?.headers?.get(SESSION_HEADER)||resp?.headers?.get('X-Admin-Session')||'').trim();
      if(!sid)return;
      for(const key of SESSION_KEYS){sessionStorage.setItem(key,sid);localStorage.setItem(key,sid);}
    }catch{}
  }

  async function dailyAdminFetch(path,init={}){
    const url=path instanceof URL?path:new URL(path,API_BASE);
    const headers=new Headers(init.headers||{});
    const sid=getSid();
    if(sid&&!headers.has(SESSION_HEADER))headers.set(SESSION_HEADER,sid);
    const response=await nativeFetch(url,{...init,headers,credentials:'include',cache:'no-store'});
    stashSid(response);
    return response;
  }

  async function jsonOrThrow(response){
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.ok){
      const error=new Error(String(data?.detail||data?.error||`HTTP ${response.status}`));
      error.code=String(data?.error||'');
      error.status=response.status;
      error.data=data;
      throw error;
    }
    return data;
  }

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function fmtDateTime(iso){
    if(!iso)return '';
    const d=new Date(iso);
    return Number.isFinite(d.getTime())?d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):String(iso);
  }

  function setInlineError(message=''){
    const el=$('dailyEmailInlineError');
    if(!el)return;
    el.textContent=String(message||'');
    el.hidden=!message;
  }

  function setModalError(message=''){
    const el=$('dailyEmailModalError');
    if(!el)return;
    el.textContent=String(message||'');
    el.hidden=!message;
  }

  function setModalStatus(message=''){
    const el=$('dailyEmailModalStatus');
    if(el)el.textContent=String(message||'');
  }

  function renderCard(){
    const summary=PREVIEW?.summary||{};
    if($('dailyEmailAbsent'))$('dailyEmailAbsent').textContent=PREVIEW?Number(summary.absent||0):'—';
    if($('dailyEmailLate'))$('dailyEmailLate').textContent=PREVIEW?Number(summary.late||0):'—';
    if($('dailyEmailPresent'))$('dailyEmailPresent').textContent=PREVIEW?Number(summary.present||0):'—';
    if($('dailyEmailNeedsAction'))$('dailyEmailNeedsAction').textContent=PREVIEW?Number(summary.needs_action||0):'—';
    const btn=$('reviewDailyEmailBtn');
    if(btn){btn.disabled=!PREVIEW;btn.textContent=PREVIEW?'Review Email':'Loading Summary…';}
    const last=$('dailyEmailLastSend');
    if(last){
      if(PREVIEW?.last_send?.last_sent_at_iso){
        const count=Number(PREVIEW.last_send.send_count||1);
        last.textContent=`Last sent ${fmtDateTime(PREVIEW.last_send.last_sent_at_iso)} by ${PREVIEW.last_send.last_sent_by_email||'office'}${count>1?` · ${count} sends today`:''}.`;
      }else if(PREVIEW){
        last.textContent=`Not sent yet today · To ${PREVIEW.recipient||'High School Dream Team'}.`;
      }else last.textContent='';
    }
  }

  function schedulePreviewLoad(delay=150){
    clearTimeout(loadTimer);
    loadTimer=setTimeout(()=>loadDailyEmailPreview().catch(()=>{}),delay);
  }

  async function loadDailyEmailPreview(){
    if(loadingPreview)return PREVIEW;
    loadingPreview=true;
    try{
      const response=await dailyAdminFetch('/admin/attendance_outreach/email_preview',{method:'GET'});
      if(response.status===401){return PREVIEW;}
      const data=await jsonOrThrow(response);
      PREVIEW=data;
      setInlineError('');
      renderCard();
      if(!$('dailyEmailBackdrop')?.hidden)renderReviewModal();
      return PREVIEW;
    }catch(error){
      setInlineError(`Daily email summary unavailable: ${error?.message||error}`);
      return PREVIEW;
    }finally{loadingPreview=false;}
  }

  function inferredCallStatus(osis){
    const explicit=PREVIEW?.explicit_statuses?.[osis];
    if(explicit?.classification)return explicit;
    const inferred=PREVIEW?.by_student?.[osis];
    if(inferred?.classification)return inferred;
    return {classification:'absent',reason:'',phone:''};
  }

  function prepareCallEmailFields(osis){
    ACTIVE_OSIS=String(osis||'').trim();
    RESULT_TOUCHED=false;
    const state=inferredCallStatus(ACTIVE_OSIS);
    const result=$('attendanceEmailResult');
    const reason=$('attendanceEmailReason');
    if(result)result.value=['absent','late','exclude'].includes(String(state?.classification||''))?state.classification:'absent';
    if(reason)reason.value=String(state?.reason||'');
  }

  function classificationForOutcome(outcome){
    const value=String(outcome||'').trim().toLowerCase();
    if(value==='will be late')return 'late';
    if(['absent today','no answer','left voicemail','wrong number'].includes(value))return 'absent';
    return 'absent';
  }

  function defaultDailyReason(outcome){
    const value=String(outcome||'').trim().toLowerCase();
    if(value==='left voicemail'||value==='voicemail')return 'LVM';
    if(value==='no answer')return 'No Answer';
    if(value==='wrong number')return 'Phone not working';
    if(value==='will be late')return 'LATE';
    if(value==='absent today')return 'Absent Today';
    return '';
  }

  async function saveStatusRecord({osis,classification,reason,phone}){
    return jsonOrThrow(await dailyAdminFetch('/admin/attendance_outreach/email_status',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({osis,classification,reason,phone})
    }));
  }

  function requestUrl(input){
    try{
      if(input instanceof Request)return new URL(input.url,location.href);
      return new URL(String(input),location.href);
    }catch{return null;}
  }

  function requestMethod(input,init){
    return String(init?.method||(input instanceof Request?input.method:'GET')||'GET').toUpperCase();
  }

  function requestHeaders(input,init){
    const headers=new Headers(input instanceof Request?input.headers:undefined);
    for(const [k,v] of new Headers(init?.headers||{}).entries())headers.set(k,v);
    return headers;
  }

  function parseJsonBody(init){
    try{
      if(typeof init?.body==='string')return JSON.parse(init.body);
    }catch{}
    return null;
  }

  function syntheticStatusFailure(baseResponse,error){
    const headers=new Headers({'content-type':'application/json; charset=utf-8'});
    const sid=baseResponse?.headers?.get?.(SESSION_HEADER)||baseResponse?.headers?.get?.('X-Admin-Session');
    if(sid)headers.set(SESSION_HEADER,sid);
    return new Response(JSON.stringify({
      ok:false,
      error:'attendance_email_status_failed',
      detail:`Attendance call was logged, but the daily email status could not be saved. Retry Save; the call will not duplicate. ${String(error?.message||error)}`
    }),{status:502,headers});
  }

  // Attach the daily-email classification to the exact Attendance Outreach call
  // submission. D1 communication writes are idempotent, so if the companion
  // status write fails the office can safely press Save again without creating
  // a duplicate communication.
  window.fetch=async function attendanceDailyEmailFetch(input,init={}){
    const url=requestUrl(input);
    const method=requestMethod(input,init);
    const isCommunicationCreate=url?.pathname==='/admin/communications/create'&&method==='POST';
    const isQueueRead=url?.pathname==='/admin/attendance_outreach'&&method==='GET';
    const payload=isCommunicationCreate?parseJsonBody(init):null;
    const response=await nativeFetch(input,init);

    if(isQueueRead&&response.ok)schedulePreviewLoad(100);
    if(!isCommunicationCreate||!response.ok)return response;

    const osis=String(payload?.student_number||payload?.osis||ACTIVE_OSIS||'').trim();
    if(!osis)return response;
    const result=$('attendanceEmailResult');
    const note=$('attendanceEmailReason');
    const classification=String(result?.value||classificationForOutcome(payload?.outcome)||'absent');
    const reason=String(note?.value||defaultDailyReason(payload?.outcome)||'').trim();
    const phone=String(payload?.contact_phone||'').trim();

    try{
      const headers=requestHeaders(input,init);
      const sid=getSid();
      if(sid&&!headers.has(SESSION_HEADER))headers.set(SESSION_HEADER,sid);
      headers.set('content-type','application/json');
      const statusResponse=await nativeFetch(new URL('/admin/attendance_outreach/email_status',API_BASE),{
        method:'POST',headers,credentials:'include',cache:'no-store',
        body:JSON.stringify({osis,classification,reason,phone})
      });
      stashSid(statusResponse);
      await jsonOrThrow(statusResponse);
      schedulePreviewLoad(100);
      return response;
    }catch(error){
      return syntheticStatusFailure(response,error);
    }
  };

  function reviewRow(row){
    return `<tr class="dailyEmailReviewRow" data-osis="${esc(row.osis)}" data-phone="${esc(row.phone||'')}">
      <td class="studentCell"><strong>${esc(row.name||row.osis)}</strong><div class="subline">${esc(row.osis)}</div></td>
      <td>${esc(row.grade||'—')}</td>
      <td class="phoneCell"><input class="dailyEmailPhoneInput" type="text" maxlength="80" value="${esc(row.phone||'')}" aria-label="Phone for ${esc(row.name||row.osis)}"></td>
      <td><select class="dailyEmailStatusSelect" aria-label="Daily email status for ${esc(row.name||row.osis)}">
        <option value="absent"${row.classification==='absent'?' selected':''}>Absent</option>
        <option value="late"${row.classification==='late'?' selected':''}>Late</option>
        <option value="exclude">Exclude</option>
      </select></td>
      <td><input class="dailyEmailReasonInput" type="text" maxlength="1000" value="${esc(row.reason||'')}" placeholder="Reason / note" aria-label="Reason for ${esc(row.name||row.osis)}"></td>
    </tr>`;
  }

  function renderReviewModal(){
    if(!PREVIEW)return;
    const summary=PREVIEW.summary||{};
    if($('dailyEmailRecipient'))$('dailyEmailRecipient').textContent=`To: ${PREVIEW.recipient||'High School Dream Team'} · Subject: ${PREVIEW.subject||'Absentee List'}`;
    if($('dailyEmailModalSummary'))$('dailyEmailModalSummary').innerHTML=[
      `<span><strong>${Number(summary.absent||0)}</strong> absent</span>`,
      `<span><strong>${Number(summary.late||0)}</strong> late</span>`,
      `<span><strong>${Number(summary.present||0)}</strong> present</span>`,
      `<span><strong>${Number(summary.percent_absent||0)}%</strong> absent</span>`,
      `<span><strong>${Number(summary.needs_action||0)}</strong> outreach remaining</span>`
    ].join('');
    if($('dailyEmailAbsentBody'))$('dailyEmailAbsentBody').innerHTML=(PREVIEW.absent||[]).map(reviewRow).join('')||'<tr><td colspan="5" class="empty">No students currently classified absent.</td></tr>';
    if($('dailyEmailLateBody'))$('dailyEmailLateBody').innerHTML=(PREVIEW.late||[]).map(reviewRow).join('')||'<tr><td colspan="5" class="empty">No students currently classified late.</td></tr>';

    const warning=$('dailyEmailWarning');
    const messages=[];
    if(PREVIEW.practice)messages.push('Practice Mode: you can review and edit the preview, but EagleNEST will not send the email.');
    if(Number(summary.needs_action||0)>0)messages.push(`${Number(summary.needs_action||0)} outreach item${Number(summary.needs_action||0)===1?' is':'s are'} still unresolved. EagleNEST will ask for confirmation before sending.`);
    if(PREVIEW.last_send?.last_sent_at_iso)messages.push(`This email was already sent today at ${fmtDateTime(PREVIEW.last_send.last_sent_at_iso)}. Sending again requires confirmation.`);
    if(warning){warning.textContent=messages.join(' ');warning.hidden=!messages.length;}
    const send=$('sendDailyEmail');
    if(send){send.disabled=PREVIEW.practice===true;send.textContent=PREVIEW.practice?'Practice Mode — Send Disabled':'Send to Dream Team';}
    setModalError('');
    setModalStatus('');
  }

  function openReviewModal(){
    if(!PREVIEW)return;
    renderReviewModal();
    $('dailyEmailBackdrop').hidden=false;
  }

  function closeReviewModal(){
    if($('dailyEmailBackdrop'))$('dailyEmailBackdrop').hidden=true;
    setModalError('');
    setModalStatus('');
  }

  function reviewRows(){
    return Array.from(document.querySelectorAll('.dailyEmailReviewRow')).map((tr)=>({
      osis:String(tr.dataset.osis||'').trim(),
      classification:String(tr.querySelector('.dailyEmailStatusSelect')?.value||'').trim(),
      reason:String(tr.querySelector('.dailyEmailReasonInput')?.value||'').trim(),
      phone:String(tr.querySelector('.dailyEmailPhoneInput')?.value||tr.dataset.phone||'').trim()
    })).filter((row)=>row.osis&&row.classification);
  }

  async function persistReviewChanges({reload=true}={}){
    const rows=reviewRows();
    const save=$('saveDailyEmailChanges');
    const send=$('sendDailyEmail');
    if(save)save.disabled=true;
    if(send)send.disabled=true;
    setModalError('');
    setModalStatus(rows.length?'Saving changes…':'No rows to save.');
    try{
      for(const row of rows)await saveStatusRecord(row);
      if(reload){await loadDailyEmailPreview();renderReviewModal();setModalStatus('Changes saved.');}
      else setModalStatus('Changes saved.');
      return true;
    }catch(error){
      setModalError(`Could not save daily email changes: ${error?.message||error}`);
      return false;
    }finally{
      if(save)save.disabled=false;
      if(send)send.disabled=PREVIEW?.practice===true;
    }
  }

  async function sendDailyEmail(){
    if(PREVIEW?.practice)return;
    const saved=await persistReviewChanges({reload:true});
    if(!saved)return;
    const summary=PREVIEW?.summary||{};
    let confirmIncomplete=false;
    let confirmResend=false;
    if(Number(summary.needs_action||0)>0){
      confirmIncomplete=window.confirm(`${Number(summary.needs_action)} outreach item${Number(summary.needs_action)===1?' is':'s are'} still unresolved. Send the attendance email anyway?`);
      if(!confirmIncomplete)return;
    }
    if(PREVIEW?.last_send?.last_sent_at_iso){
      confirmResend=window.confirm(`The attendance email was already sent today at ${fmtDateTime(PREVIEW.last_send.last_sent_at_iso)}. Send it again?`);
      if(!confirmResend)return;
    }

    const send=$('sendDailyEmail');
    const save=$('saveDailyEmailChanges');
    if(send){send.disabled=true;send.textContent='Sending…';}
    if(save)save.disabled=true;
    setModalError('');
    setModalStatus('Sending through EagleNEST…');
    try{
      const data=await jsonOrThrow(await dailyAdminFetch('/admin/attendance_outreach/email_send',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({confirm_incomplete:confirmIncomplete,confirm_resend:confirmResend})
      }));
      setModalStatus(`Sent to ${data.recipient||PREVIEW.recipient}.`);
      await loadDailyEmailPreview();
      renderReviewModal();
      setModalStatus(`Sent successfully to ${data.recipient||PREVIEW.recipient}.`);
    }catch(error){
      if(error?.code==='attendance_email_outreach_incomplete'||error?.code==='attendance_email_already_sent')await loadDailyEmailPreview();
      setModalError(`Could not send daily attendance email: ${error?.message||error}`);
    }finally{
      if(send){send.disabled=PREVIEW?.practice===true;send.textContent=PREVIEW?.practice?'Practice Mode — Send Disabled':'Send to Dream Team';}
      if(save)save.disabled=false;
    }
  }

  function bind(){
    $('reviewDailyEmailBtn')?.addEventListener('click',openReviewModal);
    $('closeDailyEmail')?.addEventListener('click',closeReviewModal);
    $('cancelDailyEmail')?.addEventListener('click',closeReviewModal);
    $('dailyEmailBackdrop')?.addEventListener('click',(event)=>{if(event.target===$('dailyEmailBackdrop'))closeReviewModal();});
    $('saveDailyEmailChanges')?.addEventListener('click',()=>persistReviewChanges({reload:true}));
    $('sendDailyEmail')?.addEventListener('click',sendDailyEmail);

    // Capture before Attendance Outreach's existing delegated click handler.
    $('queueBody')?.addEventListener('click',(event)=>{
      const button=event.target?.closest?.('.callBtn');
      if(button)prepareCallEmailFields(button.dataset.osis);
    },true);

    $('attendanceEmailResult')?.addEventListener('change',()=>{RESULT_TOUCHED=true;});
    $('outcomeChoices')?.addEventListener('click',(event)=>{
      const button=event.target?.closest?.('.outcomeChoice');
      if(!button||RESULT_TOUCHED)return;
      const result=$('attendanceEmailResult');
      const reason=$('attendanceEmailReason');
      if(result)result.value=classificationForOutcome(button.textContent);
      if(reason&&!reason.value.trim())reason.value=defaultDailyReason(button.textContent);
    });

    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedulePreviewLoad(100);});
    window.addEventListener('focus',()=>schedulePreviewLoad(100));
  }

  window.addEventListener('DOMContentLoaded',()=>{
    bind();
    renderCard();
    // Session bootstrap runs in attendance_outreach.js. Retry long enough for
    // Google login/session recovery without showing a permanent false error.
    let attempts=0;
    const retry=async()=>{
      attempts+=1;
      const before=PREVIEW;
      await loadDailyEmailPreview();
      if(!PREVIEW&&attempts<24)setTimeout(retry,before?1500:500);
    };
    setTimeout(retry,150);
  });
})();

/* EAGLENEST_TEACHER_INCIDENT_EDITS_V3
 * Same staff-only, incident-scoped activity history on Behavior + Incidents,
 * Student Lookup and Dean Dashboard. No browser-side permission decisions.
 */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const base=()=>document.querySelector('meta[name="api-base"]')?.content||location.origin;
  const labels={incident_date:'Incident date',incident_time:'Incident time',location_category:'Location category',
    location_detail:'Location detail',description:'Description',people_involved_json:'Students involved',
    witnesses_json:'Student witnesses',other_people_involved:'Other people involved',other_witnesses:'Other witnesses',
    status:'Status',closure_reason:'Explanation'};
  const listNames=v=>Array.isArray(v)?v.map(x=>`${x.name||x.student_name||x.osis||x.student_number||''}${x.osis||x.student_number?` (OSIS ${x.osis||x.student_number})`:''}`).join(', '):String(v??'');
  const value=(k,v)=>k==='people_involved_json'||k==='witnesses_json'?listNames(v):String(v??'');
  let record=null,detail=null,mode='',busy=false,nonce=0;
  async function api(path,init={}){
    const headers=new Headers(init.headers||{});
    const sid=window.EAGLENEST_AUTH?.getSid?.()||sessionStorage.getItem('ss_admin_session_sid_v1')||
      localStorage.getItem('ss_admin_session_sid_v1')||sessionStorage.getItem('behavior_history_admin_session_v1')||
      localStorage.getItem('behavior_history_admin_session_v1')||'';
    if(sid)headers.set('x-admin-session',sid);
    const res=await fetch(new URL(path,base()),{...init,headers,credentials:'include',cache:'no-store'});
    const fresh=res.headers.get('x-admin-session');if(fresh)window.EAGLENEST_AUTH?.setSid?.(fresh);
    const json=await res.json().catch(()=>({}));
    if(!res.ok||json.ok!==true)throw new Error(json.error||`HTTP ${res.status}`);
    return json;
  }
  function ensure(){
    if($('incidentReportEditor'))return;
    const style=document.createElement('style');style.textContent=`
      #incidentReportEditor[hidden],#incidentReportEditor [hidden]{display:none!important}
      #incidentReportEditor{position:fixed;inset:0;z-index:99990;background:rgba(10,17,29,.77);display:flex;align-items:center;justify-content:center;padding:12px}
      #incidentReportEditor .ireDialog{background:var(--card,#fff);color:var(--text,#111827);border:1px solid var(--border,#bbb);border-radius:14px;max-width:820px;width:100%;max-height:93vh;overflow-y:auto;padding:20px;box-shadow:0 20px 70px #0007}
      #incidentReportEditor .ireHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      #incidentReportEditor .ireField{display:grid;gap:4px;margin:10px 0;font-size:.93rem}
      #incidentReportEditor :is(input,textarea,select){font:inherit;border:1px solid var(--border,#aeb6c4);border-radius:7px;padding:8px;color:inherit;background:var(--surface,#fff);width:100%;box-sizing:border-box}
      #incidentReportEditor button{font:inherit;padding:8px 12px;cursor:pointer;border:1px solid var(--border,#99a5b5);border-radius:7px;background:var(--surface,#f2f5f9);color:inherit}
      #incidentReportEditor .ireButtons{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
      #incidentReportEditor .ireHistory{padding:10px 0;border-top:1px solid var(--border,#bbb);white-space:pre-wrap;overflow-wrap:anywhere}
      #incidentReportEditor .ireDiff{padding:6px 10px;margin-top:6px;border-left:3px solid #888;font-size:.87rem}
      #incidentReportEditor .ireBad{color:#b42318}
      #incidentReportEditor .ireMuted{opacity:.76;font-size:.88rem}
      #incidentReportEditor .ireGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}
      @media(max-width:620px){#incidentReportEditor .ireGrid{grid-template-columns:1fr}}
    `;document.head.appendChild(style);
    const outer=document.createElement('div');outer.id='incidentReportEditor';outer.hidden=true;
    outer.innerHTML=`<section class="ireDialog" role="dialog" aria-modal="true" aria-labelledby="ireTitle">
      <div class="ireHead"><div><h2 id="ireTitle">Incident history</h2><p class="ireMuted" id="ireSummary"></p></div><button id="ireDismiss" type="button">Close</button></div>
      <p class="ireMuted">The edit log is visible to staff authorized to view this report. Entries cannot be removed or overwritten. Original evidence files and reporter identity are immutable.</p>
      <div id="ireStatus" role="status"></div>
      <div id="ireActions" class="ireButtons" hidden><button id="ireChooseEdit" type="button">Edit my report</button><button id="ireChooseClose" type="button">Close — submitted in error</button></div>
      <form id="ireForm" hidden>
       <p id="ireModeMessage" class="ireMuted"></p>
       <div id="ireEditFields">
        <div class="ireGrid">
         <label class="ireField">Incident date<input name="incident_date" type="date" required></label>
         <label class="ireField">Time<input name="incident_time" type="time"></label>
         <label class="ireField">Location category<select name="location_category" required><option>At School</option><option>Off campus</option><option>Online/Electronic</option><option>Other</option></select></label>
         <label class="ireField">Location / details<input name="location_detail" maxlength="1000" required></label>
        </div>
        <label class="ireField">Description<textarea name="description" rows="6" maxlength="20000" required></textarea></label>
        <div class="ireGrid">
         <label class="ireField">Students involved — OSIS numbers separated by commas<input name="people" placeholder="123456789, 987654321"></label>
         <label class="ireField">Student witnesses — OSIS numbers separated by commas<input name="witnesses" placeholder="123456789"></label>
        </div>
        <p class="ireMuted">Student OSIS numbers are verified against the school roster when saved. Other named people or witnesses can be listed below.</p>
        <label class="ireField">Other people involved<textarea name="other_people_involved" rows="2" maxlength="3000"></textarea></label>
        <label class="ireField">Other witnesses<textarea name="other_witnesses" rows="2" maxlength="3000"></textarea></label>
       </div>
       <label class="ireField"><strong id="ireReasonLabel">Reason for this change (required)</strong><textarea name="reason" rows="3" maxlength="4000" minlength="10" required placeholder="Explain why the report is being corrected or closed…"></textarea></label>
       <div class="ireButtons"><button type="submit" id="ireSubmit">Save</button><button type="button" id="ireCancel">Cancel</button></div>
      </form>
      <h3>Permanent activity and edit log</h3><div id="ireHistory" aria-live="polite"></div>
    </section>`;
    document.body.appendChild(outer);
    $('ireDismiss').addEventListener('click',dismiss);
    $('ireCancel').addEventListener('click',()=>selectMode(''));
    $('ireChooseEdit').addEventListener('click',()=>selectMode('edit'));
    $('ireChooseClose').addEventListener('click',()=>selectMode('close_mistake'));
    $('ireForm').addEventListener('submit',submit);
    outer.addEventListener('click',e=>{if(e.target===outer)dismiss()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!outer.hidden)dismiss()});
  }
  function dismiss(){if(busy)return;nonce++;record=null;detail=null;mode='';$('incidentReportEditor').hidden=true;}
  function diffHtml(a){
    const before=a.before||{},after=a.after||{};
    const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>
      !['note_text','from_status','to_status','updated_at_iso','participant_count','witness_count','evidence_count','assigned_to_email'].includes(k));
    return keys.map(k=>{
      if(!Object.hasOwn(labels,k))return '';
      const prev=value(k,before[k]),next=value(k,after[k]);
      if(prev===next)return '';
      return `<div class="ireDiff"><strong>${esc(labels[k])}:</strong><div>Before: ${esc(prev||'—')}</div><div>After: ${esc(next||'—')}</div></div>`;
    }).join('');
  }
  function show(){
    if(!record||!detail)return;
    $('ireTitle').textContent=`Incident ${record.incident_id} — history`;
    $('ireSummary').textContent=`${record.incident_date} · ${record.reporter_email} · ${record.status} · ${record.location_detail}`;
    $('ireActions').hidden=!(record.can_edit_report||record.can_close_mistake);
    $('ireChooseEdit').hidden=!record.can_edit_report;
    $('ireChooseClose').hidden=!record.can_close_mistake;
    const events=detail.audit||[];
    $('ireHistory').innerHTML=events.length?events.map(a=>{
      const action={create:'Report created',teacher_report_edit:'Teacher corrected report',teacher_closed_in_error:'Teacher closed mistaken submission',
        dean_note:'Dean note',dean_status_update:'Dean status update'}[a.action]||a.action;
      const when=a.changed_at_iso?new Date(a.changed_at_iso).toLocaleString():'';
      const changes=diffHtml(a);
      const why=a.action==='teacher_report_edit'||a.action==='teacher_closed_in_error'?`<div><strong>Reason:</strong> ${esc(a.reason||'—')}</div>`:'';
      const note=['dean_note','dean_status_update'].includes(a.action)?`<div>${esc(a.note_text||'')}</div>`:'';
      const state=a.from_status&&a.to_status&&a.from_status!==a.to_status?`<div>Status: ${esc(a.from_status)} → ${esc(a.to_status)}</div>`:'';
      return `<article class="ireHistory"><strong>${esc(action)}</strong><div class="ireMuted">${esc(when)} · ${esc(a.actor_email||'Unknown')}</div>${why}${note}${state}${changes}</article>`;
    }).join(''):'<p>No audit entries are available for this report.</p>';
  }
  function selectMode(next){
    mode=next;$('ireForm').hidden=!next;
    $('ireStatus').textContent='';
    if(!next)return;
    const mistaken=next==='close_mistake';
    $('ireEditFields').hidden=mistaken;
    $('ireModeMessage').textContent=mistaken?'This only closes a report that was submitted by mistake. The original report and your written explanation stay visible in its permanent history. A Dean may reopen it if necessary.':'Only the original reporting teacher may edit an open report. Every changed field will show its previous and new value with this required explanation.';
    $('ireReasonLabel').textContent=mistaken?'Why was this report submitted by mistake? (required, minimum 10 characters)':'Why are you editing this report? (required, minimum 10 characters)';
    $('ireSubmit').textContent=mistaken?'Confirm closure — submitted in error':'Save correction and public edit log';
    const f=$('ireForm');const r=record;
    for(const key of ['incident_date','incident_time','location_category','location_detail','description','other_people_involved','other_witnesses']){
      if(f.elements.namedItem(key))f.elements.namedItem(key).value=r[key]||'';
    }
    f.elements.namedItem('people').value=(r.people||[]).map(p=>p.osis||p.student_number).filter(Boolean).join(', ');
    f.elements.namedItem('witnesses').value=(r.witnesses||[]).map(p=>p.osis||p.student_number).filter(Boolean).join(', ');
    f.elements.namedItem('reason').value='';
    f.elements.namedItem('reason').focus();
  }
  async function open(id){
    ensure();nonce++;const seq=nonce;
    $('incidentReportEditor').hidden=false;
    $('ireStatus').textContent='Loading incident and audit history…';
    $('ireActions').hidden=true;$('ireForm').hidden=true;$('ireHistory').innerHTML='';
    record=null;detail=null;mode='';
    try{
      const j=await api(`/admin/incident/detail?incident_id=${encodeURIComponent(String(id||''))}`);
      if(seq!==nonce)return;
      detail=j;record=j.incident;show();$('ireStatus').textContent='';
    }catch(e){if(seq===nonce)$('ireStatus').textContent=`Could not load incident: ${e.message||e}`;}
  }
  function osisArray(raw){
    return [...new Set(String(raw||'').split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean))].map(osis=>({osis}));
  }
  async function submit(event){
    event.preventDefault();if(!record||!mode||busy)return;
    const form=$('ireForm');const reason=form.elements.namedItem('reason').value.trim();
    if(reason.length<10){$('ireStatus').textContent='Please explain the change in at least 10 characters.';return;}
    if(mode==='close_mistake'&&!confirm('Close this incident as submitted in error? The report and explanation will remain in the audit history.'))return;
    const payload={incident_id:record.incident_id,expected_updated_at_iso:record.updated_at_iso,action:mode,reason};
    if(mode==='edit'){
      for(const name of ['incident_date','incident_time','location_category','location_detail','description','other_people_involved','other_witnesses'])
        payload[name]=form.elements.namedItem(name).value;
      payload.people=osisArray(form.elements.namedItem('people').value);
      payload.witnesses=osisArray(form.elements.namedItem('witnesses').value);
    }
    busy=true;$('ireSubmit').disabled=true;$('ireStatus').textContent='Saving and recording audit history…';
    try{
      await api('/admin/incident/revise',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      mode='';$('ireForm').hidden=true;
      const j=await api(`/admin/incident/detail?incident_id=${encodeURIComponent(payload.incident_id)}`);
      detail=j;record=j.incident;show();
      $('ireStatus').textContent='Saved. The permanent edit history now shows this change.';
      document.dispatchEvent(new CustomEvent('eaglenest:incident:changed',{detail:{incident_id:payload.incident_id}}));
    }catch(e){$('ireStatus').textContent=`Could not save: ${e.message||e}`;}
    finally{busy=false;$('ireSubmit').disabled=false;}
  }
  window.EAGLENEST_INCIDENT_REPORT_EDITOR={open};
})();

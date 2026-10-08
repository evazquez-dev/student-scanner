/* EAGLENEST_FASC_COVERAGE_V1 */
(()=>{
  const $=id=>document.getElementById(id);
  let api=null,access=null,reload=null,bundle=null,options=null;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function msg(v,bad=false){const el=$('fascCoverageStatus');if(el){el.textContent=v||'';el.style.color=bad?'#b91c1c':'';}}
  function populate(sel,rows,selected){sel.replaceChildren();for(const r of rows)sel.add(new Option(`${r.name||r.email} (${r.email})`,r.email));if(selected&&rows.some(r=>r.email===selected))sel.value=selected;}
  function render(){
    const section=$('fascCoverageSection'); if(!section)return;
    section.hidden=!(options?.can_manage || options?.my_assignments?.length);
    if(section.hidden)return;
    const can=options?.can_manage;
    $('fascCoverageForm').hidden=!can;
    $('fascCoverageManagerHelp').hidden=!can;
    if(can){
      const prevAdvisor=$('fascCoverageAdvisor').value,prevTeacher=$('fascCoverageTeacher').value;
      populate($('fascCoverageAdvisor'),options.advisors||[],prevAdvisor);
      populate($('fascCoverageTeacher'),options.teachers||[],prevTeacher);
      const start=$('fascCoverageStart'),end=$('fascCoverageEnd');
      if(!start.value)start.value=options.event_start||'15:30';
      if(!end.value)end.value=options.event_end||'19:00';
      const closed=['closed','archived'].includes(options.event_status);
      $('fascCoverageSave').disabled=closed||!(options.advisors||[]).length||!(options.teachers||[]).length;
      if(closed)msg('This conference event is closed. Coverage changes are disabled.');
    }
    const list=$('fascCoverageList');
    const entries=options.assignments||[];
    if(!entries.length){list.innerHTML='<p class="muted small">No coverage assigned for this event yet.</p>';return;}
    const advisorName=e=>options.advisors?.find(r=>r.email===e)?.name||bundle?.staff?.find(r=>r.staff_email===e)?.staff_name||e;
    const teacherName=e=>options.teachers?.find(r=>r.email===e)?.name||e;
    list.innerHTML=`<div class="tableWrap"><table class="table"><thead><tr><th>Original advisor</th><th>Covering teacher</th><th>Time</th><th>Location</th><th>Action</th></tr></thead><tbody>${entries.map(a=>{
      const editable=can&&(options.is_admin||(options.advisors||[]).some(r=>r.email===a.advisor_email))&&!['closed','archived'].includes(options.event_status);
      return `<tr><td>${esc(advisorName(a.advisor_email))}<div class="muted small">${esc(a.advisor_email)}</div></td><td>${esc(teacherName(a.covering_email))}</td><td>${esc(a.start_time)}–${esc(a.end_time)}</td><td>${esc(a.location||'Event default')}</td><td>${editable?`<button type="button" class="danger" data-fasc-cancel="${esc(a.coverage_id)}">Remove</button>`:'<span class="muted">—</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
    list.querySelectorAll('[data-fasc-cancel]').forEach(b=>b.addEventListener('click',()=>cancel(b.dataset.fascCancel)));
  }
  async function refresh(nextBundle){
    bundle=nextBundle;
    if(!api)return;
    const id=bundle?.event?.event_id;
    if(!id){options=null;render();return;}
    try{
      options=await api(`/admin/conferences/coverage?event_id=${encodeURIComponent(id)}`);
      render();
    }catch(e){options=null;$('fascCoverageSection').hidden=true;msg(`Coverage could not load: ${e.message}`,true);}
  }
  async function save(e){
    e.preventDefault();if(!bundle?.event||!options?.can_manage)return;
    const btn=$('fascCoverageSave');btn.disabled=true;msg('Saving coverage…');
    try{
      const payload={event_id:bundle.event.event_id,advisor_email:$('fascCoverageAdvisor').value,covering_email:$('fascCoverageTeacher').value,start_time:$('fascCoverageStart').value,end_time:$('fascCoverageEnd').value,location:$('fascCoverageRoom').value.trim(),note:$('fascCoverageNote').value.trim()};
      await api('/admin/conferences/coverage/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      msg('Coverage assigned. Bookings remain attributed to their original advisor.');
      await reload();
    }catch(e){msg(`Cannot assign coverage: ${e.message}`,true);}finally{btn.disabled=false;}
  }
  async function cancel(id){
    if(!bundle?.event||!confirm('Remove this conference coverage assignment? The original bookings are not deleted.'))return;
    msg('Removing coverage…');
    try{await api('/admin/conferences/coverage/cancel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({coverage_id:id})});msg('Coverage removed.');await reload();}
    catch(e){msg(`Could not remove coverage: ${e.message}`,true);}
  }
  function init(opts){api=opts.api;access=opts.access;reload=opts.reload;$('fascCoverageForm')?.addEventListener('submit',save);refresh(opts.getBundle());}
  window.EagleNESTConferenceCoverage=Object.freeze({init,refresh});
})();

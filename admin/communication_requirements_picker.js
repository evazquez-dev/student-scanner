/* EAGLENEST_COMMUNICATION_REQUIREMENTS_V1
 * EAGLENEST_COMMUNICATION_REQUIREMENTS_SCOPE_V3
 * Common multi-select used by Student Contacts AND Family & Student Conferences.
 * This UI never changes communication category; it only selects explicit campaign IDs.
 */
(function () {
  'use strict';
  function create({host, fetchData}) {
    if (!host || typeof fetchData !== 'function') return null;
    host.innerHTML = '<div class="enReqHeading">Required communications fulfilled (optional)</div>' +
      '<button type="button" class="enReqToggle" aria-expanded="false">Select required communications (0)</button>' +
      '<div class="enReqPanel" hidden></div><div class="enReqHelp">The communication is logged once. Check every requirement actually discussed; checking these does not change its category.</div>';
    const button=host.querySelector('button'), panel=host.querySelector('.enReqPanel'), help=host.querySelector('.enReqHelp');
    let choices=[], selected=new Set(), version=0, practice=false, outcome='Spoke/Connected', loading=false, loadError='', availabilityNote='';
    const qualifies=()=>['Spoke/Connected','Resolved'].includes(outcome);
    function draw() {
      if(!qualifies() || practice) selected.clear();
      panel.replaceChildren();
      button.textContent=loading ? 'Checking required communications…' : choices.length ? `Required communications: ${choices.length} available · ${selected.size} selected` : 'No eligible required communications';
      if(!choices.length) {
        const el=document.createElement('div'); el.className='enReqEmpty';
        el.textContent=loading ? 'Checking applicable requirements…' : (loadError || availabilityNote || 'No applicable active required communications for this student/date.'); panel.append(el);
      }
      for (const c of choices) {
        const label=document.createElement('label');label.className='enReqItem';
        const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(c.campaign_id);
        check.disabled=practice || !qualifies();check.addEventListener('change',()=>{
          if(check.checked)selected.add(c.campaign_id);else selected.delete(c.campaign_id);draw();
        });
        const copy=document.createElement('span');
        const title=document.createElement('strong');title.textContent=c.name;
        const detail=document.createElement('small');detail.textContent=`${c.category} • due ${c.due_date}${c.completed?' • previously completed':''}`;
        copy.append(title,detail);label.append(check,copy);panel.append(label);
      }
      if(practice)help.textContent='Practice Mode: required-communication checkboxes are unavailable; no live requirement is fulfilled.';
      else if(!qualifies()) help.textContent='No Answer, voicemail, follow-up attempts and sent messages do not fulfill these discussion-based requirements. Select Spoke/Connected or Resolved to check completed requirements.';
      else help.textContent='One communication may fulfill multiple requirements. Select only what was actually discussed or resolved. Previously completed items may also be recorded.';
      if (!loading && !loadError && !choices.length && availabilityNote) help.textContent='This list is filtered by the call date, student grade, course/advisory membership and staff permissions.';
    }
    button.addEventListener('click',()=>{
      panel.hidden=!panel.hidden;
      button.setAttribute('aria-expanded',String(!panel.hidden));
    });
    return {
      selected:()=>Array.from(selected),
      setOutcome(value){outcome=String(value||'');draw();},
      clear(){version++;selected.clear();choices=[];practice=false;loading=false;loadError='';availabilityNote='';panel.hidden=true;button.setAttribute('aria-expanded','false');draw();},
      async load(studentNumber,contactDate){
        const current=++version;selected.clear();choices=[];practice=false;loading=true;loadError='';availabilityNote='';draw();
        if(!studentNumber || !/^\d{4}-\d{2}-\d{2}$/.test(contactDate||'')){ loading=false;loadError='Choose a valid student and communication date.';draw();return; }
        try {
          const data=await fetchData(studentNumber,contactDate);
          if(current!==version)return;
          choices=Array.isArray(data.campaigns)?data.campaigns:[];
          availabilityNote=String(data.availability_note||'');loading=false;practice=data.practice===true;draw();
          if(data.history_complete===false)help.textContent+=' Older communication history may require review.';
        } catch(error) {
          if(current!==version)return;
          loading=false;loadError='Could not load requirements ('+String(error?.message||'request failed')+'). You can still log the communication without selecting requirements.';draw();
        }
      }
    };
  }
  window.EagleNESTRequirementPicker={create};
})();

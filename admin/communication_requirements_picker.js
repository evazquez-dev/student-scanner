/* EAGLENEST_COMMUNICATION_REQUIREMENTS_V1
 * EAGLENEST_COMMUNICATION_REQUIREMENTS_SCOPE_V3
 * Common multi-select used by Student Contacts AND Family & Student Conferences.
 * This UI never changes communication category; it only selects explicit campaign IDs.
 */
(function () {
  'use strict';
  function create({host, fetchData, onChange}) {
    if (!host || typeof fetchData !== 'function') return null;
    host.innerHTML = '<div class="enReqHeading">Required communications fulfilled (optional)</div>' +
      '<button type="button" class="enReqToggle" aria-expanded="false">Select required communications (0)</button>' +
      '<div class="enReqPanel" hidden></div><div class="enReqHelp">The communication is logged once. Check every requirement actually discussed; checking these does not change its category.</div>';
    const button=host.querySelector('button'), panel=host.querySelector('.enReqPanel'), help=host.querySelector('.enReqHelp');
    let choices=[], selected=new Set(), version=0, practice=false, outcome='Spoke/Connected', loading=false, loadError='', availabilityNote='';
    let autoFaSCEventId=''; // EAGLENEST_FASC_REQUIRED_AUTO_SELECT_V1
    let autoCampaignId='', campaignManuallyUnchecked=false; // EAGLENEST_CAMPAIGN_LOG_PREFILL_V1
    const qualifies=()=>['Spoke/Connected','Resolved'].includes(outcome);
    function draw() {
      if(!qualifies() || practice) selected.clear();
      else if(autoFaSCEventId) {
        // The server already links this conference's FaSC requirement for connected outcomes.
        // Mirror that rule in the picker without preselecting unrelated campaigns/events.
        const linked=choices.find(c=>String(c?.fasc_event_id || '')===autoFaSCEventId);
        if(linked?.campaign_id) selected.add(linked.campaign_id);
      }
      // The requested campaign must be in this student's server-authorized choices.
      // Unlike mandatory FaSC linking, staff may uncheck a campaign not discussed.
      if(qualifies() && !practice && autoCampaignId && !campaignManuallyUnchecked) {
        const campaign=choices.find(c=>String(c?.campaign_id || '')===autoCampaignId && !c?.fasc_event_id);
        if(campaign) selected.add(campaign.campaign_id);
      }
      panel.replaceChildren();
      button.textContent=loading ? 'Checking required communications…' : choices.length ? `Required communications: ${choices.length} available · ${selected.size} selected` : 'No eligible required communications';
      if(!choices.length) {
        const el=document.createElement('div'); el.className='enReqEmpty';
        el.textContent=loading ? 'Checking applicable requirements…' : (loadError || availabilityNote || 'No applicable active required communications for this student/date.'); panel.append(el);
      }
      for (const c of choices) {
        const label=document.createElement('label');label.className='enReqItem';
        const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(c.campaign_id);
        const lockedFaSC=!!autoFaSCEventId && String(c.fasc_event_id || '')===autoFaSCEventId;
        check.disabled=practice || !qualifies() || lockedFaSC;check.addEventListener('change',()=>{
          if(c.campaign_id===autoCampaignId) campaignManuallyUnchecked=!check.checked;
          if(check.checked)selected.add(c.campaign_id);else selected.delete(c.campaign_id);draw();notify();
        });
        const copy=document.createElement('span');
        const title=document.createElement('strong');title.textContent=c.name;
        const detail=document.createElement('small');detail.textContent=c.fasc_event_id
          ? `FaSC event ${c.event_date} • ${c.booking_status || 'not yet booked'}${c.completed?' • family reached':''}`
          : `${c.category} • due ${c.due_date}${c.completed?' • previously completed':''}`;
        copy.append(title,detail);label.append(check,copy);panel.append(label);
      }
      if(practice)help.textContent='Practice Mode: required-communication checkboxes are unavailable; no live requirement is fulfilled.';
      else if(!qualifies()) help.textContent='No Answer, voicemail, follow-up attempts and sent messages do not fulfill these discussion-based requirements. Select Spoke/Connected or Resolved to check completed requirements.';
      else if(autoFaSCEventId && choices.some(c=>String(c.fasc_event_id || '')===autoFaSCEventId)) help.textContent=`This conference's FaSC requirement is linked automatically for Spoke/Connected or Resolved outcomes. You may also select other requirements actually discussed.`;
      else if(autoCampaignId && choices.some(c=>c.campaign_id===autoCampaignId && !c.fasc_event_id)) help.textContent='The campaign from Parent & Family Communications is preselected. Uncheck it if this conversation did not fulfill that requirement.';
      else if(autoCampaignId && !loading && !loadError) help.textContent='The original campaign is not available for this student/date or your permissions. Nothing was preselected.';
      else help.textContent='One communication may fulfill multiple requirements. Select only what was actually discussed or resolved. Previously completed items may also be recorded.';
      if (!loading && !loadError && !choices.length && availabilityNote) help.textContent='This list is filtered by the call date, student grade, course/advisory membership and staff permissions.';
    }
    function notify(){
      if(typeof onChange==='function')onChange({selected:Array.from(selected),selectedRows:choices.filter(c=>selected.has(c.campaign_id)),choices:choices.slice()});
    }
    button.addEventListener('click',()=>{
      panel.hidden=!panel.hidden;
      button.setAttribute('aria-expanded',String(!panel.hidden));
    });
    return {
      selected:()=>Array.from(selected),
      selectedRows:()=>choices.filter(c=>selected.has(c.campaign_id)),
      all:()=>choices.slice(),
      setOutcome(value){outcome=String(value||'');draw();notify();},
      clear(){version++;selected.clear();choices=[];autoFaSCEventId='';autoCampaignId='';campaignManuallyUnchecked=false;practice=false;loading=false;loadError='';availabilityNote='';panel.hidden=true;button.setAttribute('aria-expanded','false');draw();notify();},
      async load(studentNumber,contactDate,options={}){
        const current=++version;selected.clear();choices=[];autoFaSCEventId=String(options?.autoFaSCEventId || '');autoCampaignId=String(options?.autoCampaignId || '');campaignManuallyUnchecked=false;practice=false;loading=true;loadError='';availabilityNote='';draw();
        if(!studentNumber || !/^\d{4}-\d{2}-\d{2}$/.test(contactDate||'')){ loading=false;loadError='Choose a valid student and communication date.';draw();return; }
        try {
          const data=await fetchData(studentNumber,contactDate);
          if(current!==version)return;
          choices=Array.isArray(data.campaigns)?data.campaigns:[];
          availabilityNote=String(data.availability_note||'');loading=false;practice=data.practice===true;
          if(!practice && qualifies() && autoCampaignId && choices.some(c=>String(c?.campaign_id || '')===autoCampaignId && !c?.fasc_event_id)) {
            panel.hidden=false;button.setAttribute('aria-expanded','true');
          }
          draw();notify();
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

/* EAGLENEST_FASC_COMMUNICATION_BRIDGE_V4 */
(function(){
 'use strict';
 function el(tag,attrs={},text){const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,v);if(text!=null)n.textContent=text;return n;}
 function splitName(value){const v=String(value||'').trim();if(v.includes(',')){const p=v.split(',').map(x=>x.trim());return {first:p.slice(1).join(' '),last:p[0]};}const p=v.split(/\s+/).filter(Boolean);return {first:p.slice(0,-1).join(' '),last:p.at(-1)||''};}
 function localIso(value){const date=new Date(value);return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value||'') && Number.isFinite(date.getTime())?date.toISOString():'';}
 function create({host,context,post}){
  if(!host)return null;
  host.innerHTML=`<div class="enReqHeading">FaSC booking (optional)</div>
   <div class="enReqHelp">The communication is saved once. You can also schedule an official event slot or a meeting on another day.</div>
   <label class="noteLabel">FaSC event<select id="fascV4Event" class="input"></select></label>
   <label class="checkRow"><input id="fascV4Book" type="checkbox"><span>Book a FaSC meeting with this communication</span></label>
   <div id="fascV4Details" hidden>
    <label class="noteLabel">Booking type<select id="fascV4Type" class="input"><option value="slot">Official FaSC event slot</option><option value="alternate">Alternate meeting (any date)</option></select></label>
    <label class="noteLabel" id="fascV4SlotField">Available event slot<select id="fascV4Slot" class="input"></select></label>
    <div id="fascV4AlternateFields" hidden>
      <label class="noteLabel">Meeting begins<input id="fascV4Start" type="datetime-local" class="input"></label>
      <label class="noteLabel">Duration<select id="fascV4Duration" class="input"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
      <label class="noteLabel">Meeting host email<input id="fascV4Host" class="input" type="email"></label>
      <label class="noteLabel">Room / location<input id="fascV4Location" class="input" placeholder="Room or location"></label>
    </div>
   </div>`;
  const get=id=>host.querySelector('#'+id);
  let campaigns=[];
  const selectedEvent=()=>campaigns.find(c=>c.fasc_event_id===get('fascV4Event').value);
  function refresh(){
    const event=selectedEvent(), booked=get('fascV4Book').checked;
    get('fascV4Book').disabled=!!event && event.can_book===false;
    get('fascV4Details').hidden=!booked||!event;
    get('fascV4SlotField').hidden=get('fascV4Type').value==='alternate';
    get('fascV4AlternateFields').hidden=get('fascV4Type').value!=='alternate';
    get('fascV4Slot').replaceChildren(new Option('Choose an available slot',''));
    for(const slot of event?.open_slots||[])get('fascV4Slot').appendChild(new Option(`${new Date(slot.start_iso).toLocaleString()} · ${slot.staff_name||slot.staff_email} · ${slot.location||''}`,slot.slot_id));
    if(event)get('fascV4Host').value=event.advisor_email || context()?.actor_email || '';
  }
  for(const id of ['fascV4Event','fascV4Book','fascV4Type'])get(id).addEventListener('change',refresh);
  return {
   setSelected(rows){
    const last=get('fascV4Event').value;
    campaigns=(rows||[]).filter(c=>c.fasc_event_id);
    host.hidden=!campaigns.length;
    get('fascV4Event').replaceChildren();
    for(const c of campaigns)get('fascV4Event').appendChild(new Option(`${c.name} (${c.event_date})`,c.fasc_event_id));
    if(campaigns.some(c=>c.fasc_event_id===last))get('fascV4Event').value=last;
    if(!campaigns.length)get('fascV4Book').checked=false;
    refresh();
   },
   prepare(){
    if(host.hidden || !get('fascV4Book').checked)return null;
    const event=selectedEvent();if(!event||!event.can_book)throw Error('You cannot book a meeting for this FaSC event from this account.');
    const info=context(),type=get('fascV4Type').value;
    if(type==='slot'){
      const slot=get('fascV4Slot').value;
      if(!slot)throw Error('Choose an official FaSC slot.');
      return {type,path:'/admin/conferences/booking/create',body:{event_id:event.fasc_event_id,slot_id:slot,
       student_number:info.student_number,student_name:info.student_name,
       family_contact_assoc_id:info.contact_assoc_id,family_contact_name:info.contact_display_name,
       family_relationship:info.contact_relationship,family_phone:info.contact_phone,family_email:info.contact_email,notes:info.notes}};
    }
    const start=localIso(get('fascV4Start').value),name=splitName(info.contact_display_name);
    if(!start||!name.first||!name.last)throw Error('For an alternate FaSC meeting, enter a date/time and a family contact with first and last name.');
    const hostEmail=get('fascV4Host').value.trim();if(!hostEmail)throw Error('Alternate FaSC meeting needs a host email.');
    const startMs=Date.parse(start),duration=Number(get('fascV4Duration').value)||30;
    return {type,path:'/admin/visitor_appointments/create',body:{appointment:{
      visitor_first_name:name.first,visitor_last_name:name.last,
      visitor_phone:info.contact_phone,visitor_email:info.contact_email,relationship:info.contact_relationship,
      student_number:info.student_number,student_name:info.student_name,
      contact_assoc_id:info.contact_assoc_id,start_iso:start,end_iso:new Date(startMs+duration*60000).toISOString(),
      host_email:hostEmail,location:get('fascV4Location').value.trim(),
      purpose:`Student & Family Conference — ${event.name}`,conference_event_id:event.fasc_event_id,source:'student_contacts'
    }}};
   },
   book(booking){return post(booking.path,booking.body);}
  };
 }
 window.EagleNESTFaSCBookingV4={create};
})();

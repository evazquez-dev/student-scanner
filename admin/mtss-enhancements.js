/* EAGLENEST_MTSS_REFINEMENT_V1_2: teacher suggestions + unified logging. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const core = () => window.EagleNESTMTSS;
  const api = (path, init) => core().api(path, init);
  const state = { student: null, pickSeq: 0, catalogSeq: 0, caseData: null, leader: false, canLog: false, initialized: false };
  const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const encode = v => encodeURIComponent(String(v || ''));
  const request = (path, body) => api(path, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const info = (id, msg) => { if ($(id)) $(id).textContent = msg; };
  const isoToday = () => {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const obj = Object.fromEntries(parts.map(p => [p.type,p.value]));
    return `${obj.year}-${obj.month}-${obj.day}`;
  };
  const displayStudent = s => `${s.name || 'Student'} · OSIS ${s.osis}`;
  const choices = rows => '<option value="">Select an approved intervention</option>' + (rows || []).map(r => `<option value="${escapeHtml(r.catalog_id)}">${escapeHtml(r.label)}</option>`).join('');
  const isTier1 = () => Number($('newTier').value) === 1;
  const isSuggestion = () => !canManageCases() && !isTier1();
  const canManageCases = () => !!core().canManageAll();

  function showOther(selectId, wrapperId, inputId) {
    const visible = state.leader && $(selectId)?.value === '__other__';
    const wrapper = $(wrapperId), field = $(inputId);
    wrapper.hidden = !visible;
    field.required = visible;
    field.disabled = !visible;
    if (!visible) field.value = '';
  }
  function setStudent(student) {
    state.student = student;
    $('newOsis').value = student?.osis || '';
    $('enhStudentQuery').value = student ? displayStudent(student) : '';
    $('enhSelectedStudent').textContent = student ? `Selected: ${displayStudent(student)}` : 'Select a student from the results.';
    $('enhStudentResults').hidden = true;
    $('enhStudentResults').replaceChildren();
    if (isTier1() && student) loadTier1History(student.osis);
  }
  function wirePicker() {
    const input = $('enhStudentQuery'), results = $('enhStudentResults');
    let timer;
    input.setAttribute('role','combobox'); input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-expanded','false');
    const hide = () => { results.hidden = true; input.setAttribute('aria-expanded','false'); };
    input.addEventListener('input', () => {
      state.student = null; $('newOsis').value = '';
      $('enhSelectedStudent').textContent = 'Select a matching student.';
      if (isTier1()) info('newTier1History','Select a student to see recent Tier 1 logs.');
      clearTimeout(timer);
      const query = input.value.trim(), seq = ++state.pickSeq;
      if (query.length < 2) { hide(); results.replaceChildren(); return; }
      timer = setTimeout(async () => {
        try {
          const data = await api(`/admin/roster/search?q=${encode(query)}`);
          if (seq !== state.pickSeq) return;
          results.replaceChildren();
          (data.results || []).slice(0,10).forEach(student => {
            const button = document.createElement('button');
            button.type='button'; button.className='mtssStudentResult';
            button.textContent=displayStudent(student);
            button.addEventListener('click', () => { setStudent(student); input.focus(); });
            results.appendChild(button);
          });
          if (!results.childElementCount) {
            const empty=document.createElement('div');empty.className='mtssPickerEmpty';empty.textContent='No matching students.';results.appendChild(empty);
          }
          results.hidden=false; input.setAttribute('aria-expanded','true');
        } catch (error) {
          if (seq === state.pickSeq) { results.textContent='Student search unavailable.';results.hidden=false;input.setAttribute('aria-expanded','true'); }
        }
      },200);
    });
    input.addEventListener('keydown',e => {
      if (e.key==='Escape') { hide(); return; }
      const buttons=[...results.querySelectorAll('button')];
      if (!results.hidden && buttons.length && (e.key==='ArrowDown'||e.key==='Enter')) {
        e.preventDefault(); if(e.key==='Enter') buttons[0].click(); else buttons[0].focus();
      }
    });
    results.addEventListener('keydown',e => {
      const buttons=[...results.querySelectorAll('button')];
      const idx=buttons.indexOf(document.activeElement);
      if(idx<0)return;
      if(e.key==='Escape'){e.preventDefault();hide();input.focus();}
      if(e.key==='Enter'){e.preventDefault();buttons[idx].click();}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();buttons[(idx+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
      }
    });
  }
  async function setOsis(osis) {
    const wanted=String(osis || '').trim();if(!/^\d+$/.test(wanted))return;
    try {
      const data=await api(`/admin/roster/search?q=${encode(wanted)}`);
      const student=(data.results||[]).find(row=>String(row.osis)===wanted);
      if(student)setStudent(student);
      else { $('enhStudentQuery').value=wanted;info('enhSelectedStudent','Student not found in the current roster.'); }
    } catch { info('enhSelectedStudent','Could not verify this student.'); }
  }
  function updateMode() {
    const t1=isTier1();
    const suggested=isSuggestion();
    $('newCaseFields').hidden=t1;
    $('newTier1Fields').hidden=!t1;
    $('newSuggestionKindRow').hidden=!suggested;
    $('newSuggestionKind').disabled=!suggested;
    $('newFrequencyRow').hidden=t1;
    $('newReason').required=!t1;
    $('newReason').disabled=t1;
    $('newReviewDate').disabled=t1||suggested;
    $('newReviewDate').closest('label').hidden=t1||suggested;
    const escalation=suggested && $('newSuggestionKind').value==='escalation';
    $('newCatalogChoice').required=!escalation;
    $('newCatalogChoice').closest('label').querySelector('span').textContent=escalation?'Suggested intervention (optional)':'Approved intervention';
    $('newT1Date').required=t1;
    $('newT1Date').disabled=!t1;
    $('newT1Outcome').disabled=!t1;
    $('newT1Notes').disabled=!t1;
    $('newFrequency').disabled=t1;
    $('newCaseTitle').textContent=t1?'Log Tier 1 intervention':suggested?'Suggest Tier '+$('newTier').value+' support':'Open MTSS case';
    $('newInterventionLegend').textContent=t1?'Tier 1 intervention':suggested?'Proposed support':'Required initial intervention plan';
    $('newInterventionHelp').textContent=t1
      ? 'Record an intervention delivered to this student. This will not open a case or change their tier.'
      : suggested ? 'This is a request for MTSS review, not a case opening or tier change.'
      : 'The assigned intervention will be saved when the case opens.';
    $('newCaseSubmit').textContent=t1?'Log Tier 1 intervention':suggested?'Submit MTSS recommendation':'Open case and assign intervention';
    if(t1 && state.student)loadTier1History(state.student.osis);
    if(!t1)info('newTier1History','');
  }
  function fillCatalog(selectId,data){
    $(selectId).innerHTML=choices(data.interventions)+(state.leader?'<option value="__other__">Other — create a catalog option (leadership)</option>':'');
  }
  async function loadNewCatalog() {
    updateMode();
    const seq=++state.catalogSeq;
    const domain=$('newDomain').value, tier=$('newTier').value;
    try {
      const data=await api(`/admin/mtss/catalog?domain=${encode(domain)}&tier=${encode(tier)}`);
      if(seq!==state.catalogSeq)return;
      fillCatalog('newCatalogChoice',data);
      $('newFrequency').innerHTML='<option value="">Select frequency (optional)</option>'+(data.frequencies||[]).map(label=>`<option>${escapeHtml(label)}</option>`).join('');
      showOther('newCatalogChoice','newOtherWrapper','newOtherText');
    }catch(e){if(seq===state.catalogSeq)info('newCaseStatus',`Could not load interventions: ${e.message}`);}
  }
  async function chosenCatalog(selectId,textId,domain,tier){
    const id=$(selectId).value;
    if(!id)throw new Error('Select an intervention.');
    if(id!=='__other__')return id;
    if(!state.leader)throw new Error('Only leadership can create intervention catalog options.');
    const label=$(textId).value.trim();
    if(label.length<5)throw new Error('Describe the new intervention (at least 5 characters).');
    const result=await request('/admin/mtss/catalog/new',{domain,tier:Number(tier),label});
    return result.catalog.catalog_id;
  }
  function openNewCase(){
    setStudent(null);
    info('newCaseStatus','');$('newOtherText').value='';$('newT1Notes').value='';
    $('newT1Date').value=isoToday();$('newT1Outcome').value='delivered';
    $('newTier').value=canManageCases()?'2':'1';
    updateMode();loadNewCatalog();
    const osis=new URL(location.href).searchParams.get('osis');if(osis)setOsis(osis);
  }
  async function createCase(){
    if(!state.student?.osis){info('newCaseStatus','Select a student from autocomplete before continuing.');return;}
    const osis=state.student.osis,domain=$('newDomain').value,tier=Number($('newTier').value);
    const button=$('newCaseSubmit');button.disabled=true;
    try{
      const suggested=isSuggestion();
      const kind=$('newSuggestionKind').value;
      const id=(suggested&&kind==='escalation'&&!$('newCatalogChoice').value)
        ? '' : await chosenCatalog('newCatalogChoice','newOtherText',domain,tier);
      if(tier===1){
        info('newCaseStatus','Recording Tier 1 intervention…');
        await request('/admin/mtss/activity',{
          osis,domain,catalog_id:id,occurred_on:$('newT1Date').value,
          outcome:$('newT1Outcome').value,notes:$('newT1Notes').value
        });
        $('newT1Notes').value='';
        info('newCaseStatus','Tier 1 intervention logged. No formal case was opened and the student’s tier is unchanged.');
        await loadTier1History(osis);
        await loadNewCatalog();
        document.dispatchEvent(new CustomEvent('eaglenest:mtss:recommendation-submitted'));
        return;
      }
      const reason=$('newReason').value.trim();
      if(!reason)throw new Error('Please describe the concern and proposed support.');
      if(suggested){
        info('newCaseStatus','Sending recommendation for MTSS review…');
        await request('/admin/mtss/suggestion',{
          osis,domain,requested_tier:tier,recommendation_type:kind,
          catalog_id:id,frequency:$('newFrequency').value,reason
        });
        info('newCaseStatus','Recommendation submitted for review. Student tier and cases were not changed.');
        document.dispatchEvent(new CustomEvent('eaglenest:mtss:recommendation-submitted'));
        return;
      }
      if(!canManageCases())throw new Error('You do not have permission to open Tier 2/3 cases.');
      info('newCaseStatus','Opening case and assigning intervention…');
      const result=await request('/admin/mtss/case',{
        osis,domain,tier,reason,next_review_date:$('newReviewDate').value,
        initial_intervention_catalog_id:id,initial_frequency:$('newFrequency').value
      });
      $('newCaseBackdrop').hidden=true;
      await core().loadDashboard();
      if(result.case?.case_id)await core().openCase(result.case.case_id);
      if(result.initial_intervention_error)info('caseModalStatus',`Case opened, but initial intervention could not be assigned: ${result.initial_intervention_error}`);
      if(result.already_open)info('caseModalStatus','An active case already exists. No duplicate case was opened.');
    }catch(e){info('newCaseStatus',`Could not save: ${e.message}`);}
    finally{button.disabled=false;}
  }
  async function loadTier1History(osis){
    try{
      const result=await api(`/admin/mtss/activity?osis=${encode(osis)}`);
      renderActivities('newTier1History',(result.activities||[]).filter(row=>Number(row.tier)===1));
    }catch(e){info('newTier1History',`Could not load recent interventions: ${e.message}`);}
  }
  async function addIntervention(){
    const c=state.caseData?.case||core().currentCase()?.case;if(!c)return;
    try{
      const id=await chosenCatalog('interventionName','caseOtherText',c.domain,c.tier);
      await request('/admin/mtss/intervention',{
        case_id:c.case_id,catalog_id:id,method:$('interventionMethod').value,
        frequency:$('interventionFrequency').value,content_area:$('interventionContent').value,
        notes:$('interventionNotes').value,start_date:isoToday()
      });
      await core().openCase(c.case_id);await core().loadDashboard();
      info('caseModalStatus','Intervention assigned.');
    }catch(e){info('caseModalStatus',`Intervention failed: ${e.message}`);}
  }
  async function caseLoaded(data){
    state.caseData=data;
    // The legacy case modal renders option values as labels. The refined Worker
    // requires catalog IDs, so always populate this selector from catalog rows.
    const select=$('interventionName');
    try {
      const catalogData=await api(`/admin/mtss/catalog?domain=${encode(data.case.domain)}&tier=${encode(data.case.tier)}`);
      fillCatalog('interventionName',catalogData);
    } catch(error) {
      select.innerHTML='<option value="">Intervention catalog unavailable</option>';
      info('caseModalStatus',`Could not load approved interventions: ${error.message}`);
    }
    showOther('interventionName','caseOtherWrapper','caseOtherText');
    $('caseActivityIntervention').innerHTML='<option value="">Choose an assigned intervention</option>'+(data.interventions||[]).map(row=>`<option value="${escapeHtml(row.intervention_id)}">${escapeHtml(row.intervention_name)}</option>`).join('');
    $('caseActivityForm').hidden=!(data.permissions?.can_manage&&!data.permissions?.read_only&&data.case.is_active);
    $('caseActivityDate').value=isoToday();
    try{
      const result=await api(`/admin/mtss/activity?case_id=${encode(data.case.case_id)}`);
      renderActivities('caseActivities',result.activities||[]);
    }catch(e){info('caseActivities',`Could not load delivery history: ${e.message}`);}
  }
  function renderActivities(id,activities){
    const target=$(id);target.replaceChildren();
    if(!activities.length){target.textContent='No intervention deliveries logged yet.';return;}
    const fragment=document.createDocumentFragment();
    activities.forEach(row=>{
      const article=document.createElement('article');article.className='mtssActivityRow';
      const header=document.createElement('strong');header.textContent=`${row.occurred_on} · ${row.intervention_name} (${String(row.outcome||'').replaceAll('_',' ')})`;
      const detail=document.createElement('div');detail.textContent=[row.notes,row.actor_email].filter(Boolean).join(' · ');
      article.append(header,detail);fragment.appendChild(article);
    });target.appendChild(fragment);
  }
  async function logCaseActivity(){
    const c=state.caseData?.case;if(!c)return;
    try{
      info('caseActivityStatus','Saving intervention delivery…');
      await request('/admin/mtss/activity',{
        case_id:c.case_id,intervention_id:$('caseActivityIntervention').value,
        occurred_on:$('caseActivityDate').value,outcome:$('caseActivityOutcome').value,notes:$('caseActivityNotes').value
      });
      $('caseActivityNotes').value='';info('caseActivityStatus','Intervention delivery recorded.');
      await caseLoaded(state.caseData);
    }catch(e){info('caseActivityStatus',`Could not save: ${e.message}`);}
  }
  function updateTrigger(){
    $('btnNewCase').hidden=!state.canLog||core().isReadOnly();
    $('btnNewCase').textContent='Open / Log Case';
  }
  function init(){
    if(!core()||state.initialized)return;
    state.initialized=true;
    const access=core().getAccess?.()||{};
    state.leader=!!(access.can?.admin||access.can?.super_admin||access.staff_profile?.is_grade_team_lead||access.staff_profile?.is_district_chair);
    state.canLog=!!(access.can?.mtss||access.can?.mtss_manage||access.can?.teacher_attendance||access.can?.dean_dashboard||state.leader);
    if(!canManageCases()){
      ['2','3'].forEach(tier=>{const option=$('newTier').querySelector(`option[value="${tier}"]`);
        if(option){option.disabled=false;option.textContent=`Tier ${tier} — suggest support`;}});
    }
    updateTrigger();document.addEventListener('eaglenest:mtss:dashboard-loaded',updateTrigger);
    wirePicker();
    $('newDomain').addEventListener('change',loadNewCatalog);
    $('newTier').addEventListener('change',loadNewCatalog);
    $('newSuggestionKind').addEventListener('change',updateMode);
    $('newCatalogChoice').addEventListener('change',()=>showOther('newCatalogChoice','newOtherWrapper','newOtherText'));
    $('interventionName').addEventListener('change',()=>showOther('interventionName','caseOtherWrapper','caseOtherText'));
    $('caseActivityForm').addEventListener('submit',e=>{e.preventDefault();logCaseActivity();});
    const osis=new URL(location.href).searchParams.get('osis');if(osis)setOsis(osis);
  }
  window.EagleNESTMTSSEnhancements={init,openNewCase,setOsis,loadNewCatalog,createCase,addIntervention,caseLoaded};
})();

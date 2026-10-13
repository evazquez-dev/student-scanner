/* EAGLENEST_MTSS_REFINEMENT_V1: supplemental MTSS create-case and Tier 1 logging UI. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const core = () => window.EagleNESTMTSS;
  const api = (path, init) => core().api(path, init);
  const state = { selected: { new: null, t1: null }, pickSeq: 0, caseData: null, leader: false };
  let initialized = false;
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const encode = (v) => encodeURIComponent(String(v || ''));
  const request = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const info = (id, message) => { if ($(id)) $(id).textContent = message; };
  const isoToday = () => { const p = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); const d=Object.fromEntries(p.map(x=>[x.type,x.value])); return `${d.year}-${d.month}-${d.day}`; };
  const displayStudent = (s) => `${s.name || 'Student'} · OSIS ${s.osis}`;
  const pickerConfig = {
    new: { input:'enhStudentQuery', results:'enhStudentResults', osis:'newOsis', selected:'enhSelectedStudent' },
    t1: { input:'t1StudentQuery', results:'t1StudentResults', osis:'t1Osis', selected:'t1SelectedStudent' }
  };
  const choices = (rows) => '<option value="">Select an approved intervention</option>' + rows.map(r =>
    `<option value="${escapeHtml(r.catalog_id)}">${escapeHtml(r.label)}</option>`).join('');

  function selection(key, s) {
    const cfg = pickerConfig[key]; state.selected[key] = s;
    $(cfg.osis).value = s?.osis || '';
    $(cfg.input).value = s ? displayStudent(s) : '';
    $(cfg.selected).textContent = s ? `Selected: ${displayStudent(s)}` : 'Select a student from the results.';
    $(cfg.results).replaceChildren(); $(cfg.results).hidden = true;
    if (key === 't1' && s) loadTier1History(s.osis);
  }

  function wirePicker(key) {
    const cfg = pickerConfig[key]; const el = $(cfg.input); const suggestions = $(cfg.results);
    let timer = null;
    el.setAttribute('role', 'combobox'); el.setAttribute('aria-autocomplete', 'list');
    el.addEventListener('input', () => {
      state.selected[key] = null; $(cfg.osis).value = ''; $(cfg.selected).textContent = 'Select a matching student.';
      clearTimeout(timer); const query = el.value.trim(); const seq = ++state.pickSeq;
      if (query.length < 2) { suggestions.hidden = true; suggestions.replaceChildren(); return; }
      timer = setTimeout(async () => {
        try {
          const data = await api(`/admin/roster/search?q=${encode(query)}`);
          if (seq !== state.pickSeq) return;
          suggestions.replaceChildren();
          (data.results || []).slice(0, 10).forEach(s => {
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'mtssStudentResult';
            btn.textContent = `${s.name} · OSIS ${s.osis}`;
            btn.addEventListener('click', () => selection(key, s)); suggestions.appendChild(btn);
          });
          if (!suggestions.childElementCount) {
            const label = document.createElement('div'); label.className = 'mtssPickerEmpty'; label.textContent = 'No matching students.'; suggestions.appendChild(label);
          }
          suggestions.hidden = false;
        } catch { if (seq === state.pickSeq) { suggestions.hidden = false; suggestions.textContent = 'Student search unavailable.'; } }
      }, 200);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { suggestions.hidden = true; return; }
      if (suggestions.hidden) return;
      const buttons = [...suggestions.querySelectorAll('button')];
      if (!buttons.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const current = buttons.findIndex(b => b === document.activeElement);
        const next = e.key === 'ArrowDown' ? (current + 1) % buttons.length : (current < 0 ? buttons.length - 1 : (current + buttons.length - 1) % buttons.length);
        buttons[next].focus();
      } else if (e.key === 'Enter') { e.preventDefault(); buttons[0].click(); }
    });
    suggestions.addEventListener('keydown', (e) => {
      const buttons = [...suggestions.querySelectorAll('button')];
      const current = buttons.findIndex(b => b === document.activeElement);
      if (current < 0) return;
      if (e.key === 'Escape') { e.preventDefault(); suggestions.hidden=true; el.focus(); }
      if (e.key === 'Enter') { e.preventDefault(); buttons[current].click(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); const step = e.key === 'ArrowDown' ? 1 : -1;
        buttons[(current + step + buttons.length) % buttons.length].focus();
      }
    });
  }

  async function setOsis(osis, key='new') {
    const wanted = String(osis || '').trim(); if (!/^\d+$/.test(wanted)) return;
    try {
      const data = await api(`/admin/roster/search?q=${encode(wanted)}`);
      const s = (data.results || []).find(row => String(row.osis) === wanted);
      if (s) selection(key, s);
      else { $(pickerConfig[key].input).value = wanted; info(key === 'new'?'enhSelectedStudent':'t1SelectedStudent', 'Student not found in current roster.'); }
    } catch { info(key === 'new'?'enhSelectedStudent':'t1SelectedStudent', 'Could not verify this student.'); }
  }

  function isOther(selectId) { return $(selectId).value === '__other__'; }
  function showOther(selectId, wrapperId) { $(wrapperId).hidden = !isOther(selectId); }
  async function catalog(domain, tier) { return api(`/admin/mtss/catalog?domain=${encode(domain)}&tier=${encode(tier)}`); }
  function fillCatalog(selectId, catalogData) {
    const select = $(selectId);
    select.innerHTML = choices(catalogData.interventions || []) + (state.leader ? '<option value="__other__">Other — add approved choice (leadership)</option>' : '');
  }
  async function loadNewCatalog() {
    try {
      const d = await catalog($('newDomain').value, $('newTier').value);
      fillCatalog('newCatalogChoice', d);
      $('newFrequency').innerHTML = '<option value="">Select frequency (optional)</option>' + (d.frequencies || []).map(s => `<option>${escapeHtml(s)}</option>`).join('');
      showOther('newCatalogChoice', 'newOtherWrapper');
    } catch (e) { info('newCaseStatus', `Could not load interventions: ${e.message}`); }
  }
  async function loadTier1Catalog() {
    try { const d = await catalog($('t1Domain').value, 1); fillCatalog('t1CatalogChoice', d); showOther('t1CatalogChoice','t1OtherWrapper'); }
    catch (e) { info('t1Status', `Could not load Tier 1 catalog: ${e.message}`); }
  }
  async function chosenCatalog(selectId, textId, domain, tier) {
    const selected = $(selectId).value;
    if (!selected) throw new Error('Choose an intervention.');
    if (selected !== '__other__') return selected;
    if (!state.leader) throw new Error('Only leadership can create intervention options.');
    const label = $(textId).value.trim();
    if (label.length < 5) throw new Error('Describe the new intervention (at least 5 characters).');
    const result = await request('/admin/mtss/catalog/new', { domain, tier:Number(tier), label });
    return result.catalog.catalog_id;
  }

  function openNewCase() {
    selection('new', null); $('newOtherText').value = ''; info('newCaseStatus','');
    loadNewCatalog(); const q = new URL(location.href).searchParams.get('osis');
    if (q) setOsis(q);
  }
  async function createCase() {
    const osis = state.selected.new?.osis;
    if (!osis) { info('newCaseStatus','Select a student from the autocomplete suggestions before continuing.'); return; }
    const domain = $('newDomain').value, tier = Number($('newTier').value);
    const reason = $('newReason').value.trim();
    if (!reason) { info('newCaseStatus','A reason is required.'); return; }
    try {
      info('newCaseStatus', 'Opening case and assigning intervention…');
      const id = await chosenCatalog('newCatalogChoice','newOtherText',domain,tier);
      const data = await request('/admin/mtss/case', {
        osis,domain,tier,reason,next_review_date:$('newReviewDate').value,
        initial_intervention_catalog_id:id,
        initial_frequency:$('newFrequency').value
      });
      $('newCaseBackdrop').hidden = true;
      await core().loadDashboard();
      if (data.case?.case_id) await core().openCase(data.case.case_id);
      if (data.initial_intervention_error) info('caseModalStatus', `Case opened, but intervention could not be assigned: ${data.initial_intervention_error}`);
      if (data.already_open) info('caseModalStatus', 'An active case already exists for this student and domain. No duplicate case or intervention was added.');
    } catch (e) { info('newCaseStatus', `Could not open case: ${e.message}`); }
  }

  async function addIntervention() {
    const c = state.caseData?.case || core().currentCase()?.case;
    if (!c) return;
    try {
      const id = await chosenCatalog('interventionName','caseOtherText',c.domain,c.tier);
      const result = await request('/admin/mtss/intervention', {
        case_id:c.case_id, catalog_id:id, method:$('interventionMethod').value,
        frequency:$('interventionFrequency').value, content_area:$('interventionContent').value,
        notes:$('interventionNotes').value,start_date:isoToday()
      });
      info('caseModalStatus',result.ok?'Intervention assigned.':'Intervention failed.');
      await core().openCase(c.case_id); await core().loadDashboard();
    } catch (e) { info('caseModalStatus',`Intervention failed: ${e.message}`); }
  }

  async function caseLoaded(data) {
    state.caseData = data;
    const select = $('interventionName');
    // Existing mtss.js has already populated the catalog dropdown at this point.
    if (state.leader && !select.querySelector('option[value="__other__"]'))
      select.insertAdjacentHTML('beforeend','<option value="__other__">Other — add approved choice (leadership)</option>');
    showOther('interventionName','caseOtherWrapper');
    const interventions = (data.interventions || []);
    $('caseActivityIntervention').innerHTML = '<option value="">Choose an assigned intervention</option>' + interventions.map(i => `<option value="${escapeHtml(i.intervention_id)}">${escapeHtml(i.intervention_name)}</option>`).join('');
    $('caseActivityForm').hidden = !(data.permissions?.can_manage && !data.permissions?.read_only && data.case.is_active);
    $('caseActivityDate').value = isoToday();
    try {
      const events = await api(`/admin/mtss/activity?case_id=${encode(data.case.case_id)}`);
      renderActivities('caseActivities', events.activities || []);
    } catch (e) { info('caseActivities',`Could not load delivery history: ${e.message}`); }
  }

  function renderActivities(target, activities) {
    const box = $(target); box.replaceChildren();
    if (!activities.length) { box.textContent = 'No intervention delivery logged yet.'; return; }
    const fragment = document.createDocumentFragment();
    activities.forEach(row => {
      const article = document.createElement('article'); article.className = 'mtssActivityRow';
      const head = document.createElement('strong'); head.textContent = `${row.occurred_on} · ${row.intervention_name} (${row.outcome.replaceAll('_',' ')})`;
      const detail = document.createElement('div'); detail.textContent = [row.notes, row.actor_email].filter(Boolean).join(' · ');
      article.append(head, detail); fragment.appendChild(article);
    }); box.appendChild(fragment);
  }
  async function logCaseActivity() {
    const c = state.caseData?.case; if (!c) return;
    try {
      info('caseActivityStatus','Saving delivery log…');
      await request('/admin/mtss/activity', {
        case_id:c.case_id, intervention_id:$('caseActivityIntervention').value,
        occurred_on:$('caseActivityDate').value, outcome:$('caseActivityOutcome').value, notes:$('caseActivityNotes').value
      });
      $('caseActivityNotes').value=''; info('caseActivityStatus','Intervention delivery recorded.');
      await caseLoaded(state.caseData);
    } catch (e) { info('caseActivityStatus',`Could not save: ${e.message}`); }
  }
  function openTier1() {
    selection('t1', null); $('t1Notes').value = ''; $('t1OtherText').value = '';
    $('t1ActivityDate').value = isoToday(); $('t1Backdrop').hidden = false;
    info('t1Status',''); $('tier1History').textContent = 'Choose a student to view recent logs.';
    loadTier1Catalog(); const q = new URL(location.href).searchParams.get('osis'); if (q) setOsis(q,'t1');
  }
  async function loadTier1History(osis) {
    try {
      const result = await api(`/admin/mtss/activity?osis=${encode(osis)}`);
      renderActivities('tier1History', (result.activities || []).filter(r => Number(r.tier) === 1));
    } catch (e) { info('tier1History',`Could not load history: ${e.message}`); }
  }
  async function saveTier1() {
    const osis = state.selected.t1?.osis;
    if (!osis) { info('t1Status','Select a student from the search results.'); return; }
    try {
      info('t1Status','Recording Tier 1 intervention…');
      const domain = $('t1Domain').value;
      const id = await chosenCatalog('t1CatalogChoice','t1OtherText',domain,1);
      await request('/admin/mtss/activity', {
        osis, domain, catalog_id:id, occurred_on:$('t1ActivityDate').value,
        outcome:$('t1Outcome').value, notes:$('t1Notes').value
      });
      $('t1Notes').value=''; info('t1Status','Tier 1 intervention logged. Student tier is unchanged.');
      await loadTier1History(osis);
    } catch (e) { info('t1Status',`Could not log intervention: ${e.message}`); }
  }

  function init() {
    if (!core() || initialized) return;
    initialized = true;
    wirePicker('new'); wirePicker('t1');
    const access = core().getAccess?.() || {};
    state.leader = !!(access.can?.admin || access.can?.super_admin || access.staff_profile?.is_grade_team_lead || access.staff_profile?.is_district_chair);
    const canLog = !!(access.can?.mtss || access.can?.mtss_manage || access.can?.teacher_attendance || access.can?.dean_dashboard || state.leader);
    $('btnTier1').hidden = !canLog || core().isReadOnly();
    $('btnTier1').addEventListener('click', openTier1);
    $('t1Close').addEventListener('click',()=>{ $('t1Backdrop').hidden=true; });
    $('t1Domain').addEventListener('change', loadTier1Catalog);
    $('newDomain').addEventListener('change', loadNewCatalog); $('newTier').addEventListener('change', loadNewCatalog);
    $('newCatalogChoice').addEventListener('change',()=>showOther('newCatalogChoice','newOtherWrapper'));
    $('t1CatalogChoice').addEventListener('change',()=>showOther('t1CatalogChoice','t1OtherWrapper'));
    $('interventionName').addEventListener('change',()=>showOther('interventionName','caseOtherWrapper'));
    $('t1Form').addEventListener('submit',e=>{e.preventDefault();saveTier1();});
    $('caseActivityForm').addEventListener('submit',e=>{e.preventDefault();logCaseActivity();});
    const urlOsis = new URL(location.href).searchParams.get('osis');
    if (urlOsis) setOsis(urlOsis);
  }
  window.EagleNESTMTSSEnhancements = { init, openNewCase, setOsis, loadNewCatalog, createCase, addIntervention, caseLoaded };
  // mtss.js calls init() after its authenticated boot has completed.
})();

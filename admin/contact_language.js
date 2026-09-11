(() => {
  'use strict';

  const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
  const SESSION_HEADER = 'x-admin-session';
  const SESSION_KEYS = [
    'ss_admin_session_sid_v1',
    'student_contacts_admin_session_v1',
    'attendance_outreach_admin_session_v1',
    'teacher_att_admin_session_v1',
    'communications_admin_session_v1',
    'admin_session_v1'
  ];
  const nativeFetch = window.fetch.bind(window);
  const contactsByStudent = new Map();
  const languageByStudent = new Map();
  let currentStudent = '';
  let activeContact = null;
  let activePreference = null;
  let languageDecision = '';
  let featureAvailable = true;
  let featureError = '';
  let pageModule = '';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function lower(v){ return clean(v).toLowerCase(); }

  function getSid(){
    try {
      for(const key of SESSION_KEYS){
        const value = clean(sessionStorage.getItem(key) || localStorage.getItem(key));
        if(value) return value;
      }
    } catch {}
    return '';
  }

  function stashSid(resp){
    try {
      const sid = clean(resp?.headers?.get(SESSION_HEADER) || resp?.headers?.get('X-Admin-Session'));
      if(!sid) return;
      for(const key of SESSION_KEYS){ sessionStorage.setItem(key, sid); localStorage.setItem(key, sid); }
    } catch {}
  }

  async function languageFetch(pathOrUrl, init={}){
    const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
    const headers = new Headers(init.headers || {});
    const sid = getSid();
    if(sid && !headers.has(SESSION_HEADER)) headers.set(SESSION_HEADER, sid);
    const response = await nativeFetch(url, { ...init, headers, credentials:'include', cache:'no-store' });
    stashSid(response);
    return response;
  }

  function requestUrl(input){
    try {
      if(input instanceof Request) return new URL(input.url, location.href);
      return new URL(String(input), location.href);
    } catch { return null; }
  }

  function requestMethod(input, init){
    return String(init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  }

  function parseJsonBody(input, init){
    try {
      if(typeof init?.body === 'string') return JSON.parse(init.body);
    } catch {}
    return null;
  }

  function syntheticError(baseResponse, code, detail, status=428){
    const headers = new Headers({'content-type':'application/json; charset=utf-8'});
    const sid = baseResponse?.headers?.get?.(SESSION_HEADER) || baseResponse?.headers?.get?.('X-Admin-Session') || getSid();
    if(sid) headers.set(SESSION_HEADER, sid);
    return new Response(JSON.stringify({ ok:false, error:code, detail }), { status, headers });
  }

  function preferenceMap(student){
    return languageByStudent.get(clean(student)) || new Map();
  }

  function preferenceForContact(student, contact){
    if(!contact) return null;
    const map = preferenceMap(student);
    return map.get(clean(contact.contact_assoc_id)) || null;
  }

  async function loadLanguageState(student){
    const osis = clean(student);
    if(!osis) return null;
    try {
      const response = await languageFetch(`/admin/contact_language/student?student_number=${encodeURIComponent(osis)}`, { method:'GET' });
      const data = await response.json().catch(() => null);
      if(!response.ok || !data?.ok){
        if(data?.error === 'contact_language_migration_required'){
          featureAvailable = false;
          featureError = 'Contact language migration has not been applied yet.';
        }
        throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
      }
      featureAvailable = true;
      featureError = '';
      const map = new Map();
      for(const row of Array.isArray(data.contacts) ? data.contacts : []){
        if(row?.contact_assoc_id) map.set(clean(row.contact_assoc_id), row.preference || null);
      }
      languageByStudent.set(osis, map);
      if(activeContact && currentStudent === osis){ activePreference = preferenceForContact(osis, activeContact); }
      queueMicrotask(renderLanguageUi);
      return data;
    } catch(error){
      console.warn('[contact-language] preference load unavailable', error);
      queueMicrotask(renderLanguageUi);
      return null;
    }
  }

  async function captureContactResponse(response, url){
    try {
      const data = await response.clone().json();
      if(!data?.ok || !Array.isArray(data.contacts)) return;
      const student = clean(data.student_number || url.searchParams.get('student_number') || url.searchParams.get('osis'));
      if(!student) return;
      currentStudent = student;
      contactsByStudent.set(student, data.contacts);
      await loadLanguageState(student);
      setTimeout(renderLanguageUi, 0);
    } catch {}
  }

  function snapshotFromPreference(pref){
    if(!pref?.preferred_language) return null;
    return {
      value: pref.preferred_language,
      confirmed: pref.confirmed === true,
      confirmation_count: Number(pref.confirmation_count || 0),
      required_confirmations: Number(pref.required_confirmations || 3),
      needs_confirmation: pref.needs_confirmation !== false,
      origin_source: clean(pref.origin_source),
      source_confidence: clean(pref.source_confidence),
      snapshot_at_iso: new Date().toISOString()
    };
  }

  async function confirmPreference(student, contact, language){
    const response = await languageFetch('/admin/contact_language/confirm', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        student_number: clean(student),
        contact_assoc_id: clean(contact?.contact_assoc_id),
        person_id: clean(contact?.person_id || contact?.source?.person_id),
        preferred_language: clean(language),
        source: pageModule === 'attendance_outreach' ? 'attendance_outreach_communication' : 'student_contacts_communication'
      })
    });
    const data = await response.json().catch(() => null);
    if(!response.ok || !data?.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
    const map = preferenceMap(student);
    map.set(clean(contact.contact_assoc_id), data.preference || null);
    languageByStudent.set(clean(student), map);
    activePreference = data.preference || null;
    return data.preference || null;
  }

  function selectedLanguage(){
    const select = document.getElementById('contactLanguageSelect');
    const other = document.getElementById('contactLanguageOther');
    if(!select) return '';
    if(select.value === '__other__') return clean(other?.value);
    return clean(select.value);
  }

  function storedLanguage(){ return clean(activePreference?.preferred_language); }

  function languageChanged(){
    const selected = selectedLanguage();
    const stored = storedLanguage();
    return !!selected && !!stored && lower(selected) !== lower(stored);
  }

  function needsPrompt(){
    if(!featureAvailable || !activeContact) return false;
    if(languageChanged()) return true;
    if(!storedLanguage()) return true;
    return activePreference?.needs_confirmation !== false;
  }

  function setPanelError(message=''){
    const el = document.getElementById('contactLanguageError');
    if(!el) return;
    el.textContent = clean(message);
    el.hidden = !message;
  }

  function preferenceStatusText(pref){
    if(!featureAvailable) return featureError || 'Language preference unavailable';
    if(!pref?.preferred_language) return 'Not confirmed yet';
    const count = Number(pref.confirmation_count || 0);
    const required = Number(pref.required_confirmations || 3);
    if(pref.confirmed === true || count >= required) return `Confirmed · ${Math.min(count, required)}/${required}`;
    if(pref.source_confidence === 'parentsquare_default_unverified') return `ParentSquare default · ${count}/${required} confirmations`;
    if(pref.origin_source === 'parentsquare') return `ParentSquare import · ${count}/${required} confirmations`;
    return `${count}/${required} confirmations`;
  }

  function badgeText(pref){
    if(!pref?.preferred_language) return 'Language not confirmed';
    const count = Number(pref.confirmation_count || 0);
    const required = Number(pref.required_confirmations || 3);
    if(pref.confirmed === true || count >= required) return `${pref.preferred_language} ✓`;
    if(pref.source_confidence === 'parentsquare_default_unverified') return `${pref.preferred_language}? · PS default ${count}/${required}`;
    return `${pref.preferred_language} · confirm ${count}/${required}`;
  }

  function badgeClass(pref){
    if(!pref?.preferred_language) return 'unknown';
    return pref.confirmed === true ? 'confirmed' : 'pending';
  }

  function makeBadge(pref){
    const span = document.createElement('span');
    span.className = `contactLanguageBadge ${badgeClass(pref)}`;
    span.dataset.contactLanguageBadge = '1';
    span.textContent = badgeText(pref);
    return span;
  }

  // CONTACT_LANGUAGE_BADGE_IDEMPOTENT_V2
  // Keep badge rendering idempotent. The contact list is observed for app-driven
  // rerenders, so removing/re-adding our own badge on every observer callback
  // creates a self-triggering MutationObserver loop that can freeze the page.
  function syncBadge(target, pref){
    if(!target) return;
    let badge = target.querySelector(':scope > [data-contact-language-badge="1"]');
    if(!badge){
      badge = makeBadge(pref);
      target.appendChild(badge);
      return;
    }
    const nextClass = `contactLanguageBadge ${badgeClass(pref)}`;
    const nextText = badgeText(pref);
    if(badge.className !== nextClass) badge.className = nextClass;
    if(badge.textContent !== nextText) badge.textContent = nextText;
  }

  function renderContactBadges(){
    if(!currentStudent) return;
    const contacts = contactsByStudent.get(currentStudent) || [];
    const map = preferenceMap(currentStudent);

    if(pageModule === 'student_contacts'){
      const cards = Array.from(document.querySelectorAll('#contacts .contactCard:not(.directStudentContactCard)'));
      cards.forEach((card, index) => {
        const contact = contacts[index];
        if(!contact) return;
        const target = card.querySelector('.badges') || card.querySelector('.contactTop') || card;
        syncBadge(target, map.get(clean(contact.contact_assoc_id)) || null);
      });
    }

    if(pageModule === 'attendance_outreach'){
      document.querySelectorAll('#contactChoices input[name="attendanceContact"]').forEach((input) => {
        const label = input.closest('label');
        if(!label) return;
        const assoc = clean(input.value);
        if(!assoc || assoc === 'general') return;
        syncBadge(label, map.get(assoc) || null);
      });
    }
  }

  function ensurePanel(){
    let panel = document.getElementById('contactLanguagePanel');
    if(panel) return panel;
    panel = document.createElement('section');
    panel.id = 'contactLanguagePanel';
    panel.className = 'contactLanguagePanel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="contactLanguagePanelHead">
        <div>
          <div class="contactLanguagePanelTitle">Preferred contact language</div>
          <div id="contactLanguageName" class="contactLanguageHint"></div>
        </div>
        <div id="contactLanguageStatus" class="contactLanguagePanelStatus"></div>
      </div>
      <div class="contactLanguageFields">
        <label>Language
          <select id="contactLanguageSelect">
            <option value="">Not set yet</option>
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="__other__">Other language…</option>
          </select>
        </label>
        <label id="contactLanguageOtherWrap" hidden>Other language
          <input id="contactLanguageOther" type="text" maxlength="80" placeholder="Language">
        </label>
      </div>
      <div id="contactLanguageConfirmChoices" class="contactLanguageConfirmChoices" hidden>
        <label><input type="radio" name="contactLanguageDecision" value="confirm"> <span>I confirmed this preferred language with the contact.</span></label>
        <label id="contactLanguageSkipLabel"><input type="radio" name="contactLanguageDecision" value="skip"> <span>I could not confirm it this time.</span></label>
      </div>
      <p id="contactLanguageHint" class="contactLanguageHint"></p>
      <div id="contactLanguageError" class="contactLanguageError" hidden></div>`;

    if(pageModule === 'student_contacts'){
      const modal = document.querySelector('#commBackdrop .modal');
      const notes = modal?.querySelector('.noteLabel');
      if(notes) modal.insertBefore(panel, notes);
      else modal?.appendChild(panel);
    } else if(pageModule === 'attendance_outreach'){
      const contacts = document.getElementById('contactChoices');
      const field = contacts?.closest('.field');
      if(field?.parentElement) field.insertAdjacentElement('afterend', panel);
      else document.querySelector('#callBackdrop .modal')?.appendChild(panel);
    }

    panel.querySelector('#contactLanguageSelect')?.addEventListener('change', () => {
      languageDecision = '';
      panel.querySelectorAll('input[name="contactLanguageDecision"]').forEach((r) => { r.checked = false; });
      updatePanelState();
    });
    panel.querySelector('#contactLanguageOther')?.addEventListener('input', updatePanelState);
    panel.querySelectorAll('input[name="contactLanguageDecision"]').forEach((radio) => radio.addEventListener('change', () => {
      languageDecision = clean(radio.value);
      setPanelError('');
      updatePanelState();
    }));
    return panel;
  }

  function updatePanelState(){
    const panel = document.getElementById('contactLanguagePanel');
    if(!panel || panel.hidden || !activeContact) return;
    const select = document.getElementById('contactLanguageSelect');
    const otherWrap = document.getElementById('contactLanguageOtherWrap');
    if(otherWrap) otherWrap.hidden = select?.value !== '__other__';
    const choices = document.getElementById('contactLanguageConfirmChoices');
    const prompt = needsPrompt();
    if(choices) choices.hidden = !prompt;
    const skip = document.querySelector('input[name="contactLanguageDecision"][value="skip"]');
    if(skip) skip.disabled = languageChanged();
    const skipLabel = document.getElementById('contactLanguageSkipLabel');
    if(skipLabel) skipLabel.title = languageChanged() ? 'Changing the stored language requires confirmation.' : '';
    const hint = document.getElementById('contactLanguageHint');
    if(hint){
      if(!featureAvailable) hint.textContent = featureError || 'Language preferences are temporarily unavailable. Communication logging is not blocked.';
      else if(languageChanged()) hint.textContent = 'You changed the stored language. Confirm the new preference to save that correction.';
      else if(prompt) hint.textContent = 'EagleNEST asks during the first 3 communications. If you cannot verify it on this contact, choose “could not confirm” and continue.';
      else hint.textContent = 'This preference is confirmed. You can still change it if the family tells you something different.';
    }
  }

  function renderPanel(){
    const panel = ensurePanel();
    if(!panel) return;
    if(!activeContact){ panel.hidden = true; return; }
    panel.hidden = false;
    activePreference = preferenceForContact(currentStudent, activeContact);
    languageDecision = '';
    panel.querySelectorAll('input[name="contactLanguageDecision"]').forEach((r) => { r.checked = false; });

    const name = clean(activeContact?.display?.name || activeContact?.source?.name || activeContact?.source?.display_name || 'Selected contact');
    const relation = clean(activeContact?.display?.relationship || activeContact?.source?.relationship);
    const nameEl = document.getElementById('contactLanguageName');
    if(nameEl) nameEl.textContent = `${name}${relation && lower(relation) !== 'not set' ? ` · ${relation}` : ''}`;
    const status = document.getElementById('contactLanguageStatus');
    if(status) status.textContent = preferenceStatusText(activePreference);

    const stored = storedLanguage();
    const select = document.getElementById('contactLanguageSelect');
    const other = document.getElementById('contactLanguageOther');
    if(select){
      if(!stored) select.value = '';
      else if(['English','Spanish'].includes(stored)) select.value = stored;
      else { select.value = '__other__'; if(other) other.value = stored; }
    }
    if(other && ['English','Spanish'].includes(stored)) other.value = '';
    setPanelError('');
    updatePanelState();
  }

  function renderLanguageUi(){
    renderContactBadges();
    if(activeContact) renderPanel();
  }

  function contactByAssoc(student, assoc){
    return (contactsByStudent.get(clean(student)) || []).find((c) => clean(c?.contact_assoc_id) === clean(assoc)) || null;
  }

  function setActiveContact(student, contact){
    currentStudent = clean(student || currentStudent);
    activeContact = contact || null;
    activePreference = activeContact ? preferenceForContact(currentStudent, activeContact) : null;
    languageDecision = '';
    setTimeout(renderPanel, 0);
  }

  function inferStudentContactsCard(button){
    const card = button?.closest?.('.contactCard');
    if(!card || card.classList.contains('directStudentContactCard') || card.dataset.communicationTarget === 'student') return null;
    const cards = Array.from(document.querySelectorAll('#contacts .contactCard:not(.directStudentContactCard)'));
    const index = cards.indexOf(card);
    const contacts = contactsByStudent.get(currentStudent) || [];
    return index >= 0 ? (contacts[index] || null) : null;
  }

  function validateLanguageGate(){
    if(!activeContact || !featureAvailable) return true;
    if(!needsPrompt()) return true;
    if(!languageDecision){
      setPanelError('Choose whether you confirmed the preferred language this time.');
      document.getElementById('contactLanguagePanel')?.scrollIntoView({ block:'nearest', behavior:'smooth' });
      return false;
    }
    if(languageDecision === 'confirm' && !selectedLanguage()){
      setPanelError('Choose the preferred language before confirming it.');
      return false;
    }
    if(languageChanged() && languageDecision !== 'confirm'){
      setPanelError('Changing the stored language requires confirmation.');
      return false;
    }
    setPanelError('');
    return true;
  }

  async function enrichCommunicationRequest(input, init, payload){
    const student = clean(payload?.student_number || payload?.osis || currentStudent);
    const assoc = clean(payload?.contact_assoc_id);
    if(!student || !assoc) return { input, init, payload };
    let contact = contactByAssoc(student, assoc);
    if(!contact){
      contact = {
        contact_assoc_id: assoc,
        person_id: clean(payload?.person_id),
        display: { name: clean(payload?.contact_display_name), relationship: clean(payload?.contact_relationship) },
        source: { person_id: clean(payload?.person_id) }
      };
    }
    let pref = preferenceForContact(student, contact);
    const isActive = activeContact && clean(activeContact.contact_assoc_id) === assoc && currentStudent === student;
    if(isActive && languageDecision === 'confirm'){
      try {
        pref = await confirmPreference(student, contact, selectedLanguage());
      } catch(error){
        return { error: syntheticError(null, 'contact_language_confirm_failed', String(error?.message || error), 502) };
      }
    }

    const snapshot = payload?.contact_snapshot && typeof payload.contact_snapshot === 'object' && !Array.isArray(payload.contact_snapshot)
      ? { ...payload.contact_snapshot }
      : {};
    const languageSnapshot = snapshotFromPreference(pref);
    if(languageSnapshot) snapshot.preferred_language = languageSnapshot;
    payload = { ...payload, contact_snapshot: snapshot };
    const nextInit = { ...init, body: JSON.stringify(payload) };
    return { input, init: nextInit, payload, preference: pref };
  }

  window.fetch = async function contactLanguageFetch(input, init={}){
    const url = requestUrl(input);
    const method = requestMethod(input, init);
    const isContactRead = url?.pathname === '/admin/contacts/student' && method === 'GET';
    const isCommunicationCreate = url?.pathname === '/admin/communications/create' && method === 'POST';

    if(isCommunicationCreate){
      const payload = parseJsonBody(input, init);
      if(payload?.contact_assoc_id){
        const enriched = await enrichCommunicationRequest(input, init, payload);
        if(enriched.error) return enriched.error;
        const response = await nativeFetch(input, enriched.init);
        stashSid(response);
        if(response.ok){
          const student = clean(payload.student_number || payload.osis || currentStudent);
          if(student) setTimeout(() => loadLanguageState(student), 50);
        }
        return response;
      }
    }

    const response = await nativeFetch(input, init);
    stashSid(response);
    if(isContactRead && response.ok) await captureContactResponse(response, url);
    return response;
  };

  function installInteractionHooks(){
    document.addEventListener('click', (event) => {
      const target = event.target;
      if(pageModule === 'student_contacts'){
        if(target?.closest?.('#logGeneralComm')) setActiveContact(currentStudent, null);
        const commBtn = target?.closest?.('.commBtn');
        if(commBtn) setActiveContact(currentStudent, inferStudentContactsCard(commBtn));
      }

      const save = target?.closest?.('#saveComm, #saveCall, #saveNextCall');
      if(save && !validateLanguageGate()){
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    document.addEventListener('change', (event) => {
      if(pageModule !== 'attendance_outreach') return;
      const input = event.target?.matches?.('#contactChoices input[name="attendanceContact"]') ? event.target : null;
      if(!input) return;
      const assoc = clean(input.value);
      setActiveContact(currentStudent, assoc && assoc !== 'general' ? contactByAssoc(currentStudent, assoc) : null);
    }, true);

    // CONTACT_LANGUAGE_OBSERVER_NO_SELF_LOOP_V2
    // Observe only the app-owned contact list. Modal visibility is handled by
    // the click/change hooks above; watching our own panel's hidden attributes
    // would cause the language UI to retrigger itself.
    const observer = new MutationObserver((mutations) => {
      const meaningful = mutations.some((mutation) => {
        const nodes = [...mutation.addedNodes, ...mutation.removedNodes].filter((node) => node.nodeType === 1);
        if(!nodes.length) return false;
        return nodes.some((node) => !node.matches?.('[data-contact-language-badge="1"]'));
      });
      if(meaningful) queueMicrotask(renderLanguageUi);
    });
    const observeId = pageModule === 'student_contacts' ? 'contacts' : 'contactChoices';
    const observed = document.getElementById(observeId);
    if(observed) observer.observe(observed, { childList:true, subtree:true });
  }

  function parseCsv(text){
    const rows = [];
    let row = [], cell = '', quoted = false;
    const input = String(text || '').replace(/^\uFEFF/, '');
    for(let i=0;i<input.length;i+=1){
      const ch = input[i];
      if(quoted){
        if(ch === '"' && input[i+1] === '"'){ cell += '"'; i += 1; }
        else if(ch === '"') quoted = false;
        else cell += ch;
      } else if(ch === '"') quoted = true;
      else if(ch === ','){ row.push(cell); cell = ''; }
      else if(ch === '\n'){ row.push(cell.replace(/\r$/, '')); rows.push(row); row=[]; cell=''; }
      else cell += ch;
    }
    if(cell.length || row.length){ row.push(cell.replace(/\r$/, '')); rows.push(row); }
    const header = (rows.shift() || []).map(clean);
    return rows.filter(r => r.some(v => clean(v))).map(values => Object.fromEntries(header.map((h,i) => [h, values[i] ?? ''])));
  }

  function parentSquareImportRows(csvRows){
    return csvRows.map((row) => ({
      name: clean(row['Name']),
      language: clean(row['User Language']),
      email: clean(row['Email']),
      phone: clean(row['Phone']),
      student_numbers: [...String(row['Student Name(s)'] || '').matchAll(/ID:\s*(\d+)/g)].map(m => m[1])
    }));
  }

  function unresolvedCsv(rows){
    const header = ['Name','Language','Reason','Student Numbers','Top Score'];
    const q = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
    return [header.map(q).join(','), ...(rows || []).map(r => [r.name,r.language,r.reason,(r.student_numbers||[]).join(';'),r.top_score||''].map(q).join(','))].join('\n');
  }

  function showImportResult(result){
    document.getElementById('contactLanguageImportResult')?.remove();
    const card = document.createElement('section');
    card.id = 'contactLanguageImportResult';
    card.className = 'card contactLanguageImportResult';
    card.innerHTML = `<strong>ParentSquare language import completed</strong>
      <div>Processed ${Number(result.processed_rows||0)} rows · matched ${Number(result.matched_rows||0)} · imported ${Number(result.imported_contacts||0)} contacts · refreshed ${Number(result.refreshed_contacts||0)} · protected existing staff-confirmed ${Number(result.skipped_existing_staff||0)} · unresolved ${Number(result.unresolved_count||0)} · conflicts ${Number(result.conflicts||0)}.</div>`;
    if(Array.isArray(result.unresolved) && result.unresolved.length){
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn secondary'; btn.style.marginTop = '.55rem'; btn.textContent = 'Download unresolved matches';
      btn.addEventListener('click', () => {
        const blob = new Blob([unresolvedCsv(result.unresolved)], { type:'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `parentsquare-language-unresolved-${new Date().toISOString().slice(0,10)}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      card.appendChild(btn);
    }
    const search = document.querySelector('.searchCard');
    search?.insertAdjacentElement('afterend', card);
  }

  async function installImporter(){
    if(pageModule !== 'student_contacts') return;
    try {
      const accessResponse = await languageFetch('/admin/access', { method:'GET' });
      const access = await accessResponse.json().catch(() => null);
      const role = lower(access?.role);
      if(!accessResponse.ok || !access?.ok || !['admin','super_admin'].includes(role)) return;

      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn secondary contactLanguageImportBtn'; button.textContent = 'Import ParentSquare Languages';
      button.title = 'One-time import. English is treated as ParentSquare default/unverified; non-English values remain unconfirmed until staff verifies them.';
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.csv,text/csv'; input.hidden = true;
      document.querySelector('.pageHead')?.append(button, input);
      button.addEventListener('click', () => input.click());
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if(!file) return;
        button.disabled = true;
        button.textContent = 'Reading CSV…';
        try {
          const rows = parentSquareImportRows(parseCsv(await file.text()));
          const linked = rows.filter(r => r.student_numbers.length).length;
          const spanish = rows.filter(r => lower(r.language) === 'spanish').length;
          const english = rows.filter(r => lower(r.language) === 'english').length;
          if(!window.confirm(`Import ${rows.length} ParentSquare users?\n\n${linked} rows have student IDs.\n${spanish} Spanish · ${english} English.\n\nEnglish will be seeded as ParentSquare default/unverified. Existing staff-confirmed EagleNEST preferences will not be overwritten.`)) return;
          button.textContent = 'Matching contacts…';
          const response = await languageFetch('/admin/contact_language/import_parentsquare', {
            method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ rows })
          });
          const result = await response.json().catch(() => null);
          if(!response.ok || !result?.ok) throw new Error(result?.detail || result?.error || `HTTP ${response.status}`);
          showImportResult(result);
          if(currentStudent) await loadLanguageState(currentStudent);
        } catch(error){
          window.alert(`ParentSquare language import failed: ${error?.message || error}`);
        } finally {
          input.value = '';
          button.disabled = false;
          button.textContent = 'Import ParentSquare Languages';
        }
      });
    } catch {}
  }

  function boot(){
    pageModule = clean(document.body?.dataset?.module);
    if(!['student_contacts','attendance_outreach'].includes(pageModule)) return;
    installInteractionHooks();
    ensurePanel();
    installImporter();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();

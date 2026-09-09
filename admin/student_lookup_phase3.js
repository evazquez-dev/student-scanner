/* admin/student_lookup_phase3.js — Student Lookup Phase 3 operational actions */
(() => {
  'use strict';

  const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const ADMIN_SESSION_KEYS = [
    'ss_admin_session_sid_v1',
    'teacher_att_admin_session_v1',
    'reflection_hold_admin_session_v1',
    'early_dismissal_admin_session_v1',
    'admin_session_v1',
    'admin_session_sid'
  ];

  const state = {
    seq: 0,
    osis: '',
    access: null,
    dashboard: null,
    refreshTimer: null
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));

  function getStoredAdminSessionSid(){
    try {
      for (const key of ADMIN_SESSION_KEYS) {
        const value = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
        if (value) return value;
      }
    } catch {}
    return '';
  }

  function stashAdminSessionFromResponse(resp){
    try {
      const sid = String(resp?.headers?.get(ADMIN_SESSION_HEADER) || resp?.headers?.get('X-Admin-Session') || '').trim();
      if (!sid) return;
      for (const key of ADMIN_SESSION_KEYS) {
        try { sessionStorage.setItem(key, sid); } catch {}
        try { localStorage.setItem(key, sid); } catch {}
      }
    } catch {}
  }

  async function phase3Fetch(pathOrUrl, init = {}){
    const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
    const headers = new Headers(init.headers || {});
    const sid = getStoredAdminSessionSid();
    if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
    const resp = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });
    stashAdminSessionFromResponse(resp);
    return resp;
  }

  async function jsonRequest(pathOrUrl, init = {}){
    const resp = await phase3Fetch(pathOrUrl, init);
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data?.ok) {
      const err = new Error(data?.error || `HTTP ${resp.status}`);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function isReadOnly(){
    return state.access?.view_as?.active === true || state.access?.view_as?.read_only === true;
  }

  function nyDate(){
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'
      }).formatToParts(new Date());
      const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      return `${map.year}-${map.month}-${map.day}`;
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function nyDateForIso(iso){
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'
      }).formatToParts(d);
      const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      return `${map.year}-${map.month}-${map.day}`;
    } catch { return String(iso || '').slice(0, 10); }
  }

  function fmtClock(iso){
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  }

  function injectStyles(){
    if ($('studentLookupPhase3Styles')) return;
    const style = document.createElement('style');
    style.id = 'studentLookupPhase3Styles';
    style.textContent = `
      .phase3Block{margin-top:14px;border-top:1px solid var(--border);padding-top:14px}
      .phase3Head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:11px}
      .phase3Head p{margin:5px 0 0}
      .phase3Grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .phase3ActionCard{border:1px solid var(--border);background:var(--panel2);border-radius:15px;padding:13px;min-height:146px;display:flex;flex-direction:column;gap:7px}
      .phase3ActionCard[hidden]{display:none!important}
      .phase3ActionTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .phase3ActionTitle{font-weight:900}
      .phase3ActionStatus{font-size:18px;font-weight:900;line-height:1.2}
      .phase3ActionDetail{color:var(--muted);font-size:12px;line-height:1.45;min-height:34px}
      .phase3ActionButtons{display:flex;gap:7px;flex-wrap:wrap;margin-top:auto;padding-top:3px}
      .phase3ActionButtons .btn{padding:7px 10px;font-size:12px}
      .phase3ActionCard.loading{opacity:.72}
      .phase3ActionCard.emphasis{border-color:color-mix(in srgb,var(--warn) 72%,var(--border));box-shadow:inset 3px 0 0 var(--warn)}
      .phase3ActionCard.good{border-color:color-mix(in srgb,var(--good) 55%,var(--border))}
      .phase3ContextStatus{min-height:18px;color:var(--muted);font-size:12px}
      @media(max-width:800px){.phase3Grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function buildShell(){
    if ($('studentLookupPhase3')) return $('studentLookupPhase3');
    const overview = document.querySelector('[data-panel="overview"]');
    if (!overview) return null;
    const block = document.createElement('section');
    block.id = 'studentLookupPhase3';
    block.className = 'phase3Block';
    block.hidden = true;
    block.innerHTML = `
      <div class="phase3Head">
        <div>
          <h2>Student Actions</h2>
          <p class="muted small">Live workflow context. Actions reuse the existing EagleNEST modules, permissions, and write paths.</p>
        </div>
        <button id="phase3RefreshBtn" class="btn secondary small" type="button">Refresh actions</button>
      </div>
      <div id="phase3ContextStatus" class="phase3ContextStatus" aria-live="polite"></div>
      <div class="phase3Grid">
        <article id="phase3Phone" class="phase3ActionCard" hidden></article>
        <article id="phase3StaffPull" class="phase3ActionCard" hidden></article>
        <article id="phase3Reflection" class="phase3ActionCard" hidden></article>
        <article id="phase3EarlyDismissal" class="phase3ActionCard" hidden></article>
        <article id="phase3Incident" class="phase3ActionCard" hidden></article>
      </div>`;
    overview.appendChild(block);
    $('phase3RefreshBtn')?.addEventListener('click', () => loadCurrentStudent(true));
    return block;
  }

  function selectedOsis(){
    const fromUrl = String(new URL(location.href).searchParams.get('osis') || '').replace(/\D/g, '');
    if (fromUrl) return fromUrl;
    const match = String($('studentMeta')?.textContent || '').match(/OSIS\s+(\d{6,12})/i);
    return match?.[1] || '';
  }

  function studentName(){
    return String($('studentName')?.textContent || '').trim() || `OSIS ${selectedOsis()}`;
  }

  function cardHtml(title, status, detail, buttons, tone = ''){
    const badge = tone === 'emphasis'
      ? '<span class="pill warn">Needs attention</span>'
      : tone === 'good'
        ? '<span class="pill good">Ready</span>'
        : '';
    return `
      <div class="phase3ActionTop"><div class="phase3ActionTitle">${esc(title)}</div>${badge}</div>
      <div class="phase3ActionStatus">${esc(status)}</div>
      <div class="phase3ActionDetail">${esc(detail || '')}</div>
      <div class="phase3ActionButtons">${buttons || ''}</div>`;
  }

  function setCard(id, { title, status, detail = '', tone = '', buttons = '', hidden = false }){
    const el = $(id);
    if (!el) return;
    el.hidden = !!hidden;
    el.className = `phase3ActionCard${tone ? ` ${tone}` : ''}`;
    if (!hidden) el.innerHTML = cardHtml(title, status, detail, buttons, tone);
  }

  function loadingCards(){
    for (const [id, title] of [
      ['phase3Phone','Phone Pass'],
      ['phase3StaffPull','Staff Pull'],
      ['phase3Reflection','Reflection Hold'],
      ['phase3EarlyDismissal','Early Dismissal']
    ]) {
      const el = $(id);
      if (!el) continue;
      el.hidden = false;
      el.className = 'phase3ActionCard loading';
      el.innerHTML = cardHtml(title, 'Checking…', 'Loading current workflow context.', '');
    }
  }

  function hideUnavailable(id){
    const el = $(id);
    if (el) el.hidden = true;
  }

  function button(label, action, primary = false, disabled = false){
    return `<button type="button" class="btn ${primary ? 'primary' : 'secondary'} p3Action" data-p3-action="${esc(action)}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
  }

  function openUrl(path, params = {}){
    const url = new URL(path, location.href);
    for (const [key, value] of Object.entries(params)) {
      const v = String(value ?? '').trim();
      if (v) url.searchParams.set(key, v);
    }
    location.href = url.toString();
  }

  function dashboardContext(){
    const dash = state.dashboard || {};
    const current = dash.schedule?.now || {};
    const loc = dash.location || {};
    return {
      date: String(dash.date || nyDate()),
      periodLocal: String(current.periodLocal || '').trim(),
      room: String(current.room || loc.location_label || loc.locLabel || loc.loc || '').trim()
    };
  }

  function isStaffHoldToday(st){
    const owner = String(st?.held_by_email || st?.held_by_title || st?.held_by_role || '').trim();
    if (!owner) return false;
    const date = String(st?.held_date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date === nyDate();
    if (st?.held_by_since) return nyDateForIso(st.held_by_since) === nyDate();
    return true;
  }

  function actorIsAdmin(actor){
    const role = String(actor?.role || '').trim().toLowerCase();
    return role === 'admin' || role === 'super_admin';
  }

  function renderIncident(){
    const canIncident = !!(state.access?.can?.incident_creator || state.access?.can?.teacher_attendance || state.access?.can?.admin);
    if (!canIncident) return hideUnavailable('phase3Incident');
    const ctx = dashboardContext();
    const disabled = isReadOnly();
    setCard('phase3Incident', {
      title:'Incident',
      status:'Create incident report',
      detail:`${studentName()} will be preselected${ctx.periodLocal ? ` • Period ${ctx.periodLocal}` : ''}${ctx.room ? ` • ${ctx.room}` : ''}.`,
      tone:'',
      buttons:button('Create Incident', 'incident-open', true, disabled)
    });
  }

  function renderPhone(result, options){
    if (result?.status === 'rejected' || options?.status === 'rejected') {
      const err = result?.reason || options?.reason;
      if (Number(err?.status) === 401 || Number(err?.status) === 403) return hideUnavailable('phase3Phone');
      return setCard('phase3Phone', { title:'Phone Pass', status:'Unavailable', detail:String(err?.message || err || 'Could not load phone context.') });
    }
    const data = result.value;
    const opts = options.value;
    const st = data?.state || {};
    const canGrant = !!opts?.can_grant;
    const canReturn = !!opts?.can_return;
    if (!canGrant && !canReturn) return hideUnavailable('phase3Phone');

    const out = st.phone_out === true;
    const pickup = st.phone_pickup_requested === true;
    const returnRequested = st.phone_return_requested === true;
    const since = st.phone_out_since ? fmtClock(st.phone_out_since) : '';
    const by = String(st.phone_out_by_email || st.phone_out_by_title || st.phone_out_by_role || '').trim();
    let status = out ? 'Phone is out' : (pickup ? 'Pickup requested' : 'Phone is in locker');
    let detail = out
      ? [since ? `Picked up ${since}` : '', by ? `Confirmed by ${by}` : '', returnRequested ? 'Return requested' : ''].filter(Boolean).join(' • ')
      : (pickup ? 'Student was sent to pick up the phone.' : 'No active phone checkout.');
    let buttons = '';
    if (!isReadOnly() && out && canReturn) buttons += button('Student Returned Phone', 'phone-return', true);
    if (!isReadOnly() && !out && canGrant) buttons += button('Grant Phone', 'phone-grant', true);
    buttons += button('Open Phone Pass', 'phone-open');
    setCard('phase3Phone', { title:'Phone Pass', status, detail, tone: out || pickup || returnRequested ? 'emphasis' : '', buttons });
  }

  function renderStaffPull(result, options){
    if (result?.status === 'rejected' || options?.status === 'rejected') {
      const err = result?.reason || options?.reason;
      if (Number(err?.status) === 401 || Number(err?.status) === 403) return hideUnavailable('phase3StaffPull');
      return setCard('phase3StaffPull', { title:'Staff Pull', status:'Unavailable', detail:String(err?.message || err || 'Could not load Staff Pull context.') });
    }
    const st = result.value?.state || {};
    const who = options.value?.who || {};
    const held = isStaffHoldToday(st);
    const heldBy = held ? String(st.held_by_email || st.held_by_title || st.held_by_role || '').trim() : '';
    const since = held && st.held_by_since ? fmtClock(st.held_by_since) : '';
    const me = String(who.email || state.access?.email || '').trim().toLowerCase();
    const owner = String(st.held_by_email || '').trim().toLowerCase();
    const canRelease = held && (actorIsAdmin(who) || actorIsAdmin(state.access) || (me && owner && me === owner));
    let buttons = '';
    if (!isReadOnly() && !held) buttons += button('Pull Student', 'staff-pull', true);
    if (!isReadOnly() && canRelease) buttons += button('Release Student', 'staff-release', true);
    buttons += button('Open Staff Pull', 'staff-open');
    setCard('phase3StaffPull', {
      title:'Staff Pull',
      status: held ? 'Student is with staff' : 'Not currently pulled',
      detail: held ? [heldBy ? `With ${heldBy}` : '', since ? `since ${since}` : ''].filter(Boolean).join(' • ') : 'No active Staff Pull ownership for today.',
      tone: held ? 'emphasis' : '',
      buttons
    });
  }

  function reflectionRows(data){
    const rows = [];
    for (const list of [data?.my_active_holds, data?.active_holds]) {
      for (const row of Array.isArray(list) ? list : []) {
        if (!rows.some((x) => String(x?.osis) === String(row?.osis))) rows.push(row);
      }
    }
    return rows;
  }

  function renderReflection(result){
    const canReflection = !!(state.access?.can?.reflection_hold || state.access?.can?.admin);
    if (!canReflection) return hideUnavailable('phase3Reflection');
    if (result?.status === 'rejected') {
      const err = result.reason;
      if (Number(err?.status) === 401 || Number(err?.status) === 403) return hideUnavailable('phase3Reflection');
      return setCard('phase3Reflection', { title:'Reflection Hold', status:'Unavailable', detail:String(err?.message || err || 'Could not load Reflection Hold context.') });
    }
    const data = result.value;
    const optionRow = reflectionRows(data).find((x) => String(x?.osis || '').trim() === state.osis) || null;
    const loc = state.dashboard?.location || {};
    const holdDate = String(loc.after_school_reflection_hold_date || '').trim();
    const modernActive = loc.after_school_reflection_hold_active === true && (!holdDate || holdDate === nyDate());
    const legacyActive = isStaffHoldToday(loc) && (
      String(loc.held_by_role || '').toLowerCase() === 'reflection_hold' ||
      String(loc.held_target_loc || '').toLowerCase() === 'reflection_hold' ||
      String(loc.source || '').toLowerCase().includes('reflection_hold')
    );
    const dashboardRow = modernActive || legacyActive ? {
      osis:state.osis,
      label:String(loc.after_school_reflection_hold_label || loc.reflection_hold_label || loc.held_target_label || loc.held_by_title || 'Reflection Hold'),
      room:String(loc.after_school_reflection_hold_room || loc.reflection_hold_room || ''),
      reason:String(loc.after_school_reflection_hold_reason || loc.reflection_hold_reason || ''),
      held_by_since:loc.after_school_reflection_hold_set_at || loc.reflection_hold_set_at || loc.held_by_since || '',
      owner_email:String(loc.after_school_reflection_owner_email || loc.reflection_hold_owner_email || loc.reflection_hold_set_by_email || loc.held_by_email || '')
    } : null;
    const row = optionRow || dashboardRow;
    const mine = (Array.isArray(data?.my_active_holds) ? data.my_active_holds : []).some((x) => String(x?.osis || '').trim() === state.osis);
    const status = row ? 'Reflection Hold active' : 'No active Reflection Hold';
    const detail = row
      ? [row.label || row.hold_label || 'Reflection Hold', row.room ? `Room ${row.room}` : '', row.held_by_since ? `since ${fmtClock(row.held_by_since)}` : '', row.reason || '', row.owner_email && !mine ? `Owner: ${row.owner_email}` : ''].filter(Boolean).join(' • ')
      : 'Use the Reflection Hold workflow to preview eligibility, choose a room, and confirm a new hold.';
    let buttons = '';
    if (!isReadOnly() && row && mine) buttons += button('Release Reflection Hold', 'reflection-release', true);
    buttons += button(row ? 'Open Reflection Hold' : 'Start Reflection Hold', 'reflection-open', !row && !isReadOnly(), isReadOnly());
    setCard('phase3Reflection', { title:'Reflection Hold', status, detail, tone:row ? 'emphasis' : '', buttons });
  }

  function renderEarlyDismissal(result){
    if (result?.status === 'rejected') {
      const err = result.reason;
      if (Number(err?.status) === 401 || Number(err?.status) === 403) return hideUnavailable('phase3EarlyDismissal');
      return setCard('phase3EarlyDismissal', { title:'Early Dismissal', status:'Unavailable', detail:String(err?.message || err || 'Could not load Early Dismissal context.') });
    }
    const data = result.value;
    const rows = (Array.isArray(data?.rows) ? data.rows : [])
      .filter((row) => String(row?.osis || '').trim() === state.osis)
      .sort((a,b) => String(b?.dismissal_when_iso || b?.created_at || '').localeCompare(String(a?.dismissal_when_iso || a?.created_at || '')));
    const row = rows[0] || null;
    const rawStatus = String(row?.status || '').trim().toLowerCase();
    const label = !row ? 'No early dismissal today'
      : rawStatus === 'active' ? 'Early dismissal active'
      : rawStatus === 'changed' ? 'Early dismissal changed'
      : rawStatus === 'undone' ? 'Early dismissal undone'
      : `Early dismissal: ${rawStatus || 'recorded'}`;
    const detail = row
      ? [row.dismissal_when_iso ? fmtClock(row.dismissal_when_iso) : '', row.reason || '', row.current_label ? `Current: ${row.current_label}` : ''].filter(Boolean).join(' • ')
      : 'No dismissal record was found for the selected student today.';
    let buttons = '';
    if (!isReadOnly() && row?.can_undo && row?.token && data?.can_undo) buttons += button('Undo Early Dismissal', 'early-undo', true);
    buttons += button('Open Early Dismissal', 'early-open');
    setCard('phase3EarlyDismissal', { title:'Early Dismissal', status:label, detail, tone:rawStatus === 'active' ? 'emphasis' : '', buttons });
    const el = $('phase3EarlyDismissal');
    if (el) el.dataset.undoToken = String(row?.token || '');
  }

  async function mutate(action, message, request, after){
    if (isReadOnly()) return;
    if (!window.confirm(message)) return;
    const statusEl = $('phase3ContextStatus');
    if (statusEl) statusEl.textContent = 'Saving action…';
    try {
      await request();
      if (statusEl) statusEl.textContent = 'Action saved. Refreshing workflow context…';
      if (typeof after === 'function') await after();
      await loadCurrentStudent(true);
    } catch (err) {
      if (statusEl) statusEl.textContent = `${action} failed: ${err?.message || err}`;
    }
  }

  function wireActionClicks(){
    $('studentLookupPhase3')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-p3-action]');
      if (!btn || btn.disabled || !state.osis) return;
      const action = String(btn.dataset.p3Action || '');
      const ctx = dashboardContext();
      if (action === 'phone-open') return openUrl('./phone_pass.html', { osis:state.osis, source:'student_lookup' });
      if (action === 'staff-open') return openUrl('./staff_pull.html', { osis:state.osis, source:'student_lookup' });
      if (action === 'reflection-open') return openUrl('./reflection_hold.html', { osis:state.osis, source:'student_lookup' });
      if (action === 'early-open') return openUrl('./early_dismissal.html', { osis:state.osis, source:'student_lookup' });
      if (action === 'incident-open') return openUrl('./incident_creator.html', {
        osis:state.osis,
        source:'student_lookup',
        room:ctx.room,
        periodLocal:ctx.periodLocal,
        date:ctx.date
      });
      if (action === 'phone-grant') return void mutate(
        'Phone grant',
        `Grant phone access to ${studentName()}?`,
        () => jsonRequest('/admin/phone_pass/grant', {
          method:'POST', headers:{'content-type':'application/json'},
          body:JSON.stringify({ osis:state.osis, note:'', source:'student_lookup' })
        })
      );
      if (action === 'phone-return') return void mutate(
        'Phone return',
        `Confirm that ${studentName()} returned the phone?`,
        () => jsonRequest('/admin/phone_pass/return', {
          method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ osis:state.osis })
        })
      );
      if (action === 'staff-pull') return void mutate(
        'Staff Pull',
        `Pull ${studentName()} to you now?`,
        () => jsonRequest('/admin/staff_pull/pull', {
          method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ osis:state.osis })
        })
      );
      if (action === 'staff-release') return void mutate(
        'Staff Pull release',
        `Release ${studentName()} from your Staff Pull?`,
        () => jsonRequest('/admin/staff_pull/release', {
          method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ osis:state.osis })
        })
      );
      if (action === 'reflection-release') return void mutate(
        'Reflection Hold release',
        `Release ${studentName()} from your Reflection Hold?`,
        () => jsonRequest('/admin/reflection_hold/release', {
          method:'POST', headers:{'content-type':'application/json'},
          body:JSON.stringify({ date:nyDate(), osisList:[state.osis], mine:true, mode:'release' })
        })
      );
      if (action === 'early-undo') {
        const token = String($('phase3EarlyDismissal')?.dataset?.undoToken || '');
        if (!token) return;
        return void mutate(
          'Early Dismissal undo',
          `ARE YOU SURE YOU WANT TO UNDO THE EARLY DISMISSAL OF ${studentName()}?`,
          () => jsonRequest('/admin/early_dismissals/undo', {
            method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ token })
          })
        );
      }
    });
  }

  async function loadAccess(){
    if (state.access) return state.access;
    try { state.access = await jsonRequest('/admin/access', { method:'GET' }); }
    catch { state.access = null; }
    return state.access;
  }

  async function loadCurrentStudent(force = false){
    const shell = buildShell();
    if (!shell) return;
    const osis = selectedOsis();
    const studentCard = $('studentCard');
    if (!osis || studentCard?.hidden) {
      state.osis = '';
      shell.hidden = true;
      return;
    }
    if (!force && osis === state.osis && shell.dataset.loaded === '1') return;

    const seq = ++state.seq;
    state.osis = osis;
    shell.hidden = false;
    shell.dataset.loaded = '0';
    const statusEl = $('phase3ContextStatus');
    if (statusEl) statusEl.textContent = 'Checking Phone Pass, Staff Pull, Reflection Hold, Early Dismissal, and incident context…';
    loadingCards();

    await loadAccess();
    if (seq !== state.seq) return;

    const requests = await Promise.allSettled([
      jsonRequest(`/admin/student/dashboard?osis=${encodeURIComponent(osis)}`, { method:'GET' }),
      jsonRequest('/admin/phone_pass/options', { method:'GET' }),
      jsonRequest(`/admin/phone_pass/context?osis=${encodeURIComponent(osis)}`, { method:'GET' }),
      jsonRequest('/admin/staff_pull/options', { method:'GET' }),
      jsonRequest(`/admin/staff_pull/context?osis=${encodeURIComponent(osis)}`, { method:'GET' }),
      jsonRequest('/admin/reflection_hold/options', { method:'GET' }),
      jsonRequest('/admin/early_dismissals', { method:'GET' })
    ]);
    if (seq !== state.seq) return;

    const [dashboardResult, phoneOptions, phoneContext, staffOptions, staffContext, reflection, early] = requests;
    state.dashboard = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null;
    renderIncident();
    renderPhone(phoneContext, phoneOptions);
    renderStaffPull(staffContext, staffOptions);
    renderReflection(reflection);
    renderEarlyDismissal(early);

    const visible = [...shell.querySelectorAll('.phase3ActionCard')].filter((el) => !el.hidden).length;
    if (statusEl) statusEl.textContent = visible
      ? `${visible} workflow${visible === 1 ? '' : 's'} available for this student${isReadOnly() ? ' • View As is read-only' : ''}.`
      : 'No Phase 3 workflow actions are available with your current permissions.';
    shell.dataset.loaded = '1';
  }

  function scheduleRefresh(force = false){
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => loadCurrentStudent(force), 120);
  }

  function init(){
    injectStyles();
    const shell = buildShell();
    if (!shell) return;
    wireActionClicks();

    const studentCard = $('studentCard');
    const studentMeta = $('studentMeta');
    const observer = new MutationObserver(() => scheduleRefresh(false));
    if (studentCard) observer.observe(studentCard, { attributes:true, attributeFilter:['hidden'] });
    if (studentMeta) observer.observe(studentMeta, { childList:true, characterData:true, subtree:true });
    $('refreshStudentBtn')?.addEventListener('click', () => scheduleRefresh(true));
    window.addEventListener('popstate', () => scheduleRefresh(true));
    scheduleRefresh(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();

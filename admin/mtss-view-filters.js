/* EagleNEST MTSS per-employee view filters v2.
   View-only: saves selected domains/tiers and non-identifying refinements per staff account.
   Student search text and case/alert identifiers are never persisted. */
(() => {
  'use strict';
  const DOMAINS = ['attendance', 'academic', 'behavior'];
  const TIERS = [1, 2, 3];
  const LABELS = {attendance: 'Attendance', academic: 'Academic', behavior: 'Behavior / SEL'};
  const STORE_PREFIX = 'eaglenest:mtss:view:v2:';
  const $ = id => document.getElementById(id);
  const allSelected = () => Object.fromEntries(DOMAINS.map(d => [d, [1, 2, 3]]));

  function normalize(raw) {
    const result = allSelected();
    if (!raw || typeof raw !== 'object') return result;
    for (const domain of DOMAINS) {
      if (Array.isArray(raw[domain])) {
        result[domain] = TIERS.filter(n => raw[domain].includes(n));
      }
    }
    return result;
  }
  const STATUSES = new Set(['', 'open', 'monitoring', 'improving', 'escalated']);
  const GRADES = new Set(['', '6', '7', '8', '9', '10', '11', '12']);
  function normalizeView(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const status = String(src.case_status ?? '');
    const grade = String(src.case_grade ?? '');
    const academicGrade = String(src.academic_grade ?? '');
    return {
      selection: normalize(src.selection || src),
      case_status: STATUSES.has(status) ? status : '',
      case_grade: GRADES.has(grade) ? grade : '',
      include_closed: src.include_closed === true,
      academic_grade: GRADES.has(academicGrade) ? academicGrade : ''
    };
  }
  const storageKey = email => STORE_PREFIX + email;
  function loadLocal(email) {
    try {
      const raw = localStorage.getItem(storageKey(email));
      return raw ? normalizeView(JSON.parse(raw)) : null;
    } catch { return null; }
  }
  function saveLocal(email, view) {
    if (!email) return;
    try { localStorage.setItem(storageKey(email), JSON.stringify(normalizeView(view))); } catch { /* optional */ }
  }
  function currentAccess() { return window.EagleNESTMTSS?.getAccess?.() || null; }
  function accountEmail() {
    const a = currentAccess();
    if (!a?.ok) return '';
    return String(a.actor_email || a.email || '').trim().toLowerCase();
  }
  function isViewAs() {
    const a = currentAccess();
    return a?.view_as?.active === true || a?.view_as?.read_only === true;
  }
  function captureView() {
    return normalizeView({selection:selected, case_status:$('filterStatus')?.value,
      case_grade:$('filterGrade')?.value, include_closed:$('filterClosed')?.checked,
      academic_grade:$('academicGrade')?.value});
  }
  function restoreControls(view) {
    for (const [id,value] of [['filterStatus',view.case_status],['filterGrade',view.case_grade],
                              ['academicGrade',view.academic_grade]]) {
      const el = $(id);
      if (el && [...el.options].some(o => o.value === value)) el.value = value;
    }
    if ($('filterClosed')) $('filterClosed').checked = view.include_closed;
  }
  function selectionForCategory(prev, domain) {
    if (!DOMAINS.includes(domain)) return normalize(prev);
    const next = normalize(prev);
    next[domain] = next[domain].length === 3 ? [] : TIERS.slice();
    return next;
  }
  function selectionForTier(prev, domain, tierRaw) {
    const tier = Number(tierRaw);
    if (!DOMAINS.includes(domain) || !TIERS.includes(tier)) return normalize(prev);
    const next = normalize(prev);
    const current = next[domain];
    // The first specific tier click changes an all-tiers view to JUST that tier.
    // Further clicks add/remove individual tiers. All three restores category ON.
    next[domain] = current.length === 3 ? [tier]
      : current.includes(tier) ? current.filter(t => t !== tier)
      : TIERS.filter(t => current.includes(t) || t === tier);
    return next;
  }

  let selected = allSelected();
  let ready = false;
  let scheduled = false;
  let employee = '';
  let generation = 0;
  let interaction = 0;
  let saveTimer = null;
  let saveChain = Promise.resolve();
  let hydrationComplete = false;
  function allowed(domain, tier) { return (selected[domain] || []).includes(Number(tier)); }
  function saveStatus(message, status) {
    const el = $('mtssPersonalViewStatus');
    if (el) { el.textContent = message; el.dataset.status = status || ''; }
  }
  function scheduleRemoteSave() {
    if (!employee) {
      saveStatus('Sign in to save this view for your employee account.', 'local');
      return;
    }
    if (isViewAs()) {
      saveStatus('View as is read-only — changes here will not overwrite saved preferences.', 'local');
      return;
    }
    saveLocal(employee, captureView());
    clearTimeout(saveTimer);
    saveStatus('Saving your view…', 'saving');
    const requestEmployee = employee;
    const requestGeneration = generation;
    saveTimer = setTimeout(() => {
      const view = captureView();
      saveChain = saveChain.catch(() => {}).then(async () => {
        if (requestEmployee !== employee || requestGeneration !== generation) return;
        try {
          await window.EagleNESTMTSS.api('/admin/mtss/view_preferences', {
            method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(view)
          });
          if (requestGeneration === generation &&
              JSON.stringify(view) === JSON.stringify(captureView())) {
            saveStatus('Saved to your employee account · available on other devices', 'saved');
          }
        } catch (error) {
          if (requestGeneration === generation) {
            saveStatus('Saved in this browser only · deploy the Worker update to enable account sync', 'local');
          }
        }
      });
    }, 450);
  }
  function setSelection(next) {
    selected = normalize(next);
    interaction++;
    apply();
    scheduleRemoteSave();
    document.dispatchEvent(new CustomEvent('eaglenest:mtss:view-filter-changed', {
      detail: {selection: normalize(selected)}
    }));
  }
  async function ensureEmployee() {
    const next = accountEmail();
    if (!next || (employee === next && hydrationComplete)) return;
    if (employee === next && !hydrationComplete) return;
    clearTimeout(saveTimer);
    employee = next;
    const myGeneration = ++generation;
    hydrationComplete = false;
    const local = loadLocal(next);
    const priorControls = captureView();
    selected = local ? local.selection : allSelected();
    if (local) restoreControls(local);
    apply();
    if (local && (priorControls.case_status !== local.case_status ||
      priorControls.case_grade !== local.case_grade || priorControls.include_closed !== local.include_closed)) {
      // The dashboard just rendered using its default selectors; refresh for restored employee choices.
      window.EagleNESTMTSS.loadDashboard();
    }
    if (local && priorControls.academic_grade !== local.academic_grade) {
      window.EagleNESTMTSSAcademic?.loadQueue();
    }
    saveStatus('Loading your employee view…', 'loading');
    const interactionAtStart = interaction;
    try {
      const result = await window.EagleNESTMTSS.api('/admin/mtss/view_preferences');
      if (generation !== myGeneration || employee !== next) return;
      if (interaction !== interactionAtStart) {
        hydrationComplete = true;
        scheduleRemoteSave();
        return;
      }
      if (result.has_saved && result.view) {
        const view = normalizeView(result.view);
        selected = view.selection;
        restoreControls(view);
        saveLocal(next, view);
        apply();
        saveStatus('Your saved employee view is loaded · changes save automatically', 'saved');
        if (local?.case_status !== view.case_status || local?.case_grade !== view.case_grade ||
            local?.include_closed !== view.include_closed) window.EagleNESTMTSS.loadDashboard();
        if (local?.academic_grade !== view.academic_grade) window.EagleNESTMTSSAcademic?.loadQueue();
      } else if (local) {
        saveStatus('Restored your browser view · syncing to your employee account…', 'saving');
        scheduleRemoteSave();
      } else {
        saveStatus('Changes save automatically to your employee account', 'saved');
      }
    } catch (error) {
      if (generation === myGeneration) {
        saveStatus('Your view is saved in this browser · account sync requires the Worker update', 'local');
      }
    } finally {
      if (generation === myGeneration) hydrationComplete = true;
    }
  }
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; apply(); });
  }
  function countText(domain) {
    const count = selected[domain].length;
    return count === 3 ? 'ALL ON' : count === 0 ? 'OFF' : `${count} OF 3`;
  }
  function description(domain) {
    const tiers = selected[domain];
    return tiers.length === 3 ? 'all tiers shown' : tiers.length === 0
      ? 'hidden' : tiers.map(n => `Tier ${n}`).join(' and ') + ' shown';
  }

  function renderCards() {
    const grid = document.querySelector('.domainGrid');
    if (!grid) return;
    for (const domain of DOMAINS) {
      const card = grid.querySelector(`[data-domain="${domain}"]`);
      if (!card) continue;
      const count = selected[domain].length;
      card.dataset.mtssView = count === 3 ? 'all' : count === 0 ? 'off' : 'partial';
      const header = card.querySelector('.domainTop');
      if (header) {
        header.setAttribute('aria-pressed', count === 3 ? 'true' : count === 0 ? 'false' : 'mixed');
        header.setAttribute('aria-label', `${LABELS[domain]} category: ${description(domain)}. Select to ${count === 3 ? 'hide all tiers' : 'show all tiers'}.`);
        const indicator = header.querySelector('.mtssCategoryState');
        if (indicator) indicator.textContent = countText(domain);
      }
      card.querySelectorAll('.tierStrip > div').forEach((tile, index) => {
        const tier = index + 1;
        const on = allowed(domain, tier);
        tile.dataset.mtssTier = String(tier);
        tile.setAttribute('aria-pressed', on ? 'true' : 'false');
        tile.setAttribute('aria-label', `${LABELS[domain]} Tier ${tier}: ${on ? 'shown' : 'hidden'}. Select to filter.`);
        tile.classList.toggle('mtssTierOn', on);
      });
    }
    const summary = $('mtssViewFilterStatus');
    if (summary) {
      const total = DOMAINS.reduce((n, d) => n + selected[d].length, 0);
      summary.textContent = total === 9 ? 'Showing all categories and tiers'
        : total === 0 ? 'All categories hidden — choose a category or tier to show data'
        : DOMAINS.map(d => `${LABELS[d]}: ${selected[d].length === 0 ? 'off' : selected[d].length === 3 ? 'all' : selected[d].join(', ')}`).join(' · ');
    }
  }

  function filterCases() {
    const body = $('casesBody');
    if (!body) return;
    const existingEmpty = body.querySelector('[data-mtss-filter-empty]');
    const rows = Array.from(body.querySelectorAll('tr[data-case-id]'));
    let visible = 0;
    for (const row of rows) {
      const domainText = (row.cells?.[1]?.textContent || '').trim().toLowerCase();
      const domain = domainText.includes('academic') ? 'academic'
        : domainText.includes('behavior') ? 'behavior'
        : domainText.includes('attendance') ? 'attendance' : '';
      const tierMatch = (row.cells?.[2]?.textContent || '').match(/\bTier\s*([123])\b/i);
      // Never show unrecognized rows under a potentially misleading tier.
      const show = !!tierMatch && allowed(domain, Number(tierMatch[1]));
      row.hidden = !show;
      if (show) visible++;
    }
    const count = $('caseCount');
    if (count) count.textContent = visible === rows.length
      ? `${visible} case${visible === 1 ? '' : 's'}`
      : `${visible} of ${rows.length} cases shown`;
    if (rows.length && !visible && !existingEmpty) {
      const empty = document.createElement('tr');
      empty.dataset.mtssFilterEmpty = '1';
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.className = 'empty';
      cell.textContent = 'No cases in the selected categories and tiers. Choose additional tiers above.';
      empty.appendChild(cell);
      body.appendChild(empty);
    } else if ((!rows.length || visible > 0) && existingEmpty) {
      existingEmpty.remove();
    }
  }

  function filterRules() {
    const body = $('rulesBody');
    if (!body) return;
    for (const row of body.querySelectorAll('tr[data-rule-id]')) {
      const tier = (row.cells?.[2]?.textContent || '').match(/\bTier\s*([123])\b/i)?.[1];
      row.hidden = !tier || !allowed('attendance', tier);
    }
  }

  function warningDisplayTier(status) {
    // Untiered warnings have no assigned case; Tier 1 here is a display bucket only.
    const actualTier = String(status || '').match(/\bTier\s*([123])\b/i)?.[1];
    return actualTier ? Number(actualTier) : 1;
  }
  function filterAcademicWarnings() {
    const body = $('academicWarningsBody');
    if (!body) return;
    const existingEmpty = body.querySelector('[data-mtss-academic-empty]');
    const rows = Array.from(body.querySelectorAll('tr')).filter(r => r.cells?.length === 6 && !r.dataset.mtssAcademicEmpty);
    let visible = 0;
    for (const row of rows) {
      const status = row.cells[4]?.textContent || '';
      const show = allowed('academic', warningDisplayTier(status));
      row.hidden = !show;
      if (show) visible++;
    }
    if (rows.length && !visible && !existingEmpty) {
      const empty = document.createElement('tr');
      empty.dataset.mtssAcademicEmpty = '1';
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'empty';
      cell.textContent = 'No academic warnings in the selected tiers. Choose additional tiers above.';
      empty.appendChild(cell);
      body.appendChild(empty);
    } else if ((!rows.length || visible > 0) && existingEmpty) {
      existingEmpty.remove();
    }
    const note = $('mtssAcademicTierNote');
    if (note) {
      note.textContent = `${visible} of ${rows.length} academic early warnings shown. Untiered/pre-case warnings are displayed with Tier 1 for filtering only; no case or tier is assigned.`;
      note.hidden = selected.academic.length === 0;
    }
    // Keep the existing total intact while distinguishing the filtered visible count.
    const badge = $('academicWarningCount');
    if (badge && rows.length) {
      const base = badge.textContent.replace(/ · \d+ shown$/, '');
      badge.textContent = `${base} · ${visible} shown`;
    }
  }

  function apply() {
    if (!ready) return;
    renderCards();
    filterCases();
    filterRules();
    filterAcademicWarnings();
    const anyAttendance = selected.attendance.length > 0;
    const anyAcademic = selected.academic.length > 0;
    // Do not overwrite the existing permissions/availability [hidden] attribute.
    // These extra classes provide a separate *view-only* visibility layer.
    $('attendanceTools')?.classList.toggle('mtssViewHidden', !anyAttendance);
    $('rulesCard')?.classList.toggle('mtssViewHidden', !anyAttendance);
    $('academicEarlyWarning')?.classList.toggle('mtssViewHidden', !anyAcademic);
  }

  function init() {
    if (ready) return;
    const grid = document.querySelector('.domainGrid');
    if (!grid || !$('casesBody') || !$('filterDomain') || !$('filterTier')) return;
    ready = true;
    grid.setAttribute('aria-label', 'Filter MTSS categories and tiers');
    grid.querySelectorAll('.domainCard').forEach(card => {
      const domain = card.dataset.domain;
      if (!DOMAINS.includes(domain)) return;
      const top = card.querySelector('.domainTop');
      if (top) {
        top.classList.add('mtssDomainToggle');
        top.setAttribute('role', 'button');
        top.setAttribute('tabindex', '0');
        const indicator = document.createElement('span');
        indicator.className = 'mtssCategoryState';
        indicator.setAttribute('aria-hidden', 'true');
        top.appendChild(indicator);
      }
      card.querySelectorAll('.tierStrip > div').forEach((tile, index) => {
        tile.classList.add('mtssTierToggle');
        tile.setAttribute('role', 'button');
        tile.setAttribute('tabindex', '0');
        tile.dataset.mtssTier = String(index + 1);
      });
    });
    const toolbar = document.createElement('div');
    toolbar.id = 'mtssViewFilterToolbar';
    toolbar.className = 'mtssViewFilterToolbar';
    toolbar.innerHTML = '<div class="mtssViewFilterExplanation"><strong>Display filters</strong><span>Click a category to show/hide all three tiers. Click a tier to focus on it; select additional tiers to combine them.</span><span class="mtssViewFilterClarification">Academic early-warning queue is also filtered: untiered warnings appear with Tier 1/pre-case; assigned cases follow their actual tier. Schoolwide totals remain unchanged.</span><div id="mtssViewFilterStatus" role="status" aria-live="polite"></div><div id="mtssPersonalViewStatus" class="mtssPersonalViewStatus" role="status" aria-live="polite">Your view will save automatically after sign-in.</div></div><div class="mtssViewFilterActions"><button type="button" class="btn" id="mtssShowAll">Show all</button><button type="button" class="btn" id="mtssHideAll">Hide all</button></div>';
    grid.insertAdjacentElement('afterend', toolbar);
    $('mtssShowAll').addEventListener('click', () => setSelection(allSelected()));
    $('mtssHideAll').addEventListener('click', () => setSelection(Object.fromEntries(DOMAINS.map(d => [d, []]))));

    const onActivate = target => {
      const tile = target.closest('.mtssTierToggle');
      const card = target.closest('.domainCard');
      const domain = card?.dataset.domain;
      if (!DOMAINS.includes(domain)) return;
      if (tile) setSelection(selectionForTier(selected, domain, tile.dataset.mtssTier));
      else if (target.closest('.mtssDomainToggle')) setSelection(selectionForCategory(selected, domain));
    };
    grid.addEventListener('click', e => onActivate(e.target));
    grid.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      // Keyboard activation is specifically on the focusable toggle element.
      if (!e.target.matches('.mtssTierToggle, .mtssDomainToggle')) return;
      e.preventDefault();
      onActivate(e.target);
    });

    // The original case-domain and tier dropdowns duplicate these category tiles.
    // Keep their IDs for the existing JS and clear their values, but hide them.
    for (const id of ['filterDomain', 'filterTier']) {
      const select = $(id);
      select.value = '';
      const label = select.closest('label');
      if (label) { label.hidden = true; label.style.display = 'none'; }
    }
    $('filterQ')?.closest('.filters')?.classList.add('mtssCaseRefinements');

    const warningBody = $('academicWarningsBody');
    if (warningBody) {
      const note = document.createElement('div');
      note.id = 'mtssAcademicTierNote';
      note.className = 'mtssAcademicTierNote';
      warningBody.closest('.tableWrap')?.before(note);
    }
    document.addEventListener('eaglenest:mtss:dashboard-loaded', () => { scheduleApply(); ensureEmployee(); });
    // Async rule and academic-warning rendering occurs after the dashboard event.
    for (const id of ['rulesBody', 'academicWarningsBody', 'casesBody']) {
      const body = $(id);
      if (body) new MutationObserver(scheduleApply).observe(body, {childList:true});
    }
    for (const id of ['filterStatus','filterGrade','filterClosed','academicGrade']) {
      $(id)?.addEventListener('change', () => { interaction++; scheduleRemoteSave(); });
    }
    apply();
    ensureEmployee();
  }

  window.EagleNESTMTSSViewFilters = Object.freeze({
    getSelection: () => normalize(selected),
    showAll: () => setSelection(allSelected()),
    hideAll: () => setSelection(Object.fromEntries(DOMAINS.map(d => [d, []]))),
    // Expose deterministic state transitions for static tests.
    model: Object.freeze({normalize, normalizeView, warningDisplayTier, selectionForCategory, selectionForTier}),
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();

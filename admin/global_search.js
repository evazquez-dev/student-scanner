/* EAGLENEST_GLOBAL_SEARCH_V1
 * Shared command palette for EagleNEST admin pages.
 * Uses the existing authenticated roster search and Super Admin View As APIs.
 */
(() => {
  'use strict';

  const state = {
    mounted: false,
    context: null,
    open: false,
    seq: 0,
    debounce: null,
    activeIndex: -1,
    staff: null,
    staffPromise: null,
    restoreFocus: null,
    els: {}
  };

  const text = (value) => String(value == null ? '' : value).trim();
  const lower = (value) => text(value).toLowerCase();

  function actorIsSuperAdmin() {
    const access = state.context?.access || {};
    return lower(access.actor_role || access.role) === 'super_admin';
  }

  function viewAsActive() {
    return state.context?.access?.view_as?.active === true;
  }

  function shortcutLabel() {
    const platform = String(navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
    return platform.includes('mac') ? '⌘ K' : 'Ctrl K';
  }

  function pageScore(page, query) {
    const q = lower(query);
    if (!q) return 0;
    const label = lower(page?.label);
    const key = lower(page?.key).replaceAll('_', ' ');
    const section = lower(page?.section);
    const description = lower(page?.description);
    let score = 0;
    if (label === q) score += 150;
    if (key === q) score += 140;
    if (label.startsWith(q)) score += 100;
    if (key.startsWith(q)) score += 90;
    if (section.startsWith(q)) score += 45;
    if (label.includes(q)) score += 60;
    if (key.includes(q)) score += 55;
    if (description.includes(q)) score += 25;
    if (section.includes(q)) score += 20;
    return score;
  }

  function staffScore(row, query) {
    const q = lower(query);
    if (!q) return 0;
    const name = lower(row?.name);
    const email = lower(row?.email);
    const department = lower(row?.department || (row?.departments || []).join(' '));
    const gradeTeam = lower(row?.grade_team || (row?.grade_teams || []).join(' '));
    let score = 0;
    if (email === q) score += 160;
    if (name === q) score += 150;
    if (name.startsWith(q)) score += 110;
    if (email.startsWith(q)) score += 105;
    if (name.includes(q)) score += 70;
    if (email.includes(q)) score += 65;
    if (department.includes(q)) score += 30;
    if (gradeTeam.includes(q)) score += 25;
    return score;
  }

  function createResult({ icon, title, meta, detail, onSelect, className = '' }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ssGlobalSearchResult${className ? ` ${className}` : ''}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');

    const iconEl = document.createElement('span');
    iconEl.className = 'ssGlobalSearchIcon';
    iconEl.textContent = icon;

    const copy = document.createElement('span');
    copy.className = 'ssGlobalSearchCopy';
    const titleEl = document.createElement('strong');
    titleEl.textContent = title;
    copy.appendChild(titleEl);

    if (detail) {
      const detailEl = document.createElement('span');
      detailEl.className = 'ssGlobalSearchDetail';
      detailEl.textContent = detail;
      copy.appendChild(detailEl);
    }

    const metaEl = document.createElement('span');
    metaEl.className = 'ssGlobalSearchMeta';
    metaEl.textContent = meta || '';

    button.append(iconEl, copy, metaEl);
    button.addEventListener('click', () => onSelect?.(button));
    button.addEventListener('mouseenter', () => {
      const buttons = selectableResults();
      const idx = buttons.indexOf(button);
      if (idx >= 0) setActiveIndex(idx, false);
    });
    return button;
  }

  function appendGroup(title, rows) {
    if (!rows.length) return;
    const group = document.createElement('section');
    group.className = 'ssGlobalSearchGroup';
    const heading = document.createElement('div');
    heading.className = 'ssGlobalSearchGroupTitle';
    heading.textContent = title;
    group.appendChild(heading);
    for (const row of rows) group.appendChild(row);
    state.els.results.appendChild(group);
  }

  function selectableResults() {
    return Array.from(state.els.results?.querySelectorAll('.ssGlobalSearchResult:not(:disabled)') || []);
  }

  function setActiveIndex(index, scroll = true) {
    const buttons = selectableResults();
    if (!buttons.length) {
      state.activeIndex = -1;
      return;
    }
    const normalized = ((Number(index) % buttons.length) + buttons.length) % buttons.length;
    state.activeIndex = normalized;
    buttons.forEach((button, i) => {
      const active = i === normalized;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (scroll) buttons[normalized]?.scrollIntoView?.({ block:'nearest' });
  }

  function activateCurrent() {
    const buttons = selectableResults();
    if (!buttons.length) return;
    const idx = state.activeIndex >= 0 ? state.activeIndex : 0;
    buttons[idx]?.click();
  }

  function updateEmptyMessage(query, loading, resultCount) {
    const q = text(query);
    state.els.empty.hidden = resultCount > 0;
    if (resultCount > 0) return;
    if (loading) {
      state.els.empty.textContent = 'Searching…';
      return;
    }
    if (!q) {
      state.els.empty.textContent = actorIsSuperAdmin()
        ? 'Type to search EagleNEST pages, students, or staff to View As.'
        : 'Type to search EagleNEST pages or students.';
      return;
    }
    if (q.length < 2) {
      state.els.empty.textContent = 'Keep typing to search students' + (actorIsSuperAdmin() ? ' and staff.' : '.');
      return;
    }
    state.els.empty.textContent = `No results for “${q}”.`;
  }

  function renderResults({ query, pages = [], students = [], staff = [], loading = false, studentError = '', staffError = '' }) {
    const q = text(query);
    const results = state.els.results;
    results.replaceChildren();

    const viewRows = [];
    if (viewAsActive() && (!q || /(^|\s)(exit|return|super|admin|view)(\s|$)/i.test(q))) {
      viewRows.push(createResult({
        icon: '↩',
        title: 'Return to Super Admin',
        detail: 'Exit the current read-only View As session',
        meta: 'VIEW AS',
        className: 'ssGlobalSearchResultDanger',
        onSelect: stopViewAs
      }));
    }

    for (const row of staff) {
      const currentTarget = lower(state.context?.access?.view_as?.target?.email);
      if (currentTarget && lower(row?.email) === currentTarget) continue;
      const scope = [text(row?.department), text(row?.grade_team)].filter(Boolean).join(' · ');
      viewRows.push(createResult({
        icon: '👁',
        title: text(row?.name || row?.email) || 'Staff member',
        detail: [text(row?.email), scope].filter(Boolean).join(' · '),
        meta: 'VIEW AS',
        onSelect: (button) => startViewAs(row, button)
      }));
    }
    appendGroup('View As', viewRows);

    const pageRows = pages.map((page) => createResult({
      icon: '⌘',
      title: text(page?.label) || 'Page',
      detail: text(page?.description),
      meta: text(page?.section || 'PAGE').toUpperCase(),
      onSelect: () => { location.href = text(page?.href) || './index.html'; }
    }));
    appendGroup('Pages', pageRows);

    const studentRows = students.map((student) => createResult({
      icon: '👤',
      title: text(student?.name) || `OSIS ${text(student?.osis)}`,
      detail: [text(student?.email), text(student?.osis) ? `OSIS ${text(student.osis)}` : ''].filter(Boolean).join(' · '),
      meta: 'STUDENT',
      onSelect: () => openStudent(student)
    }));
    appendGroup('Students', studentRows);

    const count = viewRows.length + pageRows.length + studentRows.length;
    updateEmptyMessage(q, loading, count);

    const notes = [];
    if (loading) notes.push('Searching…');
    else if (count) notes.push(`${count} result${count === 1 ? '' : 's'}`);
    if (q.length === 1) notes.push('type 2+ characters for people');
    if (studentError) notes.push('student search unavailable');
    if (staffError) notes.push('staff search unavailable');
    state.els.status.textContent = notes.join(' · ');

    setActiveIndex(count ? 0 : -1, false);
  }

  async function searchStudents(query) {
    const response = await state.context.adminFetch(`/admin/roster/search?q=${encodeURIComponent(query)}`, { method:'GET' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return Array.isArray(data.results) ? data.results.slice(0, 8) : [];
  }

  async function loadStaff() {
    if (!actorIsSuperAdmin()) return [];
    if (Array.isArray(state.staff)) return state.staff;
    if (state.staffPromise) return state.staffPromise;
    state.staffPromise = (async () => {
      const response = await state.context.adminFetch('/admin/view_as/staff', { method:'GET' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      state.staff = Array.isArray(data.staff) ? data.staff : [];
      return state.staff;
    })().finally(() => { state.staffPromise = null; });
    return state.staffPromise;
  }

  async function runSearch(rawQuery) {
    const query = text(rawQuery);
    const seq = ++state.seq;
    const pages = (state.context?.pages || [])
      .map((page) => ({ page, score:pageScore(page, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a,b) => (b.score - a.score) || text(a.page?.label).localeCompare(text(b.page?.label)))
      .slice(0, 8)
      .map((entry) => entry.page);

    if (query.length < 2) {
      renderResults({ query, pages });
      return;
    }

    renderResults({ query, pages, loading:true });
    let students = [];
    let staff = [];
    let studentError = '';
    let staffError = '';

    const studentPromise = searchStudents(query).catch((error) => {
      studentError = String(error?.message || error);
      return [];
    });
    const staffPromise = actorIsSuperAdmin()
      ? loadStaff().then((rows) => rows
          .map((row) => ({ row, score:staffScore(row, query) }))
          .filter((entry) => entry.score > 0)
          .sort((a,b) => (b.score - a.score) || text(a.row?.name).localeCompare(text(b.row?.name)))
          .slice(0, 8)
          .map((entry) => entry.row))
        .catch((error) => {
          staffError = String(error?.message || error);
          return [];
        })
      : Promise.resolve([]);

    [students, staff] = await Promise.all([studentPromise, staffPromise]);
    if (seq !== state.seq || !state.open) return;
    renderResults({ query, pages, students, staff, studentError, staffError });
  }

  function queueSearch() {
    clearTimeout(state.debounce);
    const query = state.els.input.value;
    state.debounce = setTimeout(() => runSearch(query), 120);
  }

  function openStudent(student) {
    const osis = text(student?.osis);
    if (!osis) return;
    const url = new URL('./student_view.html', location.href);
    url.searchParams.set('osis', osis);
    if (text(student?.name)) url.searchParams.set('name', text(student.name));
    location.href = url.href;
  }

  async function startViewAs(row, button) {
    const email = lower(row?.email);
    if (!email || !actorIsSuperAdmin()) return;
    button.disabled = true;
    state.els.status.textContent = `Starting read-only View As ${text(row?.name || email)}…`;
    try {
      const response = await state.context.adminFetch('/admin/session/view_as', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ email })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
      location.href = './my_schedule.html';
    } catch (error) {
      button.disabled = false;
      state.els.status.textContent = `Could not start View As: ${error?.message || error}`;
    }
  }

  async function stopViewAs(button) {
    if (!actorIsSuperAdmin()) return;
    if (button) button.disabled = true;
    state.els.status.textContent = 'Returning to Super Admin…';
    try {
      const response = await state.context.adminFetch('/admin/session/view_as', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ email:'' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
      location.href = './index.html';
    } catch (error) {
      if (button) button.disabled = false;
      state.els.status.textContent = `Could not exit View As: ${error?.message || error}`;
    }
  }

  function openPalette() {
    if (state.open) return;
    state.open = true;
    state.restoreFocus = document.activeElement;
    state.els.backdrop.hidden = false;
    document.documentElement.classList.add('ssGlobalSearch-open');
    state.els.input.value = '';
    renderResults({ query:'', pages:[] });
    requestAnimationFrame(() => state.els.input.focus({ preventScroll:true }));
  }

  function closePalette() {
    if (!state.open) return;
    state.open = false;
    state.seq += 1;
    clearTimeout(state.debounce);
    state.els.backdrop.hidden = true;
    document.documentElement.classList.remove('ssGlobalSearch-open');
    const restore = state.restoreFocus;
    state.restoreFocus = null;
    if (restore && document.contains(restore) && typeof restore.focus === 'function') {
      try { restore.focus({ preventScroll:true }); } catch { restore.focus(); }
    }
  }

  function togglePalette() {
    if (state.open) closePalette();
    else openPalette();
  }

  function buildUi() {
    const launcher = document.createElement('button');
    launcher.id = 'ssGlobalSearchLauncher';
    launcher.className = 'ssGlobalSearchLauncher';
    launcher.type = 'button';
    launcher.setAttribute('aria-haspopup', 'dialog');
    launcher.innerHTML = '<span class="ssGlobalSearchLauncherLabel"><span aria-hidden="true">⌕</span> Search</span>';
    const shortcut = document.createElement('kbd');
    shortcut.textContent = shortcutLabel();
    launcher.appendChild(shortcut);
    launcher.addEventListener('click', openPalette);

    const navLinks = document.querySelector('#ssNavDrawer .ssNavLinks');
    if (navLinks) navLinks.prepend(launcher);

    const backdrop = document.createElement('div');
    backdrop.id = 'ssGlobalSearchBackdrop';
    backdrop.hidden = true;

    const dialog = document.createElement('div');
    dialog.id = 'ssGlobalSearchDialog';
    dialog.className = 'ssGlobalSearchDialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Search EagleNEST');

    const searchRow = document.createElement('div');
    searchRow.className = 'ssGlobalSearchInputRow';
    const icon = document.createElement('span');
    icon.className = 'ssGlobalSearchInputIcon';
    icon.textContent = '⌕';
    icon.setAttribute('aria-hidden', 'true');
    const input = document.createElement('input');
    input.id = 'ssGlobalSearchInput';
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = actorIsSuperAdmin() ? 'Search pages, students, or staff…' : 'Search pages or students…';
    input.setAttribute('aria-label', actorIsSuperAdmin() ? 'Search pages, students, or staff' : 'Search pages or students');
    const escHint = document.createElement('kbd');
    escHint.className = 'ssGlobalSearchEsc';
    escHint.textContent = 'Esc';
    searchRow.append(icon, input, escHint);

    const results = document.createElement('div');
    results.id = 'ssGlobalSearchResults';
    results.className = 'ssGlobalSearchResults';
    results.setAttribute('role', 'listbox');

    const empty = document.createElement('div');
    empty.className = 'ssGlobalSearchEmpty';

    const footer = document.createElement('div');
    footer.className = 'ssGlobalSearchFooter';
    const status = document.createElement('span');
    status.className = 'ssGlobalSearchStatus';
    status.setAttribute('aria-live', 'polite');
    const keys = document.createElement('span');
    keys.className = 'ssGlobalSearchKeys';
    keys.innerHTML = '<kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>Enter</kbd> open <kbd>Esc</kbd> close';
    footer.append(status, keys);

    dialog.append(searchRow, results, empty, footer);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    state.els = { launcher, backdrop, dialog, input, results, empty, status };

    input.addEventListener('input', queueSearch);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) closePalette();
    });
    escHint.addEventListener('click', closePalette);
    escHint.setAttribute('role', 'button');
    escHint.tabIndex = 0;
    escHint.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        closePalette();
      }
    });
  }

  function installKeyboardHandler() {
    window.addEventListener('keydown', (event) => {
      const key = lower(event.key);
      if ((event.metaKey || event.ctrlKey) && !event.altKey && key === 'k') {
        event.preventDefault();
        event.stopPropagation();
        togglePalette();
        return;
      }
      if (!state.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePalette();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(state.activeIndex + 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(state.activeIndex - 1);
        return;
      }
      if (event.key === 'Enter' && document.activeElement === state.els.input) {
        event.preventDefault();
        activateCurrent();
      }
    }, { capture:true });
  }

  function mount(context) {
    if (!context?.access?.ok || typeof context?.adminFetch !== 'function') return;
    state.context = context;
    if (state.mounted) return;
    state.mounted = true;
    buildUi();
    installKeyboardHandler();
  }

  window.EAGLENEST_GLOBAL_SEARCH = { mount, open:openPalette, close:closePalette };
  if (window.EAGLENEST_GLOBAL_SEARCH_CONTEXT) mount(window.EAGLENEST_GLOBAL_SEARCH_CONTEXT);
})();

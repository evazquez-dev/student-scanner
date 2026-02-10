// Teacher Attendance page
// - Auth: same cookie-based admin session flow as hallway.js
// - Data sources:
//    1) /admin/meeting/preview?room=...&period=...&when=mid|end  (scheduled + AttendanceDO evidence)
//    2) /admin/hallway_state  (names + current zone/location today)

const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '')
  .replace(/\/*$/, '') + '/';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
const ADMIN_SESSION_KEY = 'teacher_att_admin_session_v1';
const ADMIN_SESSION_HEADER = 'x-admin-session';
const THEME_KEY = 'ss_theme_v1';
const themeToggleBtn = document.getElementById('themeToggleBtn');

// Mobile view toggle (Attendance vs Out/In Organizer)
const VIEW_KEY = 'teacher_att_view'; // 'attendance' | 'organizer'
const SECRET_BEHAVIOR_ENDPOINT = '/admin/behavior/log';
const SECRET_BEHAVIOR_NAMESPACE = 'TASecretBehavior';
const viewToggleBtn = document.getElementById('viewToggleBtn');

// Organizer DOM (optional; only present if you added the Organizer markup in HTML)
const outInBox  = document.getElementById('outInBox');
const outInHint = document.getElementById('outInHint');
const outListEl = document.getElementById('outList');
const inListEl  = document.getElementById('inList');
const outCountEl = document.getElementById('outCount');
const inCountEl  = document.getElementById('inCount');

/******************** Secret behavior menu (persistent across refresh) ********************/
const SECRET_FLAG_KEY = 'ta_secret_behavior_enabled_v1';

const SECRET_MENU = {
  enabled: false,
  open: false,
  x: 0,
  y: 0,
  student: null, // { osis, name, date, room, periodLocal }
  el: null
};

function isSecretEnabled(){
  if (SECRET_MENU.enabled) return true;
  try { return localStorage.getItem(SECRET_FLAG_KEY) === '1'; } catch { return false; }
}
function setSecretEnabled(v){
  SECRET_MENU.enabled = !!v;
  try { localStorage.setItem(SECRET_FLAG_KEY, SECRET_MENU.enabled ? '1' : '0'); } catch {}
  if (!SECRET_MENU.enabled) closeSecretMenu();
  renderSecretMenu();
}

function initSecretMenu(){
  // idempotent init (avoid duplicate listeners/menu)
  if (SECRET_MENU.el) {
    SECRET_MENU.enabled = isSecretEnabled();
    renderSecretMenu();
    return;
  }

  SECRET_MENU.enabled = isSecretEnabled();

  const el = document.createElement('div');
  el.id = 'taSecretMenu';
  el.style.position = 'fixed';
  el.style.display = 'none';
  el.style.zIndex = '99999';
  el.style.minWidth = '120px';
  el.style.background = 'var(--card, #111)';
  el.style.border = '1px solid rgba(255,255,255,.18)';
  el.style.borderRadius = '8px';
  el.style.boxShadow = '0 10px 30px rgba(0,0,0,.35)';
  el.style.padding = '6px';
  el.style.backdropFilter = 'blur(6px)';
  document.body.appendChild(el);
  SECRET_MENU.el = el;

  // menu click
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'test') {
      try{
        await sendSecretBehaviorTest();
        closeSecretMenu();
        setStatus(true, 'Behavior test logged');
      } catch(err){
        setErr(err?.message || String(err));
        setStatus(false, 'Behavior test failed');
      }
    }
  });

  // click-away closes
  document.addEventListener('pointerdown', (e) => {
    if (!SECRET_MENU.open) return;
    if (SECRET_MENU.el && SECRET_MENU.el.contains(e.target)) return;
    closeSecretMenu();
  }, true);

  // ESC closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && SECRET_MENU.open) closeSecretMenu();
  });

  // keep menu on-screen
  window.addEventListener('resize', () => {
    if (SECRET_MENU.open) renderSecretMenu();
  });

  // console-only controls
  window.TASecretBehavior = {
    on(){ setSecretEnabled(true); return 'TASecretBehavior: ON'; },
    off(){ setSecretEnabled(false); return 'TASecretBehavior: OFF'; },
    toggle(){ setSecretEnabled(!isSecretEnabled()); return `TASecretBehavior: ${isSecretEnabled() ? 'ON' : 'OFF'}`; },
    status(){ return { enabled: isSecretEnabled(), open: SECRET_MENU.open, student: SECRET_MENU.student }; },
    async test(osis){
      const key = String(osis || '').trim();
      if (!key) throw new Error('osis_required');
      const row = ROW_DATA.get(key);
      if (!row) throw new Error(`osis_not_in_current_view:${key}`);
      SECRET_MENU.student = {
        osis: String(row.osis || key),
        name: String(row.name || ''),
        date: String(dateText?.textContent || ''),
        room: normRoom(roomInput?.value || ''),
        periodLocal: normPeriod(periodInput?.value || '')
      };
      return sendSecretBehaviorTest();
    }
  };
}

function openSecretMenuAtEvent(ev, studentCtx){
  if (!isSecretEnabled()) return;
  ev.preventDefault();
  ev.stopPropagation();

  SECRET_MENU.open = true;
  SECRET_MENU.x = ev.clientX;
  SECRET_MENU.y = ev.clientY;
  SECRET_MENU.student = studentCtx;
  renderSecretMenu();
}

function closeSecretMenu(){
  SECRET_MENU.open = false;
  if (SECRET_MENU.el) SECRET_MENU.el.style.display = 'none';
}

function renderSecretMenu(){
  const el = SECRET_MENU.el;
  if (!el) return;

  const canShow = isSecretEnabled() && SECRET_MENU.open && SECRET_MENU.student;
  if (!canShow){
    el.style.display = 'none';
    return;
  }

  const s = SECRET_MENU.student;
  el.innerHTML = `
    <div style="font-size:11px;opacity:.8;padding:4px 6px 6px 6px;line-height:1.25;">
      ${String(s.name || '(Unknown)')}<br>
      <span style="opacity:.75">${String(s.osis || '')}</span>
    </div>
    <button data-act="test"
      style="width:100%;text-align:left;padding:7px 8px;border:0;border-radius:6px;cursor:pointer;">
      test
    </button>
  `;

  // clamp to viewport
  const w = 140;
  const h = 92;
  const x = Math.max(8, Math.min(SECRET_MENU.x, window.innerWidth - w - 8));
  const y = Math.max(8, Math.min(SECRET_MENU.y, window.innerHeight - h - 8));

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.display = 'block';
}

async function sendSecretBehaviorTest(){
  const s = SECRET_MENU.student;
  if (!s?.osis) throw new Error('No student selected');

  const payload = {
    date: String(s.date || ''),
    room: String(s.room || ''),
    periodLocal: String(s.periodLocal || ''),
    osis: String(s.osis || ''),
    name: String(s.name || ''),
    eventKey: 'test',
    eventLabel: 'test',
    source: 'teacher_attendance_secret_menu',
    whenISO: new Date().toISOString(),
    meta: { ui: 'secret_menu', ver: 1 }
  };

  const r = await adminFetch(SECRET_BEHAVIOR_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) {
    throw new Error(data?.error || `behavior/log HTTP ${r.status}`);
  }
}

// Last rendered context (for organizer view)
let LAST_CTX = null;           // { date, room, period }
let LAST_SESSION_STATE = null; // object returned by /admin/class_session/state

function getTheme(){
  const t = String(document.documentElement?.dataset?.theme || '').trim().toLowerCase();
  return (t === 'light') ? 'light' : 'dark';
}

function setTheme(theme){
  const t = (String(theme || '').toLowerCase() === 'light') ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try{ localStorage.setItem(THEME_KEY, t); }catch{}
  updateThemeToggleUI();
}

function updateThemeToggleUI(){
  if(!themeToggleBtn) return;
  const t = getTheme();
  themeToggleBtn.textContent = (t === 'light') ? '☀️ Light' : '🌙 Dark';
  themeToggleBtn.title = (t === 'light') ? 'Switch to dark mode' : 'Switch to light mode';
  themeToggleBtn.setAttribute('aria-pressed', String(t === 'light'));
}

function initThemeToggle(){
  if(!themeToggleBtn) return;
  // dataset is set early in HTML; just sync UI + wire click handler
  updateThemeToggleUI();
  themeToggleBtn.addEventListener('click', () => {
    setTheme(getTheme() === 'light' ? 'dark' : 'light');
  });
}

/******************** Mobile view toggle + Organizer ********************/
function isMobileNow(){
  try { return window.matchMedia('(max-width: 900px)').matches; } catch { return false; }
}
function getView(){
  const v = String(localStorage.getItem(VIEW_KEY) || 'attendance').toLowerCase().trim();
  return (v === 'organizer') ? 'organizer' : 'attendance';
}
function setView(v){
  const vv = (String(v||'').toLowerCase().trim() === 'organizer') ? 'organizer' : 'attendance';
  localStorage.setItem(VIEW_KEY, vv);
  applyView();
}
function applyView(){
  // Mobile-only behavior; desktop always stays in table view
  if (!isMobileNow()) {
    if (tableBox) tableBox.style.display = '';
    if (outInBox) outInBox.style.display = 'none';
    return;
  }
  const v = getView();
  const bulkBar = document.getElementById('bulkBar');
  
  if (bulkBar) bulkBar.style.display = (v === 'attendance') ? '' : 'none';
  if (tableBox) tableBox.style.display = (v === 'attendance') ? '' : 'none';
  if (outInBox) outInBox.style.display = (v === 'organizer') ? 'block' : 'none';

  // Optional: swap label/icon so it's obvious what you'll switch to
  if (viewToggleBtn) viewToggleBtn.textContent = (v === 'organizer') ? '📋 Attendance' : '🧭 Organizer';

  if (v === 'organizer') renderOutInOrganizer();
}
function initViewToggle(){
  if (!viewToggleBtn) return; // user hasn't added the HTML button
  viewToggleBtn.addEventListener('click', () => {
    setView(getView() === 'organizer' ? 'attendance' : 'organizer');
  });

  // Re-apply view if screen size changes
  try{
    const mq = window.matchMedia('(max-width: 900px)');
    mq.addEventListener?.('change', applyView);
  }catch(_){}

  applyView();
}

function getSessionOutRec(osis){
  const key = String(osis || '').trim();
  if (!key) return null;
  return LAST_SESSION_STATE?.students?.[key]?.out || null;
}
function isStudentOut(osis){
  const o = getSessionOutRec(osis);
  return !!(o && o.isOut);
}
function getOutSince(osis){
  const o = getSessionOutRec(osis);
  return o?.outSinceISO || null;
}


function getSessionFirstInISO(osis){
  const key = String(osis || '').trim();
  if (!key) return null;
  return LAST_SESSION_STATE?.students?.[key]?.firstInISO || null;
}
function hasSessionFirstIn(osis){
  return !!getSessionFirstInISO(osis);
}

function zoneBlocksOutIn(zone){
  const z = String(zone || '').trim().toLowerCase();
  return (z === 'with_staff');
}
// Organizer renderer: OUT first, then IN.
function renderOutInOrganizer(){
  if (!outInBox || !outListEl || !inListEl) return;

  // Need a recently-rendered table context (room/period/date)
  const ctx = LAST_CTX || {
    date: (dateText?.textContent || ''),
    room: normRoom(roomInput?.value || ''),
    period: normPeriod(periodInput?.value || '')
  };

  const date = String(ctx.date || '').trim();
  const room = String(ctx.room || '').trim();
  const period = String(ctx.period || '').trim();

  // Same gating as the table column
  const cur = String(CURRENT_PERIOD_LOCAL || '').trim();
  const allowOutIn = !!cur && (String(period || '').trim() === cur);

  const merged = Array.isArray(lastMergedRows) ? lastMergedRows : [];
  const outs = [];
  const ins  = [];

  for (const r of merged){
    const osis = String(r?.osis || '').trim();
    if (!osis) continue;
    const out = isStudentOut(osis);
    const item = { r, osis, isOut: out, outSinceISO: getOutSince(osis) };
    (out ? outs : ins).push(item);
  }

  // Hint
  if (outInHint){
    if (!allowOutIn) {
      outInHint.textContent =
        `Out/In is only enabled for the CURRENT period.\nSelected: P${period || '—'} • Current: P${cur || '—'}\n(Buttons are disabled until you pick the current period.)`;
    } else {
      outInHint.textContent = `Out/In is enabled (current period P${cur}). OUT students appear first.`;
    }
  }

  if (outCountEl) outCountEl.textContent = String(outs.length);
  if (inCountEl)  inCountEl.textContent  = String(ins.length);

  function makeRow({ r, osis, isOut, outSinceISO }){
    const wrap = document.createElement('div');
    wrap.className = 'outInRow ' + (isOut ? 'outInRow--out' : 'outInRow--in');

    const info = document.createElement('div');
    info.className = 'outInInfo';

    const nm = document.createElement('div');
    nm.className = 'outInName';
    nm.textContent = r?.name || '(Unknown)';

    const meta = document.createElement('div');
    meta.className = 'outInMeta';
    const code = (r?.chosen || 'A');
    const tail = outSinceISO ? ` • since ${outSinceISO}` : '';
    meta.textContent = `${osis} • ${codeLabel(code)}${tail}`;

    info.appendChild(nm);
    info.appendChild(meta);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-mini ' + (isOut ? 'btn-in' : 'btn-out');
    btn.dataset.osis = String(osis || '').trim();
    btn.textContent = (isOut && outSinceISO) ? `IN ${elapsedFromISO(outSinceISO)}` : (isOut ? 'IN' : 'OUT');

        const codeIsPL = (code === 'P' || code === 'L');
    const hasFirstIn = hasSessionFirstIn(osis);
    const blocked = zoneBlocksOutIn(r?.zone);
    const canToggle = allowOutIn && codeIsPL && hasFirstIn && !blocked;
    btn.disabled = !canToggle;
    btn.title = canToggle
      ? ((isOut && outSinceISO) ? `Out since ${outSinceISO}` : 'Toggle Out/In')
      : (blocked
          ? 'Disabled while student is With Staff'
          : (!allowOutIn
              ? 'Pick the current period to enable Out/In'
              : (!codeIsPL
                  ? 'Mark Present (P) or Late (L) to enable Out/In'
                  : 'Needs first scan into the room (kiosk scan or Submit as Present/Late)')));

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try{
        const res = await toggleClassSessionOutIn({ date, room, periodLocal: period, osis });

        // Keep shared session state updated
        if (!LAST_SESSION_STATE) LAST_SESSION_STATE = { ok:true, students:{} };
        if (!LAST_SESSION_STATE.students) LAST_SESSION_STATE.students = {};
        LAST_SESSION_STATE.students[osis] = LAST_SESSION_STATE.students[osis] || { osis };
        LAST_SESSION_STATE.students[osis].out = LAST_SESSION_STATE.students[osis].out || {};
        LAST_SESSION_STATE.students[osis].out.isOut = !!res.isOut;
        if (res.isOut && res.outSinceISO) {
          LAST_SESSION_STATE.students[osis].out.outSinceISO = res.outSinceISO;
        } else {
          delete LAST_SESSION_STATE.students[osis].out.outSinceISO;
        }

        // Update table row button too (if present)
        const ui = ROW_UI.get(osis);
        if (ui?.outInBtn){
          ui.outInBtn.className = 'btn btn-mini ' + (res.isOut ? 'btn-in' : 'btn-out');
          ui.outInBtn.textContent = outBtnLabelFor(osis);
          ui.outInBtn.dataset.toggleTitle =
            (res.isOut && res.outSinceISO) ? `Out since ${res.outSinceISO}` : 'Toggle Out/In';

          const rowRec = ROW_DATA.get(osis);
          const codeIsPL = (rowRec?.chosen === 'P' || rowRec?.chosen === 'L');
          const hasFirstIn = hasSessionFirstIn(osis);
          const blocked = zoneBlocksOutIn(rowRec?.zone);
          const canToggleNow = allowOutIn && codeIsPL && hasFirstIn && !blocked;
          ui.outInBtn.disabled = !canToggleNow;
          ui.outInBtn.title = canToggleNow
            ? (ui.outInBtn.dataset.toggleTitle || 'Toggle Out/In')
            : (blocked
                ? 'Disabled while student is With Staff'
                : (!allowOutIn
                    ? 'Pick the current period to enable Out/In'
                    : (!codeIsPL
                        ? 'Mark Present (P) or Late (L) to enable Out/In'
                        : 'Needs first scan into the room (kiosk scan or Submit as Present/Late)')));
        }

        renderOutInOrganizer(); // reorder OUT/IN groups
      } catch(e){
        setErr(e?.message || String(e));
        setStatus(false, 'Error');

        // restore enabled state if still allowed
        const rowRec = ROW_DATA.get(osis) || r;
        const codeNow = (rowRec?.chosen || 'A');
        const codeIsPL = (codeNow === 'P' || codeNow === 'L');
        const hasFirstIn = hasSessionFirstIn(osis);
        const blocked = zoneBlocksOutIn(rowRec?.zone);
        const canToggleNow = allowOutIn && codeIsPL && hasFirstIn && !blocked;
        btn.disabled = !canToggleNow;
        if (!canToggleNow) {
          btn.title = blocked
            ? 'Disabled while student is With Staff'
            : (!allowOutIn
                ? 'Pick the current period to enable Out/In'
                : (!codeIsPL
                    ? 'Mark Present (P) or Late (L) to enable Out/In'
                    : 'Needs first scan into the room (kiosk scan or Submit as Present/Late)'));
        }
      }
    });

    wrap.appendChild(info);
    wrap.appendChild(btn);
    return wrap;
  }

  outListEl.innerHTML = '';
  inListEl.innerHTML  = '';

  for (const it of outs) outListEl.appendChild(makeRow(it));
  for (const it of ins)  inListEl.appendChild(makeRow(it));
}

const loginCard  = document.getElementById('loginCard');
const loginOut   = document.getElementById('loginOut');
const appShell   = document.getElementById('appShell');

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dateText   = document.getElementById('dateText');
const refreshText= document.getElementById('refreshText');
const currentPeriodText = document.getElementById('currentPeriodText');
const tableBox = document.getElementById('tableBox');
const outInHeader = document.getElementById('outInHeader');

const roomInput  = document.getElementById('roomInput');
const periodInput= document.getElementById('periodInput');
// const whenSelect = document.getElementById('whenSelect');
const refreshBtn = document.getElementById('refreshBtn');
const submitBtn = document.getElementById('submitBtn');
const submitBtnBottom = document.getElementById('submitBtnBottom');

// After-school toggle button (only visible during after-school window)
const afterSchoolBtn = document.getElementById('afterSchoolBtn');
const periodField = document.getElementById('periodField');

// Table header cells (for mode-specific labels)
const thSel = document.getElementById('thSel');
const thStudent = document.getElementById('thStudent');
const thOsis = document.getElementById('thOsis');
const thCode = document.getElementById('thCode');
const thScan = document.getElementById('thScan');

const selectAllCb = document.getElementById('selectAllCb');
const bulkSelectedCountEl = document.getElementById('bulkSelectedCount');
const bulkCodeSelect = document.getElementById('bulkCodeSelect');

const errBox     = document.getElementById('errBox');
const optionsDiagBox = document.getElementById('optionsDiag');
const subtitleRight = document.getElementById('subtitleRight');
const rowsEl     = document.getElementById('rows');

const DEBUG = false;
const debugEl = document.getElementById('debugLog');

let IS_AUTHED = false;
let CURRENT_PERIOD_LOCAL = ''; // updated by renderCurrentPeriod()

// ---------- After-school teacher view (room-only) ----------
const MODE_KEY = 'teacher_att_mode_v1'; // 'class' | 'after_school'
const AS_ROOM_KEY = 'teacher_att_as_room';
let PAGE_MODE = 'class';
let AFTER_SCHOOL_ELIGIBLE = false;      // Worker schedule says we're in after-school window
let AFTER_SCHOOL_OPTS_CACHE = null;     // /admin/after_school/options
let LAST_CLASS_PICK = { room: '', period: '' };

// Real advisor-mode periods (backend buckets by advisor label)
const ADVISOR_PERIODS = new Set(['FM1','FM2','ADV']);

// Lunch periods: UI shows advisor label, but API calls must use the real room (Caf / 315 / etc)
const LUNCH_ADVISOR_UI_PERIODS = new Set(['LCH1','LCH2']);

let TEACHER_OPTS_CACHE = null;

const roomLabelEl = document.querySelector('label[for="roomInput"]');

// For lunch periods we keep the picked advisor label so we can display it.
let UI_LUNCH_ADVISOR_LABEL = '';

function periodKey(p){
  return String(p||'').trim().toUpperCase();
}

function isAdvisorPeriod(p){
  return ADVISOR_PERIODS.has(periodKey(p));
}

function isLunchAdvisorUiPeriod(p){
  return LUNCH_ADVISOR_UI_PERIODS.has(periodKey(p));
}

function resolveRoomForApi(periodLocal, pickedLabel){
  const p = periodKey(periodLocal);
  const picked = String(pickedLabel||'').trim();
  UI_LUNCH_ADVISOR_LABEL = '';

  if (!picked) return '';

  if (isLunchAdvisorUiPeriod(p)) {
    UI_LUNCH_ADVISOR_LABEL = picked;
    const map = TEACHER_OPTS_CACHE?.lunch_advisor_to_room?.[p] || {};
    const resolved = String(map?.[picked] || '').trim();
    return resolved || picked; // fallback if map missing
  }

  return picked;
}

function applyRoomDropdownFromOpts(opts, preferredRoom = ''){
  const period = String(periodInput?.value || '').trim();

  const pKey = periodKey(period);

  const lunchUi = isLunchAdvisorUiPeriod(pKey);
  const advisorMode = lunchUi || isAdvisorPeriod(pKey);

  const items = lunchUi
    ? (opts?.lunch_advisors_by_period?.[pKey] || [])
    : advisorMode
      ? (opts?.advisors_by_period?.[pKey] || [])
      : (opts?.rooms || []);

  if (roomLabelEl) roomLabelEl.textContent = advisorMode ? 'Advisor' : 'Room';

  // Keep selection only if it exists in the new list
  const current = String(preferredRoom || roomInput.value || '').trim();
  const keep = current && items.some(x => String(x) === current) ? current : '';

  fillSelect(roomInput, items, advisorMode ? 'Select advisor…' : 'Select room…', keep);

  // If we had to clear it, also clear saved room so we don't “stick” wrong mode
  if (!keep) {
    try { localStorage.setItem('teacher_att_room', ''); } catch {}
    try { sessionStorage.setItem('teacher_att_room', ''); } catch {}
  }
}

// Cosmetic labels for attendance codes (keep values as A/L/P for API payloads)
const CODE_LABELS = { P: 'Present', L: 'Late', A: 'Absent' };
function codeLabel(code){
  const c = String(code || '').trim().toUpperCase();
  return CODE_LABELS[c] || (c || '—');
}

function onAuthed(){
  IS_AUTHED = true;
  hide(loginCard);
  show(appShell);
  bootTeacherAttendance();
}

function dbg(...args){
  if(!DEBUG) return;
  const ts = new Date().toISOString();
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a, null, 2)).join(' ');
  console.log('[teacher_att]', msg);
  if (debugEl){
    debugEl.style.display = 'block';
    debugEl.textContent += `[${ts}] ${msg}\n`;
  }
}

function show(el){ if(el) el.style.display='block'; }
function hide(el){ if(el) el.style.display='none'; }
function setStatus(ok, msg){
  statusDot.className = 'pill-dot ' + (ok ? 'pill-dot--ok' : 'pill-dot--bad');
  statusText.textContent = msg;
}

async function waitForGoogle(timeoutMs = 8000){
  const start = Date.now();
  while(!window.google?.accounts?.id){
    if(Date.now()-start > timeoutMs) throw new Error('Google script failed to load');
    await new Promise(r=>setTimeout(r,50));
  }
  return window.google.accounts.id;
}

function getStoredAdminSessionSid(){
  try{
    return String(
      sessionStorage.getItem(ADMIN_SESSION_KEY) ||
      localStorage.getItem(ADMIN_SESSION_KEY) ||
      ''
    ).trim();
  }catch{
    return '';
  }
}

function setStoredAdminSessionSid(sid){
  const v = String(sid || '').trim();
  if (!v) return;
  try{ sessionStorage.setItem(ADMIN_SESSION_KEY, v); }catch{}
  try{ localStorage.setItem(ADMIN_SESSION_KEY, v); }catch{}
}

function clearStoredAdminSessionSid(){
  try{ sessionStorage.removeItem(ADMIN_SESSION_KEY); }catch{}
  try{ localStorage.removeItem(ADMIN_SESSION_KEY); }catch{}
}

function stashAdminSessionFromResponse(resp){
  try{
    const sid = String(
      resp?.headers?.get(ADMIN_SESSION_HEADER) ||
      resp?.headers?.get('X-Admin-Session') ||
      ''
    ).trim();
    if (sid) setStoredAdminSessionSid(sid);
  }catch{}
}

// Always include cookie + optional header session for iOS cross-origin fallback
async function adminFetch(pathOrUrl, init = {}){
  const u = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);

  const headers = new Headers(init.headers || {});
  const sid = getStoredAdminSessionSid();
  if (sid && !headers.has(ADMIN_SESSION_HEADER)) {
    headers.set(ADMIN_SESSION_HEADER, sid);
  }

  const resp = await fetch(u, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store'
  });

  // capture/refesh SID when Worker sends it
  stashAdminSessionFromResponse(resp);

  // Only clear SID when it's truly expired/bad, not every 401
  if (resp.status === 401) {
    try {
      const j = await resp.clone().json().catch(() => null);
      const err = String(j?.error || '').toLowerCase();
      if (err === 'expired' || err === 'bad_session') {
        clearStoredAdminSessionSid();
      }
    } catch {}
  }

  return resp;
}

// ---------- After-school view helpers ----------
function getStoredMode(){
  const v = String(localStorage.getItem(MODE_KEY) || '').toLowerCase().trim();
  return (v === 'after_school') ? 'after_school' : 'class';
}

function setStoredMode(mode){
  const m = (String(mode||'') === 'after_school') ? 'after_school' : 'class';
  try{ localStorage.setItem(MODE_KEY, m); }catch{}
}

async function fetchAfterSchoolOptions(){
  const r = await adminFetch('/admin/after_school/options', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if (!r.ok || !data?.ok) {
    throw new Error(data?.error || `after_school/options HTTP ${r.status}`);
  }
  return data;
}

async function fetchAfterSchoolRoom(homeRoomLabel, dateOpt){
  const u = new URL('/admin/after_school/room', API_BASE);
  u.searchParams.set('room', String(homeRoomLabel || '').trim());
  if (dateOpt) u.searchParams.set('date', String(dateOpt));

  const r = await adminFetch(u, { method:'GET' });
  const data = await r.json().catch(()=>null);
  if (!r.ok || !data?.ok) {
    throw new Error(data?.error || `after_school/room HTTP ${r.status}`);
  }
  return data;
}

async function afterSchoolToggle({ date, homeRoomLabel, osis, to }){
  // Prefer the admin endpoint (cookie-auth). If it doesn't exist yet, fall back to public log.
  try{
    const r = await adminFetch('/admin/after_school/toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date, room: homeRoomLabel, osis, to })
    });

    if (r.status === 404) throw new Error('no_admin_toggle');
    const data = await r.json().catch(()=>null);
    if (!r.ok || !data?.ok) {
      throw new Error(data?.error || `after_school/toggle HTTP ${r.status}`);
    }
    return data;
  } catch(e){
    // Fallback: use public action=log endpoint (requires ORIGIN_OK)
    if (String(e?.message || '').includes('no_admin_toggle') || String(e?.message || '').includes('404')){
      const whenISO = new Date().toISOString();
      const params = new URLSearchParams();
      params.set('action', 'log');
      params.set('whenISO', whenISO);
      params.set('date', String(date || ''));
      params.set('code', String(osis || ''));
      params.set('osis', String(osis || ''));
      params.set('source', 'teacher_attendance');
      params.set('device_id', 'teacher_attendance');

      const target = (String(to||'').toLowerCase() === 'out') ? 'out' : 'in';
      if (target === 'out') {
        params.set('location', 'Hallway');
        params.set('allowed', 'class_out:Teacher');
      } else {
        params.set('location', String(homeRoomLabel || '').trim());
        params.set('allowed', 'after_school:Teacher');
      }

      const rr = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
        body: params.toString(),
        cache: 'no-store'
      });

      if (!rr.ok) {
        const t = await rr.text().catch(()=> '');
        throw new Error(`toggle_fallback_failed HTTP ${rr.status} ${t}`);
      }
      return { ok:true, did:'fallback' };
    }
    throw e;
  }
}

function setAfterSchoolButtonUI(){
  if (!afterSchoolBtn) return;
  if (!AFTER_SCHOOL_ELIGIBLE) {
    afterSchoolBtn.style.display = 'none';
    return;
  }
  afterSchoolBtn.style.display = '';
  afterSchoolBtn.textContent = (PAGE_MODE === 'after_school') ? '📚 Class View' : '🌙 After School';
  afterSchoolBtn.title = (PAGE_MODE === 'after_school')
    ? 'Switch back to the normal class-period view'
    : 'Switch to after-school homeroom view (room-only)';
}

function buildAfterSchoolRoomList(asOpts){
  const assigned = (asOpts?.assigned_rooms || [])
    .map(x => String(x?.label || '').trim())
    .filter(Boolean);
  const all = (asOpts?.rooms || []).map(x => String(x || '').trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const r of [...assigned, ...all]) {
    const k = r.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function applyAfterSchoolRoomDropdown(asOpts, preferredRoom = ''){
  const items = buildAfterSchoolRoomList(asOpts);
  if (roomLabelEl) roomLabelEl.textContent = 'Room';
  fillSelect(roomInput, items, 'Select room…', preferredRoom);
}

function applyModeUI(){
  const isAS = (PAGE_MODE === 'after_school');

  // Toggle layout bits
  if (periodField) periodField.style.display = isAS ? 'none' : '';
  if (periodInput) periodInput.disabled = !!isAS;

  // Submitting/bulk is class-only
  const bulkBar = document.getElementById('bulkBar');
  if (submitBtn) submitBtn.style.display = isAS ? 'none' : '';
  if (submitBtnBottom) submitBtnBottom.style.display = isAS ? 'none' : '';
  if (bulkBar) bulkBar.style.display = isAS ? 'none' : '';

  // Hide the mobile organizer button in after-school mode (it is class-session based)
  if (viewToggleBtn) viewToggleBtn.style.display = isAS ? 'none' : '';
  if (outInBox) outInBox.style.display = isAS ? 'none' : (isMobileNow() && getView() === 'organizer' ? 'block' : 'none');

  // Table shape
  if (tableBox) tableBox.classList.toggle('afterSchoolMode', !!isAS);

  // Header labels
  if (thStudent) thStudent.textContent = 'Student';
  if (thCode) thCode.textContent = isAS ? 'Current' : 'Code';
  if (outInHeader) outInHeader.textContent = isAS ? 'In/Out' : 'Out/In';

  setAfterSchoolButtonUI();
}

async function refreshAfterSchoolEligibility(){
  try{
    const opts = await fetchAfterSchoolOptions();
    AFTER_SCHOOL_OPTS_CACHE = opts;
    AFTER_SCHOOL_ELIGIBLE = !!opts?.after_school_mode;
  }catch(_){
    AFTER_SCHOOL_ELIGIBLE = false;
    AFTER_SCHOOL_OPTS_CACHE = null;
  }

  // If the window ended, force back to class view
  if (!AFTER_SCHOOL_ELIGIBLE && PAGE_MODE === 'after_school') {
    PAGE_MODE = 'class';
    setStoredMode('class');
  }

  setAfterSchoolButtonUI();
  applyModeUI();
}

async function enterAfterSchoolMode(){
  // Save class picks so we can restore
  LAST_CLASS_PICK = {
    room: String(roomInput?.value || '').trim(),
    period: String(periodInput?.value || '').trim()
  };

  PAGE_MODE = 'after_school';
  setStoredMode('after_school');

  if (!AFTER_SCHOOL_OPTS_CACHE) {
    await refreshAfterSchoolEligibility();
  }

  const savedAsRoom =
    (qs().get('room') || '').trim() ||
    sessionStorage.getItem(AS_ROOM_KEY) ||
    localStorage.getItem(AS_ROOM_KEY) ||
    LAST_CLASS_PICK.room ||
    '';

  applyAfterSchoolRoomDropdown(AFTER_SCHOOL_OPTS_CACHE, savedAsRoom);
  try{ periodInput.value = ''; }catch{}
  applyModeUI();

  // Refresh immediately if room is set
  if (roomInput.value.trim()) {
    await refreshOnce();
  }
}

async function exitAfterSchoolMode(){
  PAGE_MODE = 'class';
  setStoredMode('class');

  // Restore dropdowns from cached teacher options
  try{
    if (TEACHER_OPTS_CACHE) {
      const periodItems = Array.isArray(TEACHER_OPTS_CACHE.period_options)
        ? TEACHER_OPTS_CACHE.period_options
        : (TEACHER_OPTS_CACHE.periods || []);

      const preferredPeriod = LAST_CLASS_PICK.period || String(TEACHER_OPTS_CACHE.current_period_local || '').trim() || '';
      fillSelect(periodInput, periodItems, 'Select period…', preferredPeriod);
      applyRoomDropdownFromOpts(TEACHER_OPTS_CACHE, LAST_CLASS_PICK.room || '');
    }
  }catch(_){
    // ignore
  }

  applyModeUI();

  // Refresh immediately if room+period are set
  if (roomInput.value.trim() && periodInput.value.trim()) {
    await refreshOnce();
  }
}

async function fetchClassSessionState(date, room, periodLocal){
  const u = new URL('/admin/class_session/state', API_BASE);
  u.searchParams.set('date', String(date || ''));
  u.searchParams.set('room', String(room || ''));
  u.searchParams.set('periodLocal', String(periodLocal || ''));

  const r = await adminFetch(u, { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) {
    throw new Error(data?.error || `class_session/state HTTP ${r.status}`);
  }
  return data;
}

async function toggleClassSessionOutIn({ date, room, periodLocal, osis }){
  const r = await adminFetch('/admin/class_session/toggle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, room, periodLocal, osis })
  });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) {
    throw new Error(data?.error || `class_session/toggle HTTP ${r.status}`);
  }
  return data;
}

async function populateDropdowns(){
  const opts = await fetchTeacherOptions();

  const savedPeriod = localStorage.getItem('teacher_att_period') || '';

  // ROOM: always blank on load (no default room)
  fillSelect(roomInput, opts.rooms || [], 'Select room…', '');

  // PERIOD: always prefer Worker’s current periodLocal; fallback to savedPeriod
  const preferredPeriod = String(opts.current_period_local || '').trim() || savedPeriod;
  const periodItems = Array.isArray(opts.period_options) ? opts.period_options : (opts.periods || []);
  fillSelect(periodInput, periodItems, 'Select period…', preferredPeriod);
}

async function fetchTeacherOptions(){
  const endpoint = _optionsEndpoint();
  const apiOrigin = _apiOrigin();
  const sameOrigin = (apiOrigin === location.origin);

  let r;
  try{
    r = await adminFetch('/admin/teacher_att/options', { method:'GET' });
  }catch(cause){
    const e = new Error('teacher_att/options request failed');
    e.diag = {
      endpoint,
      status: 0,
      statusText: 'FETCH_FAILED',
      apiOrigin,
      pageOrigin: location.origin,
      sameOrigin,
      cause: String(cause?.message || cause || '')
    };
    throw e;
  }

  const raw = await r.text().catch(() => '');
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}

  if(!r.ok || !data?.ok){
    const e = new Error(data?.error || `teacher_att/options HTTP ${r.status}`);
    e.diag = {
      endpoint,
      status: r.status,
      statusText: r.statusText || '',
      apiOrigin,
      pageOrigin: location.origin,
      sameOrigin,
      bodySnippet: String(raw || '').replace(/\s+/g, ' ').slice(0, 260)
    };
    throw e;
  }

  return data; // { periods:[...], rooms:[...], ... }
}

function fillSelect(el, items, placeholder, preferredValue){
  if(!el) return;

  el.innerHTML = '';

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholder || 'Select…';
  el.appendChild(ph);

  for(const item of (items || [])){
    const opt = document.createElement('option');

    if(item && typeof item === 'object'){
      const value = (item.value ?? item.id ?? item.local ?? '');
      const label = (item.label ?? item.text ?? value);
      opt.value = String(value);
      opt.textContent = String(label);
    } else {
      opt.value = String(item);
      opt.textContent = String(item);
    }

    el.appendChild(opt);
  }

  if(preferredValue != null && String(preferredValue).trim() !== ''){
    const pv = String(preferredValue).trim();
    el.value = pv;

    // If it didn't stick (value not found), try first token fallback
    // e.g. "4 (10:48 AM - 11:42 AM)" -> "4"
    if(!el.value && pv){
      const head = pv.split(/\s+/)[0];
      if(head && head !== pv) el.value = head;
    }
  }
}

function qs(){
  return new URLSearchParams(location.search);
}

function zoneToChipClass(zone){
  switch(String(zone||'')){
    case 'hallway': return 'chip--hall';
    case 'bathroom': return 'chip--bath';
    case 'class': return 'chip--class';
    case 'lunch': return 'chip--lunch';
    case 'with_staff': return 'chip--staff';
    case 'after_school': return 'chip--class';
    case 'off_campus': return 'chip--off';
    default: return '';
  }
}

function zoneToDotClass(zone){
  switch(String(zone||'')){
    case 'hallway': return 'zoneDot--hall';
    case 'bathroom': return 'zoneDot--bath';
    case 'class': return 'zoneDot--class';
    case 'lunch': return 'zoneDot--lunch';
    case 'with_staff': return 'zoneDot--staff';
    case 'after_school': return 'zoneDot--class';
    case 'off_campus': return 'zoneDot--off';
    default: return '';
  }
}

function fmtClock(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function normRoom(s){
  return String(s||'').trim();
}
function normPeriod(s){
  return String(s||'').trim();
}

function overrideKey(date, room, period){
  return `teacher_att_override:${date}:${room.toLowerCase()}:${period}`;
}

/******************** Out elapsed timer (Out/In button) ********************/
let OUT_ELAPSED_TIMER = null;

function formatElapsedMs(ms){
  ms = Math.max(0, ms || 0);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function elapsedFromISO(iso){
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return formatElapsedMs(Date.now() - t);
}

function outBtnLabelFor(osis){
  const out = getSessionOutRec(osis);
  const isOut = !!out?.isOut;
  const since = out?.outSinceISO || '';
  if (isOut && since) return `IN ${elapsedFromISO(since)}`;
  return isOut ? 'IN' : 'OUT';
}

function tickOutElapsed(){
  // Table buttons
  try{
    for (const [osis, ui] of (ROW_UI || new Map()).entries()){
      if (!ui?.outInBtn) continue;
      const out = getSessionOutRec(osis);
      if (out?.isOut && out?.outSinceISO) {
        ui.outInBtn.textContent = `IN ${elapsedFromISO(out.outSinceISO)}`;
      } else {
        ui.outInBtn.textContent = out?.isOut ? 'IN' : 'OUT';
      }
    }
  }catch(_){}

  // Organizer buttons (mobile view)
  try{
    if (outInBox && outInBox.style.display !== 'none'){
      outInBox.querySelectorAll('button[data-osis]').forEach(btn => {
        const osis = String(btn.dataset.osis || '').trim();
        if (!osis) return;
        btn.textContent = outBtnLabelFor(osis);
      });
    }
  }catch(_){}
}

function startOutElapsedTicker(){
  if (OUT_ELAPSED_TIMER) return;
  OUT_ELAPSED_TIMER = setInterval(tickOutElapsed, 1000);
  tickOutElapsed(); // immediate paint
}

function loadOverrides(date, room, period){
  try{
    const raw = localStorage.getItem(overrideKey(date, room, period));
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? obj : {};
  }catch{
    return {};
  }
}

function saveOverrides(date, room, period, obj){
  try{
    localStorage.setItem(overrideKey(date, room, period), JSON.stringify(obj || {}));
  }catch{}
}

// Persist checkbox selection across auto-refreshes (scoped to date + room + period)
function selectionKey(date, room, period){
  return `teacher_att_selected:${String(date||'')}:${String(room||'').toLowerCase()}:${String(period||'')}`;
}

function loadSelection(date, room, period){
  try{
    const raw = localStorage.getItem(selectionKey(date, room, period));
    const arr = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(x => String(x||'').trim()).filter(Boolean));
  }catch{
    return new Set();
  }
}

function saveSelection(date, room, period, set){
  try{
    const arr = Array.from(set || []).map(x => String(x||'').trim()).filter(Boolean);
    localStorage.setItem(selectionKey(date, room, period), JSON.stringify(arr));
  }catch{}
}

function setErr(msg){
  if(!msg){
    errBox.style.display='none';
    errBox.textContent='';
    return;
  }
  errBox.style.display='block';
  errBox.textContent = String(msg);
}

function _apiOrigin(){
  try { return new URL(API_BASE).origin; } catch { return '(invalid api-base)'; }
}
function _optionsEndpoint(){
  try { return new URL('/admin/teacher_att/options', API_BASE).toString(); }
  catch { return '/admin/teacher_att/options'; }
}
function _isIOS(){
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function _isSafari(){
  const ua = navigator.userAgent || '';
  return /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS|Android/i.test(ua);
}
function clearOptionsDiag(){
  if(!optionsDiagBox) return;
  optionsDiagBox.style.display = 'none';
  optionsDiagBox.className = 'diag';
  optionsDiagBox.textContent = '';
}
function setOptionsDiag(level, lines){
  if(!optionsDiagBox) return;
  optionsDiagBox.style.display = 'block';
  optionsDiagBox.className = `diag ${level === 'bad' ? 'diag--bad' : 'diag--warn'}`;
  optionsDiagBox.textContent = Array.isArray(lines) ? lines.join('\n') : String(lines || '');
}

function showOptionsSnapshot(opts, context){
  const periodItems = Array.isArray(opts?.period_options)
    ? opts.period_options
    : (Array.isArray(opts?.periods) ? opts.periods : []);

  const rooms = Array.isArray(opts?.rooms) ? opts.rooms : [];
  const advisorCount = Object.values(opts?.advisors_by_period || {})
    .reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
  const lunchAdvisorCount = Object.values(opts?.lunch_advisors_by_period || {})
    .reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);

  const roomLikeTotal = rooms.length + advisorCount + lunchAdvisorCount;

  // Only show warning when options are suspiciously empty.
  if (periodItems.length === 0 || roomLikeTotal === 0) {
    const apiOrigin = _apiOrigin();
    const sameOrigin = (apiOrigin === location.origin);

    setOptionsDiag('warn', [
      `⚠️ Dropdown options diagnostics (${context})`,
      `Time: ${new Date().toLocaleString()}`,
      `Endpoint: ${_optionsEndpoint()}`,
      `Periods: ${periodItems.length}`,
      `Rooms: ${rooms.length}`,
      `Advisor options: ${advisorCount}`,
      `Lunch-advisor options: ${lunchAdvisorCount}`,
      `Page origin: ${location.origin}`,
      `API origin: ${apiOrigin}`,
      `Same origin: ${sameOrigin ? 'yes' : 'no'}`,
      `iOS: ${_isIOS() ? 'yes' : 'no'} | Safari: ${_isSafari() ? 'yes' : 'no'}`,
      `Hint: Empty options + cross-origin often means cookie/session issues on iOS Safari.`
    ]);
  } else {
    clearOptionsDiag();
  }
}

function showOptionsError(err, context){
  const d = err?.diag || {};
  const apiOrigin = d.apiOrigin || _apiOrigin();
  const sameOrigin = (typeof d.sameOrigin === 'boolean') ? d.sameOrigin : (apiOrigin === location.origin);
  const statusLabel = d.status
    ? `${d.status}${d.statusText ? ` ${d.statusText}` : ''}`
    : 'network/cors';

  const lines = [
    `❌ Dropdown options diagnostics (${context})`,
    `Time: ${new Date().toLocaleString()}`,
    `Endpoint: ${d.endpoint || _optionsEndpoint()}`,
    `Result: ${statusLabel}`,
    `Message: ${err?.message || 'Unknown error'}`,
    `Page origin: ${location.origin}`,
    `API origin: ${apiOrigin}`,
    `Same origin: ${sameOrigin ? 'yes' : 'no'}`,
    `iOS: ${_isIOS() ? 'yes' : 'no'} | Safari: ${_isSafari() ? 'yes' : 'no'}`
  ];

  if (!sameOrigin) {
    lines.push('Hint: Cross-site cookie auth can fail on iOS Safari.');
  }
  if (d.bodySnippet) {
    lines.push(`Response snippet: ${d.bodySnippet}`);
  }

  setOptionsDiag('bad', lines);
}

let lastRefreshTs = 0;
let lastMergedRows = []; // for CSV button

/******************** Bulk selection + apply ********************/
let SELECTED_OSIS = new Set();
let CURRENT_OSIS_LIST = [];         // [osis,...] for current rendered view
let ROW_UI = new Map();             // osis -> { rowEl, cbEl, selEl, outInBtn }
let ROW_DATA = new Map();           // osis -> row record object

// (legacy secret-menu block removed; using initSecretMenu/SECRET_MENU only)

function countChanges(){
  return (lastMergedRows || [])
    .filter(r => (String(r.chosen||'A').toUpperCase() !== String(r.baseline||'A').toUpperCase()))
    .length;
}

function updateSubmitButtons(){
  const n = countChanges();
  const label = n ? `Submit changes (${n})` : 'Submit changes';

  if (submitBtn){
    submitBtn.disabled = n === 0;
    submitBtn.textContent = label;
  }
  if (submitBtnBottom){
    submitBtnBottom.disabled = n === 0;
    submitBtnBottom.textContent = label;
  }
}

function updateBulkUI(){
  const n = SELECTED_OSIS.size;

  if (bulkSelectedCountEl){
    bulkSelectedCountEl.textContent = `${n} selected`;
  }
  if (bulkCodeSelect){
    // only allow staging when something is selected
    bulkCodeSelect.disabled = (n === 0);

    // if nothing selected, force dropdown back to "Unselected…"
    if (n === 0) bulkCodeSelect.value = '';
  }

  if (selectAllCb){
    const total = CURRENT_OSIS_LIST.length;
    if (!total){
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    } else {
      selectAllCb.checked = (n === total);
      selectAllCb.indeterminate = (n > 0 && n < total);
    }
  }
}

function clearSelection(){
  SELECTED_OSIS.clear();
  for (const osis of CURRENT_OSIS_LIST){
    const ui = ROW_UI.get(osis);
    if (ui?.cbEl) ui.cbEl.checked = false;
  }
  updateBulkUI();

  // persist for this view
  const date = dateText.textContent || '';
  const picked = normRoom(roomInput.value);
  const periodLocal = normPeriod(periodInput.value);
  const room = normRoom(resolveRoomForApi(periodLocal, picked));
  saveSelection(date, room, periodLocal, SELECTED_OSIS);
}

function stageBulkCodeToSelected(){
  setErr('');

  const picked = normRoom(roomInput.value);
  const periodLocal = normPeriod(periodInput.value);
  const room = normRoom(resolveRoomForApi(periodLocal, picked));
  const date = dateText.textContent || '';

  const codeLetter = String(bulkCodeSelect?.value || '').trim().toUpperCase();
  const osisList = Array.from(SELECTED_OSIS);

  // Require an explicit bulk choice
  if (!codeLetter) return;

  if (!osisList.length){
    setErr('Select one or more students first.');
    // reset dropdown back to Unselected so it doesn’t look “applied”
    if (bulkCodeSelect) bulkCodeSelect.value = '';
    return;
  }

  if (!room || !periodLocal){
    setErr('Room + Period are required.');
    if (bulkCodeSelect) bulkCodeSelect.value = '';
    return;
  }

  if (!['P','L','A'].includes(codeLetter)){
    setErr('Pick an attendance code (P/L/A).');
    if (bulkCodeSelect) bulkCodeSelect.value = '';
    return;
  }

  // Update local state + UI (same style as individual dropdown changes)
  const overrides = loadOverrides(date, room, periodLocal);

  for (const osis of osisList){
    const r = ROW_DATA.get(osis);
    const ui = ROW_UI.get(osis);
    if (!r || !ui) continue;

    r.chosen = codeLetter;

    if (ui.selEl){
      ui.selEl.value = codeLetter;
      ui.selEl.className = 'codeSelect codeSelect--' + codeLetter;
    }

    const mismatch = !!r._mismatch;
    const changed  = (String(r.chosen||'A') !== String(r.baseline||'A'));

    if (ui.rowEl){
      ui.rowEl.className =
        'row' + (mismatch ? ' row--mismatch' : '') + (changed ? ' row--changed' : '');
    }

    // Save locally as “only if changed”, otherwise clear
    if (changed) overrides[osis] = codeLetter;
    else delete overrides[osis];

    // Enable Out/In only if Present or Late
    if (ui.outInBtn){
      const codeIsPL = (codeLetter === 'P' || codeLetter === 'L');
      const hasFirstIn = hasSessionFirstIn(osis);
      const blocked = zoneBlocksOutIn(r?.zone);
      const canToggle = codeIsPL && hasFirstIn && !blocked;
      ui.outInBtn.disabled = !canToggle;
      ui.outInBtn.title = canToggle
        ? (ui.outInBtn.dataset.toggleTitle || 'Toggle Out/In')
        : (blocked
            ? 'Disabled while student is With Staff'
            : (!codeIsPL
                ? 'Mark Present (P) or Late (L) to enable Out/In'
                : 'Needs first scan into the room (kiosk scan or Submit as Present/Late)'));
    }
  }

  saveOverrides(date, room, periodLocal, overrides);

  // IMPORTANT: Submit changes remains the only thing that writes to Worker + logs.
  updateSubmitButtons();
  renderOutInOrganizer();

  // Force deliberate next choice
  if (bulkCodeSelect) bulkCodeSelect.value = '';

  setStatus(true, `Staged ${osisList.length} student(s) as ${codeLabel(codeLetter)} — click Submit changes.`);
  updateBulkUI();
  // After staging bulk changes, clear selection so checkboxes uncheck
  clearSelection();        // clears SELECTED_OSIS, unchecks row checkboxes, persists selection
  if (bulkCodeSelect) bulkCodeSelect.value = '';  // back to "Unselected…"
}
/******************** End bulk selection ********************/


function tickRefreshLabel(){
  if(!lastRefreshTs){
    refreshText.textContent = 'Never';
    return;
  }
  const diffSec = Math.round((Date.now()-lastRefreshTs)/1000);
  refreshText.textContent = `Refreshed ${diffSec}s ago`;
}

async function fetchRosterSnapshotMap(){
  const r = await adminFetch('/admin/hallway_state', { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) {
    const extra = data?.message ? ` — ${data.message}` : '';
    throw new Error((data?.error || `hallway_state HTTP ${r.status}`) + extra);
  }

  // Build osis->student record map
  // hallway_state groups; safest is to walk all arrays we can find
  const map = new Map();

  const byLoc = data.by_location || {};
  for(const arr of Object.values(byLoc)){
    if(!Array.isArray(arr)) continue;
    for(const s of arr){
      const osis = String(s?.osis || '').trim();
      if(!osis) continue;
      map.set(osis, s);
    }
  }

  // Also: sometimes a flat list exists; keep it if present
  if(Array.isArray(data.rows)){
    for(const s of data.rows){
      const osis = String(s?.osis || '').trim();
      if(!osis) continue;
      if(!map.has(osis)) map.set(osis, s);
    }
  }

  return { date: data.date, map };
}

async function fetchPreview(room, period, whenType, opts = {}){
  const u = new URL('/admin/meeting/preview', API_BASE);
  u.searchParams.set('room', room);
  u.searchParams.set('period', period);
  u.searchParams.set('when', whenType);

  if (opts.fresh) u.searchParams.set('fresh', '1');
  if (opts.date) u.searchParams.set('date', String(opts.date));
  if (opts.forceCompute) u.searchParams.set('force_compute', '1');
  if (opts.ignoreOverrides) u.searchParams.set('ignore_overrides', '1');
  if (opts.advisor) u.searchParams.set('advisor', String(opts.advisor));

  const r = await adminFetch(u, { method:'GET' });
  const data = await r.json().catch(()=>null);
  if(!r.ok || !data?.ok) {
    const extra = data?.message ? ` — ${data.message}` : '';
    throw new Error((data?.error || `meeting/preview HTTP ${r.status}`) + extra);
  }
  return data;
}
function renderRows({ date, room, period, whenType, snapshotRows, computedRows, snapshotMap, sessionState }){
  rowsEl.innerHTML = '';
  lastMergedRows = [];
  // keep secret menu state across refresh
  renderSecretMenu();

  // reset selection + per-row element refs
  ROW_UI = new Map();
  ROW_DATA = new Map();
  CURRENT_OSIS_LIST = [];
  // restore selection for this view (survives auto-refresh)
  SELECTED_OSIS = loadSelection(date, room, period);
  updateBulkUI();

  // Only show Out/In for the current period (and only if current period is known)
  const cur = String(CURRENT_PERIOD_LOCAL || '').trim();
  const allowOutIn = !!cur && (String(period || '').trim() === cur);

  // Collapse the Out/In column + hide header when not allowed
  if (tableBox) tableBox.classList.toggle('noOutIn', !allowOutIn);
  if (outInHeader) outInHeader.style.display = allowOutIn ? '' : 'none';

  // Map rows by OSIS for stable snapshot + computed scan suggestion
  const snapBy = new Map();
  for (const r of (snapshotRows || [])){
    const osis = String(r?.osis || '').trim();
    if (!osis) continue;
    snapBy.set(osis, { codeLetter: String(r.codeLetter || '').trim().toUpperCase() || 'A' });
  }

  const compBy = new Map();
  for (const r of (computedRows || [])){
    const osis = String(r?.osis || '').trim();
    if (!osis) continue;
    compBy.set(osis, {
      codeLetter: String(r.codeLetter || '').trim().toUpperCase() || 'A',
      evidence: r.evidence || null
    });
  }

  // For “end”: if a final snapshot exists, that’s the baseline (what will be sent).
  // If no snapshot exists yet (current/unfinished period), baseline is the scan-computed suggestion.
  const haveSnapshot = snapBy.size > 0;

  const overrides = loadOverrides(date, room, period);

  // Union keys
  const allOsis = new Set([...snapBy.keys(), ...compBy.keys()]);
  const merged = [];
  for (const osis of allOsis){
    const snapRec = snapBy.get(osis) || null;
    const compRec = compBy.get(osis) || null;

    const snap = snapshotMap.get(osis) || null;
    const name = snap?.name || '(Unknown)';
    const zone = snap?.zone || '';
    const locLabel = snap?.locLabel || snap?.loc || '';

    const snapshotLetter = snapRec?.codeLetter || '';
    const scanSuggested  = compRec?.codeLetter || '';
    const evidence = compRec?.evidence || null;

    const scanTime = evidence?.lastISO || evidence?.firstISO || null;
    const scanStatus = evidence?.status || (scanSuggested === 'A' ? 'Absent' : '');
    const scanRoom = evidence?.room || '';

    const baseline = (haveSnapshot ? snapshotLetter : scanSuggested) || 'A';

    // UI “chosen” starts from baseline unless user previously tweaked locally
    const chosen = (overrides[osis] || baseline || 'A').toUpperCase();

    merged.push({
      osis,
      name,
      zone,
      locLabel,
      snapshotLetter,
      scanSuggested,
      baseline,
      chosen,
      scanTime,
      scanStatus,
      scanRoom
    });
  }

  // Sort by name then OSIS
  merged.sort((a,b) => {
    const an = String(a.name||'').toLowerCase();
    const bn = String(b.name||'').toLowerCase();
    if(an !== bn) return an.localeCompare(bn);
    return String(a.osis).localeCompare(String(b.osis));
  });

  // Bulk selection context for this view
  CURRENT_OSIS_LIST = merged.map(r => r.osis);
  // prune selection to what's visible now
  const visible = new Set(CURRENT_OSIS_LIST);
  let pruned = false;
  for (const osis of Array.from(SELECTED_OSIS)){
    if (!visible.has(osis)) { SELECTED_OSIS.delete(osis); pruned = true; }
  }
  if (pruned) saveSelection(date, room, period, SELECTED_OSIS);
  updateBulkUI();

  // helper: refresh Submit button state (global)
  // NOTE: updateSubmitButtons() uses lastMergedRows

  for(const r of merged){
    const mismatch = r.snapshotLetter && r.scanSuggested && (r.snapshotLetter !== r.scanSuggested);
    const changed  = (r.chosen || 'A') !== (r.baseline || 'A');

    const row = document.createElement('div');
    row.className = 'row' + (mismatch ? ' row--mismatch' : '') + (changed ? ' row--changed' : '');

    // stash mismatch flag for bulk updater
    r._mismatch = mismatch;

    // selection checkbox (left column)
    const c0 = document.createElement('div');
    c0.className = 'selCell';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = SELECTED_OSIS.has(r.osis);
    cb.addEventListener('change', () => {
      if (cb.checked) SELECTED_OSIS.add(r.osis);
      else SELECTED_OSIS.delete(r.osis);
      updateBulkUI();
      saveSelection(date, room, period, SELECTED_OSIS);
    });
    c0.appendChild(cb);

    let outInBtn = null; // set only if allowOutIn column is rendered

    const c1 = document.createElement('div');
    c1.className = 'name';

    const top = document.createElement('div');
    top.className = 'top';

    const student = document.createElement('div');
    student.className = 'student';
    student.textContent = r.name;
    student.addEventListener('click', (ev) => {
      openSecretMenuAtEvent(ev, {
        osis: r.osis,
        name: r.name,
        date,
        room,
        periodLocal: period
      });
    });

    // Optional right-click support too:
    student.addEventListener('contextmenu', (ev) => {
      openSecretMenuAtEvent(ev, {
        osis: r.osis,
        name: r.name,
        date,
        room,
        periodLocal: period
      });
    });

    const dot = document.createElement('span');
    dot.className = 'zoneDot ' + zoneToDotClass(r.zone);
    const label = r.zone ? String(r.zone).replace(/_/g,' ') : 'unknown';
    dot.title = label;
    dot.setAttribute('aria-label', label);

    top.appendChild(dot);      // ✅ shows on mobile (CSS)
    top.appendChild(student);

    if (r.zone) {
      const chip = document.createElement('span');
      chip.className = 'chip ' + zoneToChipClass(r.zone);
      chip.textContent = String(r.zone).replace(/_/g, ' ');
      top.appendChild(chip);   // ✅ shows on desktop (CSS)
    }

    const sub = document.createElement('div');
    sub.className = 'subline';

    // Normalize labels so "RM 112" / "Room 112" / "112" compare cleanly
    const normRoomKey = (s) => String(s || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')
      .replace(/^rm/, '')
      .replace(/^room/, '')
      .replace(/[^a-z0-9]/g, '');

    const selectedRoomKey = normRoomKey(room);

    // Only highlight wrong-room when viewing the CURRENT period (same rule as Out/In)
    const isCurrentPeriodView = allowOutIn;

    // Determine wrong-room: student is in class zone, has a locLabel, and it doesn't match selected room
    const studentRoomKey = normRoomKey(r.locLabel);
    const isWrongRoomNow =
      isCurrentPeriodView &&
      String(r.zone || '') === 'class' &&
      !!studentRoomKey &&
      !!selectedRoomKey &&
      (studentRoomKey !== selectedRoomKey);

    // Build subline as spans so we can style only the location part
    let added = false;
    const addSep = () => {
      if (added) sub.appendChild(document.createTextNode(' • '));
      added = true;
    };
    const addTextPart = (text, className) => {
      addSep();
      const span = document.createElement('span');
      if (className) span.className = className;
      span.textContent = text;
      sub.appendChild(span);
    };

    if (r.locLabel) {
      addTextPart(r.locLabel, isWrongRoomNow ? 'sublinePart--wrongRoom' : '');
    }

    if (r.scanRoom && r.scanRoom.toLowerCase() !== room.toLowerCase()) {
      addTextPart(`scan@${r.scanRoom}`, '');
    }

    if (mismatch) {
      addTextPart(`mismatch (scan:${codeLabel(r.scanSuggested)} vs snap:${codeLabel(r.snapshotLetter)})`, '');
    }

    if (!added) sub.textContent = '—';

    c1.appendChild(top);
    c1.appendChild(sub);

    const c2 = document.createElement('div');
    c2.className = 'mono muted hide-sm';
    c2.textContent = r.osis;

    const c3 = document.createElement('div');
    const sel = document.createElement('select');
    sel.className = 'codeSelect codeSelect--' + (r.chosen || 'A');
    for(const opt of ['P','L','A']){
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = codeLabel(opt);
      sel.appendChild(o);
    }
    sel.value = r.chosen || 'A';
    sel.title = `Baseline: ${codeLabel(r.baseline)} • Scan: ${codeLabel(r.scanSuggested)} • Snapshot: ${codeLabel(r.snapshotLetter)}`;

    sel.addEventListener('change', () => {
      r.chosen = String(sel.value || 'A').toUpperCase();

      // update color
      sel.className = 'codeSelect codeSelect--' + r.chosen;

      // Save locally as “only if changed”, otherwise clear
      const obj = loadOverrides(date, room, period);
      if (r.chosen !== (r.baseline || 'A')){
        obj[r.osis] = r.chosen;
      } else {
        delete obj[r.osis];
      }
      saveOverrides(date, room, period, obj);

      // Update row styles + submit state
      row.className = 'row' + (mismatch ? ' row--mismatch' : '') + ((r.chosen || 'A') !== (r.baseline || 'A') ? ' row--changed' : '');
      updateSubmitButtons();

      // Enable Out/In only if Present or Late AND first scan into room exists
      if (outInBtn){
        const codeIsPL = (r.chosen === 'P' || r.chosen === 'L');
        const hasFirstIn = hasSessionFirstIn(r.osis);
        const blocked = zoneBlocksOutIn(r.zone);
        const canToggle = codeIsPL && hasFirstIn && !blocked;
        outInBtn.disabled = !canToggle;
        if (canToggle) {
          outInBtn.title = outInBtn.dataset.toggleTitle || 'Toggle Out/In';
        } else {
          outInBtn.title = blocked
            ? 'Disabled while student is With Staff'
            : (!codeIsPL
                ? 'Mark Present (P) or Late (L) to enable Out/In'
                : 'Needs first scan into the room (kiosk scan or Submit as Present/Late)');
        }
      }
      renderOutInOrganizer();
    });

    c3.style.textAlign = 'center';
    c3.appendChild(sel);

    // store per-row refs for bulk actions
    const uiRef = { rowEl: row, cbEl: cb, selEl: sel, outInBtn: null };
    ROW_UI.set(r.osis, uiRef);
    ROW_DATA.set(r.osis, r);

    const c4 = document.createElement('div');
    c4.className = 'hide-sm';
    c4.textContent = r.scanTime ? fmtClock(r.scanTime) : '—';

    row.appendChild(c0);
    row.appendChild(c1);
    row.appendChild(c2);
    row.appendChild(c3);
    row.appendChild(c4);

    // Out/In only if selected period matches current period
    if (allowOutIn) {
      const c5 = document.createElement('div');
      c5.className = 'hide-sm';

      const sessRec = sessionState?.students ? sessionState.students[r.osis] : null;
      const isOut = !!(sessRec?.out && sessRec.out.isOut);
      const outSinceISO = sessRec?.out?.outSinceISO || null;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-mini ' + (isOut ? 'btn-in' : 'btn-out');
      btn.dataset.osis = String(r.osis || '').trim();
      btn.textContent = (isOut && outSinceISO) ? `IN ${elapsedFromISO(outSinceISO)}` : (isOut ? 'IN' : 'OUT');
      btn.title = (isOut && outSinceISO) ? `Out since ${outSinceISO}` : 'Toggle Out/In';

      // store "real" tooltip so we can restore after being disabled
      btn.dataset.toggleTitle = btn.title;

      // Enable Out/In only if Present or Late
      outInBtn = btn;
      try{ uiRef.outInBtn = btn; }catch{}
      const codeIsPL = (r.chosen === 'P' || r.chosen === 'L');
      const hasFirstIn = !!(sessRec && sessRec.firstInISO);
      const blocked = zoneBlocksOutIn(r.zone);
      const canToggleInitial = codeIsPL && hasFirstIn && !blocked;
      btn.disabled = !canToggleInitial;
      if (!canToggleInitial) {
        btn.title = blocked
          ? 'Disabled while student is With Staff'
          : (!codeIsPL
              ? 'Mark Present (P) or Late (L) to enable Out/In'
              : 'Needs first scan into the room (kiosk scan or Submit as Present/Late)');
      }

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try{
          const res = await toggleClassSessionOutIn({ date, room, periodLocal: period, osis: r.osis });
          if (!sessionState) sessionState = { ok:true, students:{} };
          if (!sessionState.students) sessionState.students = {};
          sessionState.students[r.osis] = sessionState.students[r.osis] || { osis: r.osis };
          sessionState.students[r.osis].out = sessionState.students[r.osis].out || {};
          sessionState.students[r.osis].out.isOut = !!res.isOut;
          if (res.isOut && res.outSinceISO) {
            sessionState.students[r.osis].out.outSinceISO = res.outSinceISO;
          } else {
            delete sessionState.students[r.osis].out.outSinceISO;
          }

          btn.className = 'btn btn-mini ' + (res.isOut ? 'btn-in' : 'btn-out');
          btn.textContent = outBtnLabelFor(r.osis);

          // refresh "real" tooltip
          btn.dataset.toggleTitle = (res.isOut && res.outSinceISO) ? `Out since ${res.outSinceISO}` : 'Toggle Out/In';
          btn.title = btn.dataset.toggleTitle;
          renderOutInOrganizer();
        } finally {
          // stay disabled unless Present/Late, first-in exists, and student is not With Staff
          const codeIsPL = (r.chosen === 'P' || r.chosen === 'L');
          const hasFirstInNow = !!(sessionState?.students?.[r.osis]?.firstInISO || sessRec?.firstInISO || hasSessionFirstIn(r.osis));
          const blocked = zoneBlocksOutIn(r.zone);
          const canToggleNow = codeIsPL && hasFirstInNow && !blocked;
          btn.disabled = !canToggleNow;
          if (!canToggleNow) {
            btn.title = blocked
              ? 'Disabled while student is With Staff'
              : (!codeIsPL
                  ? 'Mark Present (P) or Late (L) to enable Out/In'
                  : 'Needs first scan into the room (kiosk scan or Submit as Present/Late)');
          } else {
            btn.title = btn.dataset.toggleTitle || 'Toggle Out/In';
          }
        }
      });

      c5.appendChild(btn);
      row.appendChild(c5);
    }

    rowsEl.appendChild(row);
    lastMergedRows.push(r);
  }

  const roomDisplay =
    (isLunchAdvisorUiPeriod(period) && UI_LUNCH_ADVISOR_LABEL)
      ? (UI_LUNCH_ADVISOR_LABEL === room ? UI_LUNCH_ADVISOR_LABEL : `${UI_LUNCH_ADVISOR_LABEL} (${room})`)
      : room;

  subtitleRight.textContent =
    `${roomDisplay} • P${period} • ${whenType} • ${merged.length} students` +
    (haveSnapshot ? ' • (snapshot)' : ' • (live)') +
    (allowOutIn ? '' : ' • (Out/In hidden)');

  // cache last context for Organizer view
  LAST_CTX = { date, room, period };
  LAST_SESSION_STATE = sessionState || LAST_SESSION_STATE;

  tickOutElapsed();
  renderOutInOrganizer();

  updateBulkUI();
  updateSubmitButtons();
  renderSecretMenu();
}

async function submitChanges(){
  if (PAGE_MODE === 'after_school') return;
  setErr('');
  const picked = normRoom(roomInput.value);          // advisor label during lunch
  const periodLocal = normPeriod(periodInput.value);
  const room = normRoom(resolveRoomForApi(periodLocal, picked)); // real room for API
  const whenType = 'end';
  const date = dateText.textContent || '';

  if(!room || !periodLocal){
    setErr('Room + Period are required.');
    return;
  }

  // Only send rows whose CHOSEN differs from BASELINE
  const changes = (lastMergedRows || [])
    .filter(r => (String(r.chosen||'A').toUpperCase() !== String(r.baseline||'A').toUpperCase()))
    .map(r => ({ osis: String(r.osis), codeLetter: String(r.chosen||'A').toUpperCase() }));

  if (!changes.length){
    setErr('No changes to submit.');
    return;
  }

  if (submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }
  if (submitBtnBottom){ submitBtnBottom.disabled = true; submitBtnBottom.textContent = 'Submitting…'; }
  try{
    const r = await adminFetch('/admin/teacher_att/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date, room, periodLocal, whenType, changes })
    });

    const data = await r.json().catch(()=>null);
    if(!r.ok || !data?.ok){
      throw new Error(data?.error || `submit HTTP ${r.status}`);
    }

    // Clear local overrides for this bucket (they’ve been persisted server-side)
    saveOverrides(date, room, periodLocal, {});
    const msg =
      data?.deferred
        ? (data?.mode === 'past_pending_end'
            ? 'Saved. This will be included when the period-end snapshot runs.'
            : 'Saved. Will be included in the period-end snapshot.')
        : (data?.gas?.ok
            ? 'Saved. Updates sent (delta only).'
            : (data?.gas ? 'Saved, but GAS push failed.' : 'Saved.'));
    setStatus(true, msg);
    await refreshOnce();
  } finally {
    updateSubmitButtons();
  }
}

function shortZoneLabel(zone){
  const z = String(zone || '').trim();
  if (!z) return 'Unknown';
  if (z === 'off_campus') return 'Off Campus';
  if (z === 'with_staff') return 'With Staff';
  if (z === 'after_school') return 'After School';
  return z.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
}

function renderAfterSchoolRows({ date, homeRoomLabel, rows }){
  if (tableBox) tableBox.classList.add('afterSchoolMode');

  // header labels (3 cols: Student • Current • In/Out)
  if (thStudent) thStudent.textContent = 'Student';
  if (thCode) thCode.textContent = 'Current';
  if (outInHeader) outInHeader.textContent = 'In/Out';

  rowsEl.innerHTML = '';
  lastMergedRows = [];

  const list = Array.isArray(rows) ? rows : [];

  // Sort by name
  list.sort((a,b) => String(a?.name||'').localeCompare(String(b?.name||''), undefined, { sensitivity:'base' }));

  for (const r of list){
    const osis = String(r?.osis || '').trim();
    if (!osis) continue;

    const inRoom = !!r?.in_room;
    const zone = String(r?.zone || '').trim();
    const locLabel = String(r?.locLabel || r?.loc || '').trim();

    const row = document.createElement('div');
    row.className = 'row';

    // c1: Student block
    const c1 = document.createElement('div');
    c1.className = 'name';

    const top = document.createElement('div');
    top.className = 'top';

    const dot = document.createElement('span');
    dot.className = 'zoneDot ' + zoneToDotClass(zone);
    dot.title = shortZoneLabel(zone);
    dot.setAttribute('aria-label', shortZoneLabel(zone));

    const student = document.createElement('div');
    student.className = 'student';
    student.textContent = String(r?.name || '(Unknown)');

    top.appendChild(dot);
    top.appendChild(student);

    if (zone) {
      const chip = document.createElement('span');
      chip.className = 'chip ' + zoneToChipClass(zone);
      chip.textContent = String(zone).replace(/_/g, ' ');
      top.appendChild(chip);
    }

    const sub = document.createElement('div');
    sub.className = 'subline';
    const nowTxt = locLabel ? locLabel : shortZoneLabel(zone);
    sub.textContent = `${osis} • Now: ${nowTxt}`;

    c1.appendChild(top);
    c1.appendChild(sub);

    // c2: Current
    const c2 = document.createElement('div');
    c2.className = 'mono muted';
    c2.textContent = inRoom ? 'IN ROOM' : shortZoneLabel(zone);

    // c3: In/Out button
    const c3 = document.createElement('div');
    const btn = document.createElement('button');
    btn.type = 'button';

    const isOffCampus = (zone === 'off_campus');
    if (isOffCampus) {
      // Student scanned out at Front Entrance — keep listed under home room,
      // but don't allow teachers to override back to IN from the page.
      btn.className = 'btn btn-mini';
      btn.textContent = 'OFF';
      btn.title = 'Off Campus — student scanned out (Front Entrance)';
      btn.disabled = true;
    } else {
      btn.className = 'btn btn-mini ' + (inRoom ? 'btn-out' : 'btn-in');
      btn.textContent = inRoom ? 'OUT' : 'IN';
      btn.title = inRoom ? 'Send to Hallway' : 'Bring back into the room';

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try{
          await afterSchoolToggle({ date, homeRoomLabel, osis, to: inRoom ? 'out' : 'in' });
        }catch(e){
          setErr(e?.message || String(e));
          setStatus(false, 'Error');
        }finally{
          // Re-pull so we reflect real scans (bathroom, off-campus, etc.)
          if (window.__refreshing) return;
          window.__refreshing = true;
          refreshOnce().catch(()=>{}).finally(() => (window.__refreshing = false));
        }
      });
    }

    c3.appendChild(btn);

    row.appendChild(c1);
    row.appendChild(c2);
    row.appendChild(c3);
    rowsEl.appendChild(row);
  }

  subtitleRight.textContent = `${String(homeRoomLabel || '').trim()} • After School • ${list.length} students`;
  dateText.textContent = date || '—';
}

async function refreshClassOnce(){
  setErr('');
  const picked = normRoom(roomInput.value); // advisor label during lunch
  const period = normPeriod(periodInput.value);
  const room = normRoom(resolveRoomForApi(period, picked)); // real room for API
  const whenType = 'end';

  if(!room || !period){
    setErr('Room + Period are required.');
    return;
  }

  lastRefreshTs = Date.now();
  tickRefreshLabel();
  setStatus(true, 'Loading…');

  // For lunch advisor views, pass the advisor label so the Worker can filter students correctly
  const advisor = UI_LUNCH_ADVISOR_LABEL ? String(UI_LUNCH_ADVISOR_LABEL).trim() : '';

  const [snap, snapView, computed] = await Promise.all([
    fetchRosterSnapshotMap(),
    fetchPreview(room, period, whenType, { forceCompute:false, advisor }),
    fetchPreview(room, period, whenType, { forceCompute:true, ignoreOverrides:true, advisor })
  ]);

  const date = (snap && snap.date) || (snapView && snapView.date) || (computed && computed.date) || '—';
  dateText.textContent = date;

  let sessionState = null;
  try{
    sessionState = await fetchClassSessionState(date, room, period);
  }catch(_){
    sessionState = null;
  }

  // ensure normal layout class
  if (tableBox) tableBox.classList.remove('afterSchoolMode');

  renderRows({
    date,
    room,
    period,
    whenType,
    snapshotRows: Array.isArray(snapView?.rows) ? snapView.rows : [],
    computedRows: Array.isArray(computed?.rows) ? computed.rows : [],
    snapshotMap: (snap && snap.map) ? snap.map : new Map(),
    sessionState
  });

  setStatus(true, 'Live');
}

async function refreshAfterSchoolOnce(){
  setErr('');
  const homeRoomLabel = normRoom(roomInput.value);
  if (!homeRoomLabel){
    setErr('Room is required.');
    return;
  }

  lastRefreshTs = Date.now();
  tickRefreshLabel();
  setStatus(true, 'Loading…');

  const data = await fetchAfterSchoolRoom(homeRoomLabel);
  const date = String(data?.date || '').trim();
  renderAfterSchoolRows({ date, homeRoomLabel, rows: (data?.students || data?.rows || []) });
  setStatus(true, 'Live');
}

async function refreshOnce(){
  if (PAGE_MODE === 'after_school') return refreshAfterSchoolOnce();
  return refreshClassOnce();
}

document.addEventListener('visibilitychange', () => {
  if (!IS_AUTHED) return;
  if (document.hidden) stopAutoRefresh();
  else startAutoRefresh();
});

let CURRENT_PERIOD_TIMER = null;

function renderCurrentPeriod(opts){
  if(!currentPeriodText) return;

  const cur = String(opts?.current_period_local || '').trim();
  CURRENT_PERIOD_LOCAL = cur;
  if(!cur){
    currentPeriodText.textContent = 'Current: —';
    return;
  }

  // If Worker provides pretty labels (e.g., "4 (10:48 AM - 11:42 AM)"), use them
  let label = cur;
  const po = opts?.period_options;
  if(Array.isArray(po)){
    const found = po.find(x => String(x?.value) === cur);
    if(found?.label) label = String(found.label);
  }

  currentPeriodText.textContent = `Current: ${label}`;
}

function startCurrentPeriodTicker(){
  if(CURRENT_PERIOD_TIMER) return;

  // Update periodically so it stays correct as periods change
  CURRENT_PERIOD_TIMER = setInterval(async () => {
    if(!IS_AUTHED) return;
    try{
      const opts = await fetchTeacherOptions();
      renderCurrentPeriod(opts);
    }catch(_){}

    // Keep after-school eligibility + button in sync as the schedule shifts
    try{ await refreshAfterSchoolEligibility(); }catch(_){}
  }, 60000);
}

async function bootTeacherAttendance(){
  initThemeToggle();
  initViewToggle();
  initSecretMenu();
  startOutElapsedTicker();
  // Secret console API is registered by initSecretMenu()

  // Restore mode preference (will only activate after-school if Worker says we're in that window)
  PAGE_MODE = getStoredMode();

  // Prefill from URL (?room=316&period=3) or localStorage
  const p = qs();
  const roomQ = (PAGE_MODE === 'after_school')
    ? (
        p.get('room') ||
        sessionStorage.getItem(AS_ROOM_KEY) ||
        localStorage.getItem(AS_ROOM_KEY) ||
        ''
      )
    : (
        p.get('room') ||
        sessionStorage.getItem('teacher_att_room') ||
        localStorage.getItem('teacher_att_room') ||
        ''
      );

  const perQ  = (PAGE_MODE === 'after_school')
    ? ''
    : (
        p.get('period') ||
        sessionStorage.getItem('teacher_att_period') ||
        localStorage.getItem('teacher_att_period') ||
        ''
      );
  roomInput.value = roomQ;
  periodInput.value = perQ;

  // Keep last non-empty room/period across browser reload (Cmd+R / Ctrl+R)
  window.addEventListener('beforeunload', () => {
    try{
      const r = String(roomInput?.value || '').trim();
      const p = String(periodInput?.value || '').trim();
      if (PAGE_MODE === 'after_school') {
        if (r) sessionStorage.setItem(AS_ROOM_KEY, r);
      } else {
        if (r) sessionStorage.setItem('teacher_att_room', r);
        if (p) sessionStorage.setItem('teacher_att_period', p);
      }
    }catch{}
  });

  // Teachers always operate on END
  localStorage.removeItem('teacher_att_when');

  roomInput.addEventListener('change', (ev) => {
    const v = roomInput.value.trim();
    try {
      if (PAGE_MODE === 'after_school') localStorage.setItem(AS_ROOM_KEY, v);
      else localStorage.setItem('teacher_att_room', v);
    } catch {}

    // Auto-refresh on real user pick only, and only if changed
    if (ev?.isTrusted && v !== LAST_UI_PICK.room) {
      LAST_UI_PICK.room = v;
      scheduleUserPickRefresh();
    }
  });

  periodInput.addEventListener('change', (ev) => {
    if (PAGE_MODE === 'after_school') return;
    const v = periodInput.value.trim();
    localStorage.setItem('teacher_att_period', v);

    // Period can change advisor-mode room list; update rooms first
    if (TEACHER_OPTS_CACHE) applyRoomDropdownFromOpts(TEACHER_OPTS_CACHE);

    // Auto-refresh on real user pick only, and only if changed
    if (ev?.isTrusted && v !== LAST_UI_PICK.period) {
      LAST_UI_PICK.period = v;
      scheduleUserPickRefresh();
    }
  });

  afterSchoolBtn?.addEventListener('click', () => {
    if (!AFTER_SCHOOL_ELIGIBLE) return;
    const go = (PAGE_MODE === 'after_school') ? exitAfterSchoolMode : enterAfterSchoolMode;
    go().catch(err => {
      console.error(err);
      setErr(err?.message || String(err));
      setStatus(false, 'Error');
    });
  });

  refreshBtn.addEventListener('click', () => refreshOnce().catch(err => {
    console.error(err);
    setErr(err?.message || String(err));
    setStatus(false, 'Error');
  }));

  

  submitBtn?.addEventListener('click', () => submitChanges().catch(err => {
    console.error(err);
    setErr(err?.message || String(err));
    setStatus(false, 'Error');
  }));


  submitBtnBottom?.addEventListener('click', () => submitChanges().catch(err => {
    console.error(err);
    setErr(err?.message || String(err));
    setStatus(false, 'Error');
    updateSubmitButtons();
  }));

  bulkCodeSelect?.addEventListener('change', (ev) => {
    // Only on real user changes (avoid programmatic resets)
    if (ev && ev.isTrusted === false) return;
    stageBulkCodeToSelected();
  });

  selectAllCb?.addEventListener('change', () => {
    const on = !!selectAllCb.checked;
    if (!on) {
      SELECTED_OSIS.clear();
      for (const osis of CURRENT_OSIS_LIST){
        const ui = ROW_UI.get(osis);
        if (ui?.cbEl) ui.cbEl.checked = false;
      }
    } else {
      SELECTED_OSIS = new Set(CURRENT_OSIS_LIST);
      for (const osis of CURRENT_OSIS_LIST){
        const ui = ROW_UI.get(osis);
        if (ui?.cbEl) ui.cbEl.checked = true;
      }
    }
    updateBulkUI();
    // persist selection for this view
    saveSelection(
      dateText.textContent || '',
      normRoom(roomInput.value),
      normPeriod(periodInput.value),
      SELECTED_OSIS
    );
  });

  try{
    const r = await adminFetch('/admin/session/check', { method:'GET' });
    const data = await r.json().catch(()=>({}));
    if (data?.sid) setStoredAdminSessionSid(String(data.sid));
    if(!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);

    hide(loginCard);
    show(appShell);
    IS_AUTHED = true;
    setStatus(true, 'Live');
    // Populate dropdowns (PeriodLocal + Class Rooms)
    try{
      const opts = await fetchTeacherOptions();
      TEACHER_OPTS_CACHE = opts;

      // Always show current period in the header pill
      renderCurrentPeriod(opts);
      startCurrentPeriodTicker();

      const savedRoom =
        sessionStorage.getItem('teacher_att_room') ||
        localStorage.getItem('teacher_att_room') ||
        '';

      const savedPeriod =
        sessionStorage.getItem('teacher_att_period') ||
        localStorage.getItem('teacher_att_period') ||
        '';

      // Prefer URL params if present, otherwise prefer Worker current period, otherwise fall back
      const urlRoom   = (qs().get('room')   || '').trim();
      const urlPeriod = (qs().get('period') || '').trim();

      const preferredRoom   = urlRoom || savedRoom || '';
      const preferredPeriod =
        urlPeriod ||
        savedPeriod ||
        String(opts.current_period_local || '').trim() ||
        '';

      // Support period labels with time ranges if provided by Worker
      const periodItems = Array.isArray(opts.period_options) ? opts.period_options : (opts.periods || []);

      fillSelect(periodInput, periodItems, 'Select period…', preferredPeriod);
      applyRoomDropdownFromOpts(opts, preferredRoom);
      showOptionsSnapshot(opts, 'boot');

      LAST_UI_PICK.room = roomInput.value.trim();
      LAST_UI_PICK.period = periodInput.value.trim();

      // After-school eligibility (button only shows during the after-school window)
      await refreshAfterSchoolEligibility();

      // If the user last used after-school view and it's currently available, enter it now
      if (PAGE_MODE === 'after_school' && AFTER_SCHOOL_ELIGIBLE) {
        await enterAfterSchoolMode();
      } else {
        PAGE_MODE = 'class';
        applyModeUI();
      }
    }catch(e){
      console.warn('options load failed', e);
      showOptionsError(e, 'boot');
    }


    startAutoRefresh();

    // Auto-refresh once if selections are already picked
    if (PAGE_MODE === 'after_school') {
      if (roomInput.value.trim()) await refreshOnce();
    } else {
      if(roomInput.value.trim() && periodInput.value.trim()) await refreshOnce();
    }
  }catch(e){
    clearStoredAdminSessionSid();
    // Need login
    hide(appShell);
    show(loginCard);

    try{
      if(!GOOGLE_CLIENT_ID){
        loginOut.textContent = 'Missing google-client-id meta.';
        return;
      }
      const gsi = await waitForGoogle();
      gsi.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onGoogleCredential,
        ux_mode: 'popup',
        use_fedcm_for_prompt: true
      });
      gsi.renderButton(document.getElementById('g_id_signin'), { theme:'outline', size:'large' });
      loginOut.textContent = '—';
    }catch(err){
      loginOut.textContent = `Google init failed: ${err?.message || err}`;
    }
  }

  setInterval(tickRefreshLabel, 1000);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => bootTeacherAttendance().catch(console.error));
} else {
  bootTeacherAttendance().catch(console.error);
}

let LAST_UI_PICK = { room: '', period: '' };
let _pickRefreshT = null;

function scheduleUserPickRefresh(){
  if (_pickRefreshT) clearTimeout(_pickRefreshT);
  _pickRefreshT = setTimeout(() => {
    const room = normRoom(roomInput?.value);
    const period = normPeriod(periodInput?.value);
    if (!room) return;
    if (PAGE_MODE !== 'after_school' && !period) return;

    if (window.__refreshing) return;
    window.__refreshing = true;

    refreshOnce()
      .catch(err => {
        console.error(err);
        setErr(err?.message || String(err));
        setStatus(false, 'Error');
      })
      .finally(() => (window.__refreshing = false));
  }, 50);
}

let autoTimer = null;

function startAutoRefresh() {
  stopAutoRefresh();
  autoTimer = setInterval(() => {
    // Keep secret popup open until user acts/clicks away
    if (isSecretEnabled() && SECRET_MENU.open) {
      renderSecretMenu();
      return;
    }

    // don’t overlap requests
    if (window.__refreshing) return;
    window.__refreshing = true;
    refreshOnce()
      .catch(err => {
        console.error(err);
        setStatus(false, 'Auto-refresh error');
      })
      .finally(() => (window.__refreshing = false));
  }, 7000); // 7s is a good default
}

function stopAutoRefresh() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

async function onGoogleCredential(resp){
  try{
    loginOut.textContent = 'Signing in...';

    const r = await adminFetch('/admin/session/login_google', {
      method:'POST',
      headers:{ 'content-type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ id_token: resp.credential }).toString()
    });

    const data = await r.json().catch(()=>({}));

    // IMPORTANT: read from r (fetch response), not resp (google callback payload)
    const sidFromHeader = (r.headers.get("x-admin-session") || r.headers.get("X-Admin-Session") || "").trim();
    const sidFromBody = typeof data?.sid === "string" ? data.sid.trim() : "";

    if (sidFromBody) {
      setStoredAdminSessionSid(sidFromBody);
    } else if (sidFromHeader) {
      setStoredAdminSessionSid(sidFromHeader);
    }

    window.__TA_LAST_LOGIN_DIAG = {
      status: r.status,
      sidFromHeader: !!sidFromHeader,
      sidFromBody: !!sidFromBody,
      expose: r.headers.get("access-control-expose-headers") || ""
    };

    if(!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);

    hide(loginCard);
    show(appShell);
    setStatus(true, 'Live');
    IS_AUTHED = true;

    // ✅ NOW populate period + room immediately (same logic as bootTeacherAttendance)
    try{
      // tiny yield helps some browsers commit Set-Cookie before the next fetch
      await new Promise(res => setTimeout(res, 0));

      // small retry (handles rare cookie race / transient fetch hiccup)
      let opts = null;
      for(let i=0;i<3;i++){
        try{
          opts = await fetchTeacherOptions();
          break;
        }catch(e){
          if(i===2) throw e;
          await new Promise(res => setTimeout(res, 200*(i+1)));
        }
      }

      TEACHER_OPTS_CACHE = opts;

      // Current period pill
      renderCurrentPeriod(opts);
      startCurrentPeriodTicker();

      const savedRoom =
        sessionStorage.getItem('teacher_att_room') ||
        localStorage.getItem('teacher_att_room') ||
        '';

      const savedPeriod =
        sessionStorage.getItem('teacher_att_period') ||
        localStorage.getItem('teacher_att_period') ||
        '';

      const q = new URLSearchParams(location.search);
      const urlRoom   = (q.get('room') || '').trim();
      const urlPeriod = (q.get('period') || '').trim();

      const preferredRoom = urlRoom || savedRoom || '';
      const preferredPeriod =
        urlPeriod ||
        savedPeriod ||
        String(opts.current_period_local || '').trim() ||
        '';

      const periodItems = Array.isArray(opts.period_options) ? opts.period_options : (opts.periods || []);

      fillSelect(periodInput, periodItems, 'Select period…', preferredPeriod);
      applyRoomDropdownFromOpts(opts, preferredRoom);
      showOptionsSnapshot(opts, 'post-login');

      LAST_UI_PICK.room = roomInput.value.trim();
      LAST_UI_PICK.period = periodInput.value.trim();

      // persist + trigger any dependent UI logic
      try{ periodInput.dispatchEvent(new Event('change')); }catch{}
      try{ roomInput.dispatchEvent(new Event('change')); }catch{}
    }catch(e){
      console.warn('options load failed', e);
      showOptionsError(e, 'post-login');
    }

    startAutoRefresh();

    // Auto-refresh once if room+period are set
    if(roomInput.value.trim() && periodInput.value.trim()){
      await refreshOnce();
    }
  }catch(e){
    hide(appShell);
    show(loginCard);
    loginOut.textContent = `Login failed: ${e?.message || e}`;
  }
}
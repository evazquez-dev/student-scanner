(() => {
  'use strict';

  const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') + '/';
  const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
  const KIOSK_CREDENTIAL_KEY = 'eaglenest_phone_kiosk_credential_v1';
  const KIOSK_DEVICE_KEY = 'eaglenest_phone_kiosk_device_v1';
  const ADMIN_SESSION_KEYS = ['ss_admin_session_sid_v1', 'teacher_att_admin_session_v1'];
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const HOLD_MS = 1250;

  const $ = (id) => document.getElementById(id);
  const setupScreen = $('setupScreen');
  const selectScreen = $('selectScreen');
  const messageScreen = $('messageScreen');
  const flowScreen = $('flowScreen');
  const successScreen = $('successScreen');
  const studentSearch = $('studentSearch');
  const studentSelect = $('studentSelect');
  const continueBtn = $('continueBtn');
  const confirmBtn = $('confirmBtn');
  const confirmText = $('confirmText');
  const holdProgress = $('holdProgress');

  let ALL = [];
  let CURRENT = null;
  let resetTimer = null;
  let holdTimer = null;
  let holdStartedAt = 0;
  let busy = false;

  function show(screen) {
    [setupScreen, selectScreen, messageScreen, flowScreen, successScreen].forEach((el) => {
      if (el) el.hidden = el !== screen;
    });
  }

  function setStatus(el, text, kind = '') {
    if (!el) return;
    el.textContent = text || '';
    el.className = `status${kind ? ` ${kind}` : ''}`;
  }

  function clearResetTimer() {
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = null;
  }

  function scheduleReset(ms = 7000) {
    clearResetTimer();
    resetTimer = setTimeout(resetKiosk, ms);
  }

  function credential() {
    try { return String(localStorage.getItem(KIOSK_CREDENTIAL_KEY) || '').trim(); } catch { return ''; }
  }

  function setCredential(value) {
    try {
      if (value) localStorage.setItem(KIOSK_CREDENTIAL_KEY, String(value));
      else localStorage.removeItem(KIOSK_CREDENTIAL_KEY);
    } catch {}
  }

  function setDevice(device) {
    try {
      if (device) localStorage.setItem(KIOSK_DEVICE_KEY, JSON.stringify(device));
      else localStorage.removeItem(KIOSK_DEVICE_KEY);
    } catch {}
  }

  function storedDevice() {
    try { return JSON.parse(localStorage.getItem(KIOSK_DEVICE_KEY) || 'null'); } catch { return null; }
  }

  function getStoredAdminSessionSid() {
    try {
      for (const key of ADMIN_SESSION_KEYS) {
        const value = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
        if (value) return value;
      }
    } catch {}
    return '';
  }

  function setStoredAdminSessionSid(value) {
    const sid = String(value || '').trim();
    for (const key of ADMIN_SESSION_KEYS) {
      try {
        if (sid) sessionStorage.setItem(key, sid);
        else sessionStorage.removeItem(key);
      } catch {}
      try {
        if (sid) localStorage.setItem(key, sid);
        else localStorage.removeItem(key);
      } catch {}
    }
  }

  function stashAdminSession(resp) {
    try {
      const sid = String(resp?.headers?.get(ADMIN_SESSION_HEADER) || resp?.headers?.get('X-Admin-Session') || '').trim();
      if (sid) setStoredAdminSessionSid(sid);
    } catch {}
  }

  async function adminFetch(path, init = {}) {
    const headers = new Headers(init.headers || {});
    const sid = getStoredAdminSessionSid();
    if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
    const resp = await fetch(new URL(path, API_BASE), { ...init, headers, credentials: 'include', cache: 'no-store' });
    stashAdminSession(resp);
    return resp;
  }

  async function kioskApi(path, init = {}) {
    const headers = new Headers(init.headers || {});
    const token = credential();
    if (token) headers.set('x-phone-kiosk', token);
    if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const resp = await fetch(new URL(path, API_BASE), {
      method: init.method || 'GET',
      headers,
      body: init.body === undefined ? undefined : (typeof init.body === 'string' ? init.body : JSON.stringify(init.body)),
      cache: 'no-store'
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 401 || resp.status === 403) {
      setCredential('');
      setDevice(null);
    }
    if (!resp.ok || !data?.ok) {
      const error = new Error(data?.error || `HTTP ${resp.status}`);
      error.status = resp.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function studentLabel(student) {
    const grade = student?.grade ? `Grade ${student.grade}` : 'Grade —';
    const suffix = String(student?.osis || '').slice(-4);
    return `${student?.name || 'Unnamed student'} — ${grade} — •${suffix}`;
  }

  function fillStudents(query = '') {
    const q = String(query || '').trim().toLowerCase();
    const current = studentSelect.value;
    const filtered = q
      ? ALL.filter((student) => `${student.name} ${student.osis} ${student.grade}`.toLowerCase().includes(q))
      : ALL;
    studentSelect.innerHTML = '<option value="">Select your name…</option>';
    for (const student of filtered) {
      const option = document.createElement('option');
      option.value = String(student.osis || '');
      option.textContent = studentLabel(student);
      studentSelect.appendChild(option);
    }
    if (filtered.some((student) => String(student.osis) === current)) studentSelect.value = current;
    continueBtn.disabled = !studentSelect.value;
  }

  function lockerText(locker = {}) {
    const color = String(locker.color || '').trim();
    const number = String(locker.number || '').trim();
    if (color && number) return `${color} #${number}`;
    if (color) return color;
    if (number) return `#${number}`;
    return 'Not assigned';
  }

  async function loadKiosk() {
    if (!credential()) {
      showSetup();
      return;
    }
    try {
      const data = await kioskApi('/phone-kiosk/options');
      ALL = Array.isArray(data.students) ? data.students : [];
      const device = storedDevice();
      $('devicePill').textContent = device?.label ? device.label : 'Paired';
      fillStudents('');
      resetKiosk();
    } catch (error) {
      if ([401, 403].includes(Number(error?.status || 0))) showSetup();
      else {
        show(selectScreen);
        setStatus($('selectStatus'), `Unable to load kiosk: ${error?.message || error}`);
      }
    }
  }

  function resetKiosk() {
    clearResetTimer();
    CURRENT = null;
    busy = false;
    cancelHold();
    studentSearch.value = '';
    if (ALL.length) fillStudents('');
    studentSelect.value = '';
    continueBtn.disabled = true;
    setStatus($('selectStatus'), '');
    setStatus($('flowStatus'), '');
    show(selectScreen);
    setTimeout(() => studentSearch.focus(), 150);
  }

  function showNoRequest(student) {
    $('messageEmoji').textContent = '🤨';
    $('messageTitle').textContent = 'No phone request';
    $('messageText').textContent = `${student?.name || 'Hey'}… no one requested a phone for you 😭 Please head back to class.`;
    show(messageScreen);
    scheduleReset(8000);
  }

  function showFlow(data) {
    CURRENT = data;
    const pickup = data.flow === 'pickup';
    $('flowEmoji').textContent = pickup ? '📲' : '📥';
    $('flowType').textContent = pickup ? 'PHONE PICKUP' : 'PHONE RETURN';
    $('flowStudent').textContent = data.student?.name || 'Student';
    $('flowInstruction').textContent = pickup
      ? 'Your phone request is ready. Please wait for office staff.'
      : (data.return_requested ? 'You were sent to return your phone. Please wait for office staff.' : 'Ready to return your phone. Please wait for office staff.');
    $('lockerValue').textContent = lockerText(data.locker);
    confirmText.textContent = pickup ? 'Hold to confirm phone handed to student' : 'Hold to confirm phone returned';
    setStatus($('flowStatus'), data.practice ? 'Practice Mode — no live office notification sent.' : '', data.practice ? 'warn' : '');
    show(flowScreen);
    clearResetTimer();
    resetTimer = setTimeout(resetKiosk, 90000);
  }

  async function selectStudent() {
    if (busy) return;
    const osis = String(studentSelect.value || '').trim();
    if (!osis) return;
    busy = true;
    continueBtn.disabled = true;
    setStatus($('selectStatus'), 'Checking Phone Pass…', 'warn');
    try {
      const data = await kioskApi('/phone-kiosk/select', { method: 'POST', body: { osis } });
      setStatus($('selectStatus'), '');
      if (data.flow === 'none') showNoRequest(data.student);
      else showFlow(data);
    } catch (error) {
      setStatus($('selectStatus'), `Could not check Phone Pass: ${error?.message || error}`);
      continueBtn.disabled = !studentSelect.value;
    } finally {
      busy = false;
    }
  }

  async function confirmCurrentFlow() {
    if (busy || !CURRENT?.student?.osis || !CURRENT?.flow) return;
    busy = true;
    confirmBtn.disabled = true;
    setStatus($('flowStatus'), 'Saving…', 'warn');
    try {
      const data = await kioskApi('/phone-kiosk/confirm', {
        method: 'POST',
        body: { osis: CURRENT.student.osis, flow: CURRENT.flow }
      });
      const pickup = data.flow === 'pickup';
      $('successTitle').textContent = pickup ? 'Phone checked out' : 'Phone returned';
      $('successText').textContent = pickup
        ? 'You’re all set. Return your phone here when you’re finished.'
        : 'Thank you. Your phone has been returned.';
      show(successScreen);
      scheduleReset(6500);
    } catch (error) {
      if (error?.data?.error === 'phone_kiosk_state_changed') {
        setStatus($('flowStatus'), 'Phone Pass state changed. Starting over…', 'warn');
        scheduleReset(1800);
      } else {
        setStatus($('flowStatus'), `Could not save: ${error?.message || error}`);
      }
    } finally {
      busy = false;
      confirmBtn.disabled = false;
      cancelHold();
    }
  }

  function cancelHold() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    holdStartedAt = 0;
    confirmBtn?.classList.remove('holding');
    if (holdProgress) holdProgress.style.width = '';
  }

  function startHold(event) {
    if (busy || !CURRENT) return;
    event?.preventDefault?.();
    cancelHold();
    holdStartedAt = Date.now();
    confirmBtn.classList.add('holding');
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (Date.now() - holdStartedAt >= HOLD_MS - 40) confirmCurrentFlow();
    }, HOLD_MS);
  }

  function endHold(event) {
    event?.preventDefault?.();
    if (!holdTimer) return;
    cancelHold();
    setStatus($('flowStatus'), 'Keep holding until the button completes.', 'warn');
  }

  async function waitForGoogle() {
    const started = Date.now();
    while (!window.google?.accounts?.id) {
      if (Date.now() - started > 10000) throw new Error('Google sign-in did not load.');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return window.google.accounts.id;
  }

  function showSetup() {
    clearResetTimer();
    show(setupScreen);
    setStatus($('setupStatus'), '');
    renderGoogleSignIn().catch((error) => setStatus($('setupStatus'), error?.message || String(error)));
  }

  async function renderGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID) throw new Error('Missing Google client ID.');
    const gsi = await waitForGoogle();
    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true
    });
    const wrap = $('g_id_signin');
    wrap.innerHTML = '';
    gsi.renderButton(wrap, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' });
  }

  async function onGoogleCredential(response) {
    setStatus($('setupStatus'), 'Signing in…', 'warn');
    try {
      const login = await adminFetch('/admin/session/login_google', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ id_token: response.credential }).toString()
      });
      const loginData = await login.json().catch(() => ({}));
      if (loginData?.sid) setStoredAdminSessionSid(loginData.sid);
      stashAdminSession(login);
      if (!login.ok || !loginData?.ok) throw new Error(loginData?.error || `HTTP ${login.status}`);

      setStatus($('setupStatus'), 'Pairing this device…', 'warn');
      const label = String($('deviceLabel').value || '').trim() || 'Main Office Phone Locker';
      const pair = await adminFetch('/admin/phone_kiosk/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label })
      });
      const pairData = await pair.json().catch(() => ({}));
      if (!pair.ok || !pairData?.ok || !pairData?.credential) throw new Error(pairData?.error || `HTTP ${pair.status}`);

      setCredential(pairData.credential);
      setDevice(pairData.device || { label });
      setStatus($('setupStatus'), 'Paired successfully.', 'ok');

      try { await adminFetch('/admin/session/logout', { method: 'POST' }); } catch {}
      setStoredAdminSessionSid('');
      await loadKiosk();
    } catch (error) {
      setStatus($('setupStatus'), `Setup failed: ${error?.message || error}`);
    }
  }


  studentSearch.addEventListener('input', () => fillStudents(studentSearch.value));
  studentSelect.addEventListener('change', () => { continueBtn.disabled = !studentSelect.value; });
  continueBtn.addEventListener('click', selectStudent);
  $('messageDoneBtn').addEventListener('click', resetKiosk);
  $('successDoneBtn').addEventListener('click', resetKiosk);
  $('cancelFlowBtn').addEventListener('click', resetKiosk);

  confirmBtn.addEventListener('pointerdown', startHold, { passive: false });
  for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) confirmBtn.addEventListener(eventName, endHold, { passive: false });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && credential() && selectScreen.hidden === false) loadKiosk().catch(() => {});
  });

  if ('wakeLock' in navigator) {
    const requestWakeLock = () => navigator.wakeLock.request('screen').catch(() => null);
    requestWakeLock();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) requestWakeLock(); });
  }

  if (new URLSearchParams(location.search).get('setup') === '1') showSetup();
  else loadKiosk();
})();

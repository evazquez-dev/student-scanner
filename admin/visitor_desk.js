(() => {
  'use strict';

  const Shared = window.EagleNestVisitor;
  const API_BASE = (() => {
    const raw = (document.querySelector('meta[name="api-base"]')?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/') || `${location.origin}/`; }
    catch { return `${location.origin}/`; }
  })();
  const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
  const ADMIN_SESSION_HEADER = 'x-admin-session';
  const ADMIN_SESSION_KEYS = [
    'visitor_desk_admin_session_v1',
    'ss_admin_session_sid_v1',
    'early_dismissal_admin_session_v1',
    'teacher_att_admin_session_v1',
    'admin_session_v1',
    'admin_session_sid'
  ];

  const $ = (id) => document.getElementById(id);
  const loginCard = $('loginCard');
  const appShell = $('appShell');
  const loginOut = $('loginOut');
  const statusBox = $('statusBox');
  const waitingBody = $('waitingBody');
  const activeBody = $('activeBody');
  const visitorDialog = $('visitorDialog');
  const visitorForm = $('visitorForm');
  const idDialog = $('idDialog');
  const idForm = $('idForm');
  const photoDialog = $('photoDialog');
  const pairDialog = $('pairDialog');
  const checkoutDialog = $('checkoutDialog');
  const emergencyDialog = $('emergencyDialog');

  let ACCESS = null;
  let STATE = { waiting: [], active: [], counts: {} };
  let selectedVisit = null;
  let parsedId = null;
  let pollTimer = 0;
  let historyCursor = '';
  let historyNextCursor = '';
  let historyPrevStack = [];
  let photoVisit = null;
  let photoAfterSave = '';
  let staffCameraStream = null;
  let staffPhotoBlob = null;
  let staffPhotoUrl = '';
  const photoObjectUrls = new Map();

  function esc(v) { return Shared.escapeHtml(v); }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function fullName(v) {
    return [v?.visitor_first_name, v?.visitor_middle_name, v?.visitor_last_name].map((x) => String(x || '').trim()).filter(Boolean).join(' ') || 'Visitor';
  }
  function fmtDT(iso) {
    const s = String(iso || '').trim();
    if (!s) return '-';
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return s;
    return d.toLocaleString([], { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function elapsed(iso) {
    const t = Date.parse(String(iso || ''));
    if (!Number.isFinite(t)) return '';
    const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  }
  function typeLabel(v) { return Shared.visitorTypeLabel(v?.visitor_type, 'en'); }
  function purposeLabel(v) { return Shared.purposeLabel(v?.purpose, 'en'); }
  function setStatus(text, kind) {
    statusBox.textContent = text || '';
    statusBox.classList.toggle('bad', kind === 'bad');
    statusBox.classList.toggle('ok', kind === 'ok');
  }
  function clearPhotoObjectUrls() {
    for (const url of photoObjectUrls.values()) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    photoObjectUrls.clear();
  }
  function photoSlot(v, extraClass = '') {
    const photoId = Shared.cleanText(v?.photo_id, 180);
    if (!photoId) return `<span class="photoSlot ${esc(extraClass)}">No photo</span>`;
    return `<span class="photoSlot ${esc(extraClass)}" data-photo-id="${esc(photoId)}" data-photo-visit="${esc(v?.visit_id || '')}">Photo</span>`;
  }
  async function fetchPhotoBlob(ref) {
    const photoId = Shared.cleanText(ref?.photoId || ref?.photo_id, 180);
    const visitId = Shared.cleanText(ref?.visitId || ref?.visit_id, 160);
    const qs = photoId ? `photo_id=${encodeURIComponent(photoId)}` : `visit_id=${encodeURIComponent(visitId)}`;
    const resp = await adminFetch(`/admin/visitor/photo?${qs}`, { method: 'GET' });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.blob();
  }
  async function hydratePhotoSlots(root = document) {
    const slots = Array.from(root.querySelectorAll('[data-photo-visit]'));
    await Promise.all(slots.map(async (slot) => {
      const visitId = slot.getAttribute('data-photo-visit');
      const photoId = slot.getAttribute('data-photo-id');
      const cacheKey = photoId || visitId;
      try {
        const blob = await fetchPhotoBlob({ visitId, photoId });
        if (!blob) {
          slot.textContent = 'Photo expired';
          return;
        }
        const old = photoObjectUrls.get(cacheKey);
        if (old) {
          try { URL.revokeObjectURL(old); } catch {}
        }
        const url = URL.createObjectURL(blob);
        photoObjectUrls.set(cacheKey, url);
        const img = new Image();
        img.alt = 'Visitor photo';
        img.loading = 'lazy';
        img.src = url;
        slot.textContent = '';
        slot.appendChild(img);
      } catch {
        slot.textContent = 'Photo unavailable';
      }
    }));
  }

  function getStoredAdminSessionSid() {
    try {
      for (const k of ADMIN_SESSION_KEYS) {
        const v = String(sessionStorage.getItem(k) || localStorage.getItem(k) || '').trim();
        if (v) return v;
      }
    } catch {}
    return '';
  }
  function setStoredAdminSessionSid(sid) {
    const v = String(sid || '').trim();
    if (!v) return;
    for (const k of ADMIN_SESSION_KEYS) {
      try { sessionStorage.setItem(k, v); } catch {}
      try { localStorage.setItem(k, v); } catch {}
    }
  }
  function clearStoredAdminSessionSid() {
    for (const k of ADMIN_SESSION_KEYS) {
      try { sessionStorage.removeItem(k); } catch {}
      try { localStorage.removeItem(k); } catch {}
    }
  }
  function stashAdminSessionFromResponse(resp) {
    try {
      const sid = String(resp?.headers?.get(ADMIN_SESSION_HEADER) || resp?.headers?.get('X-Admin-Session') || '').trim();
      if (sid) setStoredAdminSessionSid(sid);
    } catch {}
  }
  async function adminFetch(pathOrUrl, init = {}) {
    const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, API_BASE);
    const headers = new Headers(init.headers || {});
    const sid = getStoredAdminSessionSid();
    if (sid && !headers.has(ADMIN_SESSION_HEADER)) headers.set(ADMIN_SESSION_HEADER, sid);
    const resp = await fetch(url, { ...init, headers, credentials: 'include', cache: 'no-store' });
    stashAdminSessionFromResponse(resp);
    if (resp.status === 401) clearStoredAdminSessionSid();
    return resp;
  }
  async function api(path, options = {}) {
    const init = { method: options.method || 'GET', headers: new Headers(options.headers || {}) };
    if (options.body !== undefined) {
      init.headers.set('content-type', 'application/json');
      init.body = JSON.stringify(options.body);
    }
    const resp = await adminFetch(path, init);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  function fillSelects() {
    const typeOptions = Object.keys(Shared.VISITOR_TYPES).map((key) => `<option value="${esc(key)}">${esc(Shared.visitorTypeLabel(key, 'en'))}</option>`).join('');
    const purposeOptions = Object.keys(Shared.PURPOSES).map((key) => `<option value="${esc(key)}">${esc(Shared.purposeLabel(key, 'en'))}</option>`).join('');
    visitorForm.elements.visitor_type.innerHTML = `<option value="">Select...</option>${typeOptions}`;
    visitorForm.elements.purpose.innerHTML = `<option value="">Select...</option>${purposeOptions}`;
    $('historyType').innerHTML = `<option value="">Any type</option>${typeOptions}`;
    $('historyPurpose').innerHTML = `<option value="">Any purpose</option>${purposeOptions}`;
  }

  function visitSummary(v) {
    const dest = v.destination || v.host_name || '-';
    const verified = v.id_verified ? `<span class="pill ${v.id_expired ? 'warn' : 'ok'}">${v.id_expired ? 'ID expired' : 'ID verified'}</span>` : '<span class="pill warn">ID not verified</span>';
    const photo = v.photo_id ? '<span class="pill ok">Photo</span>' : v.photo_required_override ? '<span class="pill warn">Photo override</span>' : '<span class="pill warn">No photo</span>';
    return `<div><strong>${esc(typeLabel(v))}</strong></div><div>${esc(purposeLabel(v))}</div><div class="muted">${esc(dest)}</div><div>${verified} ${photo}</div>`;
  }

  function waitingRow(v) {
    return `<tr>
      <td><div class="visitorCell">${photoSlot(v)}<div><strong>${esc(fullName(v))}</strong><div class="muted">${esc(v.organization || '')}</div><div class="muted">${esc(v.language || '')} ${esc(v.source || '')}</div></div></div></td>
      <td>${visitSummary(v)}</td>
      <td><div>${esc(fmtDT(v.submitted_at || v.created_at))}</div><div class="muted">${esc(v.kiosk_id || '')}</div></td>
      <td><div class="actions">
        <button data-action="edit" data-id="${esc(v.visit_id)}">Review/Edit</button>
        <button data-action="scan-id" data-id="${esc(v.visit_id)}">Scan / Verify ID</button>
        <button data-action="take-photo" data-id="${esc(v.visit_id)}">Take Visitor Photo</button>
        <button class="primary" data-action="admit" data-id="${esc(v.visit_id)}">Admit & Print Badge</button>
        <button data-action="cancel" data-id="${esc(v.visit_id)}">Cancel</button>
        <button class="danger" data-action="deny" data-id="${esc(v.visit_id)}">Deny</button>
      </div></td>
    </tr>`;
  }

  function activeRow(v) {
    return `<tr>
      <td><div class="visitorCell">${photoSlot(v)}<div><strong>${esc(fullName(v))}</strong><div class="muted">Badge ${esc(v.badge_code || '-')}</div></div></div></td>
      <td>${visitSummary(v)}</td>
      <td><div>${esc(fmtDT(v.check_in_at))}</div><div class="muted">${esc(elapsed(v.check_in_at))} in building</div><div class="muted">${esc(v.check_in_by || '')}</div></td>
      <td><div class="actions">
        <button data-action="details" data-id="${esc(v.visit_id)}">View Details</button>
        <button data-action="take-photo" data-id="${esc(v.visit_id)}">Take Visitor Photo</button>
        <button data-action="reprint" data-id="${esc(v.visit_id)}">Reprint Badge</button>
        <button class="primary" data-action="checkout" data-id="${esc(v.visit_id)}">Check Out</button>
      </div></td>
    </tr>`;
  }

  function renderState() {
    const counts = STATE.counts || {};
    $('waitingCount').textContent = String(counts.waiting || 0);
    $('activeCount').textContent = String(counts.active || 0);
    $('checkedInTodayCount').textContent = String(counts.checked_in_today || 0);
    $('checkedOutTodayCount').textContent = String(counts.checked_out_today || 0);
    clearPhotoObjectUrls();
    waitingBody.innerHTML = STATE.waiting?.length ? STATE.waiting.map(waitingRow).join('') : '<tr><td colspan="4" class="muted">No visitors waiting.</td></tr>';
    activeBody.innerHTML = STATE.active?.length ? STATE.active.map(activeRow).join('') : '<tr><td colspan="4" class="muted">No visitors currently checked in.</td></tr>';
    hydratePhotoSlots();
    const updated = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
    $('waitingUpdated').textContent = updated;
    $('activeUpdated').textContent = updated;
    renderSyncHealth();
  }

  function renderSyncHealth() {
    const sync = STATE.persistence || {};
    const el = $('syncStatus');
    const pending = Number(sync.pending_count || 0);
    if (!pending) {
      el.textContent = 'Visitor log synchronized';
      el.classList.remove('warn');
      el.classList.add('ok');
      return;
    }
    el.textContent = `Visitor log synchronization delayed - ${pending} record${pending === 1 ? '' : 's'} will retry automatically.`;
    el.classList.remove('ok');
    el.classList.add('warn');
  }

  async function refreshState(silent) {
    try {
      const data = await api('/admin/visitor/state');
      STATE = data;
      renderState();
      if (!silent) setStatus('Visitor Desk state loaded.', 'ok');
    } catch (err) {
      setStatus(`Refresh failed: ${err?.message || err}`, 'bad');
    }
  }

  function findVisit(id) {
    return [...(STATE.waiting || []), ...(STATE.active || [])].find((v) => String(v.visit_id) === String(id)) || null;
  }

  function openVisitorDialog(v) {
    visitorForm.reset();
    $('visitorDialogTitle').textContent = v ? 'Review / Edit Visitor' : 'Check In Visitor';
    $('visitorReviewPhoto').innerHTML = v ? photoSlot(v, 'large') : '';
    const els = visitorForm.elements;
    els.visit_id.value = v?.visit_id || '';
    els.visitor_first_name.value = v?.visitor_first_name || '';
    els.visitor_middle_name.value = v?.visitor_middle_name || '';
    els.visitor_last_name.value = v?.visitor_last_name || '';
    els.visitor_type.value = v?.visitor_type || '';
    els.purpose.value = v?.purpose || '';
    els.organization.value = v?.organization || '';
    els.destination.value = v?.destination || '';
    els.host_email.value = v?.host_email || '';
    els.notes.value = v?.notes || '';
    els.direct_admit.checked = false;
    els.direct_admit.disabled = !!v;
    visitorDialog.showModal();
    if (v) hydratePhotoSlots(visitorDialog);
  }

  function visitorFormPayload() {
    const fd = new FormData(visitorForm);
    return {
      visitor_first_name: Shared.cleanText(fd.get('visitor_first_name'), 80),
      visitor_middle_name: Shared.cleanText(fd.get('visitor_middle_name'), 80),
      visitor_last_name: Shared.cleanText(fd.get('visitor_last_name'), 100),
      visitor_type: Shared.cleanText(fd.get('visitor_type'), 80),
      purpose: Shared.cleanText(fd.get('purpose'), 80),
      organization: Shared.cleanText(fd.get('organization'), 140),
      destination: Shared.cleanText(fd.get('destination'), 160),
      host_email: Shared.cleanText(fd.get('host_email'), 180),
      notes: Shared.cleanText(fd.get('notes'), 400)
    };
  }

  async function saveVisitor(ev) {
    ev.preventDefault();
    const visitId = visitorForm.elements.visit_id.value;
    const patch = visitorFormPayload();
    let direct = !visitId && visitorForm.elements.direct_admit.checked;
    const directPhotoOverride = direct && window.confirm('Direct admission without a visitor photo requires an audited override. Continue without a photo?');
    if (direct && !directPhotoOverride) direct = false;
    const reservedPrintWindow = direct ? reservePrintWindow() : null;
    let printIssue = false;
    $('saveVisitorBtn').disabled = true;
    try {
      if (visitId) {
        await api('/admin/visitor/edit', { method: 'POST', body: { visit_id: visitId, patch } });
      } else {
        const data = await api('/admin/visitor/staff_create', { method: 'POST', body: { visitor: patch, direct_admit: direct, photo_required_override: directPhotoOverride } });
        if (direct && data.visit?.badge_checkout_token) {
          try {
            await printBadge(data.visit, false, reservedPrintWindow);
          } catch {
            printIssue = true;
            setStatus('Visitor checked in, but the print window was blocked. Use Reprint Badge.', 'bad');
          }
        }
      }
      visitorDialog.close();
      await refreshState(true);
      if (!printIssue) setStatus('Visitor saved.', 'ok');
    } catch (err) {
      try { reservedPrintWindow?.close(); } catch {}
      setStatus(`Save failed: ${err?.message || err}`, 'bad');
    } finally {
      $('saveVisitorBtn').disabled = false;
    }
  }

  function openIdDialog(v) {
    selectedVisit = v;
    parsedId = null;
    idForm.reset();
    idForm.elements.id_document_type.value = v.id_document_type || 'Driver License / State ID';
    idForm.elements.id_issuing_jurisdiction.value = v.id_issuing_jurisdiction || '';
    idForm.elements.id_expired.checked = !!v.id_expired;
    idForm.elements.apply_name.checked = true;
    $('idParseStatus').textContent = '';
    $('idParsedPreview').textContent = 'No ID scan parsed yet.';
    idDialog.showModal();
    setTimeout(() => $('scanTarget').focus(), 50);
  }

  const idScanner = Shared.createScannerBuffer((scan) => {
    const parsed = Shared.parseAamva(scan);
    if (!parsed.ok) {
      parsedId = null;
      $('idParseStatus').textContent = 'Could not read that ID barcode. You can verify manually.';
      $('idParsedPreview').textContent = 'No permitted fields parsed.';
      return;
    }
    parsedId = parsed.data || {};
    idForm.elements.id_document_type.value = parsedId.id_document_type || 'Driver License / State ID';
    idForm.elements.id_issuing_jurisdiction.value = parsedId.id_issuing_jurisdiction || '';
    idForm.elements.id_expired.checked = !!parsedId.id_expired;
    $('idParseStatus').textContent = 'ID parsed locally. Raw barcode data was discarded.';
    $('idParsedPreview').textContent = [
      `Name: ${fullName(parsedId)}`,
      `Document: ${parsedId.id_document_type || '-'}`,
      `State/Jurisdiction: ${parsedId.id_issuing_jurisdiction || '-'}`,
      `Expired: ${parsedId.id_expired ? 'Yes' : 'No'}`
    ].join('\n');
  }, {
    multiline: true,
    settleMs: 120,
    minLength: 30
  });

  async function saveIdVerification(ev) {
    ev.preventDefault();
    if (!selectedVisit) return;
    const verification = {
      id_verified: true,
      id_document_type: Shared.cleanText(idForm.elements.id_document_type.value, 80),
      id_issuing_jurisdiction: Shared.cleanText(idForm.elements.id_issuing_jurisdiction.value, 40),
      id_expired: idForm.elements.id_expired.checked
    };
    try {
      await api('/admin/visitor/verify', { method: 'POST', body: { visit_id: selectedVisit.visit_id, verification } });
      if (parsedId && idForm.elements.apply_name.checked) {
        await api('/admin/visitor/edit', {
          method: 'POST',
          body: {
            visit_id: selectedVisit.visit_id,
            patch: {
              visitor_first_name: parsedId.visitor_first_name || selectedVisit.visitor_first_name,
              visitor_middle_name: parsedId.visitor_middle_name || selectedVisit.visitor_middle_name,
              visitor_last_name: parsedId.visitor_last_name || selectedVisit.visitor_last_name
            }
          }
        });
      }
      idDialog.close();
      await refreshState(true);
      setStatus('ID verification saved.', 'ok');
    } catch (err) {
      $('idParseStatus').textContent = `Verification failed: ${err?.message || err}`;
    } finally {
      parsedId = null;
    }
  }

  function resetStaffPhotoCapture() {
    if (staffPhotoUrl) {
      try { URL.revokeObjectURL(staffPhotoUrl); } catch {}
    }
    staffPhotoUrl = '';
    staffPhotoBlob = null;
    $('staffPhotoPreview').hidden = true;
    $('staffPhotoPreview').removeAttribute('src');
    $('staffCameraPreview').hidden = false;
    $('takeStaffPhotoBtn').hidden = false;
    $('retakeStaffPhotoBtn').hidden = true;
    $('saveStaffPhotoBtn').hidden = true;
  }

  function stopStaffCamera() {
    if (staffCameraStream) {
      staffCameraStream.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
    }
    staffCameraStream = null;
    $('staffCameraPreview').srcObject = null;
  }

  async function startStaffCamera() {
    resetStaffPhotoCapture();
    if (!navigator.mediaDevices?.getUserMedia) {
      $('photoDialogStatus').textContent = 'Camera is not available on this device.';
      return false;
    }
    $('photoDialogStatus').textContent = 'Starting camera...';
    try {
      staffCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1600 } },
        audio: false
      });
      $('staffCameraPreview').srcObject = staffCameraStream;
      $('photoDialogStatus').textContent = '';
      return true;
    } catch {
      stopStaffCamera();
      $('photoDialogStatus').textContent = 'Camera is unavailable. You may override only when necessary.';
      return false;
    }
  }

  function openPhotoDialog(v, afterSave = '') {
    selectedVisit = v;
    photoVisit = v;
    photoAfterSave = afterSave;
    resetStaffPhotoCapture();
    $('photoDialogStatus').textContent = '';
    photoDialog.showModal();
    startStaffCamera();
  }

  async function takeStaffPhoto() {
    try {
      const blob = await Shared.capturePortraitPhoto($('staffCameraPreview'), { width: 720, height: 900, quality: 0.82 });
      if (blob.size > 512 * 1024) {
        $('photoDialogStatus').textContent = 'Photo is too large. Please retake.';
        return;
      }
      if (staffPhotoUrl) {
        try { URL.revokeObjectURL(staffPhotoUrl); } catch {}
      }
      staffPhotoBlob = blob;
      staffPhotoUrl = URL.createObjectURL(blob);
      $('staffPhotoPreview').src = staffPhotoUrl;
      $('staffPhotoPreview').hidden = false;
      $('staffCameraPreview').hidden = true;
      $('takeStaffPhotoBtn').hidden = true;
      $('retakeStaffPhotoBtn').hidden = false;
      $('saveStaffPhotoBtn').hidden = false;
      $('photoDialogStatus').textContent = '';
    } catch {
      $('photoDialogStatus').textContent = 'Unable to capture photo. Please try again.';
    }
  }

  async function uploadStaffPhoto() {
    if (!photoVisit?.visit_id || !staffPhotoBlob) return;
    $('saveStaffPhotoBtn').disabled = true;
    $('photoDialogStatus').textContent = 'Saving photo...';
    try {
      const resp = await adminFetch(`/admin/visitor/photo?visit_id=${encodeURIComponent(photoVisit.visit_id)}`, {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg' },
        body: staffPhotoBlob
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      const after = photoAfterSave;
      const visitId = photoVisit.visit_id;
      photoDialog.close();
      stopStaffCamera();
      resetStaffPhotoCapture();
      await refreshState(true);
      setStatus('Visitor photo saved.', 'ok');
      if (after === 'admit') {
        const fresh = findVisit(visitId) || data.visit || photoVisit || {};
        await admitVisit(fresh, { skipConfirm: true });
      }
    } catch (err) {
      $('photoDialogStatus').textContent = `Photo save failed: ${err?.message || err}`;
    } finally {
      $('saveStaffPhotoBtn').disabled = false;
    }
  }

  async function overrideVisitorPhoto() {
    if (!photoVisit?.visit_id) return;
    if (!window.confirm(`Admit ${fullName(photoVisit)} without a visitor photo? This override will be audited.`)) return;
    try {
      const after = photoAfterSave;
      const priorVisit = photoVisit;
      const data = await api('/admin/visitor/photo_override', { method: 'POST', body: { visit_id: photoVisit.visit_id } });
      photoDialog.close();
      stopStaffCamera();
      resetStaffPhotoCapture();
      await refreshState(true);
      setStatus('Photo requirement override recorded.', 'ok');
      if (after === 'admit') await admitVisit(data.visit || priorVisit, { skipConfirm: true });
    } catch (err) {
      $('photoDialogStatus').textContent = `Override failed: ${err?.message || err}`;
    }
  }

  async function admitVisit(v, opts = {}) {
    if (!opts.skipConfirm && !window.confirm(`Admit ${fullName(v)} and print a badge?`)) return;
    const reservedPrintWindow = reservePrintWindow();
    try {
      const data = await api('/admin/visitor/admit', { method: 'POST', body: { visit_id: v.visit_id } });
      await refreshState(true);
      try {
        await printBadge(data.visit, false, reservedPrintWindow);
        setStatus(data.already ? 'Visitor was already checked in. Badge opened for printing.' : 'Visitor checked in. Badge opened for printing.', 'ok');
      } catch {
        setStatus('Visitor checked in, but the print window was blocked. Use Reprint Badge.', 'bad');
      }
    } catch (err) {
      try { reservedPrintWindow?.close(); } catch {}
      if (String(err?.message || err) === 'photo_required') {
        setStatus('Visitor photo required before admission. Take a photo or record an override.', 'bad');
        openPhotoDialog(v, 'admit');
        return;
      }
      setStatus(`Admit failed: ${err?.message || err}`, 'bad');
      await refreshState(true);
    }
  }

  function reservePrintWindow() {
    const win = window.open('', '_blank', 'width=420,height=620');
    if (!win) return null;
    try {
      win.document.write('<!doctype html><html><head><title>Visitor Badge</title></head><body>Preparing badge...</body></html>');
      win.document.close();
    } catch {}
    return win;
  }

  function badgeVisitLine(v) {
    return v?.destination || purposeLabel(v) || 'Visitor';
  }

  async function printBadge(v, reprint, reservedWindow) {
    if (!v?.badge_checkout_token) throw new Error('badge_checkout_token_missing');
    const qrSvg = Shared.makeQrSvg(`ENVISIT:${v.badge_checkout_token}`, { border: 2 });
    let photoUrl = '';
    if (v.photo_id) {
      try {
        const blob = await fetchPhotoBlob({ visitId: v.visit_id, photoId: v.photo_id });
        if (blob) photoUrl = URL.createObjectURL(blob);
      } catch {}
    }
    const name = esc(fullName(v));
    const visitLine = esc(badgeVisitLine(v));
    const code = esc(v.badge_code || '');
    const time = esc(fmtDT(v.check_in_at || new Date().toISOString()));
    const win = reservedWindow || reservePrintWindow();
    if (!win) throw new Error('print_window_blocked');
    win.document.write(`<!doctype html><html><head><title>Visitor Badge</title><style>
      @page{size:2.4in 3.9in;margin:0}
      *{box-sizing:border-box}
      html,body{margin:0;width:2.4in;height:3.9in;font-family:Arial,sans-serif;color:#000;background:#fff}
      .badge{width:2.4in;height:3.9in;padding:.12in;display:grid;grid-template-rows:auto auto 1fr auto;gap:.06in;border:1px solid #000}
      .brand{font-size:8pt;font-weight:800;text-align:center}
      .visitor{font-size:21pt;font-weight:950;text-align:center;letter-spacing:0}
      .main{display:grid;grid-template-columns:.9in 1fr;gap:.09in;align-items:center}
      .photo{width:.9in;height:1.125in;border:1px solid #000;display:grid;place-items:center;font-size:8pt;font-weight:900;overflow:hidden}
      .photo img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.35)}
      .name{font-size:15pt;font-weight:900;line-height:1.05;word-break:break-word}
      .visit{font-size:9pt;line-height:1.15;word-break:break-word;margin-top:.05in}
      .bottom{display:grid;grid-template-columns:.9in 1fr;gap:.08in;align-items:end}
      .qr svg{display:block;width:.9in;height:.9in}
      .meta{font-size:8pt;line-height:1.25}
      .code{font-size:14pt;font-weight:950}
    </style></head><body><div class="badge">
      <div class="brand">The American Dream School / EagleNEST</div>
      <div class="visitor">VISITOR</div>
      <div class="main"><div class="photo">${photoUrl ? `<img src="${photoUrl}" alt="">` : 'PHOTO'}</div><div><div class="name">${name}</div><div class="visit">${visitLine}</div></div></div>
      <div class="bottom"><div class="qr">${qrSvg}</div><div class="meta"><div>${time}</div><div>Badge</div><div class="code">${code}</div></div></div>
    </div></body></html>`);
    win.document.close();
    setTimeout(() => {
      try { win.focus(); win.print(); } catch {}
    }, 250);
    if (photoUrl) setTimeout(() => { try { URL.revokeObjectURL(photoUrl); } catch {} }, 30000);
    await api('/admin/visitor/badge_printed', { method: 'POST', body: { visit_id: v.visit_id, reprint: !!reprint } }).catch(() => null);
  }

  async function checkoutVisit(v) {
    if (!window.confirm(`Check out ${fullName(v)}?`)) return;
    try {
      await api('/admin/visitor/check_out', { method: 'POST', body: { visit_id: v.visit_id } });
      await refreshState(true);
      setStatus('Visitor checked out.', 'ok');
    } catch (err) {
      setStatus(`Checkout failed: ${err?.message || err}`, 'bad');
    }
  }

  async function cancelOrDeny(v, op) {
    const label = op === 'deny' ? 'deny' : 'cancel';
    const reason = window.prompt(`Reason to ${label} ${fullName(v)}?`) || '';
    if (!window.confirm(`Confirm ${label} visitor request?`)) return;
    try {
      await api(`/admin/visitor/${op}`, { method: 'POST', body: { visit_id: v.visit_id, reason } });
      await refreshState(true);
      setStatus(`Visitor ${op === 'deny' ? 'denied' : 'cancelled'}.`, 'ok');
    } catch (err) {
      setStatus(`Action failed: ${err?.message || err}`, 'bad');
    }
  }

  async function loadEmergency() {
    try {
      const data = await api('/admin/visitor/emergency');
      $('emergencyGenerated').textContent = `Generated ${fmtDT(data.generated_at)}`;
      $('emergencyBody').innerHTML = data.rows?.length ? data.rows.map((v) => `<tr>
        <td><div class="visitorCell">${photoSlot(v)}<div>${esc(fullName(v))}</div></div></td>
        <td>${esc(typeLabel(v))}<br>${esc(v.destination || purposeLabel(v) || '')}</td>
        <td>${esc(v.badge_code || '')}</td>
        <td>${esc(fmtDT(v.check_in_at))}</td>
      </tr>`).join('') : '<tr><td colspan="4">No checked-in visitors.</td></tr>';
      hydratePhotoSlots(emergencyDialog);
      emergencyDialog.showModal();
    } catch (err) {
      setStatus(`Emergency roster failed: ${err?.message || err}`, 'bad');
    }
  }

  function historyParams(cursor) {
    const params = new URLSearchParams();
    [
      ['name', $('historyName').value],
      ['start_date', $('historyStart').value],
      ['end_date', $('historyEnd').value],
      ['visitor_type', $('historyType').value],
      ['purpose', $('historyPurpose').value],
      ['status', $('historyStatus').value]
    ].forEach(([k, v]) => { if (v) params.set(k, v); });
    params.set('limit', '50');
    if (cursor) params.set('cursor', cursor);
    return params;
  }

  function renderHistoryPager(data, rows) {
    historyNextCursor = data.next_cursor || '';
    $('historyPrevBtn').disabled = historyPrevStack.length === 0;
    $('historyNextBtn').disabled = !historyNextCursor;
    const start = Number(historyCursor || 0) + (rows.length ? 1 : 0);
    const end = Number(historyCursor || 0) + rows.length;
    const total = Number(data.total_matched || 0);
    $('historyPageInfo').textContent = total ? `Showing ${start}-${end} of ${total}` : 'No matching records';
  }

  async function searchHistory(cursor = '') {
    try {
      historyCursor = String(cursor || '');
      const params = historyParams(historyCursor);
      const data = await api(`/admin/visitor/history?${params.toString()}`);
      const rows = data.rows || data.visits || [];
      $('historyBody').innerHTML = rows.length ? rows.map((v) => `<tr>
        <td><div class="visitorCell">${photoSlot(v)}<div><strong>${esc(fullName(v))}</strong><div class="muted">${esc(v.organization || '')}</div></div></div></td>
        <td>${esc(typeLabel(v))}<br>${esc(purposeLabel(v))}<div class="muted">${esc(v.destination || '')}</div></td>
        <td>${esc(v.status || '')}<div class="muted">${esc(fmtDT(v.check_in_at || v.submitted_at || v.created_at))}</div></td>
        <td><div>In: ${esc(v.check_in_by || '-')}</div><div>Out: ${esc(v.check_out_by || '-')}</div></td>
      </tr>`).join('') : '<tr><td colspan="4" class="muted">No history matched.</td></tr>';
      hydratePhotoSlots($('historyBody'));
      renderHistoryPager(data, rows);
    } catch (err) {
      $('historyBody').innerHTML = `<tr><td colspan="4" class="muted">History unavailable: ${esc(err?.message || err)}</td></tr>`;
      $('historyPageInfo').textContent = 'History unavailable';
      $('historyPrevBtn').disabled = true;
      $('historyNextBtn').disabled = true;
    }
  }

  function startHistorySearch() {
    historyPrevStack = [];
    historyCursor = '';
    historyNextCursor = '';
    return searchHistory('');
  }

  function nextHistoryPage() {
    if (!historyNextCursor) return;
    historyPrevStack.push(historyCursor);
    return searchHistory(historyNextCursor);
  }

  function prevHistoryPage() {
    if (!historyPrevStack.length) return;
    const prev = historyPrevStack.pop() || '';
    return searchHistory(prev);
  }

  async function openPairDialog() {
    $('pairCodeOut').textContent = '------';
    pairDialog.showModal();
    await loadKiosks();
    await generatePairCode();
  }

  async function generatePairCode() {
    try {
      const data = await api('/admin/visitor/kiosk_pair_code', { method: 'POST', body: { label: 'Front Desk iPad' } });
      $('pairCodeOut').textContent = data.code || '------';
    } catch (err) {
      $('pairCodeOut').textContent = 'ERROR';
      setStatus(`Pair code failed: ${err?.message || err}`, 'bad');
    }
  }

  async function loadKiosks() {
    const wrap = $('kioskList');
    try {
      const data = await api('/admin/visitor/kiosks');
      wrap.textContent = '';
      if (!data.kiosks?.length) {
        wrap.textContent = 'No paired kiosks.';
        return;
      }
      data.kiosks.forEach((k) => {
        const row = document.createElement('div');
        row.className = 'pane';
        const revoked = k.revoked_at ? `Revoked ${fmtDT(k.revoked_at)}` : 'Active';
        row.innerHTML = `<strong>${esc(k.label || k.kiosk_id)}</strong><div class="muted">${esc(k.kiosk_id)} - ${esc(revoked)}</div>`;
        if (!k.revoked_at) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'danger';
          btn.textContent = 'Revoke';
          btn.addEventListener('click', async () => {
            if (!window.confirm('Revoke this kiosk credential?')) return;
            await api('/admin/visitor/kiosk_revoke', { method: 'POST', body: { kiosk_id: k.kiosk_id } });
            await loadKiosks();
          });
          row.appendChild(btn);
        }
        wrap.appendChild(row);
      });
    } catch (err) {
      wrap.textContent = `Unable to load kiosks: ${err?.message || err}`;
    }
  }

  const checkoutScanner = Shared.createScannerBuffer(async (scan) => {
    const checkoutStatus = $('checkoutStatus');
    checkoutStatus.textContent = 'Checking badge...';
    try {
      const lookup = await api('/admin/visitor/checkout_lookup', { method: 'POST', body: { qr_text: scan } });
      if (lookup.already) {
        checkoutStatus.textContent = `${fullName(lookup.visit)} is already checked out.`;
        return;
      }
      if (!window.confirm(`Check out ${fullName(lookup.visit)}?`)) {
        checkoutStatus.textContent = 'Checkout cancelled.';
        return;
      }
      await api('/admin/visitor/check_out', { method: 'POST', body: { qr_text: scan } });
      checkoutStatus.textContent = `${fullName(lookup.visit)} checked out.`;
      await refreshState(true);
    } catch (err) {
      checkoutStatus.textContent = `Badge scan failed: ${err?.message || err}`;
    }
  }, { minLength: 32 });
  const idScannerKeydown = (ev) => {
    if (ev.target?.closest?.('input, textarea, select')) return;
    idScanner.keydown(ev);
  };
  const checkoutScannerKeydown = (ev) => {
    if (ev.target?.closest?.('input, textarea, select')) return;
    checkoutScanner.keydown(ev);
  };

  function openCheckoutDialog() {
    $('checkoutStatus').textContent = '';
    checkoutDialog.showModal();
    setTimeout(() => $('checkoutScanTarget').focus(), 50);
  }

  function initScannerModalHandlers() {
    idDialog.addEventListener('close', () => {
      document.removeEventListener('keydown', idScannerKeydown);
      idScanner.reset();
      parsedId = null;
    });
    idDialog.addEventListener('cancel', () => document.removeEventListener('keydown', idScannerKeydown));
    const observer = new MutationObserver(() => {
      if (idDialog.open) document.addEventListener('keydown', idScannerKeydown);
      else document.removeEventListener('keydown', idScannerKeydown);
      if (checkoutDialog.open) document.addEventListener('keydown', checkoutScannerKeydown);
      else document.removeEventListener('keydown', checkoutScannerKeydown);
    });
    observer.observe(idDialog, { attributes: true, attributeFilter: ['open'] });
    observer.observe(checkoutDialog, { attributes: true, attributeFilter: ['open'] });
    checkoutDialog.addEventListener('close', () => {
      document.removeEventListener('keydown', checkoutScannerKeydown);
      checkoutScanner.reset();
    });
  }

  function handleAction(ev) {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const v = findVisit(btn.dataset.id);
    if (!v) return;
    const action = btn.dataset.action;
    if (action === 'edit' || action === 'details') openVisitorDialog(v);
    else if (action === 'scan-id') openIdDialog(v);
    else if (action === 'take-photo') openPhotoDialog(v);
    else if (action === 'admit') admitVisit(v);
    else if (action === 'checkout') checkoutVisit(v);
    else if (action === 'reprint') {
      const reservedPrintWindow = reservePrintWindow();
      api('/admin/visitor/reprint', { method: 'POST', body: { visit_id: v.visit_id } })
        .then((d) => printBadge(d.visit, true, reservedPrintWindow))
        .catch((err) => {
          try { reservedPrintWindow?.close(); } catch {}
          setStatus(`Reprint failed: ${err?.message || err}`, 'bad');
        });
    }
    else if (action === 'cancel' || action === 'deny') cancelOrDeny(v, action);
  }

  function initTheme() {
    const root = document.documentElement;
    const btn = $('themeToggle');
    const sync = () => { btn.textContent = root.dataset.theme === 'light' ? 'Dark' : 'Light'; };
    sync();
    btn.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('ss_theme_v1', root.dataset.theme); } catch {}
      sync();
    });
  }

  async function fetchAccess() {
    const data = await api('/admin/access');
    ACCESS = data;
    if (!data.can?.visitor_desk) throw new Error('visitor_desk_forbidden');
    $('viewerMeta').textContent = `${data.email || ''}${data.role ? ` (${data.role})` : ''}`;
    return data;
  }

  async function waitForGoogle(timeoutMs = 8000) {
    const start = Date.now();
    while (!window.google?.accounts?.id) {
      if (Date.now() - start > timeoutMs) throw new Error('Google sign-in failed to load');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return window.google.accounts.id;
  }

  async function onGoogleCredential(resp) {
    try {
      loginOut.textContent = 'Signing in...';
      const r = await adminFetch('/admin/session/login_google', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ id_token: resp.credential }).toString()
      });
      const data = await r.json().catch(() => ({}));
      if (data?.sid) setStoredAdminSessionSid(String(data.sid));
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      await bootAuthed();
    } catch (err) {
      loginOut.textContent = `Login failed: ${err?.message || err}`;
    }
  }

  async function bootAuthed() {
    await fetchAccess();
    hide(loginCard);
    show(appShell);
    fillSelects();
    await refreshState();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshState(true), 15000);
  }

  async function boot() {
    initTheme();
    fillSelects();
    visitorForm.addEventListener('submit', saveVisitor);
    idForm.addEventListener('submit', saveIdVerification);
    $('manualVerifyBtn').addEventListener('click', () => {
      parsedId = null;
      $('idParseStatus').textContent = 'Manual verification selected.';
      $('idParsedPreview').textContent = 'No barcode fields used.';
    });
    document.querySelectorAll('[data-close-dialog]').forEach((btn) => btn.addEventListener('click', () => btn.closest('dialog')?.close()));
    $('newVisitorBtn').addEventListener('click', () => openVisitorDialog(null));
    $('refreshBtn').addEventListener('click', () => refreshState(false));
    $('emergencyBtn').addEventListener('click', loadEmergency);
    $('printEmergencyBtn').addEventListener('click', () => window.print());
    $('pairBtn').addEventListener('click', openPairDialog);
    $('newPairCodeBtn').addEventListener('click', generatePairCode);
    $('scanBadgeBtn').addEventListener('click', openCheckoutDialog);
    $('historyBtn').addEventListener('click', startHistorySearch);
    $('historyPrevBtn').addEventListener('click', prevHistoryPage);
    $('historyNextBtn').addEventListener('click', nextHistoryPage);
    waitingBody.addEventListener('click', handleAction);
    activeBody.addEventListener('click', handleAction);
    $('startStaffCameraBtn').addEventListener('click', startStaffCamera);
    $('takeStaffPhotoBtn').addEventListener('click', takeStaffPhoto);
    $('retakeStaffPhotoBtn').addEventListener('click', startStaffCamera);
    $('saveStaffPhotoBtn').addEventListener('click', uploadStaffPhoto);
    $('overridePhotoBtn').addEventListener('click', overrideVisitorPhoto);
    photoDialog.addEventListener('close', () => {
      stopStaffCamera();
      resetStaffPhotoCapture();
      photoVisit = null;
      photoAfterSave = '';
    });
    initScannerModalHandlers();
    try {
      await bootAuthed();
      return;
    } catch {}
    show(loginCard);
    hide(appShell);
    if (!GOOGLE_CLIENT_ID) {
      loginOut.textContent = 'Missing Google client ID.';
      return;
    }
    try {
      const googleId = await waitForGoogle();
      googleId.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential, ux_mode: 'popup', use_fedcm_for_prompt: true });
      googleId.renderButton($('g_id_signin'), { theme: 'outline', size: 'large' });
      loginOut.textContent = 'Please sign in...';
    } catch (err) {
      loginOut.textContent = err?.message || String(err);
    }
  }

  window.addEventListener('DOMContentLoaded', () => boot().catch((err) => {
    show(loginCard);
    hide(appShell);
    loginOut.textContent = String(err?.message || err);
  }));
})();

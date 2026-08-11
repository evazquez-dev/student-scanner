(() => {
  'use strict';

  const Shared = window.EagleNestVisitor;
  const API_BASE = (() => {
    const raw = (document.querySelector('meta[name="api-base"]')?.content || location.origin).trim();
    try { return new URL(raw).toString().replace(/\/+$/, '/') || `${location.origin}/`; }
    catch { return `${location.origin}/`; }
  })();

  const CRED_KEY = 'envisit_kiosk_credential_v1';
  const KIOSK_ID_KEY = 'envisit_kiosk_id_v1';
  const PHOTO_MAX_BYTES = 512 * 1024;

  const T = {
    en: {
      title: 'Visitor Check-In',
      intro: 'Please enter your visit information. After submitting, present your identification to security.',
      firstName: 'First Name',
      lastName: 'Last Name',
      middleName: 'Middle Name / Initial',
      organization: 'Organization / Company',
      visitorType: 'Visitor Type',
      purpose: 'Purpose / Reason for Visit',
      destination: 'Person or Department Being Visited',
      details: 'Additional Detail',
      nextPhoto: 'Continue to Visitor Photo',
      back: 'Back',
      privacy: 'Identification may be reviewed or scanned by security to help verify visitor information. EagleNEST does not store an ID image or identification number. A current visitor photo is securely stored for up to 30 days for building security and then automatically deleted.',
      required: 'Please complete first name, last name, visitor type, and purpose.',
      photoTitle: 'Visitor Photo',
      photoIntro: 'Please look at the camera.',
      takePhoto: 'Take Photo',
      retake: 'Retake',
      usePhoto: 'Use Photo',
      cameraStarting: 'Starting camera...',
      cameraFailed: 'The camera is not available. Please ask security for help.',
      photoCaptureFailed: 'Photo could not be captured. Please try again.',
      photoTooLarge: 'Please retake the photo.',
      photoRequired: 'Please take and use a visitor photo before submitting.',
      reviewTitle: 'Review / Submit',
      reviewIntro: 'Confirm your information, then submit your request.',
      submit: 'Submit Check-In Request',
      submitting: 'Submitting...',
      failed: 'We could not submit the request. Please ask security for help.',
      rePair: 'This visitor kiosk needs to be paired again.',
      thanksTitle: 'Thank you.',
      thanks: 'Please present your identification to security.'
    },
    es: {
      title: 'Registro de Visitante',
      intro: 'Ingrese la información de su visita. Después de enviar, presente su identificación al personal de seguridad.',
      firstName: 'Nombre',
      lastName: 'Apellido',
      middleName: 'Segundo nombre / Inicial',
      organization: 'Organización / Compañía',
      visitorType: 'Tipo de visitante',
      purpose: 'Propósito / Razón de la visita',
      destination: 'Persona o departamento que visita',
      details: 'Detalle adicional',
      nextPhoto: 'Continuar a la foto',
      back: 'Atrás',
      privacy: 'El personal de seguridad puede revisar o escanear una identificación para ayudar a verificar la información del visitante. EagleNEST no guarda una imagen de la identificación ni el número de identificación. Una foto actual del visitante se guarda de forma segura por hasta 30 días para la seguridad del edificio y luego se elimina automáticamente.',
      required: 'Complete nombre, apellido, tipo de visitante y propósito.',
      photoTitle: 'Foto del visitante',
      photoIntro: 'Mire a la cámara.',
      takePhoto: 'Tomar foto',
      retake: 'Volver a tomar',
      usePhoto: 'Usar foto',
      cameraStarting: 'Iniciando cámara...',
      cameraFailed: 'La cámara no está disponible. Pida ayuda al personal de seguridad.',
      photoCaptureFailed: 'No se pudo tomar la foto. Inténtelo de nuevo.',
      photoTooLarge: 'Vuelva a tomar la foto.',
      photoRequired: 'Tome y use una foto del visitante antes de enviar.',
      reviewTitle: 'Revisar / Enviar',
      reviewIntro: 'Confirme su información y envíe la solicitud.',
      submit: 'Enviar solicitud de registro',
      submitting: 'Enviando...',
      failed: 'No pudimos enviar la solicitud. Pida ayuda al personal de seguridad.',
      rePair: 'Este kiosco de visitantes debe vincularse nuevamente.',
      thanksTitle: 'Gracias.',
      thanks: 'Por favor, presente su identificación al personal de seguridad.'
    }
  };

  const $ = (id) => document.getElementById(id);
  const setupScreen = $('setupScreen');
  const languageScreen = $('languageScreen');
  const formScreen = $('formScreen');
  const photoScreen = $('photoScreen');
  const reviewScreen = $('reviewScreen');
  const thanksScreen = $('thanksScreen');
  const visitorForm = $('visitorForm');
  const formStatus = $('formStatus');
  const photoStatus = $('photoStatus');
  const reviewStatus = $('reviewStatus');
  const setupStatus = $('setupStatus');
  const submitBtn = $('submitBtn');
  const nextPhotoBtn = $('nextPhotoBtn');
  const cameraFrame = $('cameraFrame');
  const cameraPreview = $('cameraPreview');
  const photoPreview = $('photoPreview');

  let lang = 'en';
  let visitorType = '';
  let purpose = '';
  let busy = false;
  let pendingSubmissionId = '';
  let pendingVisitorPayload = null;
  let cameraStream = null;
  let photoBlob = null;
  let photoObjectUrl = '';

  function credential() {
    try { return String(localStorage.getItem(CRED_KEY) || '').trim(); } catch { return ''; }
  }

  function clearCredential() {
    try {
      localStorage.removeItem(CRED_KEY);
      localStorage.removeItem(KIOSK_ID_KEY);
    } catch {}
  }

  function show(screen) {
    [setupScreen, languageScreen, formScreen, photoScreen, reviewScreen, thanksScreen].forEach((el) => { if (el) el.hidden = el !== screen; });
    if (screen !== photoScreen) stopCamera();
  }

  function setStatus(el, text, ok) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('ok', !!ok);
  }

  function setLang(next) {
    lang = next === 'es' ? 'es' : 'en';
    document.documentElement.lang = lang;
    const strings = T[lang];
    $('formTitle').textContent = strings.title;
    $('formIntro').textContent = strings.intro;
    $('backBtn').textContent = strings.back;
    $('photoBackBtn').textContent = strings.back;
    $('reviewBackBtn').textContent = strings.back;
    $('privacyNotice').textContent = strings.privacy;
    $('photoTitle').textContent = strings.photoTitle;
    $('photoIntro').textContent = strings.photoIntro;
    $('reviewTitle').textContent = strings.reviewTitle;
    $('reviewIntro').textContent = strings.reviewIntro;
    $('takePhotoBtn').textContent = strings.takePhoto;
    $('retakePhotoBtn').textContent = strings.retake;
    $('usePhotoBtn').textContent = strings.usePhoto;
    nextPhotoBtn.textContent = strings.nextPhoto;
    submitBtn.textContent = strings.submit;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = strings[key] || '';
    });
    renderChoices();
  }

  function choiceButton(kind, key, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choiceBtn';
    btn.textContent = label;
    btn.dataset.key = key;
    btn.setAttribute('aria-pressed', String(kind === 'type' ? visitorType === key : purpose === key));
    btn.addEventListener('click', () => {
      if (kind === 'type') visitorType = key;
      else purpose = key;
      renderChoices();
    });
    return btn;
  }

  function renderChoices() {
    const typeWrap = $('typeChoices');
    const purposeWrap = $('purposeChoices');
    typeWrap.textContent = '';
    purposeWrap.textContent = '';
    Object.keys(Shared.VISITOR_TYPES).forEach((key) => {
      typeWrap.appendChild(choiceButton('type', key, Shared.visitorTypeLabel(key, lang)));
    });
    Object.keys(Shared.PURPOSES).forEach((key) => {
      purposeWrap.appendChild(choiceButton('purpose', key, Shared.purposeLabel(key, lang)));
    });
  }

  function revokePhotoUrl() {
    if (photoObjectUrl) {
      try { URL.revokeObjectURL(photoObjectUrl); } catch {}
    }
    photoObjectUrl = '';
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
    }
    cameraStream = null;
    if (cameraPreview) cameraPreview.srcObject = null;
  }

  function setPhotoCaptureState(state) {
    const mode = state === 'review' ? 'review' : 'live';
    if (cameraFrame) cameraFrame.dataset.photoState = mode;
    cameraPreview.hidden = mode !== 'live';
    photoPreview.hidden = mode !== 'review';
    $('takePhotoBtn').hidden = mode !== 'live';
    $('retakePhotoBtn').hidden = mode !== 'review';
    $('usePhotoBtn').hidden = mode !== 'review';
  }

  function hasActiveCameraStream() {
    return !!cameraStream
      && typeof cameraStream.getTracks === 'function'
      && cameraStream.getTracks().some((track) => track.readyState === 'live');
  }

  function hasUsableCameraFrame(video) {
    return hasActiveCameraStream()
      && !!video
      && video.readyState >= 2
      && video.videoWidth > 0
      && video.videoHeight > 0;
  }

  function nextFrame() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else window.setTimeout(resolve, 16);
    });
  }

  async function waitForUsableCameraFrame(video, timeoutMs = 1200) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (hasUsableCameraFrame(video)) return true;
      await nextFrame();
    }
    return hasUsableCameraFrame(video);
  }

  async function waitForPhotoPreviewImage(url) {
    await new Promise((resolve, reject) => {
      const done = () => {
        photoPreview.removeEventListener('load', done);
        photoPreview.removeEventListener('error', fail);
        resolve();
      };
      const fail = () => {
        photoPreview.removeEventListener('load', done);
        photoPreview.removeEventListener('error', fail);
        reject(new Error('photo_review_load_failed'));
      };
      photoPreview.addEventListener('load', done, { once: true });
      photoPreview.addEventListener('error', fail, { once: true });
      photoPreview.src = url;
      if (photoPreview.complete && photoPreview.naturalWidth > 0 && photoPreview.naturalHeight > 0) done();
    });
    if (typeof photoPreview.decode === 'function') {
      await photoPreview.decode();
    }
    if (!photoPreview.naturalWidth || !photoPreview.naturalHeight) throw new Error('photo_review_load_failed');
  }

  async function restoreLiveCameraAfterCaptureFailure() {
    setPhotoCaptureState('live');
    if (!hasActiveCameraStream()) await startCamera();
    setStatus(photoStatus, T[lang].photoCaptureFailed);
  }

  function clearPhoto() {
    photoBlob = null;
    revokePhotoUrl();
    photoPreview.removeAttribute('src');
    setPhotoCaptureState('live');
  }

  function resetForm() {
    visitorForm.reset();
    visitorType = '';
    purpose = '';
    pendingSubmissionId = '';
    pendingVisitorPayload = null;
    busy = false;
    clearPhoto();
    stopCamera();
    setStatus(formStatus, '');
    setStatus(photoStatus, '');
    setStatus(reviewStatus, '');
    renderChoices();
  }

  function formPayload() {
    const fd = new FormData(visitorForm);
    return {
      language: lang,
      visitor_first_name: Shared.cleanText(fd.get('visitor_first_name'), 80),
      visitor_middle_name: Shared.cleanText(fd.get('visitor_middle_name'), 80),
      visitor_last_name: Shared.cleanText(fd.get('visitor_last_name'), 100),
      visitor_type: visitorType,
      organization: Shared.cleanText(fd.get('organization'), 140),
      purpose,
      destination: Shared.cleanText(fd.get('destination'), 160),
      notes: Shared.cleanText(fd.get('notes'), 400)
    };
  }

  function missingRequired(v) {
    return !v.visitor_first_name || !v.visitor_last_name || !v.visitor_type || !v.purpose;
  }

  function renderReview(visitor) {
    const photoUrl = photoObjectUrl || '';
    $('reviewPhoto').src = photoUrl;
    $('reviewPhoto').alt = T[lang].photoTitle;
    const rows = [
      [T[lang].firstName, visitor.visitor_first_name],
      [T[lang].lastName, visitor.visitor_last_name],
      [T[lang].visitorType, Shared.visitorTypeLabel(visitor.visitor_type, lang)],
      [T[lang].purpose, Shared.purposeLabel(visitor.purpose, lang)],
      [T[lang].destination, visitor.destination || '-']
    ];
    const wrap = $('reviewDetails');
    wrap.textContent = '';
    rows.forEach(([label, value]) => {
      const row = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = `${label}: `;
      row.appendChild(strong);
      row.append(document.createTextNode(value || '-'));
      wrap.appendChild(row);
    });
  }

  async function startCamera() {
    stopCamera();
    clearPhoto();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus(photoStatus, T[lang].cameraFailed);
      return false;
    }
    setStatus(photoStatus, T[lang].cameraStarting, true);
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1600 } },
        audio: false
      });
      cameraPreview.srcObject = cameraStream;
      try { await cameraPreview.play(); } catch {}
      if (!await waitForUsableCameraFrame(cameraPreview, 1500)) {
        setStatus(photoStatus, T[lang].photoCaptureFailed);
        return false;
      }
      setPhotoCaptureState('live');
      setStatus(photoStatus, '');
      return true;
    } catch {
      stopCamera();
      setStatus(photoStatus, T[lang].cameraFailed);
      return false;
    }
  }

  async function openPhotoStep() {
    if (busy) return;
    const visitor = formPayload();
    if (missingRequired(visitor)) {
      setStatus(formStatus, T[lang].required);
      return;
    }
    pendingVisitorPayload = visitor;
    setStatus(formStatus, '');
    show(photoScreen);
    await startCamera();
  }

  async function takePhoto() {
    if (!await waitForUsableCameraFrame(cameraPreview, 700)) {
      await restoreLiveCameraAfterCaptureFailure();
      return;
    }
    try {
      const blob = await Shared.capturePortraitPhoto(cameraPreview, { width: 720, height: 900, quality: 0.82 });
      if (blob.size > PHOTO_MAX_BYTES) {
        setStatus(photoStatus, T[lang].photoTooLarge);
        return;
      }
      const nextUrl = URL.createObjectURL(blob);
      try {
        await waitForPhotoPreviewImage(nextUrl);
      } catch (err) {
        try { URL.revokeObjectURL(nextUrl); } catch {}
        photoPreview.removeAttribute('src');
        throw err;
      }
      revokePhotoUrl();
      photoBlob = blob;
      photoObjectUrl = nextUrl;
      stopCamera();
      setPhotoCaptureState('review');
      setStatus(photoStatus, '', true);
    } catch {
      await restoreLiveCameraAfterCaptureFailure();
    }
  }

  async function retakePhoto() {
    clearPhoto();
    if (!cameraStream) await startCamera();
  }

  function usePhoto() {
    if (!photoBlob) {
      setStatus(photoStatus, T[lang].photoRequired);
      return;
    }
    stopCamera();
    renderReview(pendingVisitorPayload || formPayload());
    show(reviewScreen);
  }

  function handleKioskAuthFailure(resp, data) {
    if (resp.status === 401 || resp.status === 403 || data?.error === 'kiosk_forbidden') {
      clearCredential();
      show(setupScreen);
      setStatus(setupStatus, `${T.en.rePair}\n${T.es.rePair}`);
      return true;
    }
    return false;
  }

  async function uploadVisitorPhoto(visitId) {
    const cred = credential();
    const resp = await fetch(new URL('/visitor/kiosk/photo', API_BASE), {
      method: 'POST',
      headers: {
        'content-type': 'image/jpeg',
        'x-visitor-kiosk': cred,
        'x-visitor-visit': String(visitId || ''),
        'x-visitor-dedupe': pendingSubmissionId
      },
      cache: 'no-store',
      body: photoBlob
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) {
      if (handleKioskAuthFailure(resp, data)) return false;
      throw new Error(data?.error || `HTTP ${resp.status}`);
    }
    return true;
  }

  async function submitVisitor() {
    if (busy) return;
    const cred = credential();
    if (!cred) {
      show(setupScreen);
      return;
    }
    const visitor = pendingVisitorPayload || formPayload();
    if (missingRequired(visitor)) {
      show(formScreen);
      setStatus(formStatus, T[lang].required);
      return;
    }
    if (!photoBlob) {
      show(photoScreen);
      setStatus(photoStatus, T[lang].photoRequired);
      return;
    }
    busy = true;
    submitBtn.disabled = true;
    setStatus(reviewStatus, T[lang].submitting, true);
    try {
      if (!pendingSubmissionId) pendingSubmissionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const resp = await fetch(new URL('/visitor/kiosk/submit', API_BASE), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-visitor-kiosk': cred
        },
        cache: 'no-store',
        body: JSON.stringify({ dedupe_key: pendingSubmissionId, visitor })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) {
        if (handleKioskAuthFailure(resp, data)) return;
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      const visitId = data?.visit?.visit_id || '';
      if (!visitId) throw new Error('visit_id_missing');
      const uploaded = await uploadVisitorPhoto(visitId);
      if (!uploaded) return;
      resetForm();
      $('thanksTitle').textContent = T[lang].thanksTitle;
      $('thanksMessage').textContent = T[lang].thanks;
      show(thanksScreen);
      window.setTimeout(() => {
        lang = 'en';
        show(languageScreen);
      }, 7000);
    } catch {
      setStatus(reviewStatus, T[lang].failed);
    } finally {
      busy = false;
      submitBtn.disabled = false;
    }
  }

  async function pairKiosk(ev) {
    ev.preventDefault();
    const code = Shared.cleanText($('pairCode').value, 20).replace(/\D+/g, '').slice(0, 6);
    const label = Shared.cleanText($('kioskLabel').value, 80) || 'Front Desk iPad';
    if (code.length !== 6) {
      setStatus(setupStatus, 'Enter the 6-digit pairing code.');
      return;
    }
    setStatus(setupStatus, 'Pairing...', true);
    try {
      const resp = await fetch(new URL('/visitor/kiosk/pair', API_BASE), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ code, label })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok || !data.kiosk_credential) throw new Error(data?.error || `HTTP ${resp.status}`);
      localStorage.setItem(CRED_KEY, String(data.kiosk_credential));
      localStorage.setItem(KIOSK_ID_KEY, String(data.kiosk_id || ''));
      $('pairCode').value = '';
      setStatus(setupStatus, 'Paired.', true);
      show(languageScreen);
    } catch (err) {
      setStatus(setupStatus, `Pairing failed: ${err?.message || err}`);
    }
  }

  function boot() {
    document.querySelectorAll('.languageBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setLang(btn.dataset.lang);
        resetForm();
        show(formScreen);
      });
    });
    $('backBtn').addEventListener('click', () => {
      resetForm();
      show(languageScreen);
    });
    $('photoBackBtn').addEventListener('click', () => {
      stopCamera();
      show(formScreen);
    });
    $('reviewBackBtn').addEventListener('click', async () => {
      show(photoScreen);
      await startCamera();
    });
    nextPhotoBtn.addEventListener('click', openPhotoStep);
    $('takePhotoBtn').addEventListener('click', takePhoto);
    $('retakePhotoBtn').addEventListener('click', retakePhoto);
    $('usePhotoBtn').addEventListener('click', usePhoto);
    submitBtn.addEventListener('click', submitVisitor);
    visitorForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      openPhotoStep();
    });
    $('pairForm').addEventListener('submit', pairKiosk);
    window.addEventListener('pagehide', stopCamera);
    setLang('en');
    show(credential() ? languageScreen : setupScreen);
  }

  window.addEventListener('DOMContentLoaded', boot);
})();

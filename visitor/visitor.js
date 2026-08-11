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
      dateOfBirth: 'Date of Birth',
      destination: 'Person or Department Being Visited',
      details: 'Additional Detail',
      nextPhoto: 'Continue to Visitor Photo',
      back: 'Back',
      cancel: 'Cancel',
      privacy: 'Scanning an ID is optional and is used only to help fill in your name and date of birth. EagleNEST does not store the ID image, ID number, or raw barcode data. A current visitor photo is securely stored for up to 30 days for building security and then automatically deleted.',
      required: 'Please complete the highlighted required fields.',
      firstNameRequired: 'First name is required.',
      lastNameRequired: 'Last name is required.',
      dobRequired: 'Date of birth is required.',
      dobInvalid: 'Enter a valid date of birth.',
      dobFuture: 'Date of birth cannot be in the future.',
      typeRequired: 'Visitor type is required.',
      purposeRequired: 'Purpose is required.',
      idPrefillTitle: 'Use ID to Fill Form',
      idPrefillIntro: 'Optional. You can scan an ID or enter information manually.',
      stateIdPrefill: 'Scan State ID / Driver License',
      idnycPrefill: 'Scan IDNYC',
      manualEntry: 'Enter Information Manually',
      stateIdScanPrompt: 'Scanner input active. Scan the PDF417 barcode now.',
      idPrefillSuccess: 'Information filled from ID. Please confirm it is correct.',
      idPrefillNeedsCompletion: 'We could not fill all required fields. Please complete the highlighted fields.',
      idnycPrompt: 'Place the FRONT of your IDNYC card inside the frame.',
      idnycUnreadable: "We couldn't read all of the information. Please complete the highlighted fields.",
      photoTitle: 'Visitor Photo',
      photoIntro: 'Please look at the camera.',
      nativePhotoPrompt: 'Take a current visitor photo.',
      takePhoto: 'Take Photo',
      retake: 'Retake',
      usePhoto: 'Use Photo',
      cameraStarting: 'Starting camera...',
      cameraFailed: 'The camera is not available. Please ask security for help.',
      photoCaptureFailed: 'Photo could not be captured. Please try again.',
      photoCaptureBad: 'Photo could not be captured correctly. Please retake the photo.',
      photoTooLarge: 'Please retake the photo.',
      photoRequired: 'A visitor photo is required.',
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
      dateOfBirth: 'Fecha de nacimiento',
      destination: 'Persona o departamento que visita',
      details: 'Detalle adicional',
      nextPhoto: 'Continuar a la foto',
      back: 'Atrás',
      cancel: 'Cancelar',
      privacy: 'Escanear una identificación es opcional y solo se usa para ayudar a completar su nombre y fecha de nacimiento. EagleNEST no guarda la imagen de la identificación, el número de identificación ni los datos originales del código de barras. Una foto actual del visitante se guarda de forma segura por hasta 30 días para la seguridad del edificio y luego se elimina automáticamente.',
      required: 'Complete los campos obligatorios resaltados.',
      firstNameRequired: 'El nombre es obligatorio.',
      lastNameRequired: 'El apellido es obligatorio.',
      dobRequired: 'La fecha de nacimiento es obligatoria.',
      dobInvalid: 'Ingrese una fecha de nacimiento válida.',
      dobFuture: 'La fecha de nacimiento no puede ser una fecha futura.',
      typeRequired: 'El tipo de visitante es obligatorio.',
      purposeRequired: 'El propósito es obligatorio.',
      idPrefillTitle: 'Usar identificación para completar',
      idPrefillIntro: 'Opcional. Puede escanear una identificación o ingresar la información manualmente.',
      stateIdPrefill: 'Escanear identificación estatal / licencia',
      idnycPrefill: 'Escanear IDNYC',
      manualEntry: 'Ingresar información manualmente',
      stateIdScanPrompt: 'Entrada del escáner activa. Escanee el código PDF417 ahora.',
      idPrefillSuccess: 'La información se completó desde la identificación. Confirme que sea correcta.',
      idPrefillNeedsCompletion: 'No pudimos completar todos los campos obligatorios. Complete los campos resaltados.',
      idnycPrompt: 'Coloque el FRENTE de su tarjeta IDNYC dentro del marco.',
      idnycUnreadable: 'No pudimos leer toda la información. Complete los campos resaltados.',
      photoTitle: 'Foto del visitante',
      photoIntro: 'Mire a la cámara.',
      nativePhotoPrompt: 'Tome una foto actual del visitante.',
      takePhoto: 'Tomar foto',
      retake: 'Volver a tomar',
      usePhoto: 'Usar foto',
      cameraStarting: 'Iniciando cámara...',
      cameraFailed: 'La cámara no está disponible. Pida ayuda al personal de seguridad.',
      photoCaptureFailed: 'No se pudo tomar la foto. Inténtelo de nuevo.',
      photoCaptureBad: 'No se pudo tomar la foto correctamente. Vuelva a tomarla.',
      photoTooLarge: 'Vuelva a tomar la foto.',
      photoRequired: 'Se requiere una foto del visitante.',
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
  const nativePhotoInput = $('visitorPhotoInput');
  const idnycCaptureInput = $('idnycCaptureInput');
  const stateIdScanPanel = $('stateIdScanPanel');
  const validationSummary = $('validationSummary');

  let lang = 'en';
  let visitorType = '';
  let purpose = '';
  let busy = false;
  let pendingSubmissionId = '';
  let pendingVisitorPayload = null;
  let cameraStream = null;
  let photoBlob = null;
  let photoObjectUrl = '';
  let formSubmitAttempted = false;
  let idScanActive = false;
  const touchedFields = new Set();

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
      if (kind === 'type') {
        visitorType = key;
        touchedFields.add('visitor_type');
      } else {
        purpose = key;
        touchedFields.add('purpose');
      }
      renderChoices();
      validateForm({ focus: false });
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
    cameraPreview.hidden = true;
    photoPreview.hidden = mode !== 'review';
    $('nativePhotoPrompt').hidden = mode !== 'live';
    $('takePhotoBtn').hidden = mode !== 'live';
    $('retakePhotoBtn').hidden = mode !== 'review';
    $('usePhotoBtn').hidden = mode !== 'review';
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

  function clearPhoto() {
    photoBlob = null;
    revokePhotoUrl();
    if (nativePhotoInput) nativePhotoInput.value = '';
    photoPreview.removeAttribute('src');
    setPhotoCaptureState('live');
  }

  function fieldWrapper(field) {
    return visitorForm.querySelector(`[data-field="${field}"]`);
  }

  function fieldInput(field) {
    if (field === 'visitor_type') return $('typeChoices');
    if (field === 'purpose') return $('purposeChoices');
    return visitorForm.querySelector(`[name="${field}"]`) || $(field);
  }

  function setFieldError(field, message) {
    const wrap = fieldWrapper(field);
    const err = visitorForm.querySelector(`[data-error-for="${field}"]`);
    const input = fieldInput(field);
    if (wrap) wrap.classList.toggle('invalidField', !!message);
    if (err) {
      err.textContent = message || '';
      if (!err.id) err.id = `error_${field}`;
    }
    if (input) {
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (message && err?.id) input.setAttribute('aria-describedby', err.id);
      else input.removeAttribute('aria-describedby');
    }
  }

  function clearValidation() {
    ['visitor_first_name', 'visitor_last_name', 'date_of_birth', 'visitor_type', 'purpose'].forEach((field) => setFieldError(field, ''));
    if (validationSummary) validationSummary.textContent = '';
    if (cameraFrame) cameraFrame.classList.remove('invalidField');
  }

  function dobError(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return T[lang].dobRequired;
    const normalized = Shared.normalizeDateOfBirth(raw);
    if (!normalized) return T[lang].dobInvalid;
    if (Shared.isFutureDate(normalized)) return T[lang].dobFuture;
    return '';
  }

  function validationErrors(visitor) {
    const errors = {};
    if (!visitor.visitor_first_name) errors.visitor_first_name = T[lang].firstNameRequired;
    if (!visitor.visitor_last_name) errors.visitor_last_name = T[lang].lastNameRequired;
    const dobMsg = dobError(visitorForm.elements.date_of_birth.value || visitor.date_of_birth);
    if (dobMsg) errors.date_of_birth = dobMsg;
    if (!visitor.visitor_type) errors.visitor_type = T[lang].typeRequired;
    if (!visitor.purpose) errors.purpose = T[lang].purposeRequired;
    return errors;
  }

  function focusFirstInvalid(errors) {
    const first = Object.keys(errors || {})[0];
    if (!first) return;
    const wrap = fieldWrapper(first);
    const input = fieldInput(first);
    try { wrap?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    window.setTimeout(() => {
      try { (input || wrap)?.focus?.({ preventScroll: true }); } catch {}
    }, 180);
  }

  function validateForm(opts = {}) {
    const visitor = formPayload();
    const errors = validationErrors(visitor);
    const markAll = opts.markAll === true || formSubmitAttempted;
    ['visitor_first_name', 'visitor_last_name', 'date_of_birth', 'visitor_type', 'purpose'].forEach((field) => {
      const shouldShow = markAll || touchedFields.has(field);
      setFieldError(field, shouldShow ? (errors[field] || '') : '');
    });
    if (markAll && Object.keys(errors).length) {
      if (validationSummary) validationSummary.textContent = T[lang].required;
      setStatus(formStatus, T[lang].required);
      if (opts.focus !== false) focusFirstInvalid(errors);
      return false;
    }
    if (!Object.keys(errors).length) {
      if (validationSummary) validationSummary.textContent = '';
      setStatus(formStatus, '');
    }
    return Object.keys(errors).length === 0;
  }

  function setPhotoRequiredError(showError, message) {
    if (cameraFrame) cameraFrame.classList.toggle('invalidField', !!showError);
    setStatus(photoStatus, showError ? (message || T[lang].photoRequired) : '');
  }

  function resetForm() {
    visitorForm.reset();
    visitorType = '';
    purpose = '';
    pendingSubmissionId = '';
    pendingVisitorPayload = null;
    busy = false;
    formSubmitAttempted = false;
    touchedFields.clear();
    clearPhoto();
    stopCamera();
    closeStateIdScan();
    clearValidation();
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
      date_of_birth: Shared.normalizeDateOfBirth(fd.get('date_of_birth')),
      visitor_type: visitorType,
      organization: Shared.cleanText(fd.get('organization'), 140),
      purpose,
      destination: Shared.cleanText(fd.get('destination'), 160),
      notes: Shared.cleanText(fd.get('notes'), 400)
    };
  }

  function missingRequired(v) {
    return !v.visitor_first_name || !v.visitor_last_name || !v.date_of_birth || Shared.isFutureDate(v.date_of_birth) || !v.visitor_type || !v.purpose;
  }

  function renderReview(visitor) {
    const photoUrl = photoObjectUrl || '';
    $('reviewPhoto').src = photoUrl;
    $('reviewPhoto').alt = T[lang].photoTitle;
    const rows = [
      [T[lang].firstName, visitor.visitor_first_name],
      [T[lang].middleName, visitor.visitor_middle_name || '-'],
      [T[lang].lastName, visitor.visitor_last_name],
      [T[lang].dateOfBirth, visitor.date_of_birth],
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

  async function openPhotoStep() {
    if (busy) return;
    formSubmitAttempted = true;
    if (!validateForm({ markAll: true })) {
      return;
    }
    const visitor = formPayload();
    pendingVisitorPayload = visitor;
    setStatus(formStatus, '');
    show(photoScreen);
    stopCamera();
    setPhotoCaptureState(photoBlob ? 'review' : 'live');
  }

  function takePhoto() {
    setPhotoRequiredError(false);
    if (!nativePhotoInput) {
      setStatus(photoStatus, T[lang].cameraFailed);
      return;
    }
    nativePhotoInput.value = '';
    nativePhotoInput.click();
  }

  async function retakePhoto() {
    clearPhoto();
    takePhoto();
  }

  async function handleNativePhotoSelected(ev) {
    const file = ev?.target?.files?.[0] || null;
    if (!file) return;
    let nextUrl = '';
    try {
      const blob = await Shared.processVisitorPhotoFile(file, {
        width: 720,
        height: 900,
        quality: 0.82,
        maxBytes: PHOTO_MAX_BYTES
      });
      if (!blob || blob.size <= 0) throw new Error('photo_empty');
      if (blob.size > PHOTO_MAX_BYTES) throw new Error('photo_too_large');
      nextUrl = URL.createObjectURL(blob);
      await waitForPhotoPreviewImage(nextUrl);
      revokePhotoUrl();
      photoBlob = blob;
      photoObjectUrl = nextUrl;
      nextUrl = '';
      setPhotoCaptureState('review');
      setPhotoRequiredError(false);
    } catch (err) {
      if (nextUrl) {
        try { URL.revokeObjectURL(nextUrl); } catch {}
      }
      photoPreview.removeAttribute('src');
      photoBlob = null;
      const msg = String(err?.message || err) === 'photo_black_frame' ? T[lang].photoCaptureBad : T[lang].photoCaptureFailed;
      setPhotoCaptureState('live');
      setPhotoRequiredError(true, msg);
    } finally {
      if (nativePhotoInput) nativePhotoInput.value = '';
    }
  }

  function usePhoto() {
    if (!photoBlob) {
      setPhotoRequiredError(true, T[lang].photoRequired);
      return;
    }
    stopCamera();
    renderReview(pendingVisitorPayload || formPayload());
    show(reviewScreen);
  }

  function applyIdPrefill(data, okMessage) {
    const d = data || {};
    const els = visitorForm.elements;
    if (d.visitor_first_name) els.visitor_first_name.value = d.visitor_first_name;
    if (Object.prototype.hasOwnProperty.call(d, 'visitor_middle_name')) els.visitor_middle_name.value = d.visitor_middle_name || '';
    if (d.visitor_last_name) els.visitor_last_name.value = d.visitor_last_name;
    if (d.date_of_birth) els.date_of_birth.value = Shared.normalizeDateOfBirth(d.date_of_birth);
    ['visitor_first_name', 'visitor_last_name', 'date_of_birth'].forEach((field) => touchedFields.add(field));
    const complete = validateForm({ markAll: true, focus: false });
    setStatus(formStatus, complete ? okMessage : T[lang].idPrefillNeedsCompletion, complete);
    if (!complete) focusFirstInvalid(validationErrors(formPayload()));
  }

  function hasIdPrefillData(data) {
    return !!(data?.visitor_first_name || data?.visitor_middle_name || data?.visitor_last_name || data?.date_of_birth);
  }

  function closeStateIdScan() {
    idScanActive = false;
    stateIdScanPanel.hidden = true;
    stateIdScanner.reset();
  }

  function handleStateIdScan(scan) {
    let raw = String(scan || '');
    const parsed = Shared.parseAamva(raw);
    raw = '';
    closeStateIdScan();
    if (!parsed.ok) {
      setStatus(formStatus, T[lang].idPrefillNeedsCompletion);
      validateForm({ markAll: true, focus: false });
      return;
    }
    applyIdPrefill(parsed.data || {}, T[lang].idPrefillSuccess);
  }

  const stateIdScanner = Shared.createScannerBuffer(handleStateIdScan, {
    multiline: true,
    settleMs: 120,
    minLength: 30
  });

  function startStateIdPrefill() {
    setStatus(formStatus, '');
    idScanActive = true;
    stateIdScanPanel.hidden = false;
    setTimeout(() => $('stateIdScanTarget')?.focus(), 40);
  }

  function stateIdKeydown(ev) {
    if (!idScanActive) return;
    if (ev.target?.closest?.('input, textarea, select') && ev.target !== $('stateIdScanTarget')) return;
    stateIdScanner.keydown(ev);
  }

  async function readIdnycTextLocally(file) {
    if (!('TextDetector' in window)) return '';
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const detector = new window.TextDetector();
      const rows = await detector.detect(bitmap);
      return (rows || []).map((r) => Shared.cleanText(r.rawValue || r.detectedText || '', 180)).filter(Boolean).join('\n');
    } catch {
      return '';
    } finally {
      try { bitmap?.close?.(); } catch {}
    }
  }

  async function startIdnycPrefill() {
    if (!idnycCaptureInput) {
      setStatus(formStatus, T[lang].idnycUnreadable);
      return;
    }
    setStatus(formStatus, T[lang].idnycPrompt, true);
    idnycCaptureInput.value = '';
    idnycCaptureInput.click();
  }

  async function handleIdnycCapture(ev) {
    const file = ev?.target?.files?.[0] || null;
    if (!file) return;
    try {
      if (!String(file.type || '').toLowerCase().startsWith('image/')) throw new Error('idnyc_image_invalid');
      const text = await readIdnycTextLocally(file);
      const parsed = Shared.parseIdnycOcrText(text);
      if (hasIdPrefillData(parsed.data)) applyIdPrefill(parsed.data || {}, T[lang].idPrefillSuccess);
      if (!parsed.ok) {
        setStatus(formStatus, T[lang].idnycUnreadable);
        validateForm({ markAll: true, focus: false });
        return;
      }
    } catch {
      setStatus(formStatus, T[lang].idnycUnreadable);
      validateForm({ markAll: true, focus: false });
    } finally {
      if (idnycCaptureInput) idnycCaptureInput.value = '';
    }
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
      formSubmitAttempted = true;
      validateForm({ markAll: true });
      return;
    }
    if (!photoBlob) {
      show(photoScreen);
      setPhotoRequiredError(true, T[lang].photoRequired);
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
    $('reviewBackBtn').addEventListener('click', () => {
      show(photoScreen);
      setPhotoCaptureState(photoBlob ? 'review' : 'live');
    });
    nextPhotoBtn.addEventListener('click', openPhotoStep);
    $('takePhotoBtn').addEventListener('click', takePhoto);
    $('retakePhotoBtn').addEventListener('click', retakePhoto);
    $('usePhotoBtn').addEventListener('click', usePhoto);
    nativePhotoInput?.addEventListener('change', handleNativePhotoSelected);
    $('stateIdPrefillBtn')?.addEventListener('click', startStateIdPrefill);
    $('cancelStateIdScanBtn')?.addEventListener('click', closeStateIdScan);
    $('manualEntryBtn')?.addEventListener('click', () => {
      closeStateIdScan();
      setStatus(formStatus, '');
    });
    idnycCaptureInput?.addEventListener('change', handleIdnycCapture);
    $('idnycPrefillBtn')?.addEventListener('click', startIdnycPrefill);
    document.addEventListener('keydown', stateIdKeydown);
    visitorForm.querySelectorAll('input, textarea').forEach((el) => {
      const name = el.name;
      if (!name) return;
      el.addEventListener('blur', () => {
        touchedFields.add(name);
        validateForm({ focus: false });
      });
      el.addEventListener('input', () => {
        if (name === 'date_of_birth' && el.value) el.value = Shared.normalizeDateOfBirth(el.value) || el.value;
        if (touchedFields.has(name) || formSubmitAttempted) validateForm({ focus: false });
      });
    });
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

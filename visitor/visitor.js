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
      studentName: 'Student Name',
      details: 'Additional Detail',
      submit: 'Submit Check-In Request',
      back: 'Back',
      privacy: 'Identification may be reviewed or scanned by security to help verify visitor information. EagleNEST does not store an ID image or identification number.',
      required: 'Please complete first name, last name, visitor type, and purpose.',
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
      studentName: 'Nombre del estudiante',
      details: 'Detalle adicional',
      submit: 'Enviar solicitud de registro',
      back: 'Atrás',
      privacy: 'El personal de seguridad puede revisar o escanear una identificación para ayudar a verificar la información del visitante. EagleNEST no guarda imagen de la identificación ni número de identificación.',
      required: 'Complete nombre, apellido, tipo de visitante y propósito.',
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
  const thanksScreen = $('thanksScreen');
  const visitorForm = $('visitorForm');
  const formStatus = $('formStatus');
  const setupStatus = $('setupStatus');
  const submitBtn = $('submitBtn');

  let lang = 'en';
  let visitorType = '';
  let purpose = '';
  let busy = false;
  let pendingSubmissionId = '';

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
    [setupScreen, languageScreen, formScreen, thanksScreen].forEach((el) => { if (el) el.hidden = el !== screen; });
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
    $('privacyNotice').textContent = strings.privacy;
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
      $('studentNameWrap').hidden = purpose !== 'student_pickup';
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

  function resetForm() {
    visitorForm.reset();
    visitorType = '';
    purpose = '';
    pendingSubmissionId = '';
    $('studentNameWrap').hidden = true;
    setStatus(formStatus, '');
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
      student_name: Shared.cleanText(fd.get('student_name'), 140),
      notes: Shared.cleanText(fd.get('notes'), 400)
    };
  }

  function missingRequired(v) {
    return !v.visitor_first_name || !v.visitor_last_name || !v.visitor_type || !v.purpose;
  }

  async function submitVisitor(ev) {
    ev.preventDefault();
    if (busy) return;
    const cred = credential();
    if (!cred) {
      show(setupScreen);
      return;
    }
    const visitor = formPayload();
    if (missingRequired(visitor)) {
      setStatus(formStatus, T[lang].required);
      return;
    }
    busy = true;
    submitBtn.disabled = true;
    setStatus(formStatus, T[lang].submitting, true);
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
        if (resp.status === 401 || resp.status === 403 || data?.error === 'kiosk_forbidden') {
          clearCredential();
          show(setupScreen);
          setStatus(setupStatus, `${T.en.rePair}\n${T.es.rePair}`);
          return;
        }
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      resetForm();
      $('thanksTitle').textContent = T[lang].thanksTitle;
      $('thanksMessage').textContent = T[lang].thanks;
      show(thanksScreen);
      window.setTimeout(() => {
        lang = 'en';
        show(languageScreen);
      }, 7000);
    } catch {
      setStatus(formStatus, T[lang].failed);
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
    visitorForm.addEventListener('submit', submitVisitor);
    $('pairForm').addEventListener('submit', pairKiosk);
    setLang('en');
    show(credential() ? languageScreen : setupScreen);
  }

  window.addEventListener('DOMContentLoaded', boot);
})();

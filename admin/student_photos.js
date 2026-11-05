/* EAGLENEST_STUDENT_PHOTOS_V1_2
 * Private Student Lookup portrait and configurable Teacher Attendance hover.
 * Config is fetched from the Worker and refreshed while the page is open.
 */
(() => {
  'use strict';
  const apiBase = (document.querySelector('meta[name="api-base"]')?.content || '')
    .replace(/\/*$/, '') + '/';
  const emptySettings = Object.freeze({ enabled:false, hover_enabled:false, hover_delay_ms:500 });
  let settings = emptySettings; // fail closed until authenticated settings load
  const listeners = new Set();
  const photoCache = new Map();
  const ALLOWED_SIZES = new Set([0.5, 1, 1.5, 2, 2.5, 3]);
  let sizeMultiplier = 1;
  const sizeListeners = new Set();

  async function refreshPersonalSize() {
    try {
      const response = await fetch(new URL('/admin/student/photo/preferences', apiBase), {
        method:'GET', headers:sessionHeaders(), credentials:'include', cache:'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const size = Number(data?.size_multiplier);
      if (!data?.ok || !ALLOWED_SIZES.has(size)) throw new Error('Invalid personal photo size');
      if (size === sizeMultiplier) return;
      sizeMultiplier = size;
      for (const listener of sizeListeners) listener(sizeMultiplier);
    } catch {
      // Default sizing is safe even when the personal preference service is offline.
      if (sizeMultiplier === 1) return;
      sizeMultiplier = 1;
      for (const listener of sizeListeners) listener(1);
    }
  }
  function onSizeChange(listener) {
    sizeListeners.add(listener);
    listener(sizeMultiplier);
  }

  function sessionHeaders() {
    const headers = new Headers();
    const sid = window.EAGLENEST_AUTH?.getSid?.() || '';
    if (sid) headers.set('x-admin-session', sid);
    return headers;
  }
  function subscribe(listener) {
    listeners.add(listener);
    listener(settings);
  }
  function clearPhotoCache() {
    for (const promise of photoCache.values()) {
      Promise.resolve(promise).then(url => { if (url) URL.revokeObjectURL(url); }).catch(() => {});
    }
    photoCache.clear();
  }
  function applySettings(next) {
    const changed = settings.enabled !== next.enabled ||
      settings.hover_enabled !== next.hover_enabled ||
      settings.hover_delay_ms !== next.hover_delay_ms;
    if (!changed) return;
    if (!next.enabled) clearPhotoCache();
    settings = next;
    for (const listener of listeners) listener(settings);
  }
  async function refreshSettings() {
    try {
      const url = new URL('/admin/student/photo/settings', apiBase);
      const response = await fetch(url, {
        method:'GET', headers:sessionHeaders(), credentials:'include', cache:'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data?.ok || typeof data.enabled !== 'boolean' ||
          typeof data.hover_enabled !== 'boolean' ||
          !Number.isInteger(data.hover_delay_ms)) throw new Error('Invalid settings');
      applySettings({
        enabled:data.enabled,
        hover_enabled:data.hover_enabled,
        hover_delay_ms:Math.max(100, Math.min(5000, data.hover_delay_ms))
      });
    } catch {
      applySettings(emptySettings); // no photo display without confirmed authorization
    }
  }

  async function photoFor(osis) {
    if (!settings.enabled || !/^\d{9}$/.test(osis)) return null;
    if (photoCache.has(osis)) return photoCache.get(osis);
    const pending = (async () => {
      const url = new URL('/admin/student/photo', apiBase);
      url.searchParams.set('osis', osis);
      const response = await fetch(url, {
        method:'GET', headers:sessionHeaders(), credentials:'include', cache:'no-store'
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Photo request HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size || !/^image\/webp\b/i.test(blob.type)) throw new Error('Unexpected image');
      return URL.createObjectURL(blob);
    })();
    photoCache.set(osis, pending);
    try {
      return await pending;
    } catch (error) {
      photoCache.delete(osis);
      throw error;
    }
  }

  function initStudentLookup() {
    const card = document.getElementById('studentCard');
    const portrait = card?.querySelector('.studentPortrait');
    const image = document.getElementById('studentLookupPortraitImage');
    const placeholder = document.getElementById('studentLookupPortraitFallback');
    if (!card || !portrait || !image || !placeholder) return;
    let sequence = 0;
    let current = '';
    let lightbox = null, lightboxImage = null, lightboxViewport = null;
    let lightboxCanvas = null, zoomRange = null, zoomOutput = null;
    let focusBeforeLightbox = null, savedBodyOverflow = '';

    function closeLightbox() {
      if (!lightbox || lightbox.hidden) return;
      lightbox.hidden = true;
      lightboxImage.removeAttribute('src');
      document.body.style.overflow = savedBodyOverflow;
      const target = focusBeforeLightbox;
      focusBeforeLightbox = null;
      if (target?.isConnected) target.focus({preventScroll:true});
    }
    function resizeLightbox() {
      if (!lightbox || lightbox.hidden || !lightboxImage?.naturalWidth) return;
      const ratio = lightboxImage.naturalWidth / lightboxImage.naturalHeight;
      const baseWidth = Math.max(40, Math.min(
        lightboxImage.naturalWidth,
        lightboxViewport.clientWidth - 28,
        (lightboxViewport.clientHeight - 28) * ratio
      ));
      const zoom = Number(zoomRange.value) || 1;
      const pixelWidth = Math.max(1, Math.round(baseWidth * zoom));
      const pixelHeight = Math.max(1, Math.round(pixelWidth / ratio));
      lightboxImage.style.width = pixelWidth + 'px';
      lightboxImage.style.height = pixelHeight + 'px';
      lightboxCanvas.style.width = Math.max(lightboxViewport.clientWidth, pixelWidth + 28) + 'px';
      lightboxCanvas.style.height = Math.max(lightboxViewport.clientHeight, pixelHeight + 28) + 'px';
      zoomOutput.textContent = Math.round(zoom * 100) + '%';
      lightboxViewport.scrollLeft = Math.max(0, (lightboxViewport.scrollWidth - lightboxViewport.clientWidth) / 2);
      lightboxViewport.scrollTop = Math.max(0, (lightboxViewport.scrollHeight - lightboxViewport.clientHeight) / 2);
    }
    function ensureLightbox() {
      if (lightbox) return;
      lightbox = document.createElement('div');
      lightbox.className = 'studentPhotoLightbox';
      lightbox.hidden = true;
      lightbox.setAttribute('role','dialog');
      lightbox.setAttribute('aria-modal','true');
      lightbox.setAttribute('aria-label','Student photo enlargement');
      lightbox.innerHTML = `
        <div class="studentPhotoLightboxPanel">
          <header class="studentPhotoLightboxHead">
            <strong class="studentPhotoLightboxName"></strong>
            <button type="button" class="studentPhotoLightboxClose" aria-label="Close enlarged photo">×</button>
          </header>
          <div class="studentPhotoLightboxViewport">
            <div class="studentPhotoLightboxCanvas"><img alt="Enlarged student portrait"></div>
          </div>
          <footer class="studentPhotoLightboxZoom">
            <label for="studentPhotoZoom">Zoom</label>
            <input id="studentPhotoZoom" type="range" min="1" max="4" step="0.25" value="1" aria-label="Photo zoom">
            <output for="studentPhotoZoom">100%</output>
          </footer>
        </div>`;
      document.body.appendChild(lightbox);
      lightboxImage = lightbox.querySelector('img');
      lightboxViewport = lightbox.querySelector('.studentPhotoLightboxViewport');
      lightboxCanvas = lightbox.querySelector('.studentPhotoLightboxCanvas');
      zoomRange = lightbox.querySelector('input[type="range"]');
      zoomOutput = lightbox.querySelector('output');
      lightbox.querySelector('.studentPhotoLightboxClose').addEventListener('click',closeLightbox);
      lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox) closeLightbox();
      });
      zoomRange.addEventListener('input', resizeLightbox);
      lightboxImage.addEventListener('load', resizeLightbox);
      window.addEventListener('resize', resizeLightbox);
      document.addEventListener('keydown', (event) => {
        if (lightbox.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); closeLightbox(); }
        if (event.key === 'Tab') {
          const close = lightbox.querySelector('.studentPhotoLightboxClose');
          if (event.shiftKey && document.activeElement === close) {
            event.preventDefault(); zoomRange.focus();
          } else if (!event.shiftKey && document.activeElement === zoomRange) {
            event.preventDefault(); close.focus();
          }
        }
      });
    }
    function openLightbox() {
      if (!settings.enabled || image.hidden || !image.getAttribute('src')) return;
      ensureLightbox();
      focusBeforeLightbox = document.activeElement;
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      lightbox.hidden = false;
      lightbox.querySelector('.studentPhotoLightboxName').textContent =
        document.getElementById('studentName')?.textContent?.trim() || 'Student portrait';
      zoomRange.value = '1';
      lightboxImage.src = image.src; // same authenticated object URL; no second network request
      resizeLightbox();
      lightbox.querySelector('.studentPhotoLightboxClose').focus({preventScroll:true});
    }
    portrait.addEventListener('click', openLightbox);
    portrait.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (!portrait.classList.contains('studentPortraitClickable')) return;
        event.preventDefault(); openLightbox();
      }
    });
    onSizeChange(size => {
      card.style.setProperty('--student-photo-scale',String(size));
      card.classList.toggle('studentPhotoSizeLarge', size >= 2);
    });

    function clear() {
      ++sequence;
      closeLightbox();
      portrait.classList.remove('studentPortraitClickable');
      portrait.removeAttribute('role');
      portrait.removeAttribute('tabindex');
      portrait.removeAttribute('aria-label');
      image.hidden = true;
      image.removeAttribute('src');
      placeholder.hidden = false;
    }
    async function changeStudent(value) {
      current = String(value || '').trim();
      clear(); // also closes the enlargement when selecting a different student
      const ticket = sequence;
      placeholder.hidden = false;
      if (!settings.enabled) return;
      placeholder.textContent = /^\d{9}$/.test(current) ? 'Loading photo…' : 'No photo';
      if (!/^\d{9}$/.test(current)) return;
      try {
        const objectUrl = await photoFor(current);
        if (ticket !== sequence || !settings.enabled) return;
        if (!objectUrl) { placeholder.textContent = 'No photo on file'; return; }
        image.src = objectUrl;
        image.alt = 'Student portrait';
        image.hidden = false;
        placeholder.hidden = true;
        portrait.classList.add('studentPortraitClickable');
        portrait.setAttribute('role','button');
        portrait.setAttribute('tabindex','0');
        portrait.setAttribute('aria-label','Enlarge student portrait');
      } catch {
        if (ticket === sequence && settings.enabled) placeholder.textContent = 'Photo unavailable';
      }
    }
    subscribe(next => {
      card.classList.toggle('studentPhotoEnabled', next.enabled);
      portrait.hidden = !next.enabled;
      if (!next.enabled) clear();
      else changeStudent(current);
    });
    document.addEventListener('eaglenest:student-lookup-selected', (event) => {
      changeStudent(event?.detail?.osis);
    });
    document.addEventListener('eaglenest:student-lookup-refreshed', (event) => {
      const osis = String(event?.detail?.osis || '').trim();
      if (osis && osis !== current) changeStudent(osis);
    });
    const initial = String(new URL(location.href).searchParams.get('osis') || '').trim();
    const meta = document.getElementById('studentMeta')?.textContent || '';
    const shown = meta.match(/\bOSIS\s+(\d{9})\b/i)?.[1] || '';
    if (shown || (initial && !card.hidden)) changeStudent(shown || initial);
  }

  function initTeacherAttendance() {
    if (!document.getElementById('rows')) return;
    const popup = document.createElement('div');
    popup.className = 'studentPhotoHoverCard';
    popup.hidden = true;
    popup.setAttribute('role', 'status');
    popup.setAttribute('aria-live', 'off');
    const image = document.createElement('img');
    image.hidden = true;
    image.alt = 'Student portrait';
    const name = document.createElement('div');
    name.className = 'studentPhotoHoverName';
    const status = document.createElement('div');
    status.className = 'studentPhotoHoverStatus';
    popup.append(image, name, status);
    document.body.appendChild(popup);

    let hovered = null, osis = '', timer = null, generation = 0, px = 0, py = 0;
    onSizeChange(size => {
      popup.style.setProperty('--student-photo-scale',String(size));
      if (!popup.hidden) locate();
    });

    function resolveName(element) {
      const target = element?.closest?.('#rows .student, .outInName');
      if (!target) return null;
      const row = target.closest('.row, .outInRow');
      if (!row) return null;
      const possible = [
        target.dataset.photoOsis,
        row.dataset.osis,
        row.querySelector('.outInMeta')?.textContent,
        row.querySelector('.mono.hide-sm')?.textContent,
        row.querySelector('.subline')?.textContent
      ];
      for (const candidate of possible) {
        const match = String(candidate || '').match(/(?:^|\D)(\d{9})(?!\d)/);
        if (match) return { target, osis:match[1], name:target.textContent.trim() };
      }
      return null;
    }
    function locate() {
      const width = popup.offsetWidth || 188;
      const height = popup.offsetHeight || 254;
      const margin = 12;
      let x = px + 18, y = py + 16;
      if (x + width + margin > window.innerWidth) x = px - width - 14;
      if (y + height + margin > window.innerHeight) y = py - height - 14;
      popup.style.left = Math.max(margin, Math.min(x, window.innerWidth - width - margin)) + 'px';
      popup.style.top = Math.max(margin, Math.min(y, window.innerHeight - height - margin)) + 'px';
    }
    function cancel() {
      if (timer != null) clearTimeout(timer);
      timer = null; hovered = null; osis = ''; generation += 1;
      popup.hidden = true; image.hidden = true; image.removeAttribute('src');
    }
    async function reveal(ticket, studentOsis, studentName) {
      if (ticket !== generation || !hovered?.isConnected ||
          !settings.enabled || !settings.hover_enabled) return;
      popup.hidden = false;
      name.textContent = studentName;
      status.textContent = 'Loading photo…';
      status.hidden = false; image.hidden = true;
      locate();
      try {
        const objectUrl = await photoFor(studentOsis);
        if (ticket !== generation || !hovered?.isConnected || !settings.enabled ||
            !settings.hover_enabled) return;
        if (objectUrl) {
          image.src = objectUrl; image.hidden = false; status.hidden = true;
        } else status.textContent = 'No photo on file';
      } catch {
        if (ticket !== generation) return;
        status.textContent = 'Photo unavailable';
      }
      locate();
    }
    subscribe(() => cancel());
    document.addEventListener('mouseover', (event) => {
      if (!settings.enabled || !settings.hover_enabled || window.matchMedia('(hover: none)').matches) return;
      const rec = resolveName(event.target);
      if (!rec || (rec.target === hovered && rec.osis === osis)) return;
      cancel();
      hovered = rec.target; osis = rec.osis;
      px = event.clientX; py = event.clientY;
      const ticket = generation;
      timer = setTimeout(() => reveal(ticket, rec.osis, rec.name), settings.hover_delay_ms);
    });
    document.addEventListener('mousemove', (event) => {
      if (!hovered) return;
      px = event.clientX; py = event.clientY;
      if (!popup.hidden) locate();
    }, { passive:true });
    document.addEventListener('mouseout', (event) => {
      if (!hovered) return;
      if (event.target !== hovered && !hovered.contains(event.target)) return;
      if (event.relatedTarget && hovered.contains(event.relatedTarget)) return;
      cancel();
    });
    document.addEventListener('mousedown', cancel);
    document.addEventListener('scroll', cancel, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') cancel(); });
    window.addEventListener('blur', cancel);
  }

  function start() {
    initStudentLookup();
    initTeacherAttendance();
    refreshSettings();
    refreshPersonalSize();
    setInterval(() => {
      if (!document.hidden) { refreshSettings(); refreshPersonalSize(); }
    }, 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { refreshSettings(); refreshPersonalSize(); }
    });
    window.addEventListener('storage', (event) => {
      if (event.key === 'eaglenest_student_photo_preference_changed_v1') refreshPersonalSize();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();

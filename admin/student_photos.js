/* EAGLENEST_STUDENT_PHOTOS_V1_1
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

    function clear() {
      ++sequence;
      image.hidden = true;
      image.removeAttribute('src');
      placeholder.hidden = false;
    }
    async function changeStudent(value) {
      current = String(value || '').trim();
      const ticket = ++sequence;
      image.hidden = true;
      image.removeAttribute('src');
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
      const width = 188, height = popup.offsetHeight || 254, margin = 12;
      let x = px + 18, y = py + 16;
      if (x + width + margin > window.innerWidth) x = px - width - 14;
      if (y + height + margin > window.innerHeight) y = py - height - 14;
      popup.style.left = Math.max(margin, x) + 'px';
      popup.style.top = Math.max(margin, y) + 'px';
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
    setInterval(() => { if (!document.hidden) refreshSettings(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSettings(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();

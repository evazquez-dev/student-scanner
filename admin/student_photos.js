/* EAGLENEST_STUDENT_PHOTOS_V1
 * Shared Student Lookup portrait and delayed Teacher Attendance hover card.
 * Uses the same private, authenticated Worker session as the rest of EagleNEST.
 */
(() => {
  'use strict';

  const apiBase = (document.querySelector('meta[name="api-base"]')?.content || '')
    .replace(/\/*$/, '') + '/';
  const photoCache = new Map();

  async function photoFor(osis) {
    if (!/^\d{9}$/.test(osis)) return null;
    if (photoCache.has(osis)) return photoCache.get(osis);
    const pending = (async () => {
      const headers = new Headers();
      const sid = window.EAGLENEST_AUTH?.getSid?.() || '';
      if (sid) headers.set('x-admin-session', sid);
      const url = new URL('/admin/student/photo', apiBase);
      url.searchParams.set('osis', osis);
      const response = await fetch(url, {
        method:'GET', headers, credentials:'include', cache:'no-store'
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Photo request HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size || !/^image\/webp\b/i.test(blob.type)) {
        throw new Error('Unexpected photo response');
      }
      return URL.createObjectURL(blob);
    })();
    photoCache.set(osis, pending);
    try {
      return await pending;
    } catch (error) {
      photoCache.delete(osis); // temporary failures can be retried
      throw error;
    }
  }

  function initStudentLookup() {
    const card = document.getElementById('studentCard');
    const image = document.getElementById('studentLookupPortraitImage');
    const placeholder = document.getElementById('studentLookupPortraitFallback');
    if (!card || !image || !placeholder) return;
    card.classList.add('studentPhotoEnabled');
    let sequence = 0;
    let current = '';

    async function changeStudent(osisValue) {
      const osis = String(osisValue || '').trim();
      const ticket = ++sequence;
      current = osis;
      image.hidden = true;
      image.removeAttribute('src');
      placeholder.hidden = false;
      placeholder.textContent = /^\d{9}$/.test(osis) ? 'Loading photo…' : 'No photo';
      if (!/^\d{9}$/.test(osis)) return;
      try {
        const objectUrl = await photoFor(osis);
        if (sequence !== ticket || current !== osis) return;
        if (!objectUrl) {
          placeholder.textContent = 'No photo on file';
          return;
        }
        image.src = objectUrl;
        image.alt = 'Student portrait';
        image.hidden = false;
        placeholder.hidden = true;
      } catch {
        if (sequence !== ticket || current !== osis) return;
        placeholder.textContent = 'Photo unavailable';
      }
    }

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

    let hovered = null;
    let osis = '';
    let timer = null;
    let generation = 0;
    let px = 0;
    let py = 0;

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
      let x = px + 18;
      let y = py + 16;
      if (x + width + margin > window.innerWidth) x = px - width - 14;
      if (y + height + margin > window.innerHeight) y = py - height - 14;
      popup.style.left = Math.max(margin, x) + 'px';
      popup.style.top = Math.max(margin, y) + 'px';
    }

    function cancel() {
      if (timer != null) clearTimeout(timer);
      timer = null;
      hovered = null;
      osis = '';
      generation += 1;
      popup.hidden = true;
      image.hidden = true;
      image.removeAttribute('src');
    }

    async function reveal(ticket, studentOsis, studentName) {
      if (ticket !== generation || !hovered?.isConnected) return;
      popup.hidden = false;
      name.textContent = studentName;
      status.textContent = 'Loading photo…';
      status.hidden = false;
      image.hidden = true;
      locate();
      try {
        const objectUrl = await photoFor(studentOsis);
        if (ticket !== generation || !hovered?.isConnected) return;
        if (objectUrl) {
          image.src = objectUrl;
          image.hidden = false;
          status.hidden = true;
        } else {
          status.textContent = 'No photo on file';
        }
      } catch {
        if (ticket !== generation) return;
        status.textContent = 'Photo unavailable';
      }
      locate();
    }

    document.addEventListener('mouseover', (event) => {
      if (window.matchMedia('(hover: none)').matches) return;
      const rec = resolveName(event.target);
      if (!rec || (rec.target === hovered && rec.osis === osis)) return;
      cancel();
      hovered = rec.target;
      osis = rec.osis;
      px = event.clientX;
      py = event.clientY;
      const ticket = generation;
      timer = setTimeout(() => reveal(ticket, rec.osis, rec.name), 1500);
    });
    document.addEventListener('mousemove', (event) => {
      if (!hovered) return;
      px = event.clientX;
      py = event.clientY;
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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();

/* EAGLENEST_GRANDSTREAM_PHASE3 — global admin incoming caller card */
(() => {
  'use strict';

  // ESAS remains visually focused on emergency accountability.
  if (/\/esas\.html$/i.test(location.pathname || '')) return;

  const API_BASE = ((document.querySelector('meta[name="api-base"]')?.content || location.origin)
    .replace(/\/*$/, '') + '/');
  const SESSION_HEADER = 'x-admin-session';
  const SESSION_KEYS = [
    'ss_admin_session_sid_v1',
    'admin_session_v1',
    'teacher_att_admin_session_v1',
    'staff_pull_admin_session_v1',
    'phone_pass_admin_session_v1',
    'student_scans_admin_session_v1'
  ];

  let aborter = null;
  let reconnectTimer = null;
  let reconnectMs = 1000;
  let latestSnapshot = null;
  let dismissedCall = '';
  let stopped = false;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));
  }

  function sessionSid() {
    try {
      for (const key of SESSION_KEYS) {
        const value = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
        if (value) return value;
      }
    } catch {}
    return '';
  }

  function apiHeaders(extra = {}) {
    const headers = new Headers(extra);
    const sid = sessionSid();
    if (sid) headers.set(SESSION_HEADER, sid);
    return headers;
  }

  function ensureStyle() {
    if (document.getElementById('eaglenestPhoneLiveStyle')) return;
    const style = document.createElement('style');
    style.id = 'eaglenestPhoneLiveStyle';
    style.textContent = `
      #eaglenestPhoneLiveCard{position:fixed;right:18px;bottom:18px;z-index:2147483644;width:min(390px,calc(100vw - 36px));border:1px solid rgba(148,163,184,.34);border-radius:18px;background:var(--panel,#0f172a);color:var(--fg,#e5e7eb);box-shadow:0 22px 60px rgba(0,0,0,.34);padding:15px;display:none}
      #eaglenestPhoneLiveCard[data-show="1"]{display:block}
      .enPhoneTop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .enPhoneEyebrow{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--info,#93c5fd)}
      .enPhoneTitle{font-size:19px;font-weight:950;line-height:1.2;margin-top:3px}
      .enPhoneMeta{font-size:12px;color:var(--muted,#94a3b8);margin-top:5px;line-height:1.45}
      .enPhoneMatch{margin-top:12px;padding:11px;border:1px solid rgba(148,163,184,.24);border-radius:13px;background:var(--panel2,#111827)}
      .enPhoneMatch strong{display:block;font-size:15px}.enPhoneMatch span{display:block;margin-top:3px;font-size:12px;color:var(--muted,#94a3b8)}
      .enPhoneActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .enPhoneBtn{border:1px solid rgba(148,163,184,.3);border-radius:10px;padding:8px 10px;background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:850;cursor:pointer}
      .enPhoneBtn.primary{background:var(--accent,#4f46e5);color:#fff;border-color:transparent}
      .enPhoneClose{border:0;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer;opacity:.72}
      .enPhoneDot{display:inline-block;width:8px;height:8px;border-radius:999px;background:#22c55e;margin-right:6px}
      @media(max-width:600px){#eaglenestPhoneLiveCard{right:10px;bottom:10px;width:calc(100vw - 20px)}}
    `;
    document.head.appendChild(style);
  }

  function ensureCard() {
    ensureStyle();
    let card = document.getElementById('eaglenestPhoneLiveCard');
    if (!card) {
      card = document.createElement('aside');
      card.id = 'eaglenestPhoneLiveCard';
      card.setAttribute('aria-live', 'polite');
      document.body.appendChild(card);
    }
    return card;
  }

  function callRank(call) {
    const state = String(call?.state || '').toLowerCase();
    if (state === 'ringing') return 30;
    if (state === 'connected') return 20;
    return 10;
  }

  function incomingCalls(snapshot) {
    return (Array.isArray(snapshot?.active_calls) ? snapshot.active_calls : [])
      .filter((call) => String(call?.direction || '').toLowerCase() === 'incoming')
      .sort((a, b) => callRank(b) - callRank(a) ||
        String(b?.started_at || '').localeCompare(String(a?.started_at || '')));
  }

  function relationshipLine(match) {
    return [match?.name, match?.relationship].map((v) => String(v || '').trim()).filter(Boolean).join(' • ');
  }

  function studentLine(match) {
    const parts = [];
    if (match?.student_name) parts.push(String(match.student_name));
    if (match?.student_number) parts.push(`OSIS ${match.student_number}`);
    return parts.join(' • ');
  }

  function render(snapshot) {
    latestSnapshot = snapshot;
    const card = ensureCard();
    const calls = incomingCalls(snapshot);
    if (!calls.length) {
      card.dataset.show = '0';
      dismissedCall = '';
      return;
    }

    const call = calls[0];
    if (dismissedCall && dismissedCall === call.call_id) {
      card.dataset.show = '0';
      return;
    }

    const matches = Array.isArray(call?.matches) ? call.matches : [];
    const first = matches[0] || null;
    const state = String(call?.state || '').toLowerCase();
    const heading = state === 'connected' ? 'Call connected' : 'Incoming call';
    const phone = call?.phone_last4 ? `Caller ending ••••${call.phone_last4}` : 'Caller number unavailable';
    const staff = [call?.staff_name, call?.staff_extension ? `Ext. ${call.staff_extension}` : '']
      .map((v) => String(v || '').trim()).filter(Boolean).join(' • ');
    const extraCalls = calls.length > 1 ? `${calls.length} active incoming calls` : '';
    const uniqueStudents = [...new Set(matches.map((m) => String(m?.student_number || '')).filter(Boolean))];

    let matchHtml = '';
    if (first) {
      const contact = relationshipLine(first) || 'Matched family contact';
      const student = studentLine(first) || 'Student match available';
      const more = uniqueStudents.length > 1 ? ` • +${uniqueStudents.length - 1} linked student${uniqueStudents.length === 2 ? '' : 's'}` : '';
      matchHtml = `<div class="enPhoneMatch"><strong>${esc(contact)}</strong><span>${esc(student + more)}</span></div>`;
    } else {
      matchHtml = `<div class="enPhoneMatch"><strong>Unknown / unmatched caller</strong><span>No current Student Contacts match was found.</span></div>`;
    }

    const openStudent = first?.student_number
      ? `<button type="button" class="enPhoneBtn primary" data-en-phone-open="${esc(first.student_number)}">Open Student</button>`
      : '';

    card.innerHTML = `
      <div class="enPhoneTop">
        <div>
          <div class="enPhoneEyebrow"><span class="enPhoneDot"></span>PBX live</div>
          <div class="enPhoneTitle">${esc(heading)}</div>
          <div class="enPhoneMeta">${esc([phone, staff, extraCalls].filter(Boolean).join(' • '))}</div>
        </div>
        <button type="button" class="enPhoneClose" aria-label="Dismiss caller card">×</button>
      </div>
      ${matchHtml}
      <div class="enPhoneActions">
        ${openStudent}
        <button type="button" class="enPhoneBtn" data-en-phone-dismiss="1">Dismiss</button>
      </div>`;
    card.dataset.show = '1';

    card.querySelector('[data-en-phone-open]')?.addEventListener('click', (event) => {
      const osis = String(event.currentTarget.getAttribute('data-en-phone-open') || '').trim();
      if (!osis) return;
      const url = new URL('./student_view.html', location.href);
      url.searchParams.set('osis', osis);
      url.searchParams.set('source', 'phone_live');
      location.href = url.toString();
    });

    const dismiss = () => {
      dismissedCall = String(call?.call_id || '');
      card.dataset.show = '0';
    };
    card.querySelector('.enPhoneClose')?.addEventListener('click', dismiss);
    card.querySelector('[data-en-phone-dismiss]')?.addEventListener('click', dismiss);
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectMs);
    reconnectMs = Math.min(30000, Math.round(reconnectMs * 1.8));
  }

  async function connect() {
    if (stopped) return;
    if (aborter) aborter.abort();
    aborter = new AbortController();

    try {
      const response = await fetch(new URL('/admin/integrations/grandstream/live/stream', API_BASE), {
        method: 'GET',
        headers: apiHeaders({ 'accept': 'application/x-ndjson' }),
        credentials: 'include',
        cache: 'no-store',
        signal: aborter.signal
      });
      if (!response.ok || !response.body) throw new Error(`phone_live_http_${response.status}`);
      reconnectMs = 1000;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          let message;
          try { message = JSON.parse(line); } catch { continue; }
          if (message?.type === 'snapshot') render(message);
        }
      }
      if (!stopped) scheduleReconnect();
    } catch (error) {
      if (error?.name === 'AbortError' || stopped) return;
      ensureCard().dataset.show = '0';
      scheduleReconnect();
    }
  }

  async function status() {
    const response = await fetch(new URL('/admin/integrations/grandstream/live/status', API_BASE), {
      method: 'GET',
      headers: apiHeaders(),
      credentials: 'include',
      cache: 'no-store'
    });
    return response.json();
  }

  function stop() {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    try { aborter?.abort(); } catch {}
    aborter = null;
    ensureCard().dataset.show = '0';
  }

  window.EagleNESTPhoneLive = {
    status,
    reconnect: () => {
      stopped = false;
      reconnectMs = 1000;
      connect();
    },
    stop,
    latest: () => latestSnapshot
  };

  window.addEventListener('pagehide', stop, { once: true });
  connect();
})();

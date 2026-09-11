// Phone Pass queue + return-request UI helper.
// Keeps the original phone_pass.js rendering and Confirm Return behavior intact.
(() => {
  const RETURN_ENDPOINT = '/admin/phone_pass/send_to_return';
  const RETROACTIVE_RETURN_ENDPOINT = '/admin/phone_pass/retroactive_return'; // EAGLENEST_PHONE_PASS_RETROACTIVE_RETURN_V1
  const PICKUP_REQUESTS_ENDPOINT = '/admin/phone_pass/pickup_requests';
  let CAP = { email: '', role: '', can_grant: false, can_return: false };
  let pickupRefreshTimer = null;

  function clean(v){ return String(v || '').trim(); }
  function lower(v){ return clean(v).toLowerCase(); }
  function emailLocal(email){
    const e = lower(email);
    const at = e.indexOf('@');
    return at > 0 ? e.slice(0, at) : e;
  }
  function isAdminLike(){
    const role = lower(CAP.role);
    return role === 'admin' || role === 'super_admin';
  }
  function osisFromRow(row){
    const text = clean(row?.querySelector('.row-title')?.textContent);
    const m = text.match(/\((\d+)\)\s*$/);
    return m ? m[1] : '';
  }
  function isReturnRequested(row){
    return /sent to return/i.test(clean(row?.querySelector('.row-sub')?.textContent));
  }
  function rowOwnerLocal(row){
    const text = clean(row?.querySelector('.row-sub')?.textContent);
    const m = text.match(/(?:^|•\s*)allowed by\s+([^•\s]+)/i);
    return lower(m?.[1]);
  }
  function canRequestActiveRow(row){
    if(isAdminLike()) return true;
    return !!CAP.can_grant && rowOwnerLocal(row) === emailLocal(CAP.email);
  }
  function fmtClock(iso){
    if(!iso) return '';
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  }
  function lockerLabel(rec){
    const color = clean(rec?.locker_color_effective ?? rec?.locker_color);
    const number = clean(rec?.locker_number_effective ?? rec?.locker_number);
    if(color && number) return `Locker ${color} #${number}`;
    if(color) return `Locker ${color}`;
    if(number) return `Locker #${number}`;
    return 'Locker not assigned';
  }
  function showError(error){
    const message = clean(error?.message || error) || 'Phone Pass request failed.';
    try {
      if(typeof setErr === 'function') setErr(message);
      else window.alert(message);
    } catch {
      window.alert(message);
    }
  }
  function clearError(){
    try { if(typeof setErr === 'function') setErr(''); } catch {}
  }

  async function loadCapabilities(){
    if(typeof adminFetch !== 'function') return;
    try {
      const response = await adminFetch('/admin/phone_pass/options', { method: 'GET' });
      const data = await response.json().catch(() => null);
      if(!response.ok || !data?.ok) return;
      CAP = {
        email: lower(data?.who?.email),
        role: clean(data?.who?.role),
        can_grant: !!data?.can_grant,
        can_return: !!data?.can_return
      };
    } catch {}
  }

  async function sendToReturn(osis){
    if(typeof adminFetch !== 'function') throw new Error('phone_pass_unavailable');
    const response = await adminFetch(RETURN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ osis, source: 'phone_pass' })
    });
    const data = await response.json().catch(() => null);
    if(!response.ok || !data?.ok) throw new Error(data?.error || `phone_pass/send_to_return HTTP ${response.status}`);
    return data;
  }

  async function retroactiveReturn(osis){
    if(typeof adminFetch !== 'function') throw new Error('phone_pass_unavailable');
    const response = await adminFetch(RETROACTIVE_RETURN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ osis, source: 'phone_pass' })
    });
    const data = await response.json().catch(() => null);
    if(!response.ok || !data?.ok) throw new Error(data?.error || `phone_pass/retroactive_return HTTP ${response.status}`);
    return data;
  }

  async function confirmPickup(osis){
    // Reuse the canonical Phone Pass mutation path. source:'phone_pass' converts
    // a teacher's pickup request into the actual phone_out=true state.
    if(typeof grantPhone === 'function') return grantPhone(osis);
    if(typeof adminFetch !== 'function') throw new Error('phone_pass_unavailable');
    const response = await adminFetch('/admin/phone_pass/grant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ osis, source: 'phone_pass' })
    });
    const data = await response.json().catch(() => null);
    if(!response.ok || !data?.ok) throw new Error(data?.error || `phone_pass/grant HTTP ${response.status}`);
    return data;
  }

  async function refreshPhonePassViews(osis){
    const jobs = [];
    try { if(typeof loadMine === 'function') jobs.push(loadMine()); } catch {}
    try { if(typeof loadActive === 'function') jobs.push(loadActive()); } catch {}
    jobs.push(loadPickupRequests());
    await Promise.allSettled(jobs);

    try {
      const selected = clean(document.getElementById('studentSelect')?.value);
      if(selected === clean(osis) && typeof loadSelectedContext === 'function') {
        await loadSelectedContext();
      }
    } catch {}
  }

  function ensurePickupRequestsCard(){
    let card = document.getElementById('pickupRequestsCard');
    if(card) return card;
    const layout = document.getElementById('layout');
    if(!layout) return null;

    card = document.createElement('section');
    card.className = 'card';
    card.id = 'pickupRequestsCard';
    card.innerHTML = `
      <h2>
        <span>Pickup Requests</span>
        <span id="pickupRequestsCount">0</span>
      </h2>
      <div class="muted">Students a teacher sent to the phone locker. Confirm pickup here only after the student physically receives the phone.</div>
      <div class="list" id="pickupRequestsList"><div class="muted">Loading…</div></div>
    `;

    const mineCard = document.getElementById('mineCard');
    if(mineCard && mineCard.parentElement === layout) layout.insertBefore(card, mineCard);
    else layout.appendChild(card);
    return card;
  }

  async function loadPickupRequests(){
    if(!(CAP.can_grant || CAP.can_return || isAdminLike())) return;
    const card = ensurePickupRequestsCard();
    if(!card || typeof adminFetch !== 'function') return;

    const listEl = document.getElementById('pickupRequestsList');
    const countEl = document.getElementById('pickupRequestsCount');
    try {
      const response = await adminFetch(PICKUP_REQUESTS_ENDPOINT, { method:'GET' });
      const data = await response.json().catch(() => null);
      if(!response.ok || !data?.ok) throw new Error(data?.error || `phone_pass/pickup_requests HTTP ${response.status}`);
      const rows = Array.isArray(data.requests) ? data.requests : [];
      if(countEl) countEl.textContent = String(rows.length);
      if(!listEl) return;
      listEl.innerHTML = '';

      if(!rows.length){
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'No pending pickup requests.';
        listEl.appendChild(empty);
        return;
      }

      for(const rec of rows){
        const osis = clean(rec?.osis);
        if(!osis) continue;
        const row = document.createElement('div');
        row.className = 'row';
        row.dataset.pickupRequestOsis = osis;

        const left = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'row-title';
        title.textContent = `${clean(rec?.name) || '—'} (${osis})`;
        const sub = document.createElement('div');
        sub.className = 'row-sub';
        const requestedAt = fmtClock(rec?.phone_pickup_requested_at);
        const requestedBy = emailLocal(rec?.phone_pickup_requested_by_email) || clean(rec?.phone_pickup_requested_by_title);
        const loc = clean(rec?.cur_label || rec?.cur_loc);
        sub.textContent = [
          lockerLabel(rec),
          requestedAt ? `requested ${requestedAt}` : 'pickup requested',
          requestedBy ? `sent by ${requestedBy}` : '',
          loc ? `now @ ${loc}` : '',
          clean(rec?.phone_note) ? `note: ${clean(rec.phone_note)}` : ''
        ].filter(Boolean).join(' • ');
        left.appendChild(title);
        left.appendChild(sub);
        row.appendChild(left);

        if(CAP.can_grant || isAdminLike()){
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn btn-primary';
          button.textContent = 'Student Picked Up Phone';
          button.addEventListener('click', async () => {
            button.disabled = true;
            button.textContent = 'Confirming…';
            try {
              await confirmPickup(osis);
              clearError();
              await refreshPhonePassViews(osis);
            } catch(error){
              showError(error);
              button.disabled = false;
              button.textContent = 'Student Picked Up Phone';
            }
          });
          row.appendChild(button);
        } else {
          const waiting = document.createElement('div');
          waiting.className = 'muted';
          waiting.textContent = 'Waiting for pickup confirmation';
          row.appendChild(waiting);
        }

        listEl.appendChild(row);
      }
    } catch(error){
      if(countEl) countEl.textContent = '—';
      if(listEl){
        listEl.innerHTML = '';
        const failed = document.createElement('div');
        failed.className = 'muted';
        failed.textContent = 'Pickup requests unavailable.';
        listEl.appendChild(failed);
      }
      throw error;
    }
  }

  function makeReturnButton(row, osis){
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-return-request phone-pass-return-action';

    if(isReturnRequested(row)){
      button.textContent = 'Student Sent to Return ✓';
      button.disabled = true;
      return button;
    }

    button.textContent = 'Send Student to Return Phone';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await sendToReturn(osis);
        clearError();
        await refreshPhonePassViews(osis);
      } catch (error) {
        button.disabled = false;
        showError(error);
      }
    });
    return button;
  }

  function makeRetroactiveReturnButton(row, osis){
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-danger phone-pass-retroactive-return-action';
    button.textContent = 'Retroactive Return';
    button.title = 'Mark the phone returned without changing the student\'s live location.';
    button.addEventListener('click', async () => {
      const student = clean(row?.querySelector('.row-title')?.textContent) || osis;
      const confirmed = window.confirm(
        `Retroactive return for ${student}?\n\n` +
        `This will mark the phone as returned but will NOT change the student's live location.\n\n` +
        `Use this only when the phone was returned earlier and the return was not recorded.`
      );
      if(!confirmed) return;

      button.disabled = true;
      try {
        await retroactiveReturn(osis);
        clearError();
        await refreshPhonePassViews(osis);
      } catch (error) {
        button.disabled = false;
        showError(error);
      }
    });
    return button;
  }

  function enhanceMineRows(){
    const list = document.getElementById('mineList');
    if(!list) return;
    for(const row of list.querySelectorAll('.row')){
      if(row.dataset.returnActionEnhanced === '1') continue;
      const osis = osisFromRow(row);
      if(!osis) continue;

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      actions.appendChild(makeReturnButton(row, osis));
      row.appendChild(actions);
      row.dataset.returnActionEnhanced = '1';
    }
  }

  function enhanceActiveRows(){
    const list = document.getElementById('activeList');
    if(!list) return;
    for(const row of list.querySelectorAll('.row')){
      if(row.dataset.returnActionEnhanced === '1') continue;
      const osis = osisFromRow(row);
      if(!osis) continue;

      const confirm = row.querySelector('button.btn-success');
      if(!confirm) continue;

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      if(canRequestActiveRow(row)) actions.appendChild(makeReturnButton(row, osis));
      actions.appendChild(confirm);
      if(CAP.can_return) actions.appendChild(makeRetroactiveReturnButton(row, osis));
      row.appendChild(actions);
      row.dataset.returnActionEnhanced = '1';
    }
  }

  function enhanceAll(){
    enhanceMineRows();
    enhanceActiveRows();
  }

  async function init(){
    await loadCapabilities();
    if(CAP.can_grant || CAP.can_return || isAdminLike()) {
      ensurePickupRequestsCard();
      await loadPickupRequests().catch(showError);
      pickupRefreshTimer = window.setInterval(() => {
        if(document.hidden) return;
        loadPickupRequests().catch(() => {});
      }, 5000);
    }
    enhanceAll();

    for(const id of ['mineList', 'activeList']){
      const el = document.getElementById(id);
      if(!el) continue;
      new MutationObserver(() => queueMicrotask(enhanceAll)).observe(el, { childList: true, subtree: true });
    }
  }

  window.addEventListener('beforeunload', () => {
    if(pickupRefreshTimer) window.clearInterval(pickupRefreshTimer);
  });

  if(document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => { init().catch(showError); }, { once: true });
  } else {
    init().catch(showError);
  }
})();

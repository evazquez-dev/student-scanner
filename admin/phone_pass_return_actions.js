// Dedicated Phone Pass return-request UI helper.
// Keeps the original phone_pass.js rendering and Confirm Return behavior untouched.
(() => {
  const RETURN_ENDPOINT = '/admin/phone_pass/send_to_return';
  let CAP = { email: '', role: '', can_grant: false, can_return: false };

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
  function showError(error){
    const message = clean(error?.message || error) || 'Unable to request phone return.';
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

  async function refreshPhonePassViews(osis){
    const jobs = [];
    try { if(typeof loadMine === 'function') jobs.push(loadMine()); } catch {}
    try { if(typeof loadActive === 'function') jobs.push(loadActive()); } catch {}
    await Promise.allSettled(jobs);

    try {
      const selected = clean(document.getElementById('studentSelect')?.value);
      if(selected === clean(osis) && typeof loadSelectedContext === 'function') {
        await loadSelectedContext();
      }
    } catch {}
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
    enhanceAll();

    for(const id of ['mineList', 'activeList']){
      const el = document.getElementById(id);
      if(!el) continue;
      new MutationObserver(() => queueMicrotask(enhanceAll)).observe(el, { childList: true, subtree: true });
    }
  }

  if(document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => { init().catch(showError); }, { once: true });
  } else {
    init().catch(showError);
  }
})();

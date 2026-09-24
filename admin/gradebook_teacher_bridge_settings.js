// EAGLENEST_GRADEBOOK_TEACHER_BRIDGE_SETTINGS_V1
(() => {
  function mount() {
    if (document.getElementById('gradebookTeacherBridgeSettings')) return;
    const anchor = document.getElementById('academicRosterOut');
    if (!anchor) return;
    const box = document.createElement('div');
    box.id = 'gradebookTeacherBridgeSettings';
    box.style.cssText = 'margin:16px 0;padding:16px;border:1px solid var(--line,var(--border,#60708066));border-radius:12px;';
    box.innerHTML = `
      <h3 style="margin:0 0 8px">Gradebook Analytics · additional teachers</h3>
      <p class="muted" style="margin:0 0 12px">Add matching local Teacher Assignments staff to each PowerSchool section using the Course Code Dictionary above. Primary PowerSchool teacher access always stays intact. Only <b>exact mapped sections</b> are added.</p>
      <label style="display:flex;align-items:center;gap:10px;margin:10px 0;cursor:pointer"><input id="gbBridgeEnabled" type="checkbox" checked> Enable additional teacher access from Teacher Assignments</label>
      <label style="display:flex;align-items:center;gap:10px;margin:10px 0;cursor:pointer"><input id="gbBridgeAdvisories" type="checkbox"> Include advisory sections (OFF by default)</label>
      <p class="muted" style="margin:0 0 10px">The advisory switch only controls <b>additional</b> access. It does not hide a section from its PowerSchool primary teacher. No roster or gradebook export is run when you save.</p>
      <div class="row" style="gap:8px;align-items:center"><button class="btn primary" id="gbBridgeSave" type="button">Save teacher bridge settings</button><button class="btn ghost" id="gbBridgeReload" type="button">Reload</button></div>
      <pre id="gbBridgeStatus" class="pane" role="status" style="margin-top:12px;white-space:pre-wrap">Waiting for admin sign-in…</pre>`;
    anchor.insertAdjacentElement('beforebegin', box);
    const $ = id => box.querySelector('#' + id);
    const state = $('gbBridgeStatus');
    const base = (String(document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/*$/, '') || location.origin) + '/';
    const keys = ['admin_session_v1','ss_admin_session_sid_v1','teacher_att_admin_session_v1','staff_pull_admin_session_v1','phone_pass_admin_session_v1','student_scans_admin_session_v1'];
    function sid() {try { const one = window.EAGLENEST_AUTH?.getSid?.(); if(one) return one; for(const k of keys){const v=sessionStorage.getItem(k)||localStorage.getItem(k);if(v)return v;} }catch{} return '';}
    async function request(method, data) {
      const headers = new Headers(); const session = sid(); if(session) headers.set('x-admin-session', session);
      if(data) headers.set('content-type', 'application/json');
      const response = await fetch(new URL('/admin/gradebook-analytics/teacher-bridge-settings', base), {
        method, headers, body: data ? JSON.stringify(data) : undefined, credentials: 'include', cache: 'no-store'
      });
      const next = response.headers.get('x-admin-session'); if(next) window.EAGLENEST_AUTH?.setSid?.(next);
      const result = await response.json().catch(() => ({}));
      if(!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      return result;
    }
    function display(j) {
      $('gbBridgeEnabled').checked = j.settings?.enabled === true;
      $('gbBridgeAdvisories').checked = j.settings?.include_advisories === true;
      const b = j.source || {};
      state.textContent = `Bridge: ${j.settings?.enabled ? 'ON' : 'OFF'} · Advisory additions: ${j.settings?.include_advisories ? 'ON' : 'OFF'}\n` +
        `Teacher Assignments source: ${b.source_available ? 'available' : 'missing/empty'} · ${b.source_assignments || 0} assignment(s), ${b.local_sections || 0} local section(s)\n` +
        `Excluded advisory assignments: ${b.excluded_advisories || 0} · Unmatched staff labels: ${b.unmatched_staff_assignments || 0}\n` +
        `Source generated: ${b.source_generated_at_iso || 'not available'}\n` +
        `Settings last changed: ${j.settings?.updated_at_iso || 'defaults'}${j.settings?.updated_by ? ' by ' + j.settings.updated_by : ''}`;
    }
    async function load(){state.textContent = 'Loading teacher bridge settings…';try{display(await request('GET'));}catch(e){state.textContent='Load failed: '+(e.message||e);}}
    $('gbBridgeReload').addEventListener('click',load);
    $('gbBridgeSave').addEventListener('click',async()=>{
      $('gbBridgeSave').disabled = true;
      state.textContent = 'Saving additional teacher settings…';
      try {display(await request('POST', {enabled:$('gbBridgeEnabled').checked,include_advisories:$('gbBridgeAdvisories').checked}));}
      catch(e){state.textContent='Save failed: '+(e.message||e);}
      finally{$('gbBridgeSave').disabled = false;}
    });
    let ticks = 0;
    const timer = setInterval(()=>{
      ticks++;
      const app = document.getElementById('appInner');
      const visible = app && getComputedStyle(app).display !== 'none';
      if(visible || ticks >= 80){clearInterval(timer);if(visible)load();}
    },250);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true}); else mount();
})();

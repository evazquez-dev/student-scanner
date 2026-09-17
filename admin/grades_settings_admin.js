// EAGLENEST_GRADES_SETTINGS_ADMIN_V1
(() => {
  function mount(){
    if (document.getElementById('gradesSettingsCard')) return;
    const anchor = document.getElementById('academicRosterCard') || document.getElementById('communicationCategoriesCard') || document.getElementById('systemModeCard');
    if (!anchor) return;

    const card=document.createElement('section');
    card.className='card';
    card.id='gradesSettingsCard';
    card.innerHTML=`
      <h2>Grades</h2>
      <div class="muted">
        Configure the school-wide passing threshold used by the EagleNEST Grades page. This setting changes how current and historical grades are classified for staff; it does not rewrite stored grade values.
      </div>
      <div class="row" style="margin-top:12px;align-items:flex-end;">
        <label class="col">
          <span>Passing grade (%)</span>
          <input id="gradesPassingScore" type="number" min="0" max="100" step="1" inputmode="decimal" value="70">
        </label>
        <div class="col">
          <div id="gradesPassingPreview" class="muted">70% and above is passing.</div>
        </div>
        <div class="col right">
          <button id="btnSaveGradesSettings" class="btn primary" type="button">Save grade settings</button>
        </div>
      </div>
      <pre id="gradesSettingsOut" class="pane">—</pre>`;
    anchor.insertAdjacentElement('afterend',card);

    const input=card.querySelector('#gradesPassingScore');
    const preview=card.querySelector('#gradesPassingPreview');
    const save=card.querySelector('#btnSaveGradesSettings');
    const out=card.querySelector('#gradesSettingsOut');
    const apiBaseMeta=String(document.querySelector('meta[name="api-base"]')?.content||'').trim();
    const apiBase=(apiBaseMeta?apiBaseMeta.replace(/\/*$/,''):location.origin)+'/';
    const sessionKeys=['admin_session_v1','ss_admin_session_sid_v1','teacher_att_admin_session_v1','staff_pull_admin_session_v1','phone_pass_admin_session_v1','student_scans_admin_session_v1'];
    const sid=()=>{try{for(const key of sessionKeys){const value=String(sessionStorage.getItem(key)||localStorage.getItem(key)||'').trim();if(value)return value}}catch{}return''};
    const request=(path,init={})=>{const headers=new Headers(init.headers||{});const session=sid();if(session)headers.set('x-admin-session',session);return fetch(new URL(path,apiBase),{...init,headers,credentials:'include',cache:'no-store'})};
    const syncPreview=()=>{const n=Number(input.value);preview.textContent=Number.isFinite(n)?`${n}% and above is passing.`:'Enter a number from 0 to 100.'};
    input.addEventListener('input',syncPreview);

    async function load(){out.textContent='Loading grade settings…';try{const r=await request('/admin/grades/settings');const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);input.value=String(j?.settings?.passing_score??70);syncPreview();const by=j?.settings?.updated_by?` by ${j.settings.updated_by}`:'';const at=j?.settings?.updated_at_iso?`\nUpdated: ${j.settings.updated_at_iso}${by}`:'';out.textContent=`Passing threshold: ${input.value}%${at}`}catch(e){out.textContent=`Load failed: ${e?.message||e}`}}
    save.addEventListener('click',async()=>{const n=Number(input.value);if(!Number.isFinite(n)||n<0||n>100){out.textContent='Passing grade must be between 0 and 100.';return}save.disabled=true;out.textContent='Saving grade settings…';try{const r=await request('/admin/grades/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({passing_score:n})});const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);input.value=String(j.settings.passing_score);syncPreview();out.textContent=`Saved. ${input.value}% and above is now passing in EagleNEST Grades.`}catch(e){out.textContent=`Save failed: ${e?.message||e}`}finally{save.disabled=false}});

    let tries=0;const timer=setInterval(()=>{tries++;const app=document.getElementById('appInner');const visible=app&&getComputedStyle(app).display!=='none';if(visible||tries>=40){clearInterval(timer);if(visible)load()}},250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

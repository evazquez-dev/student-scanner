/* EAGLENEST_DAILY_STUDENT_STATUS_V1 */
(() => {
  'use strict';
  const API_BASE = ((document.querySelector('meta[name="api-base"]')?.content || location.origin).replace(/\/*$/, '') + '/');
  const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';
  const SESSION_HEADER = 'x-admin-session';
  const $ = (id) => document.getElementById(id);
  const loginCard=$('loginCard'), loginOut=$('loginOut'), app=$('app');
  const statusDate=$('statusDate'), studentSearch=$('studentSearch'), studentResults=$('studentResults'), selectedStudent=$('selectedStudent');
  const statusType=$('statusType'), statusNote=$('statusNote'), psAck=$('psAck'), saveStatusBtn=$('saveStatusBtn');
  const refreshPsBtn=$('refreshPsBtn'), statusRows=$('statusRows'), listFilter=$('listFilter'), listSearch=$('listSearch');
  const errorBanner=$('errorBanner'), successBanner=$('successBanner'), modeBanner=$('modeBanner');
  const psHealth=$('psHealth'), psMeta=$('psMeta'), summaryDate=$('summaryDate');
  let ACCESS=null, DATA=null, SELECTED=null, SEARCH_SEQ=0, searchTimer=null;

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function getSid(){try{return String(window.EAGLENEST_AUTH?.getSid?.()||'').trim()}catch{return''}}
  function setSid(v){try{return window.EAGLENEST_AUTH?.setSid?.(v)||''}catch{return''}}
  async function adminFetch(path,init={}){
    const headers=new Headers(init.headers||{}),sid=getSid();if(sid&&!headers.has(SESSION_HEADER))headers.set(SESSION_HEADER,sid);
    const r=await fetch(new URL(path,API_BASE),{...init,headers,credentials:'include',cache:'no-store'});
    const next=String(r.headers.get('x-admin-session')||r.headers.get('X-Admin-Session')||'').trim();if(next)setSid(next);return r;
  }
  async function jsonOrThrow(r){const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.message||j?.error||`HTTP ${r.status}`);return j;}
  function nyDate(){
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`;
  }
  function fmtDate(date){const d=new Date(`${date}T12:00:00`);return Number.isFinite(d.getTime())?d.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',year:'numeric'}):date;}
  function fmtWhen(iso){const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';}
  function showBanner(el,msg){el.textContent=String(msg||'');el.hidden=!msg;}
  function clearMessages(){showBanner(errorBanner,'');showBanner(successBanner,'')}

  async function ensureAuth(){
    try{const r=await adminFetch('/admin/access');const j=await r.json().catch(()=>null);if(r.ok&&j?.ok){ACCESS=j;if(!(j.can?.attendance_outreach||j.can?.attendance_status||['admin','super_admin'].includes(String(j.role||''))))throw new Error('Daily Suspensions is limited to office/admin staff.');loginCard.hidden=true;app.hidden=false;return true;}}catch(e){if(String(e?.message||'').includes('limited'))throw e;}
    app.hidden=true;loginCard.hidden=false;loginOut.textContent='Please sign in.';
    const start=Date.now();while(!window.google?.accounts?.id){if(Date.now()-start>8000)throw new Error('Google sign-in failed to load.');await new Promise(r=>setTimeout(r,50));}
    window.google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,ux_mode:'popup',callback:async(resp)=>{try{loginOut.textContent='Signing in…';const r=await adminFetch('/admin/session/login_google',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({id_token:resp.credential}).toString()});const j=await r.json().catch(()=>null);if(j?.sid)setSid(j.sid);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);location.reload()}catch(e){loginOut.textContent=`Login failed: ${e?.message||e}`}}});
    window.google.accounts.id.renderButton($('g_id_signin'),{theme:'outline',size:'large'});return false;
  }

  function renderSearch(rows){studentResults.replaceChildren();if(!rows.length){studentResults.hidden=true;return}rows.slice(0,12).forEach(row=>{const b=document.createElement('button');b.type='button';b.innerHTML=`<strong>${esc(row.name||row.osis)}</strong><div class="sub">Grade ${esc(row.grade||'—')} · ${esc(row.osis)}</div>`;b.addEventListener('click',()=>{SELECTED=row;selectedStudent.innerHTML=`<strong>${esc(row.name||row.osis)}</strong> · Grade ${esc(row.grade||'—')} · OSIS ${esc(row.osis)}`;studentSearch.value=row.name||row.osis;studentResults.hidden=true;syncSaveState()});studentResults.appendChild(b)});studentResults.hidden=false;}
  async function searchStudents(){const q=studentSearch.value.trim();const seq=++SEARCH_SEQ;if(q.length<2){renderSearch([]);return}try{const j=await jsonOrThrow(await adminFetch(`/admin/roster/search?q=${encodeURIComponent(q)}`));if(seq!==SEARCH_SEQ)return;renderSearch(Array.isArray(j.results)?j.results:[])}catch{if(seq===SEARCH_SEQ)renderSearch([])}}
  function syncSaveState(){saveStatusBtn.disabled=!(SELECTED?.osis&&statusDate.value&&statusType.value&&psAck.checked)}

  function psDisplay(row){
    const ps=row.powerschool||null;if(!ps)return '<span class="pill neutral">No explicit ISS/OSS</span><div class="sub">No matching suspension code was returned for this date.</div>';
    const detail=String(ps.detail_code||'').toLowerCase();const label=ps.code_label||detail||'PowerSchool code';
    const cls=detail==='iss'?'iss':detail==='oss'?'oss':'neutral';return `<span class="pill ${cls}">${esc(label)}</span><div class="sub">PowerSchool detail: ${esc(detail||'—')}${ps.code_id?` · code ${esc(ps.code_id)}`:''}</div>`;
  }
  function manualDisplay(row){const m=row.manual;if(!m)return '<span class="muted">None needed</span>';return `<span class="pill ${esc(m.status)}">${esc(String(m.status||'').toUpperCase())}</span><div class="sub">${m.note?esc(m.note)+'<br>':''}Saved ${esc(fmtWhen(m.entered_at_iso))}</div>`;}
  function effectiveDisplay(row){const s=String(row.effective_status||'').toLowerCase();const source=row.source==='powerschool'?'PowerSchool':'EagleNEST temporary';return `<span class="pill ${esc(s)}">${esc(s.toUpperCase())}</span><div class="sub">${esc(source)}${row.conflict?' · PowerSchool wins':''}</div>${row.pending_powerschool?'<div class="sub"><strong>Needs PowerSchool entry</strong></div>':''}`;}
  function filteredRows(){const rows=Array.isArray(DATA?.rows)?DATA.rows:[],f=listFilter.value,q=listSearch.value.trim().toLowerCase();return rows.filter(r=>{if(f==='pending'&&!r.pending_powerschool)return false;if(f==='confirmed'&&!r.powerschool_confirmed)return false;if((f==='iss'||f==='oss')&&r.effective_status!==f)return false;if(!q)return true;return [r.name,r.osis,r.grade,r.effective_status,r.manual?.entered_by_email].some(v=>String(v||'').toLowerCase().includes(q))})}
  function renderRows(){const rows=filteredRows();statusRows.innerHTML=rows.length?rows.map(row=>`<tr data-osis="${esc(row.osis)}"><td><div class="studentName">${esc(row.name||row.osis)}</div><div class="sub">Grade ${esc(row.grade||'—')} · ${esc(row.osis)}</div></td><td>${effectiveDisplay(row)}</td><td>${psDisplay(row)}</td><td>${manualDisplay(row)}</td><td>${row.manual?.entered_by_email?`${esc(row.manual.entered_by_email)}<div class="sub">${esc(fmtWhen(row.manual.entered_at_iso))}</div>`:'<span class="muted">—</span>'}</td><td>${row.manual?`<button class="btn danger clearBtn" data-osis="${esc(row.osis)}" type="button">Clear EagleNEST</button>`:'<span class="muted">PowerSchool only</span>'}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">No ISS/OSS students match this view.</td></tr>';
    statusRows.querySelectorAll('.clearBtn').forEach(btn=>btn.addEventListener('click',()=>clearStatus(btn.dataset.osis)))}
  function renderSummary(){const s=DATA?.summary||{};$('countIss').textContent=Number(s.iss||0);$('countOss').textContent=Number(s.oss||0);$('countPending').textContent=Number(s.pending_powerschool||0);$('countConfirmed').textContent=Number(s.powerschool_confirmed||0);summaryDate.textContent=fmtDate(DATA?.date||statusDate.value);const ps=DATA?.powerschool||{};psHealth.textContent=ps.ok?'PowerSchool: connected':'PowerSchool: unavailable';psHealth.className=`pill ${ps.ok?'good':'bad'}`;psMeta.textContent=ps.ok?`${Number(ps.explicit_count||0)} explicit daily attendance code(s) read${ps.cached?' · cached briefly':''}${ps.fetched_at_iso?` · ${fmtWhen(ps.fetched_at_iso)}`:''}`:`Could not verify live PowerSchool status: ${ps.error||'unknown error'}`;modeBanner.hidden=!DATA?.practice;modeBanner.textContent=DATA?.practice?'🧪 Practice Mode — EagleNEST temporary records are isolated, but PowerSchool remains read-only.':'';renderRows()}
  async function loadData(force=false){clearMessages();statusRows.innerHTML='<tr><td colspan="6" class="empty">Loading…</td></tr>';refreshPsBtn.disabled=true;try{const date=statusDate.value||nyDate();const j=await jsonOrThrow(await adminFetch(`/admin/student_status?date=${encodeURIComponent(date)}${force?'&refresh=1':''}`));DATA=j;renderSummary()}catch(e){showBanner(errorBanner,`Could not load daily suspension status: ${e?.message||e}`);statusRows.innerHTML='<tr><td colspan="6" class="empty">Unavailable.</td></tr>'}finally{refreshPsBtn.disabled=false}}
  async function saveStatus(){if(saveStatusBtn.disabled)return;clearMessages();saveStatusBtn.disabled=true;try{const payload={action:'save',date:statusDate.value,osis:SELECTED.osis,status:statusType.value,note:statusNote.value.trim(),powerschool_reminder_ack:psAck.checked};const j=await jsonOrThrow(await adminFetch('/admin/student_status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}));showBanner(successBanner,j.message||(j.already_in_powerschool?`PowerSchool already has ${statusType.value.toUpperCase()} for this date.`:`Saved ${statusType.value.toUpperCase()} for ${SELECTED.name||SELECTED.osis}. Remember to enter the same daily code in PowerSchool.`));statusType.value='';statusNote.value='';psAck.checked=false;syncSaveState();await loadData(true)}catch(e){showBanner(errorBanner,`Could not save daily status: ${e?.message||e}`);syncSaveState()}}
  async function clearStatus(osis){const row=(DATA?.rows||[]).find(r=>r.osis===osis);if(!row?.manual)return;if(!confirm(`Clear the EagleNEST temporary ${String(row.manual.status||'').toUpperCase()} flag for ${row.name||osis} on ${DATA.date}? This does not change PowerSchool.`))return;clearMessages();try{await jsonOrThrow(await adminFetch('/admin/student_status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'clear',date:DATA.date,osis})}));showBanner(successBanner,'EagleNEST temporary flag cleared. PowerSchool was not changed.');await loadData(true)}catch(e){showBanner(errorBanner,`Could not clear temporary status: ${e?.message||e}`)}}

  async function boot(){statusDate.value=nyDate();statusDate.addEventListener('change',()=>loadData(true));studentSearch.addEventListener('input',()=>{SELECTED=null;selectedStudent.textContent='No student selected.';syncSaveState();clearTimeout(searchTimer);searchTimer=setTimeout(searchStudents,160)});studentSearch.addEventListener('keydown',e=>{if(e.key==='Escape')studentResults.hidden=true});document.addEventListener('click',e=>{if(!e.target.closest('.studentSearchWrap'))studentResults.hidden=true});statusType.addEventListener('change',syncSaveState);psAck.addEventListener('change',syncSaveState);saveStatusBtn.addEventListener('click',saveStatus);refreshPsBtn.addEventListener('click',()=>loadData(true));listFilter.addEventListener('change',renderRows);listSearch.addEventListener('input',renderRows);if(await ensureAuth())await loadData(true)}
  boot().catch(e=>{loginCard.hidden=false;app.hidden=true;loginOut.textContent=String(e?.message||e)});
})();

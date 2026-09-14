/* EagleNEST Student Lookup — MTSS summary card */
(() => {
  'use strict';
  const API_BASE=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
  const SESSION_HEADER='x-admin-session';
  const SESSION_KEYS=['ss_admin_session_sid_v1','teacher_att_admin_session_v1','mtss_admin_session_v1','admin_session_v1','admin_session_sid'];
  const $=(id)=>document.getElementById(id);
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let seq=0,timer=null,last='';

  function sid(){try{for(const k of SESSION_KEYS){const v=String(sessionStorage.getItem(k)||localStorage.getItem(k)||'').trim();if(v)return v;}}catch{}return '';}
  function stash(r){try{const v=String(r.headers.get(SESSION_HEADER)||r.headers.get('X-Admin-Session')||'').trim();if(v)for(const k of SESSION_KEYS){try{sessionStorage.setItem(k,v);localStorage.setItem(k,v);}catch{}}}catch{}}
  async function api(path){const h=new Headers();const s=sid();if(s)h.set(SESSION_HEADER,s);const r=await fetch(new URL(path,API_BASE),{headers:h,credentials:'include',cache:'no-store'});stash(r);const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||`HTTP ${r.status}`);return j;}
  function osis(){const u=String(new URL(location.href).searchParams.get('osis')||'').replace(/\D/g,'');if(u)return u;return String($('studentMeta')?.textContent||'').match(/OSIS\s+(\d{6,12})/i)?.[1]||'';}
  function inject(){
    if($('studentLookupMtss'))return $('studentLookupMtss');
    const overview=document.querySelector('[data-panel="overview"]'); if(!overview)return null;
    const style=document.createElement('style');style.id='studentLookupMtssStyles';style.textContent=`
      .mtssLookupBlock{margin-top:14px;border-top:1px solid var(--border);padding-top:14px}.mtssLookupHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}.mtssLookupGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:10px}.mtssLookupDomain{border:1px solid var(--border);background:var(--panel2);border-radius:14px;padding:12px}.mtssLookupDomain strong{display:block;font-size:20px}.mtssLookupDomain span{color:var(--muted);font-size:11px}.mtssLookupDomain.t2{border-color:color-mix(in srgb,var(--warn) 55%,var(--border))}.mtssLookupDomain.t3{border-color:color-mix(in srgb,var(--bad) 60%,var(--border))}.mtssLookupFoot{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}.mtssLookupMetric{font-size:12px;color:var(--muted)}@media(max-width:800px){.mtssLookupGrid{grid-template-columns:1fr}}
    `;document.head.appendChild(style);
    const el=document.createElement('section');el.id='studentLookupMtss';el.className='mtssLookupBlock';el.hidden=true;el.innerHTML=`<div class="mtssLookupHead"><div><h2>MTSS</h2><p class="muted small">Live Tier 1/2/3 status by support domain.</p></div></div><div id="mtssLookupStatus" class="muted small"></div><div id="mtssLookupGrid" class="mtssLookupGrid"></div><div class="mtssLookupFoot"><div id="mtssLookupMetric" class="mtssLookupMetric"></div><button id="mtssLookupOpen" class="btn secondary small" type="button">Open MTSS</button></div>`;
    const phase3=$('studentLookupPhase3'); if(phase3)overview.insertBefore(el,phase3); else overview.appendChild(el);
    $('mtssLookupOpen').addEventListener('click',()=>{const o=osis();const u=new URL('./mtss.html',location.href);if(o)u.searchParams.set('osis',o);location.href=u.toString();});
    return el;
  }
  function render(j){
    const d=j.domains||{};const rows=[['Attendance','attendance'],['Academic','academic'],['Behavior / SEL','behavior']];
    $('mtssLookupGrid').innerHTML=rows.map(([label,key])=>{const x=d[key]||{tier:1,status:'tier_1'};return `<div class="mtssLookupDomain t${Number(x.tier||1)}"><span>${esc(label)}</span><strong>Tier ${Number(x.tier||1)}</strong><span>${esc(x.tier>1?String(x.status||'Active case').replace(/_/g,' '):'Universal support')}</span>${x.recommendation?`<div class="small" style="margin-top:5px;color:var(--warn)">${esc(String(x.recommendation).replace(/_/g,' '))}</div>`:''}</div>`;}).join('');
    const m=d.attendance?.metrics||{};$('mtssLookupMetric').textContent=m.captured_days?`Attendance MTSS: ${m.captured_days} finalized days · ${(Number(m.attendance_rate||0)*100).toFixed(1)}% attendance · ${m.absence_count||0} absence(s) · ${m.late_count||0} late(s)`: 'Attendance MTSS begins accumulating from finalized attendance days.';
    $('mtssLookupStatus').textContent='';
  }
  async function load(force=false){
    const el=inject(); if(!el)return;const o=osis();const studentCard=$('studentCard');if(!o||studentCard?.hidden){el.hidden=true;last='';return;}if(!force&&o===last&&el.dataset.loaded==='1')return;last=o;const s=++seq;el.hidden=false;el.dataset.loaded='0';$('mtssLookupStatus').textContent='Loading MTSS status…';
    try{const j=await api(`/admin/mtss/student?osis=${encodeURIComponent(o)}`);if(s!==seq)return;render(j);el.dataset.loaded='1';}catch(e){if(s!==seq)return;$('mtssLookupStatus').textContent=`MTSS unavailable: ${e.message}`;$('mtssLookupGrid').innerHTML='';$('mtssLookupMetric').textContent='';}
  }
  function schedule(force=false){clearTimeout(timer);timer=setTimeout(()=>load(force),120);}
  function init(){inject();const card=$('studentCard'),meta=$('studentMeta');const obs=new MutationObserver(()=>schedule(false));if(card)obs.observe(card,{attributes:true,attributeFilter:['hidden']});if(meta)obs.observe(meta,{childList:true,subtree:true,characterData:true});$('refreshStudentBtn')?.addEventListener('click',()=>schedule(true));window.addEventListener('popstate',()=>schedule(true));schedule(false);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

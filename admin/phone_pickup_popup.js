/* EAGLENEST_PHONE_PICKUP_POPUP_V1 — Main Office phone pickup queue popup */
(() => {
  'use strict';

  if (/\/(?:phone_pass|esas)\.html$/i.test(location.pathname || '')) return;

  const API_BASE=((document.querySelector('meta[name="api-base"]')?.content||location.origin).replace(/\/*$/,'')+'/');
  const SESSION_HEADER='x-admin-session';
  const SESSION_KEYS=[
    'ss_admin_session_sid_v1',
    'admin_session_v1',
    'teacher_att_admin_session_v1',
    'staff_pull_admin_session_v1',
    'phone_pass_admin_session_v1'
  ];
  let timer=null,positionTimer=null,stopped=false;

  function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
  function sid(){try{for(const key of SESSION_KEYS){const v=String(sessionStorage.getItem(key)||localStorage.getItem(key)||'').trim();if(v)return v}}catch{}return''}
  function headers(){const h=new Headers();const s=sid();if(s)h.set(SESSION_HEADER,s);return h}
  function fmtClock(iso){if(!iso)return'';const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):''}
  function locker(rec){const c=String(rec?.locker_color_effective??rec?.locker_color??'').trim(),n=String(rec?.locker_number_effective??rec?.locker_number??'').trim();if(c&&n)return`Locker ${c} #${n}`;if(c)return`Locker ${c}`;if(n)return`Locker #${n}`;return'Phone locker'}
  function emailLocal(email){const s=String(email||'').trim();const at=s.indexOf('@');return at>0?s.slice(0,at):s}

  function ensureStyle(){
    if(document.getElementById('eaglenestPhonePickupPopupStyle'))return;
    const style=document.createElement('style');
    style.id='eaglenestPhonePickupPopupStyle';
    style.textContent=`
      #eaglenestPhonePickupPopup{
        --pp-bg:#0f172a;--pp-surface:#111827;--pp-fg:#e5e7eb;--pp-muted:#94a3b8;
        --pp-info:#fbbf24;--pp-border:rgba(245,158,11,.46);--pp-soft:rgba(148,163,184,.20);
        --pp-shadow:0 22px 60px rgba(0,0,0,.34);
        position:fixed;right:18px;bottom:18px;z-index:2147483643;
        width:min(390px,calc(100vw - 36px));padding:15px;border:1px solid var(--pp-border);
        border-radius:18px;background:var(--pp-bg);color:var(--pp-fg);box-shadow:var(--pp-shadow);
        display:none;cursor:pointer;color-scheme:dark;transition:bottom .16s ease,transform .12s ease;
      }
      #eaglenestPhonePickupPopup[data-show="1"]{display:block}
      #eaglenestPhonePickupPopup:hover{transform:translateY(-1px)}
      :root[data-theme="light"] #eaglenestPhonePickupPopup{
        --pp-bg:#fff;--pp-surface:#f8fafc;--pp-fg:#0f172a;--pp-muted:#64748b;
        --pp-info:#b45309;--pp-border:rgba(217,119,6,.40);--pp-soft:rgba(100,116,139,.18);
        --pp-shadow:0 18px 46px rgba(15,23,42,.16);color-scheme:light;
      }
      .enPickupEyebrow{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--pp-info)}
      .enPickupTitle{font-size:19px;font-weight:950;line-height:1.2;margin-top:4px;color:var(--pp-fg)}
      .enPickupMeta{font-size:12px;color:var(--pp-muted);margin-top:5px;line-height:1.45}
      .enPickupDetail{margin-top:11px;padding:10px 11px;border:1px solid var(--pp-soft);border-radius:12px;background:var(--pp-surface)}
      .enPickupDetail strong{display:block;font-size:14px;color:var(--pp-fg)}
      .enPickupDetail span{display:block;margin-top:3px;font-size:12px;color:var(--pp-muted);line-height:1.4}
      .enPickupHint{margin-top:10px;font-size:11px;color:var(--pp-muted);font-weight:800}
      .enPickupDot{display:inline-block;width:8px;height:8px;border-radius:999px;background:#f59e0b;margin-right:6px;box-shadow:0 0 0 3px rgba(245,158,11,.13)}
      @media(max-width:600px){#eaglenestPhonePickupPopup{right:10px;bottom:10px;width:calc(100vw - 20px)}}
      @media(prefers-reduced-motion:reduce){#eaglenestPhonePickupPopup{transition:none}}
    `;
    document.head.appendChild(style);
  }
  function ensureCard(){
    ensureStyle();
    let card=document.getElementById('eaglenestPhonePickupPopup');
    if(!card){
      card=document.createElement('aside');
      card.id='eaglenestPhonePickupPopup';
      card.setAttribute('aria-live','polite');
      card.setAttribute('role','status');
      card.tabIndex=0;
      const open=()=>{location.href=new URL('./phone_pass.html',location.href).toString()};
      card.addEventListener('click',open);
      card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
      document.body.appendChild(card);
    }
    return card;
  }
  function position(){
    const card=document.getElementById('eaglenestPhonePickupPopup');
    if(!card||card.dataset.show!=='1')return;
    const base=window.innerWidth<=600?10:18;
    const call=document.getElementById('eaglenestPhoneLiveCard');
    if(call&&call.dataset.show==='1'){
      const h=Math.ceil(call.getBoundingClientRect().height||0);
      card.style.bottom=`${base+h+12}px`;
    }else{
      card.style.bottom=`${base}px`;
    }
  }
  function render(data){
    const card=ensureCard();
    const rows=Array.isArray(data?.requests)?data.requests:[];
    if(data?.enabled!==true||!rows.length){card.dataset.show='0';return}
    const first=rows[0]||{};
    const requested=fmtClock(first.phone_pickup_requested_at);
    const by=emailLocal(first.phone_pickup_requested_by_email)||String(first.phone_pickup_requested_by_title||'').trim();
    const loc=String(first.cur_label||first.cur_loc||'').trim();
    const extra=rows.length>1?`+${rows.length-1} more waiting`:'';
    const meta=[locker(first),requested?`requested ${requested}`:'',by?`sent by ${by}`:'',loc?`now @ ${loc}`:''].filter(Boolean).join(' • ');
    card.innerHTML=`
      <div class="enPickupEyebrow"><span class="enPickupDot"></span>Main Office phone pickup</div>
      <div class="enPickupTitle">${esc(first.name||'Student')} was sent to pick up their phone</div>
      <div class="enPickupMeta">${esc(meta)}</div>
      ${first.phone_note?`<div class="enPickupDetail"><strong>Note</strong><span>${esc(first.phone_note)}</span></div>`:''}
      ${extra?`<div class="enPickupDetail"><strong>${esc(extra)}</strong><span>Open Phone Pass to view the pickup queue.</span></div>`:''}
      <div class="enPickupHint">Click anywhere to open Phone Pass</div>`;
    card.dataset.show='1';
    card.title='Open Phone Pass';
    position();
  }
  async function poll(){
    if(stopped)return;
    try{
      const r=await fetch(new URL('/admin/phone_pass/pickup_popup',API_BASE),{
        method:'GET',headers:headers(),credentials:'include',cache:'no-store'
      });
      const data=await r.json().catch(()=>null);
      if(r.status===403||data?.enabled===false){render({enabled:false,requests:[]});stop();return}
      if(r.ok&&data?.ok)render(data);
    }catch{}
  }
  function start(){
    stopped=false;
    if(timer)clearInterval(timer);
    poll();
    timer=setInterval(()=>{if(!document.hidden)poll()},5000);
    if(positionTimer)clearInterval(positionTimer);
    positionTimer=setInterval(position,1000);
  }
  function stop(){
    stopped=true;
    if(timer)clearInterval(timer);timer=null;
    if(positionTimer)clearInterval(positionTimer);positionTimer=null;
    const card=document.getElementById('eaglenestPhonePickupPopup');
    if(card)card.dataset.show='0';
  }

  window.EagleNESTPhonePickupPopup={start,stop,refresh:poll};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!stopped)poll()});
  window.addEventListener('resize',position);
  window.addEventListener('pagehide',stop,{once:true});
  start();
})();

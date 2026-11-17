/* EAGLENEST_DEVICE_MANAGEMENT_V1 — Sys Admin-only Student Lookup device history. */
(() => {
  'use strict';
  const API=(document.querySelector('meta[name="api-base"]')?.content||'').replace(/\/*$/,'')+'/';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[c]));
  let authorized=null,currentOsis='',seq=0;
  async function get(path){
    const headers=new Headers(),sid=window.EAGLENEST_AUTH?.getSid?.();if(sid)headers.set('x-admin-session',sid);
    const r=await fetch(new URL(path.replace(/^\//,''),API),{headers,cache:'no-store',credentials:'include'});
    const newSid=r.headers.get('x-admin-session');if(newSid)window.EAGLENEST_AUTH?.setSid?.(newSid);
    const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.error||'Device history unavailable');return j;
  }
  async function allow(){if(authorized!==null)return authorized;
    try{const a=await get('/admin/access');return authorized=a.role==='super_admin'&&a.can?.super_admin===true;}
    catch{return false;}
  }
  function panel(){let el=document.getElementById('studentLookupDevicesPanel');
    if(el)return el;
    const card=document.getElementById('studentCard');if(!card)return null;
    el=document.createElement('section');el.id='studentLookupDevicesPanel';el.className='card';
    el.style.cssText='margin-top:14px';card.insertAdjacentElement('afterend',el);return el;
  }
  async function selected(osis){const key=++seq;currentOsis=String(osis||'').trim();if(!/^\d{9}$/.test(currentOsis))return;
    if(!(await allow())||key!==seq)return;
    const el=panel();if(!el)return;el.hidden=false;el.textContent='Loading Chromebook assignment history…';
    try{const data=await get('/admin/device-management/student?osis='+encodeURIComponent(currentOsis));if(key!==seq)return;
      // EAGLENEST_DEVICE_BORROWING_LOG_V1 — show both owner and borrower events.
      const borrowData=await get('/admin/device-management/borrowing/student?osis='+encodeURIComponent(currentOsis)).catch(()=>({borrowings:[]}));
      if(key!==seq)return;
      const current=(data.assignments||[]).filter(a=>!a.returned_at),past=(data.assignments||[]).filter(a=>a.returned_at);
      const issues=(data.tickets||[]).filter(t=>t.status!=='closed');
      el.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h2 style="margin:0 0 4px">Devices & Loaners <small style="font-size:.65em;font-weight:400;color:var(--muted)">Sys Admin only</small></h2><div class="muted small">Permanent Chromebook assignment history</div></div><a class="btn secondary" href="./device_management.html?osis=${encodeURIComponent(currentOsis)}">Open Device Management</a></div>`+
        `<div style="margin-top:12px">${current.length?current.map(a=>`<div style="border-top:1px solid var(--border);padding:10px 0"><b>${esc(a.kind.replace('_',' '))}:</b> ${esc(a.asset_tag||a.serial_number||'Device')} · ${esc(a.model||'Chromebook')} · ${esc(a.operational_status)}</div>`).join(''):'<p class="muted">No current Chromebook or loaner assignments.</p>'}</div>`+
        `<p class="muted small">${past.length} previous assignment${past.length===1?'':'s'} · ${issues.length} open device issue${issues.length===1?'':'s'}. View the full chronology and manage devices on the Device Management page.</p>`+
        `<div style="margin-top:12px"><h3 style="margin-bottom:6px">Borrowing / other student use (${(borrowData.borrowings||[]).length})</h3>`+
        `${(borrowData.borrowings||[]).length ? (borrowData.borrowings||[]).slice(0,5).map(b=>`<p class="muted small"><b>${esc(b.permission_status==='no'?'Without permission':b.permission_status==='yes'?'With permission':'Permission not confirmed')}</b> · ${esc(b.owner_osis===currentOsis?'Another student used their Chromebook':'Used another student’s Chromebook')} · ${esc(b.asset_tag||b.serial_number||'Device')} · ${esc(b.occurred_at||'')}</p>`).join('') : '<p class="muted small">None recorded.</p>'}</div>`;
    }catch(error){if(key===seq)el.textContent=error.message||'Device history unavailable.';}
  }
  document.addEventListener('eaglenest:student-lookup-selected',e=>void selected(e.detail?.osis));
  document.addEventListener('eaglenest:student-lookup-refreshed',e=>void selected(e.detail?.osis));
})();

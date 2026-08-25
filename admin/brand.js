(function () {
  const BRAND_NAME = 'EagleNEST';

  // Edit labels here when you want to rename modules globally.
  const MODULES = {
    kiosk: 'Scanner Kiosk',
    my_schedule: 'My Schedule',
    teacher_attendance: 'Teacher Attendance',
    teacher_trace_lookup: 'Attendance Diagnostics',
    attendance_status: 'Attendance Status',
    senior_lunch_audit: 'Senior Lunch Audit',
    student_scans: 'Student Scan Report',
    student_view: 'Student Snapshot',
    student_contacts: 'Student Contacts',
    contact_review: 'Contact Correction Review',
    hallway: 'Hallway Monitor',
    visitor_desk: 'Visitor Desk',
    early_dismissal: 'Early Dismissal',
    after_school_monitor: 'After-School Monitor',
    staff_pull: 'Staff Pull',
    phone_pass: 'Phone Pass',
    notifications: 'My Settings',
    incident_creator: 'Incident Creator',
    behavior_history: 'Logged Behaviors',
    fidelity_dashboard: 'Fidelity Dashboard',
    reflection_hold: 'Reflection Hold',
    dreamer_of_week: 'Dreamer of the Week',
    attendance_change: 'Attendance Change',
    excused_apply: 'Attendance Change', // legacy alias
    admin_roles: 'Roles & Access',
    admin: 'System Administration'
  };

  // Expose brand + module labels immediately so nav.js can consume them.
  window.EAGLENEST_BRAND = {
    name: BRAND_NAME,
    modules: MODULES,
    moduleKey: '',
    moduleLabel: '',
    fullTitle: BRAND_NAME
  };

  function resolveModuleKey() {
    return (
      document.body?.dataset?.module ||
      document.documentElement?.dataset?.module ||
      ''
    );
  }

  function resolveModuleLabel(key) {
    return MODULES[key] || '';
  }

  function fullTitle(key) {
    const label = resolveModuleLabel(key);
    return label ? `${BRAND_NAME} — ${label}` : BRAND_NAME;
  }

  function applyBranding() {
    const key = resolveModuleKey();
    const label = resolveModuleLabel(key);
    const title = fullTitle(key);

    document.title = title;

    document.querySelectorAll('[data-brand-name]').forEach((el) => {
      el.textContent = BRAND_NAME;
    });
    document.querySelectorAll('[data-brand-module]').forEach((el) => {
      el.textContent = label;
    });
    document.querySelectorAll('[data-brand-title]').forEach((el) => {
      el.textContent = title;
    });

    window.EAGLENEST_BRAND = {
      name: BRAND_NAME,
      modules: MODULES,
      moduleKey: key,
      moduleLabel: label,
      fullTitle: title
    };
  }


  /* Scanner RFID config cards — System Administration only. */
  function installScannerConfigCardsAdmin() {
    if (resolveModuleKey() !== 'admin') return;
    if (document.getElementById('scannerConfigCardsCard')) return;
    const modeCard = document.getElementById('systemModeCard');
    if (!modeCard) return;

    const card = document.createElement('section');
    card.className = 'card';
    card.id = 'scannerConfigCardsCard';
    card.innerHTML = `
      <h2>Scanner RFID Config Cards</h2>
      <div class="muted">
        Configure up to two dedicated RFID cards for scanner setup. <strong>Both cards do the same thing:</strong> scanning either card toggles the current scanner's persistent location lock. If the scanner is locked, the card unlocks it while keeping its selected location. If it is unlocked and has a selected location, the card locks it to that location. These are live system configuration controls and remain active during Practice Mode.
      </div>
      <div class="row" style="gap:12px; margin-top:12px;">
        <label class="col"><span class="muted">Scanner Config Card 1 RFID tag</span><input id="scannerUnlockRfid" type="text" inputmode="numeric" autocomplete="off" placeholder="RFID tag number"></label>
        <label class="col"><span class="muted">Scanner Config Card 2 RFID tag</span><input id="scannerLockRfid" type="text" inputmode="numeric" autocomplete="off" placeholder="RFID tag number"></label>
      </div>
      <div class="row" style="margin-top:10px;">
        <div class="col muted">Leave either field blank to disable that card. The two configured tags must be different, and a config tag cannot match a student OSIS or RFID.</div>
        <div class="col right"><button id="btnSaveScannerConfigCards" class="btn primary" type="button">Save scanner cards</button></div>
      </div>
      <pre id="scannerConfigCardsOut" class="pane">—</pre>`;
    modeCard.insertAdjacentElement('afterend', card);

    const apiBaseMeta = String(document.querySelector('meta[name="api-base"]')?.content || '').trim();
    const apiBase = (apiBaseMeta ? apiBaseMeta.replace(/\/*$/, '') : window.location.origin) + '/';
    const sessionKeys = ['admin_session_v1','ss_admin_session_sid_v1','teacher_att_admin_session_v1','staff_pull_admin_session_v1','phone_pass_admin_session_v1','student_scans_admin_session_v1'];
    const getSid = () => {
      try {
        for (const key of sessionKeys) {
          const value = String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim();
          if (value) return value;
        }
      } catch {}
      return '';
    };
    const configFetch = (path, init = {}) => {
      const headers = new Headers(init.headers || {});
      const sid = getSid();
      if (sid) headers.set('x-admin-session', sid);
      return fetch(new URL(path, apiBase), { ...init, headers, credentials:'include', cache:'no-store' });
    };
    const card1Input = card.querySelector('#scannerUnlockRfid');
    const card2Input = card.querySelector('#scannerLockRfid');
    const out = card.querySelector('#scannerConfigCardsOut');
    const saveBtn = card.querySelector('#btnSaveScannerConfigCards');

    const render = (data) => {
      card1Input.value = String(data?.unlock_rfid || '');
      card2Input.value = String(data?.lock_rfid || '');
      const lines = [
        data?.unlock_rfid ? 'Config Card 1: configured' : 'Config Card 1: disabled',
        data?.lock_rfid ? 'Config Card 2: configured' : 'Config Card 2: disabled',
        'Action: toggle scanner location lock'
      ];
      if (data?.updated_at) lines.push(`Updated: ${data.updated_at}${data?.updated_by ? ` by ${data.updated_by}` : ''}`);
      out.textContent = lines.join('\n');
    };

    const load = async () => {
      out.textContent = 'Loading scanner config cards…';
      try {
        const r = await configFetch('/admin/scanner_config_cards', { method:'GET' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        render(j);
      } catch (e) {
        out.textContent = `Load failed: ${e?.message || e}`;
      }
    };

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      out.textContent = 'Saving scanner config cards…';
      try {
        const r = await configFetch('/admin/scanner_config_cards', {
          method:'POST',
          headers:{ 'content-type':'application/json' },
          body:JSON.stringify({ unlock_rfid: card1Input.value.trim(), lock_rfid: card2Input.value.trim() })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) {
          if (j?.error === 'rfid_already_assigned_to_student' && j?.collision) {
            throw new Error(`${j.field || 'RFID'} is already assigned to ${j.collision.name || 'a student'}${j.collision.osis ? ` (${j.collision.osis})` : ''}.`);
          }
          if (j?.error === 'rfid_cards_must_be_different') throw new Error('Config Card 1 and Config Card 2 must use different RFID tags.');
          if (j?.error === 'rfid_digits_only') throw new Error(`${j.field || 'RFID'} must contain digits only.`);
          throw new Error(j?.error || `HTTP ${r.status}`);
        }
        render(j);
      } catch (e) {
        out.textContent = `Save failed: ${e?.message || e}`;
      } finally {
        saveBtn.disabled = false;
      }
    });

    // admin.js establishes the session asynchronously. Wait until the admin app
    // is visible before the first authenticated read.
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const app = document.getElementById('appInner');
      const visible = app && getComputedStyle(app).display !== 'none';
      if (visible || tries >= 40) {
        clearInterval(timer);
        if (visible) load();
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyBranding();
      installScannerConfigCardsAdmin();
    }, { once: true });
  } else {
    applyBranding();
    installScannerConfigCardsAdmin();
  }
})();

(function () {
  const BRAND_NAME = 'EagleNEST';

  // Edit labels here when you want to rename modules globally.
  const MODULES = {
    kiosk: 'Scanner Kiosk',
    teacher_attendance: 'Teacher Attendance',
    attendance_status: 'Attendance Status',
    student_scans: 'Student Scan Report',
    student_view: 'Student View',
    hallway: 'Hallway Monitor',
    staff_pull: 'Staff Pull',
    phone_pass: 'Phone Pass',
    attendance_change: 'Attendance Change',
    excused_apply: 'Attendance Change', // legacy alias
    admin: 'Admin Dashboard'
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBranding, { once: true });
  } else {
    applyBranding();
  }
})();

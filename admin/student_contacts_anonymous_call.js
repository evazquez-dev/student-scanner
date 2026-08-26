(() => {
  'use strict';

  function isInstalledStaffApp() {
    try {
      if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    } catch {}
    // iOS home-screen web apps expose this non-standard compatibility flag.
    return window.navigator?.standalone === true;
  }

  function anonymousTelHref(rawHref) {
    const raw = String(rawHref || '').replace(/^tel:/i, '');
    const digits = raw.replace(/\D/g, '');
    return digits ? `tel:*67${digits}` : '';
  }

  function mountAnonymousCallControl() {
    if (!isInstalledStaffApp()) return;
    if (document.getElementById('anonymousCallControl')) return;

    const syncStamp = document.getElementById('syncStamp');
    if (!syncStamp?.parentElement) return;

    const tools = document.createElement('div');
    tools.id = 'studentContactsAppTools';
    Object.assign(tools.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '8px'
    });
    syncStamp.parentElement.insertBefore(tools, syncStamp);
    tools.appendChild(syncStamp);

    const control = document.createElement('label');
    control.id = 'anonymousCallControl';
    control.title = 'When enabled, phone links are sent to the dialer with *67 prefixed.';
    Object.assign(control.style, {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      border: '1px solid var(--border)',
      background: 'var(--soft)',
      borderRadius: '12px',
      padding: '8px 10px',
      fontWeight: '800',
      cursor: 'pointer'
    });

    const checkbox = document.createElement('input');
    checkbox.id = 'anonymousCall';
    checkbox.type = 'checkbox';
    checkbox.checked = false;
    checkbox.style.marginTop = '3px';

    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = 'Call anonymously';
    const hint = document.createElement('span');
    hint.textContent = 'Prefix calls with *67';
    hint.className = 'muted small';
    hint.style.display = 'block';
    hint.style.marginTop = '1px';
    hint.style.fontWeight = '600';
    copy.append(title, hint);
    control.append(checkbox, copy);
    tools.appendChild(control);

    // Only intercept a tel: link while the installed-app-only switch is on.
    // With the switch off, the page keeps its existing normal dialer behavior.
    document.addEventListener('click', (event) => {
      if (!checkbox.checked) return;
      const link = event.target?.closest?.('a[href^="tel:"]');
      if (!link) return;
      const anonymousHref = anonymousTelHref(link.getAttribute('href'));
      if (!anonymousHref) return;
      event.preventDefault();
      window.location.href = anonymousHref;
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAnonymousCallControl, { once: true });
  } else {
    mountAnonymousCallControl();
  }
})();

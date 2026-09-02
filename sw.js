// sw.js
const VERSION = 'v20.7.0-2026-09-02'; // Phone Pass hardening verification checkpoint
const STATIC_CACHE = `static-${VERSION}`;

const PRECACHE = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k.startsWith('static-') && k !== STATIC_CACHE) ? caches.delete(k) : null)
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass admin, visitor, and scanner lab routes so live records/forms/test code are never cached.
  if (url.pathname.includes('/admin/') || url.pathname.includes('/visitor/') || url.pathname.includes('/scanner-lab/')) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  const isNav =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNav) {
    // ✅ Network-only HTML so normal refresh never serves stale app shell
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() =>
        new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } })
      )
    );
    return;
  }

  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  // Only cache GETs
  if (req.method !== 'GET') return fetch(req);

  const cached = await caches.match(req);
  if (cached) {
    // background revalidate
    fetch(req).then((res) => {
      if (res && res.ok) caches.open(STATIC_CACHE).then((c) => c.put(req, res.clone()));
    }).catch(() => {});
    return cached;
  }

  const res = await fetch(req);
  if (res && res.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(req, res.clone());
  }
  return res;
}

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type !== 'GET_SW_VERSION') return;

  const payload = { type: 'SW_VERSION', version: VERSION };

  // Preferred: respond over MessageChannel if provided
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage(payload);
    return;
  }

  // Fallback: respond directly to the sending client
  if (event.source && event.source.postMessage) {
    event.source.postMessage(payload);
  }
});


self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {
    try { data = { body: event.data ? event.data.text() : '' }; } catch { data = {}; }
  }
  const title = String(data.title || 'EagleNEST');
  const body = String(data.body || 'You have a new EagleNEST notification.');
  const tag = String(data.tag || 'eaglenest-notification');
  const url = String(data.url || './admin/notifications.html');
  const icon = new URL('./icons/icon-192.png', self.registration.scope).href;
  const badge = new URL('./icons/icon-192.png', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(title, {
    body, tag, icon, badge,
    data: { url },
    renotify: true
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = String(event.notification?.data?.url || './admin/notifications.html');
  const targetUrl = new URL(raw, self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      try {
        if ('navigate' in client) await client.navigate(targetUrl);
        if ('focus' in client) return client.focus();
      } catch {}
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    return null;
  })());
});

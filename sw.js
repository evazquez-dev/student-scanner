// sw.js
const VERSION = 'v17-2026-01-06'; // bump on each deploy
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

  // ✅ Bypass any admin route anywhere in the path (your site uses /student-scanner/admin/...)
  if (url.pathname.includes('/admin/')) {
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
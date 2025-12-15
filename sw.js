// sw.js
const VERSION = 'v14-2025-10-23';           // ⬅️ bump on each deploy
const STATIC_CACHE = `static-${VERSION}`;

const PRECACHE = [
  // Keep small static stuff here; avoid index.html so updates are instant
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // add other truly-static assets (images, sounds, fonts)
];

// Install: precache static assets, then activate immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(c => c.addAll(PRECACHE)).catch(()=>{})
  );
  self.skipWaiting();
});

// Activate: remove older caches and take control
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k.startsWith('static-') && k !== STATIC_CACHE) ? caches.delete(k) : null))
    )
  );
  self.clients.claim();
});

// Fetch: 
//  - HTML/navigation => NETWORK-FIRST (so Ctrl+R gets new code)
//  - other requests  => CACHE-FIRST with background revalidate
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // ✅ 1) Bypass ALL admin routes (yours are /student-scanner/admin/...)
  if (url.pathname.includes('/admin/')) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // ✅ 2) Treat HTML/navigation as network-first
  const isNav = req.mode === 'navigate' ||
                req.destination === 'document' ||
                (req.headers.get('accept') || '').includes('text/html');

  if (isNav) {
    event.respondWith(networkFirst(req));
    return;
  }

  // ✅ 3) For JS modules/CSS, prefer network-first (avoids stale “mixed” deploys)
  if (req.destination === 'script' || req.destination === 'style') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else: cache-first
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) {
    fetch(req).then(res => {
      if (res && res.ok && req.method === 'GET') {
        caches.open(STATIC_CACHE).then(c => c.put(req, res.clone()));
      }
    }).catch(()=>{});
    return cached;
  }

  try {
    const res = await fetch(req);
    if (res && res.ok && req.method === 'GET') {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    // Don’t fabricate 504s for JS/modules; just fail naturally
    return new Response('', { status: 504 });
  }
}

async function networkFirst(req) {
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    // Optionally put a copy in cache for offline fallback
    const cache = await caches.open(STATIC_CACHE);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    // Offline fallback: whatever we have cached
    const cached = await caches.match(req);
    if (cached) return cached;
    // As a last resort, serve a minimal offline page if you’ve precached one
    return new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' }, status: 503 });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) {
    // Revalidate in background (don’t block)
    fetch(req).then(res => {
      if (res && res.ok) caches.open(STATIC_CACHE).then(c => c.put(req, res));
    }).catch(()=>{});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      if (request.method !== 'GET') {
        return fetch(request);
      }
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

// Minimal app-shell cache; NEVER cache API (PII) calls
const CACHE = 'scanner-v10';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => (k !== CACHE && k.startsWith('scanner-')) ? caches.delete(k) : null)
    ))
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Bypass caching for Apps Script /exec (or any non-origin) requests.
  // Also skip any request with query params that look like API calls.
  if (url.href.includes('/exec')) return;           // let it hit the network
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});

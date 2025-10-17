const CACHE = 'scanner-v2';                 // bump when you change files
const ASSETS = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE && k.startsWith('scanner-') ? caches.delete(k) : null)))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Bypass caching for API (Apps Script /exec) calls:
  if (url.pathname.includes('/exec')) return;   // just let it hit network
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});

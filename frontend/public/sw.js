const CACHE = 'suraksha-v1';
const SHELL = ['/', '/index.html', '/offline.html', '/shield.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // NEVER cache: SOS trigger, AI chat, map tiles — must be live (PRD §6-K)
  if (url.pathname.includes('/api/sos') || url.pathname.includes('/api/chat') ||
      url.hostname.includes('tile.openstreetmap')) {
    return; // default network
  }

  // Stale-while-revalidate for read-only map/location data
  if (url.pathname.includes('/api/locations') || url.pathname.includes('/api/ratings')) {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const network = fetch(e.request).then(res => { cache.put(e.request, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    }));
    return;
  }

  // App shell: cache-first with offline fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html')));
  }
});

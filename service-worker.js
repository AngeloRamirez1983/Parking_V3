/* Parking – Estacionamiento Rengo SW (GitHub Pages subpath)
   Estrategia mixta:
   - HTML: network-first (con fallback a caché)
   - Estáticos: cache-first
   - Externos (CDN): cache-first con opaque (si CORS lo permite)
*/
const BASE = '/Parking_V3';
const CACHE_NAME = 'parking-rengo-v8'; // <-- sube versión al cambiar archivos
const CORE_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`
  // agrega aquí otros íconos si los tienes (maskable, shortcuts, etc.)
];

// Librerías externas usadas en index.html
const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    // Precarga “best effort” de externos (si falla, no rompe)
    for (const url of EXTERNAL_ASSETS) {
      try { await cache.add(new Request(url, { mode: 'no-cors' })); } catch (_) {}
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Navegación/HTML → network-first
  if (isNavigationRequest(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(`${BASE}/index.html`);
        return cached || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // 2) Misma-origen dentro de /Parking_V3 → cache-first
  if (url.origin === self.location.origin && url.pathname.startsWith(BASE)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (req.method === 'GET' && (fresh.status === 200 || fresh.type === 'opaque')) {
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        return cached || new Response('', { status: 504 });
      }
    })());
    return;
  }

  // 3) Externos (CDN) → cache-first con no-cors fallback
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req, { mode: 'no-cors' });
      cache.put(req, fresh.clone()); // aunque sea opaque
      return fresh;
    } catch (err) {
      return cached || new Response('', { status: 504 });
    }
  })());
});

// Mensaje opcional para forzar actualización desde la app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

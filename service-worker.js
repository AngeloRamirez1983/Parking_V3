/* Parking – Estacionamiento Rengo SW
   Estrategia mixta:
   - HTML: network-first (con fallback a caché)
   - Estáticos: cache-first
   - Externos (CDN): cache-first con opaque (si CORS lo permite)
*/
const CACHE_NAME = 'parking-rengo-v7';
const CORE_ASSETS = [
  '/',               // GitHub Pages resuelve a /index.html en raíz del repo de usuario
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // agrega aquí tus otros íconos si los tienes
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
    // Intenta precachear externos (si fallan, no rompe la instalación)
    for (const url of EXTERNAL_ASSETS) {
      try { await cache.add(new Request(url, { mode: 'no-cors' })); } catch (_) {}
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Limpia versiones antiguas
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    // Control inmediato de clientes
    await self.clients.claim();
  })());
});

// Helper: determina si es navegación HTML
function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

// Fetch handler
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
        const cached = await cache.match('/index.html');
        return cached || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // 2) Misma-origen estáticos → cache-first
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        // Cachea solo GET exitosos
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
      // Guardar aunque sea opaque
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return cached || new Response('', { status: 504 });
    }
  })());
});

// Opción: mensaje para forzar actualización desde la app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

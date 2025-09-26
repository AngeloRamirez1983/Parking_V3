/* Service Worker – Parking PWA
   - Cache-first para archivos del mismo origen (app shell)
   - Network-first con fallback para librerías CDN (qrcodejs, jsQR, CryptoJS, XLSX, jsPDF)
   - Limpieza de versiones antiguas
*/
const CACHE = 'parking-pwa-v5';

const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo.svg'
];

// Hosts de librerías externas que usamos
const CDN_HOSTS = /(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // CDN: network-first con fallback al cache
  if (CDN_HOSTS.test(url.hostname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Mismo origen: cache-first con actualización en segundo plano
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // Actualiza en background
          fetch(req).then((res) => {
            caches.open(CACHE).then((c) => c.put(req, res));
          }).catch(() => {});
          return cached;
        }
        return fetch(req)
          .then((res) => {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
            return res;
          })
          .catch(() => caches.match('./index.html')); // fallback básico
      })
    );
    return;
  }

  // Otros orígenes: intenta red, luego cache
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

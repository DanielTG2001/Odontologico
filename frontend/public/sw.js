/*
 * Service worker de SIGO-Dental.
 *
 * Política de caché pensada para datos de salud (Ley de Protección de Datos / HIPAA):
 *  - /api/*  → SIEMPRE red. Nunca se guardan expedientes, pacientes ni facturas en el dispositivo.
 *  - /_next/static/* (JS/CSS con hash) → caché primero (inmutables).
 *  - Íconos, manifest y fuentes → caché con actualización en segundo plano.
 *  - Páginas → red primero; si no hay conexión, la última versión de la "cáscara" o /offline.html.
 *    Las páginas no contienen datos clínicos: estos se cargan después desde /api.
 */
const VERSION = 'sigo-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const PRECACHE = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  // Al cerrar sesión se borran las páginas guardadas (por si el equipo es compartido)
  if (event.data === 'CLEAR_PAGES') caches.delete(PAGES_CACHE);
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(STATIC_CACHE)).put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok && res.headers.get('content-type')?.includes('text/html')) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await caches.match('/offline.html'));
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Datos clínicos y financieros: nunca en caché
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  // Páginas públicas de pago: siempre en vivo
  if (url.pathname.startsWith('/pay/')) return;

  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.pathname.startsWith('/icons/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirstPage(request));
  }
});

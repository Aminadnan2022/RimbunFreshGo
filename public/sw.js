const CACHE_NAME = 'freshgo-pwa-shell-v1';
const OFFLINE_URL = '/offline.html';
const STATIC_SHELL = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/freshgo-192.png',
  '/icons/freshgo-512.png',
  '/icons/freshgo-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('freshgo-pwa-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never cache application routes, API calls, Supabase responses, or authenticated data.
  // Only navigation requests receive the static offline fallback when the network is unavailable.
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(() => caches.match(OFFLINE_URL)),
  );
});

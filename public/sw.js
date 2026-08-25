const SERVICE_WORKER_VERSION = 'freshgo-web-push-v3';
const CACHE_NAME = 'freshgo-pwa-shell-v2';
const PUSH_DIAGNOSTIC_CACHE = 'freshgo-web-push-diagnostic-v1';
const PUSH_DIAGNOSTIC_KEY = '/__freshgo_web_push_diagnostic_v1__';
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
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL)),
    self.skipWaiting(),
  ]));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('freshgo-pwa-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
    self.clients.claim(),
  ]));
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

function safeActionRoute(value) {
  if (typeof value !== 'string' || value.includes('\\')) return '/notifications';
  try {
    const destination = new URL(value, self.location.origin);
    if (destination.origin !== self.location.origin || !destination.pathname.startsWith('/')) return '/notifications';
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch { return '/notifications'; }
}

// This contains only lifecycle timestamps and result codes. It deliberately
// excludes push payloads, subscription endpoints, credentials, and identifiers.
async function readPushDiagnostic() {
  const cache = await caches.open(PUSH_DIAGNOSTIC_CACHE);
  const response = await cache.match(PUSH_DIAGNOSTIC_KEY);
  if (!response) return { receivedCount: 0 };
  try {
    const record = await response.json();
    return record && typeof record === 'object' ? record : { receivedCount: 0 };
  } catch { return { receivedCount: 0 }; }
}

async function writePushDiagnostic(update) {
  const cache = await caches.open(PUSH_DIAGNOSTIC_CACHE);
  const previous = await readPushDiagnostic();
  const record = { ...previous, ...update };
  await cache.put(PUSH_DIAGNOSTIC_KEY, new Response(JSON.stringify(record), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  }));
  return record;
}

function pushDiagnosticSnapshot(record) {
  return {
    receivedAt: typeof record.receivedAt === 'string' ? record.receivedAt : null,
    showAttemptedAt: typeof record.showAttemptedAt === 'string' ? record.showAttemptedAt : null,
    showResult: record.showResult === 'fulfilled' || record.showResult === 'rejected' ? record.showResult : null,
    showCompletedAt: typeof record.showCompletedAt === 'string' ? record.showCompletedAt : null,
    receivedCount: typeof record.receivedCount === 'number' ? record.receivedCount : 0,
  };
}

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === 'string' && payload.title ? payload.title.slice(0, 120) : 'FreshGo';
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 280) : 'You have an important FreshGo update.';
  const action = safeActionRoute(payload.action);
  event.waitUntil((async () => {
    const receivedAt = new Date().toISOString();
    // Diagnostics are strictly best-effort: Cache Storage trouble must never
    // prevent a user-visible notification from being requested.
    try {
      const previous = await readPushDiagnostic();
      await writePushDiagnostic({
        receivedAt,
        receivedCount: (typeof previous.receivedCount === 'number' ? previous.receivedCount : 0) + 1,
        showAttemptedAt: null,
        showResult: null,
        showCompletedAt: null,
      });
      await writePushDiagnostic({ showAttemptedAt: new Date().toISOString() });
    } catch { /* diagnostic storage is optional */ }
    try {
      await self.registration.showNotification(title, {
        body, icon: '/icons/freshgo-192.png', badge: '/icons/freshgo-192.png',
        tag: typeof payload.notificationId === 'string' ? `freshgo:${payload.notificationId}` : 'freshgo:notification', data: { action },
      });
      try { await writePushDiagnostic({ showResult: 'fulfilled', showCompletedAt: new Date().toISOString() }); } catch { /* diagnostic storage is optional */ }
    } catch {
      try { await writePushDiagnostic({ showResult: 'rejected', showCompletedAt: new Date().toISOString() }); } catch { /* diagnostic storage is optional */ }
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'freshgo:service-worker-status') {
    event.ports[0]?.postMessage({ version: SERVICE_WORKER_VERSION, scope: self.registration.scope });
    return;
  }
  if (event.data?.type !== 'freshgo:background-push-diagnostic') return;
  event.waitUntil(readPushDiagnostic().then((record) => {
    event.ports[0]?.postMessage(pushDiagnosticSnapshot(record));
  }).catch(() => {
    event.ports[0]?.postMessage({ receivedAt: null, showAttemptedAt: null, showResult: null, showCompletedAt: null, receivedCount: 0 });
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(safeActionRoute(event.notification.data?.action), self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    return existing ? existing.focus().then(() => existing.navigate(targetUrl)) : self.clients.openWindow(targetUrl);
  }));
});

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // Register immediately: waiting for window.load leaves an installed PWA on an
  // old worker for longer than necessary, including while a push is in flight.
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
    // Request an update on every app launch. /sw.js is served with no-cache on
    // Pages so an installed PWA promptly discovers a newly deployed push handler.
    return registration.update();
  }).catch((error: unknown) => {
      // A registration failure must not affect checkout, authentication, or normal web usage.
      console.warn('FreshGo service worker registration failed.', error);
  });
}

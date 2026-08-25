export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  const register = () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      // A registration failure must not affect checkout, authentication, or normal web usage.
      console.warn('FreshGo service worker registration failed.', error);
    });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

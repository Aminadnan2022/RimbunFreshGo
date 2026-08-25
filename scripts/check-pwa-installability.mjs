import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'public/manifest.webmanifest', 'public/sw.js', 'public/offline.html',
  'public/icons/freshgo-192.png', 'public/icons/freshgo-512.png',
  'public/icons/freshgo-maskable-512.png', 'public/icons/apple-touch-icon.png',
  'src/pwa/registerServiceWorker.ts', 'src/components/pwa/InstallPrompt.tsx',
];
await Promise.all(requiredFiles.map((path) => access(path)));

const [manifestText, indexHtml, serviceWorker, registration, installPrompt] = await Promise.all([
  readFile('public/manifest.webmanifest', 'utf8'), readFile('index.html', 'utf8'),
  readFile('public/sw.js', 'utf8'), readFile('src/pwa/registerServiceWorker.ts', 'utf8'),
  readFile('src/components/pwa/InstallPrompt.tsx', 'utf8'),
]);
const manifest = JSON.parse(manifestText);
const failures = [];
for (const [key, expected] of Object.entries({ name: 'FreshGo', short_name: 'FreshGo', start_url: '/', scope: '/', display: 'standalone', background_color: '#faf8f2', theme_color: '#196848' })) {
  if (manifest[key] !== expected) failures.push(`Manifest ${key} must be ${expected}.`);
}
if (!manifest.icons?.some((icon) => icon.sizes === '192x192') || !manifest.icons?.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')) failures.push('Manifest must provide 192px and maskable 512px icons.');
for (const marker of ['rel="manifest"', 'apple-touch-icon', 'theme-color', 'viewport-fit=cover']) if (!indexHtml.includes(marker)) failures.push(`index.html missing ${marker}.`);
for (const marker of ["const OFFLINE_URL = '/offline.html'", "request.mode !== 'navigate'", 'fetch(request).catch(() => caches.match(OFFLINE_URL))']) if (!serviceWorker.includes(marker)) failures.push(`Service worker missing safe offline marker: ${marker}`);
for (const unsafePattern of ['cache.put(', 'caches.match(request)', 'supabase.co']) if (serviceWorker.includes(unsafePattern)) failures.push(`Service worker must not cache dynamic or Supabase data (${unsafePattern}).`);
if (!registration.includes("register('/sw.js', { scope: '/' })")) failures.push('Service worker registration must use the app root scope.');
for (const marker of ['beforeinstallprompt', 'isIosSafari', 'DISMISS_FOR_MS', 'Add to Home Screen']) if (!installPrompt.includes(marker)) failures.push(`Install UX missing ${marker}.`);
if (failures.length) throw new Error(`PWA installability checks failed:\n- ${failures.join('\n- ')}`);
console.log('PWA installability structural checks passed.');

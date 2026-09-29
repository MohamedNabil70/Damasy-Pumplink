/* PumpLink service worker — caches the app shell ONLY.
 *
 * MQTT runs over a WebSocket (wss://…:8884/mqtt). Service workers never see
 * WebSocket traffic, and this worker also refuses to touch anything that is
 * not in the shell list below, so no pump state can ever be served from cache.
 *
 * Bump VERSION whenever any shell file changes, so phones pick up the update.
 */
const VERSION = 'pumplink-v1.2.0';
const MQTT_JS = 'https://cdn.jsdelivr.net/npm/mqtt@5.16.0/dist/mqtt.min.js';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './img/on.png',
  './img/off.png',
  './img/restart.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './fonts/archivo-latin.woff2',
  './fonts/archivo-latin-ext.woff2',
  './fonts/archivo-narrow-latin.woff2',
  './fonts/archivo-narrow-latin-ext.woff2',
  './fonts/readex-arabic-400.woff2',
  './fonts/readex-arabic-500.woff2',
  './fonts/readex-arabic-600.woff2',
  './fonts/readex-arabic-700.woff2'
];

const shellUrls = new Set(SHELL.map(p => new URL(p, self.registration.scope).href));
shellUrls.add(MQTT_JS);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    // Same CORS mode as the <script crossorigin> tag, so the cached copy satisfies SRI.
    try { await cache.add(new Request(MQTT_JS, { mode: 'cors', credentials: 'omit' })); } catch (e) { /* CDN unreachable now: retried on next update */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pumplink-') && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  url.search = '';
  url.hash = '';
  if (!shellUrls.has(url.href)) return;   // not shell: let the network handle it, uncached

  // The page itself: network first so updates arrive, cache when offline.
  if (req.mode === 'navigate' || url.href === new URL('./index.html', self.registration.scope).href) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Everything else in the shell is versioned: cache first.
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});

/*
 * Service worker do My Finance (PWA fase 0) — mínimo e seguro.
 *
 * - Navegação (HTML): sempre pela rede, com navigation preload. NUNCA é gravada em cache.
 *   Sem rede → /offline.html (cache mf-offline-*).
 * - Cache-first só para estáticos same-origin: /_next/static/**, /icons/**, /images/logo/**,
 *   .woff/.woff2. Teto FIFO de MAX_STATIC_ENTRIES.
 * - Nunca intercepta: /api/**, métodos ≠ GET, cross-origin, RSC (?_rsc), /_next/image.
 * - Sem importScripts e sem eval (CSP com 'strict-dynamic' + worker-src 'self').
 *
 * Mudou ESTE arquivo? Suba SW_VERSION e as constantes de cache. Deploy comum não exige nada,
 * porque o HTML nunca fica em cache.
 */

const SW_VERSION = 'mf-sw-v1';
const STATIC_CACHE = 'mf-static-v1';
const OFFLINE_CACHE = 'mf-offline-v1';
const MAX_STATIC_ENTRIES = 400;

const CACHE_ALLOWLIST = [STATIC_CACHE, OFFLINE_CACHE];
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/icons/icon-192.png', '/images/logo/logo-icon.svg'];
const STATIC_PREFIXES = ['/_next/static/', '/icons/', '/images/logo/'];
const STATIC_SUFFIXES = ['.woff2', '.woff'];

self.addEventListener('install', (event) => {
  // Sem skipWaiting: a versão nova assume quando o VersionWatcher mandar SKIP_WAITING
  // (ou quando todas as abas antigas fecharem).
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith('mf-') && !CACHE_ALLOWLIST.includes(key))
              .map((key) => caches.delete(key)),
          ),
        ),
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable()
        : Promise.resolve(),
    ]).then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  if (url.search.includes('_rsc')) return false;
  return (
    STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
    STATIC_SUFFIXES.some((suffix) => url.pathname.endsWith(suffix))
  );
}

async function trimStaticCache() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  const excess = keys.length - MAX_STATIC_ENTRIES;
  // cache.keys() devolve na ordem de inserção → apaga os mais antigos (FIFO).
  for (let i = 0; i < excess; i += 1) {
    await cache.delete(keys[i]);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { cacheName: STATIC_CACHE });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.put(request, copy))
      .then(trimStaticCache)
      .catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // (a) só GET same-origin
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // (b) API nunca passa pelo SW
  if (url.pathname.startsWith('/api/')) return;

  // (c) navegação: rede (com preload) → offline.html. HTML nunca é gravado.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
          return await fetch(request);
        } catch {
          return (
            (await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE })) || Response.error()
          );
        }
      })(),
    );
    return;
  }

  // (d) estáticos imutáveis → cache-first
  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
  }
  // (e) resto (?_rsc, /_next/image, avatares...) → rede, sem SW
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith('mf-') && key !== OFFLINE_CACHE)
              .map((key) => caches.delete(key)),
          ),
        )
        .then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ type: 'CACHES_CLEARED', version: SW_VERSION });
          }
        }),
    );
  }
});

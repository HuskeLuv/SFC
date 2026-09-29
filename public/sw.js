/*
 * Service worker do My Finance (PWA fases 0 e 5) — mínimo e seguro.
 *
 * - Navegação (HTML): sempre pela rede, com navigation preload. NUNCA é gravada em cache.
 *   Sem rede → /offline.html (cache mf-offline-*).
 * - Cache-first só para estáticos same-origin: /_next/static/**, /icons/**, /images/logo/**,
 *   .woff/.woff2. Teto FIFO de MAX_STATIC_ENTRIES.
 * - Nunca intercepta: /api/**, métodos ≠ GET, cross-origin, RSC (?_rsc), /_next/image.
 * - Web push (fase 5): payload PushPayloadV1 (src/lib/push/contract.ts é a fonte única do
 *   shape/tag/deep link). Payload malformado degrada para aviso genérico; a tag por
 *   grupo/evento SUBSTITUI a notificação anterior; o clique foca aba aberta antes de abrir
 *   janela, sempre same-origin. SEM setAppBadge na v1 (follow-up registrado).
 * - Sem importScripts e sem eval (CSP com 'strict-dynamic' + worker-src 'self').
 *
 * Mudou ESTE arquivo? Suba SW_VERSION e as constantes de cache. Deploy comum não exige nada,
 * porque o HTML nunca fica em cache.
 */

const SW_VERSION = 'mf-sw-v2';
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

/* ------------------------------- Web push (fase 5) ------------------------------- */

const PUSH_ICON = '/icons/icon-192.png';
const PUSH_BADGE = '/icons/badge-96.png';
const PUSH_FALLBACK_TITLE = 'My Finance';
const PUSH_FALLBACK_BODY = 'Você tem uma nova notificação.';

// Desserializa o PushPayloadV1 (contrato da fatia 0). Qualquer defeito → aviso genérico:
// o push chegou com userVisibleOnly, então SEMPRE mostramos exatamente uma notificação.
function parsePushPayload(eventData) {
  const fallback = {
    title: PUSH_FALLBACK_TITLE,
    body: PUSH_FALLBACK_BODY,
    url: '/',
    tag: null,
    notificationId: null,
  };
  if (!eventData) return fallback;
  let payload;
  try {
    payload = eventData.json();
  } catch {
    return fallback;
  }
  if (!payload || payload.v !== 1 || typeof payload.title !== 'string' || !payload.title) {
    return fallback;
  }
  return {
    title: payload.title,
    body: typeof payload.body === 'string' && payload.body ? payload.body : PUSH_FALLBACK_BODY,
    url: typeof payload.url === 'string' ? payload.url : '/',
    tag: typeof payload.tag === 'string' && payload.tag ? payload.tag : null,
    notificationId:
      typeof payload.notificationId === 'string' && payload.notificationId
        ? payload.notificationId
        : null,
  };
}

// Só caminho relativo same-origin (mesma regra do hrefDaNotificacao/deepLinkDaNotificacao):
// 'https://…' e '//…' caem em '/'. Resolve contra a origem do SW e confere de novo.
function urlSeguraDoClique(rawUrl) {
  const home = new URL('/', self.location.origin).href;
  const caminho =
    typeof rawUrl === 'string' && rawUrl.startsWith('/') && !rawUrl.startsWith('//')
      ? rawUrl
      : '/';
  try {
    const url = new URL(caminho, self.location.origin);
    return url.origin === self.location.origin ? url.href : home;
  } catch {
    return home;
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event.data);
  const options = {
    body: payload.body,
    icon: PUSH_ICON,
    badge: PUSH_BADGE,
    lang: 'pt-BR',
    data: { url: payload.url, notificationId: payload.notificationId },
  };
  // Tag por grupo/evento do contrato: a escalada do mesmo grupo SUBSTITUI, nunca empilha.
  if (payload.tag) options.tag = payload.tag;
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = urlSeguraDoClique(data.url);
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientes) => {
        const cliente = clientes[0];
        if (!cliente) return self.clients.openWindow(url);
        return Promise.resolve(cliente.focus())
          .catch(() => cliente)
          .then((focado) => {
            const alvo = focado || cliente;
            if (alvo && typeof alvo.navigate === 'function') {
              return Promise.resolve(alvo.navigate(url)).catch(() => undefined);
            }
            return undefined;
          });
      })
      .catch(() => undefined),
  );
});

// Rotação de endpoint pelo navegador: re-assina localmente (best-effort). O POST ao servidor
// NÃO acontece aqui (o SW não tem CSRF) — a reconciliação é do pushClient na abertura do app.
self.addEventListener('pushsubscriptionchange', (event) => {
  const antiga = event.oldSubscription;
  const chave = antiga && antiga.options ? antiga.options.applicationServerKey : null;
  if (!chave) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: chave })
      .catch(() => undefined),
  );
});

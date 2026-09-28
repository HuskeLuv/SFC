/**
 * Cliente do service worker (PWA fase 0).
 *
 * Registro, kill switch, limpeza de caches (logout / versão nova) e captura do convite de
 * instalação. O SW em si é o estático public/sw.js. Tudo aqui é defensivo: navegador sem
 * suporte, CacheStorage bloqueado ou SW ausente nunca quebram o app.
 */
import { INSTALL_EVENTS, type BeforeInstallPromptEvent } from '@/lib/pwa/installPromptContract';

export const SW_URL = '/sw.js';

const CACHE_PREFIX = 'mf-';
const OFFLINE_CACHE_PREFIX = 'mf-offline-';
const STATIC_CACHE_PREFIX = 'mf-static-';

export function isSwSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator
  );
}

/** Só em produção; `NEXT_PUBLIC_SW_ENABLED=0` é o kill switch (desregistra tudo). */
export function isSwEnabled(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SW_ENABLED !== '0';
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isSwSupported()) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' });
  } catch {
    return null;
  }
}

export async function unregisterAllServiceWorkers(): Promise<void> {
  if (!isSwSupported()) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // sem permissão / contexto inseguro: nada a desfazer
  }
}

async function deleteCachesWhere(predicate: (key: string) => boolean): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const keys = await caches.keys();
    await Promise.all(keys.filter(predicate).map((key) => caches.delete(key)));
  } catch {
    // CacheStorage indisponível (modo privado, site data bloqueado)
  }
}

/** Apaga os caches do app ('mf-*'), preservando a página offline ('mf-offline-*'). */
export function clearAppCaches(): Promise<void> {
  return deleteCachesWhere(
    (key) => key.startsWith(CACHE_PREFIX) && !key.startsWith(OFFLINE_CACHE_PREFIX),
  );
}

/** Pede ao SW ativo que limpe os caches dele (logout). Nunca lança. */
export function postClearCachesMessage(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' });
  } catch {
    // sem SW controlando a página
  }
}

/**
 * Antes do reload para a versão nova: atualiza o registro, apaga os estáticos antigos, manda
 * SKIP_WAITING para o worker em espera e aguarda o controllerchange (até `timeoutMs`).
 * Sempre resolve.
 */
export async function prepareReloadForNewVersion(timeoutMs = 1500): Promise<void> {
  await deleteCachesWhere((key) => key.startsWith(STATIC_CACHE_PREFIX));
  if (!isSwSupported()) return;

  let cleanup = () => {};
  const controllerChanged = new Promise<void>((resolve) => {
    const onChange = () => resolve();
    const timer = setTimeout(resolve, timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    cleanup = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
    };
  });

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    try {
      await registration.update();
    } catch {
      // update falhou (offline): segue com o que houver em espera
    }
    const waiting = registration.waiting;
    if (!waiting) return;
    waiting.postMessage({ type: 'SKIP_WAITING' });
    await controllerChanged;
  } catch {
    // ignora: o reload acontece de qualquer jeito
  } finally {
    cleanup();
  }
}

/**
 * Captura o `beforeinstallprompt` (guarda em window.__mfDeferredInstallPrompt e avisa via
 * INSTALL_EVENTS.available) e o `appinstalled` (zera e avisa via INSTALL_EVENTS.installed).
 * Devolve o cleanup dos listeners.
 */
export function captureInstallPrompt(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onBeforeInstall = (event: Event) => {
    event.preventDefault();
    window.__mfDeferredInstallPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(INSTALL_EVENTS.available));
  };
  const onInstalled = () => {
    window.__mfDeferredInstallPrompt = null;
    window.dispatchEvent(new Event(INSTALL_EVENTS.installed));
  };

  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

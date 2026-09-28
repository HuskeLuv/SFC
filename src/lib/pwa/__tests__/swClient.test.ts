// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  captureInstallPrompt,
  clearAppCaches,
  isSwEnabled,
  prepareReloadForNewVersion,
} from '../swClient';
import { INSTALL_EVENTS } from '../installPromptContract';

function stubCaches(initial: string[]) {
  const keys = new Set(initial);
  const store = {
    keys: vi.fn(async () => [...keys]),
    delete: vi.fn(async (key: string) => keys.delete(key)),
  };
  vi.stubGlobal('caches', store);
  return { store, keys };
}

function stubServiceWorker(registration: unknown) {
  const listeners = new Map<string, EventListener>();
  const sw = {
    getRegistration: vi.fn(async () => registration),
    addEventListener: vi.fn((type: string, fn: EventListener) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
  };
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  return { sw, listeners };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  // remove o stub de navigator.serviceWorker
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  window.__mfDeferredInstallPrompt = undefined;
});

describe('clearAppCaches', () => {
  it("apaga só os caches 'mf-*' e preserva 'mf-offline-*'", async () => {
    const { keys } = stubCaches(['mf-static-v1', 'mf-offline-v1', 'mf-static-v0', 'outro-cache']);
    await clearAppCaches();
    expect([...keys].sort()).toEqual(['mf-offline-v1', 'outro-cache']);
  });

  it('não lança quando o CacheStorage falha', async () => {
    vi.stubGlobal('caches', { keys: vi.fn().mockRejectedValue(new Error('bloqueado')) });
    await expect(clearAppCaches()).resolves.toBeUndefined();
  });
});

describe('isSwEnabled', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('desligado fora de produção', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(isSwEnabled()).toBe(false);
  });

  it('ligado em produção por padrão', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SW_ENABLED', '');
    expect(isSwEnabled()).toBe(true);
  });

  it("kill switch: NEXT_PUBLIC_SW_ENABLED='0' desliga em produção", () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SW_ENABLED', '0');
    expect(isSwEnabled()).toBe(false);
  });
});

describe('captureInstallPrompt', () => {
  it('previne o prompt nativo, guarda o evento e dispara o evento de contrato', () => {
    const onAvailable = vi.fn();
    window.addEventListener(INSTALL_EVENTS.available, onAvailable);
    const cleanup = captureInstallPrompt();

    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(window.__mfDeferredInstallPrompt).toBe(event);
    expect(onAvailable).toHaveBeenCalledTimes(1);

    cleanup();
    window.removeEventListener(INSTALL_EVENTS.available, onAvailable);
  });

  it('appinstalled zera o evento guardado e dispara installed', () => {
    const onInstalled = vi.fn();
    window.addEventListener(INSTALL_EVENTS.installed, onInstalled);
    const cleanup = captureInstallPrompt();
    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));

    window.dispatchEvent(new Event('appinstalled'));

    expect(window.__mfDeferredInstallPrompt).toBeNull();
    expect(onInstalled).toHaveBeenCalledTimes(1);
    cleanup();
    window.removeEventListener(INSTALL_EVENTS.installed, onInstalled);
  });

  it('o cleanup remove os listeners', () => {
    const onAvailable = vi.fn();
    window.addEventListener(INSTALL_EVENTS.available, onAvailable);
    const cleanup = captureInstallPrompt();
    cleanup();

    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onAvailable).not.toHaveBeenCalled();
    window.removeEventListener(INSTALL_EVENTS.available, onAvailable);
  });
});

describe('prepareReloadForNewVersion', () => {
  it('resolve no timeout quando o controllerchange não chega', async () => {
    vi.useFakeTimers();
    const { keys } = stubCaches(['mf-static-v1', 'mf-offline-v1']);
    const waiting = { postMessage: vi.fn() };
    const registration = { update: vi.fn().mockResolvedValue(undefined), waiting };
    const { sw } = stubServiceWorker(registration);

    let resolved = false;
    const promise = prepareReloadForNewVersion(1500).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(1400);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    expect(resolved).toBe(true);
    expect(registration.update).toHaveBeenCalled();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect([...keys]).toEqual(['mf-offline-v1']);
    expect(sw.removeEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function));
  });

  it('resolve logo no controllerchange', async () => {
    stubCaches([]);
    const waiting = { postMessage: vi.fn() };
    const { listeners } = stubServiceWorker({ update: vi.fn(), waiting });
    waiting.postMessage.mockImplementation(() => {
      listeners.get('controllerchange')?.(new Event('controllerchange'));
    });

    await expect(prepareReloadForNewVersion(60_000)).resolves.toBeUndefined();
  });

  it('sem registro: resolve sem esperar', async () => {
    stubCaches([]);
    stubServiceWorker(undefined);
    await expect(prepareReloadForNewVersion(60_000)).resolves.toBeUndefined();
  });
});

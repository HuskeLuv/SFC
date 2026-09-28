'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  INSTALL_DISMISS_DAYS,
  INSTALL_EVENTS,
  INSTALL_STORAGE_KEYS,
  type BeforeInstallPromptEvent,
} from '@/lib/pwa/installPromptContract';

export type InstallPlatform = 'android' | 'ios' | 'other';
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Flag de sessão para contar a visita uma vez só por sessão do navegador. */
const VISIT_SESSION_FLAG = 'myfinance:visit-counted';

export function detectPlatform(nav: Navigator | undefined): InstallPlatform {
  if (!nav) return 'other';
  const ua = nav.userAgent || '';
  const isAppleMobile =
    /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  // Só o Safari instala no iOS (Chrome/Firefox do iOS não têm "Adicionar à Tela de Início").
  if (isAppleMobile && !/CriOS|FxiOS|EdgiOS/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return displayStandalone || window.navigator.standalone === true;
}

type StorageState = {
  ok: boolean;
  visits: number;
  dismissedAt: number | null;
  never: boolean;
};

/**
 * Lê (e, uma vez por sessão, incrementa) o contador de visitas. Qualquer falha de storage
 * (aba anônima, cookies bloqueados) → ok=false, e o convite não aparece.
 */
function readStorage(countVisit: boolean): StorageState {
  try {
    const local = window.localStorage;
    let visits = Number(local.getItem(INSTALL_STORAGE_KEYS.visits) ?? '0') || 0;
    if (countVisit) {
      const session = window.sessionStorage;
      if (session.getItem(VISIT_SESSION_FLAG) !== '1') {
        visits += 1;
        local.setItem(INSTALL_STORAGE_KEYS.visits, String(visits));
        session.setItem(VISIT_SESSION_FLAG, '1');
      }
    }
    const rawDismissed = local.getItem(INSTALL_STORAGE_KEYS.dismissedAt);
    const dismissedAt = rawDismissed ? Number(rawDismissed) || null : null;
    const never = local.getItem(INSTALL_STORAGE_KEYS.never) === '1';
    return { ok: true, visits, dismissedAt, never };
  } catch {
    return { ok: false, visits: 0, dismissedAt: null, never: false };
  }
}

const INITIAL_STORAGE: StorageState = { ok: false, visits: 0, dismissedAt: null, never: false };

/**
 * Convite de instalação do PWA. Consome o `beforeinstallprompt` guardado pelo swClient
 * (window.__mfDeferredInstallPrompt + INSTALL_EVENTS) e também escuta o evento diretamente,
 * para funcionar mesmo sem o registrador do service worker.
 */
export function useInstallPrompt() {
  const [platform, setPlatform] = useState<InstallPlatform>('other');
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [storage, setStorage] = useState<StorageState>(INITIAL_STORAGE);

  useEffect(() => {
    setPlatform(detectPlatform(window.navigator));
    setIsStandalone(detectStandalone());
    setDeferred(window.__mfDeferredInstallPrompt ?? null);
    setStorage(readStorage(true));

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      window.__mfDeferredInstallPrompt = promptEvent;
      setDeferred(promptEvent);
    };
    const onAvailable = () => setDeferred(window.__mfDeferredInstallPrompt ?? null);
    const onInstalled = () => {
      window.__mfDeferredInstallPrompt = null;
      setDeferred(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener(INSTALL_EVENTS.available, onAvailable);
    window.addEventListener(INSTALL_EVENTS.installed, onInstalled);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener(INSTALL_EVENTS.available, onAvailable);
      window.removeEventListener(INSTALL_EVENTS.installed, onInstalled);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const event = deferred ?? window.__mfDeferredInstallPrompt ?? null;
    if (!event) return 'unavailable';
    try {
      await event.prompt();
      const choice = await event.userChoice;
      // O evento só pode ser usado uma vez.
      window.__mfDeferredInstallPrompt = null;
      setDeferred(null);
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }, [deferred]);

  const dismiss = useCallback((days: number = INSTALL_DISMISS_DAYS) => {
    // Grava o instante da dispensa ajustado para vencer em `days` dias (a leitura usa
    // INSTALL_DISMISS_DAYS a partir de dismissedAt).
    const dismissedAt = Date.now() - (INSTALL_DISMISS_DAYS - days) * DAY_MS;
    setStorage((prev) => ({ ...prev, dismissedAt }));
    try {
      window.localStorage.setItem(INSTALL_STORAGE_KEYS.dismissedAt, String(dismissedAt));
    } catch {
      // storage bloqueado: some só nesta tela
    }
  }, []);

  const dismissForever = useCallback(() => {
    setStorage((prev) => ({ ...prev, never: true }));
    try {
      window.localStorage.setItem(INSTALL_STORAGE_KEYS.never, '1');
    } catch {
      // storage bloqueado: some só nesta tela
    }
  }, []);

  const dismissExpired =
    storage.dismissedAt === null ||
    Date.now() - storage.dismissedAt >= INSTALL_DISMISS_DAYS * DAY_MS;
  const eligibleForBanner =
    storage.ok && !isStandalone && storage.visits >= 2 && dismissExpired && !storage.never;

  return {
    platform,
    canPrompt: deferred !== null,
    isStandalone,
    promptInstall,
    eligibleForBanner,
    dismiss,
    dismissForever,
  };
}

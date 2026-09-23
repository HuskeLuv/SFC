'use client';

import { useEffect } from 'react';
import {
  captureInstallPrompt,
  isSwEnabled,
  isSwSupported,
  registerServiceWorker,
  unregisterAllServiceWorkers,
} from '@/lib/pwa/swClient';

/**
 * Registra o service worker (só em produção) e captura o convite de instalação.
 * Com o SW desligado (dev ou NEXT_PUBLIC_SW_ENABLED=0), desregistra qualquer SW antigo:
 * é o kill switch. Não renderiza nada.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    const releaseInstallPrompt = captureInstallPrompt();

    if (!isSwSupported()) return releaseInstallPrompt;

    if (!isSwEnabled()) {
      void unregisterAllServiceWorkers();
      return releaseInstallPrompt;
    }

    const register = () => void registerServiceWorker();
    if (document.readyState === 'complete') {
      register();
      return releaseInstallPrompt;
    }
    window.addEventListener('load', register, { once: true });
    return () => {
      window.removeEventListener('load', register);
      releaseInstallPrompt();
    };
  }, []);

  return null;
}

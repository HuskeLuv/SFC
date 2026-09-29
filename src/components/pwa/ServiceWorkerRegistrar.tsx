'use client';

import { useEffect } from 'react';
import {
  captureInstallPrompt,
  isSwEnabled,
  isSwSupported,
  registerServiceWorker,
  unregisterAllServiceWorkers,
} from '@/lib/pwa/swClient';
import { sincronizarAssinaturaSeAtiva } from '@/lib/pwa/pushClient';
import { useCsrf } from '@/hooks/useCsrf';

/**
 * Registra o service worker (só em produção) e captura o convite de instalação.
 * Com o SW desligado (dev ou NEXT_PUBLIC_SW_ENABLED=0), desregistra qualquer SW antigo:
 * é o kill switch. Não renderiza nada.
 *
 * PWA fase 5: após registrar, uma chamada única a `sincronizarAssinaturaSeAtiva`
 * re-POSTa a assinatura de push existente (reconcilia rotação de endpoint).
 * Nunca pede permissão — só sincroniza o que já está ativo.
 */
export default function ServiceWorkerRegistrar() {
  const { csrfFetch } = useCsrf();

  useEffect(() => {
    const releaseInstallPrompt = captureInstallPrompt();

    if (!isSwSupported()) return releaseInstallPrompt;

    if (!isSwEnabled()) {
      void unregisterAllServiceWorkers();
      return releaseInstallPrompt;
    }

    const register = () =>
      void registerServiceWorker().then((registration) => {
        if (registration) void sincronizarAssinaturaSeAtiva(csrfFetch);
      });
    if (document.readyState === 'complete') {
      register();
      return releaseInstallPrompt;
    }
    window.addEventListener('load', register, { once: true });
    return () => {
      window.removeEventListener('load', register);
      releaseInstallPrompt();
    };
  }, [csrfFetch]);

  return null;
}

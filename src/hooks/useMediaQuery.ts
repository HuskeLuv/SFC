'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { MOBILE_MEDIA_QUERY } from '@/lib/ui/mobile';

/*
 * Impressão: o Chromium imprime com a largura da folha (A4 ≈ 794px), então `(max-width: …)` passa
 * a casar entre `beforeprint` e `afterprint` mesmo numa janela larga. Se o JS seguisse essa troca,
 * a árvore de celular montaria no meio da impressão do computador (gráficos remontados e vazios,
 * opções de celular). Durante a impressão o hook congela o último valor de tela de cada query.
 */
let printing = false;
let printListenersInstalled = false;
const screenValues = new Map<string, boolean>();
const afterPrintSubscribers = new Set<() => void>();

function installPrintListeners() {
  if (printListenersInstalled || typeof window === 'undefined') return;
  printListenersInstalled = true;
  window.addEventListener('beforeprint', () => {
    printing = true;
  });
  window.addEventListener('afterprint', () => {
    printing = false;
    afterPrintSubscribers.forEach((notify) => notify());
  });
}

/**
 * Assina uma media query. No servidor (e na hidratação) devolve `serverFallback`. Durante a
 * impressão devolve o último valor de tela (ver acima).
 * Prefira CSS (`lg:hidden`, `max-lg:`) — use isto só quando CSS não basta.
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      installPrintListeners();
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      afterPrintSubscribers.add(onChange);
      return () => {
        mql.removeEventListener('change', onChange);
        afterPrintSubscribers.delete(onChange);
      };
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return serverFallback;
    }
    const cached = screenValues.get(query);
    if (printing && cached !== undefined) return cached;
    const matches = window.matchMedia(query).matches;
    if (!printing) screenValues.set(query, matches);
    return matches;
  }, [query, serverFallback]);

  const getServerSnapshot = useCallback(() => serverFallback, [serverFallback]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** `true` abaixo do breakpoint `lg` (1024px). */
export const useIsBelowLg = () => useMediaQuery(MOBILE_MEDIA_QUERY);

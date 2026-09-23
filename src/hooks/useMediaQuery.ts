'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { MOBILE_MEDIA_QUERY } from '@/lib/ui/mobile';

/**
 * Assina uma media query. No servidor (e na hidratação) devolve `serverFallback`.
 * Prefira CSS (`lg:hidden`, `max-lg:`) — use isto só quando CSS não basta.
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return serverFallback;
    }
    return window.matchMedia(query).matches;
  }, [query, serverFallback]);

  const getServerSnapshot = useCallback(() => serverFallback, [serverFallback]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** `true` abaixo do breakpoint `lg` (1024px). */
export const useIsBelowLg = () => useMediaQuery(MOBILE_MEDIA_QUERY);

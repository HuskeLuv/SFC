'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Bug #05 (relatório Maio/2026): autocompletes do wizard de adicionar/aportar
 * disparavam fetch a cada keystroke. Digitar "PETR4" gerava 4 requests
 * (P/PE/PET/PETR/PETR4), sobrecarregando a API e a UI.
 *
 * Retorna uma versão debounced de `callback`. Timer é recriado a cada chamada;
 * o cleanup do unmount cancela o pendente. O timer também é cancelado se
 * `callback` ou `delay` mudam de identidade — passe `callback` com `useCallback`
 * estável pra evitar reinício involuntário.
 *
 * Não usa lodash/use-debounce pra não introduzir dependência só pra isso.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delay: number,
): (...args: TArgs) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: TArgs) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay],
  );
}

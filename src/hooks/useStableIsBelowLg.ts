'use client';

import { useEffect, useRef, useState } from 'react';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { MOBILE_MEDIA_QUERY } from '@/lib/ui/mobile';

/**
 * `useIsBelowLg` com a TROCA de layout adiada (1s) depois da montagem: a planilha de desktop e a
 * visão do mês guardam estado próprio (grupo em edição, modal de importação) que se perde ao
 * trocar de árvore. Uma oscilação curta da largura (screenshot de página inteira, barra do
 * navegador) não pode desmontar a planilha; a primeira leitura no cliente vale na hora.
 *
 * Usado pela página do Fluxo de Caixa e pelo Orçamento v2 (tabela × cartões, desenho técnico §8),
 * para que os dois troquem de layout no mesmo instante.
 */
export function useStableIsBelowLg(): boolean {
  const raw = useIsBelowLg();
  const [stable, setStable] = useState(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setStable(
        typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_MEDIA_QUERY).matches,
      );
      return;
    }
    const timer = setTimeout(() => setStable(raw), 1000);
    return () => clearTimeout(timer);
  }, [raw]);
  return stable;
}

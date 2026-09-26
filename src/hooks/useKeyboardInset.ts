'use client';

import { useEffect, useState } from 'react';

export interface KeyboardInset {
  /** Quanto do fundo da janela o teclado cobre (px). ~0 no Android com `resizes-content`. */
  inset: number;
  /** Altura da área visível (`visualViewport.height`), ou `null` sem visualViewport. */
  height: number | null;
  /** Deslocamento da área visível a partir do topo (o iOS rola a página com o teclado aberto). */
  offsetTop: number;
}

const CLOSED: KeyboardInset = { inset: 0, height: null, offsetTop: 0 };

function read(): KeyboardInset {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return CLOSED;
  return {
    inset: Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)),
    height: Math.round(vv.height),
    offsetTop: Math.round(vv.offsetTop),
  };
}

/**
 * Teclado virtual × painéis fixos (PWA fase 1). O Safari do iOS ignora
 * `interactive-widget=resizes-content`: o teclado cobre o fundo da janela e um `fixed bottom-0`
 * (BottomSheet, rodapé do wizard) fica embaixo dele. O `visualViewport` diz quanto sobrou.
 *
 * No Android com `resizes-content` a janela já encolhe e `inset` fica ~0 — não soma duas vezes.
 * Sem `visualViewport` (ou `enabled=false`) devolve `{ inset: 0, height: null, offsetTop: 0 }`.
 */
export function useKeyboardInset(enabled: boolean): KeyboardInset {
  const [state, setState] = useState<KeyboardInset>(CLOSED);

  useEffect(() => {
    if (!enabled) {
      setState(CLOSED);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setState((prev) => {
        const next = read();
        return prev.inset === next.inset &&
          prev.height === next.height &&
          prev.offsetTop === next.offsetTop
          ? prev
          : next;
      });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return enabled ? state : CLOSED;
}

export default useKeyboardInset;

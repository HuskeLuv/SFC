'use client';

import { useEffect, useRef } from 'react';

/**
 * Celular (PWA fase 1): ao trocar de etapa do wizard, rola a área de conteúdo do Sidebar para o
 * topo e leva o foco ao título da etapa (leitor de tela anuncia a etapa nova). Não age na primeira
 * renderização nem com `enabled` falso (desktop).
 */
export function useWizardStepFocus(stepId: string | number | undefined, enabled: boolean) {
  const stepRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousRef = useRef(stepId);

  useEffect(() => {
    if (previousRef.current === stepId) return;
    previousRef.current = stepId;
    if (!enabled) return;
    const scroller = stepRef.current?.closest<HTMLElement>('.overflow-y-auto');
    if (scroller) scroller.scrollTop = 0;
    titleRef.current?.focus({ preventScroll: true });
  }, [stepId, enabled]);

  return { stepRef, titleRef };
}

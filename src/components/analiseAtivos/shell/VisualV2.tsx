'use client';

/**
 * fundamentei-regras (F4, item C): sinal ANALISE_ATIVOS_VISUAL_V2_HABILITADO na árvore da Análise.
 * As page.tsx leem a chave no servidor e passam a prop `visualV2` à AnaliseAtivosShell, que a põe
 * neste contexto; os blocos leem com useVisualV2(). Sem provedor (ou valor false) = visual de hoje,
 * DOM idêntico (visualV2Desligado.test.tsx).
 */
import { createContext, useContext, type ReactNode } from 'react';

const VisualV2Contexto = createContext(false);

export function VisualV2Provider({ valor, children }: { valor: boolean; children: ReactNode }) {
  return <VisualV2Contexto.Provider value={valor}>{children}</VisualV2Contexto.Provider>;
}

/** true = ajustes visuais do HTML do Pedro (item C); false = visual de hoje. */
export function useVisualV2(): boolean {
  return useContext(VisualV2Contexto);
}

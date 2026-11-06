'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useValoresOcultos } from '@/context/ValoresOcultosContext';
import { fAx, fR, fR0 } from './formato';

/**
 * Formatadores do relatório que respeitam o olho do "esconder valores": com ele fechado, todo
 * valor em R$ vira 'R$ ••••' (KPIs, tabelas, textos) e os eixos em R$ viram '•••'. Percentuais,
 * a nota e as datas continuam visíveis (fP não passa por aqui). O PDF sai como a tela está.
 *
 * Fora do provider (testes de seção, primitivos), os formatadores crus.
 */

export const VALOR_OCULTO = 'R$ ••••';
export const EIXO_OCULTO = '•••';

export interface Formato {
  /** Olho fechado (flag ligada + preferência do aparelho). */
  ocultos: boolean;
  fR: (v: number) => string;
  fR0: (v: number) => string;
  /** Eixo em R$ compacto. */
  fAx: (v: number) => string;
}

const CRU: Formato = { ocultos: false, fR, fR0, fAx };

const OCULTO: Formato = {
  ocultos: true,
  fR: () => VALOR_OCULTO,
  fR0: () => VALOR_OCULTO,
  fAx: () => EIXO_OCULTO,
};

const FormatoContext = createContext<Formato>(CRU);

export function FormatoProvider({ children }: { children: ReactNode }) {
  const { ativo } = useValoresOcultos();
  const valor = useMemo(() => (ativo ? OCULTO : CRU), [ativo]);
  return <FormatoContext.Provider value={valor}>{children}</FormatoContext.Provider>;
}

export function useFormato(): Formato {
  return useContext(FormatoContext);
}

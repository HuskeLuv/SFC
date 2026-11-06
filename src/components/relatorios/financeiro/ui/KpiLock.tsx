import type { ReactNode } from 'react';
import { NOME_PLANO, type Plano } from '@/lib/planos';
import { IconeCadeado } from '../marca/IconeCadeado';

export interface KpiLockProps {
  /** Rótulo neutro (sem palavras proibidas no plano que vê o cadeado). */
  rotulo: ReactNode;
  /** Plano que libera. */
  plano: Exclude<Plano, 'basic'>;
}

/** KPI bloqueado: porte de kpiLock(l, need) do protótipo. */
export function KpiLock({ rotulo, plano }: KpiLockProps) {
  const nome = NOME_PLANO[plano];
  return (
    <div className="kpi lockt">
      <span className="l">{rotulo}</span>
      <span className="v">
        <IconeCadeado /> {nome}
      </span>
      <span className="s">Disponível no {nome}</span>
    </div>
  );
}

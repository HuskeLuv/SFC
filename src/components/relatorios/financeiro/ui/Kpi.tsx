import type { ReactNode } from 'react';

export type TomKpi = 'good' | 'bad' | 'warn';

export interface KpiProps {
  /** Rótulo (.l). */
  rotulo: ReactNode;
  /** Valor (.v). */
  valor: ReactNode;
  /** Linha de apoio (.s). */
  sub?: ReactNode;
  /** Fundo azul claro (.hl). */
  destaque?: boolean;
  /** Cor do valor. */
  tom?: TomKpi;
}

/** Cartão de KPI: porte de kpi(l, v, s, cls) do protótipo. */
export function Kpi({ rotulo, valor, sub, destaque = false, tom }: KpiProps) {
  return (
    <div className={`kpi ${destaque ? 'hl' : ''}`}>
      <span className="l">{rotulo}</span>
      <span className={`v ${tom ?? ''}`}>{valor}</span>
      {sub ? <span className="s">{sub}</span> : null}
    </div>
  );
}

import type { ReactNode } from 'react';

export interface ItemLegenda {
  nome: ReactNode;
  cor: string;
  /** Traço dourado tracejado (linha de meta). */
  tracejado?: boolean;
}

/** Legenda dos gráficos: porte de legend(series) do protótipo. */
export function Legenda({ series }: { series: ItemLegenda[] }) {
  return (
    <div className="legend">
      {series.map((s, i) => (
        <span key={i}>
          <i className={s.tracejado ? 'dash' : ''} style={{ background: s.cor }} />
          {s.nome}
        </span>
      ))}
    </div>
  );
}

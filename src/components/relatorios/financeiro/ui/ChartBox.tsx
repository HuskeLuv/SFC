import type { CSSProperties, ReactNode } from 'react';

export interface ChartBoxProps {
  titulo: ReactNode;
  /** Complemento do título (<small>). */
  sub?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

/** Caixa de gráfico (.chart): porte de chartBox(title, sub, inner) do protótipo. */
export function ChartBox({ titulo, sub, children, style }: ChartBoxProps) {
  return (
    <div className="chart" style={style}>
      <h3>
        {titulo}
        {sub ? (
          <>
            {' '}
            <small>{sub}</small>
          </>
        ) : null}
      </h3>
      {children}
    </div>
  );
}

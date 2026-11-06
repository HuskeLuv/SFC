import type { CSSProperties, ReactNode } from 'react';

/** Faixa de aviso (.callout / .callout.warn) do protótipo. */
export function Callout({
  tom,
  children,
  style,
}: {
  tom?: 'warn';
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className={tom ? `callout ${tom}` : 'callout'} style={style}>
      {children}
    </div>
  );
}

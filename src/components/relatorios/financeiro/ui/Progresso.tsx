export type TomProgresso = 'good' | 'warn' | 'bad';

/** Barra de progresso (.prog) do protótipo; `pct` é cortado em 0–100. */
export function Progresso({ pct, tom }: { pct: number; tom?: TomProgresso | '' }) {
  const largura = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <div className={tom ? `prog ${tom}` : 'prog'}>
      <i style={{ width: `${largura}%` }} />
    </div>
  );
}

import { CORES } from '../cores';
import { fAx, fP, fR0, soma } from '../formato';

/** Fatia da rosca: [nome, valor, cor], como no protótipo. */
export type FatiaDonut = [nome: string, valor: number, cor: string];

export interface DonutProps {
  parts: FatiaDonut[];
  /** Valor de cada fatia na legenda (o FormatoProvider troca pelo que esconde valores). */
  fmtValor?: (v: number) => string;
  /** Total no centro. */
  fmtTotal?: (v: number) => string;
  ariaLabel?: string;
}

/** Rosca + legenda: porte 1:1 de donut do protótipo. */
export function Donut({
  parts,
  fmtValor = fR0,
  fmtTotal = fAx,
  ariaLabel = 'Distribuição por classe',
}: DonutProps) {
  const tot = soma(parts.map((p) => p[1]));
  const r = 52;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const arcos = parts.map((p, i) => {
    const f = tot > 0 ? p[1] / tot : 0;
    const el = (
      <circle
        key={i}
        cx={70}
        cy={70}
        r={r}
        fill="none"
        stroke={p[2]}
        strokeWidth={22}
        strokeDasharray={`${f * c} ${c}`}
        strokeDashoffset={-acc * c}
        transform="rotate(-90 70 70)"
      />
    );
    acc += f;
    return el;
  });

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" style={{ maxWidth: 104 }} role="img" aria-label={ariaLabel}>
        {arcos}
        <text x={70} y={66} textAnchor="middle" style={{ fontSize: 10 }}>
          Total
        </text>
        <text
          x={70}
          y={82}
          textAnchor="middle"
          style={{ fontSize: 13, fontWeight: 700, fill: CORES.ink }}
        >
          {fmtTotal(tot)}
        </text>
      </svg>
      <div className="dl">
        {parts.map((p, i) => (
          <div key={i}>
            <i style={{ background: p[2] }} />
            <span>{p[0]}</span>
            <span className="num">{fmtValor(p[1])}</span>
            <span className="p num">{fP(tot > 0 ? (p[1] / tot) * 100 : 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

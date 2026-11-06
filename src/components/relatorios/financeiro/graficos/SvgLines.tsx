import { CORES, COR_ZERO } from '../cores';
import { fAx } from '../formato';
import { scale } from './escala';

export interface SerieLinhas {
  color: string;
  values: number[];
  /** Espessura (padrão 1,8). */
  w?: number;
  /** Tracejada. */
  dash?: boolean;
  /** Ponto no último valor. */
  dot?: boolean;
}

export interface SvgLinesProps {
  series: SerieLinhas[];
  /** Pares [índice, rótulo] (use `ticks` de ./escala). */
  xTicks: [number, string][];
  h?: number;
  fmt?: (v: number) => string;
  /** Área sob a 1ª série. */
  area?: boolean;
  W?: number;
  ariaLabel: string;
}

/** Linhas: porte 1:1 de svgLines do protótipo. */
export function SvgLines({
  series,
  xTicks,
  h = 200,
  fmt = fAx,
  area = false,
  W = 640,
  ariaLabel,
}: SvgLinesProps) {
  const T = 10,
    B = 26,
    L = 60,
    Rp = 10;
  const len = series[0]?.values.length ?? 0;
  const all = series.flatMap((s) => s.values);
  const sc = scale(Math.min(...all), Math.max(...all));
  const x = (i: number) => L + (W - L - Rp) * (len === 1 ? 0 : i / (len - 1));
  const y = (v: number) => T + (h - T - B) * (1 - (v - sc.lo) / (sc.hi - sc.lo));

  return (
    <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={ariaLabel}>
      {len > 0 &&
        sc.t.map((t, k) => (
          <g key={`t${k}`}>
            <line
              x1={L}
              x2={W - Rp}
              y1={y(t)}
              y2={y(t)}
              stroke={Math.abs(t) < 1e-9 ? COR_ZERO : CORES.line}
            />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
      {len > 0 &&
        xTicks.map(([i, lab]) => (
          <text key={`x${i}`} x={x(i)} y={h - 8} textAnchor="middle">
            {lab}
          </text>
        ))}
      {len > 0 &&
        series.map((s, k) => {
          const d = s.values
            .map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1))
            .join(' ');
          const ultimo = s.values[len - 1];
          return (
            <g key={`s${k}`}>
              {area && k === 0 && (
                <path
                  d={`${d} L${x(len - 1)} ${y(sc.lo)} L${x(0)} ${y(sc.lo)} Z`}
                  fill={s.color}
                  fillOpacity=".08"
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={s.w || 1.8}
                strokeDasharray={s.dash ? '5 4' : undefined}
                strokeLinejoin="round"
              />
              {s.dot && <circle cx={x(len - 1)} cy={y(ultimo)} r={3.5} fill={s.color} />}
            </g>
          );
        })}
    </svg>
  );
}

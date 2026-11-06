import type { ReactNode } from 'react';
import { CORES, COR_ZERO } from '../cores';
import { fAx, soma } from '../formato';
import { scale } from './escala';

export interface SerieBarras {
  color: string;
  values: number[];
  /** Cor por barra (sobrepõe `color`), como o "rentabilidade x meta" do Pedro. */
  colors?: string[];
}

export interface SvgBarsProps {
  labels: string[];
  series: SerieBarras[];
  h?: number;
  /** Formatador do eixo y. */
  fmt?: (v: number) => string;
  /** Barras empilhadas. */
  stack?: boolean;
  /** Linha tracejada dourada (meta). */
  refLine?: number;
  W?: number;
  /** Texto para leitor de tela. */
  ariaLabel: string;
}

/** Barras verticais (agrupadas ou empilhadas): porte 1:1 de svgBars do protótipo. */
export function SvgBars({
  labels,
  series,
  h = 200,
  fmt = fAx,
  stack = false,
  refLine,
  W = 640,
  ariaLabel,
}: SvgBarsProps) {
  const T = 10,
    B = 26,
    L = 60,
    Rp = 8;
  let vals = stack
    ? labels.map((_, i) => soma(series.map((s) => s.values[i])))
    : series.flatMap((s) => s.values);
  if (refLine != null) vals = vals.concat([refLine]);
  const sc = scale(Math.min(0, ...vals), Math.max(...vals, 0.0001));
  const y = (v: number) => T + (h - T - B) * (1 - (v - sc.lo) / (sc.hi - sc.lo));
  const n = labels.length;
  const gw = (W - L - Rp) / n;
  const bw = stack ? Math.min(28, gw * 0.55) : Math.min(18, (gw * 0.72) / series.length);
  // Rótulos a cada `every` barras: no máximo 12 e com ~44 unidades de largura cada, para os meses
  // não se sobreporem nos gráficos estreitos (W=340) de 12 meses.
  const cabem = Math.max(1, Math.min(12, Math.floor((W - L - Rp) / 44)));
  const every = Math.max(1, Math.ceil(n / cabem));

  return (
    <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={ariaLabel}>
      {sc.t.map((t, k) => (
        <g key={`t${k}`}>
          <line
            x1={L}
            x2={W - Rp}
            y1={y(t)}
            y2={y(t)}
            stroke={t === 0 ? COR_ZERO : CORES.line}
            strokeWidth={1}
          />
          <text x={L - 6} y={y(t) + 3.5} textAnchor="end">
            {fmt(t)}
          </text>
        </g>
      ))}
      {labels.map((lab, i) => {
        const cx = L + gw * i + gw / 2;
        let barras: ReactNode;
        if (stack) {
          let acc = 0;
          barras = series.map((s, k) => {
            const v = s.values[i];
            const r = (
              <rect
                key={k}
                x={cx - bw / 2}
                y={y(acc + v)}
                width={bw}
                height={Math.max(0, y(acc) - y(acc + v))}
                fill={s.color}
              />
            );
            acc += v;
            return r;
          });
        } else {
          const tw = bw * series.length + 2 * (series.length - 1);
          barras = series.map((s, k) => {
            const v = s.values[i];
            const x = cx - tw / 2 + k * (bw + 2);
            const y0 = y(0),
              y1 = y(v);
            return (
              <rect
                key={k}
                x={x}
                y={Math.min(y0, y1)}
                width={bw}
                height={Math.max(0.5, Math.abs(y1 - y0))}
                rx={2}
                fill={s.colors ? s.colors[i] : s.color}
              />
            );
          });
        }
        return (
          <g key={`b${i}`}>
            {barras}
            {i % every === 0 && (
              <text x={cx} y={h - 8} textAnchor="middle">
                {lab}
              </text>
            )}
          </g>
        );
      })}
      {refLine != null && (
        <line
          x1={L}
          x2={W - Rp}
          y1={y(refLine)}
          y2={y(refLine)}
          stroke={CORES.gold}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      )}
    </svg>
  );
}

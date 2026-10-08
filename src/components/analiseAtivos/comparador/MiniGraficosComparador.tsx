'use client';

/**
 * Mini-gráficos do Comparador: base 100, MESMA escala para todos (graficos.escala), linha de 2px
 * numa cor só (sem cor semântica), base 100 tracejada, 86px de altura. O SVG é aria-hidden; a
 * alternativa textual de CADA célula traz só a série daquele ativo ("WEGE3: de 100 para 571").
 */
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { GraficosComparador } from '@/types/analiseAtivosBlocoD';

const TG = TEXTOS_COMPARADOR.graficos;
const W = 200;
const H = 86;
const PL = 4;
const PR = 40;
const PT = 10;
const PB = 14;

type Serie = GraficosComparador['series'][number];

/** Texto acessível da série ('WEGE3: de 100 para 571' ou 'sem série'). */
export function textoSerie(s: Serie): string {
  const ultimo = [...s.pontos].reverse().find((p): p is number => p !== null);
  if (s.insuficiente || ultimo === undefined) {
    return formatarTexto(TG.srSemSerie, { ticker: s.ticker });
  }
  return formatarTexto(TG.srSerie, { ticker: s.ticker, valor: formatarAnalise(ultimo, 'inteiro') });
}

/** Legenda da escala comum ("Base 100 em 2016. Mesma escala nos 3 gráficos (75 a 571)."). */
export function legendaEscala(g: GraficosComparador): string {
  return formatarTexto(TG.escala, {
    ano: String(g.anos[0] ?? ''),
    n: String(g.series.length),
    valor: formatarAnalise(g.escala.min, 'inteiro'),
    max: formatarAnalise(g.escala.max, 'inteiro'),
  });
}

export interface MiniGraficoProps {
  serie: Serie;
  graficos: GraficosComparador;
}

export function MiniGrafico({ serie, graficos }: MiniGraficoProps) {
  const { anos, escala } = graficos;
  const n = anos.length;
  if (serie.insuficiente || n < 2) {
    return (
      <span className="block text-left text-xs text-gray-500 dark:text-gray-400">
        {TG.insuficiente}
        <span className="sr-only">: {textoSerie(serie)}</span>
      </span>
    );
  }
  const faixa = escala.max - escala.min || 1;
  const x = (i: number) => PL + ((W - PL - PR) * i) / (n - 1);
  const y = (v: number) => PT + (H - PT - PB) * (1 - (v - escala.min) / faixa);
  // segmentos contínuos (null quebra a linha)
  const trechos: string[] = [];
  let atual: string[] = [];
  serie.pontos.forEach((p, i) => {
    if (p === null) {
      if (atual.length) trechos.push(atual.join(' '));
      atual = [];
    } else atual.push(`${x(i).toFixed(1)},${y(p).toFixed(1)}`);
  });
  if (atual.length) trechos.push(atual.join(' '));
  let iUlt = -1;
  serie.pontos.forEach((p, i) => {
    if (p !== null) iUlt = i;
  });
  const ult = iUlt >= 0 ? (serie.pontos[iUlt] as number) : null;
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{textoSerie(serie)}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        className="block h-auto max-h-[86px] w-full text-[#396CAA] dark:text-[#6E9DC4]"
      >
        <line
          x1={PL}
          x2={W - PR}
          y1={y(100)}
          y2={y(100)}
          className="stroke-gray-400 dark:stroke-gray-500"
          strokeDasharray="3 3"
        />
        {trechos.map((pts, i) =>
          pts.includes(' ') ? (
            <polyline key={i} points={pts} fill="none" stroke="currentColor" strokeWidth={2} />
          ) : (
            <circle
              key={i}
              cx={pts.split(',')[0]}
              cy={pts.split(',')[1]}
              r={2}
              fill="currentColor"
            />
          ),
        )}
        {serie.emConferencia.map((c, i) =>
          c ? (
            <line
              key={`c${i}`}
              x1={x(i)}
              x2={x(i)}
              y1={PT}
              y2={H - PB}
              stroke="currentColor"
              strokeDasharray="2 3"
              strokeOpacity={0.6}
            />
          ) : null,
        )}
        {ult !== null ? (
          <>
            <circle cx={x(iUlt)} cy={y(ult)} r={3} fill="currentColor" />
            <text
              x={x(iUlt) + 5}
              y={y(ult) + 4}
              className="fill-gray-800 text-[11px] font-semibold dark:fill-white/90"
            >
              {formatarAnalise(ult, 'inteiro')}
            </text>
          </>
        ) : null}
        <text x={PL} y={H - 2} className="fill-gray-500 text-[11px] dark:fill-gray-400">
          {anos[0]}
        </text>
        <text
          x={W - PR}
          y={H - 2}
          textAnchor="end"
          className="fill-gray-500 text-[11px] dark:fill-gray-400"
        >
          {anos[n - 1]}
        </text>
      </svg>
    </figure>
  );
}

/** Grade de mini-gráficos (celular): 2 por linha, com o ticker em cima. */
export default function MiniGraficosComparador({ graficos }: { graficos: GraficosComparador }) {
  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="bg-[#396CAA] px-3 py-2 text-[13.5px] font-semibold text-white">
        {graficos.tipo === 'lucro' ? TG.rotuloAcao : TG.rotuloFii}
      </div>
      <div className="grid grid-cols-2 gap-2 p-2.5">
        {graficos.series.map((s) => (
          <div key={s.ticker} className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-gray-800 dark:text-white/90">
              {s.ticker}
            </span>
            <MiniGrafico serie={s} graficos={graficos} />
          </div>
        ))}
      </div>
      <figcaption className="px-3 pb-2.5 text-xs text-gray-500 dark:text-gray-400">
        {legendaEscala(graficos)}
      </figcaption>
    </figure>
  );
}

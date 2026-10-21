'use client';

/**
 * Mini-gráficos do Comparador: base 100, MESMA escala para todos (graficos.escala), linha de 2px
 * numa cor só (sem cor semântica), base 100 tracejada, 86px de altura. O SVG é aria-hidden; a
 * alternativa textual de CADA célula traz só a série daquele ativo ("WEGE3: de 100 para 571").
 *
 * Visual v2 (fundamentei-regras F4, item C8): card com cabeçalho `.hd` branco (título + 'mesma
 * escala nos gráficos'), cada mini-gráfico num cartão com borda, o valor final à direita do ticker
 * e área de 10% sob a linha. Sem a chave, os de hoje.
 */
import { useVisualV2 } from '@/components/analiseAtivos/shell/VisualV2';
import { CARD_V2, CabecalhoCartaoV2 } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { TEXTOS_VISUAL } from '@/services/analiseAtivos/textosVisual';
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
  /** visual v2: área de 10% e sem o rótulo final dentro do SVG (vai ao título do cartão) */
  v2?: boolean;
}

/** Último valor da série (null sem ponto). */
export function ultimoDaSerie(serie: Serie): number | null {
  for (let i = serie.pontos.length - 1; i >= 0; i -= 1) {
    const p = serie.pontos[i];
    if (p !== null) return p;
  }
  return null;
}

export function MiniGrafico({ serie, graficos, v2 = false }: MiniGraficoProps) {
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
        {v2 && trechos.length === 1 && trechos[0].includes(' ') ? (
          <polygon
            data-area-serie=""
            points={`${trechos[0]} ${trechos[0].split(' ').slice(-1)[0].split(',')[0]},${(
              H - PB
            ).toFixed(1)} ${trechos[0].split(' ')[0].split(',')[0]},${(H - PB).toFixed(1)}`}
            fill="currentColor"
            fillOpacity={0.1}
          />
        ) : null}
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
            {v2 ? null : (
              <text
                x={x(iUlt) + 5}
                y={y(ult) + 4}
                className="fill-gray-800 text-[11px] font-semibold dark:fill-white/90"
              >
                {formatarAnalise(ult, 'inteiro')}
              </text>
            )}
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

/**
 * Cartão dos mini-gráficos (v2.4: abaixo da tabela, como no protótipo final): 2 por linha no
 * celular, até 4 no computador, com o ticker em cima. Mesma escala em todos; linha numa cor só.
 */
export default function MiniGraficosComparador({ graficos }: { graficos: GraficosComparador }) {
  const v2 = useVisualV2();
  if (v2) {
    return (
      <figure
        className={`m-0 flex flex-col ${CARD_V2}`}
        aria-labelledby="comparador-graficos-h"
        data-visual-v2=""
      >
        <CabecalhoCartaoV2
          id="comparador-graficos-h"
          titulo={`${graficos.titulo} · ${graficos.tipo === 'lucro' ? TG.rotuloAcao : TG.rotuloFii}`}
          hint={TEXTOS_VISUAL.comparador.escala}
        />
        <div className="grid grid-cols-1 gap-3 px-4 py-3.5 sm:grid-cols-2 sm:px-[18px] xl:grid-cols-4">
          {graficos.series.map((s) => {
            const ult = ultimoDaSerie(s);
            return (
              <div
                key={s.ticker}
                data-mini-cartao={s.ticker}
                className="flex min-w-0 flex-col gap-1 rounded-[10px] border border-gray-200 px-3 py-2.5 dark:border-gray-800"
              >
                <span className="flex items-baseline justify-between gap-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  {s.ticker}
                  {ult !== null && !s.insuficiente ? (
                    <b className="text-[13px] text-gray-800 tabular-nums dark:text-white/90">
                      {formatarAnalise(ult, 'inteiro')}
                    </b>
                  ) : null}
                </span>
                <MiniGrafico serie={s} graficos={graficos} v2 />
              </div>
            );
          })}
        </div>
        <figcaption className="px-4 pb-3 text-xs text-gray-500 sm:px-[18px] dark:text-gray-400">
          {legendaEscala(graficos)}
        </figcaption>
      </figure>
    );
  }
  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="bg-[#396CAA] px-3 py-2 text-[13.5px] font-semibold text-white">
        {graficos.titulo} · {graficos.tipo === 'lucro' ? TG.rotuloAcao : TG.rotuloFii}
      </div>
      <div className="grid grid-cols-2 gap-2 p-2.5 lg:grid-cols-4 lg:gap-4 lg:p-3.5">
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

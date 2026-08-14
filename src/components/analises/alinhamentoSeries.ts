/**
 * Alinhamento canônico das séries do painel de Rentabilidade.
 *
 * A raiz do bug crônico do gráfico ("carteira começa no meio, benchmarks em
 * janelas diferentes, % do CDI sobre janelas distintas") era a AUSÊNCIA de um
 * ponto único de alinhamento: os benchmarks eram rebaseados em 0 no servidor
 * (cada um na SUA primeira data disponível), a carteira nunca era ancorada, e
 * o chart ainda fabricava zeros à esquerda pra séries que começavam depois.
 *
 * Este módulo é a fonte única do contrato do comparativo:
 *
 *   1. A JANELA do gráfico é a janela da CARTEIRA (t0 = primeiro ponto após o
 *      filtro de período; fim = último ponto fechado). Benchmark não estica o
 *      eixo pra antes da carteira nem além do último dado dela.
 *   2. Toda série ancora em 0% no MESMO t0. A carteira ganha um ponto
 *      sintético 0% um dia antes do primeiro retorno — o valor do 1º ponto é
 *      o retorno do próprio dia 1 (ganho instantâneo, convenção Kinvo) e NÃO
 *      é rebaseado fora. Benchmarks são rebaseados pelo valor acumulado que
 *      tinham EM t0.
 *   3. Benchmark sem dado em t0 (histórico raso) entra rebaseado na própria
 *      primeira data ≥ t0 — gap honesto no início, nunca zeros fabricados.
 *
 * Invariantes garantidas (e testadas em __tests__/alinhamentoSeries.test.ts):
 *   - toda série devolvida começa em exatamente 0;
 *   - nenhum ponto fora de [t0-1d, fim];
 *   - o último valor de cada série é o acumulado DA JANELA — o card de resumo
 *     deriva % TOTAL / % DO CDI / % REAL destes mesmos números.
 */

import type { IndexData, IndexResponse } from '@/hooks/useIndices';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface JanelaComparativa {
  /** Timestamp da âncora 0% (um dia antes do 1º retorno da carteira). */
  inicio: number;
  /** Timestamp do último ponto fechado da carteira. */
  fim: number;
}

export interface SeriesAlinhadas {
  carteira: IndexData[];
  benchmarks: IndexResponse[];
  /** null quando não há carteira (benchmarks passam rebaseados na própria 1ª data). */
  janela: JanelaComparativa | null;
}

/** Último valor com date <= ref; null se a série começa depois de ref. */
const valorEm = (data: IndexData[], ref: number): number | null => {
  let v: number | null = null;
  for (const item of data) {
    if (item.date > ref) break;
    v = item.value;
  }
  return v;
};

/** Reancora acumulados em %: v' = ((1+v)/(1+base)) - 1. Base 0 é no-op. */
const rebase = (data: IndexData[], basePct: number): IndexData[] => {
  if (basePct === 0) return data;
  const baseFactor = 1 + basePct / 100;
  if (baseFactor <= 0) return data;
  return data.map((p) => ({ date: p.date, value: ((1 + p.value / 100) / baseFactor - 1) * 100 }));
};

const ordenar = (data: IndexData[]): IndexData[] => [...data].sort((a, b) => a.date - b.date);

/**
 * Alinha um benchmark à janela [t0, fim]:
 *  - corta pontos fora da janela;
 *  - rebaseia pelo acumulado em t0 quando a série cobre t0 (e injeta a âncora
 *    0% em t0), senão pela própria primeira data dentro da janela;
 *  - devolve null quando nada sobra (benchmark sem interseção com a janela).
 */
const alinharBenchmark = (serie: IndexData[], janela: JanelaComparativa): IndexData[] | null => {
  const ordenada = ordenar(serie);
  const dentro = ordenada.filter((p) => p.date > janela.inicio && p.date <= janela.fim);
  if (dentro.length === 0) return null;

  const baseEmT0 = valorEm(ordenada, janela.inicio);
  if (baseEmT0 != null) {
    return [{ date: janela.inicio, value: 0 }, ...rebase(dentro, baseEmT0)];
  }
  // Histórico raso: ancora na primeira data disponível dentro da janela.
  const rebased = rebase(dentro, dentro[0].value);
  return [{ ...rebased[0], value: 0 }, ...rebased.slice(1)];
};

export interface AlinharParams {
  /** Série cumulativa da carteira (TWR/MWR), já sem o dia corrente. */
  carteira: IndexData[];
  /** Benchmarks como vêm do useIndices (cada um com base própria). */
  benchmarks: IndexResponse[];
  /** Início do período selecionado (ms UTC); pontos anteriores saem da janela. */
  periodoInicio?: number;
}

export function alinharSeriesComparativas({
  carteira,
  benchmarks,
  periodoInicio,
}: AlinharParams): SeriesAlinhadas {
  const carteiraOrdenada = ordenar(carteira).filter(
    (p) => periodoInicio == null || p.date >= periodoInicio,
  );

  // Sem carteira: benchmarks seguem visíveis, cada um ancorado em 0 na própria
  // primeira data (comportamento de conta nova, sem janela pra impor).
  if (carteiraOrdenada.length === 0) {
    return {
      carteira: [],
      janela: null,
      benchmarks: benchmarks
        .map((b) => {
          const data = ordenar(b.data).filter(
            (p) => periodoInicio == null || p.date >= periodoInicio,
          );
          if (data.length === 0) return null;
          const rebased = rebase(data, data[0].value);
          return { ...b, data: [{ ...rebased[0], value: 0 }, ...rebased.slice(1)] };
        })
        .filter((b): b is IndexResponse => b !== null),
    };
  }

  // Âncora 0% um dia antes do 1º retorno: o valor do 1º ponto É o retorno do
  // dia 1 (ganho instantâneo) — rebaseá-lo esconderia esse retorno e o gráfico
  // divergiria do card (que usa base 0 pelo mesmo motivo).
  const primeiro = carteiraOrdenada[0];
  const fim = carteiraOrdenada[carteiraOrdenada.length - 1].date;
  const inicio = primeiro.date - DAY_MS;
  const janela: JanelaComparativa = { inicio, fim };

  // Série de período (twrStartDate) já vem ancorada em 0 no 1º ponto — nesse
  // caso não duplicamos âncora, só garantimos o contrato (1º valor 0).
  const carteiraAlinhada =
    primeiro.value === 0 ? carteiraOrdenada : [{ date: inicio, value: 0 }, ...carteiraOrdenada];

  return {
    carteira: carteiraAlinhada,
    janela,
    benchmarks: benchmarks
      .map((b) => {
        const alinhado = alinharBenchmark(b.data ?? [], janela);
        return alinhado ? { ...b, data: alinhado } : null;
      })
      .filter((b): b is IndexResponse => b !== null),
  };
}

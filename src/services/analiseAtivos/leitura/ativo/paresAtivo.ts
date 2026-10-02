/**
 * Pares do segmento na página do ativo (fatia C). Linhas do Quadro em memória (linhasQuadro), sem
 * consulta nova: o próprio ativo vem PRIMEIRO (a tela destaca a linha) e depois até 5 pares.
 *
 * - Ações: os pares gravados pelo job 'quadro' (linha.pares); sem eles, a mesma regra da Fase 0
 *   (selecionarPares: mesmo segmento B3, completado pelo subsetor, por valor de mercado).
 * - FIIs: mesmo segmento CVM e mesmo tipo (tijolo/papel/híbrido), por patrimônio.
 * - Só linhas do Quadro (noQuadro) entram como par; sem pares, `itens` traz só o próprio ativo e a
 *   tela diz 'sem pares no mesmo segmento'.
 */
import { obterLinhasQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { selecionarPares } from '@/services/analiseAtivos/regras/calculo/pares';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { LinhaQuadroApi } from '@/types/analiseAtivosApi';

export const N_PARES = 5;

export interface ParesAtivo {
  criterio: string;
  /** próprio ativo primeiro, depois os pares */
  itens: LinhaQuadroApi[];
}

function porTamanho(a: LinhaQuadroApi, b: LinhaQuadroApi): number {
  const va = a.patrimonio ?? a.valorMercado ?? -Infinity;
  const vb = b.patrimonio ?? b.valorMercado ?? -Infinity;
  return vb - va || a.ticker.localeCompare(b.ticker);
}

/** Tickers dos pares (sem o próprio ativo), na ordem de exibição. Função pura. */
export function selecionarParesAtivo(
  alvo: LinhaQuadroApi,
  linhas: readonly LinhaQuadroApi[],
  n: number = N_PARES,
): string[] {
  const universo = linhas.filter(
    (l) => l.classe === alvo.classe && l.noQuadro && l.ticker !== alvo.ticker,
  );
  const disponiveis = new Set(universo.map((l) => l.ticker));
  const gravados = alvo.pares.filter((p) => disponiveis.has(p));
  if (gravados.length > 0) return gravados.slice(0, n);

  if (alvo.classe === 'acao') {
    return selecionarPares(
      { symbol: alvo.ticker, segmento: alvo.segmento, subsetor: alvo.subsetor },
      universo.map((l) => ({
        symbol: l.ticker,
        segmento: l.segmento,
        subsetor: l.subsetor,
        valorMercado: l.valorMercado,
      })),
      n,
    );
  }
  if (!alvo.segmentoCvm || !alvo.fiiTipo) return [];
  return universo
    .filter((l) => l.segmentoCvm === alvo.segmentoCvm && l.fiiTipo === alvo.fiiTipo)
    .sort(porTamanho)
    .slice(0, n)
    .map((l) => l.ticker);
}

export function criterioPares(alvo: Pick<LinhaQuadroApi, 'classe'>): string {
  return alvo.classe === 'fii'
    ? TEXTOS_TELA.ativo.criterioParesFii
    : TEXTOS_TELA.ativo.criterioParesAcao;
}

/** Próprio ativo + pares, das linhas já convertidas. Função pura. */
export function montarParesAtivo(
  alvo: LinhaQuadroApi,
  linhas: readonly LinhaQuadroApi[],
  n: number = N_PARES,
): ParesAtivo {
  const porTicker = new Map(linhas.map((l) => [l.ticker, l]));
  const pares = selecionarParesAtivo(alvo, linhas, n)
    .map((t) => porTicker.get(t))
    .filter((l): l is LinhaQuadroApi => Boolean(l));
  return { criterio: criterioPares(alvo), itens: [alvo, ...pares] };
}

/** null = ticker fora da área. */
export async function obterParesAtivo(ticker: string): Promise<ParesAtivo | null> {
  const symbol = ticker.toUpperCase();
  const linhas = await obterLinhasQuadroApi(undefined, { incluirForaDoQuadro: true });
  const alvo = linhas.find((l) => l.ticker === symbol);
  if (!alvo) return null;
  return montarParesAtivo(alvo, linhas);
}

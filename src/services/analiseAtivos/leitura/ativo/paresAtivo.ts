/**
 * Pares do segmento na página do ativo (fatia C). Linhas do Quadro em memória (linhasQuadro), sem
 * consulta nova: o próprio ativo vem PRIMEIRO (a tela destaca a linha) e depois até 5 pares.
 *
 * - Ações: os pares gravados pelo job 'quadro' (linha.pares); sem eles, a mesma regra da Fase 0
 *   (selecionarPares: mesmo segmento B3, completado pelo subsetor, por valor de mercado).
 * - FIIs: mesmo segmento CVM e mesmo tipo (tijolo/papel/híbrido), por patrimônio.
 * - Só linhas do Quadro (noQuadro) entram como par; sem pares, `itens` traz só o próprio ativo e a
 *   tela diz 'sem pares no mesmo segmento'.
 *
 * v2.4 (fatia C2): a TELA mostra só os pares (sem o próprio ativo), em ordem A–Z, com a contagem de
 * critérios em 5 anos (paresParaTela + criterioParesTela). A seleção (quais pares) não muda.
 */
import { obterLinhasQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import { selecionarPares } from '@/services/analiseAtivos/regras/calculo/pares';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import { formatarTexto } from '@/services/analiseAtivos/textosCriterios';
import type { ClasseQuadro, LinhaQuadroApi } from '@/types/analiseAtivosApi';
import type { Janela } from '@/types/analiseAtivosCriterios';

/** Janela da coluna Critérios dos pares (§3.2 bloco 7). */
export const JANELA_PARES: Janela = 5;

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
    (l) =>
      l.classe === alvo.classe &&
      l.noQuadro &&
      l.ticker !== alvo.ticker &&
      !l.flags.includes(FLAG_CNPJ_EM_CONFERENCIA),
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

/** v2.4: critério de seleção exibido no card dos pares (com a ordem A–Z e a janela). */
export function criterioParesTela(classe: ClasseQuadro, janela: Janela = JANELA_PARES): string {
  const t = TEXTOS_ATIVO.pares;
  return formatarTexto(classe === 'fii' ? t.subFii : t.subAcao, { anos: janela });
}

/** v2.4: pares da tela — sem o próprio ativo e em ordem A–Z por ticker. Função pura. */
export function paresParaTela(alvo: string, linhas: readonly LinhaQuadroApi[]): LinhaQuadroApi[] {
  return linhas
    .filter((l) => l.ticker !== alvo)
    .sort((a, b) => a.ticker.localeCompare(b.ticker, 'pt-BR'));
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

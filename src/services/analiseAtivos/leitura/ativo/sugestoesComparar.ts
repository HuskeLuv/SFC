/**
 * Sugestões do modal "Comparar" da página do ativo (fatia C1) — GET
 * /api/analise-ativos/ativos/[ticker]/comparar-sugestoes?q=&janela=.
 *
 * Universo: linhas do Quadro em memória (obterLinhasQuadroApi), só noQuadro, da MESMA classe, sem o
 * próprio ativo e sem CNPJ em conferência. Ordem: pares primeiro (ação: mesmo segmento B3 ou mesmo
 * setor; FII: mesmo segmento CVM), depois os demais, cada grupo em ordem A–Z. Em FII só o mesmo
 * perfil de critérios (tijolo × papel usam critérios diferentes): o perfil vem da avaliação
 * (criteria_eval); sem avaliação, 'tijolo' = tijolo e o resto = papel (rec. 3, imóveis < 50% do PL).
 * Até 8 itens (12 com busca). Métrica-resumo da classe (ação P/L; FII P/VP) e a contagem "n de k"
 * da janela pedida. Só o banco; nenhum dado do usuário; nenhum provedor externo.
 */
import type { PrismaClient } from '@prisma/client';
import { obterLinhasQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { obterCriteriosVarios } from '@/services/analiseAtivos/leitura/criterios/lerCriterios';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import { TEXTOS_ACOES_CARTEIRA } from '@/services/analiseAtivos/textosAcoesCarteira';
import type { LinhaQuadroApi } from '@/types/analiseAtivosApi';
import type {
  CriteriosLinhaApi,
  Janela,
  PerfilCriterio,
  SugestaoComparar,
  SugestoesCompararResposta,
} from '@/types/analiseAtivosCriterios';

export const MAX_SUGESTOES = 8;
export const MAX_SUGESTOES_BUSCA = 12;

const T = TEXTOS_ACOES_CARTEIRA.comparar;

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

const aZ = (a: LinhaQuadroApi, b: LinhaQuadroApi) => a.ticker.localeCompare(b.ticker);

/** Perfil de critérios do FII (avaliação primeiro; sem ela, tijolo = tijolo e o resto = papel). */
export function perfilFii(
  linha: LinhaQuadroApi,
  criterios: ReadonlyMap<string, CriteriosLinhaApi>,
): PerfilCriterio {
  const avaliado = criterios.get(linha.ticker)?.perfil;
  if (avaliado === 'fii_tijolo' || avaliado === 'fii_papel') return avaliado;
  return linha.fiiTipo === 'tijolo' ? 'fii_tijolo' : 'fii_papel';
}

/** Par do ativo: ação = mesmo segmento B3 ou mesmo setor; FII = mesmo segmento CVM. */
export function ehParComparar(alvo: LinhaQuadroApi, l: LinhaQuadroApi): boolean {
  if (alvo.classe === 'acao') {
    return (
      (!!alvo.segmento && l.segmento === alvo.segmento) || (!!alvo.setor && l.setor === alvo.setor)
    );
  }
  return !!alvo.segmentoCvm && l.segmentoCvm === alvo.segmentoCvm;
}

function metrica(l: LinhaQuadroApi): SugestaoComparar['metrica'] {
  return l.classe === 'acao'
    ? { rotulo: T.rotuloMetricaAcao, valor: l.pl, formato: 'multiplo' }
    : { rotulo: T.rotuloMetricaFii, valor: l.pvp, formato: 'numero2' };
}

/**
 * Seleção PURA (testável sem banco): a partir das linhas do Quadro e dos critérios já lidos.
 * `criterios` precisa ter, no FII, os critérios de TODO o universo (perfil); na ação, basta os da
 * lista final.
 */
export function selecionarSugestoes(
  alvo: LinhaQuadroApi,
  linhas: readonly LinhaQuadroApi[],
  q: string | null,
  criterios: ReadonlyMap<string, CriteriosLinhaApi>,
): LinhaQuadroApi[] {
  let universo = linhas.filter(
    (l) =>
      l.classe === alvo.classe &&
      l.noQuadro &&
      l.ticker !== alvo.ticker &&
      !l.flags.includes(FLAG_CNPJ_EM_CONFERENCIA),
  );
  if (alvo.classe === 'fii') {
    const perfil = perfilFii(alvo, criterios);
    universo = universo.filter((l) => perfilFii(l, criterios) === perfil);
  }
  const busca = q ? normalizar(q) : '';
  if (busca) {
    universo = universo.filter((l) => normalizar(`${l.ticker} ${l.nome}`).includes(busca));
  }
  const pares = universo.filter((l) => ehParComparar(alvo, l)).sort(aZ);
  const demais = universo.filter((l) => !ehParComparar(alvo, l)).sort(aZ);
  return [...pares, ...demais].slice(0, busca ? MAX_SUGESTOES_BUSCA : MAX_SUGESTOES);
}

export async function sugestoesComparar(
  prisma: PrismaClient,
  e: { ticker: string; janela: Janela; q: string | null },
): Promise<SugestoesCompararResposta | null> {
  const symbol = e.ticker.toUpperCase();
  const linhas = await obterLinhasQuadroApi(undefined, { incluirForaDoQuadro: true });
  const alvo = linhas.find((l) => l.ticker === symbol);
  if (!alvo) return null;

  // FII: o perfil de todo o universo da classe decide quem entra (uma consulta só).
  const criteriosUniverso =
    alvo.classe === 'fii'
      ? await obterCriteriosVarios(
          prisma,
          linhas.filter((l) => l.classe === 'fii' && l.noQuadro).map((l) => l.ticker),
          e.janela,
        )
      : new Map<string, CriteriosLinhaApi>();
  if (alvo.classe === 'fii' && !criteriosUniverso.has(symbol)) {
    const doAlvo = await obterCriteriosVarios(prisma, [symbol], e.janela);
    const c = doAlvo.get(symbol);
    if (c) criteriosUniverso.set(symbol, c);
  }

  const lista = selecionarSugestoes(alvo, linhas, e.q, criteriosUniverso);
  const criterios =
    alvo.classe === 'fii'
      ? criteriosUniverso
      : await obterCriteriosVarios(
          prisma,
          lista.map((l) => l.ticker),
          e.janela,
        );

  return {
    ticker: symbol,
    janela: e.janela,
    itens: lista.map((l) => {
      const c = criterios.get(l.ticker);
      return {
        ticker: l.ticker,
        nome: l.nome,
        mesmoSetor: ehParComparar(alvo, l),
        metrica: metrica(l),
        criterios: c ? { n: c.n, de: c.de } : null,
      };
    }),
  };
}

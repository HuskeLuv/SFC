/**
 * Consulta do Quadro (Fase 1) — PURA, sobre as linhas já convertidas (LinhaQuadroApi) do Quadro
 * (noQuadro=true). Sem banco: a rota passa as linhas do leitor em memória e o conjunto "Na minha
 * carteira".
 *
 * - Filtros combinam (AND): lucroConsistente (5+ anos seguidos), dyMin, pvpMax, tipo (FII), setor
 *   (ação: setor B3) / segmento (FII: segmento CVM), naCarteira, somenteCompletos (tira incompleto,
 *   sem Índice e fora do Índice; zero pela regra é completo).
 * - Ordem por whitelist; nulos, 'n/a', 'sem Índice' e 'fora do Índice' SEMPRE no fim, nas duas
 *   direções; desempate pelo ticker (página estável).
 * - Facetas e contagens das abas saem do universo da classe, antes dos filtros.
 */
import { pregoesEntre } from '@/services/analiseAtivos/regras/comum/pregoes';
import {
  DIRECAO_PADRAO,
  LIMIARES_FILTRO,
  ORDEM_PADRAO,
  PAGINA_QUADRO,
} from '@/constants/analiseAtivosVisual';
import type {
  ClasseQuadro,
  DirecaoOrdem,
  Estado,
  FiiTipoTela,
  FrescorCotacao,
  LinhaQuadroApi,
  OrdemQuadro,
  QuadroParams,
  QuadroResposta,
} from '@/types/analiseAtivosApi';

export const LIMITE_MAXIMO = 100;
/** Cotação com mais pregões de atraso que isto = 'atrasado' (mesmo limite do painel de frescor). */
export const PREGOES_ATRASO_COTACAO = 2;

const valorOk = (e: Estado<number>): number | null => (e.estado === 'ok' ? e.valor : null);

/** Valor de ordenação de cada coluna; null = vai para o fim. */
export const VALOR_ORDEM: Record<
  Exclude<OrdemQuadro, 'ticker'>,
  (l: LinhaQuadroApi) => number | null
> = {
  indiceMf: (l) =>
    l.indice.estado === 'sem_score' || l.indice.estado === 'fora_do_indice' ? null : l.indice.valor,
  preco: (l) => valorOk(l.preco),
  anosLucro: (l) => l.anosLucroConsecutivos,
  mesesRendimento: (l) => l.mesesComRendimento,
  roe: (l) => valorOk(l.roe),
  pl: (l) => valorOk(l.pl),
  pvp: (l) => valorOk(l.pvp),
  dy: (l) => valorOk(l.dy12m),
  margem: (l) => valorOk(l.margemLiquida),
  divLiqEbitda: (l) => valorOk(l.divLiqEbitda),
  payout: (l) => valorOk(l.payout),
  vacancia: (l) => valorOk(l.vacanciaCvm),
  valorMercado: (l) => l.valorMercado,
  patrimonio: (l) => l.patrimonio,
  liquidez: (l) => l.liquidezMedia21,
  obrigacoesPl: (l) => valorOk(l.obrigacoesPl),
  cotistas: (l) => l.cotistas,
};

const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export function compararLinhas(
  ordem: OrdemQuadro,
  dir: DirecaoOrdem,
): (a: LinhaQuadroApi, b: LinhaQuadroApi) => number {
  const m = dir === 'desc' ? -1 : 1;
  if (ordem === 'ticker') return (a, b) => m * a.ticker.localeCompare(b.ticker);
  const valor = VALOR_ORDEM[ordem];
  return (a, b) => {
    const va = valor(a);
    const vb = valor(b);
    const ta = finito(va);
    const tb = finito(vb);
    if (ta && tb && va !== vb) return m * (va - vb);
    if (ta !== tb) return ta ? -1 : 1; // nulos no fim nas duas direções
    return a.ticker.localeCompare(b.ticker);
  };
}

/** Índice completo: calculado ou zero pela regra (o zero não é falta de dado). */
export function ehCompleta(l: LinhaQuadroApi): boolean {
  return l.indice.estado === 'calculado' || l.indice.estado === 'zero_regra';
}

export type FiltrosConsulta = Omit<QuadroParams, 'classe' | 'ordem' | 'dir' | 'offset' | 'limite'>;

export function filtrarLinhas(
  linhas: readonly LinhaQuadroApi[],
  f: FiltrosConsulta,
  naCarteira?: ReadonlySet<string>,
): LinhaQuadroApi[] {
  return linhas.filter((l) => {
    if (f.lucroConsistente && !((l.anosLucroConsecutivos ?? 0) >= LIMIARES_FILTRO.lucroAnos)) {
      return false;
    }
    if (f.dyMin !== undefined) {
      const dy = valorOk(l.dy12m);
      if (dy === null || dy < f.dyMin) return false;
    }
    if (f.pvpMax !== undefined) {
      const pvp = valorOk(l.pvp);
      if (pvp === null || pvp > f.pvpMax) return false;
    }
    if (f.tipo && l.fiiTipo !== f.tipo) return false;
    if (f.setor && l.setor !== f.setor) return false;
    if (f.segmento && l.segmentoCvm !== f.segmento) return false;
    if (f.naCarteira && !(naCarteira?.has(l.ticker) ?? false)) return false;
    if (f.somenteCompletos && !ehCompleta(l)) return false;
    return true;
  });
}

const ordenarPt = (xs: Iterable<string>) =>
  [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'pt-BR'));

const ORDEM_TIPOS: FiiTipoTela[] = ['tijolo', 'papel', 'hibrido', 'fof', 'indefinido'];

export function facetasDe(
  classe: ClasseQuadro,
  linhas: readonly LinhaQuadroApi[],
): { setores: string[]; tipos: FiiTipoTela[] } {
  const setores = ordenarPt(
    linhas
      .map((l) => (classe === 'acao' ? l.setor : l.segmentoCvm))
      .filter((s): s is string => !!s),
  );
  const presentes = new Set(linhas.map((l) => l.fiiTipo).filter((t): t is FiiTipoTela => !!t));
  return { setores, tipos: classe === 'fii' ? ORDEM_TIPOS.filter((t) => presentes.has(t)) : [] };
}

/** Frescor da cotação do Quadro: última data de preço contra hoje, em pregões. */
export function frescorCotacao(linhas: readonly LinhaQuadroApi[], hoje: string): FrescorCotacao {
  const datas = linhas.map((l) => l.precoData).filter((d): d is string => !!d);
  if (datas.length === 0) return { data: null, status: 'sem_dado' };
  const data = datas.reduce((a, b) => (a > b ? a : b));
  const atraso =
    data >= hoje ? 0 : pregoesEntre(data, hoje).filter((d) => d > data && d <= hoje).length;
  return { data, status: atraso > PREGOES_ATRASO_COTACAO ? 'atrasado' : 'em_dia' };
}

export interface EntradaConsulta {
  params: QuadroParams;
  /** linhas do Quadro (noQuadro=true) das DUAS classes */
  linhas: readonly LinhaQuadroApi[];
  naCarteira?: ReadonlySet<string>;
  versao: string;
  dataRef: string | null;
  hoje: string;
}

export function consultarQuadro(e: EntradaConsulta): QuadroResposta {
  const { params } = e;
  const daClasse = e.linhas.filter((l) => l.classe === params.classe && l.noQuadro);
  const ordem = params.ordem ?? ORDEM_PADRAO;
  const dir = params.dir ?? DIRECAO_PADRAO[ordem];
  const limite = Math.min(Math.max(params.limite ?? PAGINA_QUADRO, 1), LIMITE_MAXIMO);
  const offset = Math.max(params.offset ?? 0, 0);
  const filtradas = filtrarLinhas(daClasse, params, e.naCarteira).sort(compararLinhas(ordem, dir));
  return {
    classe: params.classe,
    dataRef: e.dataRef,
    versao: e.versao,
    total: filtradas.length,
    offset,
    limite,
    contagens: {
      acao: e.linhas.filter((l) => l.classe === 'acao' && l.noQuadro).length,
      fii: e.linhas.filter((l) => l.classe === 'fii' && l.noQuadro).length,
    },
    facetas: facetasDe(params.classe, daClasse),
    frescorCotacao: frescorCotacao(daClasse, e.hoje),
    itens: filtradas.slice(offset, offset + limite),
  };
}

/**
 * Cadastro/universo da Análise de Ativos (leituras cruzadas entre fatias).
 * Classe de análise vem do cadastro próprio: CvmCompanyTicker vigente ⇒ ação; FiiTickerMap vigente
 * ⇒ FII (nunca de Asset.type, que tem ações marcadas como FII).
 */
import type { PrismaClient } from '@prisma/client';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { raizTicker } from '@/services/analiseAtivos/repositorio/conversao';
import { ESCOPO_POR_RAIZ_PADRAO } from '@/services/analiseAtivos/regras/acoes/financeiras';
// A6: BBSE3/CXSE3/PSSA3 em 'Seguradoras', IRBR3 em 'Resseguradoras'
import { SEGMENTOS_SEGURADORA } from '@/services/analiseAtivos/regras/acoes/templateFinanceira';
import type {
  ClasseTitulo,
  EmissorInfo,
  ItemUniverso,
  ScoringParams,
  TickerAcao,
  TickerFii,
} from '@/services/analiseAtivos/tipos';

export async function listarTickersAcoes(prisma: PrismaClient): Promise<TickerAcao[]> {
  const linhas = await prisma.cvmCompanyTicker.findMany({
    where: { validTo: null },
    orderBy: { symbol: 'asc' },
  });
  return linhas.map((l) => ({
    symbol: l.symbol,
    cnpj: l.cnpj,
    classeTitulo: l.classeTitulo as ClasseTitulo,
    unitQtdOn: l.unitQtdOn,
    unitQtdPn: l.unitQtdPn,
  }));
}

/**
 * Emissores (CvmCompany) com setor B3 pela raiz dos tickers vigentes. Financeira/banco pelo SEGMENTO
 * B3 (params.financeiras) + holdings financeiras por raiz; sem AssetSetorB3 (fatia C ainda não rodou)
 * cai para CvmCompany.layoutFinanceiro (fatia A) — banco e financeira. escopoPreferido: 'ind' para
 * banco (decisão 3), senão 'con' — salvo exceção por raiz (params.financeiras.escopoPorRaiz ou, sem
 * ela no JSON, ESCOPO_POR_RAIZ_PADRAO: ITUB e BRBI pelo consolidado, backtest 18/10 A10).
 */
export async function listarEmissores(
  prisma: PrismaClient,
  cnpjs?: string[],
  params: ScoringParams = SCORING_PARAMS_V1,
): Promise<EmissorInfo[]> {
  const filtro = cnpjs ? { cnpj: { in: cnpjs } } : {};
  const [cias, tickers] = await Promise.all([
    prisma.cvmCompany.findMany({ where: filtro, orderBy: { cnpj: 'asc' } }),
    prisma.cvmCompanyTicker.findMany({
      where: { ...filtro, validTo: null },
      select: { symbol: true, cnpj: true },
    }),
  ]);
  const raizesPorCnpj = new Map<string, string[]>();
  for (const t of tickers) {
    const lista = raizesPorCnpj.get(t.cnpj) ?? [];
    const raiz = raizTicker(t.symbol);
    if (!lista.includes(raiz)) lista.push(raiz);
    raizesPorCnpj.set(t.cnpj, lista);
  }
  const todasRaizes = [...new Set([...raizesPorCnpj.values()].flat())];
  const setores = todasRaizes.length
    ? await prisma.assetSetorB3.findMany({ where: { raiz: { in: todasRaizes } } })
    : [];
  const setorPorRaiz = new Map(setores.map((s) => [s.raiz, s]));
  const f = params.financeiras;
  const excecoes = f.escopoPorRaiz ?? ESCOPO_POR_RAIZ_PADRAO;

  return cias.map((c) => {
    const raizes = (raizesPorCnpj.get(c.cnpj) ?? []).sort();
    const setor = raizes.map((r) => setorPorRaiz.get(r)).find((s) => s !== undefined) ?? null;
    let ehBanco: boolean;
    let ehFinanceira: boolean;
    if (setor) {
      ehBanco = f.segmentosBanco.includes(setor.segmento);
      ehFinanceira =
        f.segmentosFinanceiros.includes(setor.segmento) ||
        raizes.some((r) => f.holdingsFinanceirasRaiz.includes(r));
    } else {
      ehBanco = c.layoutFinanceiro;
      ehFinanceira =
        c.layoutFinanceiro || raizes.some((r) => f.holdingsFinanceirasRaiz.includes(r));
    }
    const excecao = raizes.map((r) => excecoes[r]).find((e) => e !== undefined);
    return {
      cnpj: c.cnpj,
      nome: c.nome,
      mesFimExercicio: c.mesFimExercicio,
      raizes,
      setor: setor?.setor ?? null,
      subsetor: setor?.subsetor ?? null,
      segmento: setor?.segmento ?? null,
      segmentoListagem: setor?.segmentoListagem ?? null,
      ehFinanceira,
      ehBanco,
      escopoPreferido: excecao?.escopo ?? (ehBanco ? f.escopoBancos : f.escopoDemais),
    };
  });
}

/**
 * Sets de CNPJs financeiros da ingestão CVM (A6, fatia B), pelo segmento B3 (AssetSetorB3) da raiz
 * dos tickers do universo. `financeiras` = segmentosFinanceiros (lê a DVA: PDD e intermediação);
 * `bancos` = segmentosBanco; `seguradoras` = SEGMENTOS_SEGURADORA (campos de seguradora por rótulo,
 * nível 4 da DRE e o layout 'Receitas das Operações'). Sem AssetSetorB3 os Sets ficam vazios e a
 * ingestão é a de hoje.
 */
export interface SegmentosFinanceirosIngestao {
  financeiras: Set<string>;
  bancos: Set<string>;
  seguradoras: Set<string>;
}

export function segmentosVazios(): SegmentosFinanceirosIngestao {
  return { financeiras: new Set(), bancos: new Set(), seguradoras: new Set() };
}

export async function cnpjsFinanceirosPorSegmento(
  prisma: PrismaClient,
  universo: ReadonlyMap<string, readonly string[]>,
  params: ScoringParams = SCORING_PARAMS_V1,
): Promise<SegmentosFinanceirosIngestao> {
  const out = segmentosVazios();
  const cnpjsPorRaiz = new Map<string, Set<string>>();
  for (const [cnpj, symbols] of universo) {
    for (const s of symbols) {
      const raiz = raizTicker(s);
      const set = cnpjsPorRaiz.get(raiz) ?? new Set<string>();
      set.add(cnpj);
      cnpjsPorRaiz.set(raiz, set);
    }
  }
  if (cnpjsPorRaiz.size === 0) return out;
  const setores = await prisma.assetSetorB3.findMany({
    where: { raiz: { in: [...cnpjsPorRaiz.keys()] } },
    select: { raiz: true, segmento: true },
  });
  const f = params.financeiras;
  for (const s of setores) {
    if (!f.segmentosFinanceiros.includes(s.segmento)) continue;
    for (const cnpj of cnpjsPorRaiz.get(s.raiz) ?? []) {
      out.financeiras.add(cnpj);
      if (f.segmentosBanco.includes(s.segmento)) out.bancos.add(cnpj);
      if (SEGMENTOS_SEGURADORA.includes(s.segmento)) out.seguradoras.add(cnpj);
    }
  }
  return out;
}

export async function listarFiisListados(prisma: PrismaClient): Promise<TickerFii[]> {
  const linhas = await prisma.fiiTickerMap.findMany({
    where: { validTo: null },
    orderBy: { ticker: 'asc' },
  });
  return linhas.map((l) => ({
    symbol: l.ticker,
    cnpj: l.cnpj,
    conferido: l.conferido,
    origem: l.origem as TickerFii['origem'],
  }));
}

/**
 * Universo de análise por classe. FII: por padrão só FiiTickerMap.conferido=true (regra 20 —
 * casamento por nome não é publicado sem conferência PL×cotação).
 */
export async function universoAnalise(
  prisma: PrismaClient,
  classe: 'acao' | 'fii',
  opts?: { incluirNaoConferidos?: boolean },
): Promise<ItemUniverso[]> {
  const base: Array<{ symbol: string; cnpj: string; conferido: boolean }> =
    classe === 'acao'
      ? (await listarTickersAcoes(prisma)).map((t) => ({ ...t, conferido: true }))
      : (await listarFiisListados(prisma)).filter((t) => t.conferido || opts?.incluirNaoConferidos);
  if (base.length === 0) return [];
  const resumos = await prisma.assetQuoteResumo.findMany({
    where: { symbol: { in: base.map((b) => b.symbol) } },
    select: { symbol: true, negociadoUltimos30: true, baixaLiquidez: true },
  });
  const porSymbol = new Map(resumos.map((r) => [r.symbol, r]));
  return base.map((b) => {
    const r = porSymbol.get(b.symbol);
    return {
      symbol: b.symbol,
      classe,
      cnpj: b.cnpj,
      negociadoUltimos30: r?.negociadoUltimos30 ?? false,
      baixaLiquidez: r ? r.baixaLiquidez : null,
      conferido: b.conferido,
    };
  });
}

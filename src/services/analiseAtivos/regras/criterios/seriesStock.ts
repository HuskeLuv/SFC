/**
 * Séries anuais de STOCKS (EUA) para os Filtros de Fundamentos — fatia B da feature Stocks e REITs
 * (docs/analise-ativos/stocks-reits/desenho.json → final.criterios). A partir das linhas FY da SEC
 * em asset_fundamentals_period (source 'SEC', emissorId 'CIK:##########', gravadas pela fatia A),
 * em US$ mi (margem em %, Dív/EBITDA em ×). MESMOS nomes de série das ações (rec/luc/ebitda/mg/
 * dl/fcl valem igual):
 *  - FY vigente: maior versão por dtFim (10-K/A reapresenta com versão +1); um FY por ano fiscal (o
 *    de dtFim mais recente). O ano é o ROTULADO pela fatia A (término do exercício; jan/fev = ano
 *    anterior: WMT 31/01/2026 = FY2025);
 *  - revenue = receita (> 0; ≤ 0 = ausente); net_income = lucro dos controladores (lucroAtribuivel;
 *    sem ele, lucroLiquido). O critério 'luc' pede net_income_adjusted, que a SEC não tem: cai na
 *    serieFallback net_income (obs 'lucro_sem_descontado', igual à v2.5);
 *  - ebitda = ebit + D&A, onde `ebit` é a BASE do EBITDA pelo degrau gravado pela fatia A (flag):
 *    (1) lucro operacional; (2) lucro antes do IR + juros ('ebitda_pre_ir'); (3) lucro líquido + IR +
 *    juros ('ebitda_lucro'). D&A AUSENTE = EBITDA sem dado (no Brasil vira 0; na SEC a falta da tag
 *    é falta de dado: GOOGL até 2020);
 *  - net_margin = lucro ÷ receita × 100 (receita ≤ lucro: params.criterios.margem, como as ações);
 *  - net_debt_ebitda = (dívida bruta − caixa − aplicações de curto prazo) ÷ EBITDA — definição ÚNICA
 *    do desenho. Dívida bruta AUSENTE = sem dado (financeiras sem dívida tagueada: JPM, BRK; no
 *    Brasil a dívida ausente é zero). Caixa ausente = sem dado; aplicações ausentes = 0. EBITDA ≤ 0
 *    com DL > 0 = +Infinity (avaliarCriterio: 'EBITDA ≤ 0 em AAAA'); caixa líquido = dentro;
 *  - free_cash_flow = FCO − CAPEX (nunca o fluxo de financiamento); CAPEX ausente = sem dado (JPM;
 *    NVDA 2013–2021 em tag própria, fase 2).
 * Funções puras + a leitura do banco em lote (lerBrutosSec, usada também por seriesReit, fonteSec,
 * executarCriteriosEua e gerarQuadroEua).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import { cikDoEmissorId, emissorIdSec, FONTE_PERIODO_SEC } from '@/types/analiseAtivosEua';
import type { SerieCriterio } from '@/types/analiseAtivosCriterios';

export type SeriesCriteriosEua = Partial<Record<SerieCriterio, Record<number, number | null>>>;

/**
 * Linha FY da SEC (só as colunas que os critérios, os múltiplos e o Quadro EUA leem; valores em
 * US$ como gravados, ações em unidades). Também o formato da fixture do DEV (eua-dev.json).
 */
export interface FySec {
  emissorId: string;
  /** 'AAAA-MM-DD' */
  dtFim: string;
  versao: number;
  anoFiscal: number;
  receita: number | null;
  /** base do EBITDA pelo degrau (lucro operacional | pré-IR + juros | lucro + IR + juros) */
  ebit: number | null;
  depreciacaoAmortizacao: number | null;
  lucroLiquido: number | null;
  /** lucro dos controladores (NetIncomeLoss) */
  lucroAtribuivel: number | null;
  caixa: number | null;
  /** aplicações de curto prazo (ShortTermInvestments → MarketableSecuritiesCurrent) */
  aplicacoesFinanceiras: number | null;
  dividaBrutaCp: number | null;
  dividaBrutaLp: number | null;
  fco: number | null;
  /** positivo = saída */
  capex: number | null;
  /** dividendos pagos (positivo) */
  dividendosJcpPagos: number | null;
  recompras: number | null;
  pl: number | null;
  acoesMediaDiluida: number | null;
  /** dividendo por ação (US$) e origem: cash_paid | declared | derivado */
  dpa: number | null;
  dpaOrigem: string | null;
  flags: string[];
}

/** Entrada pura de uma empresa SEC (CIK = cikFundamentos do cadastro). */
export interface BrutoSec {
  /** CIK de 10 dígitos de onde vêm os fundamentos (o próprio ou o cikHistorico: XOM) */
  cik: string;
  fys: FySec[];
}

/** Um FY vigente por ano fiscal (maior versão por dtFim; no ano, o dtFim mais recente). Pura. */
export function fysSecPorAno(linhas: readonly FySec[]): Map<number, FySec> {
  const vigentes = new Map<string, FySec>();
  for (const l of linhas) {
    const atual = vigentes.get(l.dtFim);
    if (!atual || l.versao > atual.versao) vigentes.set(l.dtFim, l);
  }
  const porAno = new Map<number, FySec>();
  for (const f of vigentes.values()) {
    const atual = porAno.get(f.anoFiscal);
    if (!atual || f.dtFim > atual.dtFim) porAno.set(f.anoFiscal, f);
  }
  return new Map([...porAno.entries()].sort((a, b) => a[0] - b[0]));
}

const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export const emMi = (n: number | null): number | null => (finito(n) ? n / 1e6 : null);

/** Lucro dos controladores (lucroAtribuivel; sem ele, lucroLiquido). */
export function lucroSec(f: Pick<FySec, 'lucroAtribuivel' | 'lucroLiquido'>): number | null {
  return finito(f.lucroAtribuivel)
    ? f.lucroAtribuivel
    : finito(f.lucroLiquido)
      ? f.lucroLiquido
      : null;
}

/** EBITDA calculado (ebit do degrau + D&A); qualquer parte ausente = null. Em US$. */
export function ebitdaSec(f: Pick<FySec, 'ebit' | 'depreciacaoAmortizacao'>): number | null {
  return finito(f.ebit) && finito(f.depreciacaoAmortizacao)
    ? f.ebit + f.depreciacaoAmortizacao
    : null;
}

/** Dívida líquida = dívida bruta − caixa − aplicações de curto prazo (US$); sem bruta/caixa = null. */
export function dividaLiquidaSec(
  f: Pick<FySec, 'dividaBrutaCp' | 'dividaBrutaLp' | 'caixa' | 'aplicacoesFinanceiras'>,
): number | null {
  if (!finito(f.dividaBrutaCp) && !finito(f.dividaBrutaLp)) return null;
  if (!finito(f.caixa)) return null;
  const bruta = (f.dividaBrutaCp ?? 0) + (f.dividaBrutaLp ?? 0);
  return bruta - f.caixa - (finito(f.aplicacoesFinanceiras) ? f.aplicacoesFinanceiras : 0);
}

/** Dív.líq/EBITDA (×): EBITDA ≤ 0 com DL > 0 = +Infinity; caixa líquido com EBITDA ≤ 0 = 0. */
export function dlEbitdaSec(dl: number | null, ebitda: number | null): number | null {
  if (dl === null || ebitda === null) return null;
  if (ebitda > 0) return dl / ebitda;
  return dl > 0 ? Number.POSITIVE_INFINITY : 0;
}

export interface OpcoesSeriesStock {
  /** receita ≤ lucro: 'sem_dado' (padrão) | 'valor' (params.criterios.margem, v2/v3) */
  receitaMenorQueLucro?: 'valor' | 'sem_dado';
}

export type SerieStock =
  | 'revenue'
  | 'net_income'
  | 'ebitda'
  | 'net_margin'
  | 'net_debt_ebitda'
  | 'free_cash_flow';

export const SERIES_STOCK: readonly SerieStock[] = [
  'revenue',
  'net_income',
  'ebitda',
  'net_margin',
  'net_debt_ebitda',
  'free_cash_flow',
];

/** Valores de um FY de stock (US$ mi, %, ×). Pura. */
export function valoresAnoStock(
  f: FySec,
  opcoes: OpcoesSeriesStock = {},
): Record<SerieStock, number | null> {
  const lucro = lucroSec(f);
  const receita = finito(f.receita) && f.receita > 0 ? f.receita : null;
  const eb = ebitdaSec(f);
  const margem =
    lucro !== null &&
    receita !== null &&
    (receita > lucro || opcoes.receitaMenorQueLucro === 'valor')
      ? (lucro / receita) * 100
      : null;
  return {
    revenue: emMi(receita),
    net_income: emMi(lucro),
    ebitda: emMi(eb),
    net_margin: margem,
    net_debt_ebitda: dlEbitdaSec(dividaLiquidaSec(f), eb),
    free_cash_flow: finito(f.fco) && finito(f.capex) ? emMi(f.fco - f.capex) : null,
  };
}

/** Séries anuais de um stock. Pura. */
export function seriesStock(b: BrutoSec, opcoes: OpcoesSeriesStock = {}): SeriesCriteriosEua {
  const out: Record<SerieStock, Record<number, number | null>> = {
    revenue: {},
    net_income: {},
    ebitda: {},
    net_margin: {},
    net_debt_ebitda: {},
    free_cash_flow: {},
  };
  for (const [ano, f] of fysSecPorAno(b.fys)) {
    const v = valoresAnoStock(f, opcoes);
    for (const k of SERIES_STOCK) out[k][ano] = v[k];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Leitura do banco (lotes de CIKs; só as colunas usadas)
// ---------------------------------------------------------------------------

const SELECT_FY_SEC = {
  emissorId: true,
  dtFim: true,
  versao: true,
  anoFiscal: true,
  receita: true,
  ebit: true,
  depreciacaoAmortizacao: true,
  lucroLiquido: true,
  lucroAtribuivel: true,
  caixa: true,
  aplicacoesFinanceiras: true,
  dividaBrutaCp: true,
  dividaBrutaLp: true,
  fco: true,
  capex: true,
  dividendosJcpPagos: true,
  recompras: true,
  pl: true,
  acoesMediaDiluida: true,
  dpa: true,
  dpaOrigem: true,
  flags: true,
} satisfies Prisma.AssetFundamentalsPeriodSelect;

type LinhaFySec = Prisma.AssetFundamentalsPeriodGetPayload<{ select: typeof SELECT_FY_SEC }>;

/** Linha do Prisma → FySec (Decimal → number, Date → 'AAAA-MM-DD'). Pura. */
export function fySecDaLinha(l: LinhaFySec): FySec {
  return {
    emissorId: l.emissorId,
    dtFim: paraData(l.dtFim),
    versao: l.versao,
    anoFiscal: l.anoFiscal,
    receita: paraNumero(l.receita),
    ebit: paraNumero(l.ebit),
    depreciacaoAmortizacao: paraNumero(l.depreciacaoAmortizacao),
    lucroLiquido: paraNumero(l.lucroLiquido),
    lucroAtribuivel: paraNumero(l.lucroAtribuivel),
    caixa: paraNumero(l.caixa),
    aplicacoesFinanceiras: paraNumero(l.aplicacoesFinanceiras),
    dividaBrutaCp: paraNumero(l.dividaBrutaCp),
    dividaBrutaLp: paraNumero(l.dividaBrutaLp),
    fco: paraNumero(l.fco),
    capex: paraNumero(l.capex),
    dividendosJcpPagos: paraNumero(l.dividendosJcpPagos),
    recompras: paraNumero(l.recompras),
    pl: paraNumero(l.pl),
    acoesMediaDiluida: paraNumero(l.acoesMediaDiluida),
    dpa: typeof l.dpa === 'number' && Number.isFinite(l.dpa) ? l.dpa : null,
    dpaOrigem: l.dpaOrigem,
    flags: l.flags,
  };
}

/**
 * Brutos SEC de um lote de CIKs (10 dígitos): FY consolidados da fonte 'SEC' desde `desdeAno`.
 * CIK sem linha nenhuma fica com fys vazio (todos os critérios 'sem dado').
 */
export async function lerBrutosSec(
  prisma: Pick<PrismaClient, 'assetFundamentalsPeriod'>,
  ciks: readonly string[],
  desdeAno: number,
): Promise<Map<string, BrutoSec>> {
  const out = new Map<string, BrutoSec>();
  if (ciks.length === 0) return out;
  for (const cik of ciks) out.set(cik, { cik, fys: [] });
  const linhas = await prisma.assetFundamentalsPeriod.findMany({
    where: {
      emissorId: { in: ciks.map((c) => emissorIdSec(c)) },
      source: FONTE_PERIODO_SEC,
      tipoPeriodo: 'FY',
      escopo: 'con',
      anoFiscal: { gte: desdeAno },
    },
    select: SELECT_FY_SEC,
  });
  for (const l of linhas) {
    const cik = cikDoEmissorId(l.emissorId);
    if (cik) out.get(cik)?.fys.push(fySecDaLinha(l));
  }
  return out;
}

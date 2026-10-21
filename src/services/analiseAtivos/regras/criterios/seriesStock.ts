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
 *
 * fundamentei-regras (docs/analise-ativos/fundamentei-regras/desenho.json, fatia F0; este arquivo
 * fica PRONTO na F0 — F1 e F3 só consomem):
 *  - série 'ebit' (critério 'ebitda' da v5, mesmo id): a base do EBITDA pelo degrau, SEM a D&A
 *    (ebitSec; degrauEbitSec diz qual degrau). Fora das saídas de hoje: valoresAnoStock,
 *    SERIES_STOCK e seriesStock() sem opção ficam idênticos; quem quer a série usa
 *    valoresAnoStockComEbit / SERIES_STOCK_COM_EBIT / seriesStock(b, { incluirEbit: true });
 *  - FySec.remuneracaoAcoes (SBC, US$, positiva; lida por lerBrutosSec; ausente/nula = o 10-K não
 *    informou — nunca 0) e as funções puras do REIT ajustado: fcoAjustadoSec (FCO − SBC),
 *    fcoAjustadoPorAcaoSec e dividendosFcoAjustadoPctSec (FCO ajustado ≤ 0 = +Infinity, como hoje).
 *    SBC nula ou negativa (sinal trocado) = nulo, e quem consome cai na série sem ajuste com a obs
 *    'sbc_indisponivel'.
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
  /**
   * F0 fundamentei-regras: remuneração em ações do ano (SBC, DFC do 10-K, US$, positiva). Ausente
   * ou null = o 10-K não informou (ou a ingestão ainda não leu: ANALISE_ATIVOS_SEC_SBC). Opcional
   * para as fixtures de antes continuarem válidas.
   */
  remuneracaoAcoes?: number | null;
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
  /** F0 fundamentei-regras: seriesStock() também devolve a série 'ebit' (padrão false = hoje) */
  incluirEbit?: boolean;
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

// ---------------------------------------------------------------------------
// F0 fundamentei-regras: série 'ebit' (lucro operacional pelo degrau)
// ---------------------------------------------------------------------------

/** Série 'ebit' (critério 'ebitda' da v5, mesmo id). */
export const SERIE_EBIT = 'ebit' as const;
export type SerieStockComEbit = SerieStock | typeof SERIE_EBIT;

/** As séries de hoje + 'ebit' (para a fonteSec/critérios da v5; F1). */
export const SERIES_STOCK_COM_EBIT: readonly SerieStockComEbit[] = [...SERIES_STOCK, SERIE_EBIT];

/** Degrau da base do EBITDA/EBIT gravado pela ingestão (flags ebitda_pre_ir / ebitda_lucro). */
export type DegrauEbitSec = 'lucro_operacional' | 'pre_ir' | 'lucro';

/** Qual degrau a ingestão usou para o `ebit` do FY (selo de cálculo do EBIT). Pura. */
export function degrauEbitSec(f: Pick<FySec, 'flags'>): DegrauEbitSec {
  if (f.flags.includes('ebitda_lucro')) return 'lucro';
  if (f.flags.includes('ebitda_pre_ir')) return 'pre_ir';
  return 'lucro_operacional';
}

/**
 * Lucro operacional (EBIT) em US$: a base do EBITDA pelo degrau — (1) lucro operacional; (2) lucro
 * antes do IR + juros; (3) lucro líquido + IR + juros —, SEM a D&A (que pode faltar sem tirar o
 * EBIT: GOOGL até 2020). Ausente = null. Pura.
 */
export function ebitSec(f: Pick<FySec, 'ebit'>): number | null {
  return finito(f.ebit) ? f.ebit : null;
}

/** valoresAnoStock + 'ebit' (US$ mi). Pura. */
export function valoresAnoStockComEbit(
  f: FySec,
  opcoes: OpcoesSeriesStock = {},
): Record<SerieStockComEbit, number | null> {
  return { ...valoresAnoStock(f, opcoes), ebit: emMi(ebitSec(f)) };
}

/** Séries anuais de um stock (com incluirEbit, também a 'ebit'). Pura. */
export function seriesStock(b: BrutoSec, opcoes: OpcoesSeriesStock = {}): SeriesCriteriosEua {
  const out: Partial<Record<SerieStockComEbit, Record<number, number | null>>> = {
    revenue: {},
    net_income: {},
    ebitda: {},
    net_margin: {},
    net_debt_ebitda: {},
    free_cash_flow: {},
  };
  const series = opcoes.incluirEbit ? SERIES_STOCK_COM_EBIT : SERIES_STOCK;
  if (opcoes.incluirEbit) out.ebit = {};
  for (const [ano, f] of fysSecPorAno(b.fys)) {
    const v = valoresAnoStockComEbit(f, opcoes);
    for (const k of series) (out[k] as Record<number, number | null>)[ano] = v[k];
  }
  return out;
}

// ---------------------------------------------------------------------------
// F0 fundamentei-regras: caixa operacional do REIT ajustado pela SBC (A2.d)
// ---------------------------------------------------------------------------

/** Séries do REIT ajustadas pela SBC (fco_acao/pay da v5, com serieFallback sem ajuste; F1). */
export type SerieReitAjustada = 'ocf_adjusted_per_share' | 'cash_payout_adjusted_pct';
export const SERIES_REIT_AJUSTADAS: readonly SerieReitAjustada[] = [
  'ocf_adjusted_per_share',
  'cash_payout_adjusted_pct',
];

/** SBC do FY (US$) válida: finita e ≥ 0. Ausente, nula ou negativa (sinal trocado) = null. Pura. */
export function sbcSec(f: Pick<FySec, 'remuneracaoAcoes'>): number | null {
  const v = f.remuneracaoAcoes;
  return finito(v) && v >= 0 ? v : null;
}

/** Caixa operacional ajustado = FCO − SBC (US$). FCO ou SBC sem dado = null. Pura. */
export function fcoAjustadoSec(f: Pick<FySec, 'fco' | 'remuneracaoAcoes'>): number | null {
  const sbc = sbcSec(f);
  return finito(f.fco) && sbc !== null ? f.fco - sbc : null;
}

/** Caixa operacional ajustado ÷ média de ações diluídas (US$/ação); sem dado = null. Pura. */
export function fcoAjustadoPorAcaoSec(
  f: Pick<FySec, 'fco' | 'remuneracaoAcoes' | 'acoesMediaDiluida'>,
): number | null {
  const ajustado = fcoAjustadoSec(f);
  const acoes = finito(f.acoesMediaDiluida) && f.acoesMediaDiluida > 0 ? f.acoesMediaDiluida : null;
  return ajustado !== null && acoes !== null ? ajustado / acoes : null;
}

/**
 * Dividendos ÷ caixa operacional ajustado × 100. `dividendosPagos` = dividendosPagosSec(f) de
 * seriesReit (passado por parâmetro: seriesReit importa este arquivo). Sem dividendos ou sem FCO
 * ajustado = null; FCO ajustado ≤ 0 com dividendos conhecidos = +Infinity (fora do limite). Pura.
 */
export function dividendosFcoAjustadoPctSec(
  f: Pick<FySec, 'fco' | 'remuneracaoAcoes'>,
  dividendosPagos: number | null,
): number | null {
  const ajustado = fcoAjustadoSec(f);
  if (ajustado === null || !finito(dividendosPagos) || dividendosPagos < 0) return null;
  return ajustado > 0 ? (dividendosPagos / ajustado) * 100 : Number.POSITIVE_INFINITY;
}

/** Valores ajustados de um FY de REIT (US$/ação e %). Pura. */
export function valoresAjustadosReitSec(
  f: Pick<FySec, 'fco' | 'remuneracaoAcoes' | 'acoesMediaDiluida'>,
  dividendosPagos: number | null,
): Record<SerieReitAjustada, number | null> {
  return {
    ocf_adjusted_per_share: fcoAjustadoPorAcaoSec(f),
    cash_payout_adjusted_pct: dividendosFcoAjustadoPctSec(f, dividendosPagos),
  };
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
  remuneracaoAcoes: true,
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
    remuneracaoAcoes: paraNumero(l.remuneracaoAcoes),
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

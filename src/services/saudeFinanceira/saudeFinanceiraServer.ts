/**
 * Saúde Financeira — orquestrador server-side.
 *
 * Reúne os insumos de todas as fontes já existentes e delega o cálculo ao
 * módulo puro (indicadores.ts):
 *  - Fluxo de caixa: aggregateCashflow (média dos meses ativos, modo lançado,
 *    fallback pro ano anterior — mesmo padrão do /api/planejamento/contexto).
 *  - Carteira: loop canônico valuatePortfolioItem + fiPricer (mesma valoração
 *    do /api/carteira/resumo), com split alta/baixa liquidez por categoria.
 *  - Dívidas: resumoDivida + accruedIndexFactor (saldo corrigido), categoria
 *    'c' = curto prazo, 'm'/'l' = longo prazo.
 *  - Rentabilidade: TWR 12m derivado de portfolio_performance (2 leituras
 *    pontuais — sem o builder pesado); carteira < 12m cai no proxy CDI.
 *  - Idade: AposentadoriaPlano.idade (User não tem data de nascimento).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { getIndicator } from '@/services/market/marketIndicatorService';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import { valuatePortfolioItem, type CategoriaCarteira } from '@/services/portfolio/itemValuation';
import { isFundoType } from '@/lib/fundoTypes';
import { liquidezTotalDias, pickLiquidezDeclarada } from '@/utils/liquidezResgate';
import { resumoDivida } from '@/services/dividas/amortizacao';
import { accruedIndexFactor } from '@/services/dividas/indexacaoDivida';
import { toCalcInput, toPagamentoInputs } from '@/app/api/dividas/_lib/serializer';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { aggregateCashflow, type CashflowAverages } from '@/services/cashflow/cashflowAggregation';
import {
  DEFAULT_INFLACAO_AA,
  getCdiAnualizado,
  getInflacao12m,
} from '@/services/market/economicRates';
import { CATEGORIA_LABELS } from '@/lib/carteiraCategoryColors';
import type { FixedIncomeAssetWithAsset } from '@/services/portfolio/patrimonioHistoricoBuilder';
import {
  computeSaudeFinanceira,
  type SaudeFinanceiraConfig,
  type SaudeFinanceiraIndicadores,
} from './indicadores';
import { getSaudeConfig } from './saudeFinanceiraConfig';

/** Renda fixa com vencimento até este horizonte conta como alta liquidez. */
const HORIZONTE_LIQUIDEZ_MESES = 12;
/** Mesmo horizonte em dias, pro prazo de resgate declarado dos fundos (D+N). */
const HORIZONTE_LIQUIDEZ_DIAS = 360;

/** Métricas dashboardData que representam caixa disponível (alta liquidez). */
const CAIXA_METRICS = [
  'caixa_para_investir_consolidado',
  'caixa_para_investir_acoes',
  'caixa_para_investir_fii',
  'caixa_para_investir_etf',
  'caixa_para_investir_reit',
  'caixa_para_investir_stocks',
  'caixa_para_investir_moedas_criptos',
  'caixa_para_investir_previdencia_seguros',
  'caixa_para_investir_opcoes',
  'caixa_para_investir_fim_fia',
  'caixa_para_investir_renda_fixa',
] as const;

export interface ComposicaoLinha {
  chave: string;
  label: string;
  valor: number;
}

export interface PassivoLinha {
  id: string;
  nome: string;
  tipo: string;
  prazo: 'curto' | 'longo';
  saldo: number;
  /** 'financiamento' | 'rotativa'. */
  modalidade: string;
  /** 'SAC' | 'PRICE'; null para rotativa. */
  sistema: string | null;
  /** Taxa efetiva a.m. em fração (0.01 = 1%); null para rotativa. */
  taxaAm: number | null;
  /** 'PREFIXADO' | 'TR' | 'IPCA' | 'CDI'. */
  indexador: string;
  /** Valor da próxima parcela do cronograma; null para rotativa/quitada. */
  valorParcela: number | null;
  parcelasPagas: number | null;
  totalParcelas: number | null;
  prazoRestanteMeses: number | null;
}

export interface SaudeFinanceiraPayload {
  asOf: string;
  indicadores: SaudeFinanceiraIndicadores;
  fontes: {
    cashflow: { year: number; activeMonths: number };
    inflacao: 'ipca-12m' | 'fallback';
    /** Idade usada no patrimônio ideal (AposentadoriaPlano); null = não preenchida. */
    idade: number | null;
    /** Idade-alvo de aposentadoria (AposentadoriaPlano.apos); null = sem plano. */
    idadeAlvo: number | null;
  };
  /** Parâmetros efetivos da metodologia (defaults + overrides do user). */
  config: SaudeFinanceiraConfig;
  composicao: {
    altaLiquidez: ComposicaoLinha[];
    baixaLiquidez: ComposicaoLinha[];
    passivos: PassivoLinha[];
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * TWR dos últimos 12 meses em fração a.a., encadeando o retorno acumulado de
 * portfolio_performance: (1+cum_hoje)/(1+cum_12mAtrás) − 1. Null quando a
 * série não cobre 12 meses (carteira jovem) — o caller usa o CDI como proxy.
 */
async function getTwr12m(userId: string): Promise<number | null> {
  const latest = await prisma.portfolioPerformance.findFirst({
    where: { userId },
    orderBy: { date: 'desc' },
    select: { date: true, cumulativeReturn: true },
  });
  if (!latest) return null;

  const anchorDate = new Date(latest.date);
  anchorDate.setFullYear(anchorDate.getFullYear() - 1);
  const anchor = await prisma.portfolioPerformance.findFirst({
    where: { userId, date: { lte: anchorDate } },
    orderBy: { date: 'desc' },
    select: { cumulativeReturn: true },
  });
  if (!anchor) return null;

  const cumEnd = Number(latest.cumulativeReturn);
  const cumStart = Number(anchor.cumulativeReturn);
  if (!Number.isFinite(cumEnd) || !Number.isFinite(cumStart)) return null;
  const twr = (1 + cumEnd / 100) / (1 + cumStart / 100) - 1;
  return Number.isFinite(twr) ? twr : null;
}

/**
 * Alta liquidez de um item de renda fixa: liquidez diária declarada, Tesouro
 * Direto (recompra D+1) ou vencimento dentro do horizonte. `liquidityType` é
 * nullable em vários caminhos de escrita — o fallback por maturityDate é
 * obrigatório, não cosmético.
 */
function isRendaFixaAltaLiquidez(
  fixedIncome: FixedIncomeAssetWithAsset | null | undefined,
  assetType: string | null | undefined,
  horizonte: Date,
): boolean {
  if (assetType === 'tesouro-direto') return true;
  if (!fixedIncome) return false;
  if (fixedIncome.tesouroBondType) return true;
  if (fixedIncome.liquidityType === 'DAILY') return true;
  if (fixedIncome.liquidityType === 'MATURITY') {
    return new Date(fixedIncome.maturityDate) <= horizonte;
  }
  return new Date(fixedIncome.maturityDate) <= horizonte;
}

/** Categorias que a planilha trata como ativos de longo prazo (baixa liquidez). */
const CATEGORIAS_BAIXA_LIQUIDEZ: readonly CategoriaCarteira[] = [
  'fimFia',
  'fiis',
  'acoes',
  'stocks',
  'reits',
  'etfs',
  'moedasCriptos',
  'previdenciaSeguros',
  'opcoes',
  'imoveisBens',
];

export async function buildSaudeFinanceira(userId: string): Promise<SaudeFinanceiraPayload> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const horizonteLiquidez = new Date(now);
  horizonteLiquidez.setMonth(horizonteLiquidez.getMonth() + HORIZONTE_LIQUIDEZ_MESES);

  const [
    portfolio,
    fixedIncomeAssets,
    dividasAtivas,
    plano,
    cdiAnualizado,
    inflacao12m,
    cashflowGroups,
    dashboardMetrics,
    stockTransactions,
    twr12m,
    config,
  ] = await Promise.all([
    prisma.portfolio.findMany({ where: { userId }, include: { asset: true } }),
    (async (): Promise<FixedIncomeAssetWithAsset[]> => {
      try {
        return (await prisma.fixedIncomeAsset.findMany({
          where: { userId },
          include: { asset: true },
        })) as FixedIncomeAssetWithAsset[];
      } catch (error) {
        const prismaError = error as Prisma.PrismaClientKnownRequestError;
        if (prismaError?.code !== 'P2021') throw error;
        return [];
      }
    })(),
    (async () => {
      try {
        // Em aberto = não quitada — pausada/em espera segue no passivo.
        return await prisma.divida.findMany({
          where: { userId, status: { not: 'quitada' } },
          include: { pagamentos: true },
        });
      } catch (error) {
        const prismaError = error as Prisma.PrismaClientKnownRequestError;
        if (prismaError?.code !== 'P2021') throw error;
        return [];
      }
    })(),
    prisma.aposentadoriaPlano.findUnique({
      where: { userId },
      select: { idade: true, apos: true },
    }),
    getCdiAnualizado(),
    getInflacao12m(),
    getMergedCashflowGroups(userId, currentYear),
    prisma.dashboardData.findMany({
      where: { userId, metric: { in: [...CAIXA_METRICS] } },
      select: { value: true },
    }),
    prisma.stockTransaction.findMany({
      where: { userId, type: 'compra', notes: { not: null } },
      select: { assetId: true, notes: true },
      orderBy: { date: 'desc' },
    }),
    getTwr12m(userId),
    getSaudeConfig(userId),
  ]);

  // Fluxo de caixa: média dos meses ativos, com fallback pro ano anterior.
  let cashflowYear = currentYear;
  let averages: CashflowAverages = aggregateCashflow(cashflowGroups).averages;
  if (averages.activeMonths === 0) {
    const prevAverages = aggregateCashflow(
      await getMergedCashflowGroups(userId, currentYear - 1),
    ).averages;
    if (prevAverages.activeMonths > 0) {
      averages = prevAverages;
      cashflowYear = currentYear - 1;
    }
  }
  const gastoMensal = averages.despesaMensalMedia;
  const rendaMensal = averages.sobraMensalMedia + averages.despesaMensalMedia;

  // Tesouro do catálogo destinado a reserva (transaction.notes.tesouroDestino) —
  // mesma convenção do resumo, senão o título soma em renda fixa e não na reserva.
  const tesouroReservaDestinoByAssetId = new Map<string, 'emergencia' | 'oportunidade'>();
  // Notes das compras por ativo, da mais recente pra mais antiga — alimenta o
  // prazo de resgate declarado dos fundos (ticket 02/09/2026).
  const notesByAssetId = new Map<string, unknown[]>();
  for (const tx of stockTransactions) {
    if (!tx.assetId || !tx.notes) continue;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(tx.notes);
    } catch {
      continue; // nota malformada — ignora
    }
    const list = notesByAssetId.get(tx.assetId) ?? [];
    list.push(parsed);
    notesByAssetId.set(tx.assetId, list);
    if (tesouroReservaDestinoByAssetId.has(tx.assetId)) continue;
    const dest = (parsed as { tesouroDestino?: unknown } | null)?.tesouroDestino;
    if (dest === 'reserva-oportunidade') {
      tesouroReservaDestinoByAssetId.set(tx.assetId, 'oportunidade');
    } else if (dest === 'reserva-emergencia') {
      tesouroReservaDestinoByAssetId.set(tx.assetId, 'emergencia');
    }
  }
  /** Prazo total (cotização + liquidação) declarado do fundo; null = não informado. */
  const fundoLiquidezDias = (assetId: string | null): number | null => {
    if (!assetId) return null;
    const liq = pickLiquidezDeclarada(notesByAssetId.get(assetId) ?? []);
    return liquidezTotalDias(liq.cotizacaoResgate, liq.liquidacaoResgate);
  };

  // Cotações: mesmo filtro do resumo (assets manuais/reserva/FI ficam de fora).
  const fiPricer = await createFixedIncomePricer(userId, { preloadedAssets: fixedIncomeAssets });
  const fixedIncomeByAssetId = fiPricer.fixedIncomeByAssetId;
  const symbols = portfolio
    .map((item) => {
      if (item.asset && (item.asset.type === 'imovel' || item.asset.type === 'personalizado')) {
        return null;
      }
      if (
        item.assetId &&
        fixedIncomeByAssetId.has(item.assetId) &&
        !isFundoType(item.asset?.type)
      ) {
        return null;
      }
      return item.asset?.symbol ?? null;
    })
    .filter(
      (symbol): symbol is string =>
        symbol !== null &&
        !symbol.startsWith('RESERVA-EMERG') &&
        !symbol.startsWith('RESERVA-OPORT') &&
        !symbol.startsWith('RENDA-FIXA') &&
        !symbol.startsWith('CONTA-CORRENTE') &&
        !symbol.startsWith('PERSONALIZADO') &&
        !symbol.startsWith('-') &&
        /^[A-Za-z]/.test(symbol),
    );
  const [quotes, dolarIndicator] = await Promise.all([
    getAssetPrices(symbols, { useBrapiFallback: true }),
    getIndicator('USD-BRL', { useBrapiFallback: true }).catch(() => null),
  ]);
  const cotacaoDolar = dolarIndicator?.price ?? null;

  // Loop canônico de valoração com split de liquidez por categoria.
  const porCategoria: Record<CategoriaCarteira, number> = {
    reservaEmergencia: 0,
    reservaOportunidade: 0,
    rendaFixaFundos: 0,
    fimFia: 0,
    fiis: 0,
    acoes: 0,
    stocks: 0,
    reits: 0,
    etfs: 0,
    moedasCriptos: 0,
    previdenciaSeguros: 0,
    opcoes: 0,
    imoveisBens: 0,
  };
  let rendaFixaAltaLiquidez = 0;
  let rendaFixaBaixaLiquidez = 0;
  // Fundos (aba Fundos): split pelo prazo de resgate declarado. Sem prazo
  // informado → baixa liquidez (conservador), como a planilha tratava todos.
  let fundosAltaLiquidez = 0;
  let fundosBaixaLiquidez = 0;

  for (const item of portfolio) {
    const fixedIncome = item.assetId ? fixedIncomeByAssetId.get(item.assetId) : null;
    const symbol = item.asset?.symbol;
    const valuation = valuatePortfolioItem({
      item,
      asset: item.asset,
      fixedIncome,
      quote: symbol ? quotes.get(symbol) : null,
      cotacaoDolar,
      tesouroReservaDestino: item.assetId
        ? tesouroReservaDestinoByAssetId.get(item.assetId)
        : undefined,
      fiGetCurrentValue: fiPricer.getCurrentValue,
    });
    porCategoria[valuation.categoria] += valuation.valorAtualBRL;
    if (valuation.categoria === 'rendaFixaFundos') {
      if (isRendaFixaAltaLiquidez(fixedIncome, item.asset?.type, horizonteLiquidez)) {
        rendaFixaAltaLiquidez += valuation.valorAtualBRL;
      } else {
        rendaFixaBaixaLiquidez += valuation.valorAtualBRL;
      }
    } else if (valuation.categoria === 'fimFia') {
      const dias = fundoLiquidezDias(item.assetId);
      if (dias != null && dias <= HORIZONTE_LIQUIDEZ_DIAS) {
        fundosAltaLiquidez += valuation.valorAtualBRL;
      } else {
        fundosBaixaLiquidez += valuation.valorAtualBRL;
      }
    }
  }

  const caixaParaInvestir = dashboardMetrics.reduce((sum, m) => sum + (m.value || 0), 0);

  const ativosAltaLiquidez =
    porCategoria.reservaEmergencia +
    porCategoria.reservaOportunidade +
    rendaFixaAltaLiquidez +
    fundosAltaLiquidez +
    caixaParaInvestir;
  const ativosBaixaLiquidez =
    rendaFixaBaixaLiquidez +
    fundosBaixaLiquidez +
    CATEGORIAS_BAIXA_LIQUIDEZ.filter((cat) => cat !== 'fimFia').reduce(
      (sum, cat) => sum + porCategoria[cat],
      0,
    );

  // Passivos: saldo corrigido pelo índice realizado; 'c' = curto, 'm'/'l' = longo.
  const passivos: PassivoLinha[] = [];
  for (const d of dividasAtivas) {
    const r = resumoDivida(toCalcInput(d), toPagamentoInputs(d.pagamentos));
    const fator = await accruedIndexFactor(d.indexador, d.primeiroVencimento);
    const saldo = round2(r.saldoDevedor * fator);
    if (saldo <= 0) continue;
    passivos.push({
      id: d.id,
      nome: d.nome,
      tipo: d.tipo,
      prazo: r.categoria === 'c' ? 'curto' : 'longo',
      saldo,
      modalidade: d.modalidade,
      sistema: d.sistema,
      taxaAm: d.taxaAm != null ? Number(d.taxaAm) : null,
      indexador: d.indexador,
      valorParcela: r.proximaParcela != null ? round2(r.proximaParcela.parcela) : null,
      parcelasPagas: r.parcelasPagas,
      totalParcelas: r.totalParcelas,
      prazoRestanteMeses: r.prazoRestanteMeses,
    });
  }
  const passivosCurtoPrazo = passivos
    .filter((p) => p.prazo === 'curto')
    .reduce((s, p) => s + p.saldo, 0);
  const passivosLongoPrazo = passivos
    .filter((p) => p.prazo === 'longo')
    .reduce((s, p) => s + p.saldo, 0);

  const indicadores = computeSaudeFinanceira(
    {
      rendaMensal,
      gastoMensal,
      idade: plano?.idade ?? null,
      rentabilidadeCarteiraAA: twr12m,
      cdiAA: cdiAnualizado != null ? cdiAnualizado / 100 : null,
      inflacaoAA: (inflacao12m ?? DEFAULT_INFLACAO_AA) / 100,
      ativosAltaLiquidez,
      ativosBaixaLiquidez,
      reservaEmergencia: porCategoria.reservaEmergencia,
      passivosCurtoPrazo,
      passivosLongoPrazo,
    },
    config,
  );

  // Composição pro bloco de balanço da UI. Formato planilha (ticket 21/08/2026):
  // TODAS as linhas do modelo aparecem, zeradas quando não há valor registrado.
  const linha = (chave: string, label: string, valor: number): ComposicaoLinha[] => [
    { chave, label, valor: round2(valor) },
  ];
  const altaLiquidez: ComposicaoLinha[] = [
    ...linha(
      'reservaEmergencia',
      CATEGORIA_LABELS.reservaEmergencia,
      porCategoria.reservaEmergencia,
    ),
    ...linha(
      'reservaOportunidade',
      CATEGORIA_LABELS.reservaOportunidade,
      porCategoria.reservaOportunidade,
    ),
    ...linha('rendaFixaAltaLiquidez', 'Renda Fixa até D+360', rendaFixaAltaLiquidez),
    ...linha('fundosAltaLiquidez', 'Fundos até D+360', fundosAltaLiquidez),
    ...linha('caixaParaInvestir', 'Caixa para investir', caixaParaInvestir),
  ];
  const baixaLiquidez: ComposicaoLinha[] = [
    ...linha('rendaFixaBaixaLiquidez', 'Renda Fixa acima de D+360', rendaFixaBaixaLiquidez),
    ...CATEGORIAS_BAIXA_LIQUIDEZ.flatMap((cat) =>
      cat === 'fimFia'
        ? linha(cat, 'Fundos acima de D+360 (ou sem prazo informado)', fundosBaixaLiquidez)
        : linha(cat, CATEGORIA_LABELS[cat] ?? cat, porCategoria[cat]),
    ),
  ];

  return {
    asOf: now.toISOString(),
    indicadores,
    fontes: {
      cashflow: { year: cashflowYear, activeMonths: averages.activeMonths },
      inflacao: inflacao12m != null ? 'ipca-12m' : 'fallback',
      idade: plano?.idade ?? null,
      idadeAlvo: plano?.apos ?? null,
    },
    config,
    composicao: { altaLiquidez, baixaLiquidez, passivos },
  };
}

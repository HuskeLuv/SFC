import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { getIndicator } from '@/services/market/marketIndicatorService';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { Prisma } from '@prisma/client';
import { deleteTtlCacheKeyPrefix, getTtlCache } from '@/lib/simpleTtlCache';
import { applyChartAggregation } from '@/services/portfolio/portfolioSeriesAggregation';
import { loadHistoricoFromSnapshots } from '@/services/portfolio/portfolioSnapshotReader';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import {
  buildDailyTimeline,
  buildDailyPriceMap,
  buildPatrimonioHistorico,
  filterInvestmentsExclReservas,
  getRawPatrimonioTimelineStart,
  normalizeDateStart,
} from '@/services/portfolio/patrimonioHistoricoBuilder';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const DAY_MS = 24 * 60 * 60 * 1000;
const resumoCache = getTtlCache<Record<string, unknown>>('carteiraResumo');

type FixedIncomeAssetWithAsset = {
  id: string;
  userId: string;
  assetId: string;
  type: string;
  description: string;
  startDate: Date;
  maturityDate: Date;
  investedAmount: number;
  annualRate: number;
  indexer: string | null;
  indexerPercent: number | null;
  liquidityType: string | null;
  taxExempt: boolean;
  asset: { symbol: string; name: string; type?: string | null } | null;
};

/**
 * Valor atual de renda fixa, com a mesma prioridade da aba Renda Fixa:
 *   1. Marcação na curva (CDI/IPCA/Tesouro PU) quando produz valor > investedAmount,
 *      indicando rendimento real acumulado. Senão a curva é descartada.
 *   2. Edição manual (avgPrice * quantity), se informada.
 *   3. Fallback para o valor calculado (pode ser igual a investedAmount).
 *
 * Apenas comparar `avgPrice > 0` não basta: na criação, avgPrice é setado para
 * valorAplicado e quantity=1 — sem este predicado a curva nunca seria usada.
 */
const getFixedIncomeCurrentValue = (
  fixedIncome: FixedIncomeAssetWithAsset | null,
  portfolioItem: { avgPrice: number; quantity: number },
  pricerGetCurrentValue: (fi: FixedIncomeAssetWithAsset) => number,
): number => {
  if (!fixedIncome) return 0;
  const valorCalculado = pricerGetCurrentValue(fixedIncome);
  if (valorCalculado > fixedIncome.investedAmount) return valorCalculado;
  const valorEditado =
    portfolioItem.avgPrice > 0 && portfolioItem.quantity > 0
      ? portfolioItem.avgPrice * portfolioItem.quantity
      : 0;
  return valorEditado > 0 ? valorEditado : valorCalculado;
};

const runPatrimonioScenarioTest = () => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const start = normalizeDateStart(new Date(2025, 0, 29));
  const end = normalizeDateStart(new Date(2025, 1, 5));
  const timeline = buildDailyTimeline(start, end);

  const dayKey = start.getTime();
  const compras = [
    { symbol: 'ITUB4', quantity: 10, price: 30, day: dayKey },
    { symbol: 'VALE3', quantity: 5, price: 60, day: dayKey },
  ];

  const cashDeltasByDay = new Map<number, number>();
  const appliedDeltasByDay = new Map<number, number>();
  const aportesByDay = new Map<number, number>();
  const rendimentosByDay = new Map<number, number>();
  const txDeltasBySymbol = new Map<string, Map<number, number>>();
  const priceHistoryBySymbol = new Map<string, Array<{ date: number; value: number }>>();

  const totalCompras = compras.reduce((sum, compra) => sum + compra.quantity * compra.price, 0);
  cashDeltasByDay.set(dayKey, -totalCompras);
  appliedDeltasByDay.set(dayKey, totalCompras);
  aportesByDay.set(dayKey, totalCompras);
  rendimentosByDay.set(dayKey + DAY_MS * 2, 50);

  compras.forEach((compra) => {
    if (!txDeltasBySymbol.has(compra.symbol)) {
      txDeltasBySymbol.set(compra.symbol, new Map());
    }
    const deltas = txDeltasBySymbol.get(compra.symbol)!;
    deltas.set(compra.day, (deltas.get(compra.day) || 0) + compra.quantity);

    if (!priceHistoryBySymbol.has(compra.symbol)) {
      priceHistoryBySymbol.set(compra.symbol, []);
    }
    priceHistoryBySymbol
      .get(compra.symbol)!
      .push(
        { date: compra.day, value: compra.price },
        { date: compra.day + DAY_MS, value: compra.price + 1 },
      );
  });

  const priceMapBySymbol = new Map<string, Map<number, number>>();
  for (const [symbol, history] of priceHistoryBySymbol.entries()) {
    priceMapBySymbol.set(symbol, buildDailyPriceMap(history, timeline));
  }

  const quantitiesBySymbol = new Map<string, number>();
  txDeltasBySymbol.forEach((_value, symbol) => {
    quantitiesBySymbol.set(symbol, 0);
  });

  let cashBalance = 0;
  let valorAplicado = 0;
  let rendimentosAcumulados = 0;
  const patrimonioSeries: Array<{ data: number; valorAplicado: number; saldoBruto: number }> = [];

  for (const day of timeline) {
    cashBalance += aportesByDay.get(day) || 0;
    cashBalance += cashDeltasByDay.get(day) || 0;
    valorAplicado += appliedDeltasByDay.get(day) || 0;
    if (rendimentosByDay.has(day)) {
      const rendimento = rendimentosByDay.get(day) || 0;
      cashBalance += rendimento;
      rendimentosAcumulados += rendimento;
    }

    txDeltasBySymbol.forEach((deltas, symbol) => {
      const delta = deltas.get(day) || 0;
      quantitiesBySymbol.set(symbol, (quantitiesBySymbol.get(symbol) || 0) + delta);
    });

    let patrimonio = cashBalance + rendimentosAcumulados;
    quantitiesBySymbol.forEach((quantity, symbol) => {
      const price = priceMapBySymbol.get(symbol)?.get(day);
      if (!price || price <= 0) return;
      patrimonio += quantity * price;
    });

    patrimonioSeries.push({ data: day, valorAplicado, saldoBruto: patrimonio });
  }

  const minPatrimonio = Math.min(...patrimonioSeries.map((ponto) => ponto.saldoBruto));
  const aplicadoFinal = patrimonioSeries[patrimonioSeries.length - 1]?.valorAplicado ?? 0;
  const appliedNeverDecreases = patrimonioSeries.every((ponto, index, arr) => {
    if (index === 0) return true;
    return ponto.valorAplicado >= arr[index - 1].valorAplicado;
  });
  const valid =
    Number.isFinite(minPatrimonio) &&
    minPatrimonio >= 0 &&
    aplicadoFinal === totalCompras &&
    appliedNeverDecreases;
  if (!valid) {
    console.warn('[Patrimonio] cenário de teste inválido', {
      minPatrimonio,
      aplicadoFinal,
      totalCompras,
      appliedNeverDecreases,
    });
  } else {
    console.info('[Patrimonio] cenário OK', { minPatrimonio, aplicadoFinal });
  }
};

export const GET = withErrorHandler(async (request: NextRequest) => {
  runPatrimonioScenarioTest();
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

  const { searchParams } = new URL(request.url);
  const twrStartDateParam = searchParams.get('twrStartDate');
  const twrStartDate = twrStartDateParam ? parseInt(twrStartDateParam, 10) : undefined;
  const includeHistorico = searchParams.get('includeHistorico') !== 'false';
  const usePortfolioSnapshots = process.env.USE_PORTFOLIO_SNAPSHOTS === 'true';
  const resumoCacheKey = `${targetUserId}:ih=${includeHistorico}:twr=${twrStartDate ?? ''}`;

  if (usePortfolioSnapshots) {
    const cached = resumoCache.get(resumoCacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  // Registrar acesso se estiver personificado
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/carteira/resumo',
    'GET',
  );

  // Paralelizar queries iniciais para reduzir tempo de carregamento
  const [
    user,
    portfolio,
    fixedIncomeResult,
    investmentGroupsTemplate,
    investmentGroupsCustom,
    dashboardMetrics,
    stockTransactions,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetUserId } }),
    prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
    }),
    (async (): Promise<FixedIncomeAssetWithAsset[]> => {
      try {
        return (await prisma.fixedIncomeAsset.findMany({
          where: { userId: targetUserId },
          include: { asset: true },
        })) as FixedIncomeAssetWithAsset[];
      } catch (error) {
        const prismaError = error as Prisma.PrismaClientKnownRequestError;
        if (prismaError?.code !== 'P2021') throw error;
        return [];
      }
    })(),
    prisma.cashflowGroup.findMany({
      where: { userId: null, type: 'investimento' },
      include: {
        items: {
          include: {
            values: {
              where: { userId: targetUserId, year: new Date().getFullYear() },
            },
          },
        },
      },
    }),
    prisma.cashflowGroup.findMany({
      where: { userId: targetUserId, type: 'investimento' },
      include: {
        items: {
          include: {
            values: {
              where: { userId: targetUserId, year: new Date().getFullYear() },
            },
          },
        },
      },
    }),
    prisma.dashboardData.findMany({
      where: {
        userId: targetUserId,
        metric: {
          in: [
            'meta_patrimonio',
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
          ],
        },
      },
    }),
    prisma.stockTransaction.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const fixedIncomeAssets = fixedIncomeResult;

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const fixedIncomeByAssetId = new Map<string, FixedIncomeAssetWithAsset>();
  fixedIncomeAssets.forEach((fixedIncome) => {
    fixedIncomeByAssetId.set(fixedIncome.assetId, fixedIncome);
  });

  // Pricer compartilhado para marcação na curva (CDI/IPCA/Tesouro PU). Reutilizado em
  // todas as iterações do portfolio para que CDB/LCI/LCA/Tesouro tenham o mesmo valor
  // atual em qualquer aba (resumo, reservas, FIM/FIA, renda fixa).
  const fiPricer = await createFixedIncomePricer(targetUserId, {
    preloadedAssets: fixedIncomeAssets,
  });

  // Mesclar grupos (personalizações têm prioridade)
  const allInvestmentGroups = [...investmentGroupsCustom];
  const templateMap = new Map(investmentGroupsTemplate.map((g) => [g.name, g]));
  investmentGroupsCustom.forEach((custom) => templateMap.delete(custom.name));
  allInvestmentGroups.push(...Array.from(templateMap.values()));

  // Coletar todos os itens de investimento
  const investments = allInvestmentGroups.flatMap((group) => group.items || []);

  // Itens de reserva no cashflow não devem ser somados - já estão no portfolio (evita duplicação)
  const investmentsExclReservas = filterInvestmentsExclReservas(investments);

  // Buscar cotações atuais dos ativos no portfolio
  // Excluir símbolos de reserva, imóveis/bens e personalizados pois são assets manuais sem cotações externas
  const symbols = portfolio
    .map((item) => {
      // Não incluir imóveis/bens e personalizados na busca de cotações
      if (item.asset && (item.asset.type === 'imovel' || item.asset.type === 'personalizado')) {
        return null;
      }
      if (item.assetId && fixedIncomeByAssetId.has(item.assetId)) {
        return null;
      }
      if (item.asset) {
        return item.asset.symbol;
      } else if (item.stock) {
        return item.stock.ticker;
      }
      return null;
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

  // Buscar cotações e dólar em paralelo
  const [quotesResult, dolarIndicator] = await Promise.all([
    getAssetPrices(symbols, { useBrapiFallback: true }),
    getIndicator('USD-BRL', { useBrapiFallback: true }).catch(() => null),
  ]);
  const quotes = quotesResult;
  const cotacaoDolar = dolarIndicator?.price ?? null;

  const toBRL = (valor: number, currency: string | null | undefined): number => {
    if (currency === 'USD' && cotacaoDolar != null && cotacaoDolar > 0) {
      return valor * cotacaoDolar;
    }
    return valor;
  };

  // Inicializar contadores para cada categoria (antes do loop)
  const categorias = {
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

  // Calcular totais do portfolio de ações
  const stocksTotalInvested = portfolio.reduce((sum, item) => sum + item.totalInvested, 0);

  // Calcular valor atual usando cotações da brapi.dev
  let stocksCurrentValue = 0;
  for (const item of portfolio) {
    const symbol = item.asset?.symbol || item.stock?.ticker;
    const fixedIncome = item.assetId ? fixedIncomeByAssetId.get(item.assetId) : null;
    const isReserva =
      item.asset?.type === 'emergency' ||
      item.asset?.type === 'opportunity' ||
      item.asset?.symbol?.startsWith('RESERVA-EMERG') ||
      item.asset?.symbol?.startsWith('RESERVA-OPORT');
    const isImovelBem = item.asset?.type === 'imovel';
    const isPersonalizado =
      item.asset?.type === 'personalizado' || item.asset?.symbol?.startsWith('PERSONALIZADO');

    // Para reservas, não buscar cotação na brapi
    // Usar totalInvested (atualizado quando usuário edita) ou quantity*avgPrice como fallback
    if (isReserva) {
      const valorReserva =
        item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
      stocksCurrentValue += valorReserva;
      // Categorias são preenchidas no loop "Categorizar portfolio" abaixo - não duplicar aqui
    } else if (fixedIncome) {
      stocksCurrentValue += getFixedIncomeCurrentValue(fixedIncome, item, fiPricer.getCurrentValue);
    } else if (isImovelBem || isPersonalizado) {
      // Imóveis e bens + Personalizados: usar totalInvested (valor atualizado manualmente) ou quantity * avgPrice
      const valorImovel =
        item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
      // Não adicionar ao stocksCurrentValue (será contabilizado separadamente)
      categorias.imoveisBens += valorImovel;
    } else if (symbol) {
      const currentPrice = quotes.get(symbol);
      const currency = item.asset?.currency ?? (item.stock ? 'BRL' : 'BRL');
      let valorItem = currentPrice ? item.quantity * currentPrice : item.quantity * item.avgPrice;
      // Crypto/currency/metal/commodity: getAssetPrices já devolve em BRL, não converter
      const tiposPrecoEmBRL = ['crypto', 'currency', 'metal', 'commodity'];
      const valorJaEmBRL = currentPrice != null && tiposPrecoEmBRL.includes(item.asset?.type || '');
      if (!valorJaEmBRL) {
        valorItem = toBRL(valorItem, currency);
      }
      stocksCurrentValue += valorItem;
    } else {
      // Para outros casos, usar quantity * avgPrice
      stocksCurrentValue += item.quantity * item.avgPrice;
    }
  }

  // Calcular totais dos outros investimentos (excluindo reservas - já estão no portfolio)
  const otherInvestmentsTotalInvested = investmentsExclReservas.reduce((sum, item) => {
    const totalValues = (item.values || []).reduce(
      (sumValues, value) => sumValues + value.value,
      0,
    );
    return sum + totalValues;
  }, 0);

  // Usar valor investido como valor atual (sem variação simulada)
  const otherInvestmentsCurrentValue = otherInvestmentsTotalInvested;

  // Totais consolidados
  const valorAplicado = stocksTotalInvested + otherInvestmentsTotalInvested;
  const saldoBruto = stocksCurrentValue + otherInvestmentsCurrentValue;
  const rentabilidade =
    valorAplicado > 0 ? ((saldoBruto - valorAplicado) / valorAplicado) * 100 : 0;

  // dashboardMetrics já carregado em paralelo acima
  const metaPatrimonio = dashboardMetrics.find((item) => item.metric === 'meta_patrimonio');

  // Buscar caixa para investir consolidado (não é mais a soma dos outros)
  const caixaParaInvestirConsolidado = dashboardMetrics.find(
    (item) => item.metric === 'caixa_para_investir_consolidado',
  );
  const caixaParaInvestir = caixaParaInvestirConsolidado?.value || 0;

  // stockTransactions já carregado em paralelo acima

  // Buscar investimentos em cashflow para gerar histórico real (excluindo reservas)
  const cashflowInvestments = investmentsExclReservas;

  const historicoPatrimonio: Array<{ data: number; valorAplicado: number; saldoBruto: number }> =
    [];
  const historicoTWR: Array<{ data: number; value: number }> = [];
  let historicoTWRPeriodo: Array<{ data: number; value: number }> = [];

  const hasHistoricoData =
    stockTransactions.length > 0 || cashflowInvestments.length > 0 || portfolio.length > 0;

  if (hasHistoricoData && includeHistorico) {
    const hoje = normalizeDateStart(new Date());
    const saldoBrutoAtual = Math.round((saldoBruto > 0 ? saldoBruto : valorAplicado) * 100) / 100;
    const valorAplicadoAtual = Math.round(valorAplicado * 100) / 100;

    const rawTimelineStart = getRawPatrimonioTimelineStart(
      stockTransactions,
      portfolio,
      cashflowInvestments,
      fixedIncomeAssets,
      new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1),
    );

    let usedSnapshots = false;
    if (usePortfolioSnapshots) {
      const snap = await loadHistoricoFromSnapshots(targetUserId, rawTimelineStart, hoje, {
        liveSaldoBruto: saldoBrutoAtual,
        liveValorAplicado: valorAplicadoAtual,
        twrStartDate,
      });
      if (snap.coverageOk && snap.historicoPatrimonio.length > 0) {
        const startMs = snap.historicoPatrimonio[0]?.data ?? rawTimelineStart.getTime();
        const endMs =
          snap.historicoPatrimonio[snap.historicoPatrimonio.length - 1]?.data ?? hoje.getTime();
        const agg = applyChartAggregation(
          snap.historicoPatrimonio,
          snap.historicoTWR,
          startMs,
          endMs,
        );
        historicoPatrimonio.push(...agg.historicoPatrimonio);
        historicoTWR.push(...agg.historicoTWR);
        historicoTWRPeriodo = snap.historicoTWRPeriodo;
        usedSnapshots = true;
      }
    }

    if (!usedSnapshots) {
      const built = await buildPatrimonioHistorico({
        portfolio,
        fixedIncomeAssets,
        stockTransactions,
        investmentsExclReservas: cashflowInvestments,
        saldoBrutoAtual: saldoBruto,
        valorAplicadoAtual: valorAplicado,
        twrStartDate,
        maxHistoricoMonths: 24,
        patchLastDayWithLiveTotals: true,
        fixedIncomeValueSeriesBuilder: fiPricer.buildValueSeriesForAsset,
      });
      if (usePortfolioSnapshots) {
        const startMs = built.historicoPatrimonio[0]?.data ?? hoje.getTime();
        const endMs =
          built.historicoPatrimonio[built.historicoPatrimonio.length - 1]?.data ?? hoje.getTime();
        const agg = applyChartAggregation(
          built.historicoPatrimonio,
          built.historicoTWR,
          startMs,
          endMs,
        );
        historicoPatrimonio.push(...agg.historicoPatrimonio);
        historicoTWR.push(...agg.historicoTWR);
      } else {
        historicoPatrimonio.push(...built.historicoPatrimonio);
        historicoTWR.push(...built.historicoTWR);
      }
      historicoTWRPeriodo = built.historicoTWRPeriodo;
    }
  }

  // Placeholder quando não há dados ou includeHistorico=false (carregamento rápido)
  if (historicoPatrimonio.length === 0) {
    const hoje = new Date();
    const saldo = Math.round(saldoBruto * 100) / 100;
    const aplicado = Math.round(valorAplicado * 100) / 100;
    for (let i = 11; i >= 0; i--) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      historicoPatrimonio.push({
        data: data.getTime(),
        valorAplicado: aplicado,
        saldoBruto: saldo,
      });
    }
    historicoTWR.push(
      ...historicoPatrimonio.map((item, i) => ({ data: item.data, value: i === 0 ? 0 : 0 })),
    );
  }

  // categorias já foi inicializado antes do loop do portfolio

  // Batch lookup de assets para itens sem item.asset (evita N+1)
  const symbolsNeedingAsset = [
    ...new Set(
      portfolio
        .filter((item) => !item.asset && item.stock?.ticker)
        .map((item) => (item.stock?.ticker ?? '').trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const assetsBySymbol =
    symbolsNeedingAsset.length > 0
      ? new Map(
          (
            await prisma.asset.findMany({
              where: { symbol: { in: symbolsNeedingAsset } },
              select: { symbol: true, type: true, currency: true, name: true },
            })
          ).map((a) => [a.symbol.toUpperCase(), a]),
        )
      : new Map<
          string,
          { symbol: string; type: string | null; currency: string | null; name: string | null }
        >();

  // Catalog Tesouro Direto compartilha asset.type='tesouro-direto' entre usuários;
  // a intenção de colocá-lo numa reserva fica registrada em transaction.notes.tesouroDestino.
  const tesouroReservaDestinoByAssetId = new Map<string, 'emergencia' | 'oportunidade'>();
  for (const tx of stockTransactions) {
    if (tx.type !== 'compra' || !tx.assetId || !tx.notes) continue;
    if (tesouroReservaDestinoByAssetId.has(tx.assetId)) continue;
    try {
      const parsed = JSON.parse(tx.notes);
      if (parsed?.tesouroDestino === 'reserva-oportunidade') {
        tesouroReservaDestinoByAssetId.set(tx.assetId, 'oportunidade');
      } else if (parsed?.tesouroDestino === 'reserva-emergencia') {
        tesouroReservaDestinoByAssetId.set(tx.assetId, 'emergencia');
      }
    } catch {
      // ignora notas malformadas
    }
  }

  // Categorizar portfolio baseado no tipo do ativo
  for (const item of portfolio) {
    const symbol = item.asset?.symbol || item.stock?.ticker;
    if (!symbol) continue;

    const asset = item.asset ?? assetsBySymbol.get(symbol.trim().toUpperCase()) ?? null;
    const fixedIncome = item.assetId ? fixedIncomeByAssetId.get(item.assetId) : null;
    const tesouroReservaDestino = item.assetId
      ? tesouroReservaDestinoByAssetId.get(item.assetId)
      : undefined;

    // Calcular valor atual com cotação
    const isReserva =
      asset?.type === 'emergency' ||
      asset?.type === 'opportunity' ||
      symbol?.startsWith('RESERVA-EMERG') ||
      symbol?.startsWith('RESERVA-OPORT') ||
      tesouroReservaDestino !== undefined;
    const currentPrice = quotes.get(symbol);
    const valorAtual = fixedIncome
      ? getFixedIncomeCurrentValue(fixedIncome, item, fiPricer.getCurrentValue)
      : currentPrice && !isReserva
        ? item.quantity * currentPrice
        : isReserva && item.avgPrice && item.avgPrice > 0 && item.quantity > 0
          ? item.quantity * item.avgPrice
          : item.totalInvested > 0
            ? item.totalInvested
            : item.quantity * item.avgPrice; // Reservas: alinhado com reserva-oportunidade (avgPrice*quantity quando editado)

    // Converter USD → BRL (tabela de alocação exibe tudo em R$).
    // Crypto/currency/metal/commodity: getAssetPrices já devolve em BRL.
    const currency = asset?.currency ?? (item.stock ? 'BRL' : 'BRL');
    const tiposPrecoEmBRL = ['crypto', 'currency', 'metal', 'commodity'];
    const valorJaEmBRL =
      currentPrice != null && !isReserva && tiposPrecoEmBRL.includes(asset?.type || '');
    const valorAtualBRL = valorJaEmBRL ? valorAtual : toBRL(valorAtual, currency);

    if (asset) {
      const tipo = asset.type?.toLowerCase() || '';

      // Verificar se é reserva antes de categorizar
      if (isReserva) {
        if (tesouroReservaDestino === 'oportunidade') {
          categorias.reservaOportunidade += valorAtualBRL;
        } else if (tesouroReservaDestino === 'emergencia') {
          categorias.reservaEmergencia += valorAtualBRL;
        } else if (tipo === 'opportunity' || symbol?.startsWith('RESERVA-OPORT')) {
          categorias.reservaOportunidade += valorAtualBRL;
        } else if (tipo === 'emergency' || symbol?.startsWith('RESERVA-EMERG')) {
          categorias.reservaEmergencia += valorAtualBRL;
        }
      } else {
        // Só incluir em acoes itens que aparecem na aba Ações (stockId + ticker não 11)
        const isAcaoTabItem =
          item.stockId && item.stock && !item.stock.ticker.toUpperCase().endsWith('11');
        switch (tipo) {
          case 'ação':
          case 'acao':
          case 'stock': {
            if (asset.currency === 'BRL') {
              if (isAcaoTabItem) {
                categorias.acoes += valorAtualBRL;
              } else {
                categorias.rendaFixaFundos += valorAtualBRL; // asset acao sem stockId: evita valor fantasma
              }
            } else {
              categorias.stocks += valorAtualBRL;
            }
            break;
          }
          case 'bdr':
          case 'brd':
            if (isAcaoTabItem) {
              categorias.acoes += valorAtualBRL;
            } else {
              categorias.rendaFixaFundos += valorAtualBRL;
            }
            break;
          case 'fii':
            categorias.fiis += valorAtualBRL;
            break;
          case 'fund':
          case 'funds': {
            const symbolUpper = symbol.toUpperCase();
            const nameLower = (asset.name || '').toLowerCase();
            if (
              symbolUpper.endsWith('11') ||
              nameLower.includes('fii') ||
              nameLower.includes('imobili')
            ) {
              categorias.fiis += valorAtualBRL;
            } else {
              categorias.fimFia += valorAtualBRL;
            }
            break;
          }
          case 'etf':
            categorias.etfs += valorAtualBRL;
            break;
          case 'reit':
            categorias.reits += valorAtualBRL;
            break;
          case 'crypto':
            categorias.moedasCriptos += valorAtualBRL;
            break;
          case 'bond':
            categorias.rendaFixaFundos += valorAtualBRL;
            break;
          case 'insurance':
            categorias.previdenciaSeguros += valorAtualBRL;
            break;
          case 'currency':
            categorias.moedasCriptos += valorAtualBRL;
            break;
          case 'cash':
            categorias.reservaOportunidade += valorAtualBRL;
            break;
          case 'emergency':
            categorias.reservaEmergencia += valorAtualBRL;
            break;
          case 'opportunity':
            categorias.reservaOportunidade += valorAtualBRL;
            break;
          case 'custom':
          case 'personalizado':
            // Personalizado não deve aparecer no gráfico de tipos de investimento (vai para Imóveis e Bens)
            break;
          case 'imovel':
            // Imóveis e bens não devem aparecer no gráfico de tipos de investimento
            break;
          case 'metal':
          case 'commodity':
            categorias.moedasCriptos += valorAtualBRL;
            break;
          case 'previdencia':
            categorias.previdenciaSeguros += valorAtualBRL;
            break;
          case 'opcao':
            categorias.opcoes += valorAtualBRL;
            break;
          default:
            // Tipos desconhecidos NÃO devem ir para acoes (evita valores fantasmas)
            // Verificar reserva pelo símbolo; demais vão para renda fixa (conservador)
            if (symbol?.startsWith('RESERVA-OPORT')) {
              categorias.reservaOportunidade += valorAtualBRL;
            } else if (symbol?.startsWith('RESERVA-EMERG')) {
              categorias.reservaEmergencia += valorAtualBRL;
            } else if (symbol?.toUpperCase().endsWith('11')) {
              categorias.fiis += valorAtualBRL;
            } else {
              // Antes: acoes (causava 8787 e outros fantasmas). Agora: renda fixa
              categorias.rendaFixaFundos += valorAtualBRL;
            }
        }
      }
    } else {
      // Portfolio com stockId (Stock table) sem Asset correspondente - alinhado com tabs Ações/FII
      // Ações: stockId + ticker NÃO termina em 11 | FIIs: stockId + ticker termina em 11
      const tickerUpper = symbol?.toUpperCase() ?? '';
      if (symbol?.startsWith('RESERVA-OPORT')) {
        categorias.reservaOportunidade += valorAtualBRL;
      } else if (symbol?.startsWith('RESERVA-EMERG')) {
        categorias.reservaEmergencia += valorAtualBRL;
      } else if (tickerUpper.endsWith('11')) {
        categorias.fiis += valorAtualBRL; // FIIs terminam em 11 (ex: HGLG11)
      } else {
        categorias.acoes += valorAtualBRL; // Ações brasileiras (ex: PETR4, VALE3)
      }
    }
  }

  // Não incluir investimentos de cashflow na distribuição de alocação - evita valores fantasmas
  // A tabela de alocação reflete apenas portfolio real + caixa para investir
  // categorizedInvestments (cashflow) pode ter valores de planejamento que não correspondem ao patrimônio real

  // Buscar caixa para investir de cada tab e adicionar aos valores calculados
  // Isso garante que os valores incluam o caixa para investir de cada tab
  const caixaAcoes =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_acoes')?.value || 0;
  const caixaFii =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_fii')?.value || 0;
  const caixaEtf =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_etf')?.value || 0;
  const caixaReit =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_reit')?.value || 0;
  const caixaStocks =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_stocks')?.value || 0;
  const caixaMoedasCriptos =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_moedas_criptos')?.value ||
    0;
  const caixaPrevidenciaSeguros =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_previdencia_seguros')
      ?.value || 0;
  const caixaOpcoes =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_opcoes')?.value || 0;
  const caixaFimFia =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_fim_fia')?.value || 0;
  const caixaRendaFixa =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_renda_fixa')?.value || 0;

  // Adicionar caixas aos valores das categorias (que já foram calculados acima)
  categorias.acoes += caixaAcoes;
  categorias.fiis += caixaFii;
  categorias.etfs += caixaEtf;
  categorias.reits += caixaReit;
  categorias.stocks += caixaStocks;
  categorias.moedasCriptos += caixaMoedasCriptos;
  categorias.previdenciaSeguros += caixaPrevidenciaSeguros;
  categorias.opcoes += caixaOpcoes;
  categorias.fimFia += caixaFimFia;
  categorias.rendaFixaFundos += caixaRendaFixa;

  // Calcular total para percentuais
  const totalCategorizado = Object.values(categorias).reduce((sum, valor) => sum + valor, 0);

  // Se não há investimentos categorizados, usar valor bruto como base
  const baseValue = totalCategorizado > 0 ? totalCategorizado : saldoBruto;

  // Distribuição por tipo de investimento com dados reais
  const distribuicao = {
    reservaEmergencia: {
      valor: Math.round(categorias.reservaEmergencia * 100) / 100,
      percentual:
        baseValue > 0 ? Math.round((categorias.reservaEmergencia / baseValue) * 10000) / 100 : 0,
    },
    reservaOportunidade: {
      valor: Math.round(categorias.reservaOportunidade * 100) / 100,
      percentual:
        baseValue > 0 ? Math.round((categorias.reservaOportunidade / baseValue) * 10000) / 100 : 0,
    },
    rendaFixaFundos: {
      valor: Math.round(categorias.rendaFixaFundos * 100) / 100,
      percentual:
        baseValue > 0 ? Math.round((categorias.rendaFixaFundos / baseValue) * 10000) / 100 : 0,
    },
    fimFia: {
      valor: Math.round(categorias.fimFia * 100) / 100,
      percentual: baseValue > 0 ? Math.round((categorias.fimFia / baseValue) * 10000) / 100 : 0,
    },
    fiis: {
      valor: Math.round(categorias.fiis * 100) / 100,
      percentual: baseValue > 0 ? Math.round((categorias.fiis / baseValue) * 10000) / 100 : 0,
    },
    acoes: {
      valor: Math.round(categorias.acoes * 100) / 100,
      percentual: baseValue > 0 ? Math.round((categorias.acoes / baseValue) * 10000) / 100 : 0,
    },
    stocks: {
      valor: Math.round(categorias.stocks * 100) / 100,
      percentual: baseValue > 0 ? Math.round((categorias.stocks / baseValue) * 10000) / 100 : 0,
    },
    reits: {
      valor: Math.round(categorias.reits * 100) / 100,
      percentual: baseValue > 0 ? Math.round((categorias.reits / baseValue) * 10000) / 100 : 0,
    },
    etfs: {
      valor: Math.round(categorias.etfs * 100) / 100,
      percentual: baseValue > 0 ? Math.round((categorias.etfs / baseValue) * 10000) / 100 : 0,
    },
    moedasCriptos: {
      valor: Math.round(categorias.moedasCriptos * 100) / 100,
      percentual:
        baseValue > 0 ? Math.round((categorias.moedasCriptos / baseValue) * 10000) / 100 : 0,
    },
    previdenciaSeguros: {
      valor: Math.round(categorias.previdenciaSeguros * 100) / 100,
      percentual:
        baseValue > 0 ? Math.round((categorias.previdenciaSeguros / baseValue) * 10000) / 100 : 0,
    },
    opcoes: {
      valor: Math.round(categorias.opcoes * 100) / 100,
      percentual: baseValue > 0 ? Math.round((categorias.opcoes / baseValue) * 10000) / 100 : 0,
    },
    imoveisBens: {
      valor: Math.round(categorias.imoveisBens * 100) / 100,
      percentual:
        baseValue > 0 ? Math.round((categorias.imoveisBens / baseValue) * 10000) / 100 : 0,
    },
  };

  const resumo: Record<string, unknown> = {
    saldoBruto: Math.round(saldoBruto * 100) / 100,
    valorAplicado: Math.round(valorAplicado * 100) / 100,
    rentabilidade: Math.round(rentabilidade * 100) / 100,
    metaPatrimonio: metaPatrimonio?.value || 0,
    caixaParaInvestir: caixaParaInvestir || 0,
    historicoPatrimonio,
    historicoTWR,
    distribuicao,
    portfolioDetalhes: {
      totalAcoes: portfolio.length,
      totalInvestimentos: investments.length,
      stocksTotalInvested: Math.round(stocksTotalInvested * 100) / 100,
      stocksCurrentValue: Math.round(stocksCurrentValue * 100) / 100,
      otherInvestmentsTotalInvested: Math.round(otherInvestmentsTotalInvested * 100) / 100,
      otherInvestmentsCurrentValue: Math.round(otherInvestmentsCurrentValue * 100) / 100,
    },
  };

  if (historicoTWRPeriodo.length > 0) {
    resumo.historicoTWRPeriodo = historicoTWRPeriodo;
  }

  if (usePortfolioSnapshots) {
    const ttlMs = Number.parseInt(process.env.CARTEIRA_RESUMO_CACHE_MS ?? '60000', 10);
    resumoCache.set(resumoCacheKey, resumo, Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60_000);
  }

  return NextResponse.json(resumo);
});

// POST para atualizar meta de patrimônio ou caixa para investir consolidado
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const { metaPatrimonio, caixaParaInvestir } = await request.json();

  // Atualizar caixa para investir consolidado
  if (caixaParaInvestir !== undefined) {
    if (typeof caixaParaInvestir !== 'number' || caixaParaInvestir < 0) {
      return NextResponse.json(
        {
          error: 'Caixa para investir deve ser um valor igual ou maior que zero',
        },
        { status: 400 },
      );
    }

    const existingCaixa = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_consolidado',
      },
    });

    if (existingCaixa) {
      await prisma.dashboardData.update({
        where: { id: existingCaixa.id },
        data: { value: caixaParaInvestir },
      });
    } else {
      await prisma.dashboardData.create({
        data: {
          userId: targetUserId,
          metric: 'caixa_para_investir_consolidado',
          value: caixaParaInvestir,
        },
      });
    }

    deleteTtlCacheKeyPrefix('carteiraResumo', `${targetUserId}:`);

    return NextResponse.json({
      success: true,
      message: 'Caixa para investir atualizado com sucesso',
      caixaParaInvestir,
    });
  }

  // Atualizar meta de patrimônio (código existente)
  if (metaPatrimonio !== undefined) {
    if (typeof metaPatrimonio !== 'number' || metaPatrimonio <= 0) {
      return NextResponse.json(
        {
          error: 'Meta de patrimônio deve ser um valor positivo',
        },
        { status: 400 },
      );
    }

    const existingMeta = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'meta_patrimonio',
      },
    });

    if (existingMeta) {
      await prisma.dashboardData.update({
        where: { id: existingMeta.id },
        data: { value: metaPatrimonio },
      });
    } else {
      await prisma.dashboardData.create({
        data: {
          userId: targetUserId,
          metric: 'meta_patrimonio',
          value: metaPatrimonio,
        },
      });
    }

    deleteTtlCacheKeyPrefix('carteiraResumo', `${targetUserId}:`);

    return NextResponse.json({ success: true, metaPatrimonio });
  }

  return NextResponse.json(
    {
      error: 'Informe metaPatrimonio ou caixaParaInvestir',
    },
    { status: 400 },
  );
});

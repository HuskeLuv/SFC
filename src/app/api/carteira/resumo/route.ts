import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAssetPrices, getAssetHistory } from '@/services/assetPriceService';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { Prisma } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

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

const normalizeDateStart = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const buildDailyTimeline = (startDate: Date, endDate: Date) => {
  const start = normalizeDateStart(startDate).getTime();
  const end = normalizeDateStart(endDate).getTime();
  const timeline: number[] = [];

  for (let day = start; day <= end; day += DAY_MS) {
    timeline.push(day);
  }

  return timeline;
};

const getTransactionValue = (transaction: { total: number; quantity: number; price: number }) => {
  const total = Number(transaction.total);
  if (Number.isFinite(total) && total > 0) {
    return total;
  }

  const fallback = Number(transaction.quantity) * Number(transaction.price);
  return Number.isFinite(fallback) ? fallback : 0;
};

const buildDailyPriceMap = (
  history: Array<{ date: number; value: number }>,
  timeline: number[],
  initialPrice?: number,
) => {
  const sorted = [...history]
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => a.date - b.date);
  const map = new Map<number, number>();

  let lastPrice = Number.isFinite(initialPrice) && initialPrice && initialPrice > 0 ? initialPrice : undefined;
  let historyIndex = 0;

  for (const day of timeline) {
    while (historyIndex < sorted.length) {
      const historyDate = normalizeDateStart(new Date(sorted[historyIndex].date)).getTime();
      if (historyDate > day) break;
      lastPrice = sorted[historyIndex].value;
      historyIndex += 1;
    }

    if (Number.isFinite(lastPrice) && lastPrice && lastPrice > 0) {
      map.set(day, lastPrice);
    }
  }

  return map;
};

const calculateFixedIncomeValue = (fixedIncome: FixedIncomeAssetWithAsset, referenceDate: Date) => {
  const start = normalizeDateStart(new Date(fixedIncome.startDate));
  const maturity = normalizeDateStart(new Date(fixedIncome.maturityDate));
  const current = normalizeDateStart(referenceDate);
  const endDate = current.getTime() > maturity.getTime() ? maturity : current;
  if (endDate.getTime() <= start.getTime()) {
    return fixedIncome.investedAmount;
  }
  const days = Math.floor((endDate.getTime() - start.getTime()) / DAY_MS);
  const rate = fixedIncome.annualRate / 100;
  const valorAtual = fixedIncome.investedAmount * Math.pow(1 + rate, days / 365);
  return Math.round(valorAtual * 100) / 100;
};

const fetchAssetHistoryFromDb = async (
  symbol: string,
  startDate?: Date
): Promise<Array<{ date: number; value: number }>> => {
  const start = startDate
    ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    : new Date(Date.now() - 365 * DAY_MS);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return getAssetHistory(symbol, start, end, { useBrapiFallback: true });
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
    priceHistoryBySymbol.get(compra.symbol)!.push(
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
  const valid = Number.isFinite(minPatrimonio) && minPatrimonio >= 0 && aplicadoFinal === totalCompras && appliedNeverDecreases;
  if (!valid) {
    console.warn('[Patrimonio] cenário de teste inválido', { minPatrimonio, aplicadoFinal, totalCompras, appliedNeverDecreases });
  } else {
    console.info('[Patrimonio] cenário OK', { minPatrimonio, aplicadoFinal });
  }
};

export async function GET(request: NextRequest) {
  try {
    runPatrimonioScenarioTest();
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
    
    // Registrar acesso se estiver personificado
    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      '/api/carteira/resumo',
      'GET',
    );

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar portfolio de ações
    const portfolio = await prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: {
        stock: true,
        asset: true,
      },
    });

    let fixedIncomeAssets: FixedIncomeAssetWithAsset[] = [];
    try {
      fixedIncomeAssets = await prisma.fixedIncomeAsset.findMany({
        where: { userId: targetUserId },
        include: { asset: true },
      }) as FixedIncomeAssetWithAsset[];
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;
      if (prismaError?.code !== 'P2021') {
        throw error;
      }
      fixedIncomeAssets = [];
    }

    const fixedIncomeByAssetId = new Map<string, FixedIncomeAssetWithAsset>();
    fixedIncomeAssets.forEach((fixedIncome) => {
      fixedIncomeByAssetId.set(fixedIncome.assetId, fixedIncome);
    });

    // Buscar investimentos em cashflow (grupos tipo 'investimento')
    // Buscar templates e personalizações
    const investmentGroupsTemplate = await prisma.cashflowGroup.findMany({
      where: {
        userId: null,
        type: 'investimento',
      },
      include: {
        items: {
          include: {
            values: {
              where: {
                userId: targetUserId,
                year: new Date().getFullYear(),
              },
            },
          },
        },
      },
    });

    const investmentGroupsCustom = await prisma.cashflowGroup.findMany({
      where: {
        userId: targetUserId,
        type: 'investimento',
      },
      include: {
        items: {
          include: {
            values: {
              where: {
                userId: targetUserId,
                year: new Date().getFullYear(),
              },
            },
          },
        },
      },
    });

    // Mesclar grupos (personalizações têm prioridade)
    const allInvestmentGroups = [...investmentGroupsCustom];
    const templateMap = new Map(investmentGroupsTemplate.map(g => [g.name, g]));
    investmentGroupsCustom.forEach(custom => templateMap.delete(custom.name));
    allInvestmentGroups.push(...Array.from(templateMap.values()));

    // Coletar todos os itens de investimento
    const investments = allInvestmentGroups.flatMap(group => group.items || []);

    // Buscar cotações atuais dos ativos no portfolio
    // Excluir símbolos de reserva, imóveis/bens e personalizados pois são assets manuais sem cotações externas
    const symbols = portfolio
      .map(item => {
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
      .filter((symbol): symbol is string => 
        symbol !== null && 
        !symbol.startsWith('RESERVA-EMERG') && 
        !symbol.startsWith('RESERVA-OPORT') &&
        !symbol.startsWith('PERSONALIZADO')
      );

    const quotes = await getAssetPrices(symbols, { useBrapiFallback: true });

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
      const isReserva = item.asset?.type === 'emergency' || item.asset?.type === 'opportunity' ||
                        item.asset?.symbol?.startsWith('RESERVA-EMERG') || item.asset?.symbol?.startsWith('RESERVA-OPORT');
      const isImovelBem = item.asset?.type === 'imovel';
      const isPersonalizado = item.asset?.type === 'personalizado' || item.asset?.symbol?.startsWith('PERSONALIZADO');
      
      // Para reservas, não buscar cotação na brapi
      // Imóveis/bens e personalizados serão contabilizados separadamente na categoria imoveisBens
      if (isReserva) {
        // Usar quantity * avgPrice (sem cotação)
        const valorReserva = item.quantity * item.avgPrice;
        stocksCurrentValue += valorReserva;
        // Categorizar reservas
        if (item.asset?.type === 'emergency' || item.asset?.symbol?.startsWith('RESERVA-EMERG')) {
          categorias.reservaEmergencia += valorReserva;
        } else if (item.asset?.type === 'opportunity' || item.asset?.symbol?.startsWith('RESERVA-OPORT')) {
          categorias.reservaOportunidade += valorReserva;
        }
      } else if (fixedIncome) {
        stocksCurrentValue += calculateFixedIncomeValue(fixedIncome, new Date());
      } else if (isImovelBem || isPersonalizado) {
        // Imóveis e bens + Personalizados: usar totalInvested (valor atualizado manualmente) ou quantity * avgPrice
        const valorImovel = item.totalInvested > 0 ? item.totalInvested : (item.quantity * item.avgPrice);
        // Não adicionar ao stocksCurrentValue (será contabilizado separadamente)
        categorias.imoveisBens += valorImovel;
      } else if (symbol) {
        const currentPrice = quotes.get(symbol);
        if (currentPrice) {
          // Valor atual = quantidade * cotação atual
          stocksCurrentValue += item.quantity * currentPrice;
        } else {
          // Se não conseguir a cotação, usar quantity * avgPrice como fallback
          stocksCurrentValue += item.quantity * item.avgPrice;
        }
      } else {
        // Para outros casos, usar quantity * avgPrice
        stocksCurrentValue += item.quantity * item.avgPrice;
      }
    }

    // Calcular totais dos outros investimentos
    const otherInvestmentsTotalInvested = investments.reduce((sum, item) => {
      const totalValues = (item.values || []).reduce((sumValues, value) => sumValues + value.value, 0);
      return sum + totalValues;
    }, 0);

    // Usar valor investido como valor atual (sem variação simulada)
    const otherInvestmentsCurrentValue = otherInvestmentsTotalInvested;

    // Totais consolidados
    const valorAplicado = stocksTotalInvested + otherInvestmentsTotalInvested;
    const saldoBruto = stocksCurrentValue + otherInvestmentsCurrentValue;
    const rentabilidade = valorAplicado > 0 ? ((saldoBruto - valorAplicado) / valorAplicado) * 100 : 0;

    // Buscar métricas de patrimônio (se existir no DashboardData)
    const dashboardMetrics = await prisma.dashboardData.findMany({
      where: {
        userId: targetUserId,
        metric: { 
          in: [
            'meta_patrimonio', 
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
          ] 
        },
      },
    });
    const metaPatrimonio = dashboardMetrics.find((item) => item.metric === 'meta_patrimonio');
    
    // Buscar caixa para investir consolidado (não é mais a soma dos outros)
    const caixaParaInvestirConsolidado = dashboardMetrics.find(
      (item) => item.metric === 'caixa_para_investir_consolidado'
    );
    const caixaParaInvestir = caixaParaInvestirConsolidado?.value || 0;

    // Buscar transações de ações para gerar histórico real
    const stockTransactions = await prisma.stockTransaction.findMany({
      where: { userId: targetUserId },
      include: {
        stock: true,
        asset: true,
      },
      orderBy: { date: 'asc' },
    });

    // Buscar investimentos em cashflow para gerar histórico real
    // Reutilizar os grupos já buscados acima ou buscar novamente
    const cashflowInvestments = investments;

    // Gerar histórico baseado nas transações reais
    const historicoPatrimonio = [];
    
    if (stockTransactions.length > 0 || cashflowInvestments.length > 0 || portfolio.length > 0) {
      const hoje = normalizeDateStart(new Date());

      const portfolioBySymbol = new Map<string, { quantity: number; avgPrice: number; isManual: boolean }>();
      portfolio.forEach((item) => {
        const symbol = item.asset?.symbol || item.stock?.ticker;
        if (!symbol) return;

        const isFixedIncome = item.assetId ? fixedIncomeByAssetId.has(item.assetId) : false;
        const isManual = item.asset?.type === 'emergency' || item.asset?.type === 'opportunity' ||
          item.asset?.type === 'personalizado' || item.asset?.type === 'imovel' ||
          symbol.startsWith('RESERVA-EMERG') || symbol.startsWith('RESERVA-OPORT') || symbol.startsWith('PERSONALIZADO') ||
          isFixedIncome;

        portfolioBySymbol.set(symbol, {
          quantity: item.quantity,
          avgPrice: item.avgPrice,
          isManual,
        });
      });

      const manualValuesByDay = new Map<number, number>();
      cashflowInvestments.forEach((investment) => {
        (investment.values || []).forEach((value) => {
          const day = normalizeDateStart(new Date(value.year, value.month, 1)).getTime();
          manualValuesByDay.set(day, (manualValuesByDay.get(day) || 0) + value.value);
        });
      });

      const transactionsBySymbol = new Map<string, Map<number, number>>();
      const cashDeltasByDay = new Map<number, number>();
      const appliedDeltasByDay = new Map<number, number>();
      const aportesByDay = new Map<number, number>();
      const pricePointsBySymbol = new Map<string, Array<{ date: number; value: number }>>();
      const firstTransactionBySymbol = new Map<string, number>();

      stockTransactions.forEach((transaction) => {
        const symbol = transaction.stock?.ticker || transaction.asset?.symbol;
        if (!symbol) return;

        const day = normalizeDateStart(transaction.date).getTime();
        const qtyDelta = transaction.type === 'compra' ? transaction.quantity : -transaction.quantity;

        if (!transactionsBySymbol.has(symbol)) {
          transactionsBySymbol.set(symbol, new Map());
        }
        const symbolDeltas = transactionsBySymbol.get(symbol)!;
        symbolDeltas.set(day, (symbolDeltas.get(day) || 0) + qtyDelta);

        const totalValue = getTransactionValue(transaction);
        const cashDelta = transaction.type === 'compra' ? -totalValue : totalValue;
        const appliedDelta = transaction.type === 'compra' ? totalValue : -totalValue;
        if (transaction.type === 'compra') {
          aportesByDay.set(day, (aportesByDay.get(day) || 0) + totalValue);
        }
        cashDeltasByDay.set(day, (cashDeltasByDay.get(day) || 0) + cashDelta);
        appliedDeltasByDay.set(day, (appliedDeltasByDay.get(day) || 0) + appliedDelta);

        const priceValue = transaction.price > 0
          ? transaction.price
          : (transaction.quantity > 0 ? totalValue / transaction.quantity : 0);
        if (priceValue > 0) {
          if (!pricePointsBySymbol.has(symbol)) {
            pricePointsBySymbol.set(symbol, []);
          }
          pricePointsBySymbol.get(symbol)!.push({ date: day, value: priceValue });
        }

        if (!firstTransactionBySymbol.has(symbol)) {
          firstTransactionBySymbol.set(symbol, day);
        }
      });

      portfolio.forEach((item) => {
        const symbol = item.asset?.symbol || item.stock?.ticker;
        if (!symbol) return;
        if (transactionsBySymbol.has(symbol)) return;

        const day = normalizeDateStart(item.lastUpdate || new Date()).getTime();
        if (!transactionsBySymbol.has(symbol)) {
          transactionsBySymbol.set(symbol, new Map());
        }
        const symbolDeltas = transactionsBySymbol.get(symbol)!;
        symbolDeltas.set(day, (symbolDeltas.get(day) || 0) + item.quantity);

        const investedValue = item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
        const cashDelta = -investedValue;
        const appliedDelta = investedValue;
        cashDeltasByDay.set(day, (cashDeltasByDay.get(day) || 0) + cashDelta);
        appliedDeltasByDay.set(day, (appliedDeltasByDay.get(day) || 0) + appliedDelta);
        aportesByDay.set(day, (aportesByDay.get(day) || 0) + investedValue);

        if (item.avgPrice > 0) {
          if (!pricePointsBySymbol.has(symbol)) {
            pricePointsBySymbol.set(symbol, []);
          }
          pricePointsBySymbol.get(symbol)!.push({ date: day, value: item.avgPrice });
        }

        if (!firstTransactionBySymbol.has(symbol)) {
          firstTransactionBySymbol.set(symbol, day);
        }
      });

      const allSymbols = new Set<string>([
        ...Array.from(transactionsBySymbol.keys()),
        ...Array.from(portfolioBySymbol.keys()),
      ]);

      const timelineStartCandidates: number[] = [];
      if (stockTransactions.length > 0) {
        timelineStartCandidates.push(normalizeDateStart(stockTransactions[0].date).getTime());
      }
      if (manualValuesByDay.size > 0) {
        timelineStartCandidates.push(Math.min(...Array.from(manualValuesByDay.keys())));
      }
      if (portfolio.length > 0) {
        const earliestPortfolioDate = Math.min(
          ...portfolio
            .map((item) => normalizeDateStart(item.lastUpdate || new Date()).getTime())
            .filter((value) => Number.isFinite(value))
        );
        if (Number.isFinite(earliestPortfolioDate)) {
          timelineStartCandidates.push(earliestPortfolioDate);
        }
      }
      if (fixedIncomeAssets.length > 0) {
        const earliestFixedIncomeDate = Math.min(
          ...fixedIncomeAssets
            .map((item) => normalizeDateStart(new Date(item.startDate)).getTime())
            .filter((value) => Number.isFinite(value))
        );
        if (Number.isFinite(earliestFixedIncomeDate)) {
          timelineStartCandidates.push(earliestFixedIncomeDate);
        }
      }
      const timelineStart = timelineStartCandidates.length > 0
        ? new Date(Math.min(...timelineStartCandidates))
        : new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);

      const timeline = buildDailyTimeline(timelineStart, hoje);

      const fixedIncomePricePointsBySymbol = new Map<string, Array<{ date: number; value: number }>>();
      fixedIncomeAssets.forEach((fixedIncome) => {
        const symbol = fixedIncome.asset?.symbol;
        if (!symbol) return;
        const points = timeline.map((day) => ({
          date: day,
          value: calculateFixedIncomeValue(fixedIncome, new Date(day)),
        }));
        fixedIncomePricePointsBySymbol.set(symbol, points);
      });

      const pricesBySymbol = new Map<string, Map<number, number>>();
      const fallbackPriceBySymbol = new Map<string, number>();
      for (const symbol of allSymbols) {
        const portfolioInfo = portfolioBySymbol.get(symbol);
        const isManual = portfolioInfo?.isManual ?? false;
        const pricePoints = pricePointsBySymbol.get(symbol) || [];
        const fixedIncomePoints = fixedIncomePricePointsBySymbol.get(symbol) || [];

        let history: Array<{ date: number; value: number }> = [];
        if (!isManual) {
          const fetchedHistory = await fetchAssetHistoryFromDb(symbol, timelineStart);
          history = [...fetchedHistory, ...pricePoints];
        } else {
          history = [...pricePoints, ...fixedIncomePoints];
        }

        const initialPrice = pricePoints.length > 0
          ? pricePoints[0]?.value
          : portfolioInfo?.avgPrice;

        // Para ativos manuais (reservas, imóveis, etc.), usar o preço atual (avgPrice) em todos os dias do histórico
        if (isManual && portfolioInfo?.avgPrice && portfolioInfo.avgPrice > 0) {
          // Para ativos manuais, usar o preço atual (avgPrice) como preço em todos os dias
          // Criar histórico com o preço atual desde o início até hoje
          history = [
            { date: timelineStart.getTime(), value: portfolioInfo.avgPrice },
            { date: hoje.getTime(), value: portfolioInfo.avgPrice },
          ];
        } else if (history.length === 0 && initialPrice && initialPrice > 0) {
          history.push({ date: timelineStart.getTime(), value: initialPrice });
        }

        if (initialPrice && initialPrice > 0) {
          fallbackPriceBySymbol.set(symbol, initialPrice);
        }

        pricesBySymbol.set(symbol, buildDailyPriceMap(history, timeline, initialPrice));
      }

      const quantitiesBySymbol = new Map<string, number>();
      allSymbols.forEach((symbol) => {
        const portfolioInfo = portfolioBySymbol.get(symbol);
        if (portfolioInfo && !firstTransactionBySymbol.has(symbol)) {
          quantitiesBySymbol.set(symbol, portfolioInfo.quantity);
        } else {
          quantitiesBySymbol.set(symbol, 0);
        }
      });

      const rendimentosByDay = new Map<number, number>();
      let cashBalance = 0;
      let rendimentosAcumulados = 0;
      let manualInvestmentsValue = 0;
      let valorAplicadoDia = 0;
      const patrimonioSeries: Array<{ data: number; valorAplicado: number; saldoBruto: number }> = [];

      for (const day of timeline) {
        if (manualValuesByDay.has(day)) {
          manualInvestmentsValue = manualValuesByDay.get(day) || 0;
        }

        if (aportesByDay.has(day)) {
          cashBalance += aportesByDay.get(day) || 0;
        }

        if (cashDeltasByDay.has(day)) {
          cashBalance += cashDeltasByDay.get(day) || 0;
        }

        if (rendimentosByDay.has(day)) {
          const rendimento = rendimentosByDay.get(day) || 0;
          cashBalance += rendimento;
          rendimentosAcumulados += rendimento;
        }

        if (appliedDeltasByDay.has(day)) {
          valorAplicadoDia += appliedDeltasByDay.get(day) || 0;
        }

        transactionsBySymbol.forEach((deltas, symbol) => {
          const qtyDelta = deltas.get(day);
          if (!qtyDelta) return;
          quantitiesBySymbol.set(symbol, (quantitiesBySymbol.get(symbol) || 0) + qtyDelta);
        });

        let valorMercadoAtivos = 0;
        allSymbols.forEach((symbol) => {
          const quantity = quantitiesBySymbol.get(symbol) || 0;
          if (!quantity) return;

          const priceMap = pricesBySymbol.get(symbol);
          const price = priceMap?.get(day) ?? fallbackPriceBySymbol.get(symbol);
          if (!price || !Number.isFinite(price) || price <= 0) return;
          valorMercadoAtivos += quantity * price;
        });

        const saldoBrutoDia = valorMercadoAtivos + manualInvestmentsValue + cashBalance + rendimentosAcumulados;

        patrimonioSeries.push({
          data: day,
          valorAplicado: Math.round(valorAplicadoDia * 100) / 100,
          saldoBruto: Math.round(saldoBrutoDia * 100) / 100,
        });
      }

      const saldoBrutoAtual = Math.round((saldoBruto > 0 ? saldoBruto : valorAplicado) * 100) / 100;
      const valorAplicadoAtual = Math.round(valorAplicado * 100) / 100;
      if (patrimonioSeries.length > 0) {
        patrimonioSeries[patrimonioSeries.length - 1].saldoBruto = saldoBrutoAtual;
        patrimonioSeries[patrimonioSeries.length - 1].valorAplicado = valorAplicadoAtual;
      } else {
        patrimonioSeries.push({
          data: hoje.getTime(),
          valorAplicado: valorAplicadoAtual,
          saldoBruto: saldoBrutoAtual,
        });
      }

      historicoPatrimonio.push(...patrimonioSeries);
    } else {
      const hoje = new Date();
      for (let i = 11; i >= 0; i--) {
        const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        historicoPatrimonio.push({
          data: data.getTime(),
          valorAplicado: 0,
          saldoBruto: Math.round(saldoBruto * 100) / 100,
        });
      }
    }

    // Usar os investimentos já buscados acima
    const categorizedInvestments = investments;

    // categorias já foi inicializado antes do loop do portfolio

    // Categorizar portfolio baseado no tipo do ativo
    for (const item of portfolio) {
      const symbol = item.asset?.symbol || item.stock?.ticker;
      if (!symbol) continue;
      
      // Buscar o Asset correspondente para obter o tipo
      const asset = item.asset || await prisma.asset.findUnique({
        where: { symbol }
      });
      const fixedIncome = item.assetId ? fixedIncomeByAssetId.get(item.assetId) : null;

      // Calcular valor atual com cotação
      const isReserva = asset?.type === 'emergency' || asset?.type === 'opportunity' ||
                        symbol?.startsWith('RESERVA-EMERG') || symbol?.startsWith('RESERVA-OPORT');
      const currentPrice = quotes.get(symbol);
      const valorAtual = fixedIncome
        ? calculateFixedIncomeValue(fixedIncome, new Date())
        : (currentPrice && !isReserva
        ? item.quantity * currentPrice 
          : item.quantity * item.avgPrice); // Para reservas ou fallback, usar quantity * avgPrice
      
      if (asset) {
        const tipo = asset.type?.toLowerCase() || '';
        
        // Verificar se é reserva antes de categorizar
        if (isReserva) {
          if (tipo === 'opportunity' || symbol?.startsWith('RESERVA-OPORT')) {
            categorias.reservaOportunidade += valorAtual;
          } else if (tipo === 'emergency' || symbol?.startsWith('RESERVA-EMERG')) {
            categorias.reservaEmergencia += valorAtual;
          }
        } else {
          switch (tipo) {
            case 'ação':
            case 'acao':
            case 'stock': {
              if (asset.currency === 'BRL') {
                categorias.acoes += valorAtual;
              } else {
                categorias.stocks += valorAtual;
              }
              break;
            }
            case 'bdr':
            case 'brd':
              categorias.stocks += valorAtual;
              break;
            case 'fii':
              categorias.fiis += valorAtual;
              break;
            case 'fund':
            case 'funds': {
              const symbolUpper = symbol.toUpperCase();
              const nameLower = (asset.name || '').toLowerCase();
              if (symbolUpper.endsWith('11') || nameLower.includes('fii') || nameLower.includes('imobili')) {
                categorias.fiis += valorAtual;
              } else {
                categorias.fimFia += valorAtual;
              }
              break;
            }
            case 'etf':
              categorias.etfs += valorAtual;
              break;
            case 'reit':
              categorias.reits += valorAtual;
              break;
            case 'crypto':
              categorias.moedasCriptos += valorAtual;
              break;
            case 'bond':
              categorias.rendaFixaFundos += valorAtual;
              break;
            case 'insurance':
              categorias.previdenciaSeguros += valorAtual;
              break;
            case 'currency':
              categorias.moedasCriptos += valorAtual;
              break;
            case 'cash':
              categorias.reservaOportunidade += valorAtual;
              break;
            case 'emergency':
              categorias.reservaEmergencia += valorAtual;
              break;
            case 'opportunity':
              categorias.reservaOportunidade += valorAtual;
              break;
            case 'custom':
            case 'personalizado':
              // Personalizado não deve aparecer no gráfico de tipos de investimento (vai para Imóveis e Bens)
              break;
            case 'imovel':
              // Imóveis e bens não devem aparecer no gráfico de tipos de investimento
              break;
            default:
              // Verificar se é reserva pelo símbolo - reservas não devem aparecer no gráfico
              if (symbol?.startsWith('RESERVA-OPORT')) {
                categorias.reservaOportunidade += valorAtual;
              } else if (symbol?.startsWith('RESERVA-EMERG')) {
                categorias.reservaEmergencia += valorAtual;
              } else if (symbol?.includes('11')) {
                categorias.fiis += valorAtual;
              } else {
                categorias.acoes += valorAtual;
              }
          }
        }
      } else {
        // Se não encontrar o asset, usar heurística baseada no ticker
        // Verificar se é reserva primeiro - reservas não devem aparecer no gráfico
        if (symbol?.startsWith('RESERVA-OPORT')) {
          categorias.reservaOportunidade += valorAtual;
        } else if (symbol?.startsWith('RESERVA-EMERG')) {
          categorias.reservaEmergencia += valorAtual;
        } else if (symbol?.includes('11')) {
          categorias.fiis += valorAtual; // FIIs geralmente terminam em 11
        } else {
          categorias.acoes += valorAtual; // Assumir ação por padrão
        }
      }
    }

    // Categorizar investimentos baseado no nome
    categorizedInvestments.forEach(investment => {
      const totalValor = (investment.values || []).reduce((sum, value) => sum + value.value, 0);
      const name = investment.name.toLowerCase();

      // Lógica de categorização baseada em palavras-chave no nome
      if (name.includes('reserva') && name.includes('emergencia')) {
        categorias.reservaEmergencia += totalValor;
      } else if (name.includes('reserva') && name.includes('oportunidade')) {
        categorias.reservaOportunidade += totalValor;
      } else if (name.includes('emergencia')) {
        categorias.reservaEmergencia += totalValor;
      } else if (name.includes('reserva')) {
        // Se não especificar qual tipo de reserva, assumir oportunidade
        categorias.reservaOportunidade += totalValor;
      } else if (name.includes('cdb') || name.includes('lci') || name.includes('lca') || 
                 name.includes('tesouro') || name.includes('renda fixa')) {
        categorias.rendaFixaFundos += totalValor;
      } else if ((name.includes('fim') || name.includes('fia')) && !name.includes('fii') && !name.includes('imobiliario')) {
        // Apenas FIM/FIA específicos, excluindo FIIs e imobiliários
        categorias.fimFia += totalValor;
      } else if (name.includes('fii') || name.includes('imobiliario')) {
        categorias.fiis += totalValor;
      } else if (name.includes('stock') || name.includes('exterior')) {
        categorias.stocks += totalValor;
      } else if (name.includes('reit')) {
        categorias.reits += totalValor;
      } else if (name.includes('etf')) {
        categorias.etfs += totalValor;
      } else if (name.includes('crypto') || name.includes('bitcoin') || name.includes('moeda')) {
        categorias.moedasCriptos += totalValor;
      } else if (name.includes('previdencia') || name.includes('seguro')) {
        categorias.previdenciaSeguros += totalValor;
      } else if (name.includes('opcao') || name.includes('option')) {
        categorias.opcoes += totalValor;
      } else {
        // Se não se encaixa em nenhuma categoria específica, vai para renda fixa
        categorias.rendaFixaFundos += totalValor;
      }
    });

    // Buscar caixa para investir de cada tab e adicionar aos valores calculados
    // Isso garante que os valores incluam o caixa para investir de cada tab
    const caixaAcoes = dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_acoes')?.value || 0;
    const caixaFii = dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_fii')?.value || 0;
    const caixaEtf = dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_etf')?.value || 0;
    const caixaReit = dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_reit')?.value || 0;
    const caixaStocks = dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_stocks')?.value || 0;
    const caixaMoedasCriptos = dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_moedas_criptos')?.value || 0;
    const caixaPrevidenciaSeguros = dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_previdencia_seguros')?.value || 0;
    const caixaOpcoes = dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_opcoes')?.value || 0;
    const caixaFimFia = dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_fim_fia')?.value || 0;
    const caixaRendaFixa = dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_renda_fixa')?.value || 0;

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
        percentual: baseValue > 0 ? Math.round((categorias.reservaEmergencia / baseValue) * 10000) / 100 : 0,
      },
      reservaOportunidade: {
        valor: Math.round(categorias.reservaOportunidade * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.reservaOportunidade / baseValue) * 10000) / 100 : 0,
      },
      rendaFixaFundos: {
        valor: Math.round(categorias.rendaFixaFundos * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.rendaFixaFundos / baseValue) * 10000) / 100 : 0,
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
        percentual: baseValue > 0 ? Math.round((categorias.moedasCriptos / baseValue) * 10000) / 100 : 0,
      },
      previdenciaSeguros: {
        valor: Math.round(categorias.previdenciaSeguros * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.previdenciaSeguros / baseValue) * 10000) / 100 : 0,
      },
      opcoes: {
        valor: Math.round(categorias.opcoes * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.opcoes / baseValue) * 10000) / 100 : 0,
      },
      imoveisBens: {
        valor: Math.round(categorias.imoveisBens * 100) / 100,
        percentual: baseValue > 0 ? Math.round((categorias.imoveisBens / baseValue) * 10000) / 100 : 0,
      },
    };

    const resumo = {
      saldoBruto: Math.round(saldoBruto * 100) / 100,
      valorAplicado: Math.round(valorAplicado * 100) / 100,
      rentabilidade: Math.round(rentabilidade * 100) / 100,
      metaPatrimonio: metaPatrimonio?.value || 0,
      caixaParaInvestir: caixaParaInvestir || 0,
      historicoPatrimonio,
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

    return NextResponse.json(resumo);
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao buscar resumo da carteira:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// POST para atualizar meta de patrimônio ou caixa para investir consolidado
export async function POST(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);

    const { metaPatrimonio, caixaParaInvestir } = await request.json();

    // Atualizar caixa para investir consolidado
    if (caixaParaInvestir !== undefined) {
      if (typeof caixaParaInvestir !== 'number' || caixaParaInvestir < 0) {
        return NextResponse.json({
          error: 'Caixa para investir deve ser um valor igual ou maior que zero'
        }, { status: 400 });
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

      return NextResponse.json({ 
        success: true, 
        message: 'Caixa para investir atualizado com sucesso',
        caixaParaInvestir
      });
    }

    // Atualizar meta de patrimônio (código existente)
    if (metaPatrimonio !== undefined) {
      if (typeof metaPatrimonio !== 'number' || metaPatrimonio <= 0) {
        return NextResponse.json({ 
          error: 'Meta de patrimônio deve ser um valor positivo' 
        }, { status: 400 });
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

      return NextResponse.json({ success: true, metaPatrimonio });
    }

    return NextResponse.json({ 
      error: 'Informe metaPatrimonio ou caixaParaInvestir' 
    }, { status: 400 });
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao atualizar dados:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

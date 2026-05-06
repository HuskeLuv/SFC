import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAssetHistory } from '@/services/pricing/assetPriceService';
import {
  buildDailyTimeline,
  normalizeDateStart,
} from '@/services/portfolio/patrimonioHistoricoBuilder';
import { nextBusinessDayB3 } from '@/utils/feriadosB3';

import { withErrorHandler } from '@/utils/apiErrorHandler';
interface IndexData {
  date: number;
  value: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const buildDailyPriceMap = (history: IndexData[], timeline: number[], initialPrice?: number) => {
  const sorted = [...history]
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => a.date - b.date);
  const map = new Map<number, number>();

  let lastPrice =
    Number.isFinite(initialPrice) && initialPrice && initialPrice > 0 ? initialPrice : undefined;
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

const logSeriesStats = (data: IndexData[], name: string) => {
  if (data.length < 2) return;
  const sorted = [...data].sort((a, b) => a.date - b.date);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const years = Math.max(1 / 365, (last.date - first.date) / (365 * DAY_MS));
  const cagr = Math.pow(last.value / first.value, 1 / years) - 1;
  console.log(
    `[${name}] inicial=${first.value.toFixed(2)} final=${last.value.toFixed(2)} CAGR=${(cagr * 100).toFixed(2)}%`,
  );
};

const getTransactionValue = (transaction: { total: number; quantity: number; price: number }) => {
  const total = Number(transaction.total);
  if (Number.isFinite(total) && total > 0) {
    return total;
  }

  const fallback = Number(transaction.quantity) * Number(transaction.price);
  return Number.isFinite(fallback) ? fallback : 0;
};

/**
 * Retorna chave do dia (UTC midnight) para lookup consistente. Ancorar em UTC
 * (não local) porque tx.date é gravado como UTC midnight. Em fusos negativos
 * (BRT), setHours local shifta a key pro dia anterior, fazendo cashFlowsByDay
 * desalinhar com o timeline e a série TWR perder o aporte do dia 0.
 */
const getDayKey = (ts: number): number => {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const calculateTwrSeries = (portfolioValues: IndexData[], cashFlowsByDay: Map<number, number>) => {
  if (portfolioValues.length === 0) return [];

  const returns: IndexData[] = [];
  let cumulative = 1;

  portfolioValues.forEach((item, index) => {
    if (index === 0) {
      returns.push({ date: item.date, value: 0 });
      return;
    }

    const previousValue = portfolioValues[index - 1]?.value || 0;
    const currentValue = item.value;
    const dayKey = getDayKey(item.date);
    const cashFlow = cashFlowsByDay.get(dayKey) ?? cashFlowsByDay.get(item.date) ?? 0;

    let dailyReturn = 0;
    if (previousValue > 0) {
      const valueFromInvestments = currentValue - cashFlow;
      dailyReturn = valueFromInvestments / previousValue - 1;
      if (!Number.isFinite(dailyReturn) || dailyReturn > 0.5 || dailyReturn < -0.5) {
        dailyReturn = 0;
      }
    } else if (currentValue > 0 && cashFlow > 0) {
      dailyReturn = 0;
    }

    cumulative *= 1 + dailyReturn;
    returns.push({
      date: item.date,
      value: (cumulative - 1) * 100,
    });
  });

  return returns;
};

const fetchAssetHistoryFromDb = async (symbol: string, startDate?: Date): Promise<IndexData[]> => {
  const start = startDate
    ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    : new Date(Date.now() - 365 * DAY_MS);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return getAssetHistory(symbol, start, end, { useBrapiFallback: true });
};

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const { searchParams } = new URL(request.url);
  const startDateParam = searchParams.get('startDate');

  let startDate: Date | undefined;
  if (startDateParam) {
    startDate = new Date(parseInt(startDateParam, 10));
  }

  // Buscar todas as transações do usuário
  const transactions = await prisma.stockTransaction.findMany({
    where: {
      userId: targetUserId,
    },
    select: {
      type: true,
      quantity: true,
      price: true,
      total: true,
      date: true,
      stock: { select: { ticker: true } },
      asset: { select: { symbol: true, type: true } },
    },
    orderBy: {
      date: 'asc',
    },
  });

  // Filtrar transações que têm símbolo/ticker e podem ter histórico na brapi
  const transactionsFiltradas = transactions.filter((trans) => {
    const symbol = trans.stock?.ticker || trans.asset?.symbol;
    if (!symbol) return false;

    // Excluir reservas, renda fixa, personalizados, imóveis (sem histórico na brapi)
    if (trans.asset) {
      if (
        trans.asset.type === 'emergency' ||
        trans.asset.type === 'opportunity' ||
        trans.asset.type === 'personalizado' ||
        trans.asset.type === 'imovel'
      ) {
        return false;
      }
      if (
        symbol.startsWith('RESERVA-EMERG') ||
        symbol.startsWith('RESERVA-OPORT') ||
        symbol.startsWith('RENDA-FIXA') ||
        symbol.startsWith('PERSONALIZADO')
      ) {
        return false;
      }
    }

    return true;
  });

  if (transactionsFiltradas.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const today = normalizeDateStart(new Date());

  // Agrupar transações por símbolo
  const transactionsPorSimbolo = new Map<string, typeof transactionsFiltradas>();
  for (const trans of transactionsFiltradas) {
    const symbol = trans.stock?.ticker || trans.asset?.symbol;
    if (!symbol) continue;

    if (!transactionsPorSimbolo.has(symbol)) {
      transactionsPorSimbolo.set(symbol, []);
    }
    transactionsPorSimbolo.get(symbol)!.push(trans);
  }

  // Buscar histórico de preços para cada ativo
  const historicosPorAtivo = new Map<string, IndexData[]>();

  const positiveTransactions = transactionsFiltradas.filter((trans) => {
    if (trans.type !== 'compra') return false;
    return getTransactionValue(trans) > 0;
  });

  if (positiveTransactions.length === 0) {
    return NextResponse.json({ data: [] });
  }

  let firstAporteDate = positiveTransactions[0].date;
  positiveTransactions.forEach((trans) => {
    if (trans.date < firstAporteDate) {
      firstAporteDate = trans.date;
    }
  });

  const effectiveStartDate = startDate
    ? new Date(
        Math.max(
          normalizeDateStart(startDate).getTime(),
          normalizeDateStart(firstAporteDate).getTime(),
        ),
      )
    : normalizeDateStart(firstAporteDate);

  const timelineStart = normalizeDateStart(effectiveStartDate);
  const timeline = buildDailyTimeline(timelineStart, today);

  const cashFlowsByDay = new Map<number, number>();
  const quantityDeltasBySymbol = new Map<string, Map<number, number>>();
  const preStartQuantities = new Map<string, number>();
  const pricePointsBySymbol = new Map<string, IndexData[]>();

  transactionsFiltradas.forEach((trans) => {
    const symbol = trans.stock?.ticker || trans.asset?.symbol;
    if (!symbol) return;

    // Quando tx cai em fim-de-semana/feriado, ancora no próximo dia útil B3 —
    // convenção D+next ANBIMA. Sem isso, o cashflow desse tx some no TWR
    // porque a timeline filtrada (sem feriados) não tem essa key.
    const rawDayKey = getDayKey(new Date(trans.date).getTime());
    const dayKey = nextBusinessDayB3(rawDayKey);
    const value = getTransactionValue(trans);
    const qtyDelta = trans.type === 'compra' ? trans.quantity : -trans.quantity;

    if (dayKey < timelineStart.getTime()) {
      preStartQuantities.set(symbol, (preStartQuantities.get(symbol) || 0) + qtyDelta);
      return;
    }

    if (!quantityDeltasBySymbol.has(symbol)) {
      quantityDeltasBySymbol.set(symbol, new Map());
    }

    const symbolDeltas = quantityDeltasBySymbol.get(symbol)!;
    symbolDeltas.set(dayKey, (symbolDeltas.get(dayKey) || 0) + qtyDelta);

    const cashFlowDelta = trans.type === 'compra' ? value : -value;
    cashFlowsByDay.set(dayKey, (cashFlowsByDay.get(dayKey) || 0) + cashFlowDelta);

    const priceValue =
      trans.price > 0 ? trans.price : trans.quantity > 0 ? value / trans.quantity : 0;
    if (priceValue > 0) {
      if (!pricePointsBySymbol.has(symbol)) {
        pricePointsBySymbol.set(symbol, []);
      }
      pricePointsBySymbol.get(symbol)!.push({ date: dayKey, value: priceValue });
    }
  });

  const entries = await Promise.all(
    Array.from(transactionsPorSimbolo.keys()).map(async (symbol) => {
      const historico = await fetchAssetHistoryFromDb(symbol, timelineStart);
      return [symbol, historico] as const;
    }),
  );
  for (const [symbol, historico] of entries) {
    historicosPorAtivo.set(symbol, historico);
  }

  const pricesBySymbol = new Map<string, Map<number, number>>();
  historicosPorAtivo.forEach((historico, symbol) => {
    const pricePoints = pricePointsBySymbol.get(symbol) || [];
    const history = [...historico, ...pricePoints];
    const initialPrice = pricePoints.length > 0 ? pricePoints[0]?.value : undefined;
    pricesBySymbol.set(symbol, buildDailyPriceMap(history, timeline, initialPrice));
  });

  const quantitiesBySymbol = new Map<string, number>();
  transactionsPorSimbolo.forEach((_value, symbol) => {
    quantitiesBySymbol.set(symbol, Math.max(0, preStartQuantities.get(symbol) || 0));
  });

  const portfolioValues: IndexData[] = [];

  for (const day of timeline) {
    let portfolioTotal = 0;

    pricesBySymbol.forEach((priceMap, symbol) => {
      const quantityDelta = quantityDeltasBySymbol.get(symbol)?.get(day) || 0;
      if (quantityDelta !== 0) {
        quantitiesBySymbol.set(symbol, (quantitiesBySymbol.get(symbol) || 0) + quantityDelta);
      }

      const quantity = quantitiesBySymbol.get(symbol) || 0;
      if (quantity <= 0) return;

      const price = priceMap.get(day);
      if (price && price > 0) {
        portfolioTotal += quantity * price;
      }
    });

    portfolioValues.push({
      date: day,
      value: Math.round(portfolioTotal * 100) / 100,
    });
  }

  if (portfolioValues.length > 1) {
    logSeriesStats(portfolioValues, 'Carteira-Valor');
  }

  const twrSeries = calculateTwrSeries(portfolioValues, cashFlowsByDay);

  // Série MWR cumulativa em paralelo ao TWR. portfolioValues tem
  // {date, value=saldoBruto}; reconstruímos valorAplicado acumulando os
  // cashflows pra alimentar o builder de MWR (que usa o saldo bruto direto).
  const { buildMwrSeries } = await import('@/services/portfolio/mwrSeriesBuilder');
  let aplicadoAcum = 0;
  const historicoForMwr = portfolioValues.map((p) => {
    aplicadoAcum += cashFlowsByDay.get(p.date) ?? 0;
    return { data: p.date, valorAplicado: aplicadoAcum, saldoBruto: p.value };
  });
  const mwrSeries = buildMwrSeries({
    historicoPatrimonio: historicoForMwr,
    cashFlowsByDay,
  }).map((m) => ({ date: m.data, value: m.value }));

  return NextResponse.json({ data: twrSeries, mwr: mwrSeries });
});

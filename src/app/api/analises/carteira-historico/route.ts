import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

interface IndexData {
  date: number;
  value: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

const buildDailyPriceMap = (history: IndexData[], timeline: number[]) => {
  const sorted = [...history].sort((a, b) => a.date - b.date);
  const map = new Map<number, number>();

  let lastPrice = 0;
  let historyIndex = 0;

  for (const day of timeline) {
    while (historyIndex < sorted.length) {
      const historyDate = normalizeDateStart(new Date(sorted[historyIndex].date)).getTime();
      if (historyDate > day) break;
      lastPrice = sorted[historyIndex].value;
      historyIndex += 1;
    }

    map.set(day, lastPrice);
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
    `[${name}] inicial=${first.value.toFixed(2)} final=${last.value.toFixed(2)} CAGR=${(cagr * 100).toFixed(2)}%`
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

const calculateTwrSeries = (
  portfolioValues: IndexData[],
  cashFlowsByDay: Map<number, number>
) => {
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
    const cashFlow = cashFlowsByDay.get(item.date) || 0;

    let dailyReturn = 0;
    if (previousValue > 0) {
      dailyReturn = (currentValue - cashFlow) / previousValue - 1;
    }

    cumulative *= 1 + dailyReturn;
    returns.push({
      date: item.date,
      value: (cumulative - 1) * 100,
    });
  });

  return returns;
};

/**
 * Busca histórico de preços de um ativo da brapi
 */
const fetchAssetHistory = async (symbol: string, startDate?: Date): Promise<IndexData[]> => {
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Calcular range baseado na data inicial
    let brapiRange = '1y';
    if (startDate) {
      const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      brapiRange = daysSinceStart > 365 ? '2y' : '1y';
    }

    const tokenParam = apiKey ? `&token=${apiKey}` : '';
    const url = `https://brapi.dev/api/quote/${symbol}?range=${brapiRange}&interval=1d${tokenParam}`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.warn(`Erro ao buscar histórico de ${symbol}: HTTP ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
      return [];
    }

    const result = data.results[0];
    const historicalData = result.historicalDataPrice || [];
    
    if (!historicalData || historicalData.length === 0) {
      return [];
    }
    
    let assetData = historicalData.map((item: any) => ({
      date: item.date * 1000, // Converter de segundos para milissegundos
      value: item.close || 0,
    }));

    // Filtrar por startDate se fornecido
    if (startDate) {
      const startTimestamp = startDate.getTime();
      assetData = assetData.filter((item: IndexData) => item.date >= startTimestamp);
    }
    
    // Filtrar dados futuros
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    const hojeTimestamp = hoje.getTime();
    assetData = assetData.filter((item: IndexData) => {
      const dataTimestamp = item.date;
      return dataTimestamp <= hojeTimestamp;
    });
    
    return assetData;
  } catch (error) {
    console.error(`Erro ao buscar histórico de ${symbol}:`, error);
    return [];
  }
};

export async function GET(request: NextRequest) {
  try {
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
      include: {
        stock: true,
        asset: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Filtrar transações que têm símbolo/ticker e podem ter histórico na brapi
    const transactionsFiltradas = transactions.filter(trans => {
      const symbol = trans.stock?.ticker || trans.asset?.symbol;
      if (!symbol) return false;
      
      // Excluir reservas, personalizados, imóveis
      if (trans.asset) {
        if (trans.asset.type === 'emergency' || trans.asset.type === 'opportunity' || 
            trans.asset.type === 'personalizado' || trans.asset.type === 'imovel') {
          return false;
        }
        if (symbol.startsWith('RESERVA-EMERG') || symbol.startsWith('RESERVA-OPORT') || 
            symbol.startsWith('PERSONALIZADO')) {
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
    
    const positiveTransactions = transactionsFiltradas.filter(trans => {
      if (trans.type !== 'compra') return false;
      return getTransactionValue(trans) > 0;
    });

    if (positiveTransactions.length === 0) {
      return NextResponse.json({ data: [] });
    }

    let firstAporteDate = positiveTransactions[0].date;
    positiveTransactions.forEach(trans => {
      if (trans.date < firstAporteDate) {
        firstAporteDate = trans.date;
      }
    });

    const effectiveStartDate = startDate
      ? new Date(Math.max(normalizeDateStart(startDate).getTime(), normalizeDateStart(firstAporteDate).getTime()))
      : normalizeDateStart(firstAporteDate);

    const timelineStart = normalizeDateStart(effectiveStartDate);
    const timeline = buildDailyTimeline(timelineStart, today);

    const cashFlowsByDay = new Map<number, number>();
    const quantityDeltasBySymbol = new Map<string, Map<number, number>>();
    const preStartQuantities = new Map<string, number>();

    transactionsFiltradas.forEach(trans => {
      const symbol = trans.stock?.ticker || trans.asset?.symbol;
      if (!symbol) return;

      const dayKey = normalizeDateStart(trans.date).getTime();
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
    });

    for (const symbol of transactionsPorSimbolo.keys()) {
      const historico = await fetchAssetHistory(symbol, timelineStart);
      historicosPorAtivo.set(symbol, historico);
    }

    const pricesBySymbol = new Map<string, Map<number, number>>();
    historicosPorAtivo.forEach((historico, symbol) => {
      pricesBySymbol.set(symbol, buildDailyPriceMap(historico, timeline));
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

        const price = priceMap.get(day) || 0;
        if (price > 0) {
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
    return NextResponse.json({ data: twrSeries });
  } catch (error) {
    console.error('Erro ao buscar histórico da carteira:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados da carteira' },
      { status: 500 }
    );
  }
}

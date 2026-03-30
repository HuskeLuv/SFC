import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAssetPrices, getAssetHistory } from '@/services/pricing/assetPriceService';
import { getDividends } from '@/services/pricing/dividendService';
import { getFundamentals } from '@/services/pricing/fundamentalsService';

import { withErrorHandler } from '@/utils/apiErrorHandler';
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

const buildDailyPriceMap = (
  history: Array<{ date: number; value: number }>,
  timeline: number[],
  initialPrice?: number,
) => {
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

const getTransactionValue = (transaction: { total: number; quantity: number; price: number }) => {
  const total = Number(transaction.total);
  if (Number.isFinite(total) && total > 0) return total;
  const fallback = Number(transaction.quantity) * Number(transaction.price);
  return Number.isFinite(fallback) ? fallback : 0;
};

const getDayKey = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const calculateHistoricoTWR = (
  patrimonioSeries: Array<{ data: number; saldoBruto: number }>,
  cashFlowsByDay: Map<number, number>,
): Array<{ data: number; value: number }> => {
  if (patrimonioSeries.length === 0) return [];
  const result: Array<{ data: number; value: number }> = [];
  let cumulative = 1;
  for (let i = 0; i < patrimonioSeries.length; i++) {
    if (i === 0) {
      result.push({ data: patrimonioSeries[i].data, value: 0 });
      continue;
    }
    const valorInicial = patrimonioSeries[i - 1].saldoBruto;
    const valorFinal = patrimonioSeries[i].saldoBruto;
    const dayKey = getDayKey(patrimonioSeries[i].data);
    const fluxo = cashFlowsByDay.get(dayKey) ?? cashFlowsByDay.get(patrimonioSeries[i].data) ?? 0;
    let retornoDia = 0;
    if (valorInicial > 0) {
      retornoDia = (valorFinal - valorInicial - fluxo) / valorInicial;
      if (!Number.isFinite(retornoDia) || retornoDia > 0.5 || retornoDia < -0.5) retornoDia = 0;
    } else if (valorFinal > 0 && fluxo > 0) {
      retornoDia = 0;
    }
    cumulative *= 1 + retornoDia;
    result.push({
      data: patrimonioSeries[i].data,
      value: Math.round((cumulative - 1) * 10000) / 100,
    });
  }
  return result;
};

const tipoOperacaoMap: Record<string, string> = {
  compra: 'Aporte',
  venda: 'Resgate',
};

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { targetUserId } = await requireAuthWithActing(request);
    const { id: portfolioId } = await params;

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: targetUserId },
      include: { stock: true, asset: true },
    });

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfólio não encontrado' }, { status: 404 });
    }

    const symbol = portfolio.asset?.symbol || portfolio.stock?.ticker;
    const nome = portfolio.asset?.name || portfolio.stock?.companyName || symbol;
    const ticker = symbol || '';

    if (!ticker) {
      return NextResponse.json({ error: 'Ativo sem ticker identificado' }, { status: 400 });
    }

    const txWhere: { userId: string; assetId?: string; stockId?: string } = {
      userId: targetUserId,
    };
    if (portfolio.assetId) txWhere.assetId = portfolio.assetId;
    else if (portfolio.stockId) txWhere.stockId = portfolio.stockId;

    const transactions = await prisma.stockTransaction.findMany({
      where: txWhere,
      orderBy: { date: 'desc' },
    });

    const quotes = await getAssetPrices([ticker], { useBrapiFallback: true });
    const cotacaoAtual = quotes.get(ticker) ?? portfolio.avgPrice;
    const saldoBruto = portfolio.quantity * cotacaoAtual;
    const valorAplicado = portfolio.totalInvested;
    const resultado = saldoBruto - valorAplicado;
    const rentabilidade = valorAplicado > 0 ? (resultado / valorAplicado) * 100 : 0;

    const transacoes = transactions.map((tx) => ({
      id: tx.id,
      tipoOperacao: tipoOperacaoMap[tx.type] || tx.type,
      quantity: tx.quantity,
      price: tx.price,
      total: tx.total,
      date: tx.date.toISOString(),
      fees: tx.fees,
      notes: tx.notes,
    }));

    const [dividends, fundamentals] = await Promise.all([
      getDividends(ticker, { useBrapiFallback: true }),
      getFundamentals(ticker, { useBrapiFallback: true }),
    ]);

    const buildTimeline = (trans: { date: Date; quantity: number; type: string }[]) => {
      const sorted = [...trans].sort((a, b) => a.date.getTime() - b.date.getTime());
      const timeline: { date: number; quantity: number }[] = [];
      let currentQuantity = 0;
      sorted.forEach((t) => {
        currentQuantity += t.type === 'compra' ? t.quantity : -t.quantity;
        timeline.push({ date: t.date.getTime(), quantity: currentQuantity });
      });
      return timeline;
    };

    const getQuantityAtDate = (timeline: { date: number; quantity: number }[], date: number) => {
      if (timeline.length === 0) return 0;
      let left = 0;
      let right = timeline.length - 1;
      let result = 0;
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (timeline[mid].date <= date) {
          result = timeline[mid].quantity;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
      return Math.max(result, 0);
    };

    const timeline = buildTimeline(
      transactions.map((t) => ({ date: t.date, quantity: t.quantity, type: t.type })),
    );

    const hoje = normalizeDateStart(new Date());
    const hojeMs = hoje.getTime();
    const compraTimes = transactions
      .filter((t) => t.type === 'compra')
      .map((t) => t.date.getTime());
    const firstPurchaseDate =
      compraTimes.length > 0
        ? Math.min(...compraTimes)
        : portfolio.lastUpdate
          ? normalizeDateStart(portfolio.lastUpdate).getTime()
          : 0;

    // Proventos: apenas histórico - do dia atual para trás até o dia da compra (exclui a_receber)
    const proventos = dividends
      .filter((d) => {
        const dMs = normalizeDateStart(d.date).getTime();
        if (dMs > hojeMs) return false; // Excluir proventos futuros
        if (firstPurchaseDate > 0 && dMs < firstPurchaseDate) return false; // Antes da compra
        return true;
      })
      .map((d) => {
        const quantidade =
          timeline.length > 0 ? getQuantityAtDate(timeline, d.date.getTime()) : portfolio.quantity;
        if (quantidade <= 0) return null;
        return {
          data: d.date.toISOString(),
          tipo: d.tipo,
          valorTotal: quantidade * d.valorUnitario,
          quantidade,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    const firstTxDate =
      transactions.length > 0
        ? new Date(Math.min(...transactions.map((t) => t.date.getTime())))
        : portfolio.lastUpdate
          ? new Date(portfolio.lastUpdate)
          : hoje;
    const timelineStart = normalizeDateStart(firstTxDate);
    const MAX_HISTORICO_MESES = 24;
    const minStart = new Date(hoje.getFullYear(), hoje.getMonth() - MAX_HISTORICO_MESES, 1);
    const effectiveStart = timelineStart.getTime() < minStart.getTime() ? minStart : timelineStart;

    const fetchAssetHistoryFromDb = async (sym: string, startDate?: Date) => {
      const start = startDate
        ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        : new Date(Date.now() - 365 * DAY_MS);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return getAssetHistory(sym, start, end, { useBrapiFallback: true });
    };

    const blockedSymbols = [
      'RESERVA-EMERG',
      'RESERVA-OPORT',
      'RENDA-FIXA',
      'PERSONALIZADO',
      'CONTA-CORRENTE',
    ];
    const isBlocked = blockedSymbols.some((p) => ticker.toUpperCase().startsWith(p));
    const isManual = portfolio.asset?.source === 'manual';

    let historicoPatrimonio: Array<{ data: number; valorAplicado: number; saldoBruto: number }> =
      [];
    let historicoTWR: Array<{ date: number; value: number }> = [];

    if (isManual && portfolio.quantity > 0) {
      const dayTimeline = buildDailyTimeline(effectiveStart, hoje);
      const valorAplicadoConst =
        portfolio.totalInvested > 0
          ? portfolio.totalInvested
          : portfolio.quantity * portfolio.avgPrice;
      const saldoBrutoConst =
        portfolio.quantity *
        (portfolio.avgPrice > 0 ? portfolio.avgPrice : valorAplicadoConst / portfolio.quantity);
      historicoPatrimonio = dayTimeline.map((day) => ({
        data: day,
        valorAplicado: valorAplicadoConst,
        saldoBruto: saldoBrutoConst,
      }));
    } else if (!isBlocked && !isManual) {
      const dayTimeline = buildDailyTimeline(effectiveStart, hoje);
      const quantityDeltasByDay = new Map<number, number>();
      const appliedDeltasByDay = new Map<number, number>();
      const cashFlowsByDay = new Map<number, number>();
      const pricePointsBySymbol: Array<{ date: number; value: number }> = [];

      transactions.forEach((tx) => {
        const day = normalizeDateStart(tx.date).getTime();
        const qtyDelta = tx.type === 'compra' ? tx.quantity : -tx.quantity;
        quantityDeltasByDay.set(day, (quantityDeltasByDay.get(day) || 0) + qtyDelta);
        const totalValue = getTransactionValue(tx);
        const appliedDelta = tx.type === 'compra' ? totalValue : -totalValue;
        appliedDeltasByDay.set(day, (appliedDeltasByDay.get(day) || 0) + appliedDelta);
        cashFlowsByDay.set(day, (cashFlowsByDay.get(day) || 0) + appliedDelta);
        const priceValue = tx.price > 0 ? tx.price : tx.quantity > 0 ? totalValue / tx.quantity : 0;
        if (priceValue > 0) pricePointsBySymbol.push({ date: day, value: priceValue });
      });

      if (transactions.length === 0 && portfolio.quantity > 0) {
        const day = normalizeDateStart(portfolio.lastUpdate || new Date()).getTime();
        const investedValue =
          portfolio.totalInvested > 0
            ? portfolio.totalInvested
            : portfolio.quantity * portfolio.avgPrice;
        quantityDeltasByDay.set(day, portfolio.quantity);
        appliedDeltasByDay.set(day, investedValue);
        cashFlowsByDay.set(day, investedValue);
        if (portfolio.avgPrice > 0)
          pricePointsBySymbol.push({ date: day, value: portfolio.avgPrice });
      }

      const history = await fetchAssetHistoryFromDb(ticker, effectiveStart);
      const allHistory = [...history, ...pricePointsBySymbol];
      const initialPrice = pricePointsBySymbol[0]?.value ?? portfolio.avgPrice;
      const priceMap = buildDailyPriceMap(allHistory, dayTimeline, initialPrice);
      const fallbackPrice = portfolio.avgPrice > 0 ? portfolio.avgPrice : 0;

      let quantitiesBySymbol = 0;
      let valorAplicadoDia = 0;

      for (const day of dayTimeline) {
        const qtyDelta = quantityDeltasByDay.get(day) || 0;
        quantitiesBySymbol += qtyDelta;
        valorAplicadoDia += appliedDeltasByDay.get(day) || 0;
        const price = priceMap.get(day) ?? fallbackPrice;
        const saldoBrutoDia =
          quantitiesBySymbol > 0 && price && price > 0
            ? quantitiesBySymbol * price
            : valorAplicadoDia;
        historicoPatrimonio.push({
          data: day,
          valorAplicado: Math.round(valorAplicadoDia * 100) / 100,
          saldoBruto: Math.round(saldoBrutoDia * 100) / 100,
        });
      }

      historicoTWR = calculateHistoricoTWR(historicoPatrimonio, cashFlowsByDay).map((h) => ({
        date: h.data,
        value: h.value,
      }));
    }

    return NextResponse.json({
      ativo: {
        nome,
        ticker,
        instituicao: null,
      },
      posicao: {
        quantidade: portfolio.quantity,
        precoMedio: portfolio.avgPrice,
        valorAplicado,
        saldoBruto,
        rentabilidade,
        resultado,
        cotacaoAtual,
      },
      transacoes,
      historicoPatrimonio,
      historicoTWR,
      proventos,
      fundamentos: {
        pl: fundamentals.pl !== null ? fundamentals.pl : '—',
        beta: fundamentals.beta !== null ? fundamentals.beta : '—',
        dividendYield:
          fundamentals.dividendYield !== null ? `${fundamentals.dividendYield.toFixed(2)}%` : '—',
      },
    });
  },
);

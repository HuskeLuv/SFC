import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAssetHistory } from '@/services/pricing/assetPriceService';
import {
  buildDailyTimeline,
  calculateHistoricoTWR,
  normalizeDateStart,
} from '@/services/portfolio/patrimonioHistoricoBuilder';
import { nextBusinessDayB3 } from '@/utils/feriadosB3';
import { resolveProventoEvents } from '@/services/portfolio/resolveProventos';
import {
  APPLICABLE_CORPORATE_ACTION_TYPES,
  buildQuantityTimeline,
  quantityAtDate,
} from '@/services/portfolio/corporateActions';

import { withErrorHandler } from '@/utils/apiErrorHandler';
interface IndexData {
  date: number;
  value: number;
  /** Valor de mercado dos ativos SEM o caixa de proventos (input do TWR). */
  marketValue?: number;
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
  logger.info(
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

// TWR delegado ao calculateHistoricoTWR do builder (mesma implementação do
// /api/carteira/resumo). A cópia local que vivia aqui divergia do primário em
// DUAS semânticas: forçava 0 no 1º ponto (descartava o ganho instantâneo
// preço-pago vs mercado que o padrão Kinvo inclui) e, combinada com o lookup
// de quantidade por timestamp cru (ver portfolioValues abaixo), gerava pares
// de retorno fantasma ±10-40% nos dias de aporte — fallback fechava +16,9%
// enquanto o primário fechava -16,9% pro mesmo usuário.

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
      asset: { select: { symbol: true, type: true } },
    },
    orderBy: {
      date: 'asc',
    },
  });

  // Filtrar transações que têm símbolo/ticker e podem ter histórico na brapi
  const transactionsFiltradas = transactions.filter((trans) => {
    const symbol = trans.asset?.symbol;
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
    const symbol = trans.asset?.symbol;
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
  const pricePointsBySymbol = new Map<string, IndexData[]>();

  transactionsFiltradas.forEach((trans) => {
    const symbol = trans.asset?.symbol;
    if (!symbol) return;

    // Quando tx cai em fim-de-semana/feriado, ancora no próximo dia útil B3 —
    // convenção D+next ANBIMA. Sem isso, o cashflow desse tx some no TWR
    // porque a timeline filtrada (sem feriados) não tem essa key.
    const rawDayKey = getDayKey(new Date(trans.date).getTime());
    const dayKey = nextBusinessDayB3(rawDayKey);
    const value = getTransactionValue(trans);

    // Pré-janela: a timeline de quantidade split-aware (buildQuantityTimeline)
    // já captura a posição herdada; não precisa de preStartQuantities.
    if (dayKey < timelineStart.getTime()) return;

    const cashFlowDelta = trans.type === 'compra' ? value : -value;
    cashFlowsByDay.set(dayKey, (cashFlowsByDay.get(dayKey) || 0) + cashFlowDelta);

    // Preço CRU da transação como ponto-âncora (des-ajustado pelo split mais
    // abaixo, pra casar com a escala ajustada do preço de mercado e a quantidade
    // split-aware). Sem o des-ajuste, qty pós-split × preço cru pré-split inflaria.
    const priceValue =
      trans.price > 0 ? trans.price : trans.quantity > 0 ? value / trans.quantity : 0;
    if (priceValue > 0) {
      if (!pricePointsBySymbol.has(symbol)) {
        pricePointsBySymbol.set(symbol, []);
      }
      pricePointsBySymbol.get(symbol)!.push({ date: dayKey, value: priceValue });
    }
  });

  // Proventos (líquidos de IRRF) entram como CAIXA/direito-a-receber no
  // `bookingDay` (= data de PAGAMENTO snapada pro pregão), espelhando o Kinvo, que
  // credita o provento no pagamento. NÃO são cashflow (não entram em
  // cashFlowsByDay): são retorno. (`bookingDay` já vem snapado pro pregão.)
  const proventosByDay = new Map<number, number>();
  const { events: proventoEvents } = await resolveProventoEvents(targetUserId);
  for (const ev of proventoEvents) {
    if (!(ev.net > 0)) continue;
    const dayKey = ev.bookingDay;
    if (dayKey < timelineStart.getTime() || dayKey > today.getTime()) continue;
    proventosByDay.set(dayKey, (proventosByDay.get(dayKey) || 0) + ev.net);
  }

  const entries = await Promise.all(
    Array.from(transactionsPorSimbolo.keys()).map(async (symbol) => {
      const [historico, cas] = await Promise.all([
        fetchAssetHistoryFromDb(symbol, timelineStart),
        prisma.assetCorporateAction.findMany({
          where: { symbol, type: { in: Array.from(APPLICABLE_CORPORATE_ACTION_TYPES) } },
          orderBy: { date: 'asc' },
          select: { date: true, type: true, factor: true },
        }),
      ]);
      return [symbol, historico, cas] as const;
    }),
  );
  const corporateActionsBySymbol = new Map<
    string,
    Array<{ date: Date; type: string; factor: number }>
  >();
  for (const [symbol, historico, cas] of entries) {
    historicosPorAtivo.set(symbol, historico);
    corporateActionsBySymbol.set(symbol, cas);
  }

  // Quantidade SPLIT-AWARE por símbolo (replay de transações + eventos) + fator
  // acumulado pós-data. O preço de mercado (getAssetHistory) já vem ajustado, então
  // a quantidade TEM que ser pós-split e o preço de transação injetado, des-ajustado
  // pra mesma escala — senão qty pós-split × preço cru pré-split infla o saldo (~10×).
  const quantityTimelineBySymbol = new Map<string, ReturnType<typeof buildQuantityTimeline>>();
  const cumFactorAfterBySymbol = new Map<string, (dayMs: number) => number>();
  transactionsPorSimbolo.forEach((txs, symbol) => {
    const cas = corporateActionsBySymbol.get(symbol) ?? [];
    quantityTimelineBySymbol.set(symbol, buildQuantityTimeline(txs, cas));
    cumFactorAfterBySymbol.set(symbol, (dayMs: number) =>
      cas.reduce(
        (f, ca) =>
          normalizeDateStart(ca.date).getTime() > dayMs && ca.factor > 0 ? f * ca.factor : f,
        1,
      ),
    );
  });

  // Des-ajusta os pontos de preço de transação (crus) pela escala pós-split.
  pricePointsBySymbol.forEach((points, symbol) => {
    const cumFactorAfter = cumFactorAfterBySymbol.get(symbol);
    if (!cumFactorAfter) return;
    for (const p of points) {
      const f = cumFactorAfter(p.date);
      if (f !== 1) p.value = p.value / f;
    }
  });

  const pricesBySymbol = new Map<string, Map<number, number>>();
  historicosPorAtivo.forEach((historico, symbol) => {
    const pricePoints = pricePointsBySymbol.get(symbol) || [];
    const history = [...historico, ...pricePoints];
    const initialPrice = pricePoints.length > 0 ? pricePoints[0]?.value : undefined;
    pricesBySymbol.set(symbol, buildDailyPriceMap(history, timeline, initialPrice));
  });

  const portfolioValues: IndexData[] = [];
  let proventosAcumulados = 0;

  for (const day of timeline) {
    let portfolioTotal = 0;

    pricesBySymbol.forEach((priceMap, symbol) => {
      const qtyTimeline = quantityTimelineBySymbol.get(symbol);
      // Lookup por FIM do dia UTC: tx gravada com hora (ex.: 03:00Z = meia-noite
      // BRT) tem timestamp > day (00:00Z) e ficava fora do próprio dia — a
      // quantidade só entrava no dia seguinte enquanto o cashflow (normalizado
      // por day-key) já tinha saído, criando o par de retornos fantasma.
      const actualQty = qtyTimeline ? quantityAtDate(qtyTimeline, day + DAY_MS - 1) : 0;
      if (actualQty <= 0) return;

      // quantityAtDate dá a quantidade REAL na data (100 antes do split, 1000
      // depois). O preço de mercado já vem ajustado (escala pós-split), então
      // normalizamos a quantidade pra pós-split (× fator dos eventos posteriores)
      // pra a escala bater em TODA a série — senão o saldo pré-split fica 10× menor
      // que o pós-split (penhasco no dia do split).
      const cumFactorAfter = cumFactorAfterBySymbol.get(symbol);
      const quantity = cumFactorAfter ? actualQty * cumFactorAfter(day) : actualQty;

      const price = priceMap.get(day);
      if (price && price > 0) {
        portfolioTotal += quantity * price;
      }
    });

    // Caixa de proventos acumulada até o dia — usada só na série do MWR
    // (retorno total money-weighted inclui o caixa recebido no terminal).
    proventosAcumulados += proventosByDay.get(day) ?? 0;

    portfolioValues.push({
      date: day,
      value: Math.round((portfolioTotal + proventosAcumulados) * 100) / 100,
      marketValue: Math.round(portfolioTotal * 100) / 100,
    });
  }

  if (portfolioValues.length > 1) {
    logSeriesStats(portfolioValues, 'Carteira-Valor');
  }

  // TWR: valor de mercado + provento do dia como renda (padrão do builder pós
  // metodologia renda-do-período) — o acumulado NÃO fica na base diluindo.
  const twrSeries = calculateHistoricoTWR(
    portfolioValues.map((p) => ({ data: p.date, saldoBruto: p.marketValue ?? p.value })),
    cashFlowsByDay,
    proventosByDay,
  ).map((p) => ({ date: p.data, value: p.value }));

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

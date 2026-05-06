import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAssetPrices, getAssetHistory } from '@/services/pricing/assetPriceService';
import { getDividends } from '@/services/pricing/dividendService';
import { getFundamentals } from '@/services/pricing/fundamentalsService';
import {
  extractMonthlyCloses,
  monthlyReturnsFromCloses,
} from '@/services/analises/sensibilidadeCarteira';
import { calcularIRRendaFixa } from '@/services/ir/fixedIncomeIR';
import {
  buildDailyTimeline as buildBusinessDayTimeline,
  buildFixedIncomeFactorSeries,
  normalizeDateStart as normalizeDateStartShared,
  type CdiDaily,
  type IpcaMonthly,
  type TesouroPU,
  type FixedIncomeAssetWithAsset,
} from '@/services/portfolio/patrimonioHistoricoBuilder';
import { nextBusinessDayB3 } from '@/utils/feriadosB3';

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

// UTC midnight pra alinhar com tx.date (UTC). setHours local em BRT shifta
// pro dia anterior, fazendo cashFlowsByDay/TWR perder o ponto inicial do ativo.
const getDayKey = (ts: number): number => {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
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

const round2 = (n: number) => Math.round(n * 100) / 100;

type PortfolioForFI = {
  id: string;
  assetId: string | null;
  asset: { symbol: string; name: string; type?: string | null } | null;
};

type FixedIncomeRecord = {
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
  tesouroBondType: string | null;
  tesouroMaturity: Date | null;
};

const MAX_HISTORICO_MESES_FI = 24;

const buildFixedIncomeResponse = async (portfolio: PortfolioForFI, fi: FixedIncomeRecord) => {
  const hoje = normalizeDateStartShared(new Date());
  const startDate = normalizeDateStartShared(fi.startDate);
  const maturityDate = normalizeDateStartShared(fi.maturityDate);

  // Sempre acumula o fator a partir da startDate real (para o TWR exibido ser correto),
  // mas limita a janela exibida a MAX_HISTORICO_MESES_FI meses.
  const minStart = new Date(hoje.getFullYear(), hoje.getMonth() - MAX_HISTORICO_MESES_FI, 1);
  const displayStart =
    startDate.getTime() < minStart.getTime() ? normalizeDateStartShared(minStart) : startDate;

  const fullTimeline = buildBusinessDayTimeline(startDate, hoje);

  // Queries bounded pelo range do ativo
  const [cdiRows, ipcaRows, tesouroRows] = await Promise.all([
    fi.indexer === 'CDI' || fi.tesouroBondType
      ? prisma.economicIndex.findMany({
          where: { indexType: 'CDI', date: { gte: startDate, lte: hoje } },
          orderBy: { date: 'asc' },
        })
      : Promise.resolve([] as Array<{ date: Date; value: unknown }>),
    fi.indexer === 'IPCA' || fi.tesouroBondType
      ? prisma.economicIndex.findMany({
          where: { indexType: 'IPCA', date: { gte: startDate, lte: hoje } },
          orderBy: { date: 'asc' },
        })
      : Promise.resolve([] as Array<{ date: Date; value: unknown }>),
    fi.tesouroBondType && fi.tesouroMaturity
      ? prisma.tesouroDiretoPrice.findMany({
          where: {
            bondType: fi.tesouroBondType,
            maturityDate: fi.tesouroMaturity,
            baseDate: { gte: startDate, lte: hoje },
          },
          orderBy: { baseDate: 'asc' },
        })
      : Promise.resolve(
          [] as Array<{ baseDate: Date; basePU: unknown; sellPU: unknown; buyPU: unknown }>,
        ),
  ]);

  const cdi: CdiDaily = new Map();
  cdiRows.forEach((row) => {
    const val = Number(row.value);
    if (Number.isFinite(val)) cdi.set(normalizeDateStartShared(row.date).getTime(), val);
  });

  const ipca: IpcaMonthly = new Map();
  ipcaRows.forEach((row) => {
    const val = Number(row.value);
    if (!Number.isFinite(val)) return;
    const d = new Date(row.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    ipca.set(key, val);
  });

  const tesouroPU: TesouroPU = new Map();
  let tesouroPUAtStart = 0;
  if (tesouroRows.length > 0) {
    tesouroRows.forEach((row) => {
      const pu = Number(row.basePU ?? 0) || Number(row.sellPU ?? 0) || Number(row.buyPU ?? 0);
      if (Number.isFinite(pu) && pu > 0) {
        tesouroPU.set(normalizeDateStartShared(row.baseDate).getTime(), pu);
      }
    });
    // PU em (ou o primeiro após) a data de aplicação
    const startKey = startDate.getTime();
    const sortedKeys = Array.from(tesouroPU.keys()).sort((a, b) => a - b);
    const candidateAtOrBefore = [...sortedKeys].reverse().find((k) => k <= startKey);
    const firstAfter = sortedKeys.find((k) => k >= startKey);
    const chosen = candidateAtOrBefore ?? firstAfter;
    if (chosen !== undefined) tesouroPUAtStart = tesouroPU.get(chosen) ?? 0;
  }

  const fiWithAsset: FixedIncomeAssetWithAsset = {
    id: fi.id,
    userId: fi.userId,
    assetId: fi.assetId,
    type: fi.type,
    description: fi.description,
    startDate: fi.startDate,
    maturityDate: fi.maturityDate,
    investedAmount: fi.investedAmount,
    annualRate: fi.annualRate,
    indexer: fi.indexer,
    indexerPercent: fi.indexerPercent,
    liquidityType: fi.liquidityType,
    taxExempt: fi.taxExempt,
    tesouroBondType: fi.tesouroBondType,
    tesouroMaturity: fi.tesouroMaturity,
    asset: portfolio.asset ?? null,
  };

  const factorByDay = buildFixedIncomeFactorSeries(fiWithAsset, fullTimeline, {
    cdi,
    ipca,
    tesouroPU,
    tesouroPUAtStart,
  });

  const displayStartTs = displayStart.getTime();
  const displayTimeline = fullTimeline.filter((d) => d >= displayStartTs);

  const historicoPatrimonio = displayTimeline.map((day) => ({
    data: day,
    valorAplicado: round2(fi.investedAmount),
    saldoBruto: round2(fi.investedAmount * (factorByDay.get(day) ?? 1)),
  }));

  // Fluxo único na inception (quando dentro da janela de exibição). Se a
  // inception caiu em fim-de-semana/feriado, ancora no próximo dia útil pra
  // alinhar com a timeline filtrada (senão o TWR perde esse cashflow).
  const cashFlowsByDay = new Map<number, number>();
  const startTsRaw = normalizeDateStartShared(startDate).getTime();
  const startTs = nextBusinessDayB3(startTsRaw);
  if (startTs >= displayStartTs) {
    cashFlowsByDay.set(startTs, fi.investedAmount);
  }

  const historicoTWR = (() => {
    // Reutiliza a fórmula de TWR: (saldo_t - saldo_{t-1} - fluxo_t) / saldo_{t-1}
    if (historicoPatrimonio.length === 0) return [] as Array<{ date: number; value: number }>;
    const out: Array<{ date: number; value: number }> = [];
    let cumulative = 1;
    for (let i = 0; i < historicoPatrimonio.length; i++) {
      if (i === 0) {
        out.push({ date: historicoPatrimonio[i].data, value: 0 });
        continue;
      }
      const vInicial = historicoPatrimonio[i - 1].saldoBruto;
      const vFinal = historicoPatrimonio[i].saldoBruto;
      const fluxo = cashFlowsByDay.get(historicoPatrimonio[i].data) ?? 0;
      let retornoDia = 0;
      if (vInicial > 0) {
        retornoDia = (vFinal - vInicial - fluxo) / vInicial;
        if (!Number.isFinite(retornoDia) || retornoDia > 0.5 || retornoDia < -0.5) retornoDia = 0;
      }
      cumulative *= 1 + retornoDia;
      out.push({
        date: historicoPatrimonio[i].data,
        value: Math.round((cumulative - 1) * 10000) / 100,
      });
    }
    return out;
  })();

  const finalFactor = factorByDay.get(fullTimeline[fullTimeline.length - 1]) ?? 1;
  const saldoBruto = round2(fi.investedAmount * finalFactor);
  const valorAplicado = round2(fi.investedAmount);
  const resultado = round2(saldoBruto - valorAplicado);
  const rentabilidade = valorAplicado > 0 ? (resultado / valorAplicado) * 100 : 0;

  // IR projetado se resgatar hoje (tabela regressiva ou isenção PF para LCI/LCA/CRI/CRA/LIG).
  const ir = calcularIRRendaFixa({
    type: fi.type,
    isTesouro: Boolean(fi.tesouroBondType),
    startDate: fi.startDate,
    valorAplicado,
    saldoBruto,
  });

  return NextResponse.json({
    ativo: {
      nome: portfolio.asset?.name || fi.description,
      ticker: portfolio.asset?.symbol || '',
      instituicao: null,
    },
    posicao: {
      quantidade: 1,
      precoMedio: valorAplicado,
      valorAplicado,
      saldoBruto,
      rentabilidade,
      resultado,
      cotacaoAtual: saldoBruto,
    },
    transacoes: [
      {
        id: `fi-inception-${fi.id}`,
        tipoOperacao: 'Aporte',
        quantity: 1,
        price: valorAplicado,
        total: valorAplicado,
        date: fi.startDate.toISOString(),
        fees: null,
        notes: null,
      },
      ...(maturityDate.getTime() <= hoje.getTime()
        ? [
            {
              id: `fi-maturity-${fi.id}`,
              tipoOperacao: 'Vencimento',
              quantity: 1,
              price: saldoBruto,
              total: saldoBruto,
              date: fi.maturityDate.toISOString(),
              fees: null,
              notes: null,
            },
          ]
        : []),
    ],
    historicoPatrimonio,
    historicoTWR,
    proventos: [],
    fundamentos: {
      pl: '—',
      beta: '—',
      dividendYield: '—',
    },
    ir,
    isFixedIncome: true,
  });
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

    const fixedIncome = portfolio.assetId
      ? await prisma.fixedIncomeAsset.findUnique({ where: { assetId: portfolio.assetId } })
      : null;

    if (fixedIncome) {
      return await buildFixedIncomeResponse(portfolio, fixedIncome);
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
    let riskAndReturn: {
      sharpe: number;
      volatilidade: number;
      retornoAnual: number;
      retornoCDI: number;
    } | null = null;

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
        // tx em weekend/feriado é ancorado no próximo BD pra alinhar com timeline filtrada.
        // normalizeDateStartShared (UTC) em vez do local pra evitar shift de dia em BRT.
        const dayRaw = normalizeDateStartShared(tx.date).getTime();
        const day = nextBusinessDayB3(dayRaw);
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
        const day = nextBusinessDayB3(
          normalizeDateStartShared(portfolio.lastUpdate || new Date()).getTime(),
        );
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

      // Risk & return do ativo individual (sharpe, vol anualizada ×√252, retorno anualizado,
      // CDI no mesmo período). Espelha o `riskAndReturn` que o Kinvo expõe em
      // /ProductAnalysis/GetPeriodicProductProfitability/{id}/4.
      //
      // Usa janela fixa de 24m a partir de hoje (independente da data da primeira compra do
      // usuário) para que o cálculo seja sobre o desempenho do ATIVO, não da posição.
      const riskWindowStart = new Date(hoje.getFullYear(), hoje.getMonth() - 24, 1);
      const riskHistory = await fetchAssetHistoryFromDb(ticker, riskWindowStart);
      if (riskHistory.length >= 30) {
        const monthlyCloses = extractMonthlyCloses(riskHistory);
        const monthlyReturnsMap = monthlyReturnsFromCloses(monthlyCloses);
        const monthlyReturns = Array.from(monthlyReturnsMap.values());
        const dailyReturns: number[] = [];
        for (let i = 1; i < riskHistory.length; i++) {
          const prev = riskHistory[i - 1].value;
          const curr = riskHistory[i].value;
          if (prev > 0 && curr > 0) dailyReturns.push(curr / prev - 1);
        }
        if (monthlyReturns.length >= 2 && dailyReturns.length >= 2) {
          // Retorno anualizado: composição geométrica dos retornos mensais.
          const produto = monthlyReturns.reduce((acc, r) => acc * (1 + r), 1);
          const meses = monthlyReturns.length;
          const retornoAnual =
            meses >= 12 ? (produto ** (12 / meses) - 1) * 100 : (produto - 1) * 100;

          // Vol anualizada com √252 (convenção de mercado).
          const mediaD = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
          const varD =
            dailyReturns.reduce((s, r) => s + (r - mediaD) ** 2, 0) / (dailyReturns.length - 1);
          const volatilidade = Math.sqrt(varD) * Math.sqrt(252) * 100;

          // CDI alinhado aos mesmos meses do retorno do ativo.
          const monthsKeys = Array.from(monthlyReturnsMap.keys()).sort();
          if (monthsKeys.length > 0) {
            const oldestMonth = monthsKeys[0];
            const [oldYear, oldMonth] = oldestMonth.split('-').map(Number);
            const cdiStart = new Date(oldYear, oldMonth - 1, 1);
            const cdiRecords = await prisma.economicIndex.findMany({
              where: { indexType: 'CDI', date: { gte: cdiStart } },
              orderBy: { date: 'asc' },
            });
            const cdiByMonth = new Map<string, number>();
            for (const r of cdiRecords) {
              const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`;
              cdiByMonth.set(key, (cdiByMonth.get(key) ?? 1) * (1 + Number(r.value)));
            }
            const cdiProduto = monthsKeys.reduce((acc, k) => acc * (cdiByMonth.get(k) ?? 1), 1);
            const retornoCDI =
              meses >= 12 ? (cdiProduto ** (12 / meses) - 1) * 100 : (cdiProduto - 1) * 100;
            const sharpe = volatilidade > 0 ? (retornoAnual - retornoCDI) / volatilidade : 0;
            const round = (n: number) => Math.round(n * 100) / 100;
            riskAndReturn = {
              sharpe: round(sharpe),
              volatilidade: round(volatilidade),
              retornoAnual: round(retornoAnual),
              retornoCDI: round(retornoCDI),
            };
          }
        }
      }
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
      riskAndReturn,
    });
  },
);

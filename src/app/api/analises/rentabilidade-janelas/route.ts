import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import {
  buildPatrimonioHistorico,
  filterInvestmentsExclReservas,
  type FixedIncomeAssetWithAsset,
} from '@/services/portfolio/patrimonioHistoricoBuilder';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import { computePortfolioLiveTotals } from '@/services/portfolio/portfolioLiveTotals';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Rentabilidade da carteira em janelas pré-cortadas (lastDay, inTheMonth,
 * inTheYear, in12Months, in24Months, in36Months, fromBegin) com o CDI no
 * mesmo período. Espelha o GetPeriodicPortfolioProfitability do Kinvo, que
 * entrega esses cortes prontos num único response — evita o front ter que
 * cortar a série de patrimônio-historico em cada janela.
 */

type WindowKey =
  | 'lastDay'
  | 'inTheMonth'
  | 'inTheYear'
  | 'in12Months'
  | 'in24Months'
  | 'in36Months'
  | 'fromBegin';

interface WindowMetric {
  portfolioReturn: number;
  cdiReturn: number;
  excessOverCdi: number;
  fromDate: string | null;
  toDate: string | null;
}

interface RentabilidadeJanelasResponse {
  asOf: string;
  janelas: Record<WindowKey, WindowMetric>;
}

/** TWR acumulado interpolado em uma data de referência (busca o ponto mais próximo <= ref). */
function twrAt(serie: Array<{ data: number; value: number }>, refMs: number): number | null {
  if (serie.length === 0) return null;
  if (refMs <= serie[0].data) return serie[0].value;
  if (refMs >= serie[serie.length - 1].data) return serie[serie.length - 1].value;
  // Binary search for largest data <= refMs
  let lo = 0;
  let hi = serie.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (serie[mid].data <= refMs) lo = mid;
    else hi = mid - 1;
  }
  return serie[lo].value;
}

/**
 * Retorno da janela: composição correta usa (1 + twrFinal) / (1 + twrInicial) - 1,
 * onde twr é fração (não percentual). historicoTWR.value vem em percentual.
 */
function windowReturnPct(
  serie: Array<{ data: number; value: number }>,
  fromMs: number,
  toMs: number,
): number {
  const twrFromPct = twrAt(serie, fromMs);
  const twrToPct = twrAt(serie, toMs);
  if (twrFromPct === null || twrToPct === null) return 0;
  const fromFrac = 1 + twrFromPct / 100;
  const toFrac = 1 + twrToPct / 100;
  if (fromFrac <= 0) return 0;
  return (toFrac / fromFrac - 1) * 100;
}

/** CDI acumulado entre [fromMs, toMs] usando taxas diárias. */
function cdiReturnPct(
  cdiRecords: Array<{ date: Date; value: unknown }>,
  fromMs: number,
  toMs: number,
): number {
  if (toMs <= fromMs) return 0;
  let acumulado = 1;
  for (const r of cdiRecords) {
    const ts = r.date.getTime();
    if (ts < fromMs || ts > toMs) continue;
    acumulado *= 1 + Number(r.value);
  }
  return (acumulado - 1) * 100;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const [portfolio, stockTransactions, investmentGroups, fixedIncomeAssets] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
    }),
    prisma.stockTransaction.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
      orderBy: { date: 'asc' },
    }),
    prisma.cashflowGroup.findMany({
      where: { userId: targetUserId, type: 'investimento' },
      include: { items: { include: { values: true } } },
    }),
    prisma.fixedIncomeAsset.findMany({
      where: { userId: targetUserId },
      include: { asset: true },
    }),
  ]);

  const allInvestments = investmentGroups.flatMap((g) => g.items || []);
  const cashflowInvestments = filterInvestmentsExclReservas(allInvestments);

  const fiPricer = await createFixedIncomePricer(targetUserId, {
    preloadedAssets: fixedIncomeAssets as unknown as FixedIncomeAssetWithAsset[],
  });

  const { saldoBruto, valorAplicado } = await computePortfolioLiveTotals({
    portfolio,
    fixedIncomeAssets: fixedIncomeAssets as unknown as FixedIncomeAssetWithAsset[],
    investmentsExclReservas: cashflowInvestments,
    fiPricer,
  });

  const built = await buildPatrimonioHistorico({
    portfolio,
    fixedIncomeAssets,
    stockTransactions,
    investmentsExclReservas: cashflowInvestments,
    saldoBrutoAtual: saldoBruto,
    valorAplicadoAtual: valorAplicado,
    maxHistoricoMonths: 36,
    patchLastDayWithLiveTotals: true,
    fixedIncomeValueSeriesBuilder: fiPricer.buildValueSeriesForAsset,
  });

  const serie = built.historicoTWR;
  if (serie.length === 0) {
    const empty: WindowMetric = {
      portfolioReturn: 0,
      cdiReturn: 0,
      excessOverCdi: 0,
      fromDate: null,
      toDate: null,
    };
    const janelas: Record<WindowKey, WindowMetric> = {
      lastDay: empty,
      inTheMonth: empty,
      inTheYear: empty,
      in12Months: empty,
      in24Months: empty,
      in36Months: empty,
      fromBegin: empty,
    };
    return NextResponse.json({
      asOf: new Date().toISOString(),
      janelas,
    } as RentabilidadeJanelasResponse);
  }

  // CDI dos últimos 36 meses para todas as janelas (com folga de 1 dia).
  const trintaSeisMesesAtras = new Date();
  trintaSeisMesesAtras.setFullYear(trintaSeisMesesAtras.getFullYear() - 3);
  trintaSeisMesesAtras.setHours(0, 0, 0, 0);
  const cdiRecords = await prisma.economicIndex.findMany({
    where: { indexType: 'CDI', date: { gte: trintaSeisMesesAtras } },
    orderBy: { date: 'asc' },
  });

  const lastPoint = serie[serie.length - 1];
  const firstPoint = serie[0];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeMs = hoje.getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const startOfMonth = new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime();
  const startOfYear = new Date(hoje.getFullYear(), 0, 1).getTime();
  const minus = (months: number) => {
    const d = new Date(hoje);
    d.setMonth(d.getMonth() - months);
    return d.getTime();
  };

  const buildWindow = (fromMs: number, toMs: number): WindowMetric => {
    // Clamp aos limites da série (só importa se a janela exceder o histórico disponível).
    const clampedFrom = Math.max(fromMs, firstPoint.data);
    const clampedTo = Math.min(toMs, lastPoint.data);
    if (clampedTo <= clampedFrom) {
      return {
        portfolioReturn: 0,
        cdiReturn: 0,
        excessOverCdi: 0,
        fromDate: new Date(clampedFrom).toISOString(),
        toDate: new Date(clampedTo).toISOString(),
      };
    }
    const portfolioReturn = windowReturnPct(serie, clampedFrom, clampedTo);
    const cdiR = cdiReturnPct(cdiRecords, clampedFrom, clampedTo);
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      portfolioReturn: round(portfolioReturn),
      cdiReturn: round(cdiR),
      excessOverCdi: round(portfolioReturn - cdiR),
      fromDate: new Date(clampedFrom).toISOString(),
      toDate: new Date(clampedTo).toISOString(),
    };
  };

  const janelas: Record<WindowKey, WindowMetric> = {
    lastDay: buildWindow(lastPoint.data - DAY_MS, lastPoint.data),
    inTheMonth: buildWindow(startOfMonth, hojeMs),
    inTheYear: buildWindow(startOfYear, hojeMs),
    in12Months: buildWindow(minus(12), hojeMs),
    in24Months: buildWindow(minus(24), hojeMs),
    in36Months: buildWindow(minus(36), hojeMs),
    fromBegin: buildWindow(firstPoint.data, lastPoint.data),
  };

  return NextResponse.json({
    asOf: new Date().toISOString(),
    janelas,
  } as RentabilidadeJanelasResponse);
});

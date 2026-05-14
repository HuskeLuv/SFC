import { prisma } from '@/lib/prisma';
import {
  buildPatrimonioCashFlowsByDayOnly,
  calculateHistoricoTWR,
  normalizeDateStart,
} from './patrimonioHistoricoBuilder';
import { loadCarteiraHistoricoData } from './carteiraHistoricoDataLoader';

export type SnapshotHistoricoBundle = {
  historicoPatrimonio: Array<{ data: number; valorAplicado: number; saldoBruto: number }>;
  historicoTWR: Array<{ data: number; value: number }>;
  historicoTWRPeriodo: Array<{ data: number; value: number }>;
  coverageOk: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Lê snapshots + performance entre datas. O ponto "hoje" com totais ao vivo
 * NÃO é mais injetado: a precificação live divergia da engine usada nos dias
 * anteriores (assetPriceHistory) e produzia drop artificial em TWR/MWR no
 * último ponto do gráfico de rentabilidade. O chart termina no último snapshot
 * do cron; cards de Saldo Bruto/Rentabilidade no topo do dashboard continuam
 * live por virem de um caminho independente.
 *
 * `liveSaldoBruto`/`liveValorAplicado` continuam no shape pra compatibilidade
 * com os callers existentes — apenas são ignorados.
 */
export const loadHistoricoFromSnapshots = async (
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  options?: {
    liveSaldoBruto?: number;
    liveValorAplicado?: number;
    twrStartDate?: number;
  },
): Promise<SnapshotHistoricoBundle> => {
  const start = normalizeDateStart(rangeStart);
  const end = normalizeDateStart(rangeEnd);

  const [rows, perfRows] = await Promise.all([
    prisma.portfolioDailySnapshot.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
      select: { date: true, totalValue: true, totalInvested: true },
    }),
    prisma.portfolioPerformance.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
      select: { date: true, cumulativeReturn: true },
    }),
  ]);

  const historicoPatrimonio = rows.map((r) => ({
    data: normalizeDateStart(r.date).getTime(),
    valorAplicado: Number(r.totalInvested),
    saldoBruto: Number(r.totalValue),
  }));

  const perfByDay = new Map<number, number>();
  perfRows.forEach((p) => {
    perfByDay.set(normalizeDateStart(p.date).getTime(), Number(p.cumulativeReturn));
  });

  const historicoTWR = historicoPatrimonio.map((p) => ({
    data: p.data,
    value: perfByDay.get(p.data) ?? 0,
  }));

  const lastSnap =
    rows.length > 0 ? normalizeDateStart(rows[rows.length - 1].date).getTime() : null;
  const gapDays = lastSnap != null ? (end.getTime() - lastSnap) / MS_PER_DAY : 999;

  let historicoTWRPeriodo: Array<{ data: number; value: number }> = [];
  const twrStart = options?.twrStartDate;
  if (
    typeof twrStart === 'number' &&
    Number.isFinite(twrStart) &&
    twrStart > 0 &&
    historicoPatrimonio.length > 0
  ) {
    const periodStart = normalizeDateStart(new Date(twrStart)).getTime();
    const periodEnd = end.getTime();
    if (periodStart <= periodEnd) {
      const { portfolio, fixedIncomeAssets, stockTransactions, investmentsExclReservas } =
        await loadCarteiraHistoricoData(userId);
      const timeline = historicoPatrimonio.map((p) => p.data);
      const cashFlowsByDay = buildPatrimonioCashFlowsByDayOnly(
        portfolio,
        fixedIncomeAssets,
        stockTransactions,
        investmentsExclReservas,
        timeline,
      );

      const beforePeriod = historicoPatrimonio.filter((p) => p.data < periodStart);
      const patrimonyAtStart =
        beforePeriod.length > 0
          ? beforePeriod[beforePeriod.length - 1]!.saldoBruto
          : historicoPatrimonio[0]!.saldoBruto;
      const periodPatrimonio = historicoPatrimonio.filter((p) => p.data >= periodStart);
      if (periodPatrimonio.length > 0) {
        const periodPatrimonioSeries = [
          { data: periodStart, valorAplicado: 0, saldoBruto: patrimonyAtStart },
          ...periodPatrimonio,
        ];
        const periodCashFlows = new Map<number, number>();
        periodPatrimonioSeries.forEach((p) => {
          const cfv = cashFlowsByDay.get(p.data);
          if (cfv !== undefined && cfv !== 0) periodCashFlows.set(p.data, cfv);
        });
        historicoTWRPeriodo = calculateHistoricoTWR(periodPatrimonioSeries, periodCashFlows);
      }
    }
  }

  const coverageOk = rows.length > 0 && gapDays <= 4;

  return {
    historicoPatrimonio,
    historicoTWR,
    historicoTWRPeriodo,
    coverageOk,
  };
};

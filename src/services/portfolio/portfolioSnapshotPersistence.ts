import { prisma } from '@/lib/prisma';
import { normalizeDateStart } from './patrimonioHistoricoBuilder';
import { buildPatrimonioHistorico } from './patrimonioHistoricoBuilder';
import { loadCarteiraHistoricoData } from './carteiraHistoricoDataLoader';
import { createFixedIncomePricer } from './fixedIncomePricing';

const batchSize = 50;

const toDayDate = (ts: number): Date => normalizeDateStart(new Date(ts));

/**
 * Number of trailing days to persist per cron run.
 * The full history is still computed (needed for TWR), but only the
 * last PERSIST_TAIL_DAYS entries are written to the DB, keeping the
 * cron well within Vercel's 60s function limit.
 */
const PERSIST_TAIL_DAYS = 3;

/**
 * Persiste série diária em portfolio_daily_snapshots e portfolio_performance (TWR).
 * Only writes the last PERSIST_TAIL_DAYS entries to stay within timeout limits.
 */
export const persistPatrimonioSnapshotsForUser = async (userId: string, timelineEndDate: Date) => {
  const { portfolio, fixedIncomeAssets, stockTransactions, investmentsExclReservas } =
    await loadCarteiraHistoricoData(userId);

  const fiPricer = await createFixedIncomePricer(userId, {
    asOfDate: timelineEndDate,
  });

  const { historicoPatrimonio, historicoTWR } = await buildPatrimonioHistorico({
    portfolio,
    fixedIncomeAssets,
    stockTransactions,
    investmentsExclReservas,
    saldoBrutoAtual: 0,
    valorAplicadoAtual: 0,
    maxHistoricoMonths: null,
    patchLastDayWithLiveTotals: false,
    timelineEndDate,
    fixedIncomeValueSeriesBuilder: fiPricer.buildValueSeriesForAsset,
    implicitCdiValueSeriesBuilder: fiPricer.buildImplicitCdiValueSeries,
  });

  if (historicoPatrimonio.length === 0) {
    return { snapshotsWritten: 0, performancesWritten: 0 };
  }

  let snapshotsWritten = 0;
  let performancesWritten = 0;

  // Only persist the tail — the full history is computed for TWR accuracy
  // but we only write the most recent days to minimize DB operations.
  const patrimonioTail = historicoPatrimonio.slice(-PERSIST_TAIL_DAYS);

  for (let i = 0; i < patrimonioTail.length; i += batchSize) {
    const slice = patrimonioTail.slice(i, i + batchSize);
    await prisma.$transaction(
      slice.map((row) => {
        const day = toDayDate(row.data);
        return prisma.portfolioDailySnapshot.upsert({
          where: {
            userId_date: { userId, date: day },
          },
          create: {
            userId,
            date: day,
            totalValue: row.saldoBruto,
            totalInvested: row.valorAplicado,
            totalEarnings: 0,
          },
          update: {
            totalValue: row.saldoBruto,
            totalInvested: row.valorAplicado,
            totalEarnings: 0,
          },
        });
      }),
    );
    snapshotsWritten += slice.length;
  }

  // For TWR, we need the previous entry for dailyReturn calculation,
  // so take PERSIST_TAIL_DAYS + 1 but only write the tail.
  const twrSliceStart = Math.max(0, historicoTWR.length - PERSIST_TAIL_DAYS);
  const twrTail = historicoTWR.slice(twrSliceStart);

  for (let i = 0; i < twrTail.length; i += batchSize) {
    const slice = twrTail.slice(i, i + batchSize);
    await prisma.$transaction(
      slice.map((row, j) => {
        // Absolute index in the full TWR array for dailyReturn calc
        const absIdx = twrSliceStart + i + j;
        const prevTwr = absIdx > 0 ? historicoTWR[absIdx - 1] : null;
        let dailyReturn: number | null = null;
        if (prevTwr) {
          const fPrev = 1 + (prevTwr.value ?? 0) / 100;
          const fCur = 1 + (row.value ?? 0) / 100;
          if (fPrev > 0) {
            dailyReturn = fCur / fPrev - 1;
          }
        }
        const day = toDayDate(row.data);
        return prisma.portfolioPerformance.upsert({
          where: {
            userId_date: { userId, date: day },
          },
          create: {
            userId,
            date: day,
            dailyReturn,
            cumulativeReturn: row.value,
          },
          update: {
            dailyReturn,
            cumulativeReturn: row.value,
          },
        });
      }),
    );
    performancesWritten += slice.length;
  }

  return { snapshotsWritten, performancesWritten };
};

/**
 * Executa snapshot para todos os usuários com atividade em carteira/transações.
 */
export const runPortfolioSnapshotsJob = async (options?: { timelineEndDate?: Date }) => {
  const end = normalizeDateStart(options?.timelineEndDate ?? new Date());
  end.setDate(end.getDate() - 1);

  const users = await prisma.user.findMany({
    where: {
      OR: [{ portfolios: { some: {} } }, { stockTransactions: { some: {} } }],
    },
    select: { id: true },
  });

  let totalSnapshots = 0;
  let totalPerf = 0;
  const errors: Array<{ userId: string; message: string }> = [];

  for (const u of users) {
    try {
      const r = await persistPatrimonioSnapshotsForUser(u.id, end);
      totalSnapshots += r.snapshotsWritten;
      totalPerf += r.performancesWritten;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ userId: u.id, message });
      console.error('[portfolioSnapshots] user failed', u.id, message);
    }
  }

  return {
    usersProcessed: users.length,
    totalSnapshots,
    totalPerformances: totalPerf,
    timelineEnd: end.toISOString(),
    errors,
  };
};

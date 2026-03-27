import { prisma } from '@/lib/prisma';
import { normalizeDateStart } from '@/services/patrimonioHistoricoBuilder';
import { buildPatrimonioHistorico } from '@/services/patrimonioHistoricoBuilder';
import { loadCarteiraHistoricoData } from '@/services/carteiraHistoricoDataLoader';

const batchSize = 50;

const toDayDate = (ts: number): Date => normalizeDateStart(new Date(ts));

/**
 * Persiste série diária em portfolio_daily_snapshots e portfolio_performance (TWR).
 */
export const persistPatrimonioSnapshotsForUser = async (userId: string, timelineEndDate: Date) => {
  const { portfolio, fixedIncomeAssets, stockTransactions, investmentsExclReservas } =
    await loadCarteiraHistoricoData(userId);

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
  });

  if (historicoPatrimonio.length === 0) {
    return { snapshotsWritten: 0, performancesWritten: 0 };
  }

  let snapshotsWritten = 0;
  let performancesWritten = 0;

  for (let i = 0; i < historicoPatrimonio.length; i += batchSize) {
    const slice = historicoPatrimonio.slice(i, i + batchSize);
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

  for (let i = 0; i < historicoTWR.length; i += batchSize) {
    const slice = historicoTWR.slice(i, i + batchSize);
    await prisma.$transaction(
      slice.map((row, j) => {
        const idx = i + j;
        const prevTwr = idx > 0 ? historicoTWR[idx - 1] : null;
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

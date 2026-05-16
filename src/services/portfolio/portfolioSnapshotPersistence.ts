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
        // Bug #02: retorno diário > 5% é fisicamente improvável em carteira normal
        // (mesmo IBOV raramente passa de 3% num dia). Quando isso aparece, é
        // sinal de que a série foi contaminada por um cashflow contabilizado
        // como valorização (ex.: aporte editado sem reprocesso). Log para
        // detectar regressões do fix.
        if (dailyReturn != null && Math.abs(dailyReturn) > 0.05) {
          console.warn(
            `[portfolioSnapshots] daily TWR fora do esperado userId=${userId} date=${row.data} dailyReturn=${(dailyReturn * 100).toFixed(2)}% — possível série contaminada`,
          );
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
 * Backfill em massa: persiste TODA a série diária (sem o slice PERSIST_TAIL_DAYS
 * usado pelo cron). Usado pelo auto-heal disparado em /carteira/resumo quando o
 * reader detecta gap histórico (snapshot mais antigo bem depois da 1ª atividade).
 *
 * Idempotente via upsert. Pode demorar segundos para contas com muito histórico —
 * deve ser chamado em fire-and-forget pelo caller HTTP.
 */
export const persistFullHistoryForUser = async (userId: string, timelineEndDate: Date) => {
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

  for (let i = 0; i < historicoPatrimonio.length; i += batchSize) {
    const slice = historicoPatrimonio.slice(i, i + batchSize);
    await prisma.$transaction(
      slice.map((row) => {
        const day = toDayDate(row.data);
        return prisma.portfolioDailySnapshot.upsert({
          where: { userId_date: { userId, date: day } },
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
        const absIdx = i + j;
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
          where: { userId_date: { userId, date: day } },
          create: { userId, date: day, dailyReturn, cumulativeReturn: row.value },
          update: { dailyReturn, cumulativeReturn: row.value },
        });
      }),
    );
    performancesWritten += slice.length;
  }

  return { snapshotsWritten, performancesWritten };
};

// Deduplica backfills concorrentes — mesmo user disparando 2 requests em
// paralelo (ex.: dashboard + análise) não roda o builder pesado duas vezes.
// O Map é process-local; em ambiente serverless cada instância tem o seu, o
// que é aceitável: upserts são idempotentes e o pior caso é trabalho duplicado
// raro entre lambdas frias diferentes.
const inflightBackfills = new Map<string, Promise<void>>();

/**
 * Versão fire-and-forget do persistFullHistoryForUser. Loga erro mas nunca
 * lança — o caller é a request do usuário, que não deve falhar se o backfill
 * de background dá problema (o fallback de live rebuild já cobriu a leitura).
 */
export const triggerLazyBackfill = (userId: string, timelineEndDate: Date): Promise<void> => {
  const existing = inflightBackfills.get(userId);
  if (existing) return existing;

  const promise = persistFullHistoryForUser(userId, timelineEndDate)
    .then((result) => {
      console.log(
        `[portfolioSnapshots] lazy backfill done userId=${userId} snapshots=${result.snapshotsWritten} perfs=${result.performancesWritten}`,
      );
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[portfolioSnapshots] lazy backfill FAILED userId=${userId}: ${message}`);
    })
    .finally(() => {
      inflightBackfills.delete(userId);
    });

  inflightBackfills.set(userId, promise);
  return promise;
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

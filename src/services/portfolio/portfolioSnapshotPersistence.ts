import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { normalizeDateStart } from './patrimonioHistoricoBuilder';
import { buildPatrimonioHistorico } from './patrimonioHistoricoBuilder';
import { loadProventosByDay } from './proventosByDay';
import { loadCarteiraHistoricoData } from './carteiraHistoricoDataLoader';
import { createFixedIncomePricer } from './fixedIncomePricing';

const toDayDate = (ts: number): Date => normalizeDateStart(new Date(ts));

/**
 * Number of trailing days the cron always rewrites, independent of drift —
 * garante que o rabo da série acompanha preços/proventos que chegam com atraso.
 */
const PERSIST_TAIL_DAYS = 3;

/**
 * Dias por $transaction. Cada dia gera 2 upserts (snapshot + performance)
 * INTERCALADOS no mesmo batch: morte no meio da persistência deixa um prefixo
 * cronológico consistente nas DUAS tabelas — nunca snapshots sem performance
 * (que o reader antigo servia como TWR = 0 flat; bug do gráfico de
 * rentabilidade, ago/2026).
 */
const DAYS_PER_BATCH = 25;

/** Tolerâncias do diff de reparo (valores em R$ e em pontos percentuais). */
const CURRENCY_EPSILON = 0.01;
const RETURN_EPSILON = 0.001;

type SeriesDay = {
  ts: number;
  saldoBruto: number;
  valorAplicado: number;
  earnings: number;
  cumulativeReturn: number;
  dailyReturn: number | null;
};

/**
 * Junta patrimônio + TWR + proventos acumulados numa linha por dia.
 * As duas séries saem do MESMO timeline do builder (calculateHistoricoTWR mapeia
 * a série de patrimônio 1:1), então o zip é por índice.
 */
const buildSeriesDays = (
  historicoPatrimonio: Array<{ data: number; saldoBruto: number; valorAplicado: number }>,
  historicoTWR: Array<{ data: number; value: number }>,
  proventosAcumuladosByDay: Map<number, number>,
): SeriesDay[] => {
  const days: SeriesDay[] = [];
  for (let i = 0; i < historicoPatrimonio.length; i++) {
    const row = historicoPatrimonio[i];
    const twr = historicoTWR[i]?.value ?? 0;
    let dailyReturn: number | null = null;
    if (i > 0) {
      const fPrev = 1 + (historicoTWR[i - 1]?.value ?? 0) / 100;
      const fCur = 1 + twr / 100;
      if (fPrev > 0) {
        dailyReturn = fCur / fPrev - 1;
      }
    }
    // Bug #02: retorno diário > 5% é fisicamente improvável em carteira normal
    // (mesmo IBOV raramente passa de 3% num dia). Quando isso aparece, é
    // sinal de que a série foi contaminada por um cashflow contabilizado
    // como valorização (ex.: aporte editado sem reprocesso).
    if (dailyReturn != null && Math.abs(dailyReturn) > 0.05) {
      logger.warn(
        `[portfolioSnapshots] daily TWR fora do esperado date=${row.data} dailyReturn=${(dailyReturn * 100).toFixed(2)}% — possível série contaminada`,
      );
    }
    days.push({
      ts: row.data,
      saldoBruto: row.saldoBruto,
      valorAplicado: row.valorAplicado,
      earnings: proventosAcumuladosByDay.get(row.data) ?? 0,
      cumulativeReturn: twr,
      dailyReturn,
    });
  }
  return days;
};

/**
 * Grava os dias nas duas tabelas em batches cronológicos, com o par
 * (snapshot, performance) do MESMO dia dentro do MESMO $transaction.
 */
const persistSeriesDays = async (userId: string, days: SeriesDay[]): Promise<number> => {
  let written = 0;
  for (let i = 0; i < days.length; i += DAYS_PER_BATCH) {
    const slice = days.slice(i, i + DAYS_PER_BATCH);
    await prisma.$transaction(
      slice.flatMap((d) => {
        const day = toDayDate(d.ts);
        return [
          prisma.portfolioDailySnapshot.upsert({
            where: { userId_date: { userId, date: day } },
            create: {
              userId,
              date: day,
              totalValue: d.saldoBruto,
              totalInvested: d.valorAplicado,
              totalEarnings: d.earnings,
            },
            update: {
              totalValue: d.saldoBruto,
              totalInvested: d.valorAplicado,
              totalEarnings: d.earnings,
            },
          }),
          prisma.portfolioPerformance.upsert({
            where: { userId_date: { userId, date: day } },
            create: {
              userId,
              date: day,
              dailyReturn: d.dailyReturn,
              cumulativeReturn: d.cumulativeReturn,
            },
            update: { dailyReturn: d.dailyReturn, cumulativeReturn: d.cumulativeReturn },
          }),
        ];
      }),
    );
    written += slice.length;
  }
  return written;
};

const computeFullSeries = async (userId: string, timelineEndDate: Date) => {
  const { portfolio, fixedIncomeAssets, stockTransactions, investmentsExclReservas } =
    await loadCarteiraHistoricoData(userId);

  const fiPricer = await createFixedIncomePricer(userId, {
    asOfDate: timelineEndDate,
  });

  // Proventos recebidos entram no retorno (série = retorno total, igual ao card).
  const { proventosByDay } = await loadProventosByDay(userId);

  const { historicoPatrimonio, historicoTWR, proventosAcumuladosByDay } =
    await buildPatrimonioHistorico({
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
      proventosByDay,
    });

  return buildSeriesDays(historicoPatrimonio, historicoTWR, proventosAcumuladosByDay);
};

/**
 * Persiste série diária em portfolio_daily_snapshots e portfolio_performance (TWR).
 *
 * AUTO-HEAL (bug do gráfico flat, ago/2026): a série completa sempre foi
 * recomputada a cada run (necessário pro TWR), mas só o rabo era persistido —
 * qualquer trecho gravado com dado ruim (preços ainda não ingeridos no primeiro
 * backfill, backfill morto entre as tabelas) ficava congelado para sempre, e o
 * único "conserto" era uma mutação de carteira invalidar os snapshots. Agora o
 * cron compara a série computada com as linhas persistidas e REESCREVE as
 * divergentes/faltantes — o passado se cura sozinho na noite seguinte.
 */
export const persistPatrimonioSnapshotsForUser = async (userId: string, timelineEndDate: Date) => {
  const days = await computeFullSeries(userId, timelineEndDate);

  if (days.length === 0) {
    return { snapshotsWritten: 0, performancesWritten: 0, healedDays: 0 };
  }

  const rangeStart = toDayDate(days[0].ts);
  const rangeEnd = toDayDate(days[days.length - 1].ts);
  const [snapRows, perfRows] = await Promise.all([
    prisma.portfolioDailySnapshot.findMany({
      where: { userId, date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true, totalValue: true, totalInvested: true, totalEarnings: true },
    }),
    prisma.portfolioPerformance.findMany({
      where: { userId, date: { gte: rangeStart, lte: rangeEnd } },
      select: { date: true, cumulativeReturn: true },
    }),
  ]);

  const snapByDay = new Map(snapRows.map((r) => [normalizeDateStart(r.date).getTime(), r]));
  const perfByDay = new Map(perfRows.map((r) => [normalizeDateStart(r.date).getTime(), r]));

  const divergent = new Set<number>();
  days.forEach((d) => {
    const snap = snapByDay.get(d.ts);
    const perf = perfByDay.get(d.ts);
    if (!snap || !perf) {
      divergent.add(d.ts);
      return;
    }
    if (
      Math.abs(Number(snap.totalValue) - d.saldoBruto) > CURRENCY_EPSILON ||
      Math.abs(Number(snap.totalInvested) - d.valorAplicado) > CURRENCY_EPSILON ||
      Math.abs(Number(snap.totalEarnings) - d.earnings) > CURRENCY_EPSILON ||
      Math.abs(Number(perf.cumulativeReturn) - d.cumulativeReturn) > RETURN_EPSILON
    ) {
      divergent.add(d.ts);
    }
  });

  // O dailyReturn de um dia depende do cumulativeReturn do dia ANTERIOR:
  // se o dia i divergiu, o i+1 precisa ser reescrito junto mesmo que o
  // cumulative dele bata (o dailyReturn armazenado ficou stale). Expande a
  // partir de uma CÓPIA congelada — expandir in-place cascatearia até o fim.
  const baseDivergent = new Set(divergent);
  days.forEach((d, i) => {
    if (baseDivergent.has(d.ts) && i + 1 < days.length) {
      divergent.add(days[i + 1].ts);
    }
  });

  const tailStart = days.length - PERSIST_TAIL_DAYS;
  const toWrite = days.filter((d, i) => i >= tailStart || divergent.has(d.ts));
  const healedDays = days.filter((d, i) => i < tailStart && divergent.has(d.ts)).length;

  if (healedDays > 0) {
    logger.warn(
      `[portfolioSnapshots] auto-heal userId=${userId} healedDays=${healedDays} — série persistida divergia da recomputada (preços/backfill atrasados na gravação original?)`,
    );
  }

  const written = await persistSeriesDays(userId, toWrite);

  return { snapshotsWritten: written, performancesWritten: written, healedDays };
};

/**
 * Backfill em massa: persiste TODA a série diária. Usado pelo auto-heal
 * disparado em /carteira/resumo quando o reader detecta gap histórico ou
 * performance faltante (snapshots sem TWR).
 *
 * Idempotente via upsert. Pode demorar segundos para contas com muito histórico —
 * deve ser chamado em fire-and-forget pelo caller HTTP.
 */
export const persistFullHistoryForUser = async (userId: string, timelineEndDate: Date) => {
  const days = await computeFullSeries(userId, timelineEndDate);

  if (days.length === 0) {
    return { snapshotsWritten: 0, performancesWritten: 0 };
  }

  const written = await persistSeriesDays(userId, days);
  return { snapshotsWritten: written, performancesWritten: written };
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
      logger.info(
        `[portfolioSnapshots] lazy backfill done userId=${userId} snapshots=${result.snapshotsWritten} perfs=${result.performancesWritten}`,
      );
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[portfolioSnapshots] lazy backfill FAILED userId=${userId}: ${message}`);
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
  let totalHealed = 0;
  const errors: Array<{ userId: string; message: string }> = [];

  for (const u of users) {
    try {
      const r = await persistPatrimonioSnapshotsForUser(u.id, end);
      totalSnapshots += r.snapshotsWritten;
      totalPerf += r.performancesWritten;
      totalHealed += r.healedDays;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ userId: u.id, message });
      logger.error('[portfolioSnapshots] user failed', u.id, message);
    }
  }

  return {
    usersProcessed: users.length,
    totalSnapshots,
    totalPerformances: totalPerf,
    totalHealedDays: totalHealed,
    timelineEnd: end.toISOString(),
    errors,
  };
};

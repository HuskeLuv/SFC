/**
 * Testes do auto-heal do cron de snapshots (bug do gráfico flat, ago/2026):
 * a série completa sempre foi recomputada a cada run, mas só o rabo (3 dias)
 * era persistido — trechos gravados com dado ruim ficavam congelados até uma
 * mutação de carteira invalidar os snapshots. O cron agora diffa a série
 * computada contra as linhas persistidas e reescreve as divergentes/faltantes,
 * com o par (snapshot, performance) do mesmo dia no MESMO $transaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  portfolioDailySnapshot: {
    upsert: vi.fn((args: unknown) => ({ kind: 'snap', args })),
    findMany: vi.fn(),
  },
  portfolioPerformance: {
    upsert: vi.fn((args: unknown) => ({ kind: 'perf', args })),
    findMany: vi.fn(),
  },
  user: { findMany: vi.fn() },
  $transaction: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const DAY = 24 * 60 * 60 * 1000;

const mockBuild = vi.hoisted(() => vi.fn());

vi.mock('../patrimonioHistoricoBuilder', () => ({
  buildPatrimonioHistorico: mockBuild,
  normalizeDateStart: (date: Date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
}));

vi.mock('../carteiraHistoricoDataLoader', () => ({
  loadCarteiraHistoricoData: vi.fn().mockResolvedValue({
    portfolio: [],
    fixedIncomeAssets: [],
    stockTransactions: [],
    investmentsExclReservas: [],
  }),
}));

vi.mock('../fixedIncomePricing', () => ({
  createFixedIncomePricer: vi.fn().mockResolvedValue({
    buildValueSeriesForAsset: vi.fn(),
    buildImplicitCdiValueSeries: vi.fn(),
  }),
}));

vi.mock('../proventosByDay', () => ({
  loadProventosByDay: vi.fn().mockResolvedValue({ proventosByDay: new Map(), total: 0 }),
}));

import {
  persistPatrimonioSnapshotsForUser,
  persistFullHistoryForUser,
} from '../portfolioSnapshotPersistence';

/** Série de N dias a partir de 2026-07-01: valor 1000+i, TWR i*0.1. */
const seriesOf = (n: number) => {
  const start = utcDay(2026, 7, 1).getTime();
  const historicoPatrimonio = Array.from({ length: n }, (_, i) => ({
    data: start + i * DAY,
    valorAplicado: 900,
    saldoBruto: 1000 + i,
  }));
  const historicoTWR = historicoPatrimonio.map((p, i) => ({ data: p.data, value: i * 0.1 }));
  return { historicoPatrimonio, historicoTWR, proventosAcumuladosByDay: new Map<number, number>() };
};

/** Linhas persistidas EXATAMENTE iguais à série computada. */
const persistedMatching = (series: ReturnType<typeof seriesOf>) => ({
  snaps: series.historicoPatrimonio.map((p) => ({
    date: new Date(p.data),
    totalValue: p.saldoBruto,
    totalInvested: p.valorAplicado,
    totalEarnings: 0,
  })),
  perfs: series.historicoTWR.map((p) => ({
    date: new Date(p.data),
    cumulativeReturn: p.value,
  })),
});

const writtenSnapDates = () =>
  mockPrisma.portfolioDailySnapshot.upsert.mock.calls.map((c) =>
    (c[0] as { where: { userId_date: { date: Date } } }).where.userId_date.date.getTime(),
  );
const writtenPerfDates = () =>
  mockPrisma.portfolioPerformance.upsert.mock.calls.map((c) =>
    (c[0] as { where: { userId_date: { date: Date } } }).where.userId_date.date.getTime(),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockResolvedValue([]);
  mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([]);
  mockPrisma.portfolioPerformance.findMany.mockResolvedValue([]);
});

describe('persistPatrimonioSnapshotsForUser — auto-heal', () => {
  it('regime estável: reescreve só o rabo de 3 dias (healedDays 0)', async () => {
    const series = seriesOf(10);
    mockBuild.mockResolvedValue(series);
    const { snaps, perfs } = persistedMatching(series);
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue(snaps);
    mockPrisma.portfolioPerformance.findMany.mockResolvedValue(perfs);

    const result = await persistPatrimonioSnapshotsForUser('u1', utcDay(2026, 7, 10));

    expect(result.healedDays).toBe(0);
    expect(result.snapshotsWritten).toBe(3);
    const expectedTail = series.historicoPatrimonio.slice(-3).map((p) => p.data);
    expect(writtenSnapDates()).toEqual(expectedTail);
    expect(writtenPerfDates()).toEqual(expectedTail);
  });

  it('dia do meio divergente é reescrito (e o seguinte, pelo dailyReturn stale)', async () => {
    const series = seriesOf(10);
    mockBuild.mockResolvedValue(series);
    const { snaps, perfs } = persistedMatching(series);
    // dia índice 4 persistido com TWR errado (série flat congelada)
    perfs[4] = { ...perfs[4], cumulativeReturn: 0 };
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue(snaps);
    mockPrisma.portfolioPerformance.findMany.mockResolvedValue(perfs);

    const result = await persistPatrimonioSnapshotsForUser('u1', utcDay(2026, 7, 10));

    // dias 4 e 5 (vizinho) + rabo 7,8,9
    expect(result.healedDays).toBe(2);
    const days = series.historicoPatrimonio.map((p) => p.data);
    expect(writtenSnapDates()).toEqual([days[4], days[5], days[7], days[8], days[9]]);
  });

  it('valor de patrimônio divergente também dispara reescrita', async () => {
    const series = seriesOf(10);
    mockBuild.mockResolvedValue(series);
    const { snaps, perfs } = persistedMatching(series);
    snaps[2] = { ...snaps[2], totalValue: 999999 };
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue(snaps);
    mockPrisma.portfolioPerformance.findMany.mockResolvedValue(perfs);

    const result = await persistPatrimonioSnapshotsForUser('u1', utcDay(2026, 7, 10));

    expect(result.healedDays).toBe(2); // dia 2 + vizinho 3
    expect(writtenSnapDates()).toContain(series.historicoPatrimonio[2].data);
  });

  it('prefixo de snapshots SEM performance (backfill morto no meio) é regravado inteiro', async () => {
    const series = seriesOf(10);
    mockBuild.mockResolvedValue(series);
    const { snaps, perfs } = persistedMatching(series);
    // performance só dos 3 últimos dias — 7 dias órfãos
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue(snaps);
    mockPrisma.portfolioPerformance.findMany.mockResolvedValue(perfs.slice(-3));

    const result = await persistPatrimonioSnapshotsForUser('u1', utcDay(2026, 7, 10));

    expect(result.healedDays).toBe(7);
    expect(result.snapshotsWritten).toBe(10); // 7 órfãos (+ vizinho já incluso) + rabo 3
  });

  it('série computada vazia não escreve nada', async () => {
    mockBuild.mockResolvedValue({
      historicoPatrimonio: [],
      historicoTWR: [],
      proventosAcumuladosByDay: new Map(),
    });
    const result = await persistPatrimonioSnapshotsForUser('u1', utcDay(2026, 7, 10));
    expect(result).toEqual({ snapshotsWritten: 0, performancesWritten: 0, healedDays: 0 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('escrita intercalada (par snapshot+performance por dia no mesmo batch)', () => {
  it('persistFullHistoryForUser grava todos os dias com pares intercalados', async () => {
    const series = seriesOf(5);
    mockBuild.mockResolvedValue(series);

    const result = await persistFullHistoryForUser('u1', utcDay(2026, 7, 5));

    expect(result.snapshotsWritten).toBe(5);
    expect(result.performancesWritten).toBe(5);
    // um único batch (5 dias < DAYS_PER_BATCH) com 10 ops alternando snap/perf
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = mockPrisma.$transaction.mock.calls[0][0] as Array<{ kind: string }>;
    expect(ops).toHaveLength(10);
    expect(ops.map((o) => o.kind)).toEqual([
      'snap',
      'perf',
      'snap',
      'perf',
      'snap',
      'perf',
      'snap',
      'perf',
      'snap',
      'perf',
    ]);
  });

  it('dailyReturn é derivado do cumulativeReturn consecutivo (1º dia = null)', async () => {
    const series = seriesOf(3);
    mockBuild.mockResolvedValue(series);

    await persistFullHistoryForUser('u1', utcDay(2026, 7, 3));

    const perfCalls = mockPrisma.portfolioPerformance.upsert.mock.calls.map(
      (c) => (c[0] as { create: { dailyReturn: number | null } }).create.dailyReturn,
    );
    expect(perfCalls[0]).toBeNull();
    // TWR 0 -> 0.1: fator 1.001/1.000 - 1
    expect(perfCalls[1]).toBeCloseTo(1.001 / 1 - 1, 10);
    expect(perfCalls[2]).toBeCloseTo(1.002 / 1.001 - 1, 10);
  });
});

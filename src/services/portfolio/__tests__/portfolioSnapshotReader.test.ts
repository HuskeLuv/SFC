import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  portfolioDailySnapshot: { findMany: vi.fn() },
  portfolioPerformance: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('../carteiraHistoricoDataLoader', () => ({
  loadCarteiraHistoricoData: vi.fn().mockResolvedValue({
    portfolio: [],
    fixedIncomeAssets: [],
    stockTransactions: [],
    investmentsExclReservas: [],
  }),
}));

import { loadHistoricoFromSnapshots } from '../portfolioSnapshotReader';

const DAY = 24 * 60 * 60 * 1000;
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.portfolioPerformance.findMany.mockResolvedValue([]);
});

describe('loadHistoricoFromSnapshots — coverage detection', () => {
  it('coverageOk=true quando há snapshots cobrindo desde firstActivityDate até hoje', async () => {
    const today = utcDay(2026, 5, 16);
    const rows = Array.from({ length: 10 }, (_, i) => ({
      date: new Date(utcDay(2026, 5, 7).getTime() + i * DAY),
      totalValue: 1000,
      totalInvested: 900,
    }));
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue(rows);

    const result = await loadHistoricoFromSnapshots('u1', utcDay(2026, 5, 1), today, {
      firstActivityDate: utcDay(2026, 5, 7),
    });

    expect(result.coverageOk).toBe(true);
    expect(result.coverageReason).toBe('ok');
    expect(result.historicoPatrimonio).toHaveLength(10);
  });

  it('coverageReason=no-rows quando snapshot table está vazia', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([]);
    const result = await loadHistoricoFromSnapshots('u1', utcDay(2020, 1, 1), utcDay(2026, 5, 16));
    expect(result.coverageOk).toBe(false);
    expect(result.coverageReason).toBe('no-rows');
  });

  it('coverageReason=tail-gap quando o último snapshot ficou pra trás (cron parado)', async () => {
    const today = utcDay(2026, 5, 16);
    const rows = Array.from({ length: 5 }, (_, i) => ({
      date: new Date(utcDay(2026, 5, 1).getTime() + i * DAY),
      totalValue: 1000,
      totalInvested: 900,
    }));
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue(rows);

    const result = await loadHistoricoFromSnapshots('u1', utcDay(2026, 5, 1), today, {
      firstActivityDate: utcDay(2026, 5, 1),
    });

    expect(result.coverageOk).toBe(false);
    expect(result.coverageReason).toBe('tail-gap');
  });

  it('coverageReason=history-gap quando primeiro snapshot está MUITO depois da 1ª atividade — caso testekinvo', async () => {
    // Usuário com transações desde 2017 mas só 4 snapshots dos últimos dias.
    const today = utcDay(2026, 5, 16);
    const rows = [
      { date: utcDay(2026, 5, 12), totalValue: 750000, totalInvested: 386000 },
      { date: utcDay(2026, 5, 13), totalValue: 755175, totalInvested: 386000 },
      { date: utcDay(2026, 5, 14), totalValue: 755899, totalInvested: 386000 },
      { date: utcDay(2026, 5, 15), totalValue: 756409, totalInvested: 386000 },
    ];
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue(rows);

    const result = await loadHistoricoFromSnapshots('u1', utcDay(2017, 5, 19), today, {
      firstActivityDate: utcDay(2017, 5, 19),
    });

    expect(result.coverageOk).toBe(false);
    expect(result.coverageReason).toBe('history-gap');
  });

  it('aceita gap histórico de até 7 dias sem disparar history-gap', async () => {
    const today = utcDay(2026, 5, 16);
    // firstActivity em 1/maio, primeiro snapshot em 6/maio (5 dias de gap, dentro da tolerância)
    const rows = Array.from({ length: 11 }, (_, i) => ({
      date: new Date(utcDay(2026, 5, 6).getTime() + i * DAY),
      totalValue: 1000,
      totalInvested: 900,
    }));
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue(rows);

    const result = await loadHistoricoFromSnapshots('u1', utcDay(2026, 5, 1), today, {
      firstActivityDate: utcDay(2026, 5, 1),
    });

    expect(result.coverageOk).toBe(true);
    expect(result.coverageReason).toBe('ok');
  });

  it('sem firstActivityDate, mantém o comportamento antigo (só checa tail-gap)', async () => {
    const today = utcDay(2026, 5, 16);
    const rows = [
      { date: utcDay(2026, 5, 13), totalValue: 100, totalInvested: 100 },
      { date: utcDay(2026, 5, 14), totalValue: 100, totalInvested: 100 },
      { date: utcDay(2026, 5, 15), totalValue: 100, totalInvested: 100 },
    ];
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue(rows);

    const result = await loadHistoricoFromSnapshots('u1', utcDay(2017, 1, 1), today);
    expect(result.coverageOk).toBe(true);
    expect(result.coverageReason).toBe('ok');
  });
});

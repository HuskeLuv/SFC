import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  portfolioDailySnapshot: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { deriveAcompanhamentoEntries } from '../acompanhamentoAuto';

const plano = { trackStartMonth: 1, trackStartYear: 2026, idade: 30, apos: 65 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // "Hoje" fixo: jun/2026 → offsets 1..5 (fev..jun).
  vi.setSystemTime(new Date(Date.UTC(2026, 5, 15)));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('deriveAcompanhamentoEntries', () => {
  it('deriva patrimônio do último snapshot do mês e aporte líquido das transações', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([
      { date: new Date(Date.UTC(2026, 1, 20)), totalValue: 1000 },
      { date: new Date(Date.UTC(2026, 1, 28)), totalValue: 1100 }, // último de fev → vence
      { date: new Date(Date.UTC(2026, 3, 10)), totalValue: 1300 }, // abr
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        date: new Date(Date.UTC(2026, 2, 5)),
        type: 'compra',
        total: 500,
        price: 0,
        quantity: 0,
        notes: null,
      },
      {
        date: new Date(Date.UTC(2026, 3, 12)),
        type: 'venda',
        total: 200,
        price: 0,
        quantity: 0,
        notes: null,
      },
      {
        date: new Date(Date.UTC(2026, 3, 15)),
        type: 'compra',
        total: 100,
        price: 0,
        quantity: 0,
        notes: JSON.stringify({ operation: { action: 'reinvestimento' } }),
      },
    ]);

    const res = await deriveAcompanhamentoEntries('u1', plano);

    expect(res).toHaveLength(5); // fev..jun
    const fev = res[0];
    expect(fev).toMatchObject({ off: 1, month: 2, patFinal: 1100, aporteReal: 0, hasData: true });
    const mar = res[1];
    expect(mar).toMatchObject({
      off: 2,
      month: 3,
      patFinal: null,
      aporteReal: 500,
      hasData: false,
    });
    const abr = res[2];
    // venda -200; reinvestimento ignorado
    expect(abr).toMatchObject({
      off: 3,
      month: 4,
      patFinal: 1300,
      aporteReal: -200,
      hasData: true,
    });
    const mai = res[3];
    expect(mai).toMatchObject({ off: 4, patFinal: null, hasData: false });
  });

  it('sem snapshots nem transações → meses sem dado', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const res = await deriveAcompanhamentoEntries('u1', plano);
    expect(res).toHaveLength(5);
    expect(res.every((d) => !d.hasData && d.aporteReal === 0)).toBe(true);
  });

  it('retorna vazio quando o acompanhamento começa no futuro', async () => {
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const res = await deriveAcompanhamentoEntries('u1', {
      ...plano,
      trackStartYear: 2027,
    });
    expect(res).toHaveLength(0);
  });
});

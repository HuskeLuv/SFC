import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  planejamentoObjetivo: { findFirst: vi.fn(), update: vi.fn() },
  planejamentoObjetivoEntry: { deleteMany: vi.fn(), upsert: vi.fn() },
  cashflowValue: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { syncCashflowToObjetivo, REALIZADO_COLOR } from '../cashflowToSonhoSync';

/** Captura os "calls" passados ao $transaction (array de operações Prisma). */
function txCalls() {
  return mockPrisma.$transaction.mock.calls.at(-1)?.[0] as unknown[];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Marca as operações pra inspeção: deleteMany/upsert/update retornam um tag.
  mockPrisma.planejamentoObjetivoEntry.deleteMany.mockImplementation((args) => ({
    _op: 'deleteMany',
    args,
  }));
  mockPrisma.planejamentoObjetivoEntry.upsert.mockImplementation((args) => ({
    _op: 'upsert',
    args,
  }));
  mockPrisma.planejamentoObjetivo.update.mockImplementation((args) => ({ _op: 'update', args }));
  mockPrisma.$transaction.mockResolvedValue([]);
});

const baseObjetivo = {
  id: 'obj-1',
  target: 24000,
  available: 0,
  rate: 0, // sem juros → saldo = soma dos aportes
  status: 'Em espera',
  cashflowItem: { id: 'item-1' },
  entries: [],
};

describe('syncCashflowToObjetivo', () => {
  it('no-op quando o objetivo não tem linha-espelho no caixa', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
      ...baseObjetivo,
      cashflowItem: null,
    });
    await syncCashflowToObjetivo('u1', 'obj-1');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('deriva entries auto das células realizadas com saldo acumulado (rate 0)', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(baseObjetivo);
    // Só busca as células REALIZADAS (vermelhas).
    mockPrisma.cashflowValue.findMany.mockResolvedValue([
      { year: 2026, month: 0, value: 2000 },
      { year: 2026, month: 1, value: 3000 },
    ]);

    await syncCashflowToObjetivo('u1', 'obj-1');

    // O filtro de cor pediu exatamente o vermelho (realizado).
    expect(mockPrisma.cashflowValue.findMany).toHaveBeenCalledWith({
      where: { itemId: 'item-1', userId: 'u1', color: REALIZADO_COLOR },
      select: { year: true, month: true, value: true },
    });

    const ops = txCalls();
    const upserts = ops.filter((o) => (o as { _op: string })._op === 'upsert') as Array<{
      args: { create: { month: string; aporte: number; balance: number; source: string } };
    }>;
    expect(upserts).toHaveLength(2);
    // Jan: aporte 2000 → saldo 2000. Fev: aporte 3000 → saldo 5000 (acumulado).
    expect(upserts[0].args.create).toMatchObject({
      month: '2026-01',
      aporte: 2000,
      balance: 2000,
      source: 'auto',
    });
    expect(upserts[1].args.create).toMatchObject({
      month: '2026-02',
      aporte: 3000,
      balance: 5000,
      source: 'auto',
    });
  });

  it('compõe o saldo pela taxa do objetivo (rate > 0)', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
      ...baseObjetivo,
      available: 1000,
      rate: 0.01,
    });
    mockPrisma.cashflowValue.findMany.mockResolvedValue([{ year: 2026, month: 0, value: 500 }]);

    await syncCashflowToObjetivo('u1', 'obj-1');

    const upserts = txCalls().filter((o) => (o as { _op: string })._op === 'upsert') as Array<{
      args: { create: { balance: number } };
    }>;
    // saldo = 1000*(1.01) + 500 = 1510
    expect(upserts[0].args.create.balance).toBeCloseTo(1510, 2);
  });

  it('remove entries auto de meses que não estão mais realizados', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(baseObjetivo);
    mockPrisma.cashflowValue.findMany.mockResolvedValue([{ year: 2026, month: 0, value: 2000 }]);

    await syncCashflowToObjetivo('u1', 'obj-1');

    const del = txCalls().find((o) => (o as { _op: string })._op === 'deleteMany') as {
      args: { where: { source: string; month: { notIn: string[] } } };
    };
    expect(del.args.where.source).toBe('auto');
    expect(del.args.where.month.notIn).toEqual(['2026-01']);
  });

  it('não sobrescreve meses cobertos por registro MANUAL', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({
      ...baseObjetivo,
      entries: [{ month: '2026-01', balance: 9999, source: 'manual' }],
    });
    // Jan e Fev realizados, mas Jan tem entry manual → só Fev vira auto.
    mockPrisma.cashflowValue.findMany.mockResolvedValue([
      { year: 2026, month: 0, value: 2000 },
      { year: 2026, month: 1, value: 3000 },
    ]);

    await syncCashflowToObjetivo('u1', 'obj-1');

    const upserts = txCalls().filter((o) => (o as { _op: string })._op === 'upsert') as Array<{
      args: { create: { month: string } };
    }>;
    expect(upserts).toHaveLength(1);
    expect(upserts[0].args.create.month).toBe('2026-02');
  });

  it('promove status "Em espera" → "Iniciado" ao surgir o 1º realizado', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue(baseObjetivo);
    mockPrisma.cashflowValue.findMany.mockResolvedValue([{ year: 2026, month: 0, value: 2000 }]);

    await syncCashflowToObjetivo('u1', 'obj-1');

    const upd = txCalls().find((o) => (o as { _op: string })._op === 'update') as {
      args: { data: { status?: string } };
    };
    expect(upd.args.data.status).toBe('Iniciado');
  });

  it('marca "Concluído" quando o saldo atinge a meta', async () => {
    mockPrisma.planejamentoObjetivo.findFirst.mockResolvedValue({ ...baseObjetivo, target: 5000 });
    mockPrisma.cashflowValue.findMany.mockResolvedValue([{ year: 2026, month: 0, value: 5000 }]);

    await syncCashflowToObjetivo('u1', 'obj-1');

    const upd = txCalls().find((o) => (o as { _op: string })._op === 'update') as {
      args: { data: { status?: string } };
    };
    expect(upd.args.data.status).toBe('Concluído');
  });
});

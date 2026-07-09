import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { computeInvestimentosPorMes } from '../investimentosPorMes';

const tx = (overrides: Record<string, unknown>) => ({
  id: 'tx',
  userId: 'u1',
  assetId: 'asset-livre',
  type: 'compra',
  total: 1000,
  fees: 0,
  date: new Date(Date.UTC(2026, 0, 15, 12)),
  notes: null,
  asset: { type: 'stock', symbol: 'ITSA4' },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.portfolio.findMany.mockResolvedValue([]);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
});

describe('computeInvestimentosPorMes', () => {
  it('soma compras (+) e vendas (−) com taxas em totaisPorMes', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ total: 1000, fees: 2.5 }),
      tx({ type: 'venda', total: 300, fees: 1.5, date: new Date(Date.UTC(2026, 0, 20, 12)) }),
    ]);

    const { totaisPorMes, planejamentoPorMes } = await computeInvestimentosPorMes('u1', 2026);

    expect(totaisPorMes[0]).toBeCloseTo(1002.5 - 301.5, 2);
    expect(planejamentoPorMes.every((v) => v === 0)).toBe(true);
  });

  it('segrega ativos vinculados a sonho no bucket planejamento, fora de totaisPorMes', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([{ assetId: 'asset-sonho' }]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ assetId: 'asset-livre', total: 1000 }),
      tx({ assetId: 'asset-sonho', total: 500, asset: { type: 'fii', symbol: 'MXRF11' } }),
    ]);

    const { totaisPorMes, planejamentoPorMes, porTipo, tipos } = await computeInvestimentosPorMes(
      'u1',
      2026,
    );

    expect(totaisPorMes[0]).toBe(1000);
    expect(planejamentoPorMes[0]).toBe(500);
    expect(porTipo.planejamento[0]).toBe(500);
    expect(tipos.has('planejamento')).toBe(true);
    // A categoria do ativo vinculado NÃO recebe o valor (evita aparecer no Aporte/Resgate)
    expect(porTipo.fii).toBeUndefined();
  });

  it('venda de ativo vinculado abate o líquido do planejamento (pode ficar negativo)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([{ assetId: 'asset-sonho' }]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ assetId: 'asset-sonho', total: 500 }),
      tx({
        assetId: 'asset-sonho',
        type: 'venda',
        total: 800,
        date: new Date(Date.UTC(2026, 0, 25, 12)),
      }),
    ]);

    const { planejamentoPorMes, totaisPorMes } = await computeInvestimentosPorMes('u1', 2026);

    expect(planejamentoPorMes[0]).toBe(-300);
    expect(totaisPorMes[0]).toBe(0);
  });

  it('reinvestimento tem precedência: fica no bucket reinvestimento mesmo se o ativo é vinculado', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([{ assetId: 'asset-sonho' }]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({
        assetId: 'asset-sonho',
        total: 100,
        notes: JSON.stringify({ operation: { action: 'reinvestimento' } }),
      }),
    ]);

    const { porTipo, planejamentoPorMes, totaisPorMes } = await computeInvestimentosPorMes(
      'u1',
      2026,
    );

    expect(porTipo.reinvestimento[0]).toBe(100);
    expect(planejamentoPorMes[0]).toBe(0);
    expect(totaisPorMes[0]).toBe(0);
  });
});

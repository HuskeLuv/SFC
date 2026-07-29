import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  cashflowValue: { aggregate: vi.fn() },
  user: { findMany: vi.fn() },
  cashflowPatrimonioSnapshot: { upsert: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { getBaseAplicadaAnterior } from '../evolucaoPatrimonioServer';

const tx = (overrides: Record<string, unknown>) => ({
  type: 'compra',
  total: 1000,
  fees: 0,
  notes: null,
  assetId: 'asset-br',
  asset: { type: 'stock', currency: 'BRL' },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
});

describe('getBaseAplicadaAnterior', () => {
  it('soma compras − vendas (total + fees)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ total: 1000, fees: 2 }),
      tx({ type: 'venda', total: 300, fees: 1 }),
    ]);

    expect(await getBaseAplicadaAnterior('u1', 2026)).toBeCloseTo(1002 - 301, 2);
  });

  it('converte REIT gravado em USD usando o câmbio de notes.cotacaoMoeda', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ total: 1000 }),
      tx({
        assetId: 'asset-reit',
        total: 300,
        notes: JSON.stringify({ cotacaoMoeda: 5.2 }),
        asset: { type: 'reit', currency: 'USD' },
      }),
    ]);

    expect(await getBaseAplicadaAnterior('u1', 2026)).toBeCloseTo(1000 + 1560, 2);
  });

  it('venda de REIT sem câmbio reusa o da compra anterior (ordem cronológica)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({
        assetId: 'asset-reit',
        total: 300,
        notes: JSON.stringify({ cotacaoMoeda: 5.0 }),
        asset: { type: 'reit', currency: 'USD' },
      }),
      tx({
        assetId: 'asset-reit',
        type: 'venda',
        total: 100,
        asset: { type: 'reit', currency: 'USD' },
      }),
    ]);

    expect(await getBaseAplicadaAnterior('u1', 2026)).toBeCloseTo(1500 - 500, 2);
  });
});

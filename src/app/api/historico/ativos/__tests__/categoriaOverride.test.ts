import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  fixedIncomeAsset: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(new Map()),
}));

import { GET } from '../route';

const linha = (id: string, symbol: string, type: string, categoriaOverride: string | null) => ({
  id,
  userId: 'user-1',
  assetId: `a-${id}`,
  quantity: 10,
  avgPrice: 100,
  totalInvested: 1000,
  lastUpdate: new Date('2026-09-01'),
  categoriaOverride,
  asset: { symbol, name: symbol, type, currency: 'BRL' },
});

describe('GET /api/historico/ativos — categoria do mover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  });

  it('agrupa o FII movido para Fundos na seção fimFia', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      linha('p1', 'HGLG11', 'fii', 'fimFia'),
      linha('p2', 'KNRI11', 'fii', null),
    ]);
    const res = await GET(new NextRequest('http://localhost/api/historico/ativos'));
    const { secoes } = await res.json();
    const porCat = Object.fromEntries(
      secoes.map((s: { categoria: string; ativos: { symbol: string }[] }) => [
        s.categoria,
        s.ativos.map((a) => a.symbol),
      ]),
    );
    expect(porCat).toEqual({ fimFia: ['HGLG11'], fiis: ['KNRI11'] });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  stockTransaction: { aggregate: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/consultantAuth', () => ({
  authenticateConsultant: vi.fn().mockResolvedValue({ consultantId: 'c-1', userId: 'u-c' }),
  assertClientOwnership: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/consultantService', () => ({
  getClientSummary: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/cashflow/clientCashflowSummary', () => ({
  getCashBalances: vi.fn().mockResolvedValue({ total: {}, monthly: {} }),
  getMonthlyFlows: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('@/services/impersonationLogger', () => ({
  logConsultantAction: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '../client/[id]/route';

const posicao = (symbol: string, type: string, categoriaOverride: string | null) => ({
  id: `pf-${symbol}`,
  quantity: 10,
  avgPrice: 10,
  totalInvested: 100,
  categoriaOverride,
  asset: { symbol, name: symbol, type, currency: 'BRL' },
});

describe('GET /api/consultant/client/[id] — item movido de aba', () => {
  beforeEach(() => {
    mockPrisma.stockTransaction.aggregate.mockResolvedValue({ _sum: { total: 0 } });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue({ name: 'Cliente', email: 'c@x' });
  });

  it('o tipo exibido segue a aba escolhida (override efetivo); sem override, o do catálogo', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      posicao('MXRF11', 'fii', 'acoes'),
      posicao('HGLG11', 'fii', null),
      posicao('BOVA11', 'etf', 'etfs'),
    ]);
    const response = await GET(
      new NextRequest('http://localhost/api/consultant/client/cli-1', { method: 'GET' }),
      { params: Promise.resolve({ id: 'cli-1' }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const tipos = Object.fromEntries(
      body.portfolio.assets.map((a: { symbol: string; type: string }) => [a.symbol, a.type]),
    );
    expect(tipos).toEqual({ MXRF11: 'stock', HGLG11: 'fii', BOVA11: 'etf' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  consultant: { findFirst: vi.fn() },
  portfolio: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('@/services/cashflow/clientCashflowSummary', () => ({
  getCashBalances: vi.fn().mockResolvedValue({ total: { net: 0 } }),
  getMonthlyFlows: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/portfolio/resolveProventos', () => ({
  resolveProventoEvents: vi.fn().mockResolvedValue([]),
}));

import { getConsolidatedAssetDistribution } from '../consultantService';

const item = (symbol: string, type: string, categoriaOverride: string | null, valor: number) => ({
  id: `p-${symbol}`,
  userId: 'cliente-1',
  quantity: 1,
  avgPrice: valor,
  totalInvested: valor,
  categoriaOverride,
  asset: { symbol, name: symbol, type, currency: 'BRL' },
});

describe('getConsolidatedAssetDistribution — mover na Carteira', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.consultant.findFirst.mockResolvedValue({
      id: 'cons-1',
      clients: [{ clientId: 'cliente-1', status: 'active' }],
    });
  });

  const porClasse = async () =>
    Object.fromEntries(
      (await getConsolidatedAssetDistribution('cons-1')).map((d) => [d.class, d.value]),
    );

  it('FII movido para Ações soma em Ações; o total não muda', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      item('HGLG11', 'fii', 'acoes', 300),
      item('KNRI11', 'fii', null, 700),
    ]);
    const dist = await porClasse();
    expect(dist['Ações']).toBe(300);
    expect(dist["FII's"]).toBe(700);
  });

  it('override igual à base ou em item fixo não muda a classe', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      item('BOVA11', 'etf', 'etfs', 100),
      item('CDB-1', 'bond', 'acoes', 100),
    ]);
    const dist = await porClasse();
    expect(dist["ETF's"]).toBe(100);
    expect(dist['Renda Fixa & Fundos de Renda Fixa']).toBe(100);
    expect(dist['Ações']).toBeUndefined();
  });
});

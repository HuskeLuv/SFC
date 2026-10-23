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
const mockGetCotacaoDolarHoje = vi.hoisted(() => vi.fn());
vi.mock('@/services/market/cambioUsdBrl', () => ({
  getCotacaoDolarHoje: mockGetCotacaoDolarHoje,
  carregarSerieCambio: vi.fn().mockResolvedValue(() => null),
  fxDaTransacao: vi.fn().mockReturnValue(null),
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
    mockGetCotacaoDolarHoje.mockResolvedValue(null);
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

  it('REIT em US$ entra em R$ pelo câmbio do dia; sem câmbio fica fora (nunca US$ como R$)', async () => {
    const reit = {
      ...item('O-1700000000000-abc', 'reit', null, 0),
      quantity: 4,
      avgPrice: 110,
      totalInvested: 440,
      moedaRegistro: null,
      totalInvestedBrl: null,
      asset: { symbol: 'O-1700000000000-abc', name: 'Realty', type: 'reit', currency: 'USD' },
    };
    mockPrisma.portfolio.findMany.mockResolvedValue([reit, item('PETR4', 'stock', null, 1000)]);

    mockGetCotacaoDolarHoje.mockResolvedValue({ taxa: 5.4, data: new Date(), fonte: 'indicador' });
    const comCambio = await porClasse();
    expect(comCambio["REIT's"]).toBeCloseTo(2376);
    expect(comCambio['Ações']).toBe(1000);

    mockGetCotacaoDolarHoje.mockResolvedValue(null);
    const semCambio = await porClasse();
    expect(semCambio["REIT's"]).toBeUndefined();
    expect(semCambio['Ações']).toBe(1000);
  });
});

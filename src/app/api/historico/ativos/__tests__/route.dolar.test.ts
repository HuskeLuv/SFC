import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  fixedIncomeAsset: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

const mockGetAssetPrices = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));
const mockGetCotacaoDolarHoje = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/pricing/assetPriceService', () => ({ getAssetPrices: mockGetAssetPrices }));
vi.mock('@/services/market/cambioUsdBrl', () => ({
  getCotacaoDolarHoje: mockGetCotacaoDolarHoje,
}));
vi.mock('@/lib/carteiraCategoryColors', () => ({
  SECOES_ORDEM: ['acoes', 'stocks', 'reits'],
}));
vi.mock('@/lib/portfolioCategoria', () => ({
  getCategoriaFromPortfolio: (item: { asset?: { type?: string } }) =>
    item.asset?.type === 'reit' ? 'reits' : item.asset?.type === 'stock' ? 'stocks' : 'acoes',
}));

import { GET } from '../route';

const item = (
  id: string,
  symbol: string,
  type: string,
  currency: string,
  moedaRegistro: string | null,
) => ({
  id,
  userId: 'user-1',
  assetId: `asset-${id}`,
  quantity: 10,
  avgPrice: 100,
  totalInvested: 1000,
  moedaRegistro,
  categoriaOverride: null,
  lastUpdate: new Date('2026-10-01'),
  asset: { symbol, name: symbol, type, currency },
});

const valores = (data: {
  secoes: Array<{ ativos: Array<{ symbol: string; valorAtual: number }> }>;
}) => Object.fromEntries(data.secoes.flatMap((s) => s.ativos).map((a) => [a.symbol, a.valorAtual]));

describe('GET /api/historico/ativos — posição em US$', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockGetAssetPrices.mockResolvedValue(new Map([['AAPL', 200]]));
  });

  it('converte REIT e stock em US$ pelo câmbio do dia; stock legado em R$ fica como está', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      item('1', 'O', 'reit', 'USD', null),
      item('2', 'AAPL', 'stock', 'USD', 'USD'),
      item('3', 'MSFT', 'stock', 'USD', null),
      item('4', 'PETR4', 'stock', 'BRL', null),
    ]);
    mockGetCotacaoDolarHoje.mockResolvedValue({ taxa: 5.4, data: new Date(), fonte: 'indicador' });

    const data = await (await GET(new NextRequest('http://localhost/api/historico/ativos'))).json();

    expect(mockGetCotacaoDolarHoje).toHaveBeenCalledTimes(1);
    const v = valores(data);
    expect(v.O).toBeCloseTo(10 * 100 * 5.4); // sem cotação: preço médio US$ × câmbio
    expect(v.AAPL).toBeCloseTo(10 * 200 * 5.4); // cotação US$ × câmbio
    expect(v.MSFT).toBe(1000); // legado em R$: nunca converte
    expect(v.PETR4).toBe(1000);
    expect(data.semCambio).toEqual([]);
  });

  it('sem câmbio: posição em US$ fica fora da lista (nunca US$ como R$)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      item('1', 'O', 'reit', 'USD', null),
      item('4', 'PETR4', 'stock', 'BRL', null),
    ]);
    mockGetCotacaoDolarHoje.mockResolvedValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const data = await (await GET(new NextRequest('http://localhost/api/historico/ativos'))).json();

    expect(valores(data)).toEqual({ PETR4: 1000 });
    expect(data.semCambio).toEqual(['O']);
    warn.mockRestore();
  });

  it('sem posição em US$ não busca o câmbio', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([item('4', 'PETR4', 'stock', 'BRL', null)]);

    await GET(new NextRequest('http://localhost/api/historico/ativos'));

    expect(mockGetCotacaoDolarHoje).not.toHaveBeenCalled();
  });
});

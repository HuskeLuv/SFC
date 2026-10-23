import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/** Carteira EUA em US$ (FB): aba REIT's em US$, caixa à parte, proventos em US$. */

const { mockPrisma, mockGetCotacaoDolarHoje, mockResolveProventoEvents } = vi.hoisted(() => ({
  mockPrisma: {
    userChangeLog: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn() },
    portfolio: { findMany: vi.fn() },
    watchlist: { findMany: vi.fn().mockResolvedValue([]) },
    stockTransaction: { findMany: vi.fn() },
    dashboardData: { findFirst: vi.fn() },
  },
  mockGetCotacaoDolarHoje: vi.fn(),
  mockResolveProventoEvents: vi.fn(),
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/market/cambioUsdBrl', () => ({
  getCotacaoDolarHoje: mockGetCotacaoDolarHoje,
}));
vi.mock('@/services/portfolio/resolveProventos', () => ({
  resolveProventoEvents: mockResolveProventoEvents,
}));
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(new Map([['O-1700000000000-abc', 118.2]])),
}));

import { GET } from '../route';

const get = async () => {
  const res = await GET(new NextRequest('http://localhost/api/carteira/reit', { method: 'GET' }));
  return res.json();
};

describe('GET /api/carteira/reit — US$', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findFirst.mockResolvedValue({ value: 500 });
    mockGetCotacaoDolarHoje.mockResolvedValue({
      taxa: 5,
      data: new Date('2026-10-22T00:00:00Z'),
      fonte: 'indicador',
    });
    mockResolveProventoEvents.mockResolvedValue({
      events: [{ symbol: 'O-1700000000000-abc', moeda: 'USD', gross: 2.5, net: 2.5 }],
      total: 2.5,
    });
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-1',
        quantity: 4,
        avgPrice: 110,
        totalInvested: 440,
        moedaRegistro: null,
        totalInvestedBrl: 2376,
        objetivo: 0,
        estrategia: 'value',
        categoriaOverride: null,
        assetId: 'a1',
        asset: {
          symbol: 'O-1700000000000-abc',
          name: 'Realty Income',
          type: 'reit',
          currency: 'USD',
        },
        lastUpdate: new Date(),
      },
    ]);
  });

  it('caixa (R$) fica fora do total em US$ e sai em caixaParaInvestirBRL', async () => {
    const data = await get();
    expect(data.totalGeral.valorAtualizado).toBeCloseTo(4 * 118.2);
    expect(data.resumo.valorAtualizado).toBeCloseTo(4 * 118.2);
    expect(data.resumo.caixaParaInvestir).toBe(500);
    expect(data.caixaParaInvestirBRL).toBe(500);
    expect(data.totalUSD.valorAplicado).toBe(440);
    expect(data.totalBRL.valorAplicado).toBe(2376);
    expect(data.totalBRL.valorAtualizado).toBeCloseTo(4 * 118.2 * 5);
    expect(data.cotacaoDolar).toBe(5);
    expect(data.taxaData).toBe('2026-10-22');
  });

  it('provento USD somado em US$ (sem conversão) na linha e no total', async () => {
    const data = await get();
    const linha = data.secoes.flatMap((s: { ativos: unknown[] }) => s.ativos)[0];
    expect(linha).toMatchObject({ moedaRegistro: 'USD', aproximado: false, proventos: 2.5 });
    expect(data.totalGeral.proventos).toBe(2.5);
    expect(data.totalUSD.proventos).toBe(2.5);
  });

  it('layoutUsd segue a chave; os valores não mudam', async () => {
    vi.stubEnv('CARTEIRA_EUA_DOLAR_HABILITADO', 'false');
    const desligada = await get();
    vi.stubEnv('CARTEIRA_EUA_DOLAR_HABILITADO', 'true');
    const ligada = await get();
    expect(desligada.layoutUsd).toBe(false);
    expect(ligada.layoutUsd).toBe(true);
    expect(ligada.totalUSD).toEqual(desligada.totalUSD);
  });
});

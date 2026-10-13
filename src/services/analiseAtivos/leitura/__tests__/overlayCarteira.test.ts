import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    portfolio: { findMany: vi.fn() },
    watchlist: { findMany: vi.fn() },
  },
  getAssetPrices: vi.fn(),
  brapi: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
// Nenhum provedor de preço no caminho do overlay (spy: se for chamado, o teste falha).
vi.mock('@/services/pricing/assetPriceService', () => ({ getAssetPrices: mocks.getAssetPrices }));
vi.mock('@/services/pricing/brapiQuote', () => ({
  fetchQuotes: mocks.brapi,
  fetchQuote: mocks.brapi,
  fetchDetailedQuotes: mocks.brapi,
}));

import { overlayCarteira } from '../overlayCarteira';

const asset = (id: string, symbol: string, type: string, currency: string | null = 'BRL') => ({
  id,
  symbol,
  type,
  name: symbol,
  currency,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.portfolio.findMany.mockResolvedValue([
    {
      id: 'p-wege',
      quantity: 100,
      categoriaOverride: null,
      objetivo: 25,
      estrategia: 'growth',
      tipoFii: null,
      asset: asset('a1', 'WEGE3', 'stock'),
    },
    {
      id: 'p-itsa',
      quantity: 50,
      categoriaOverride: 'etfs',
      objetivo: 0,
      estrategia: 'value',
      tipoFii: null,
      asset: asset('a2', 'ITSA4', 'stock'),
    },
    {
      id: 'p-mxrf',
      quantity: 350,
      categoriaOverride: null,
      objetivo: 0,
      estrategia: null,
      tipoFii: 'tvm',
      asset: asset('a3', 'mxrf11', 'fii'),
    },
  ]);
  mocks.prisma.watchlist.findMany.mockResolvedValue([
    {
      id: 'w-itub',
      objetivo: 5,
      secao: 'value',
      categoriaOverride: null,
      asset: asset('a4', 'ITUB4', 'stock'),
    },
    // Planejado que já virou posição: fica só em posicoes.
    {
      id: 'w-wege',
      objetivo: 10,
      secao: 'growth',
      categoriaOverride: null,
      asset: asset('a1', 'WEGE3', 'stock'),
    },
    {
      id: 'w-hglg',
      objetivo: 7.5,
      secao: null,
      categoriaOverride: 'fimFia',
      asset: asset('a5', 'HGLG11', 'fii'),
    },
  ]);
});

describe('overlayCarteira', () => {
  it('posições com a aba efetiva (override do mover), ticker normalizado, objetivo e seção', async () => {
    const r = await overlayCarteira('u1');
    expect(r.posicoes).toEqual({
      WEGE3: {
        portfolioId: 'p-wege',
        quantidade: 100,
        categoria: 'acoes',
        objetivoPct: 25,
        estrategia: 'growth',
        tipoFii: null,
      },
      // objetivo 0 (padrão da coluna) = sem alvo
      ITSA4: {
        portfolioId: 'p-itsa',
        quantidade: 50,
        categoria: 'etfs',
        objetivoPct: null,
        estrategia: 'value',
        tipoFii: null,
      },
      MXRF11: {
        portfolioId: 'p-mxrf',
        quantidade: 350,
        categoria: 'fiis',
        objetivoPct: null,
        estrategia: null,
        tipoFii: 'tvm',
      },
    });
    const select = mocks.prisma.portfolio.findMany.mock.calls[0][0].select;
    expect(select).toMatchObject({ objetivo: true, estrategia: true, tipoFii: true });
  });

  it('só quantity > 0 e do próprio usuário (where)', async () => {
    await overlayCarteira('u1');
    expect(mocks.prisma.portfolio.findMany.mock.calls[0][0].where).toMatchObject({
      userId: 'u1',
      quantity: { gt: 0 },
    });
    expect(mocks.prisma.watchlist.findMany.mock.calls[0][0].where).toMatchObject({ userId: 'u1' });
  });

  it('planejados com objetivo e categoria efetiva; planejado com posição fica de fora', async () => {
    const r = await overlayCarteira('u1');
    expect(r.planejados).toEqual({
      ITUB4: {
        watchlistId: 'w-itub',
        id: 'w-itub',
        categoria: 'acoes',
        objetivoPct: 5,
        secao: 'value',
      },
      HGLG11: {
        watchlistId: 'w-hglg',
        id: 'w-hglg',
        categoria: 'fimFia',
        objetivoPct: 7.5,
        secao: null,
      },
    });
  });

  it('mesmo ticker em duas linhas soma a quantidade', async () => {
    mocks.prisma.portfolio.findMany.mockResolvedValue([
      { id: 'p1', quantity: 10, categoriaOverride: null, asset: asset('a1', 'WEGE3', 'stock') },
      { id: 'p2', quantity: 5, categoriaOverride: null, asset: asset('a9', 'WEGE3', 'stock') },
    ]);
    mocks.prisma.watchlist.findMany.mockResolvedValue([]);
    const r = await overlayCarteira('u1');
    expect(r.posicoes.WEGE3).toMatchObject({
      portfolioId: 'p1',
      quantidade: 15,
      categoria: 'acoes',
    });
  });

  it('sem nenhuma chamada a provedor de preço (DB-only)', async () => {
    await overlayCarteira('u1');
    expect(mocks.getAssetPrices).not.toHaveBeenCalled();
    expect(mocks.brapi).not.toHaveBeenCalled();
    // e a consulta não pede preço/valor
    const select = mocks.prisma.portfolio.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('avgPrice');
    expect(select).not.toHaveProperty('totalInvested');
  });
});

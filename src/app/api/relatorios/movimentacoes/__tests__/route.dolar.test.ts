/**
 * Carteira EUA em US$: Relatórios › Movimentações com moeda por linha. Linha em US$
 * traz total nativo, câmbio e valorBRL; `total` segue em R$ (o resumo do período soma).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn(), count: vi.fn() },
  portfolio: { findMany: vi.fn() },
  assetPriceHistory: { findFirst: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));
vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));
vi.mock('@/services/portfolio/tesouroDestino', () => ({
  reservaDestinoPorAsset: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('@/services/market/marketIndicatorService', () => ({ getIndicator: vi.fn() }));

import { GET } from '../route';

const REIT = { symbol: 'O-1', name: 'Realty', type: 'reit', currency: 'USD' };

const tx = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  date: new Date(Date.UTC(2026, 7, 10)),
  type: 'compra',
  quantity: 10,
  price: 100,
  total: 1000,
  fees: 4,
  notes: null,
  assetId: 'a-1',
  asset: { symbol: 'AAPL-1', name: 'Apple', type: 'stock', currency: 'USD' },
  ...overrides,
});

const get = async () => {
  const res = await GET(new NextRequest('http://localhost/api/relatorios/movimentacoes'));
  return (await res.json()) as { movimentacoes: Array<Record<string, unknown>> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.stockTransaction.count.mockResolvedValue(1);
  mockPrisma.portfolio.findMany.mockResolvedValue([]);
  mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);
  mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
});

describe('GET /api/relatorios/movimentacoes — moeda por linha', () => {
  it('linha US$ (stock marcado) com totalMoeda, cotacaoMoeda e valorBRL', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({
        notes: JSON.stringify({ operation: { moeda: 'USD', unidade: 'USD', cotacaoMoeda: 5.2 } }),
      }),
    ]);
    const { movimentacoes } = await get();
    expect(movimentacoes[0]).toMatchObject({
      moeda: 'USD',
      totalMoeda: 1000,
      cotacaoMoeda: 5.2,
      valorBRL: 5204,
      total: 5204,
    });
  });

  it('REIT sem cotação gravada usa a série USD-BRL da data', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
      { date: new Date(Date.UTC(2026, 7, 7)), price: 5.5 },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([tx({ fees: 0, asset: REIT })]);
    const { movimentacoes } = await get();
    expect(movimentacoes[0]).toMatchObject({ moeda: 'USD', cotacaoMoeda: 5.5, valorBRL: 5500 });
  });

  it('US$ sem câmbio: valorBRL null e total 0 (fora da soma)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([tx({ asset: REIT })]);
    const { movimentacoes } = await get();
    expect(movimentacoes[0]).toMatchObject({ moeda: 'USD', valorBRL: null, total: 0 });
  });

  it('PETR4 e stock legado em R$: moeda BRL, total + taxas como hoje', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({
        notes: JSON.stringify({ operation: { unidade: 'USD', cotacaoMoeda: 5 } }),
        asset: { symbol: 'PETR4', name: 'Petrobras', type: 'stock', currency: 'BRL' },
      }),
      tx({ id: 'tx-2', notes: JSON.stringify({ cotacaoMoeda: 5.2 }) }),
    ]);
    const { movimentacoes } = await get();
    expect(movimentacoes[0]).toMatchObject({ moeda: 'BRL', total: 1004, valorBRL: 1004 });
    expect(movimentacoes[1]).toMatchObject({ moeda: 'BRL', total: 1004, cotacaoMoeda: null });
    expect(mockPrisma.assetPriceHistory.findMany).not.toHaveBeenCalled();
  });
});

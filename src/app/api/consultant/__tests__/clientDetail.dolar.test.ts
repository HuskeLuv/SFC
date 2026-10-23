import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const mockGetCotacaoDolarHoje = vi.hoisted(() => vi.fn());
const mockCarregarSerieCambio = vi.hoisted(() => vi.fn());
const mockGetAssetPrices = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/consultantAuth', () => ({
  authenticateConsultant: vi.fn().mockResolvedValue({ consultantId: 'c-1', userId: 'u-c' }),
  assertClientOwnership: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/consultantService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/consultantService')>()),
  getClientSummary: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/cashflow/clientCashflowSummary', () => ({
  getCashBalances: vi.fn().mockResolvedValue({ total: {}, monthly: {} }),
  getMonthlyFlows: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/pricing/assetPriceService', () => ({ getAssetPrices: mockGetAssetPrices }));
vi.mock('@/services/impersonationLogger', () => ({
  logConsultantAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/market/cambioUsdBrl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/market/cambioUsdBrl')>()),
  getCotacaoDolarHoje: mockGetCotacaoDolarHoje,
  carregarSerieCambio: mockCarregarSerieCambio,
}));

import { GET } from '../client/[id]/route';

const REIT = { symbol: 'O', name: 'Realty Income', type: 'reit', currency: 'USD' };
const PETR4 = { symbol: 'PETR4', name: 'Petrobras', type: 'stock', currency: 'BRL' };

const chamar = async () =>
  (
    await GET(new NextRequest('http://localhost/api/consultant/client/cli-1'), {
      params: Promise.resolve({ id: 'cli-1' }),
    })
  ).json();

describe('GET /api/consultant/client/[id] — Carteira EUA em US$', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ name: 'Cliente', email: 'c@x' });
    mockGetAssetPrices.mockResolvedValue(new Map());
    mockCarregarSerieCambio.mockResolvedValue(() => 5);
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'pf-reit',
        quantity: 10,
        avgPrice: 100,
        totalInvested: 1000, // US$
        totalInvestedBrl: null,
        moedaRegistro: null, // REIT sem marcador = US$
        categoriaOverride: null,
        asset: REIT,
      },
      {
        id: 'pf-petr',
        quantity: 100,
        avgPrice: 30,
        totalInvested: 3000,
        totalInvestedBrl: null,
        moedaRegistro: null,
        categoriaOverride: null,
        asset: PETR4,
      },
    ]);
    mockPrisma.stockTransaction.findMany.mockImplementation(
      async (args: { where?: { type?: string } }) =>
        args?.where?.type === 'compra'
          ? [
              {
                assetId: 'a-reit',
                total: 1000,
                quantity: 10,
                price: 100,
                fees: 10,
                date: new Date('2026-05-10T00:00:00Z'),
                notes: JSON.stringify({
                  operation: { unidade: 'USD', moeda: 'USD', cotacaoMoeda: 5.4 },
                }),
                asset: { type: 'reit', currency: 'USD' },
              },
              {
                assetId: 'a-petr',
                total: 3000,
                quantity: 100,
                price: 30,
                fees: 0,
                date: new Date('2026-05-10T00:00:00Z'),
                notes: null,
                asset: { type: 'stock', currency: 'BRL' },
              },
            ]
          : [],
    );
  });

  it('posição e aportes em US$ entram em R$ (posição pelo câmbio do dia, aporte pelo da compra)', async () => {
    mockGetCotacaoDolarHoje.mockResolvedValue({ taxa: 5.4, data: new Date(), fonte: 'indicador' });

    const body = await chamar();

    expect(mockGetCotacaoDolarHoje).toHaveBeenCalledTimes(1);
    const reit = body.portfolio.assets.find((a: { symbol: string }) => a.symbol === 'O');
    expect(reit.totalInvested).toBeCloseTo(5400, 6);
    expect(reit.currentValue).toBeCloseTo(5400, 6);
    expect(body.portfolio.totalInvested).toBeCloseTo(5400 + 3000, 6);
    expect(body.portfolio.currentValue).toBeCloseTo(5400 + 3000, 6);
    // 1000 × 5,4 + R$ 10 de corretagem + 3000 da ação BR
    expect(body.balances.total.investments).toBeCloseTo(5410 + 3000, 6);
  });

  it('sem câmbio do dia: posição em US$ fica fora dos totais e da alocação', async () => {
    mockGetCotacaoDolarHoje.mockResolvedValue(null);

    const body = await chamar();

    expect(body.portfolio.assets.map((a: { symbol: string }) => a.symbol)).toEqual(['PETR4']);
    expect(body.portfolio.totalInvested).toBe(3000);
    expect(body.portfolio.currentValue).toBe(3000);
  });

  it('últimas movimentações: compra em US$ em R$ pelo câmbio da tx; sem câmbio fica de fora', async () => {
    mockGetCotacaoDolarHoje.mockResolvedValue({ taxa: 5.4, data: new Date(), fonte: 'indicador' });
    mockCarregarSerieCambio.mockResolvedValue(() => null);
    const reit = (id: string, notes: string | null) => ({
      id,
      type: 'compra',
      total: 1000,
      quantity: 10,
      price: 100,
      fees: 10,
      date: new Date('2026-05-10T00:00:00Z'),
      notes,
      asset: { ...REIT },
    });
    mockPrisma.stockTransaction.findMany.mockImplementation(
      async (args: { where?: { type?: string } }) =>
        args?.where?.type === 'compra'
          ? []
          : [
              reit(
                'tx-com-fx',
                JSON.stringify({ operation: { unidade: 'USD', cotacaoMoeda: 5.2 } }),
              ),
              reit('tx-sem-fx', null),
              {
                id: 'tx-petr',
                type: 'venda',
                total: 3000,
                quantity: 100,
                price: 30,
                fees: 0,
                date: new Date('2026-05-11T00:00:00Z'),
                notes: null,
                asset: { ...PETR4 },
              },
            ],
    );

    const body = await chamar();

    expect(body.recentCashflows.map((m: { id: string; value: number }) => [m.id, m.value])).toEqual(
      [
        ['tx-com-fx', 1000 * 5.2 + 10],
        ['tx-petr', 3000],
      ],
    );
  });
});

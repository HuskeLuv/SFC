/**
 * Carteira EUA em US$ em /api/analises/carteira-historico: mesma regra do builder —
 * posição em US$ vale q × preço US$ × câmbio do dia, fluxo = total × câmbio da tx + fees,
 * provento em US$ pela taxa da data de pagamento. Nunca US$ somado como R$.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { nextBusinessDayB3 } from '@/utils/feriadosB3';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  assetPriceHistory: { findMany: vi.fn(), findFirst: vi.fn() },
  assetCorporateAction: { findMany: vi.fn() },
}));
const mockGetAssetHistory = vi.hoisted(() => vi.fn());
const mockResolveProventoEvents = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
}));
vi.mock('@/services/portfolio/resolveProventos', () => ({
  resolveProventoEvents: mockResolveProventoEvents,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/pricing/assetPriceService', () => ({ getAssetHistory: mockGetAssetHistory }));
vi.mock('@/services/market/marketIndicatorService', () => ({ getIndicator: vi.fn() }));

import { GET } from '../route';

const DAY = 86400000;
const hojeUtc = Math.floor(Date.now() / DAY) * DAY;
const COMPRA = new Date(hojeUtc - 20 * DAY);
const diaUtil = (ms: number) => nextBusinessDayB3(Math.floor(ms / DAY) * DAY);

const REIT = { symbol: 'O', name: 'Realty Income', type: 'reit', currency: 'USD' };
const PETR4 = { symbol: 'PETR4', name: 'Petrobras', type: 'stock', currency: 'BRL' };

const ultimo = (serie: Array<{ date: number; value: number }>) =>
  [...serie].sort((a, b) => a.date - b.date).at(-1)!.value;

const chamar = async () =>
  (await GET(new NextRequest('http://localhost/api/analises/carteira-historico'))).json();

describe('GET /api/analises/carteira-historico — posição em US$', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([]);
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);
    mockResolveProventoEvents.mockResolvedValue({ events: [], total: 0 });
    // R$ 5.400 de PETR4 + US$ 1.000 de REIT a 5,4 (= R$ 5.400), preços planos.
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        type: 'compra',
        quantity: 100,
        price: 54,
        total: 5400,
        fees: 0,
        notes: null,
        date: COMPRA,
        asset: PETR4,
      },
      {
        type: 'compra',
        quantity: 10,
        price: 100,
        total: 1000,
        fees: 0,
        notes: JSON.stringify({ operation: { unidade: 'USD', moeda: 'USD', cotacaoMoeda: 5.4 } }),
        date: COMPRA,
        asset: REIT,
      },
    ]);
    mockGetAssetHistory.mockImplementation(async (symbol: string) =>
      Array.from({ length: 31 }, (_, i) => ({
        date: hojeUtc - (30 - i) * DAY,
        value: symbol === 'O' ? 100 : 54,
      })),
    );
  });

  it('câmbio sobe 10% depois da compra: TWR da carteira +5% (metade em US$)', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
      { date: COMPRA, price: 5.4 },
      { date: new Date(COMPRA.getTime() + 7 * DAY), price: 5.94 },
    ]);

    const body = await chamar();

    // Antes: US$ lido como R$ e o câmbio não entrava (TWR 0).
    expect(ultimo(body.data)).toBeCloseTo(5, 1);
  });

  it('provento de US$ 10 entra como R$ 54 (taxa do pagamento): +0,5% sobre R$ 10.800', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([{ date: COMPRA, price: 5.4 }]);
    const booking = diaUtil(COMPRA.getTime() + 7 * DAY);
    mockResolveProventoEvents.mockResolvedValue({
      events: [
        {
          symbol: 'O',
          paymentDay: booking,
          exDay: booking,
          bookingDay: booking,
          tipo: 'Dividendo',
          moeda: 'USD',
          net: 10,
          gross: 10,
        },
      ],
      total: 10,
    });

    const body = await chamar();

    // Antes: US$ 10 somado como R$ 10 sobre R$ 6.400 (≈ 0,16%).
    expect(ultimo(body.data)).toBeCloseTo(0.5, 2);
  });

  it('sem câmbio nenhum (sem cotação gravada, série vazia): REIT fora; só PETR4 na série', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
    const txs = await mockPrisma.stockTransaction.findMany();
    mockPrisma.stockTransaction.findMany.mockResolvedValue(
      txs.map((t: { asset: { symbol: string } }) =>
        t.asset.symbol === 'O' ? { ...t, notes: null } : t,
      ),
    );
    mockGetAssetHistory.mockImplementation(async (symbol: string) =>
      Array.from({ length: 31 }, (_, i) => ({
        date: hojeUtc - (30 - i) * DAY,
        // PETR4 sobe 10% ao fim; se o REIT entrasse como R$ 1.000 o TWR seria ≈ 8,4%.
        value: symbol === 'O' ? 100 : i === 30 ? 59.4 : 54,
      })),
    );

    const body = await chamar();

    expect(ultimo(body.data)).toBeCloseTo(10, 1);
  });
});

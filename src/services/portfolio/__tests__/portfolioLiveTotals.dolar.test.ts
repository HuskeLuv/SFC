import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetAssetPrices, mockGetCotacaoDolarHoje } = vi.hoisted(() => ({
  mockGetAssetPrices: vi.fn(),
  mockGetCotacaoDolarHoje: vi.fn(),
}));

vi.mock('@/services/pricing/assetPriceService', () => ({ getAssetPrices: mockGetAssetPrices }));
vi.mock('@/services/market/cambioUsdBrl', () => ({ getCotacaoDolarHoje: mockGetCotacaoDolarHoje }));

import { computePortfolioLiveTotals } from '../portfolioLiveTotals';
import type { FixedIncomePricer } from '../fixedIncomePricing';
import type { PortfolioWithRelations } from '../patrimonioHistoricoBuilder';

const fiPricer = { getCurrentValue: () => 0 } as unknown as FixedIncomePricer;

const pos = (over: Record<string, unknown>, asset: Record<string, unknown>) =>
  ({
    id: `p-${String(asset.symbol)}`,
    userId: 'u1',
    assetId: `a-${String(asset.symbol)}`,
    quantity: 0,
    avgPrice: 0,
    totalInvested: 0,
    moedaRegistro: null,
    totalInvestedBrl: null,
    ...over,
    asset: { id: `a-${String(asset.symbol)}`, name: String(asset.symbol), ...asset },
  }) as unknown as PortfolioWithRelations;

const REIT = { symbol: 'O-1700000000000-abc', type: 'reit', currency: 'USD' };
const PETR4 = { symbol: 'PETR4', type: 'stock', currency: 'BRL' };

const run = (portfolio: PortfolioWithRelations[]) =>
  computePortfolioLiveTotals({
    portfolio,
    fixedIncomeAssets: [],
    investmentsExclReservas: [],
    fiPricer,
  });

describe('computePortfolioLiveTotals — posição em US$', () => {
  beforeEach(() => {
    mockGetAssetPrices.mockReset().mockResolvedValue(new Map([['PETR4', 40]]));
    mockGetCotacaoDolarHoje.mockReset().mockResolvedValue({
      taxa: 5.4,
      data: new Date('2026-10-22T00:00:00Z'),
      fonte: 'indicador',
    });
  });

  it('REIT sem cotação: valor e aplicado convertidos (4 × US$ 110 a 5,4); PETR4 intacto', async () => {
    const res = await run([
      pos({ quantity: 4, avgPrice: 110, totalInvested: 440 }, REIT),
      pos({ quantity: 10, avgPrice: 30, totalInvested: 300 }, PETR4),
    ]);
    expect(res.saldoBruto).toBeCloseTo(2376 + 400, 2);
    expect(res.valorAplicado).toBeCloseTo(2376 + 300, 2);
  });

  it('aplicado da posição em US$ usa totalInvestedBrl quando existe', async () => {
    const res = await run([
      pos({ quantity: 4, avgPrice: 110, totalInvested: 440, totalInvestedBrl: 2200 }, REIT),
    ]);
    expect(res.valorAplicado).toBeCloseTo(2200, 2);
    expect(res.saldoBruto).toBeCloseTo(2376, 2);
  });

  it('sem câmbio: a posição em US$ fica fora das duas somas', async () => {
    mockGetCotacaoDolarHoje.mockResolvedValue(null);
    const res = await run([
      pos({ quantity: 4, avgPrice: 110, totalInvested: 440 }, REIT),
      pos({ quantity: 10, avgPrice: 30, totalInvested: 300 }, PETR4),
    ]);
    expect(res.saldoBruto).toBeCloseTo(400, 2);
    expect(res.valorAplicado).toBeCloseTo(300, 2);
  });

  it('stock com moedaRegistro null (legado R$) segue como antes: sem conversão no fallback', async () => {
    const res = await run([
      pos(
        { quantity: 2, avgPrice: 1080, totalInvested: 2160 },
        { symbol: 'AAPL', type: 'stock', currency: 'USD' },
      ),
    ]);
    expect(res.saldoBruto).toBeCloseTo(2160, 2);
    expect(res.valorAplicado).toBeCloseTo(2160, 2);
  });
});

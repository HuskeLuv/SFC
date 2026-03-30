import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  marketIndicatorCache: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

const mockFetch = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  vi.clearAllMocks();
  vi.stubEnv('BRAPI_API_KEY', 'test-key');
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.useRealTimers();
});

import { getIndicator, getAllIndicators } from '../marketIndicatorService';

const makeBrapiQuoteResponse = (price: number, changePercent: number) => ({
  ok: true,
  json: () =>
    Promise.resolve({
      results: [{ regularMarketPrice: price, regularMarketChangePercent: changePercent }],
    }),
});

const makeCurrencyResponse = (bidPrice: number, percentageChange: number) => ({
  ok: true,
  json: () =>
    Promise.resolve({
      currency: [{ bidPrice, percentageChange }],
    }),
});

const makeCryptoResponse = (
  coins: Array<{ coin: string; regularMarketPrice: number; regularMarketChangePercent: number }>,
) => ({
  ok: true,
  json: () => Promise.resolve({ coins }),
});

describe('getIndicator', () => {
  it('returns cached value when TTL not expired', async () => {
    mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue({
      indicatorKey: 'IBOV',
      price: 125000,
      changePercent: 1.5,
      updatedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
    });

    const result = await getIndicator('IBOV');

    expect(result).toEqual({ price: 125000, changePercent: 1.5 });
  });

  it('ignores cache when TTL expired', async () => {
    mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue({
      indicatorKey: 'IBOV',
      price: 120000,
      changePercent: 0.5,
      updatedAt: new Date(Date.now() - 20 * 60 * 1000), // 20 min ago
    });
    mockPrisma.marketIndicatorCache.upsert.mockResolvedValue({});
    mockFetch.mockResolvedValue(makeBrapiQuoteResponse(126000, 2.1));

    const result = await getIndicator('IBOV');

    expect(result).toEqual({ price: 126000, changePercent: 2.1 });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('routes IBOV to ^BVSP quote', async () => {
    mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue(null);
    mockPrisma.marketIndicatorCache.upsert.mockResolvedValue({});
    mockFetch.mockResolvedValue(makeBrapiQuoteResponse(125000, 1.0));

    await getIndicator('IBOV');

    expect(mockFetch.mock.calls[0][0]).toContain('^BVSP');
  });

  it('routes USD-BRL to currency endpoint', async () => {
    mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue(null);
    mockPrisma.marketIndicatorCache.upsert.mockResolvedValue({});
    mockFetch.mockResolvedValue(makeCurrencyResponse(5.25, -0.3));

    await getIndicator('USD-BRL');

    expect(mockFetch.mock.calls[0][0]).toContain('/v2/currency');
    expect(mockFetch.mock.calls[0][0]).toContain('USD-BRL');
  });

  it('routes BTC/ETH to crypto endpoint', async () => {
    mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue(null);
    mockPrisma.marketIndicatorCache.upsert.mockResolvedValue({});
    mockFetch.mockResolvedValue(
      makeCryptoResponse([
        { coin: 'BTC', regularMarketPrice: 350000, regularMarketChangePercent: 3.5 },
        { coin: 'ETH', regularMarketPrice: 18000, regularMarketChangePercent: 2.0 },
      ]),
    );

    const result = await getIndicator('BTC');

    expect(mockFetch.mock.calls[0][0]).toContain('/v2/crypto');
    expect(result.price).toBe(350000);
  });

  it('persists fetched value to cache', async () => {
    mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue(null);
    mockPrisma.marketIndicatorCache.upsert.mockResolvedValue({});
    mockFetch.mockResolvedValue(makeBrapiQuoteResponse(125000, 1.0));

    await getIndicator('IBOV');

    expect(mockPrisma.marketIndicatorCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { indicatorKey: 'IBOV' },
      }),
    );
  });

  it('returns null values when BRAPI error', async () => {
    mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue(null);
    mockFetch.mockResolvedValue({ ok: false });

    const result = await getIndicator('IBOV');

    expect(result).toEqual({ price: null, changePercent: null });
  });

  it('respects useBrapiFallback=false', async () => {
    mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue(null);

    const result = await getIndicator('IBOV', { useBrapiFallback: false });

    expect(result).toEqual({ price: null, changePercent: null });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('getAllIndicators', () => {
  it('returns all 4 indicators', async () => {
    mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue(null);
    mockPrisma.marketIndicatorCache.upsert.mockResolvedValue({});

    // IBOV
    mockFetch
      .mockResolvedValueOnce(makeBrapiQuoteResponse(125000, 1.0))
      // USD-BRL
      .mockResolvedValueOnce(makeCurrencyResponse(5.25, -0.3))
      // Crypto (BTC + ETH)
      .mockResolvedValueOnce(
        makeCryptoResponse([
          { coin: 'BTC', regularMarketPrice: 350000, regularMarketChangePercent: 3.5 },
          { coin: 'ETH', regularMarketPrice: 18000, regularMarketChangePercent: 2.0 },
        ]),
      )
      // Crypto called again for ETH (separate getIndicator call)
      .mockResolvedValueOnce(
        makeCryptoResponse([
          { coin: 'BTC', regularMarketPrice: 350000, regularMarketChangePercent: 3.5 },
          { coin: 'ETH', regularMarketPrice: 18000, regularMarketChangePercent: 2.0 },
        ]),
      );

    const result = await getAllIndicators();

    expect(result).toHaveProperty('ibov');
    expect(result).toHaveProperty('dolar');
    expect(result).toHaveProperty('bitcoin');
    expect(result).toHaveProperty('ethereum');
  });

  it('passes options through to getIndicator', async () => {
    mockPrisma.marketIndicatorCache.findUnique.mockResolvedValue(null);

    const result = await getAllIndicators({ useBrapiFallback: false });

    expect(result.ibov).toEqual({ price: null, changePercent: null });
    expect(result.dolar).toEqual({ price: null, changePercent: null });
    expect(result.bitcoin).toEqual({ price: null, changePercent: null });
    expect(result.ethereum).toEqual({ price: null, changePercent: null });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

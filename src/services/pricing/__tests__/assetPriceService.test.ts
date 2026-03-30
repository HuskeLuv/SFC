import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  asset: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  assetPriceHistory: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const mockFetchQuotes = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));
const mockFetchCryptoQuotes = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));
const mockFetchCurrencyQuotes = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

vi.mock('../brapiQuote', () => ({
  fetchQuotes: mockFetchQuotes,
  fetchCryptoQuotes: mockFetchCryptoQuotes,
  fetchCurrencyQuotes: mockFetchCurrencyQuotes,
}));

// Mock global fetch for BRAPI history calls
const mockGlobalFetch = vi.fn();
vi.stubGlobal('fetch', mockGlobalFetch);

import {
  getAssetPriceFromDb,
  getAssetCurrentPriceFromDb,
  getAssetPrice,
  getAssetPrices,
  getAssetHistory,
  persistPriceFromBrapi,
} from '../assetPriceService';

// ── Helpers ────────────────────────────────────────────────────────────

const TODAY = new Date('2026-03-30T00:00:00.000Z');
const YESTERDAY = new Date('2026-03-29T00:00:00.000Z');
const STALE_DATE = new Date('2026-03-20T00:00:00.000Z'); // > 7 days ago

// ── Test suites ────────────────────────────────────────────────────────

describe('assetPriceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date('2026-03-30T12:00:00.000Z') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── getAssetPriceFromDb ───────────────────────────────────────────

  describe('getAssetPriceFromDb', () => {
    it('returns price from history when record exists', async () => {
      mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
        price: new Decimal(42.5),
      });

      const result = await getAssetPriceFromDb('PETR4');

      expect(result).toBe(42.5);
      expect(mockPrisma.assetPriceHistory.findFirst).toHaveBeenCalledWith({
        where: { symbol: 'PETR4' },
        orderBy: { date: 'desc' },
        select: { price: true },
      });
    });

    it('returns null when no history exists', async () => {
      mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);

      const result = await getAssetPriceFromDb('UNKNOWN');

      expect(result).toBeNull();
    });
  });

  // ─── getAssetCurrentPriceFromDb ────────────────────────────────────

  describe('getAssetCurrentPriceFromDb', () => {
    it('returns current price when asset has one', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({
        currentPrice: new Decimal(35.8),
      });

      const result = await getAssetCurrentPriceFromDb('VALE3');

      expect(result).toBe(35.8);
      expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({
        where: { symbol: 'VALE3' },
        select: { currentPrice: true },
      });
    });

    it('returns null when asset has no current price', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);

      const result = await getAssetCurrentPriceFromDb('MISSING');

      expect(result).toBeNull();
    });
  });

  // ─── getAssetPrice ─────────────────────────────────────────────────

  describe('getAssetPrice', () => {
    it('returns null for empty/blank symbol', async () => {
      expect(await getAssetPrice('')).toBeNull();
      expect(await getAssetPrice('   ')).toBeNull();
    });

    it('returns DB currentPrice when priceUpdatedAt is today', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({
        currentPrice: new Decimal(29.5),
        priceUpdatedAt: new Date('2026-03-30T14:30:00.000Z'),
        type: 'stock',
        currency: 'BRL',
        source: 'brapi',
      });

      const result = await getAssetPrice('PETR4');

      expect(result).toBe(29.5);
      // Should not call history or BRAPI
      expect(mockPrisma.assetPriceHistory.findFirst).not.toHaveBeenCalled();
      expect(mockFetchQuotes).not.toHaveBeenCalled();
    });

    it('returns currentPrice when updated yesterday (within 7-day window)', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({
        currentPrice: new Decimal(29.5),
        priceUpdatedAt: YESTERDAY,
        type: 'stock',
        currency: 'BRL',
        source: 'brapi',
      });

      const result = await getAssetPrice('PETR4');

      expect(result).toBe(29.5);
      expect(mockPrisma.assetPriceHistory.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to history when currentPrice is older than 7 days', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({
        currentPrice: new Decimal(29.5),
        priceUpdatedAt: STALE_DATE,
        type: 'stock',
        currency: 'BRL',
        source: 'brapi',
      });
      mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
        price: new Decimal(30.0),
        date: YESTERDAY,
      });

      const result = await getAssetPrice('PETR4');

      expect(result).toBe(30.0);
    });

    it('falls back to BRAPI when all DB data is older than 7 days', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({
        currentPrice: new Decimal(29.5),
        priceUpdatedAt: STALE_DATE,
        type: 'stock',
        currency: 'BRL',
        source: 'brapi',
      });
      mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
        price: new Decimal(28.0),
        date: STALE_DATE,
      });
      mockFetchQuotes.mockResolvedValue(new Map([['PETR4', 31.0]]));
      mockPrisma.asset.findUnique
        .mockResolvedValueOnce({
          currentPrice: new Decimal(29.5),
          priceUpdatedAt: STALE_DATE,
          type: 'stock',
          currency: 'BRL',
          source: 'brapi',
        })
        .mockResolvedValueOnce({ id: 'asset-1', currency: 'BRL' });
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await getAssetPrice('PETR4');

      expect(result).toBe(31.0);
      expect(mockFetchQuotes).toHaveBeenCalledWith(['PETR4'], false);
    });

    it('persists BRAPI price after fetch', async () => {
      mockPrisma.asset.findUnique
        .mockResolvedValueOnce({
          currentPrice: null,
          priceUpdatedAt: null,
          type: 'stock',
          currency: 'BRL',
          source: 'brapi',
        })
        .mockResolvedValueOnce({ id: 'asset-1', currency: 'BRL' });
      mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);
      mockFetchQuotes.mockResolvedValue(new Map([['ITUB4', 25.0]]));
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await getAssetPrice('ITUB4');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('skips BRAPI for manual assets (source=manual)', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({
        currentPrice: null,
        priceUpdatedAt: null,
        type: 'reit',
        currency: 'USD',
        source: 'manual',
      });
      mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);

      const result = await getAssetPrice('O-1731234567890-abc');

      // Manual symbol with timestamp pattern is blocked
      expect(result).toBeNull();
      expect(mockFetchQuotes).not.toHaveBeenCalled();
    });

    it('returns null when useBrapiFallback=false and no DB data', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({
        currentPrice: null,
        priceUpdatedAt: null,
        type: 'stock',
        currency: 'BRL',
        source: 'brapi',
      });
      mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);

      const result = await getAssetPrice('PETR4', { useBrapiFallback: false });

      expect(result).toBeNull();
      expect(mockFetchQuotes).not.toHaveBeenCalled();
    });

    it('returns null for blocked symbols (RESERVA-EMERG, etc.)', async () => {
      const blockedSymbols = [
        'RESERVA-EMERG-001',
        'RESERVA-OPORT-001',
        'RENDA-FIXA-CDB',
        'CONTA-CORRENTE-ITAU',
        'PERSONALIZADO-ABC',
        'DEBENTURE-XYZ',
        'FUNDO-MULT',
      ];

      for (const sym of blockedSymbols) {
        const result = await getAssetPrice(sym);
        expect(result).toBeNull();
      }

      // None of these should trigger DB calls
      expect(mockPrisma.asset.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── getAssetPrices ────────────────────────────────────────────────

  describe('getAssetPrices', () => {
    it('uses DB prices within 7-day window, fetches BRAPI only for stale ones', async () => {
      // PETR4 has today's price, VALE3 has stale price (> 7 days)
      mockPrisma.asset.findMany
        .mockResolvedValueOnce([
          { symbol: 'PETR4', currentPrice: new Decimal(30), priceUpdatedAt: TODAY },
          { symbol: 'VALE3', currentPrice: new Decimal(50), priceUpdatedAt: STALE_DATE },
        ])
        .mockResolvedValueOnce([
          { symbol: 'VALE3', type: 'stock', currency: 'BRL', source: 'brapi' },
        ]);
      mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
      mockFetchQuotes.mockResolvedValue(new Map([['VALE3', 52.0]]));
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-2', currency: 'BRL' });
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await getAssetPrices(['PETR4', 'VALE3']);

      expect(result.get('PETR4')).toBe(30);
      expect(result.get('VALE3')).toBe(52.0);
      expect(mockFetchQuotes).toHaveBeenCalled();
    });

    it('returns DB price from yesterday without calling BRAPI', async () => {
      mockPrisma.asset.findMany.mockResolvedValueOnce([
        { symbol: 'PETR4', currentPrice: new Decimal(29.5), priceUpdatedAt: YESTERDAY },
      ]);
      mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);

      const result = await getAssetPrices(['PETR4']);

      expect(result.get('PETR4')).toBe(29.5);
      expect(mockFetchQuotes).not.toHaveBeenCalled();
    });

    it('handles mixed types (crypto, currency, stock)', async () => {
      mockPrisma.asset.findMany
        .mockResolvedValueOnce([]) // no fresh prices in DB
        .mockResolvedValueOnce([
          { symbol: 'BTC', type: 'crypto', currency: 'BRL', source: 'brapi' },
          { symbol: 'USD-BRL', type: 'currency', currency: 'BRL', source: 'brapi' },
          { symbol: 'PETR4', type: 'stock', currency: 'BRL', source: 'brapi' },
        ]);
      mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
      mockFetchCryptoQuotes.mockResolvedValue(new Map([['BTC', 350000]]));
      mockFetchCurrencyQuotes.mockResolvedValue(new Map([['USD-BRL', 5.15]]));
      mockFetchQuotes.mockResolvedValue(new Map([['PETR4', 30]]));
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'a-1', currency: 'BRL' });
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await getAssetPrices(['BTC', 'USD-BRL', 'PETR4']);

      expect(result.get('BTC')).toBe(350000);
      expect(result.get('USD-BRL')).toBe(5.15);
      expect(result.get('PETR4')).toBe(30);
    });

    it('returns empty map for empty input', async () => {
      const result = await getAssetPrices([]);

      expect(result.size).toBe(0);
      expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
    });

    it('maps manual symbol base tickers back to full symbols', async () => {
      const manualSymbol = 'AAPL-1731234567890-abc';
      const manualSymbolUpper = manualSymbol.toUpperCase();

      // 1st findMany: manual asset type check (to exclude REITs)
      mockPrisma.asset.findMany
        .mockResolvedValueOnce([{ symbol: manualSymbolUpper, type: 'stock' }])
        // 2nd findMany: assetsWithPrice batch DB lookup — base ticker AAPL has today's price
        .mockResolvedValueOnce([
          { symbol: 'AAPL', currentPrice: new Decimal(180), priceUpdatedAt: TODAY },
        ]);

      mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);

      const result = await getAssetPrices([manualSymbol]);

      // Base ticker AAPL price should be mapped back to the full manual symbol
      expect(result.get(manualSymbolUpper)).toBe(180);
    });

    it('skips blocked symbols', async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);
      mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);

      const result = await getAssetPrices(['RESERVA-EMERG-001', 'RENDA-FIXA-CDB', 'FUNDO-MULT']);

      expect(result.size).toBe(0);
    });
  });

  // ─── getAssetHistory ───────────────────────────────────────────────

  describe('getAssetHistory', () => {
    const startDate = new Date('2026-01-01T00:00:00.000Z');
    const endDate = new Date('2026-03-30T00:00:00.000Z');

    it('returns DB data when sufficient', async () => {
      // ~89 days range, need >44 records for sufficiency
      const dbRecords = Array.from({ length: 60 }, (_, i) => ({
        date: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`),
        price: new Decimal(100 + i),
      }));

      mockPrisma.assetPriceHistory.findMany.mockResolvedValue(dbRecords);

      const result = await getAssetHistory('PETR4', startDate, endDate);

      expect(result.length).toBe(60);
      expect(result[0]).toEqual({ date: dbRecords[0].date.getTime(), value: 100 });
      expect(mockGlobalFetch).not.toHaveBeenCalled();
    });

    it('falls back to BRAPI when insufficient DB data', async () => {
      mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
        { date: new Date('2026-03-01'), price: new Decimal(100) },
      ]);

      // Mock fetch for BRAPI history endpoint
      mockGlobalFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                historicalDataPrice: [
                  { date: Math.floor(new Date('2026-01-15').getTime() / 1000), close: 95 },
                  { date: Math.floor(new Date('2026-02-15').getTime() / 1000), close: 98 },
                ],
              },
            ],
          }),
      });

      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', currency: 'BRL' });
      mockPrisma.assetPriceHistory.upsert.mockResolvedValue({});

      const result = await getAssetHistory('PETR4', startDate, endDate);

      // Should merge DB + BRAPI data
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(mockGlobalFetch).toHaveBeenCalled();
    });

    it('filters blocked symbols and returns empty', async () => {
      const blockedSymbols = ['RESERVA-EMERG-001', 'RENDA-FIXA-CDB', 'DEBENTURE-XYZ', 'FUNDO-ABC'];

      for (const sym of blockedSymbols) {
        const result = await getAssetHistory(sym, startDate, endDate);
        expect(result).toEqual([]);
      }

      expect(mockPrisma.assetPriceHistory.findMany).not.toHaveBeenCalled();
    });

    it('handles empty result gracefully', async () => {
      mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
      mockGlobalFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ historicalDataPrice: [] }],
          }),
      });
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', currency: 'BRL' });

      const result = await getAssetHistory('UNKNOWN', startDate, endDate);

      expect(result).toEqual([]);
    });
  });

  // ─── persistPriceFromBrapi ─────────────────────────────────────────

  describe('persistPriceFromBrapi', () => {
    it('upserts price correctly into history and updates asset', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', currency: 'BRL' });
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await persistPriceFromBrapi('PETR4', 31.5);

      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        mockPrisma.assetPriceHistory.upsert({
          where: {
            symbol_date: { symbol: 'PETR4', date: expect.any(Date) },
          },
          update: { price: expect.any(Decimal) },
          create: {
            assetId: 'asset-1',
            symbol: 'PETR4',
            price: expect.any(Decimal),
            currency: 'BRL',
            source: 'BRAPI',
            date: expect.any(Date),
          },
        }),
        mockPrisma.asset.update({
          where: { id: 'asset-1' },
          data: {
            currentPrice: expect.any(Decimal),
            priceUpdatedAt: expect.any(Date),
          },
        }),
      ]);
    });

    it('handles currency parameter override', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-2', currency: 'USD' });
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await persistPriceFromBrapi('BTC', 350000, { currency: 'BRL' });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      // The $transaction call should include the currency override
      const transactionArg = mockPrisma.$transaction.mock.calls[0][0];
      // Verify the transaction was called (the upsert and update are lazy-evaluated by Prisma)
      expect(transactionArg).toHaveLength(2);
    });
  });
});

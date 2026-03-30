import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  assetDividendHistory: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const mockFetch = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BRAPI_API_KEY', 'test-key');
  global.fetch = mockFetch;
});

import { getDividends } from '../dividendService';

const makeBrapiResponse = (dividends: Record<string, unknown>[]) => ({
  ok: true,
  json: () =>
    Promise.resolve({
      results: [{ dividendsData: { cashDividends: dividends } }],
    }),
});

const makeDbRow = (date: Date, tipo: string, valorUnitario: number) => ({
  date,
  tipo,
  valorUnitario,
});

describe('getDividends', () => {
  // ── DB-first ──

  describe('DB-first: returns existing dividends from DB', () => {
    it('returns dividends from DB when rows exist', async () => {
      const d1 = makeDbRow(new Date('2024-01-15'), 'Dividendo', 0.5);
      const d2 = makeDbRow(new Date('2024-04-15'), 'JCP', 1.2);
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([d1, d2]);

      const result = await getDividends('PETR4');

      expect(result).toHaveLength(2);
      expect(result[0].tipo).toBe('Dividendo');
      expect(result[1].tipo).toBe('JCP');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('deduplicates DB rows by date+tipo key', async () => {
      const date = new Date('2024-01-15');
      const d1 = makeDbRow(date, 'Dividendo', 0.5);
      const d2 = makeDbRow(date, 'Dividendo', 0.6);
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([d1, d2]);

      const result = await getDividends('PETR4');

      expect(result).toHaveLength(1);
      expect(result[0].valorUnitario).toBe(0.5); // keeps first
    });
  });

  // ── BRAPI fallback ──

  describe('BRAPI fallback: fetches and persists when DB empty', () => {
    it('fetches from BRAPI when DB returns empty', async () => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([]);
      mockPrisma.assetDividendHistory.upsert.mockResolvedValue({});
      mockFetch.mockResolvedValue(
        makeBrapiResponse([{ paymentDate: '2024-06-01', cashAmount: 0.75, type: 'Dividendo' }]),
      );

      const result = await getDividends('VALE3');

      expect(result).toHaveLength(1);
      expect(result[0].valorUnitario).toBe(0.75);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('persists fetched dividends to DB via upsert', async () => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([]);
      mockPrisma.assetDividendHistory.upsert.mockResolvedValue({});
      mockFetch.mockResolvedValue(
        makeBrapiResponse([{ paymentDate: '2024-06-01', cashAmount: 0.75, type: 'Dividendo' }]),
      );

      await getDividends('VALE3');

      expect(mockPrisma.assetDividendHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            symbol_date_tipo: expect.objectContaining({
              symbol: 'VALE3',
              tipo: 'Dividendo',
            }),
          }),
          create: expect.objectContaining({
            symbol: 'VALE3',
            source: 'BRAPI',
          }),
        }),
      );
    });

    it('tries .SA suffix when first symbol returns no results', async () => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([]);
      mockPrisma.assetDividendHistory.upsert.mockResolvedValue({});

      // First call (VALE3) returns empty results
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [{}] }),
        })
        // Second call (VALE3.SA) returns dividends
        .mockResolvedValueOnce(
          makeBrapiResponse([{ paymentDate: '2024-06-01', cashAmount: 0.5, type: 'Dividendo' }]),
        );

      const result = await getDividends('VALE3');

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toContain('VALE3.SA');
    });
  });

  // ── Blocked symbols ──

  describe('Blocked symbols: returns empty', () => {
    it.each(['RESERVA-EMERG-1', 'RENDA-FIXA-CDB', 'PERSONALIZADO-ABC'])(
      'returns empty for blocked symbol %s',
      async (symbol) => {
        const result = await getDividends(symbol);

        expect(result).toEqual([]);
        expect(mockPrisma.assetDividendHistory.findMany).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
      },
    );
  });

  // ── Parsing edge cases via BRAPI response ──

  describe('Parsing edge cases via BRAPI response', () => {
    beforeEach(() => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([]);
      mockPrisma.assetDividendHistory.upsert.mockResolvedValue({});
    });

    it('handles paymentDate field', async () => {
      mockFetch.mockResolvedValue(
        makeBrapiResponse([{ paymentDate: '2024-03-15', cashAmount: 1.0, type: 'JCP' }]),
      );

      const result = await getDividends('ITUB4');

      expect(result).toHaveLength(1);
      expect(result[0].date).toBeInstanceOf(Date);
      expect(result[0].tipo).toBe('JCP');
    });

    it('handles Unix timestamps in seconds', async () => {
      // Unix timestamp in seconds: 2024-01-15T00:00:00Z = 1705276800
      const unixSeconds = 1705276800;
      mockFetch.mockResolvedValue(
        makeBrapiResponse([{ paymentDate: unixSeconds, cashAmount: 0.5, type: 'Dividendo' }]),
      );

      const result = await getDividends('BBAS3');

      expect(result).toHaveLength(1);
      // Should have been multiplied by 1000 since < 1e12
      expect(result[0].date.getTime()).toBe(unixSeconds * 1000);
    });

    it('handles ISO string dates', async () => {
      mockFetch.mockResolvedValue(
        makeBrapiResponse([
          { paymentDate: '2024-07-20T00:00:00.000Z', cashAmount: 2.0, type: 'Rendimento' },
        ]),
      );

      const result = await getDividends('HGLG11');

      expect(result).toHaveLength(1);
      expect(result[0].date.toISOString()).toBe('2024-07-20T00:00:00.000Z');
    });
  });

  // ── Edge cases ──

  describe('Edge cases', () => {
    it('blank symbol returns empty', async () => {
      const result = await getDividends('   ');

      expect(result).toEqual([]);
      expect(mockPrisma.assetDividendHistory.findMany).not.toHaveBeenCalled();
    });

    it('useBrapiFallback=false skips BRAPI', async () => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([]);

      const result = await getDividends('PETR4', { useBrapiFallback: false });

      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── BRAPI response with nested dividends + cashDividends arrays ──

  describe('BRAPI response with nested structures', () => {
    beforeEach(() => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([]);
      mockPrisma.assetDividendHistory.upsert.mockResolvedValue({});
    });

    it('handles dividendsData.cashDividends nested array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                dividendsData: {
                  cashDividends: [
                    { paymentDate: '2024-01-10', cashAmount: 0.3, type: 'Dividendo' },
                    { paymentDate: '2024-04-10', cashAmount: 0.4, type: 'Dividendo' },
                  ],
                },
              },
            ],
          }),
      });

      const result = await getDividends('WEGE3');

      expect(result).toHaveLength(2);
      expect(result[0].valorUnitario).toBe(0.3);
      expect(result[1].valorUnitario).toBe(0.4);
    });

    it('flattens both dividends and cashDividends arrays', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                dividends: [{ paymentDate: '2024-01-10', cashAmount: 0.3, type: 'Dividendo' }],
                cashDividends: [{ paymentDate: '2024-07-10', cashAmount: 0.6, type: 'JCP' }],
              },
            ],
          }),
      });

      const result = await getDividends('BBDC4');

      expect(result).toHaveLength(2);
    });
  });
});

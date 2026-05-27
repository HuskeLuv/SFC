import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  asset: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  assetPriceHistory: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn().mockResolvedValue([]),
}));

const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

vi.stubGlobal('fetch', mockFetch);

import {
  fetchYahooHistory,
  syncYahooSymbol,
  YAHOO_SOURCE,
  __internals__,
} from '../yahooFinanceSync';

// ── Helpers ────────────────────────────────────────────────────────────

/** Cria uma resposta no formato chart do Yahoo (subset usado pelo service). */
function makeYahooResponse(opts: {
  timestamps?: number[];
  closes?: Array<number | null>;
  adjcloses?: Array<number | null>;
  error?: { code?: string; description?: string } | null;
  httpStatus?: number;
}) {
  const status = opts.httpStatus ?? 200;
  if (opts.error) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve({ chart: { result: null, error: opts.error } }),
    };
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      Promise.resolve({
        chart: {
          result: [
            {
              meta: {
                currency: 'BRL',
                symbol: '^BVSP',
                longName: 'IBOVESPA',
                instrumentType: 'INDEX',
              },
              timestamp: opts.timestamps,
              indicators: {
                quote: [{ close: opts.closes ?? [] }],
                adjclose: [{ adjclose: opts.adjcloses ?? [] }],
              },
            },
          ],
          error: null,
        },
      }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date('2026-05-27T12:00:00.000Z') });
});

// ── fetchYahooHistory ──────────────────────────────────────────────────

describe('fetchYahooHistory', () => {
  it('parses chart response into normalized YahooHistoryPoint[]', async () => {
    // Mon 2024-04-29 12:00:00 UTC e Tue 2024-04-30 12:00:00 UTC
    const t1 = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    const t2 = Math.floor(new Date('2024-04-30T12:00:00Z').getTime() / 1000);
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [t1, t2],
        closes: [127122.0, 128509.0],
        adjcloses: [127122.0, 128509.0],
      }),
    );

    const points = await fetchYahooHistory('^BVSP', 1);

    expect(points).toHaveLength(2);
    expect(points[0].date.toISOString()).toBe('2024-04-29T00:00:00.000Z');
    expect(points[0].close).toBe(127122.0);
    expect(points[1].date.toISOString()).toBe('2024-04-30T00:00:00.000Z');
    expect(points[1].close).toBe(128509.0);
  });

  it('prefers adjclose over close when both present', async () => {
    const t1 = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [t1],
        closes: [100],
        adjcloses: [99.5], // ajustado por splits — deve prevalecer
      }),
    );

    const points = await fetchYahooHistory('^BVSP', 1);

    expect(points[0].close).toBe(99.5);
  });

  it('falls back to close when adjclose is null', async () => {
    const t1 = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [t1],
        closes: [100],
        adjcloses: [null],
      }),
    );

    const points = await fetchYahooHistory('^BVSP', 1);

    expect(points[0].close).toBe(100);
  });

  it('skips points with null/invalid close', async () => {
    const t1 = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    const t2 = Math.floor(new Date('2024-04-30T12:00:00Z').getTime() / 1000);
    const t3 = Math.floor(new Date('2024-05-01T12:00:00Z').getTime() / 1000);
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [t1, t2, t3],
        closes: [100, null, 0], // null e 0 devem ser descartados
        adjcloses: [null, null, null],
      }),
    );

    const points = await fetchYahooHistory('^BVSP', 1);

    expect(points).toHaveLength(1);
    expect(points[0].close).toBe(100);
  });

  it('skips invalid timestamps (NaN, negatives)', async () => {
    const tValid = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [-1, Number.NaN, tValid],
        closes: [10, 20, 30],
        adjcloses: [null, null, null],
      }),
    );

    const points = await fetchYahooHistory('^BVSP', 1);

    expect(points).toHaveLength(1);
    expect(points[0].close).toBe(30);
  });

  it('throws on Yahoo error payload', async () => {
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        error: { code: 'Not Found', description: 'No data found' },
      }),
    );

    await expect(fetchYahooHistory('^IFNC', 1)).rejects.toThrow(/Not Found/);
  });

  it('deduplicates points sharing the same UTC day', async () => {
    // Dois timestamps no mesmo dia UTC (intra-day)
    const t1 = Math.floor(new Date('2024-04-29T10:00:00Z').getTime() / 1000);
    const t2 = Math.floor(new Date('2024-04-29T20:00:00Z').getTime() / 1000);
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [t1, t2],
        closes: [100, 105],
        adjcloses: [null, null],
      }),
    );

    const points = await fetchYahooHistory('^BVSP', 1);

    expect(points).toHaveLength(1);
    // O segundo entry sobrescreve o primeiro (último valor do dia ganha)
    expect(points[0].close).toBe(105);
  });

  it('sends period1/period2 as Unix seconds and 1d interval', async () => {
    mockFetch.mockResolvedValue(makeYahooResponse({ timestamps: [], closes: [], adjcloses: [] }));

    await fetchYahooHistory('^BVSP', 2);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('finance.yahoo.com/v8/finance/chart');
    expect(url).toContain(encodeURIComponent('^BVSP'));
    expect(url).toContain('interval=1d');

    const parsed = new URL(url);
    const period1 = Number(parsed.searchParams.get('period1'));
    const period2 = Number(parsed.searchParams.get('period2'));
    expect(Number.isFinite(period1)).toBe(true);
    expect(Number.isFinite(period2)).toBe(true);
    expect(period2).toBeGreaterThan(period1);
    // 2 anos ≈ 730 dias em segundos
    const diff = period2 - period1;
    expect(diff).toBeGreaterThan(2 * 365 * 24 * 60 * 60 - 10);
    expect(diff).toBeLessThan(2 * 366 * 24 * 60 * 60 + 10);

    // Verifica que user-agent foi enviado
    expect(init.headers['User-Agent']).toContain('Mozilla');
  });

  it('throws when both mirrors return non-OK HTTP status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
    });

    await expect(fetchYahooHistory('^BVSP', 1)).rejects.toThrow(/HTTP 429/);
    // Tentou os dois mirrors antes de desistir.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to query2 when query1 returns 429', async () => {
    const t1 = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce(
        makeYahooResponse({
          timestamps: [t1],
          closes: [127122],
          adjcloses: [null],
        }),
      );

    const points = await fetchYahooHistory('^BVSP', 1);

    expect(points).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const url1 = mockFetch.mock.calls[0][0] as string;
    const url2 = mockFetch.mock.calls[1][0] as string;
    expect(url1).toContain('query1');
    expect(url2).toContain('query2');
  });

  it('rejects years <= 0', async () => {
    await expect(fetchYahooHistory('^BVSP', 0)).rejects.toThrow();
    await expect(fetchYahooHistory('^BVSP', -1)).rejects.toThrow();
  });
});

// ── syncYahooSymbol ────────────────────────────────────────────────────

describe('syncYahooSymbol', () => {
  it('dry-run não chama Prisma de escrita e retorna fetched count', async () => {
    const t1 = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    const t2 = Math.floor(new Date('2024-04-30T12:00:00Z').getTime() / 1000);
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [t1, t2],
        closes: [127122, 128509],
        adjcloses: [null, null],
      }),
    );

    const result = await syncYahooSymbol('^BVSP', '^BVSP', 1, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.fetched).toBe(2);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(mockPrisma.asset.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('apply: cria asset quando não existe e upserta histórico', async () => {
    const t1 = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [t1],
        closes: [127122],
        adjcloses: [null],
      }),
    );
    mockPrisma.asset.findUnique.mockResolvedValue(null);
    mockPrisma.asset.upsert.mockResolvedValue({ id: 'asset-1', currency: 'BRL' });
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);

    const result = await syncYahooSymbol('^BVSP', '^BVSP', 1);

    expect(mockPrisma.asset.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.asset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { symbol: '^BVSP' },
        create: expect.objectContaining({
          symbol: '^BVSP',
          type: 'index',
          name: 'IBOVESPA',
        }),
      }),
    );
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.dryRun).toBe(false);
  });

  it('apply: contabiliza updated quando registro já existe', async () => {
    const t1 = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    const expectedDate = new Date(Date.UTC(2024, 3, 29));
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [t1],
        closes: [127122],
        adjcloses: [null],
      }),
    );
    mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', currency: 'BRL' });
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([{ date: expectedDate }]);

    const result = await syncYahooSymbol('^BVSP', '^BVSP', 1);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    expect(mockPrisma.asset.upsert).not.toHaveBeenCalled();
  });

  it('apply: upsert payload usa source=YAHOO_FINANCE e Decimal pra price', async () => {
    const t1 = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [t1],
        closes: [127122.5],
        adjcloses: [null],
      }),
    );
    mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', currency: 'BRL' });
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);

    await syncYahooSymbol('^BVSP', '^BVSP', 1);

    expect(mockPrisma.assetPriceHistory.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.assetPriceHistory.upsert.mock.calls[0][0];
    expect(call.where.symbol_date.symbol).toBe('^BVSP');
    expect(call.create.source).toBe(YAHOO_SOURCE);
    expect(call.update.source).toBe(YAHOO_SOURCE);
    expect(call.create.price).toBeInstanceOf(Decimal);
    expect(call.create.price.toString()).toBe('127122.5');
  });

  it('apply é idempotente: rodar com mesmo dado dá 0 inseridos + N atualizados', async () => {
    const t1 = Math.floor(new Date('2024-04-29T12:00:00Z').getTime() / 1000);
    const t2 = Math.floor(new Date('2024-04-30T12:00:00Z').getTime() / 1000);
    const d1 = new Date(Date.UTC(2024, 3, 29));
    const d2 = new Date(Date.UTC(2024, 3, 30));
    mockFetch.mockResolvedValue(
      makeYahooResponse({
        timestamps: [t1, t2],
        closes: [100, 110],
        adjcloses: [null, null],
      }),
    );
    mockPrisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', currency: 'BRL' });
    // Segunda execução: tudo já existe
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([{ date: d1 }, { date: d2 }]);

    const result = await syncYahooSymbol('^BVSP', '^BVSP', 1);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(2);
  });

  it('fetched=0 → não chama Prisma e retorna result vazio', async () => {
    mockFetch.mockResolvedValue(makeYahooResponse({ timestamps: [], closes: [], adjcloses: [] }));

    const result = await syncYahooSymbol('^BVSP', '^BVSP', 1);

    expect(result.fetched).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.asset.upsert).not.toHaveBeenCalled();
  });

  it('USD-BRL → assetTypeFromTicker=currency, nome amigável', async () => {
    mockFetch.mockResolvedValue(makeYahooResponse({ timestamps: [], closes: [], adjcloses: [] }));

    // Aciona o caminho de dryRun pra não precisar mockar Prisma.
    await syncYahooSymbol('BRL=X', 'USD-BRL', 1, { dryRun: true });

    expect(__internals__.assetTypeFromTicker('BRL=X')).toBe('currency');
    expect(__internals__.assetNameFromTicker('BRL=X')).toBe('Dólar Americano (USD)');
  });
});

// ── helpers internos ───────────────────────────────────────────────────

describe('normalizeDateToUtcDayStart', () => {
  it('zera horas/minutos/segundos preservando data UTC', () => {
    const d = new Date('2024-04-29T18:43:21.123Z');
    const normalized = __internals__.normalizeDateToUtcDayStart(d);
    expect(normalized.toISOString()).toBe('2024-04-29T00:00:00.000Z');
  });
});

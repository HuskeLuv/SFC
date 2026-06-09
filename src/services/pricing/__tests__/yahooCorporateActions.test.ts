import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchYahooSplits,
  fetchYahooDividends,
  syncYahooDividends,
} from '@/services/pricing/yahooCorporateActions';

const mockDivUpsert = vi.hoisted(() => vi.fn());
const mockDivFindFirst = vi.hoisted(() => vi.fn(async () => null as { date: Date } | null));
const mockDivDeleteMany = vi.hoisted(() => vi.fn(async () => ({ count: 0 })));
const mockCaFindMany = vi.hoisted(() =>
  vi.fn(async () => [] as Array<{ date: Date; factor: number }>),
);

vi.mock('@/lib/prisma', () => ({
  prisma: {
    assetCorporateAction: { upsert: vi.fn(), findMany: mockCaFindMany },
    assetDividendHistory: {
      upsert: mockDivUpsert,
      findFirst: mockDivFindFirst,
      deleteMany: mockDivDeleteMany,
    },
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function mockDivChart(dividends: Record<string, unknown> | null) {
  return {
    ok: true,
    json: async () => ({
      chart: { result: [{ events: dividends ? { dividends } : {} }], error: null },
    }),
  };
}

function mockChart(splits: Record<string, unknown> | null) {
  return {
    ok: true,
    json: async () => ({
      chart: { result: [{ events: splits ? { splits } : {} }], error: null },
    }),
  };
}

describe('fetchYahooSplits', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('mapeia desdobramento 10:1 do HFOF11 → factor 10, DESDOBRAMENTO', async () => {
    // 1747054800 = 2025-05-12 (ex-date do split real do HFOF11)
    global.fetch = vi.fn().mockResolvedValue(
      mockChart({
        '1747054800': { date: 1747054800, numerator: 10, denominator: 1, splitRatio: '10:1' },
      }),
    ) as unknown as typeof fetch;

    const splits = await fetchYahooSplits('HFOF11');
    expect(splits).toHaveLength(1);
    expect(splits[0].factor).toBe(10);
    expect(splits[0].type).toBe('DESDOBRAMENTO');
    expect(splits[0].completeFactor).toBe('10:1');
    expect(splits[0].date.toISOString().slice(0, 10)).toBe('2025-05-12');
  });

  it('mapeia grupamento 1:2 → factor 0.5, GRUPAMENTO', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChart({
        '1700000000': { date: 1700000000, numerator: 1, denominator: 2, splitRatio: '1:2' },
      }),
    ) as unknown as typeof fetch;

    const splits = await fetchYahooSplits('XPTO11');
    expect(splits[0].factor).toBe(0.5);
    expect(splits[0].type).toBe('GRUPAMENTO');
  });

  it('retorna [] quando não há eventos', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockChart(null)) as unknown as typeof fetch;
    expect(await fetchYahooSplits('PETR4')).toEqual([]);
  });

  it('ignora factor inválido (==1, zero, negativo)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockChart({
        a: { date: 1700000000, numerator: 1, denominator: 1, splitRatio: '1:1' },
        b: { date: 1700000001, numerator: 0, denominator: 1 },
      }),
    ) as unknown as typeof fetch;
    expect(await fetchYahooSplits('AAAA11')).toEqual([]);
  });

  it('chama o Yahoo com ticker .SA', async () => {
    const spy = vi.fn().mockResolvedValue(mockChart(null));
    global.fetch = spy as unknown as typeof fetch;
    await fetchYahooSplits('HFOF11');
    expect(spy).toHaveBeenCalled();
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('/HFOF11.SA');
    expect(url).toContain('events=split');
  });
});

describe('fetchYahooDividends', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('parseia dividendos do Yahoo (events=div)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockDivChart({
        a: { date: 1717200000, amount: 0.06 }, // 2024-06-01
        b: { date: 1719878400, amount: 0.06 }, // 2024-07-02
      }),
    ) as unknown as typeof fetch;
    const divs = await fetchYahooDividends('HFOF11');
    expect(divs).toHaveLength(2);
    expect(divs[0].amount).toBe(0.06);
    expect(
      String((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]),
    ).toContain('events=div');
  });
});

describe('syncYahooDividends (des-ajuste + gap-fill)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDivUpsert.mockReset();
    mockDivFindFirst.mockReset();
    mockDivDeleteMany.mockReset();
    mockDivDeleteMany.mockResolvedValue({ count: 0 });
    mockCaFindMany.mockReset();
  });

  it('des-ajusta pré-split pra cru, limpa YAHOO antigo e respeita cutoff por MÊS', async () => {
    // Yahoo: 2024-07 (pré-split), 2025-06-01 (MESMO mês da BRAPI), 2025-07 (pós).
    global.fetch = vi.fn().mockResolvedValue(
      mockDivChart({
        a: { date: Date.UTC(2024, 6, 1) / 1000, amount: 0.06 },
        b: { date: Date.UTC(2025, 5, 1) / 1000, amount: 0.056 }, // jun/2025 — Yahoo ex-date
        c: { date: Date.UTC(2025, 6, 1) / 1000, amount: 0.056 },
      }),
    ) as unknown as typeof fetch;
    // BRAPI mais antigo: 2025-06-13 → cutoff = início de jun/2025
    mockDivFindFirst.mockResolvedValue({ date: new Date(Date.UTC(2025, 5, 13)) });
    mockCaFindMany.mockResolvedValue([{ date: new Date(Date.UTC(2025, 4, 12)), factor: 10 }]);

    const n = await syncYahooDividends('HFOF11');
    // jun/2025 (mesmo mês da BRAPI) e jul/2025 são pulados → só 2024-07 entra
    expect(n).toBe(1);
    expect(mockDivDeleteMany).toHaveBeenCalledWith({
      where: { symbol: 'HFOF11', source: 'YAHOO' },
    });
    const arg = mockDivUpsert.mock.calls[0][0];
    expect(arg.create.valorUnitario).toBeCloseTo(0.6, 5); // 0,06 × 10
    expect(arg.create.source).toBe('YAHOO');
  });
});

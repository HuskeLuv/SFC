import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchYahooSplits } from '@/services/pricing/yahooCorporateActions';

// Mock só do prisma (persist não é exercido aqui), pra o import do módulo não
// puxar uma conexão real.
vi.mock('@/lib/prisma', () => ({ prisma: { assetCorporateAction: { upsert: vi.fn() } } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

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

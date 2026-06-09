import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  assetDividendHistory: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
  },
  assetCorporateAction: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
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

import {
  getDividends,
  isJcpType,
  getJcpIrrfRate,
  ensureCorporateActionsSynced,
} from '../dividendService';

const makeBrapiResponse = (dividends: Record<string, unknown>[]) => ({
  ok: true,
  json: () =>
    Promise.resolve({
      results: [{ dividendsData: { cashDividends: dividends } }],
    }),
});

const makeDbRow = (
  date: Date,
  tipo: string,
  valorUnitario: number,
  dataCom: Date | null = null,
) => ({
  date,
  dataCom,
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

  // ── Bug #01: data-com / ex-date ──

  describe('Bug #01 — data-com (ex-date) tracking', () => {
    beforeEach(() => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([]);
      mockPrisma.assetDividendHistory.upsert.mockResolvedValue({});
    });

    it('captures exDate as dataCom when present', async () => {
      const exDateUtc = Date.UTC(2025, 5, 2); // 2025-06-02 UTC, tz-independent
      const payDateUtc = Date.UTC(2025, 7, 20);
      mockFetch.mockResolvedValue(
        makeBrapiResponse([
          {
            paymentDate: payDateUtc,
            exDate: exDateUtc,
            cashAmount: 0.5,
            type: 'Dividendo',
          },
        ]),
      );

      const result = await getDividends('PETR4');

      expect(result).toHaveLength(1);
      expect(result[0].dataCom).toBeInstanceOf(Date);
      expect(result[0].dataCom?.getTime()).toBe(exDateUtc);
      expect(result[0].date.getTime()).toBe(payDateUtc);
    });

    it('persists dataCom alongside paymentDate', async () => {
      const exDateUtc = Date.UTC(2025, 5, 2);
      mockFetch.mockResolvedValue(
        makeBrapiResponse([
          {
            paymentDate: Date.UTC(2025, 7, 20),
            exDividendDate: exDateUtc,
            cashAmount: 0.5,
            type: 'Dividendo',
          },
        ]),
      );

      await getDividends('PETR4');

      expect(mockPrisma.assetDividendHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            symbol: 'PETR4',
            dataCom: expect.any(Date),
          }),
        }),
      );
    });

    it('falls back to recordDate when exDate/exDividendDate absent', async () => {
      const recordDateUtc = Date.UTC(2025, 5, 5);
      mockFetch.mockResolvedValue(
        makeBrapiResponse([
          {
            paymentDate: Date.UTC(2025, 7, 20),
            recordDate: recordDateUtc,
            cashAmount: 0.5,
            type: 'Dividendo',
          },
        ]),
      );

      const result = await getDividends('PETR4');

      expect(result[0].dataCom?.getTime()).toBe(recordDateUtc);
    });

    it('returns dataCom=null when no ex-date field present', async () => {
      mockFetch.mockResolvedValue(
        makeBrapiResponse([{ paymentDate: '2024-06-01', cashAmount: 0.5, type: 'Dividendo' }]),
      );

      const result = await getDividends('VALE3');

      expect(result[0].dataCom).toBeNull();
    });

    it('DB rows expose dataCom when populated', async () => {
      const dataCom = new Date('2025-06-02');
      const paymentDate = new Date('2025-08-20');
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([
        makeDbRow(paymentDate, 'Dividendo', 0.5, dataCom),
      ]);

      const result = await getDividends('PETR4');

      expect(result).toHaveLength(1);
      expect(result[0].dataCom?.getTime()).toBe(dataCom.getTime());
    });

    it('legacy DB rows (dataCom=null) keep DividendEntry.dataCom=null', async () => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([
        makeDbRow(new Date('2024-01-15'), 'Dividendo', 0.5),
      ]);

      const result = await getDividends('PETR4');

      expect(result[0].dataCom).toBeNull();
    });
  });

  // ── JCP IRRF (Bug #01, 2º passe) ──

  describe('JCP IRRF — valorUnitarioLiquido', () => {
    it('aplica 15% IRRF em entries JCP do DB', async () => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([
        makeDbRow(new Date('2024-04-15'), 'JCP', 1.0),
        makeDbRow(new Date('2024-05-15'), 'JUROS SOBRE CAPITAL PROPRIO', 2.0),
      ]);

      const result = await getDividends('ITUB4');

      expect(result).toHaveLength(2);
      // 1.0 bruto → 0.85 líquido
      expect(result[0].valorUnitario).toBe(1.0);
      expect(result[0].valorUnitarioLiquido).toBeCloseTo(0.85, 10);
      // 2.0 bruto → 1.70 líquido
      expect(result[1].valorUnitario).toBe(2.0);
      expect(result[1].valorUnitarioLiquido).toBeCloseTo(1.7, 10);
    });

    it('NÃO aplica IRRF em dividendos comuns (isentos)', async () => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([
        makeDbRow(new Date('2024-01-15'), 'Dividendo', 0.5),
        makeDbRow(new Date('2024-02-15'), 'Rendimento', 0.8),
      ]);

      const result = await getDividends('VALE3');

      expect(result[0].valorUnitarioLiquido).toBe(result[0].valorUnitario);
      expect(result[1].valorUnitarioLiquido).toBe(result[1].valorUnitario);
    });

    it('aplica IRRF também em entries vindas do BRAPI fallback', async () => {
      mockPrisma.assetDividendHistory.findMany.mockResolvedValue([]);
      mockPrisma.assetDividendHistory.upsert.mockResolvedValue({});
      mockFetch.mockResolvedValue(
        makeBrapiResponse([
          {
            paymentDate: '2024-06-10',
            label: 'JUROS SOBRE CAPITAL PRÓPRIO',
            value: 0.5,
            lastDatePrior: '2024-06-01',
          },
        ]),
      );

      const result = await getDividends('BBDC4');

      expect(result).toHaveLength(1);
      expect(result[0].valorUnitario).toBe(0.5);
      expect(result[0].valorUnitarioLiquido).toBeCloseTo(0.425, 10);
    });
  });
});

describe('isJcpType', () => {
  it('detecta as variações de label da BRAPI', () => {
    expect(isJcpType('JCP')).toBe(true);
    expect(isJcpType('JURO SOBRE CAPITAL')).toBe(true);
    expect(isJcpType('JUROS SOBRE CAPITAL PROPRIO')).toBe(true);
    expect(isJcpType('JUROS SOBRE CAPITAL PRÓPRIO')).toBe(true);
    expect(isJcpType('jcp')).toBe(true); // case-insensitive
    expect(isJcpType('JSCP')).toBe(true);
    expect(isJcpType('Juros S/ Capital')).toBe(true);
  });

  it('NÃO marca dividendos comuns como JCP', () => {
    expect(isJcpType('Dividendo')).toBe(false);
    expect(isJcpType('DIVIDEND')).toBe(false);
    expect(isJcpType('Rendimento')).toBe(false); // FII
    expect(isJcpType('Bonificação')).toBe(false);
    expect(isJcpType(null)).toBe(false);
    expect(isJcpType('')).toBe(false);
  });

  it('getJcpIrrfRate retorna 15% até 31/12/2025 (Lei 9.249/95)', () => {
    expect(getJcpIrrfRate(new Date('2024-04-15'))).toBe(0.15);
    expect(getJcpIrrfRate(new Date('2025-12-31T23:59:59Z'))).toBe(0.15);
  });

  it('getJcpIrrfRate retorna 17,5% a partir de 01/01/2026 (LC 224/2025)', () => {
    expect(getJcpIrrfRate(new Date('2026-01-01T00:00:00Z'))).toBe(0.175);
    expect(getJcpIrrfRate(new Date('2026-03-11'))).toBe(0.175);
  });
});

// Bug BBAS3 JCP 12/06/2025: BRAPI retorna 2 entries com mesma (date, tipo) e
// rates diferentes. Política decidida (Mai/2026): SOMAR.
describe('BRAPI dedup pré-upsert', () => {
  beforeEach(() => {
    mockPrisma.assetDividendHistory.findMany.mockResolvedValue([]);
    mockPrisma.assetDividendHistory.upsert.mockResolvedValue({});
  });

  it('soma rates de entries duplicadas com mesma (paymentDate, tipo)', async () => {
    mockFetch.mockResolvedValue(
      makeBrapiResponse([
        {
          paymentDate: '2025-06-12T03:00:00Z',
          lastDatePrior: '2025-06-02T03:00:00Z',
          label: 'JCP',
          rate: 0.09044687,
        },
        {
          paymentDate: '2025-06-12T03:00:00Z',
          lastDatePrior: '2025-06-02T03:00:00Z',
          label: 'JCP',
          rate: 0.3342584,
        },
      ]),
    );

    const result = await getDividends('BBAS3');

    expect(result).toHaveLength(1);
    expect(result[0].tipo).toBe('JCP');
    expect(result[0].valorUnitario).toBeCloseTo(0.42470527, 8);
    // Único upsert (não dois) — confirma que dedup aconteceu pré-DB.
    expect(mockPrisma.assetDividendHistory.upsert).toHaveBeenCalledTimes(1);
  });

  it('mantém entries com tipos diferentes separadas no mesmo dia', async () => {
    mockFetch.mockResolvedValue(
      makeBrapiResponse([
        { paymentDate: '2025-03-20', label: 'JCP', rate: 0.34 },
        { paymentDate: '2025-03-20', label: 'DIVIDENDO', rate: 0.14 },
        { paymentDate: '2025-03-20', label: 'RENDIMENTO', rate: 0.01 },
      ]),
    );

    const result = await getDividends('BBAS3');

    expect(result).toHaveLength(3);
    expect(mockPrisma.assetDividendHistory.upsert).toHaveBeenCalledTimes(3);
  });

  it('preserva primeira exDate não-nula em entries somadas', async () => {
    mockFetch.mockResolvedValue(
      makeBrapiResponse([
        { paymentDate: '2025-06-12', label: 'JCP', rate: 0.1, lastDatePrior: '2025-06-02' },
        { paymentDate: '2025-06-12', label: 'JCP', rate: 0.2 /* sem exDate */ },
      ]),
    );

    const result = await getDividends('BBAS3');

    expect(result).toHaveLength(1);
    expect(result[0].dataCom).toEqual(new Date('2025-06-02T00:00:00.000Z'));
  });
});

describe('ensureCorporateActionsSynced', () => {
  it('não busca na BRAPI quando o símbolo já tem dados (CA ou dividendos)', async () => {
    mockPrisma.assetCorporateAction.count.mockResolvedValue(2);
    mockPrisma.assetDividendHistory.count.mockResolvedValue(0);

    await ensureCorporateActionsSynced('MGLU3', 'stock');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('preenche gap de dividendos antigos no ADD (sem cron) quando histórico é raso', async () => {
    // já tem CA (catálogo) + dividendos recentes da BRAPI, mas o mais antigo é
    // recente (~6 meses) e não há nada source=YAHOO → deve buscar o Yahoo no ato.
    mockPrisma.assetCorporateAction.count.mockResolvedValue(1); // caCount
    mockPrisma.assetDividendHistory.count
      .mockResolvedValueOnce(12) // divCount (tem dados)
      .mockResolvedValueOnce(0); // yahooDivCount (nada do Yahoo ainda)
    mockPrisma.assetDividendHistory.findFirst.mockResolvedValue({
      date: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
    });
    mockPrisma.assetDividendHistory.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ chart: { result: [{}] } }),
    });

    await ensureCorporateActionsSynced('HFOF11', 'fii');

    // buscou o Yahoo (events=div) sem depender do cron
    expect(mockFetch).toHaveBeenCalled();
    expect(String(mockFetch.mock.calls[0][0])).toContain('events=div');
  });

  it('NÃO re-busca quando histórico já é profundo (gap improvável)', async () => {
    mockPrisma.assetCorporateAction.count.mockResolvedValue(1);
    mockPrisma.assetDividendHistory.count.mockResolvedValueOnce(40).mockResolvedValueOnce(0);
    // mais antigo há ~3 anos → sem gap → não busca
    mockPrisma.assetDividendHistory.findFirst.mockResolvedValue({
      date: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000),
    });

    await ensureCorporateActionsSynced('XPLG11', 'fii');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('busca na BRAPI quando nunca sincronizado e o tipo é de bolsa', async () => {
    mockPrisma.assetCorporateAction.count.mockResolvedValue(0);
    mockPrisma.assetDividendHistory.count.mockResolvedValue(0);
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([]);
    mockPrisma.assetDividendHistory.findMany.mockResolvedValue([]);
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ results: [{}] }) });

    await ensureCorporateActionsSynced('PETR4', 'stock');

    expect(mockFetch).toHaveBeenCalled();
  });

  it('não busca para tipos sem eventos corporativos (renda-fixa)', async () => {
    await ensureCorporateActionsSynced('LTN2029', 'tesouro-direto');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockPrisma.assetCorporateAction.count).not.toHaveBeenCalled();
  });

  it('não busca para símbolo vazio', async () => {
    await ensureCorporateActionsSynced('', 'stock');
    await ensureCorporateActionsSynced(null, 'stock');

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

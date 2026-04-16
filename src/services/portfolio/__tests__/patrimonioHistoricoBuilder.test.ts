import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockGetAssetHistory = vi.hoisted(() => vi.fn());

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetHistory: mockGetAssetHistory,
}));

/* ------------------------------------------------------------------ */
/* Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */

import {
  normalizeDateStart,
  buildDailyTimeline,
  getTransactionValue,
  buildDailyPriceMap,
  calculateFixedIncomeValue,
  calculateHistoricoTWR,
  filterInvestmentsExclReservas,
  buildPatrimonioCashFlowsByDayOnly,
  buildPatrimonioHistorico,
  type FixedIncomeAssetWithAsset,
  type PortfolioWithRelations,
  type StockTransactionWithRelations,
  type InvestmentCashflowItem,
} from '../patrimonioHistoricoBuilder';

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
});

/* ================================================================== */
/* normalizeDateStart                                                 */
/* ================================================================== */

describe('normalizeDateStart', () => {
  it('normaliza para meia-noite', () => {
    const date = new Date(2025, 5, 15, 14, 30, 45, 123);
    const result = normalizeDateStart(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('preserva ano, mes e dia', () => {
    const date = new Date(2025, 11, 31, 23, 59, 59);
    const result = normalizeDateStart(date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(11);
    expect(result.getDate()).toBe(31);
  });

  it('nao modifica a data original', () => {
    const date = new Date(2025, 0, 1, 12, 0, 0);
    const originalTime = date.getTime();
    normalizeDateStart(date);
    expect(date.getTime()).toBe(originalTime);
  });

  it('funciona com datas de borda (1 de janeiro)', () => {
    const date = new Date(2025, 0, 1, 0, 0, 0, 0);
    const result = normalizeDateStart(date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
    expect(result.getTime()).toBe(date.getTime());
  });
});

/* ================================================================== */
/* buildDailyTimeline                                                 */
/* ================================================================== */

describe('buildDailyTimeline', () => {
  it('retorna um unico dia quando start == end', () => {
    const d = new Date(2025, 0, 10);
    const timeline = buildDailyTimeline(d, d);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toBe(normalizeDateStart(d).getTime());
  });

  it('retorna dias consecutivos para intervalo multi-dia (sem fins de semana)', () => {
    // Jan 1 (Wed) through Jan 5 (Sun) 2025 → Wed, Thu, Fri = 3 weekdays
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 0, 5);
    const timeline = buildDailyTimeline(start, end);
    expect(timeline).toHaveLength(3);
    expect(timeline[1] - timeline[0]).toBe(DAY_MS);
  });

  it('retorna array vazio quando start > end', () => {
    const start = new Date(2025, 0, 10);
    const end = new Date(2025, 0, 5);
    const timeline = buildDailyTimeline(start, end);
    expect(timeline).toHaveLength(0);
  });

  it('normaliza horas no start e end', () => {
    const start = new Date(2025, 0, 1, 15, 30);
    const end = new Date(2025, 0, 3, 8, 0);
    const timeline = buildDailyTimeline(start, end);
    expect(timeline).toHaveLength(3);
    // All should be at midnight
    timeline.forEach((t) => {
      const d = new Date(t);
      expect(d.getHours()).toBe(0);
    });
  });

  it('funciona com intervalo de 30 dias (exclui fins de semana)', () => {
    // Jan 2025 has 23 weekdays (31 days - 4 Sat - 4 Sun)
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 0, 31);
    const timeline = buildDailyTimeline(start, end);
    expect(timeline).toHaveLength(23);
    // Verify no weekends
    timeline.forEach((t) => {
      const d = new Date(t);
      expect(d.getDay()).not.toBe(0); // not Sunday
      expect(d.getDay()).not.toBe(6); // not Saturday
    });
  });
});

/* ================================================================== */
/* getTransactionValue                                                */
/* ================================================================== */

describe('getTransactionValue', () => {
  it('usa total quando positivo e finito', () => {
    expect(getTransactionValue({ total: 500, quantity: 10, price: 25 })).toBe(500);
  });

  it('usa qty*price como fallback quando total <= 0', () => {
    expect(getTransactionValue({ total: 0, quantity: 10, price: 25 })).toBe(250);
  });

  it('usa qty*price quando total eh negativo', () => {
    expect(getTransactionValue({ total: -100, quantity: 5, price: 20 })).toBe(100);
  });

  it('retorna 0 quando total e fallback nao sao finitos', () => {
    expect(getTransactionValue({ total: NaN, quantity: NaN, price: NaN })).toBe(0);
  });

  it('retorna 0 quando total=0 e qty=0', () => {
    expect(getTransactionValue({ total: 0, quantity: 0, price: 100 })).toBe(0);
  });
});

/* ================================================================== */
/* buildDailyPriceMap                                                 */
/* ================================================================== */

describe('buildDailyPriceMap', () => {
  const mkTimeline = (start: Date, days: number) => {
    const s = normalizeDateStart(start).getTime();
    return Array.from({ length: days }, (_, i) => s + i * DAY_MS);
  };

  it('retorna mapa vazio para historico vazio sem initialPrice', () => {
    const timeline = mkTimeline(new Date(2025, 0, 1), 3);
    const map = buildDailyPriceMap([], timeline);
    expect(map.size).toBe(0);
  });

  it('preenche todos os dias com initialPrice quando historico vazio', () => {
    const timeline = mkTimeline(new Date(2025, 0, 1), 3);
    const map = buildDailyPriceMap([], timeline, 50);
    expect(map.size).toBe(3);
    timeline.forEach((d) => expect(map.get(d)).toBe(50));
  });

  it('preenche lacunas com ultimo preco conhecido (gap-fill)', () => {
    const timeline = mkTimeline(new Date(2025, 0, 1), 5);
    const history = [
      { date: timeline[0], value: 100 },
      { date: timeline[3], value: 200 },
    ];
    const map = buildDailyPriceMap(history, timeline);
    expect(map.get(timeline[0])).toBe(100);
    expect(map.get(timeline[1])).toBe(100); // gap-filled
    expect(map.get(timeline[2])).toBe(100); // gap-filled
    expect(map.get(timeline[3])).toBe(200);
    expect(map.get(timeline[4])).toBe(200); // gap-filled
  });

  it('ignora valores nao-finitos e <= 0 no historico', () => {
    const timeline = mkTimeline(new Date(2025, 0, 1), 3);
    const history = [
      { date: timeline[0], value: NaN },
      { date: timeline[1], value: -5 },
      { date: timeline[2], value: 0 },
    ];
    const map = buildDailyPriceMap(history, timeline);
    expect(map.size).toBe(0);
  });

  it('ordena historico fora de ordem antes de processar', () => {
    const timeline = mkTimeline(new Date(2025, 0, 1), 3);
    const history = [
      { date: timeline[2], value: 300 },
      { date: timeline[0], value: 100 },
    ];
    const map = buildDailyPriceMap(history, timeline);
    expect(map.get(timeline[0])).toBe(100);
    expect(map.get(timeline[1])).toBe(100);
    expect(map.get(timeline[2])).toBe(300);
  });

  it('initialPrice negativo eh ignorado', () => {
    const timeline = mkTimeline(new Date(2025, 0, 1), 2);
    const map = buildDailyPriceMap([], timeline, -10);
    expect(map.size).toBe(0);
  });

  it('initialPrice=0 eh ignorado', () => {
    const timeline = mkTimeline(new Date(2025, 0, 1), 2);
    const map = buildDailyPriceMap([], timeline, 0);
    expect(map.size).toBe(0);
  });

  it('historico com unico ponto preenche todos os dias seguintes', () => {
    const timeline = mkTimeline(new Date(2025, 0, 1), 4);
    const history = [{ date: timeline[1], value: 75 }];
    const map = buildDailyPriceMap(history, timeline);
    expect(map.has(timeline[0])).toBe(false);
    expect(map.get(timeline[1])).toBe(75);
    expect(map.get(timeline[2])).toBe(75);
    expect(map.get(timeline[3])).toBe(75);
  });
});

/* ================================================================== */
/* calculateFixedIncomeValue                                          */
/* ================================================================== */

describe('calculateFixedIncomeValue', () => {
  const mkFixedIncome = (
    overrides: Partial<FixedIncomeAssetWithAsset> = {},
  ): FixedIncomeAssetWithAsset => ({
    id: 'fi-1',
    userId: 'user-1',
    assetId: 'asset-1',
    type: 'CDB',
    description: 'CDB Test',
    startDate: new Date(2025, 0, 1),
    maturityDate: new Date(2026, 0, 1),
    investedAmount: 10000,
    annualRate: 10,
    indexer: null,
    indexerPercent: null,
    liquidityType: null,
    taxExempt: false,
    asset: { symbol: 'CDB-1', name: 'CDB Test' },
    ...overrides,
  });

  it('calcula juros compostos ao longo de dias', () => {
    const fi = mkFixedIncome();
    const ref = new Date(2025, 6, 1); // ~181 days after start
    const result = calculateFixedIncomeValue(fi, ref);
    // 10000 * (1.10)^(181/365) ~ 10480
    expect(result).toBeGreaterThan(10000);
    expect(result).toBeLessThan(11000);
  });

  it('retorna investedAmount quando taxa eh 0', () => {
    const fi = mkFixedIncome({ annualRate: 0 });
    const ref = new Date(2025, 6, 1);
    const result = calculateFixedIncomeValue(fi, ref);
    expect(result).toBe(10000);
  });

  it('limita valor pela maturityDate', () => {
    const fi = mkFixedIncome({ maturityDate: new Date(2025, 5, 1) });
    const refBeforeMaturity = new Date(2025, 3, 1);
    const refAfterMaturity = new Date(2025, 11, 1);
    const valBefore = calculateFixedIncomeValue(fi, refBeforeMaturity);
    const valAfter = calculateFixedIncomeValue(fi, refAfterMaturity);
    // Depois do vencimento, usa maturityDate como endDate, entao mesmo resultado
    expect(valAfter).toBe(calculateFixedIncomeValue(fi, new Date(2025, 5, 1)));
    expect(valBefore).toBeLessThan(valAfter);
  });

  it('retorna investedAmount quando referenceDate <= startDate', () => {
    const fi = mkFixedIncome({ startDate: new Date(2025, 6, 1) });
    const ref = new Date(2025, 0, 1);
    expect(calculateFixedIncomeValue(fi, ref)).toBe(10000);
  });

  it('retorna investedAmount quando referenceDate == startDate', () => {
    const fi = mkFixedIncome();
    expect(calculateFixedIncomeValue(fi, new Date(2025, 0, 1))).toBe(10000);
  });

  it('arredonda para 2 casas decimais', () => {
    const fi = mkFixedIncome({ annualRate: 13.5, investedAmount: 12345.67 });
    const ref = new Date(2025, 3, 15);
    const result = calculateFixedIncomeValue(fi, ref);
    const decimals = result.toString().split('.')[1];
    expect(!decimals || decimals.length <= 2).toBe(true);
  });
});

/* ================================================================== */
/* calculateHistoricoTWR                                              */
/* ================================================================== */

describe('calculateHistoricoTWR', () => {
  it('retorna array vazio para serie vazia', () => {
    expect(calculateHistoricoTWR([], new Map())).toEqual([]);
  });

  it('primeiro elemento sempre tem value=0', () => {
    const series = [{ data: 1, saldoBruto: 1000 }];
    const result = calculateHistoricoTWR(series, new Map());
    expect(result).toEqual([{ data: 1, value: 0 }]);
  });

  it('calcula retorno diario simples (sem fluxo de caixa)', () => {
    const series = [
      { data: 1, saldoBruto: 1000 },
      { data: 2, saldoBruto: 1050 }, // +5%
    ];
    const result = calculateHistoricoTWR(series, new Map());
    expect(result[1].value).toBeCloseTo(5.0, 1); // 5%
  });

  it('desconta fluxo de caixa no calculo do retorno', () => {
    const day1 = normalizeDateStart(new Date(2025, 0, 1)).getTime();
    const day2 = normalizeDateStart(new Date(2025, 0, 2)).getTime();
    const series = [
      { data: day1, saldoBruto: 1000 },
      { data: day2, saldoBruto: 1600 }, // +600, mas 500 eh aporte
    ];
    const cashFlows = new Map([[day2, 500]]);
    const result = calculateHistoricoTWR(series, cashFlows);
    // retorno = (1600 - 1000 - 500) / 1000 = 0.1 = 10%
    expect(result[1].value).toBeCloseTo(10.0, 1);
  });

  it('clampa retornos extremos (>50% ou <-50%) para 0', () => {
    const series = [
      { data: 1, saldoBruto: 100 },
      { data: 2, saldoBruto: 200 }, // +100% -> clamped
    ];
    const result = calculateHistoricoTWR(series, new Map());
    // 100% exceeds 50% threshold, so retornoDia = 0
    expect(result[1].value).toBe(0);
  });

  it('acumula retornos multiplicativamente', () => {
    const series = [
      { data: 1, saldoBruto: 1000 },
      { data: 2, saldoBruto: 1050 }, // +5%
      { data: 3, saldoBruto: 1102.5 }, // +5% of 1050
    ];
    const result = calculateHistoricoTWR(series, new Map());
    // cumulative = 1.05 * 1.05 = 1.1025 -> 10.25%
    expect(result[2].value).toBeCloseTo(10.25, 1);
  });

  it('retorna 0 para valorInicial=0 com fluxo positivo', () => {
    const series = [
      { data: 1, saldoBruto: 0 },
      { data: 2, saldoBruto: 500 },
    ];
    const cashFlows = new Map([[2, 500]]);
    const result = calculateHistoricoTWR(series, cashFlows);
    expect(result[1].value).toBe(0);
  });
});

/* ================================================================== */
/* filterInvestmentsExclReservas                                      */
/* ================================================================== */

describe('filterInvestmentsExclReservas', () => {
  it('filtra itens com "reserva emergencia"', () => {
    const items = [{ name: 'Reserva de Emergencia' }, { name: 'CDB Banco X' }];
    const result = filterInvestmentsExclReservas(items);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('CDB Banco X');
  });

  it('filtra itens com "reserva oportunidade"', () => {
    const items = [{ name: 'Reserva de Oportunidade' }, { name: 'Tesouro Selic' }];
    const result = filterInvestmentsExclReservas(items);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Tesouro Selic');
  });

  it('mantem itens com name=null', () => {
    const items = [{ name: null }, { name: 'Acao XYZ' }];
    const result = filterInvestmentsExclReservas(items);
    expect(result).toHaveLength(2);
  });

  it('filtra itens com "emergencia" sozinho (com acento)', () => {
    const items = [{ name: 'Emerg\u00eancia' }, { name: 'LCI' }];
    const result = filterInvestmentsExclReservas(items);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('LCI');
  });
});

/* ================================================================== */
/* buildPatrimonioCashFlowsByDayOnly                                  */
/* ================================================================== */

describe('buildPatrimonioCashFlowsByDayOnly', () => {
  it('retorna mapa com entradas para cada dia da timeline', () => {
    const day1 = normalizeDateStart(new Date(2025, 0, 1)).getTime();
    const day2 = normalizeDateStart(new Date(2025, 0, 2)).getTime();
    const timeline = [day1, day2];

    const tx = {
      id: 'tx-1',
      date: new Date(2025, 0, 1),
      type: 'compra',
      quantity: 10,
      price: 50,
      total: 500,
      stock: { ticker: 'PETR4' },
      asset: null,
    } as unknown as StockTransactionWithRelations;

    const result = buildPatrimonioCashFlowsByDayOnly([], [], [tx], [], timeline);
    expect(result.size).toBe(2);
    // compra: cashDelta = -500; cashFlow = -(-500) = 500
    expect(result.get(day1)).toBe(500);
    expect(result.get(day2)).toBe(0);
  });

  it('retorna mapa zerado para inputs vazios', () => {
    const day1 = normalizeDateStart(new Date(2025, 0, 1)).getTime();
    const timeline = [day1];
    const result = buildPatrimonioCashFlowsByDayOnly([], [], [], [], timeline);
    expect(result.size).toBe(1);
    expect(result.get(day1)).toBe(0);
  });
});

/* ================================================================== */
/* buildPatrimonioHistorico (async, com mocks)                        */
/* ================================================================== */

describe('buildPatrimonioHistorico', () => {
  beforeEach(() => {
    mockGetAssetHistory.mockResolvedValue([]);
  });

  const emptyParams = {
    portfolio: [] as PortfolioWithRelations[],
    fixedIncomeAssets: [] as FixedIncomeAssetWithAsset[],
    stockTransactions: [] as StockTransactionWithRelations[],
    investmentsExclReservas: [] as InvestmentCashflowItem[],
    saldoBrutoAtual: 0,
    valorAplicadoAtual: 0,
    patchLastDayWithLiveTotals: false,
  };

  it('retorna resultado vazio quando nao ha dados', async () => {
    const result = await buildPatrimonioHistorico(emptyParams);
    expect(result.historicoPatrimonio).toEqual([]);
    expect(result.historicoTWR).toEqual([]);
    expect(result.historicoTWRPeriodo).toEqual([]);
    expect(result.cashFlowsByDay.size).toBe(0);
  });

  it('constroi timeline a partir da transacao mais antiga', async () => {
    const txDate = new Date(2025, 0, 15);
    const _hoje = normalizeDateStart(new Date());

    const tx = {
      id: 'tx-1',
      date: txDate,
      type: 'compra',
      quantity: 10,
      price: 100,
      total: 1000,
      stock: { ticker: 'PETR4', companyName: 'Petrobras' },
      asset: null,
      stockId: 'stock-1',
      assetId: null,
      userId: 'user-1',
      portfolioId: 'port-1',
    } as unknown as StockTransactionWithRelations;

    const result = await buildPatrimonioHistorico({
      ...emptyParams,
      stockTransactions: [tx],
      saldoBrutoAtual: 1200,
      valorAplicadoAtual: 1000,
      patchLastDayWithLiveTotals: true,
      timelineEndDate: new Date(2025, 0, 17),
    });

    expect(result.historicoPatrimonio.length).toBeGreaterThanOrEqual(3);
    // First day should be on or after tx date
    const firstDay = new Date(result.historicoPatrimonio[0].data);
    expect(firstDay.getDate()).toBe(15);
    expect(firstDay.getMonth()).toBe(0);
  });

  it('aplica maxHistoricoMonths para limitar inicio da timeline', async () => {
    const txDate = new Date(2020, 0, 1); // 5+ years ago
    const endDate = new Date(2025, 0, 31);

    const tx = {
      id: 'tx-1',
      date: txDate,
      type: 'compra',
      quantity: 5,
      price: 50,
      total: 250,
      stock: { ticker: 'VALE3', companyName: 'Vale' },
      asset: null,
      stockId: 'stock-2',
      assetId: null,
      userId: 'user-1',
      portfolioId: 'port-1',
    } as unknown as StockTransactionWithRelations;

    const result = await buildPatrimonioHistorico({
      ...emptyParams,
      stockTransactions: [tx],
      saldoBrutoAtual: 500,
      valorAplicadoAtual: 250,
      patchLastDayWithLiveTotals: false,
      maxHistoricoMonths: 3,
      timelineEndDate: endDate,
    });

    // With maxHistoricoMonths=3 and endDate=Jan 2025, start should be ~Oct 2024
    const firstDay = new Date(result.historicoPatrimonio[0].data);
    expect(firstDay.getFullYear()).toBeGreaterThanOrEqual(2024);
    expect(firstDay.getMonth()).toBeGreaterThanOrEqual(9); // October or later
  });

  it('patchLastDayWithLiveTotals atualiza ultimo ponto', async () => {
    const endDate = new Date(2025, 0, 3);

    const tx = {
      id: 'tx-1',
      date: new Date(2025, 0, 1),
      type: 'compra',
      quantity: 10,
      price: 100,
      total: 1000,
      stock: { ticker: 'ITUB4', companyName: 'Itau' },
      asset: null,
      stockId: 'stock-3',
      assetId: null,
      userId: 'user-1',
      portfolioId: 'port-1',
    } as unknown as StockTransactionWithRelations;

    const result = await buildPatrimonioHistorico({
      ...emptyParams,
      stockTransactions: [tx],
      saldoBrutoAtual: 5000,
      valorAplicadoAtual: 3000,
      patchLastDayWithLiveTotals: true,
      timelineEndDate: endDate,
    });

    const lastEntry = result.historicoPatrimonio[result.historicoPatrimonio.length - 1];
    expect(lastEntry.saldoBruto).toBe(5000);
    expect(lastEntry.valorAplicado).toBe(3000);
  });

  it('inclui renda fixa no calculo de precos', async () => {
    const endDate = new Date(2025, 6, 1);

    const fi: FixedIncomeAssetWithAsset = {
      id: 'fi-1',
      userId: 'user-1',
      assetId: 'asset-fi-1',
      type: 'CDB',
      description: 'CDB',
      startDate: new Date(2025, 0, 1),
      maturityDate: new Date(2026, 0, 1),
      investedAmount: 10000,
      annualRate: 10,
      indexer: null,
      indexerPercent: null,
      liquidityType: null,
      taxExempt: false,
      asset: { symbol: 'CDB-TEST', name: 'CDB Test' },
    };

    const portfolioItem = {
      id: 'port-fi-1',
      userId: 'user-1',
      stockId: null,
      assetId: 'asset-fi-1',
      quantity: 1,
      avgPrice: 10000,
      totalInvested: 10000,
      lastUpdate: new Date(2025, 0, 1),
      stock: null,
      asset: { symbol: 'CDB-TEST', name: 'CDB Test', type: 'personalizado' },
    } as unknown as PortfolioWithRelations;

    const result = await buildPatrimonioHistorico({
      ...emptyParams,
      portfolio: [portfolioItem],
      fixedIncomeAssets: [fi],
      saldoBrutoAtual: 10500,
      valorAplicadoAtual: 10000,
      patchLastDayWithLiveTotals: false,
      timelineEndDate: endDate,
    });

    expect(result.historicoPatrimonio.length).toBeGreaterThan(0);
    // Should not have called getAssetHistory for manual/fixed-income assets
    // (CDB-TEST is mapped as manual due to fixedIncome match)
    expect(mockGetAssetHistory).not.toHaveBeenCalled();
  });
});

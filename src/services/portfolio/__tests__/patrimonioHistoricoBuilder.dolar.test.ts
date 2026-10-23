/**
 * Carteira EUA em US$ (out/2026) no histórico: valor do dia de posição em US$ =
 * q × preço US$(d) × câmbio(d); fluxo de transação em US$ = total × câmbio da tx + fees.
 * Sem chave: decide só pela unidade gravada (posicaoEmDolar / unidadeDaTransacao).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAssetHistory = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  assetCorporateAction: { findMany: vi.fn() },
  assetPriceHistory: { findFirst: vi.fn(), findMany: vi.fn() },
}));
const mockResolveProventoEvents = vi.hoisted(() => vi.fn());

vi.mock('@/services/pricing/assetPriceService', () => ({ getAssetHistory: mockGetAssetHistory }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/market/marketIndicatorService', () => ({ getIndicator: vi.fn() }));
vi.mock('@/services/portfolio/resolveProventos', () => ({
  resolveProventoEvents: mockResolveProventoEvents,
}));

import {
  buildPatrimonioCashFlowsByDayOnly,
  buildPatrimonioHistorico,
  valorTransacaoEmReais,
  type BuildPatrimonioHistoricoParams,
  type PortfolioWithRelations,
  type StockTransactionWithRelations,
} from '../patrimonioHistoricoBuilder';
import { loadProventosByDay } from '../proventosByDay';
import { montarSerieCambio } from '@/services/market/cambioUsdBrl';

const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

// Ter 03/03/2026 → Sex 06/03/2026 (dias úteis, sem feriado B3).
const D1 = '2026-03-03';
const D2 = '2026-03-04';
const D3 = '2026-03-05';
const FIM = new Date(dia('2026-03-06'));

const REIT = { symbol: 'O-1', name: 'Realty Income', type: 'reit', currency: 'USD' };
const STOCK_USD = { symbol: 'AAPL-1', name: 'Apple', type: 'stock', currency: 'USD' };
const PETR4 = { symbol: 'PETR4', name: 'Petrobras', type: 'stock', currency: 'BRL' };

// Série USD-BRL: 5,2 em D1 e 5,5 a partir de D2 (repetida para frente).
const serie = montarSerieCambio([
  { date: new Date(dia(D1)), price: 5.2 },
  { date: new Date(dia(D2)), price: 5.5 },
]);

const tx = (overrides: Record<string, unknown>): StockTransactionWithRelations =>
  ({
    id: 'tx',
    date: new Date(dia(D1)),
    type: 'compra',
    quantity: 10,
    price: 100,
    total: 1000,
    fees: 0,
    notes: null,
    asset: REIT,
    assetId: 'a1',
    userId: 'u1',
    ...overrides,
  }) as unknown as StockTransactionWithRelations;

const base: BuildPatrimonioHistoricoParams = {
  portfolio: [],
  fixedIncomeAssets: [],
  stockTransactions: [],
  investmentsExclReservas: [],
  saldoBrutoAtual: 0,
  valorAplicadoAtual: 0,
  patchLastDayWithLiveTotals: false,
  maxHistoricoMonths: null,
  timelineEndDate: FIM,
};

const pontoEm = (
  r: { historicoPatrimonio: Array<{ data: number; saldoBruto: number; valorAplicado: number }> },
  iso: string,
) => r.historicoPatrimonio.find((p) => p.data === dia(iso))!;
const twrEm = (serieTwr: Array<{ data: number; value: number }>, iso: string) =>
  serieTwr.find((p) => p.data === dia(iso))!.value;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAssetHistory.mockResolvedValue([]);
  mockPrisma.assetCorporateAction.findMany.mockResolvedValue([]);
  mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);
  mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
});

describe('valorTransacaoEmReais', () => {
  it('US$: total × câmbio da tx + fees em R$', () => {
    const t = tx({ fees: 10, notes: JSON.stringify({ cotacaoMoeda: 5.2 }) });
    expect(valorTransacaoEmReais(t, null)).toBeCloseTo(1000 * 5.2 + 10, 6);
  });

  it('US$ sem cotação gravada: câmbio da série na data', () => {
    const t = tx({ date: new Date(dia(D3)) });
    expect(valorTransacaoEmReais(t, serie)).toBeCloseTo(5500, 6);
  });

  it('US$ sem câmbio nenhum = null (nunca soma US$ como R$)', () => {
    expect(valorTransacaoEmReais(tx({}), null)).toBeNull();
  });

  it('PETR4 (BRL) com marcador USD nas notes NÃO converte', () => {
    const t = tx({
      asset: PETR4,
      notes: JSON.stringify({ operation: { unidade: 'USD', cotacaoMoeda: 5 } }),
    });
    expect(valorTransacaoEmReais(t, serie)).toBe(1000);
  });
});

describe('buildPatrimonioHistorico — ativo em dólar', () => {
  it('REIT comprado a fx 5,2: valor do dia da compra = fluxo (TWR 0) e sobe com o câmbio', async () => {
    const r = await buildPatrimonioHistorico({
      ...base,
      stockTransactions: [tx({ notes: JSON.stringify({ cotacaoMoeda: 5.2 }) })],
      serieCambio: serie,
    });

    // Dia da compra: 10 × US$ 100 × 5,2 = R$ 5.200 = fluxo.
    expect(pontoEm(r, D1).saldoBruto).toBeCloseTo(5200, 2);
    expect(pontoEm(r, D1).valorAplicado).toBeCloseTo(5200, 2);
    expect(r.cashFlowsByDay.get(dia(D1))).toBeCloseTo(5200, 2);
    expect(twrEm(r.historicoTWR, D1)).toBe(0);

    // Preço US$ plano; o câmbio vai a 5,5 → R$ 5.500 (+5,77%). Aplicado fica no custo.
    expect(pontoEm(r, D2).saldoBruto).toBeCloseTo(5500, 2);
    expect(pontoEm(r, D2).valorAplicado).toBeCloseTo(5200, 2);
    expect(twrEm(r.historicoTWR, D2)).toBeCloseTo((5500 / 5200 - 1) * 100, 1);
  });

  it('compra no meio da série com cotação ≠ série: o dia usa o câmbio da tx (retorno 0)', async () => {
    // PETR4 R$ 1.000 desde D1 (preço plano) + REIT em D2 a 5,3 (série diz 5,5).
    const r = await buildPatrimonioHistorico({
      ...base,
      stockTransactions: [
        tx({ id: 'br', asset: PETR4, assetId: 'a-br' }),
        tx({
          id: 'us',
          date: new Date(dia(D2)),
          notes: JSON.stringify({ operation: { unidade: 'USD', cotacaoMoeda: 5.3 } }),
        }),
      ],
      serieCambio: serie,
    });

    expect(pontoEm(r, D2).saldoBruto).toBeCloseTo(1000 + 5300, 2);
    expect(r.cashFlowsByDay.get(dia(D2))).toBeCloseTo(5300, 2);
    expect(twrEm(r.historicoTWR, D2)).toBe(twrEm(r.historicoTWR, D1));
    // Dia seguinte: o REIT passa ao câmbio da série (5,5).
    expect(pontoEm(r, D3).saldoBruto).toBeCloseTo(1000 + 5500, 2);
  });

  it('stock com moedaRegistro USD e marcador USD converte pela unidade', async () => {
    const portfolio = [
      {
        id: 'p1',
        assetId: 'a1',
        quantity: 10,
        avgPrice: 100,
        totalInvested: 1000,
        totalInvestedBrl: 5200,
        moedaRegistro: 'USD',
        lastUpdate: new Date(dia(D1)),
        asset: STOCK_USD,
      },
    ] as unknown as PortfolioWithRelations[];
    const r = await buildPatrimonioHistorico({
      ...base,
      portfolio,
      stockTransactions: [
        tx({
          asset: STOCK_USD,
          fees: 4,
          notes: JSON.stringify({ operation: { moeda: 'USD', unidade: 'USD', cotacaoMoeda: 5.2 } }),
        }),
      ],
      serieCambio: serie,
    });
    expect(r.cashFlowsByDay.get(dia(D1))).toBeCloseTo(5204, 2);
    expect(pontoEm(r, D1).saldoBruto).toBeCloseTo(5200, 2);
    expect(pontoEm(r, D3).saldoBruto).toBeCloseTo(5500, 2);
  });

  it('stock legado em R$ (currency USD, sem marcador, moedaRegistro null): série idêntica à de hoje', async () => {
    const portfolioDe = (asset: object) =>
      [
        {
          id: 'p1',
          assetId: 'a1',
          quantity: 10,
          avgPrice: 520,
          totalInvested: 5200,
          totalInvestedBrl: null,
          moedaRegistro: null,
          lastUpdate: new Date(dia(D1)),
          asset,
        },
      ] as unknown as PortfolioWithRelations[];
    const legadoTx = { price: 520, total: 5200, notes: JSON.stringify({ cotacaoMoeda: 5.2 }) };

    const legado = await buildPatrimonioHistorico({
      ...base,
      portfolio: portfolioDe(STOCK_USD),
      stockTransactions: [tx({ ...legadoTx, asset: STOCK_USD })],
    });
    // Referência: o mesmo dado como ação em R$ (nunca passa pelos ramos novos).
    const comoBrl = await buildPatrimonioHistorico({
      ...base,
      portfolio: portfolioDe(PETR4),
      stockTransactions: [tx({ ...legadoTx, asset: PETR4 })],
    });

    expect(legado.historicoPatrimonio).toEqual(comoBrl.historicoPatrimonio);
    expect(legado.historicoTWR).toEqual(comoBrl.historicoTWR);
    expect([...legado.cashFlowsByDay]).toEqual([...comoBrl.cashFlowsByDay]);
    expect(pontoEm(legado, D3).saldoBruto).toBeCloseTo(5200, 2);
    // Nada em US$: nenhuma consulta de câmbio.
    expect(mockPrisma.assetPriceHistory.findMany).not.toHaveBeenCalled();
  });

  it('sem câmbio (série vazia, sem cotação gravada): REIT fica fora da soma', async () => {
    const r = await buildPatrimonioHistorico({
      ...base,
      stockTransactions: [tx({})],
      serieCambio: null,
    });
    // Nunca R$ 1.000 (US$ lido como R$): o item some do valor e do fluxo.
    expect(r.historicoPatrimonio.every((p) => p.saldoBruto === 0)).toBe(true);
    expect(r.historicoPatrimonio.every((p) => p.valorAplicado === 0)).toBe(true);
    expect(r.cashFlowsByDay.get(dia(D1))).toBe(0);
  });

  it('sem serieCambio no parâmetro: carrega a série USD-BRL do banco uma vez', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
      { date: new Date(dia(D1)), price: 5.2 },
      { date: new Date(dia(D2)), price: 5.5 },
    ]);
    const r = await buildPatrimonioHistorico({ ...base, stockTransactions: [tx({})] });

    expect(mockPrisma.assetPriceHistory.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.assetPriceHistory.findMany.mock.calls[0][0].where.symbol).toBe('USD-BRL');
    expect(pontoEm(r, D1).saldoBruto).toBeCloseTo(5200, 2);
    expect(pontoEm(r, D3).saldoBruto).toBeCloseTo(5500, 2);
  });
});

describe('buildPatrimonioCashFlowsByDayOnly — ativo em dólar', () => {
  const timeline = [dia(D1), dia(D2), dia(D3)];

  it('fluxo em US$ convertido pela cotação da tx; venda sem cotação pela série', () => {
    const fluxos = buildPatrimonioCashFlowsByDayOnly(
      [],
      [],
      [
        tx({ fees: 2, notes: JSON.stringify({ cotacaoMoeda: 5.2 }) }),
        tx({ id: 'v', type: 'venda', quantity: 5, total: 500, date: new Date(dia(D3)) }),
      ],
      [],
      timeline,
      serie,
    );
    expect(fluxos.get(dia(D1))).toBeCloseTo(5202, 2);
    expect(fluxos.get(dia(D3))).toBeCloseTo(-2750, 2);
  });

  it('PETR4 segue como hoje (total cru)', () => {
    const fluxos = buildPatrimonioCashFlowsByDayOnly(
      [],
      [],
      [tx({ asset: PETR4 })],
      [],
      timeline,
      serie,
    );
    expect(fluxos.get(dia(D1))).toBe(1000);
  });
});

describe('proventos de REIT no histórico', () => {
  it('convertidos uma vez só, pela taxa da data de pagamento', async () => {
    mockResolveProventoEvents.mockResolvedValue({
      events: [
        // REIT: US$ 10 com data-com em D2 e pagamento em D3 (taxa 5,5).
        {
          symbol: 'O-1',
          paymentDay: dia(D3),
          exDay: dia(D2),
          bookingDay: dia(D2),
          tipo: 'Dividendo',
          moeda: 'USD',
          net: 10,
          gross: 10,
        },
        // Ação BR: R$ 7 — nunca convertida.
        {
          symbol: 'PETR4',
          paymentDay: dia(D3),
          exDay: dia(D2),
          bookingDay: dia(D2),
          tipo: 'Dividendo',
          moeda: 'BRL',
          net: 7,
          gross: 7,
        },
      ],
      total: 17,
    });
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
      { date: new Date(dia(D1)), price: 5.2 },
      { date: new Date(dia(D2)), price: 5.5 },
    ]);

    const { proventosByDay, total, semCambio } = await loadProventosByDay('u1');
    expect(proventosByDay.get(dia(D2))).toBeCloseTo(10 * 5.5 + 7, 6);
    expect(total).toBeCloseTo(62, 6);
    expect(semCambio).toBe(0);

    // O builder usa o map em R$ como está (não converte de novo).
    const r = await buildPatrimonioHistorico({
      ...base,
      stockTransactions: [tx({ notes: JSON.stringify({ cotacaoMoeda: 5.2 }) })],
      serieCambio: serie,
      proventosByDay,
    });
    expect(r.proventosAcumuladosByDay.get(dia(D3))).toBeCloseTo(62, 2);
    // TWR do D2: câmbio 5,2 → 5,5 sobre R$ 5.200 + renda R$ 62.
    expect(twrEm(r.historicoTWR, D2)).toBeCloseTo(((5500 + 62) / 5200 - 1) * 100, 1);
  });

  it('provento em US$ sem câmbio fica fora do map e do total', async () => {
    mockResolveProventoEvents.mockResolvedValue({
      events: [
        {
          symbol: 'O-1',
          paymentDay: dia(D3),
          exDay: dia(D2),
          bookingDay: dia(D2),
          tipo: 'Dividendo',
          moeda: 'USD',
          net: 10,
          gross: 10,
        },
      ],
      total: 10,
    });
    const { proventosByDay, total, semCambio } = await loadProventosByDay('u1');
    expect(proventosByDay.size).toBe(0);
    expect(total).toBe(0);
    expect(semCambio).toBe(1);
  });

  it('só proventos BR: nenhuma consulta de câmbio e valores intactos', async () => {
    mockResolveProventoEvents.mockResolvedValue({
      events: [
        {
          symbol: 'PETR4',
          paymentDay: dia(D3),
          exDay: dia(D2),
          bookingDay: dia(D2),
          tipo: 'JCP',
          moeda: 'BRL',
          net: 8.5,
          gross: 10,
        },
      ],
      total: 8.5,
    });
    const { proventosByDay, total } = await loadProventosByDay('u1');
    expect(proventosByDay.get(dia(D2))).toBe(10);
    expect(total).toBe(10);
    expect(mockPrisma.assetPriceHistory.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.assetPriceHistory.findFirst).not.toHaveBeenCalled();
  });
});

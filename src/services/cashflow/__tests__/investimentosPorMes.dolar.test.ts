/**
 * Carteira EUA em US$ (out/2026): `totalBRLTransacao` decide pela unidade gravada da
 * transação — US$ = total × câmbio da tx + fees (R$); R$ = total + fees, como sempre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
  assetPriceHistory: { findFirst: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/market/marketIndicatorService', () => ({ getIndicator: vi.fn() }));

import {
  carregarCambioDasTransacoes,
  computeInvestimentosPorMes,
  totalBRLTransacao,
} from '../investimentosPorMes';
import { montarSerieCambio } from '@/services/market/cambioUsdBrl';

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

const STOCK_USD = { type: 'stock', currency: 'USD', symbol: 'AAPL-1' };
const REIT = { type: 'reit', currency: 'USD', symbol: 'O-1' };
const PETR4 = { type: 'stock', currency: 'BRL', symbol: 'PETR4' };
const marcadorUsd = (cotacaoMoeda: number | null) =>
  JSON.stringify({ operation: { moeda: 'USD', unidade: 'USD', cotacaoMoeda } });

const serie = montarSerieCambio([
  { date: d('2026-03-02'), price: 5.2 },
  { date: d('2026-03-10'), price: 5.5 },
]);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.portfolio.findMany.mockResolvedValue([]);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);
  mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
});

describe('totalBRLTransacao', () => {
  it('USD: total × câmbio da tx + fees (fees em R$, sem converter)', () => {
    const valor = totalBRLTransacao(
      {
        total: 1000,
        fees: 10,
        notes: marcadorUsd(5),
        date: d('2026-03-03'),
        assetId: 'a1',
        asset: STOCK_USD,
      },
      new Map(),
      serie,
    );
    expect(valor).toBeCloseTo(5010, 6);
  });

  it('legado BRL (stock currency USD sem marcador): total + fees, sem converter', () => {
    const valor = totalBRLTransacao(
      {
        total: 936,
        fees: 4,
        notes: JSON.stringify({ cotacaoMoeda: 5.2 }),
        date: d('2026-03-03'),
        assetId: 'a1',
        asset: STOCK_USD,
      },
      new Map(),
      serie,
    );
    expect(valor).toBe(940);
  });

  it('PETR4 com marcador USD nas notes: continua R$', () => {
    const valor = totalBRLTransacao(
      { total: 500, fees: 2, notes: marcadorUsd(5), assetId: 'a-br', asset: PETR4 },
      new Map(),
      serie,
    );
    expect(valor).toBe(502);
  });

  it('venda sem câmbio gravado cai na série USD-BRL da data', () => {
    const lastRate = new Map([['a-reit', 4.9]]);
    const valor = totalBRLTransacao(
      { total: 100, fees: 1, notes: null, date: d('2026-03-12'), assetId: 'a-reit', asset: REIT },
      lastRate,
      serie,
    );
    // Série (5,5) vence o câmbio da compra anterior (4,9).
    expect(valor).toBeCloseTo(551, 6);
  });

  it('sem série: reusa o câmbio da compra anterior do mesmo ativo', () => {
    const lastRate = new Map<string, number>();
    totalBRLTransacao(
      { total: 300, notes: JSON.stringify({ cotacaoMoeda: 5.2 }), assetId: 'a-reit', asset: REIT },
      lastRate,
      null,
    );
    const venda = totalBRLTransacao(
      { total: 100, notes: null, date: d('2026-03-12'), assetId: 'a-reit', asset: REIT },
      lastRate,
      null,
    );
    expect(venda).toBeCloseTo(520, 6);
  });

  it('sem câmbio nenhum: 0 (fora da soma, nunca US$ como R$)', () => {
    const valor = totalBRLTransacao(
      { total: 100, notes: null, date: d('2026-03-12'), assetId: 'a-reit', asset: REIT },
      new Map(),
      null,
    );
    expect(valor).toBe(0);
  });
});

describe('carregarCambioDasTransacoes', () => {
  it('sem transação em US$: não consulta o banco', async () => {
    const s = await carregarCambioDasTransacoes([
      { total: 1, date: d('2026-03-03'), asset: PETR4 },
      { total: 1, date: d('2026-03-03'), asset: STOCK_USD, notes: null },
    ]);
    expect(s).toBeNull();
    expect(mockPrisma.assetPriceHistory.findMany).not.toHaveBeenCalled();
  });

  it('com transação em US$: carrega desde a 1ª delas', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
      { date: new Date('2026-03-02T00:00:00.000Z'), price: 5.2 },
    ]);
    const s = await carregarCambioDasTransacoes([
      { total: 1, date: d('2026-03-20'), asset: REIT },
      { total: 1, date: d('2026-03-05'), asset: REIT },
    ]);
    expect(s?.(d('2026-03-06'))).toBe(5.2);
    const where = mockPrisma.assetPriceHistory.findMany.mock.calls[0][0].where;
    expect(where.symbol).toBe('USD-BRL');
    expect(where.date.gte.toISOString()).toBe('2026-03-05T00:00:00.000Z');
  });
});

describe('computeInvestimentosPorMes — transações em US$', () => {
  it('compra marcada pelo câmbio da tx e venda de REIT pela série; ação BR intacta', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
      { date: new Date('2026-03-02T00:00:00.000Z'), price: 5.2 },
      { date: new Date('2026-03-10T00:00:00.000Z'), price: 5.5 },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 't1',
        assetId: 'a-us',
        type: 'compra',
        total: 1000,
        fees: 10,
        date: d('2026-03-03'),
        notes: marcadorUsd(5),
        asset: STOCK_USD,
      },
      {
        id: 't2',
        assetId: 'a-reit',
        type: 'venda',
        total: 100,
        fees: 0,
        date: d('2026-03-12'),
        notes: null,
        asset: REIT,
      },
      {
        id: 't3',
        assetId: 'a-br',
        type: 'compra',
        total: 500,
        fees: 2,
        date: d('2026-03-04'),
        notes: null,
        asset: PETR4,
      },
    ]);

    const { totaisPorMes, porTipo } = await computeInvestimentosPorMes('u1', 2026);

    expect(porTipo.stock[2]).toBeCloseTo(5010 + 502, 2);
    expect(porTipo.reit[2]).toBeCloseTo(-550, 2);
    expect(totaisPorMes[2]).toBeCloseTo(5010 + 502 - 550, 2);
  });
});

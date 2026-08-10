import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { computeInvestimentosPorMes } from '../investimentosPorMes';

const tx = (overrides: Record<string, unknown>) => ({
  id: 'tx',
  userId: 'u1',
  assetId: 'asset-livre',
  type: 'compra',
  total: 1000,
  fees: 0,
  date: new Date(Date.UTC(2026, 0, 15, 12)),
  notes: null,
  asset: { type: 'stock', symbol: 'ITSA4' },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.portfolio.findMany.mockResolvedValue([]);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
});

describe('computeInvestimentosPorMes', () => {
  it('soma compras (+) e vendas (−) com taxas em totaisPorMes', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ total: 1000, fees: 2.5 }),
      tx({ type: 'venda', total: 300, fees: 1.5, date: new Date(Date.UTC(2026, 0, 20, 12)) }),
    ]);

    const { totaisPorMes, planejamentoPorMes } = await computeInvestimentosPorMes('u1', 2026);

    expect(totaisPorMes[0]).toBeCloseTo(1002.5 - 301.5, 2);
    expect(planejamentoPorMes.every((v) => v === 0)).toBe(true);
  });

  it('segrega ativos vinculados a sonho no bucket planejamento, fora de totaisPorMes', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([{ assetId: 'asset-sonho' }]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ assetId: 'asset-livre', total: 1000 }),
      tx({ assetId: 'asset-sonho', total: 500, asset: { type: 'fii', symbol: 'MXRF11' } }),
    ]);

    const { totaisPorMes, planejamentoPorMes, porTipo, tipos } = await computeInvestimentosPorMes(
      'u1',
      2026,
    );

    expect(totaisPorMes[0]).toBe(1000);
    expect(planejamentoPorMes[0]).toBe(500);
    expect(porTipo.planejamento[0]).toBe(500);
    expect(tipos.has('planejamento')).toBe(true);
    // A categoria do ativo vinculado NÃO recebe o valor (evita aparecer no Aporte/Resgate)
    expect(porTipo.fii).toBeUndefined();
  });

  it('venda de ativo vinculado abate o líquido do planejamento (pode ficar negativo)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([{ assetId: 'asset-sonho' }]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ assetId: 'asset-sonho', total: 500 }),
      tx({
        assetId: 'asset-sonho',
        type: 'venda',
        total: 800,
        date: new Date(Date.UTC(2026, 0, 25, 12)),
      }),
    ]);

    const { planejamentoPorMes, totaisPorMes } = await computeInvestimentosPorMes('u1', 2026);

    expect(planejamentoPorMes[0]).toBe(-300);
    expect(totaisPorMes[0]).toBe(0);
  });

  it('REIT (total gravado em USD) converte para BRL com o câmbio de notes.cotacaoMoeda', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({
        assetId: 'asset-reit',
        total: 300,
        notes: JSON.stringify({ cotacaoMoeda: 5.2 }),
        asset: { type: 'reit', currency: 'USD', symbol: 'O-QA' },
      }),
    ]);

    const { totaisPorMes, porTipo } = await computeInvestimentosPorMes('u1', 2026);

    expect(totaisPorMes[0]).toBeCloseTo(1560, 2);
    expect(porTipo.reit[0]).toBeCloseTo(1560, 2);
  });

  it('venda de REIT sem câmbio gravado reusa o câmbio da compra anterior do mesmo ativo', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({
        assetId: 'asset-reit',
        total: 300,
        notes: JSON.stringify({ cotacaoMoeda: 5.2 }),
        asset: { type: 'reit', currency: 'USD', symbol: 'O-QA' },
      }),
      tx({
        assetId: 'asset-reit',
        type: 'venda',
        total: 100,
        notes: null,
        date: new Date(Date.UTC(2026, 1, 10, 12)),
        asset: { type: 'reit', currency: 'USD', symbol: 'O-QA' },
      }),
    ]);

    const { totaisPorMes } = await computeInvestimentosPorMes('u1', 2026);

    expect(totaisPorMes[0]).toBeCloseTo(1560, 2);
    expect(totaisPorMes[1]).toBeCloseTo(-520, 2);
  });

  it('stock em USD NÃO converte (total já é gravado em BRL na escrita)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({
        total: 936,
        notes: JSON.stringify({ cotacaoMoeda: 5.2 }),
        asset: { type: 'stock', currency: 'USD', symbol: 'AAPL-QA' },
      }),
    ]);

    const { totaisPorMes } = await computeInvestimentosPorMes('u1', 2026);

    expect(totaisPorMes[0]).toBeCloseTo(936, 2);
  });

  it('reinvestimento tem precedência: fica no bucket reinvestimento mesmo se o ativo é vinculado', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([{ assetId: 'asset-sonho' }]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({
        assetId: 'asset-sonho',
        total: 100,
        notes: JSON.stringify({ operation: { action: 'reinvestimento' } }),
      }),
    ]);

    const { porTipo, planejamentoPorMes, totaisPorMes } = await computeInvestimentosPorMes(
      'u1',
      2026,
    );

    expect(porTipo.reinvestimento[0]).toBe(100);
    expect(planejamentoPorMes[0]).toBe(0);
    expect(totaisPorMes[0]).toBe(0);
  });

  describe('Tesouro de catálogo em reserva (report 10/08)', () => {
    // duas queries de stockTransaction: a do ano (transações) e a de compras
    // de Tesouro (where.asset presente) — distingue pelo shape do where
    const mockTxQueries = (transacoesAno: unknown[], comprasTesouro: unknown[]) => {
      mockPrisma.stockTransaction.findMany.mockImplementation(
        (args: { where?: Record<string, unknown> }) =>
          Promise.resolve(args?.where && 'asset' in args.where ? comprasTesouro : transacoesAno),
      );
    };

    const tesouroTx = (overrides: Record<string, unknown> = {}) =>
      tx({
        assetId: 'asset-td-selic',
        asset: { type: 'tesouro-direto', symbol: 'TD-TESOURO-SELIC-2029' },
        notes: JSON.stringify({ tesouroDestino: 'reserva-oportunidade' }),
        ...overrides,
      });

    it('compra E venda de Tesouro comprado como reserva-oportunidade vão pro bucket opportunity', async () => {
      // asset.type é 'tesouro-direto' (catálogo compartilhado) — o destino vive
      // nas notes da compra; a venda não carrega destino e caía em Renda Fixa.
      mockTxQueries(
        [
          tesouroTx({ total: 2000 }),
          tesouroTx({
            type: 'venda',
            total: 500,
            notes: null,
            date: new Date(Date.UTC(2026, 1, 10, 12)),
          }),
        ],
        [tesouroTx({ total: 2000 })],
      );

      const { porTipo, tipos } = await computeInvestimentosPorMes('u1', 2026);

      expect(porTipo.opportunity[0]).toBe(2000);
      expect(porTipo.opportunity[1]).toBe(-500);
      expect(porTipo.bond).toBeUndefined();
      expect(tipos.has('bond')).toBe(false);
    });

    it('destino reserva-emergencia vai pro bucket emergency', async () => {
      const compra = tesouroTx({ notes: JSON.stringify({ tesouroDestino: 'reserva-emergencia' }) });
      mockTxQueries([compra], [compra]);

      const { porTipo } = await computeInvestimentosPorMes('u1', 2026);
      expect(porTipo.emergency[0]).toBe(1000);
      expect(porTipo.bond).toBeUndefined();
    });

    it('Tesouro com destino renda-fixa continua no bucket bond', async () => {
      const compra = tesouroTx({
        notes: JSON.stringify({ tesouroDestino: 'renda-fixa-posfixada' }),
      });
      mockTxQueries([compra], [compra]);

      const { porTipo } = await computeInvestimentosPorMes('u1', 2026);
      expect(porTipo.bond[0]).toBe(1000);
      expect(porTipo.opportunity).toBeUndefined();
    });
  });
});

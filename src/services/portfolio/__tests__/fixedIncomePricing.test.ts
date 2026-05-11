import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  fixedIncomeAsset: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
  economicIndex: { findMany: vi.fn() },
  tesouroDiretoPrice: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { createFixedIncomePricer } from '../fixedIncomePricing';
import type { FixedIncomeAssetWithAsset } from '../patrimonioHistoricoBuilder';

const makeCdiPrefixadoFi = (overrides: Partial<FixedIncomeAssetWithAsset> = {}) =>
  ({
    id: 'fi-1',
    userId: 'user-1',
    assetId: 'asset-1',
    type: 'CDB_PRE',
    description: 'CDB Prefixado',
    startDate: new Date('2024-01-02'),
    maturityDate: new Date('2027-01-02'),
    investedAmount: 100_000,
    annualRate: 12,
    indexer: null,
    indexerPercent: null,
    liquidityType: null,
    taxExempt: false,
    tesouroBondType: null,
    tesouroMaturity: null,
    asset: { symbol: 'CDB-PRE', name: 'CDB Pré 12% a.a.', type: 'bond' },
    qty: undefined,
    ...overrides,
  }) as FixedIncomeAssetWithAsset;

describe('createFixedIncomePricer — Bug #15 (idempotência entre rotas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    mockPrisma.tesouroDiretoPrice.findMany.mockResolvedValue([]);
  });

  it('getCurrentValue do mesmo FI prefixado é igual carregado isolado vs num pool', async () => {
    const fi = makeCdiPrefixadoFi();
    const outroFi = makeCdiPrefixadoFi({
      id: 'fi-2',
      assetId: 'asset-2',
      investedAmount: 50_000,
      annualRate: 10,
    });
    const asOf = new Date('2025-06-15');

    // Caminho 1 — /api/ativos/[id]: pricer recebe só este FI.
    const pricerIsolado = await createFixedIncomePricer('user-1', {
      asOfDate: asOf,
      preloadedAssets: [fi],
    });

    // Caminho 2 — /api/carteira/renda-fixa: pricer recebe vários FIs.
    const pricerPool = await createFixedIncomePricer('user-1', {
      asOfDate: asOf,
      preloadedAssets: [fi, outroFi],
    });

    const valorIsolado = pricerIsolado.getCurrentValue(fi);
    const valorPool = pricerPool.getCurrentValue(fi);

    expect(valorIsolado).toBe(valorPool);
    expect(valorIsolado).toBeGreaterThan(fi.investedAmount); // rendeu algo
  });

  it('buildValueSeriesForAsset produz a mesma série isolado vs em pool', async () => {
    const fi = makeCdiPrefixadoFi();
    const outroFi = makeCdiPrefixadoFi({
      id: 'fi-3',
      assetId: 'asset-3',
      investedAmount: 200_000,
    });
    const asOf = new Date('2025-06-15');

    const pricerIsolado = await createFixedIncomePricer('user-1', {
      asOfDate: asOf,
      preloadedAssets: [fi],
    });
    const pricerPool = await createFixedIncomePricer('user-1', {
      asOfDate: asOf,
      preloadedAssets: [fi, outroFi],
    });

    // Timeline arbitrário cobrindo o ativo
    const timeline = [
      new Date('2024-06-01').getTime(),
      new Date('2024-12-01').getTime(),
      new Date('2025-06-01').getTime(),
    ];

    const sIso = pricerIsolado.buildValueSeriesForAsset(fi, timeline);
    const sPool = pricerPool.buildValueSeriesForAsset(fi, timeline);

    expect(sIso).toHaveLength(sPool.length);
    for (let i = 0; i < sIso.length; i++) {
      expect(sIso[i].date).toBe(sPool[i].date);
      expect(sIso[i].value).toBe(sPool[i].value);
    }
  });

  it('arredonda saldoBruto para 2 casas (mesmo cuidado do pricer compartilhado)', async () => {
    const fi = makeCdiPrefixadoFi({ investedAmount: 1234.5678 });
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2025-06-15'),
      preloadedAssets: [fi],
    });
    const valor = pricer.getCurrentValue(fi);
    // 2 casas decimais: o número, em string, não pode ter mais que 2 dígitos após o ponto.
    expect(String(valor)).toMatch(/^\d+(\.\d{0,2})?$/);
  });

  it('FI ainda não aplicado (start no futuro) devolve investedAmount sem rendimento', async () => {
    const fi = makeCdiPrefixadoFi({
      startDate: new Date('2099-01-01'),
      maturityDate: new Date('2099-12-01'),
    });
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2025-06-15'),
      preloadedAssets: [fi],
    });
    expect(pricer.getCurrentValue(fi)).toBe(fi.investedAmount);
  });
});

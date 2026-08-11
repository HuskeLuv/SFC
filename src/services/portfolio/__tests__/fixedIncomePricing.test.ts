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

  // 2º passe (2026-05-19): a rota consolidada `/api/carteira/renda-fixa` chama
  // `createFixedIncomePricer(userId)` sem options (asOfDate=new Date() bruto,
  // sem preloadedAssets, sem portfolioStartDate). A rota detalhe `/api/ativos/[id]`
  // chama com `{ asOfDate: hoje normalizado, preloadedAssets: [fi], portfolioStartDate }`.
  // Garantir que essa diferença de invocação NÃO produz divergência de centavos.
  it('mesmo FI dá o mesmo valor por consolidated path vs detail path', async () => {
    const fi = makeCdiPrefixadoFi();
    const today = new Date('2025-06-15T14:30:00Z'); // hora qualquer no meio do dia
    const normalizedToday = new Date(2025, 5, 15); // mesmo dia, 00:00 local

    // Detail path: passa fi via preloadedAssets + asOfDate normalizado + portfolioStartDate
    const pricerDetail = await createFixedIncomePricer('user-1', {
      asOfDate: normalizedToday,
      preloadedAssets: [fi],
      portfolioStartDate: fi.startDate,
    });

    // Consolidated path: o fi vem do DB; asOfDate raw (com hora); sem portfolioStartDate
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValueOnce([fi]);
    const pricerConsolidated = await createFixedIncomePricer('user-1', {
      asOfDate: today, // simula o "new Date()" do consolidated mas determinístico
    });

    const valorDetail = pricerDetail.getCurrentValue(fi);
    const valorConsolidated = pricerConsolidated.getCurrentValue(fi);

    // Divergência permitida: zero centavos.
    expect(valorDetail).toBe(valorConsolidated);
  });
});

describe('Tesouro por valor — âncora de PU (report 10/08)', () => {
  const makeTesouroFi = (overrides: Partial<FixedIncomeAssetWithAsset> = {}) =>
    makeCdiPrefixadoFi({
      id: 'fi-td',
      assetId: 'asset-td',
      description: 'Tesouro Prefixado 2029',
      startDate: new Date('2026-01-15'),
      maturityDate: new Date('2029-01-01'),
      investedAmount: 1000,
      annualRate: 0,
      tesouroBondType: 'Tesouro Prefixado',
      tesouroMaturity: new Date('2029-01-01'),
      asset: {
        symbol: 'TD-TESOURO-PREFIXADO-2029',
        name: 'Tesouro Prefixado 2029',
        type: 'tesouro-direto',
      },
      ...overrides,
    });

  const puRows = [
    {
      bondType: 'Tesouro Prefixado',
      maturityDate: new Date('2029-01-01'),
      baseDate: new Date('2026-06-02'),
      basePU: 800,
      sellPU: 800,
      buyPU: null,
    },
    {
      bondType: 'Tesouro Prefixado',
      maturityDate: new Date('2029-01-01'),
      baseDate: new Date('2026-08-07'),
      basePU: 820,
      sellPU: 820,
      buyPU: null,
    },
  ];

  beforeEach(() => {
    mockPrisma.tesouroDiretoPrice.findMany.mockResolvedValue(puRows);
  });

  it('qty=1 placeholder (aplicação por valor sem PU do dia) ancora no PU oficial, não no valor aplicado', async () => {
    // Bug: implied PU = 1000/1 = 1000 (desvio 25% do oficial 800) → o fator
    // PU_dia/1000 colapsava o valor da posição no PU do título (820).
    const fi = makeTesouroFi({ qty: 1 });
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2026-08-07'),
      preloadedAssets: [fi],
    });
    // correto: 1000 × 820/800 = 1025 (valor aplicado marcado pela variação do título)
    expect(pricer.getCurrentValue(fi)).toBeCloseTo(1025, 2);
  });

  it('qty fracionário real (derivado do PU) usa o PU efetivo de aquisição', async () => {
    const fi = makeTesouroFi({ qty: 1.25 }); // implied = 1000/1.25 = 800 = oficial
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2026-08-07'),
      preloadedAssets: [fi],
    });
    expect(pricer.getCurrentValue(fi)).toBeCloseTo(1025, 2);
  });

  it('estilo Kinvo (~1 cota inteira, preço pago ≈ PU) mantém o PU implícito', async () => {
    const fi = makeTesouroFi({ qty: 1, investedAmount: 805 }); // implied 805, desvio 0,6%
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2026-08-07'),
      preloadedAssets: [fi],
    });
    // 805 × 820/805 = 820 — 1 cota real vale o PU do dia
    expect(pricer.getCurrentValue(fi)).toBeCloseTo(820, 2);
  });

  it('sem PU oficial nenhum, mantém o PU implícito (comportamento antigo)', async () => {
    mockPrisma.tesouroDiretoPrice.findMany.mockResolvedValue([]);
    // título/vencimento diferentes: fura o cache TTL de módulo do pricer
    // (senão as linhas de PU dos testes anteriores voltam do cache)
    const fi = makeTesouroFi({ qty: 1, tesouroMaturity: new Date('2031-01-01') });
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2026-08-07'),
      preloadedAssets: [fi],
    });
    // sem série de PU: fator fica 1 → devolve o valor aplicado
    expect(pricer.getCurrentValue(fi)).toBeCloseTo(1000, 2);
  });
});

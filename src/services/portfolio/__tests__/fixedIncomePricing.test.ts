import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  fixedIncomeAsset: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
  economicIndex: { findMany: vi.fn() },
  tesouroDiretoPrice: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { createFixedIncomePricer } from '../fixedIncomePricing';
import type { FixedIncomeAssetWithAsset } from '../patrimonioHistoricoBuilder';

// O pricer consulta as transações do ativo pra montar as tranches — default vazio
// (caminho legado). Roda antes dos beforeEach aninhados; clearAllMocks preserva
// implementações, então o stub sobrevive.
beforeEach(() => {
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
});

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

// Ticket 24/08 (CDB IPCA+10% vs Gorila): a busca do IPCA usava `gte: startDate`
// do FI, mas a linha do IPCA é datada no dia 1º do mês de referência — FI
// aplicado depois do dia 1º nunca carregava o IPCA do mês da aplicação, a fila
// de pendentes descartava o mês em silêncio e todo IPCA+ perdia o primeiro mês
// de inflação (~0,86pp no caso do ticket).
describe('IPCA — mês da aplicação (ticket 24/08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.tesouroDiretoPrice.findMany.mockResolvedValue([]);
    // Mock fiel ao DB: respeita o filtro where.date.gte/lte — essencial para
    // capturar o bug de janela (um mock que devolve tudo mascara a regressão).
    const ipcaRows = [
      { date: new Date('2031-02-01'), value: 0.01 },
      { date: new Date('2031-03-01'), value: 0.02 },
      { date: new Date('2031-04-01'), value: 0 },
      { date: new Date('2031-05-01'), value: 0 },
    ];
    mockPrisma.economicIndex.findMany.mockImplementation(
      async (args: { where: { indexType: string; date?: { gte?: Date; lte?: Date } } }) => {
        if (args.where.indexType !== 'IPCA') return [];
        const gte = args.where.date?.gte?.getTime() ?? -Infinity;
        const lte = args.where.date?.lte?.getTime() ?? Infinity;
        return ipcaRows.filter((r) => r.date.getTime() >= gte && r.date.getTime() <= lte);
      },
    );
  });

  it('FI IPCA+ aplicado depois do dia 1º recebe o IPCA do mês da aplicação', async () => {
    // IPCA + 0% (spread zero) isola o efeito: valor final = invested × Π(1+ipca_mês)
    const fi = makeCdiPrefixadoFi({
      type: 'CDB_HIB',
      description: 'CDB IPCA+0%',
      startDate: new Date('2031-02-02'), // depois do dia 1º — a linha 01/02 ficava fora da janela
      maturityDate: new Date('2035-02-10'),
      investedAmount: 50_000,
      annualRate: 0,
      indexer: 'IPCA',
    });
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2031-06-15'),
      preloadedAssets: [fi],
      // Como na rota /api/ativos/[id]. Sem isto o default de portfolioStartDate
      // (24 meses atrás do asOf) alarga a janela por acidente e mascara o bug —
      // que na prática atingia FIs mais antigos que 24 meses (caso do ticket).
      portfolioStartDate: fi.startDate,
    });
    // fev (1%) e mar (2%) aplicados nos cruzamentos de mês: 50.000 × 1.01 × 1.02
    expect(pricer.getCurrentValue(fi)).toBe(51_510);
  });
});

// Ticket 28/08/2026 (CDB com aportes/resgates, carteira Willie): a série valia
// `investedAmount TOTAL × fator` desde o startDate — nenhum salto no dia do
// aporte, e o TWR interpretava cada aporte como perda de −F/(V+F) (degraus até
// −81%). Com 2+ movimentações o pricer agora replaya tranches: cada aporte
// rende a partir do SEU dia; resgate remove o valor resgatado no dia.
describe('Tranches — aportes/resgates rendem do próprio dia (ticket 28/08)', () => {
  const trancheTx = (
    type: 'compra' | 'venda',
    date: string,
    total: number,
    assetId = 'asset-1',
  ) => ({
    assetId,
    type,
    quantity: 1,
    price: total,
    total,
    date: new Date(date),
    notes: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    mockPrisma.tesouroDiretoPrice.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  });

  it('aporte posterior rende só do dia do aporte: multi-tranche = soma de posições isoladas', async () => {
    const asOf = new Date('2026-01-02');
    // Posição real: compra 1.000 em 02/01/2024 + aporte 1.000 em 02/01/2025.
    const fi = makeCdiPrefixadoFi({ investedAmount: 2000 });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      trancheTx('compra', '2024-01-02', 1000),
      trancheTx('compra', '2025-01-02', 1000),
    ]);
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: asOf,
      preloadedAssets: [fi],
    });

    // Referência: duas posições single-tranche equivalentes (caminho legado).
    const fiA = makeCdiPrefixadoFi({ id: 'fi-a', assetId: 'asset-a', investedAmount: 1000 });
    const fiB = makeCdiPrefixadoFi({
      id: 'fi-b',
      assetId: 'asset-b',
      investedAmount: 1000,
      startDate: new Date('2025-01-02'),
    });
    const pricerRef = await createFixedIncomePricer('user-1', {
      asOfDate: asOf,
      preloadedAssets: [fiA, fiB],
    });

    const esperado = pricerRef.getCurrentValue(fiA) + pricerRef.getCurrentValue(fiB);
    // Tolerância de ~1 dia de juro: a tranche compõe D+0 enquanto o PRE
    // standalone compõe D+1 — diferença de convenção de 1 dia por aporte.
    expect(Math.abs(pricer.getCurrentValue(fi) - esperado)).toBeLessThan(1.5);
    // E é MENOR que o caminho antigo (2.000 × fator de 2 anos), que dava
    // rendimento de 2 anos ao aporte que ficou aplicado só 1.
    const fiLegado = makeCdiPrefixadoFi({ id: 'fi-l', assetId: 'asset-l', investedAmount: 2000 });
    const legado = pricerRef.getCurrentValue(fiLegado);
    expect(pricer.getCurrentValue(fi)).toBeLessThan(legado);
  });

  it('série salta exatamente o valor aportado no dia do aporte (TWR neutro)', async () => {
    const fi = makeCdiPrefixadoFi({ investedAmount: 2000 });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      trancheTx('compra', '2024-01-02', 1000),
      trancheTx('compra', '2025-01-02', 1000),
    ]);
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2026-01-02'),
      preloadedAssets: [fi],
    });

    const timeline: number[] = [];
    for (
      let d = new Date('2024-01-02').getTime();
      d <= new Date('2026-01-02').getTime();
      d += 24 * 60 * 60 * 1000
    ) {
      const dow = new Date(d).getUTCDay();
      if (dow !== 0 && dow !== 6) timeline.push(d);
    }
    const series = pricer.buildValueSeriesForAsset(fi, timeline);
    const byDay = new Map(series.map((p) => [p.date, p.value]));
    const aporteDay = new Date('2025-01-02').getTime();
    const prevDay = new Date('2024-12-31').getTime();
    const jump = (byDay.get(aporteDay) ?? 0) - (byDay.get(prevDay) ?? 0);
    // Salto = aporte (1.000) + rendimento de ~2 dias da tranche antiga (poucos reais).
    expect(jump).toBeGreaterThanOrEqual(1000);
    expect(jump).toBeLessThan(1010);
    // Antes do aporte a série vale só a 1ª tranche corrigida (~1.000×fator), não os 2.000.
    expect(byDay.get(prevDay)!).toBeLessThan(1200);
    expect(byDay.get(prevDay)!).toBeGreaterThan(1000);
  });

  it('resgate reduz a série exatamente pelo valor resgatado no dia', async () => {
    const fi = makeCdiPrefixadoFi({ investedAmount: 1500 });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      trancheTx('compra', '2024-01-02', 2000),
      trancheTx('venda', '2025-01-02', 500),
    ]);
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2026-01-02'),
      preloadedAssets: [fi],
    });
    const timeline = [new Date('2024-12-31').getTime(), new Date('2025-01-02').getTime()];
    const series = pricer.buildValueSeriesForAsset(fi, timeline);
    const drop = series[0].value - series[1].value;
    // Queda = resgate (500) − rendimento de ~2 dias (poucos reais).
    expect(drop).toBeGreaterThan(490);
    expect(drop).toBeLessThanOrEqual(500);
  });

  it('lançamento único mantém o caminho legado (investedAmount × fator)', async () => {
    const fi = makeCdiPrefixadoFi({ investedAmount: 5000 });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      trancheTx('compra', '2024-01-02', 4000), // total ≠ investedAmount editado à mão
    ]);
    const pricer = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2025-06-15'),
      preloadedAssets: [fi],
    });
    const pricerSemTx = await createFixedIncomePricer('user-1', {
      asOfDate: new Date('2025-06-15'),
      preloadedAssets: [
        makeCdiPrefixadoFi({ id: 'fi-s', assetId: 'asset-s', investedAmount: 5000 }),
      ],
    });
    expect(pricer.getCurrentValue(fi)).toBe(
      pricerSemTx.getCurrentValue(
        makeCdiPrefixadoFi({ id: 'fi-s', assetId: 'asset-s', investedAmount: 5000 }),
      ),
    );
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

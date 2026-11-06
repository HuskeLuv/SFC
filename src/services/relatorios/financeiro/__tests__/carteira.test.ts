import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Prisma único para a paridade: o MESMO mock de portfolio alimenta buildSaudeFinanceira (valoração
// do relatório) e GET /api/carteira/resumo.
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn() },
  cashflowGroup: { findMany: vi.fn() },
  dashboardData: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  alocacaoConfig: { findMany: vi.fn() },
  asset: { findMany: vi.fn() },
  economicIndex: { findMany: vi.fn() },
  tesouroDiretoPrice: { findMany: vi.fn() },
  divida: { findMany: vi.fn() },
  aposentadoriaPlano: { findUnique: vi.fn() },
  portfolioPerformance: { findFirst: vi.fn() },
}));
const mockTriggerLazyBackfill = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 't@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(
    new Map([
      ['PETR4', 41.16],
      ['HGLG11', 160],
      ['BOVA11', 120],
      ['IVV', 500],
      ['O', 50],
    ]),
  ),
}));
vi.mock('@/services/market/cambioUsdBrl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/market/cambioUsdBrl')>()),
  getCotacaoDolarHoje: vi.fn().mockResolvedValue({ taxa: 5, data: new Date('2026-11-05') }),
}));
vi.mock('@/services/market/marketIndicatorService', () => ({
  getIndicator: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/market/economicRates', () => ({
  DEFAULT_INFLACAO_AA: 4.5,
  getCdiAnualizado: vi.fn().mockResolvedValue(null),
  getInflacao12m: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/saudeFinanceira/saudeFinanceiraConfig', async () => {
  const { DEFAULT_SAUDE_CONFIG } = await import('@/services/saudeFinanceira/indicadores');
  return { getSaudeConfig: vi.fn().mockResolvedValue({ ...DEFAULT_SAUDE_CONFIG }) };
});
vi.mock('@/lib/simpleTtlCache', () => ({
  getTtlCache: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn() }),
  deleteTtlCacheKeyPrefix: vi.fn(),
}));
vi.mock('@/services/portfolio/portfolioSeriesAggregation', () => ({
  applyChartAggregation: vi.fn().mockReturnValue([]),
}));
vi.mock('@/services/portfolio/portfolioSnapshotReader', () => ({
  loadHistoricoFromSnapshots: vi.fn().mockResolvedValue({
    historicoPatrimonio: [],
    historicoTWR: [],
    historicoTWRPeriodo: [],
    coverageOk: false,
    coverageReason: 'no-rows',
  }),
}));
vi.mock('@/services/portfolio/portfolioSnapshotPersistence', () => ({
  triggerLazyBackfill: mockTriggerLazyBackfill,
}));
vi.mock('@/services/portfolio/patrimonioHistoricoBuilder', () => ({
  buildDailyTimeline: vi.fn().mockReturnValue([]),
  buildDailyPriceMap: vi.fn().mockReturnValue(new Map()),
  buildPatrimonioHistorico: vi.fn().mockReturnValue([]),
  calculateFixedIncomeValue: vi.fn().mockReturnValue(0),
  filterInvestmentsExclReservas: vi.fn().mockReturnValue([]),
  getRawPatrimonioTimelineStart: vi.fn().mockReturnValue(new Date()),
  normalizeDateStart: vi.fn().mockReturnValue(new Date()),
}));

import { GET as getResumo } from '@/app/api/carteira/resumo/route';
import { buildSaudeFinanceira } from '@/services/saudeFinanceira/saudeFinanceiraServer';
import type { SaudeFinanceiraPayload } from '@/services/saudeFinanceira/saudeFinanceiraServer';
import type { MesesRelatorio } from '@/types/relatorioFinanceiro';
import type { ContextoMontador, Insumos, SnapshotDiario } from '../insumos';
import { mesesDaJanela, periodoDoRelatorio } from '../periodo';
import { classesDaCarteira, montarCarteira, patrimonioInvestido } from '../carteira';

const AGORA = new Date('2026-11-06T09:42:00-03:00');
const HOJE = { ano: 2026, mes0: 10, dia: 6 };

const pos = (
  symbol: string,
  type: string,
  quantity: number,
  avgPrice: number,
  extra: Record<string, unknown> = {},
) => ({
  id: `p-${symbol}`,
  userId: 'user-1',
  assetId: `a-${symbol}`,
  quantity,
  avgPrice,
  totalInvested: quantity * avgPrice,
  categoriaOverride: null,
  moedaRegistro: null,
  totalInvestedBrl: null,
  ...extra,
  asset: {
    id: `a-${symbol}`,
    symbol,
    type,
    currency: (extra.currency as string) ?? 'BRL',
    name: symbol,
    currentPrice: null,
  },
});

/** Uma posição de cada classe do Pedro + imóvel (fora do patrimônio investido). */
const PORTFOLIO = [
  pos('PETR4', 'stock', 100, 25),
  pos('BOVA11', 'etf', 10, 100),
  pos('HGLG11', 'fii', 10, 150),
  pos('RESERVA-EMERG-1', 'emergency', 1, 10000),
  pos('TESOURO-SELIC-2029', 'tesouro-direto', 2, 7000),
  pos('IVV', 'etf', 2, 400, { currency: 'USD' }),
  pos('O', 'reit', 10, 45, { currency: 'USD' }),
  pos('BTC', 'crypto', 0.01, 300000),
  pos('PERSONALIZADO-APTO', 'personalizado', 1, 500000),
];

const CAIXA = [
  { metric: 'caixa_para_investir_consolidado', value: 5000 },
  { metric: 'caixa_para_investir_acoes', value: 1000 },
  { metric: 'caixa_para_investir_fii', value: 500 },
];

function prepararPrisma() {
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Teste' });
  mockPrisma.portfolio.findMany.mockResolvedValue(PORTFOLIO);
  mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
  mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
  mockPrisma.dashboardData.findMany.mockResolvedValue(CAIXA);
  mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.alocacaoConfig.findMany.mockResolvedValue([]);
  mockPrisma.asset.findMany.mockResolvedValue([]);
  mockPrisma.economicIndex.findMany.mockResolvedValue([]);
  mockPrisma.tesouroDiretoPrice.findMany.mockResolvedValue([]);
  mockPrisma.divida.findMany.mockResolvedValue([]);
  mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue(null);
  mockPrisma.portfolioPerformance.findFirst.mockResolvedValue(null);
  mockTriggerLazyBackfill.mockResolvedValue(undefined);
}

const snap = (iso: string, totalValue: number): SnapshotDiario => ({
  date: new Date(`${iso}T00:00:00Z`),
  totalValue,
  totalInvested: totalValue,
});

function ctxCom(
  meses: MesesRelatorio,
  saudeBase: () => Promise<SaudeFinanceiraPayload>,
  extra: Partial<{
    snaps: SnapshotDiario[];
    aportes: Array<{ mes: string; valor: number }>;
    comConsultor: boolean;
  }> = {},
): ContextoMontador {
  const janela = mesesDaJanela(HOJE, 13);
  const insumos = {
    userId: 'user-1',
    agora: AGORA,
    hojeSP: HOJE,
    janela,
    inicioJanela: new Date('2025-11-01T00:00:00Z'),
    saudeBase,
    snapshots13m: vi.fn().mockResolvedValue(extra.snaps ?? []),
    aportesMensais13m: vi
      .fn()
      .mockResolvedValue(extra.aportes ?? janela.map((mes) => ({ mes, valor: 0 }))),
  } as unknown as Insumos;
  return {
    userId: 'user-1',
    meses,
    periodo: periodoDoRelatorio(meses, AGORA),
    mesesDoPeriodo: mesesDaJanela(HOJE, meses),
    agora: AGORA,
    hojeSP: HOJE,
    comConsultor: extra.comConsultor ?? false,
    insumos,
  };
}

describe('buildSaudeFinanceira: campos aditivos do relatório', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepararPrisma();
  });

  it('payload antigo intacto: só porClasse, nPosicoes, imoveisBens e caixa a mais', async () => {
    const p = await buildSaudeFinanceira('user-1');
    expect(Object.keys(p).sort()).toEqual(
      [
        'asOf',
        'indicadores',
        'fontes',
        'config',
        'composicao',
        'porClasse',
        'nPosicoes',
        'imoveisBens',
        'caixa',
      ].sort(),
    );
    // Tesouro e ETF em US$ separados; Σ porClasse = Σ das categorias antigas.
    expect(p.porClasse.tesouroDireto).toBe(14000);
    expect(p.porClasse.etfsExterior).toBe(2 * 500 * 5);
    expect(p.porClasse.etfs).toBe(1200);
    // imóvel fora das posições; reserva também.
    expect(p.nPosicoes).toBe(7);
    expect(p.imoveisBens).toEqual([{ nome: 'PERSONALIZADO-APTO', valor: 500000 }]);
    expect(p.caixa).toMatchObject({ bolso: 5000, reservado: 1500 });
    const baixa = Object.fromEntries(p.composicao.baixaLiquidez.map((l) => [l.chave, l.valor]));
    expect(baixa.etfs).toBe(1200 + 5000); // a linha antiga continua somando BR + EUA
  });
});

describe('montarCarteira (4a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepararPrisma();
  });

  it('paridade: patrimônio do relatório = totais.dinheiro do /api/carteira/resumo', async () => {
    const res = await getResumo(
      new NextRequest('http://localhost/api/carteira/resumo?includeHistorico=false'),
    );
    const resumo = await res.json();
    const bloco = await montarCarteira(ctxCom(1, () => buildSaudeFinanceira('user-1')));
    expect(resumo.totais.dinheiro).toBeGreaterThan(0);
    expect(Math.abs(bloco.patrimonio - resumo.totais.dinheiro)).toBeLessThan(0.02);
    // e a soma das classes fecha com o patrimônio
    const soma = bloco.classes.reduce((s, c) => s + c.valor, 0);
    expect(Math.abs(soma - bloco.patrimonio)).toBeLessThan(0.02);
  });

  it('6 classes do Pedro + Outros, na ordem; caixa de cada aba na classe da aba', async () => {
    const base = await buildSaudeFinanceira('user-1');
    const classes = classesDaCarteira(base);
    expect(classes.map((c) => c.chave)).toEqual([
      'rendaFixa',
      'tesouro',
      'acoes',
      'fiis',
      'exterior',
      'reits',
      'outros',
    ]);
    const v = Object.fromEntries(classes.map((c) => [c.chave, c.valor]));
    expect(v.rendaFixa).toBe(10000 + 3500); // reserva + caixa livre
    expect(v.tesouro).toBe(14000);
    expect(v.acoes).toBe(4116 + 1200 + 1000);
    expect(v.fiis).toBe(1600 + 500);
    expect(v.exterior).toBe(5000);
    expect(v.reits).toBe(2500);
    expect(v.outros).toBe(3000);
    expect(patrimonioInvestido(base)).toBe(Object.values(v).reduce((s, x) => s + x, 0));
  });

  it('classe zerada some (sem Outros quando não há cripto/previdência/opções)', () => {
    const base = {
      porClasse: {
        reservaEmergencia: 0,
        reservaOportunidade: 0,
        rendaFixaFundos: 100,
        fimFia: 0,
        fiis: 0,
        acoes: 50,
        stocks: 0,
        reits: 0,
        etfs: 0,
        moedasCriptos: 0,
        previdenciaSeguros: 0,
        opcoes: 0,
        imoveisBens: 900,
        tesouroDireto: 0,
        etfsExterior: 0,
      },
      caixa: {
        bolso: 0,
        reservado: 0,
        porAba: {
          acoes: 0,
          fii: 0,
          etf: 0,
          reit: 0,
          stocks: 0,
          moedasCriptos: 0,
          previdenciaSeguros: 0,
          opcoes: 0,
          fimFia: 0,
          rendaFixa: 0,
        },
      },
    } as SaudeFinanceiraPayload;
    expect(classesDaCarteira(base).map((c) => c.chave)).toEqual(['rendaFixa', 'acoes']);
    expect(patrimonioInvestido(base)).toBe(150);
  });

  it('histórico pelo último snapshot do mês, variação e aportes do período', async () => {
    const base = await buildSaudeFinanceira('user-1');
    const aportes = mesesDaJanela(HOJE, 13).map((mes) => ({
      mes,
      valor: mes >= '2026-09' ? 1000 : 50,
    }));
    const ctx = ctxCom(3, async () => base, {
      snaps: [
        snap('2026-07-15', 90),
        snap('2026-07-31', 100), // base da variação (antes de set)
        snap('2026-09-30', 120),
        snap('2026-10-31', 130),
        snap('2026-11-05', 150),
      ],
      aportes,
    });
    const b = await montarCarteira(ctx);
    expect(b.historico).toEqual([
      { mes: '2026-07', valor: 100 },
      { mes: '2026-09', valor: 120 },
      { mes: '2026-10', valor: 130 },
      { mes: '2026-11', valor: 150 },
    ]);
    expect(b.variacaoPeriodo).toBe(50);
    expect(b.aportes.map((a) => a.mes)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(b.aportesPeriodo).toBe(3000);
    expect(b.asOf).toBe('2026-11-05');
    expect(b.historicoStatus).toBe('ok');
    expect(b.nAtivos).toBe(7);
    expect(mockTriggerLazyBackfill).not.toHaveBeenCalled();
  });

  it('com n=1 o histórico mostra 6 meses', async () => {
    const base = await buildSaudeFinanceira('user-1');
    const snaps = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map(
      (m, i) => snap(`${m}-28`, 100 + i),
    );
    snaps.push(snap('2026-11-05', 200));
    const b = await montarCarteira(ctxCom(1, async () => base, { snaps }));
    expect(b.historico.map((h) => h.mes)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(b.variacaoPeriodo).toBe(200 - 106);
    expect(b.aportes).toHaveLength(1);
  });

  it('sem snapshots: processando, variação null; backfill só sem consultor', async () => {
    const base = await buildSaudeFinanceira('user-1');
    const comConsultor = await montarCarteira(ctxCom(3, async () => base, { comConsultor: true }));
    expect(comConsultor.historicoStatus).toBe('processando');
    expect(comConsultor.variacaoPeriodo).toBeNull();
    expect(comConsultor.asOf).toBeNull();
    expect(mockTriggerLazyBackfill).not.toHaveBeenCalled();

    const semConsultor = await montarCarteira(ctxCom(3, async () => base));
    expect(semConsultor.historicoStatus).toBe('processando');
    expect(mockTriggerLazyBackfill).toHaveBeenCalledWith('user-1', AGORA);
  });
});

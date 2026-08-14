import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { CashflowGroup } from '@/types/cashflow';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn() },
  divida: { findMany: vi.fn() },
  aposentadoriaPlano: { findUnique: vi.fn() },
  economicIndex: { findFirst: vi.fn(), findMany: vi.fn() },
  dashboardData: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  portfolioPerformance: { findFirst: vi.fn() },
  saudeFinanceiraSnapshot: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

const mockGetMergedCashflowGroups = vi.hoisted(() => vi.fn());
const mockGetAssetPrices = vi.hoisted(() => vi.fn());
const mockGetIndicator = vi.hoisted(() => vi.fn());
const mockCreateFixedIncomePricer = vi.hoisted(() => vi.fn());
const mockAccruedIndexFactor = vi.hoisted(() => vi.fn());
const mockLogSensitiveEndpointAccess = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMergedCashflowGroups,
}));
vi.mock('@/services/pricing/assetPriceService', () => ({ getAssetPrices: mockGetAssetPrices }));
vi.mock('@/services/market/marketIndicatorService', () => ({ getIndicator: mockGetIndicator }));
vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: mockCreateFixedIncomePricer,
}));
vi.mock('@/services/dividas/indexacaoDivida', () => ({
  accruedIndexFactor: mockAccruedIndexFactor,
}));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mockLogSensitiveEndpointAccess,
}));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/saude-financeira');

/** Fluxo de caixa da planilha: renda 13k, gasto 9k (2 meses ativos). */
const cashflowTree = (): CashflowGroup[] => [
  {
    id: 'entradas',
    userId: null,
    name: 'Entradas',
    type: 'entrada',
    parentId: null,
    orderIndex: 0,
    children: [],
    items: [
      {
        id: 'salario',
        userId: null,
        groupId: 'entradas',
        name: 'Salário',
        significado: null,
        rank: null,
        values: [
          { id: 'a', itemId: 'salario', userId: 'u', year: 2026, month: 0, value: 13000 },
          { id: 'b', itemId: 'salario', userId: 'u', year: 2026, month: 1, value: 13000 },
        ],
      },
    ],
  },
  {
    id: 'fixas',
    userId: null,
    name: 'Despesas Fixas',
    type: 'despesa',
    parentId: null,
    orderIndex: 1,
    children: [],
    items: [
      {
        id: 'aluguel',
        userId: null,
        groupId: 'fixas',
        name: 'Aluguel',
        significado: null,
        rank: null,
        values: [
          { id: 'c', itemId: 'aluguel', userId: 'u', year: 2026, month: 0, value: 9000 },
          { id: 'd', itemId: 'aluguel', userId: 'u', year: 2026, month: 1, value: 9000 },
        ],
      },
    ],
  },
];

const portfolioItem = (over: Record<string, unknown>) => ({
  assetId: 'asset-x',
  quantity: 0,
  avgPrice: 0,
  totalInvested: 0,
  asset: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.portfolio.findMany.mockResolvedValue([]);
  mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
  mockPrisma.divida.findMany.mockResolvedValue([]);
  mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue(null);
  mockPrisma.economicIndex.findFirst.mockResolvedValue({ value: 10.5 }); // CDI % a.a.
  mockPrisma.economicIndex.findMany.mockResolvedValue(
    Array.from({ length: 12 }, () => ({ value: 0.00368 })), // ≈4,5% a.a.
  );
  mockPrisma.dashboardData.findMany.mockResolvedValue([]);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.portfolioPerformance.findFirst.mockResolvedValue(null);
  mockPrisma.saudeFinanceiraSnapshot.findFirst.mockResolvedValue(null);
  mockPrisma.saudeFinanceiraSnapshot.findMany.mockResolvedValue([]);
  mockPrisma.saudeFinanceiraSnapshot.upsert.mockResolvedValue({});
  mockGetMergedCashflowGroups.mockResolvedValue(cashflowTree());
  mockGetAssetPrices.mockResolvedValue(new Map());
  mockGetIndicator.mockResolvedValue(null);
  mockAccruedIndexFactor.mockResolvedValue(1);
  mockLogSensitiveEndpointAccess.mockResolvedValue(undefined);
  mockCreateFixedIncomePricer.mockResolvedValue({
    fixedIncomeByAssetId: new Map(),
    getCurrentValue: vi.fn().mockReturnValue(0),
  });
});

describe('GET /api/saude-financeira', () => {
  it('monta o diagnóstico completo (fluxo, balanço, benchmarks, status)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      portfolioItem({
        assetId: 'a-emerg',
        quantity: 1,
        avgPrice: 30000,
        totalInvested: 30000,
        asset: { type: 'emergency', symbol: 'RESERVA-EMERG-1', currency: 'BRL' },
      }),
      portfolioItem({
        assetId: 'a-petr',
        quantity: 100,
        avgPrice: 30,
        totalInvested: 3000,
        asset: { type: 'stock', symbol: 'PETR4', currency: 'BRL' },
      }),
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 40]]));
    mockPrisma.divida.findMany.mockResolvedValue([
      {
        id: 'd1',
        nome: 'Apê',
        tipo: 'financiamento_imobiliario',
        modalidade: 'financiamento',
        principal: 50000,
        taxaAm: 0.008,
        prazoMeses: 120,
        sistema: 'SAC',
        indexador: 'TR',
        primeiroVencimento: '2026-01',
        saldoInicial: null,
        dataSaldoInicial: null,
        pagamentos: [],
      },
    ]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const data = await res.json();

    // Fluxo: médias dos meses ativos.
    expect(data.indicadores.fluxo.rendaMensal).toBe(13000);
    expect(data.indicadores.fluxo.gastoMensal).toBe(9000);
    expect(data.indicadores.fluxo.poupancaMensal).toBe(4000);

    // Balanço: reserva (30k) = alta liq.; PETR4 a mercado (4k) = baixa liq.
    expect(data.indicadores.balanco.ativosAltaLiquidez).toBe(30000);
    expect(data.indicadores.balanco.ativosBaixaLiquidez).toBe(4000);

    // Dívida SAC 50k sem pagamentos: saldo = principal, prazo 120m → longo.
    expect(data.indicadores.balanco.passivosLongoPrazo).toBe(50000);
    expect(data.indicadores.balanco.patrimonioLiquido).toBe(30000 + 4000 - 50000);
    expect(data.composicao.passivos).toHaveLength(1);
    expect(data.composicao.passivos[0].prazo).toBe('longo');

    // Benchmarks da planilha: 3× e 12× o gasto.
    expect(data.indicadores.benchmarks.reservaEmergencia.necessario).toBe(27000);
    expect(data.indicadores.benchmarks.patrimonioSeguranca.necessario).toBe(108000);

    // Dívida > 50% dos ativos (50k/34k) ⇒ Endividado.
    expect(data.indicadores.status.codigo).toBe('ED');
  });

  it('classifica renda fixa por liquidez: DAILY alta, MATURITY longa baixa', async () => {
    const fiDaily = {
      id: 'fi-1',
      assetId: 'a-cdb-d',
      liquidityType: 'DAILY',
      maturityDate: new Date('2036-01-01'),
      tesouroBondType: null,
      investedAmount: 10000,
      indexer: 'CDI',
      annualRate: 0,
      asset: { type: 'bond', symbol: 'RENDA-FIXA-1' },
    };
    const fiLonga = {
      id: 'fi-2',
      assetId: 'a-cdb-m',
      liquidityType: 'MATURITY',
      maturityDate: new Date('2036-01-01'),
      tesouroBondType: null,
      investedAmount: 20000,
      indexer: 'CDI',
      annualRate: 0,
      asset: { type: 'bond', symbol: 'RENDA-FIXA-2' },
    };
    mockPrisma.portfolio.findMany.mockResolvedValue([
      portfolioItem({
        assetId: 'a-cdb-d',
        quantity: 1,
        avgPrice: 10000,
        totalInvested: 10000,
        asset: fiDaily.asset,
      }),
      portfolioItem({
        assetId: 'a-cdb-m',
        quantity: 1,
        avgPrice: 20000,
        totalInvested: 20000,
        asset: fiLonga.asset,
      }),
    ]);
    mockCreateFixedIncomePricer.mockResolvedValue({
      fixedIncomeByAssetId: new Map([
        ['a-cdb-d', fiDaily],
        ['a-cdb-m', fiLonga],
      ]),
      getCurrentValue: vi.fn((fi: { investedAmount: number }) => fi.investedAmount * 1.1),
    });

    const res = await GET(req());
    const data = await res.json();

    expect(data.indicadores.balanco.ativosAltaLiquidez).toBeCloseTo(11000, 2);
    expect(data.indicadores.balanco.ativosBaixaLiquidez).toBeCloseTo(22000, 2);
    const chaves = data.composicao.baixaLiquidez.map((l: { chave: string }) => l.chave);
    expect(chaves).toContain('rendaFixaBaixaLiquidez');
  });

  it('usa TWR 12m quando a série de performance cobre 12 meses', async () => {
    mockPrisma.portfolioPerformance.findFirst
      .mockResolvedValueOnce({ date: new Date('2026-08-12'), cumulativeReturn: 21.0 })
      .mockResolvedValueOnce({ cumulativeReturn: 10.0 });

    const res = await GET(req());
    const data = await res.json();

    // (1.21)/(1.10) − 1 = 10%
    expect(data.indicadores.economia.rentabilidadeFonte).toBe('carteira');
    expect(data.indicadores.economia.rentabilidadeAA).toBeCloseTo(0.1, 6);
  });

  it('carteira sem 12m de performance cai no CDI como proxy', async () => {
    mockPrisma.portfolioPerformance.findFirst
      .mockResolvedValueOnce({ date: new Date('2026-08-12'), cumulativeReturn: 2.0 })
      .mockResolvedValueOnce(null); // sem âncora 12m atrás

    const res = await GET(req());
    const data = await res.json();

    expect(data.indicadores.economia.rentabilidadeFonte).toBe('cdi');
    expect(data.indicadores.economia.rentabilidadeAA).toBeCloseTo(0.105, 6);
  });

  it('idade vem do plano de aposentadoria e habilita o patrimônio ideal', async () => {
    mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue({ idade: 30 });

    const res = await GET(req());
    const data = await res.json();

    expect(data.fontes.idade).toBe(30);
    // 10% × (13000×12) × 30
    expect(data.indicadores.benchmarks.patrimonioIdeal.necessario).toBe(468000);
  });

  it('caixa para investir soma na alta liquidez', async () => {
    mockPrisma.dashboardData.findMany.mockResolvedValue([{ value: 5000 }, { value: 2500 }]);

    const res = await GET(req());
    const data = await res.json();

    expect(data.indicadores.balanco.ativosAltaLiquidez).toBe(7500);
    const linha = data.composicao.altaLiquidez.find(
      (l: { chave: string }) => l.chave === 'caixaParaInvestir',
    );
    expect(linha?.valor).toBe(7500);
  });

  it('usuário vazio: 200, zeros e nada de NaN', async () => {
    mockGetMergedCashflowGroups.mockResolvedValue([]);
    mockPrisma.economicIndex.findFirst.mockResolvedValue(null);
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.indicadores.balanco.patrimonioLiquido).toBe(0);
    expect(data.indicadores.fluxo.rendaMensal).toBe(0);
    expect(data.fontes.inflacao).toBe('fallback');
    expect(JSON.stringify(data)).not.toContain('NaN');
  });

  it('acesso personificado é registrado', async () => {
    await GET(req());
    expect(mockLogSensitiveEndpointAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'user-1',
      null,
      '/api/saude-financeira',
      'GET',
    );
  });

  it('sem snapshot anterior: tendências null e upsert do mês corrente disparado', async () => {
    const res = await GET(req());
    const data = await res.json();

    expect(data.tendencias.patrimonioLiquido).toBeNull();
    expect(data.tendencias.rendaMensal).toBeNull();

    const now = new Date();
    expect(mockPrisma.saudeFinanceiraSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_year_month: {
            userId: 'user-1',
            year: now.getFullYear(),
            month: now.getMonth(),
          },
        },
      }),
    );
  });

  it('com snapshot de mês anterior: setas comparam o live com o último teste', async () => {
    // Live: renda 13000, gasto 9000, PL 0 (sem ativos/dívidas no default).
    mockPrisma.saudeFinanceiraSnapshot.findFirst.mockResolvedValue({
      data: {
        rendaMensal: 12000, // live 13000 → up
        gastoMensal: 9000, // igual → flat
        poupancaMensal: 3000,
        taxaPoupanca: 0.25,
        ativosAltaLiquidez: 0,
        ativosBaixaLiquidez: 0,
        passivosCurtoPrazo: 0,
        passivosLongoPrazo: 10000, // live 0 → down
        patrimonioLiquido: -10000, // live 0 → up
        reservaEmergencia: 0,
        mesesCobertura: null,
        grauIndependencia: null,
        status: 'ED',
      },
    });

    const res = await GET(req());
    const data = await res.json();

    expect(data.tendencias.rendaMensal).toBe('up');
    expect(data.tendencias.gastoMensal).toBe('flat');
    expect(data.tendencias.passivosTotal).toBe('down');
    expect(data.tendencias.patrimonioLiquido).toBe('up');
  });
});

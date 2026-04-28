import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
);

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn().mockResolvedValue([]) },
  stockTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  cashflowGroup: { findMany: vi.fn().mockResolvedValue([]) },
  fixedIncomeAsset: { findMany: vi.fn().mockResolvedValue([]) },
  economicIndex: { findMany: vi.fn().mockResolvedValue([]) },
}));

const mockBuildPatrimonio = vi.hoisted(() => vi.fn());
const mockFiPricer = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    buildValueSeriesForAsset: vi.fn(),
  }),
);
const mockComputeLiveTotals = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ saldoBruto: 0, valorAplicado: 0 }),
);
const mockGetAssetHistory = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/services/portfolio/patrimonioHistoricoBuilder', () => ({
  buildPatrimonioHistorico: mockBuildPatrimonio,
  filterInvestmentsExclReservas: (xs: unknown[]) => xs,
}));

vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: mockFiPricer,
}));

vi.mock('@/services/portfolio/portfolioLiveTotals', () => ({
  computePortfolioLiveTotals: mockComputeLiveTotals,
}));

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetHistory: mockGetAssetHistory,
}));

import { GET } from '../route';

const createRequest = () =>
  new NextRequest('http://localhost/api/analises/rentabilidade-janelas', { method: 'GET' });

describe('GET /api/analises/rentabilidade-janelas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    mockGetAssetHistory.mockResolvedValue([]);
  });

  it('retorna janelas zeradas quando não há histórico', async () => {
    mockBuildPatrimonio.mockResolvedValue({
      historicoPatrimonio: [],
      historicoTWR: [],
      historicoTWRPeriodo: [],
      cashFlowsByDay: new Map(),
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.janelas).toBeDefined();
    expect(data.janelas.fromBegin.portfolioReturn).toBe(0);
    expect(data.janelas.fromBegin.cdiReturn).toBe(0);
    expect(data.janelas.fromBegin.fromDate).toBeNull();
  });

  it('compõe rentabilidade entre dois pontos do TWR', async () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const um_ano_atras = now.getTime() - 365 * 86400000;
    const seis_meses = now.getTime() - 180 * 86400000;
    // TWR vai de 0% (1 ano atrás) → 5% (6m atrás) → 10% (hoje).
    // 12m: (1.10 / 1.0) - 1 = 10%
    // fromBegin = 12m (mesmo ponto inicial)
    mockBuildPatrimonio.mockResolvedValue({
      historicoPatrimonio: [],
      historicoTWR: [
        { data: um_ano_atras, value: 0 },
        { data: seis_meses, value: 5 },
        { data: now.getTime(), value: 10 },
      ],
      historicoTWRPeriodo: [],
      cashFlowsByDay: new Map(),
    });
    // CDI fictício: 1% ao mês, 12% lifetime aproximado.
    const cdiDaily: Array<{ date: Date; value: number }> = [];
    for (let i = 0; i < 365; i++) {
      cdiDaily.push({
        date: new Date(um_ano_atras + i * 86400000),
        value: 0.0003, // ~ 0.03% ao dia
      });
    }
    mockPrisma.economicIndex.findMany.mockResolvedValue(cdiDaily);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.janelas.in12Months.portfolioReturn).toBeCloseTo(10, 1);
    expect(data.janelas.in12Months.cdiReturn).toBeGreaterThan(0);
    expect(data.janelas.fromBegin.portfolioReturn).toBeCloseTo(10, 1);
    // excessOverCdi = portfolio − cdi
    expect(data.janelas.in12Months.excessOverCdi).toBeCloseTo(
      data.janelas.in12Months.portfolioReturn - data.janelas.in12Months.cdiReturn,
      1,
    );
  });

  it('clampa janelas que excedem o histórico ao primeiro ponto da série', async () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    // Apenas 2 meses de histórico — janela de 36m deve cair no primeiro ponto.
    const dois_meses = now.getTime() - 60 * 86400000;
    mockBuildPatrimonio.mockResolvedValue({
      historicoPatrimonio: [],
      historicoTWR: [
        { data: dois_meses, value: 0 },
        { data: now.getTime(), value: 5 },
      ],
      historicoTWRPeriodo: [],
      cashFlowsByDay: new Map(),
    });

    const response = await GET(createRequest());
    const data = await response.json();
    const dois_meses_iso = new Date(dois_meses).toISOString();

    // 36m e 24m e 12m devem todos clampar para o primeiro ponto disponível
    expect(data.janelas.in36Months.fromDate).toBe(dois_meses_iso);
    expect(data.janelas.in24Months.fromDate).toBe(dois_meses_iso);
    expect(data.janelas.in12Months.fromDate).toBe(dois_meses_iso);
    expect(data.janelas.fromBegin.fromDate).toBe(dois_meses_iso);
    // E todos devem render o mesmo retorno
    expect(data.janelas.in36Months.portfolioReturn).toBe(data.janelas.fromBegin.portfolioReturn);
  });

  it('lastDay olha 1 dia antes do último ponto', async () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const ontem = now.getTime() - 86400000;
    mockBuildPatrimonio.mockResolvedValue({
      historicoPatrimonio: [],
      historicoTWR: [
        { data: now.getTime() - 30 * 86400000, value: 0 },
        { data: ontem, value: 4 },
        { data: now.getTime(), value: 5 },
      ],
      historicoTWRPeriodo: [],
      cashFlowsByDay: new Map(),
    });

    const response = await GET(createRequest());
    const data = await response.json();

    // (1.05 / 1.04 - 1) * 100 ≈ 0.96%
    expect(data.janelas.lastDay.portfolioReturn).toBeCloseTo(0.96, 1);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });

  it('inclui ibovReturn, ipcaReturn e excessOverIbov por janela', async () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const um_ano_atras = now.getTime() - 365 * 86400000;
    mockBuildPatrimonio.mockResolvedValue({
      historicoPatrimonio: [],
      historicoTWR: [
        { data: um_ano_atras, value: 0 },
        { data: now.getTime(), value: 15 },
      ],
      historicoTWRPeriodo: [],
      cashFlowsByDay: new Map(),
    });
    // CDI 12m ≈ 12%; IPCA 12m ≈ 4%; IBOV cotação 100→110 = 10%.
    const cdiDaily = Array.from({ length: 365 }, (_, i) => ({
      date: new Date(um_ano_atras + i * 86400000),
      value: 0.0003,
    }));
    const ipcaDaily = Array.from({ length: 365 }, (_, i) => ({
      date: new Date(um_ano_atras + i * 86400000),
      value: 0.0001,
    }));
    mockPrisma.economicIndex.findMany.mockImplementation(
      async (args: { where: { indexType: string } }) => {
        if (args.where.indexType === 'CDI') return cdiDaily;
        if (args.where.indexType === 'IPCA') return ipcaDaily;
        return [];
      },
    );
    mockGetAssetHistory.mockResolvedValue([
      { date: um_ano_atras, value: 100 },
      { date: now.getTime(), value: 110 },
    ]);

    const response = await GET(createRequest());
    const data = await response.json();
    const j = data.janelas.in12Months;

    expect(j.portfolioReturn).toBeCloseTo(15, 1);
    expect(j.cdiReturn).toBeGreaterThan(0);
    expect(j.ipcaReturn).toBeGreaterThan(0);
    expect(j.ibovReturn).toBeCloseTo(10, 1);
    expect(j.excessOverCdi).toBeCloseTo(j.portfolioReturn - j.cdiReturn, 1);
    expect(j.excessOverIbov).toBeCloseTo(j.portfolioReturn - j.ibovReturn, 1);
  });

  it('zera ibov/ipca quando histórico do benchmark está vazio (não quebra)', async () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const um_ano_atras = now.getTime() - 365 * 86400000;
    mockBuildPatrimonio.mockResolvedValue({
      historicoPatrimonio: [],
      historicoTWR: [
        { data: um_ano_atras, value: 0 },
        { data: now.getTime(), value: 5 },
      ],
      historicoTWRPeriodo: [],
      cashFlowsByDay: new Map(),
    });
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    mockGetAssetHistory.mockResolvedValue([]);

    const response = await GET(createRequest());
    const data = await response.json();
    const j = data.janelas.in12Months;

    expect(j.portfolioReturn).toBeCloseTo(5, 1);
    expect(j.cdiReturn).toBe(0);
    expect(j.ipcaReturn).toBe(0);
    expect(j.ibovReturn).toBe(0);
    expect(j.excessOverCdi).toBeCloseTo(5, 1);
    expect(j.excessOverIbov).toBeCloseTo(5, 1);
  });
});

/**
 * Mover fase 2 (Reservas + Renda Fixa, MOVER_CAIXA_RF_HABILITADO): a pizza
 * (distribuição) segue a aba escolhida também no trio, sem mudar saldo bruto nem
 * valor aplicado. Chave desligada: tudo como antes. Sem código novo na rota
 * (valuatePortfolioItem → categoriaEfetiva, fatia 0); testes de integração.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn() },
  cashflowGroup: { findMany: vi.fn() },
  dashboardData: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  alocacaoConfig: { findMany: vi.fn() },
  asset: { findMany: vi.fn() },
  economicIndex: { findMany: vi.fn().mockResolvedValue([]) },
  tesouroDiretoPrice: { findMany: vi.fn().mockResolvedValue([]) },
  divida: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/services/market/marketIndicatorService', () => ({
  getIndicator: vi.fn().mockResolvedValue(null),
}));

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
  triggerLazyBackfill: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/services/portfolio/proventosByDay', () => ({
  loadProventosByDay: vi.fn().mockResolvedValue({ proventosByDay: new Map(), total: 0 }),
}));

import { GET } from '../route';
import { getAssetPrices } from '@/services/pricing/assetPriceService';

const createGetRequest = (params = '') =>
  new NextRequest(`http://localhost/api/carteira/resumo${params}`, {
    method: 'GET',
  });

type Linha = {
  id: string;
  assetId: string;
  quantity: number;
  avgPrice: number;
  totalInvested: number;
  categoriaOverride: string | null;
  asset: { symbol: string; type: string; currency: string; name: string };
};

const linha = (symbol: string, type: string, categoriaOverride: string | null, valor: number) => ({
  id: `p-${symbol}`,
  assetId: `a-${symbol}`,
  quantity: 1,
  avgPrice: valor,
  totalInvested: valor,
  categoriaOverride,
  asset: { symbol, type, currency: 'BRL', name: symbol },
});

const carteira = (o: { cdb?: string; res?: string; td?: string } = {}): Linha[] => [
  linha('RESERVA-EMERG-1', 'emergency', o.res ?? null, 10_000),
  linha('CDB-BANCO-X', 'bond', o.cdb ?? null, 2000),
  linha('TD-SELIC-2029', 'tesouro-direto', o.td ?? null, 3000),
];

const resumo = async (portfolio: Linha[]) => {
  mockPrisma.portfolio.findMany.mockResolvedValue(portfolio);
  const res = await GET(createGetRequest('?includeHistorico=false'));
  expect(res.status).toBe(200);
  return res.json();
};

const dist = (data: { distribuicao: Record<string, { valor: number }> }) => ({
  reservaEmergencia: data.distribuicao.reservaEmergencia.valor,
  reservaOportunidade: data.distribuicao.reservaOportunidade.valor,
  rendaFixaFundos: data.distribuicao.rendaFixaFundos.valor,
});

describe('GET /api/carteira/resumo — mover entre Reservas e Renda Fixa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Test User' });
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
    // Tesouro de catálogo comprado como Reserva de Emergência.
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 't1',
        type: 'compra',
        assetId: 'a-TD-SELIC-2029',
        date: new Date('2026-01-10'),
        quantity: 1,
        price: 3000,
        total: 3000,
        notes: JSON.stringify({ tesouroDestino: 'reserva-emergencia' }),
        asset: { symbol: 'TD-SELIC-2029', type: 'tesouro-direto' },
      },
    ]);
    mockPrisma.alocacaoConfig.findMany.mockResolvedValue([]);
    mockPrisma.asset.findMany.mockResolvedValue([]);
    mockPrisma.divida.findMany.mockResolvedValue([]);
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    vi.mocked(getAssetPrices).mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('chave ligada: cada item soma na aba nova; saldo e aplicado não mudam', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    const antes = await resumo(carteira());
    const depois = await resumo(
      carteira({ cdb: 'reservaEmergencia', res: 'reservaOportunidade', td: 'rendaFixaFundos' }),
    );

    expect(dist(antes)).toEqual({
      reservaEmergencia: 13_000,
      reservaOportunidade: 0,
      rendaFixaFundos: 2000,
    });
    expect(dist(depois)).toEqual({
      reservaEmergencia: 2000,
      reservaOportunidade: 10_000,
      rendaFixaFundos: 3000,
    });
    expect(depois.saldoBruto).toBeCloseTo(antes.saldoBruto);
    expect(depois.valorAplicado).toBeCloseTo(antes.valorAplicado);
  });

  it('chave desligada: overrides do trio ignorados — distribuição de antes', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
    const semMover = await resumo(carteira());
    const comOverrides = await resumo(
      carteira({ cdb: 'reservaEmergencia', res: 'reservaOportunidade', td: 'rendaFixaFundos' }),
    );

    expect(dist(comOverrides)).toEqual(dist(semMover));
    expect(dist(semMover).reservaEmergencia).toBe(13_000);
  });
});

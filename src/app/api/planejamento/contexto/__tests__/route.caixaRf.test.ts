/**
 * GET /api/planejamento/contexto com o mover entre Reservas e Renda Fixa (fase 2,
 * MOVER_CAIXA_RF_HABILITADO): a reserva de emergência atual sobe e desce com o
 * mover, e o item movido vale o mesmo que na Saúde (valuatePortfolioItem).
 * Chave desligada: número de antes e nenhum pricer carregado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { aggregate: vi.fn(), findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

const mockPricer = vi.hoisted(() => ({
  createFixedIncomePricer: vi.fn(),
  getCurrentValue: vi.fn(),
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/market/economicRates', () => ({
  DEFAULT_INFLACAO_AA: 4.5,
  getCdiAnualizado: vi.fn().mockResolvedValue(null),
  getInflacao12m: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: mockPricer.createFixedIncomePricer,
}));

import { GET } from '../route';
import { valuatePortfolioItem } from '@/services/portfolio/itemValuation';
import type { FixedIncomeAssetWithAsset } from '@/services/portfolio/patrimonioHistoricoBuilder';

const req = () => new NextRequest('http://localhost/api/planejamento/contexto');

const item = (
  assetId: string,
  asset: { type: string; symbol: string },
  categoriaOverride: string | null,
  valores: { totalInvested: number; quantity?: number; avgPrice?: number },
) => ({
  quantity: 0,
  avgPrice: 0,
  ...valores,
  assetId,
  planejamentoObjetivoId: null,
  vinculoAposentadoria: false,
  categoriaOverride,
  asset: { ...asset, currency: 'BRL', name: asset.symbol, currentPrice: null },
});

const fiCdb = {
  id: 'fi-cdb',
  assetId: 'a-cdb',
  type: 'CDB_POS',
  indexer: 'CDI',
  investedAmount: 5000,
  annualRate: 0,
  startDate: new Date('2025-01-02'),
  maturityDate: new Date('2030-01-02'),
  tesouroBondType: null,
} as unknown as FixedIncomeAssetWithAsset;

const reservaManual = item('a-res', { type: 'emergency', symbol: 'RESERVA-EMERG-1' }, null, {
  totalInvested: 10_000,
});
const reservaParaOport = item(
  'a-res2',
  { type: 'emergency', symbol: 'RESERVA-EMERG-2' },
  'reservaOportunidade',
  { totalInvested: 3000 },
);
const cdbParaEmerg = item('a-cdb', { type: 'bond', symbol: 'CDB-BANCO-X' }, 'reservaEmergencia', {
  totalInvested: 5000,
  quantity: 1,
  avgPrice: 5000,
});

const reservaAtual = async () => (await (await GET(req())).json()).reservaEmergenciaAtual;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.portfolio.aggregate.mockResolvedValue({ _sum: { totalInvested: 18_000 } });
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.portfolio.findMany.mockResolvedValue([reservaManual, reservaParaOport, cdbParaEmerg]);
  // Curva do CDB acima do investido → vale a curva (5.432,10), não o custo.
  mockPricer.getCurrentValue.mockReturnValue(5432.1);
  mockPricer.createFixedIncomePricer.mockResolvedValue({
    fixedIncomeByAssetId: new Map([['a-cdb', fiCdb]]),
    getCurrentValue: mockPricer.getCurrentValue,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/planejamento/contexto — mover entre Reservas e Renda Fixa', () => {
  it('chave ligada: o CDB movido entra pela curva e a reserva movida para a Oportunidade sai', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    expect(await reservaAtual()).toBe(15_432.1);
    expect(mockPricer.createFixedIncomePricer).toHaveBeenCalledWith('user-1');
  });

  it('o valor do item movido é o mesmo da Saúde (valuatePortfolioItem)', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    const { valorAtualBRL } = valuatePortfolioItem({
      item: cdbParaEmerg,
      asset: cdbParaEmerg.asset,
      fixedIncome: fiCdb,
      fiGetCurrentValue: mockPricer.getCurrentValue,
    });
    expect(await reservaAtual()).toBe(10_000 + valorAtualBRL);
  });

  it('sobe e desce com o mover: sem override, o CDB não conta e a reserva manual volta', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    mockPrisma.portfolio.findMany.mockResolvedValue([
      reservaManual,
      { ...reservaParaOport, categoriaOverride: null },
      { ...cdbParaEmerg, categoriaOverride: null },
    ]);
    expect(await reservaAtual()).toBe(13_000);
    expect(mockPricer.createFixedIncomePricer).not.toHaveBeenCalled();
  });

  it('Tesouro de catálogo segue fora (pergunta 8), mesmo movido para a RF', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    mockPrisma.portfolio.findMany.mockResolvedValue([
      reservaManual,
      item('a-td', { type: 'tesouro-direto', symbol: 'TD-SELIC-2029' }, 'rendaFixaFundos', {
        totalInvested: 7000,
      }),
    ]);
    expect(await reservaAtual()).toBe(10_000);
  });

  it('chave desligada: número de antes e nenhum pricer', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
    expect(await reservaAtual()).toBe(13_000);
    expect(mockPricer.createFixedIncomePricer).not.toHaveBeenCalled();
  });
});

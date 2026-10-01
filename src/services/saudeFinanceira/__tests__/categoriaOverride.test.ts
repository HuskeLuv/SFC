/**
 * Mover na Carteira (out/2026): a Saúde Financeira soma o item movido na
 * categoria da aba escolhida (via valuatePortfolioItem/categoriaEfetiva), sem
 * mudar o total de ativos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn().mockResolvedValue([]) },
  divida: { findMany: vi.fn().mockResolvedValue([]) },
  aposentadoriaPlano: { findUnique: vi.fn().mockResolvedValue(null) },
  dashboardData: { findMany: vi.fn().mockResolvedValue([]) },
  stockTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  portfolioPerformance: { findFirst: vi.fn().mockResolvedValue(null) },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(
    new Map([
      ['HGLG11', 160],
      ['KNRI11', 140],
      ['BOVA11', 120],
    ]),
  ),
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
vi.mock('@/services/portfolio/fixedIncomePricing', () => ({
  createFixedIncomePricer: vi.fn().mockResolvedValue({
    fixedIncomeByAssetId: new Map(),
    getCurrentValue: vi.fn().mockReturnValue(0),
  }),
}));
vi.mock('../saudeFinanceiraConfig', async () => {
  const { DEFAULT_SAUDE_CONFIG } = await import('../indicadores');
  return { getSaudeConfig: vi.fn().mockResolvedValue({ ...DEFAULT_SAUDE_CONFIG }) };
});

import { buildSaudeFinanceira } from '../saudeFinanceiraServer';

const linha = (symbol: string, type: string, categoriaOverride: string | null) => ({
  id: `p-${symbol}`,
  userId: 'user-1',
  assetId: `a-${symbol}`,
  quantity: 10,
  avgPrice: 100,
  totalInvested: 1000,
  categoriaOverride,
  asset: { symbol, type, currency: 'BRL', name: symbol },
});

const baixa = (payload: Awaited<ReturnType<typeof buildSaudeFinanceira>>) =>
  Object.fromEntries(payload.composicao.baixaLiquidez.map((l) => [l.chave, l.valor]));

describe('buildSaudeFinanceira — categoriaOverride', () => {
  beforeEach(() => {
    mockPrisma.portfolio.findMany.mockReset();
  });

  it('FII movido para Fundos sai de FIIs e entra em Fundos; o total não muda', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      linha('HGLG11', 'fii', null),
      linha('KNRI11', 'fii', null),
    ]);
    const antes = await buildSaudeFinanceira('user-1');

    mockPrisma.portfolio.findMany.mockResolvedValue([
      linha('HGLG11', 'fii', 'fimFia'),
      linha('KNRI11', 'fii', null),
    ]);
    const depois = await buildSaudeFinanceira('user-1');

    expect(baixa(antes).fiis).toBe(3000);
    expect(baixa(antes).fimFia).toBe(0);
    // Fundo sem prazo de resgate informado → baixa liquidez (mesma regra da aba).
    expect(baixa(depois).fimFia).toBe(1600);
    expect(baixa(depois).fiis).toBe(1400);
    expect(depois.indicadores.balanco.ativosTotal).toBeCloseTo(
      antes.indicadores.balanco.ativosTotal,
    );
    expect(depois.indicadores.balanco.ativosBaixaLiquidez).toBeCloseTo(3000);
  });

  it('ETF movido para Ações soma em Ações', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([linha('BOVA11', 'etf', 'acoes')]);
    const payload = await buildSaudeFinanceira('user-1');
    expect(baixa(payload).acoes).toBe(1200);
    expect(baixa(payload).etfs).toBe(0);
  });

  it('override igual à base não muda nada', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([linha('KNRI11', 'fii', 'fiis')]);
    const payload = await buildSaudeFinanceira('user-1');
    expect(baixa(payload).fiis).toBe(1400);
    expect(baixa(payload).fimFia).toBe(0);
  });
});

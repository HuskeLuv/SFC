/**
 * Mover fase 2 (Reservas + Renda Fixa, MOVER_CAIXA_RF_HABILITADO): a Saúde
 * Financeira segue a aba escolhida — porCategoria.reservaEmergencia (cobertura)
 * e a alta/baixa liquidez —, sem mudar o total de ativos. Chave desligada: tudo
 * como antes. Sem mudança de código no servidor (valuatePortfolioItem →
 * categoriaEfetiva, fatia 0); estes são os testes de integração.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  getAssetPrices: vi.fn().mockResolvedValue(new Map()),
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

const linha = (
  symbol: string,
  type: string,
  categoriaOverride: string | null,
  valor: number,
): Record<string, unknown> => ({
  id: `p-${symbol}`,
  userId: 'user-1',
  assetId: `a-${symbol}`,
  quantity: 1,
  avgPrice: valor,
  totalInvested: valor,
  categoriaOverride,
  asset: { symbol, type, currency: 'BRL', name: symbol },
});

const alta = (payload: Awaited<ReturnType<typeof buildSaudeFinanceira>>) =>
  Object.fromEntries(payload.composicao.altaLiquidez.map((l) => [l.chave, l.valor]));
const baixa = (payload: Awaited<ReturnType<typeof buildSaudeFinanceira>>) =>
  Object.fromEntries(payload.composicao.baixaLiquidez.map((l) => [l.chave, l.valor]));

const carteira = (overrides: { cdb?: string | null; res?: string | null; td?: string | null }) => [
  linha('RESERVA-EMERG-1', 'emergency', overrides.res ?? null, 10_000),
  // CDB sem FI: hoje cai em "Renda Fixa acima de D+360" (sem prazo informado).
  linha('CDB-BANCO-X', 'bond', overrides.cdb ?? null, 2000),
  // Tesouro de catálogo comprado como Reserva de Emergência (notes da compra).
  linha('TD-SELIC-2029', 'tesouro-direto', overrides.td ?? null, 3000),
];

beforeEach(() => {
  mockPrisma.portfolio.findMany.mockReset();
  mockPrisma.stockTransaction.findMany.mockResolvedValue([
    {
      assetId: 'a-TD-SELIC-2029',
      notes: JSON.stringify({ tesouroDestino: 'reserva-emergencia' }),
    },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildSaudeFinanceira — mover entre Reservas e Renda Fixa', () => {
  it('chave ligada: CDB movido para a Emergência conta na cobertura e vira alta liquidez', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    mockPrisma.portfolio.findMany.mockResolvedValue(carteira({}));
    const antes = await buildSaudeFinanceira('user-1');
    mockPrisma.portfolio.findMany.mockResolvedValue(carteira({ cdb: 'reservaEmergencia' }));
    const depois = await buildSaudeFinanceira('user-1');

    expect(alta(antes).reservaEmergencia).toBe(13_000);
    expect(baixa(antes).rendaFixaBaixaLiquidez).toBe(2000);
    expect(alta(depois).reservaEmergencia).toBe(15_000);
    expect(baixa(depois).rendaFixaBaixaLiquidez).toBe(0);
    expect(depois.indicadores.balanco.ativosAltaLiquidez).toBeCloseTo(
      antes.indicadores.balanco.ativosAltaLiquidez + 2000,
    );
    expect(depois.indicadores.balanco.ativosTotal).toBeCloseTo(
      antes.indicadores.balanco.ativosTotal,
    );
  });

  it('chave ligada: reserva movida para a Oportunidade reduz a cobertura (total igual)', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    mockPrisma.portfolio.findMany.mockResolvedValue(carteira({ res: 'reservaOportunidade' }));
    const payload = await buildSaudeFinanceira('user-1');

    expect(alta(payload).reservaEmergencia).toBe(3000);
    expect(alta(payload).reservaOportunidade).toBe(10_000);
  });

  it('chave ligada: Tesouro de reserva movido para a RF sai da cobertura e vai para RF até D+360', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    mockPrisma.portfolio.findMany.mockResolvedValue(carteira({ td: 'rendaFixaFundos' }));
    const payload = await buildSaudeFinanceira('user-1');

    expect(alta(payload).reservaEmergencia).toBe(10_000);
    expect(alta(payload).rendaFixaAltaLiquidez).toBe(3000);
  });

  it('chave desligada: overrides do trio ignorados — números de antes', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
    mockPrisma.portfolio.findMany.mockResolvedValue(carteira({}));
    const semMover = await buildSaudeFinanceira('user-1');
    mockPrisma.portfolio.findMany.mockResolvedValue(
      carteira({ cdb: 'reservaEmergencia', res: 'reservaOportunidade', td: 'rendaFixaFundos' }),
    );
    const comOverrides = await buildSaudeFinanceira('user-1');

    expect(alta(comOverrides)).toEqual(alta(semMover));
    expect(baixa(comOverrides)).toEqual(baixa(semMover));
    expect(alta(comOverrides).reservaEmergencia).toBe(13_000);
  });
});

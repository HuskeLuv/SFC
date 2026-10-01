/**
 * Regressão do mover na Carteira (out/2026): a Pluggy não toca nas colunas do
 * mover. Reimportar/sincronizar uma posição que o usuário moveu de aba (ou de
 * seção) preserva categoriaOverride, tipoFii e tipoFundo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => {
  const tx = {
    asset: { create: vi.fn() },
    stockTransaction: { create: vi.fn() },
    portfolio: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    fixedIncomeAsset: { create: vi.fn() },
  };
  return {
    tx,
    asset: { findFirst: vi.fn(), updateMany: vi.fn() },
    portfolio: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    fiiTickerMap: { findFirst: vi.fn() },
    fiiMonthly: { findFirst: vi.fn() },
    bankInvestment: { update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    pluggyImportacaoOrigem: { findUnique: vi.fn(), upsert: vi.fn() },
    bankLoan: { update: vi.fn(), findMany: vi.fn() },
    divida: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    dividaPagamento: { createMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
});
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
const mockRecalc = vi.hoisted(() => vi.fn());
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: mockRecalc,
}));
vi.mock('@/services/dividas/dividaCashflowSync', () => ({
  syncDividaRecordToCashflow: vi.fn(),
}));
vi.mock('@/lib/simpleTtlCache', () => ({ deleteTtlCacheKeyPrefix: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { atualizarImportados, importarInvestimento } from '../importarCarteira';

const base = {
  id: 'bi-1',
  connectionId: 'conn-1',
  userId: 'user-1',
  providerInvestmentId: '44feccaf-0000-4000-8000-000000000000',
  isin: null,
  number: null,
  balance: 1300,
  quantity: 10,
  unitValue: null,
  amountOriginal: 1200,
  amountProfit: 0,
  rate: null,
  rateType: null,
  fixedAnnualRate: null,
  issueDate: new Date('2026-01-10T00:00:00Z'),
  dueDate: null,
  issuer: null,
  status: 'ACTIVE',
  providerDate: new Date(),
  ativo: true,
  assetId: null,
  portfolioId: null,
  fixedIncomeAssetId: null,
  importStatus: 'pendente',
  importError: null,
  importedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const escritasEmPortfolio = () => [
  mockPrisma.portfolio.update,
  mockPrisma.portfolio.updateMany,
  mockPrisma.portfolio.upsert,
  mockPrisma.tx.portfolio.create,
  mockPrisma.tx.portfolio.update,
  mockPrisma.tx.portfolio.updateMany,
  mockPrisma.tx.portfolio.upsert,
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.bankInvestment.update.mockResolvedValue({});
  mockPrisma.fiiTickerMap.findFirst.mockResolvedValue(null);
  mockPrisma.fiiMonthly.findFirst.mockResolvedValue(null);
});

describe('Pluggy × mover na Carteira', () => {
  it('reimportar um FII movido para Fundos só vincula: override, tipoFii e tipoFundo intactos', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue({
      id: 'asset-kdif',
      symbol: 'KDIF11',
      name: 'Kinea Infra',
      type: 'fii',
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'port-kdif',
      userId: 'user-1',
      assetId: 'asset-kdif',
      categoriaOverride: 'fimFia',
      tipoFii: 'tvm',
      tipoFundo: 'fip-infra',
    });

    const st = await importarInvestimento({
      ...base,
      type: 'EQUITY',
      subtype: 'REAL_ESTATE_FUND',
      name: 'KDIF11',
      code: 'KDIF11',
    } as Parameters<typeof importarInvestimento>[0]);

    expect(st).toBe('vinculado');
    for (const escrita of escritasEmPortfolio()) expect(escrita).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRecalc).not.toHaveBeenCalled();
    // A seção importada (tipoFiiImportado) nem é consultada: a do usuário vale.
    expect(mockPrisma.fiiTickerMap.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.bankInvestment.update).toHaveBeenCalledWith({
      where: { id: 'bi-1' },
      data: expect.objectContaining({ importStatus: 'vinculado', portfolioId: 'port-kdif' }),
    });
  });

  it('sincronizar importados atualiza só o preço do ativo, nunca a posição', async () => {
    mockPrisma.bankInvestment.findMany.mockResolvedValue([
      { assetId: 'asset-fundo', balance: 1500, quantity: 10 },
    ]);
    mockPrisma.bankLoan.findMany.mockResolvedValue([]);
    mockPrisma.asset.updateMany.mockResolvedValue({ count: 1 });

    await atualizarImportados('user-1');

    expect(mockPrisma.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 'asset-fundo', source: 'pluggy' },
      data: expect.objectContaining({ currentPrice: 150 }),
    });
    for (const escrita of escritasEmPortfolio()) expect(escrita).not.toHaveBeenCalled();
  });
});

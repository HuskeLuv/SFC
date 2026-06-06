import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn(), deleteMany: vi.fn() },
  fixedIncomeAsset: { deleteMany: vi.fn(), updateMany: vi.fn() },
  portfolio: { update: vi.fn(), delete: vi.fn() },
  portfolioDailySnapshot: { deleteMany: vi.fn() },
  portfolioPerformance: { deleteMany: vi.fn() },
  asset: { findUnique: vi.fn(), update: vi.fn() },
  assetCorporateAction: { findMany: vi.fn() },
}));

const mockDeleteTtlCache = vi.hoisted(() => vi.fn());
const mockEnsureCA = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/simpleTtlCache', () => ({ deleteTtlCacheKeyPrefix: mockDeleteTtlCache }));
vi.mock('@/services/pricing/dividendService', () => ({
  ensureCorporateActionsSynced: mockEnsureCA,
}));

import { recalculatePortfolioFromTransactions } from '../portfolioRecalculation';

const userId = 'user-1';
const portfolioId = 'pf-1';

const tx = (
  overrides: Partial<{
    type: string;
    quantity: number;
    price: number;
    total: number;
    date: Date;
  }> = {},
) => ({
  type: 'compra',
  quantity: 10,
  price: 30,
  total: 300,
  date: new Date('2024-01-15'),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.stockTransaction.findMany.mockResolvedValue([tx()]);
  mockPrisma.fixedIncomeAsset.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.fixedIncomeAsset.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.portfolio.update.mockResolvedValue({});
  mockPrisma.portfolio.delete.mockResolvedValue({});
  mockPrisma.portfolioDailySnapshot.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.portfolioPerformance.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.asset.findUnique.mockResolvedValue(null);
  mockPrisma.asset.update.mockResolvedValue({});
  mockPrisma.stockTransaction.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.assetCorporateAction.findMany.mockResolvedValue([]);
  mockEnsureCA.mockResolvedValue(undefined);
});

describe('recalculatePortfolioFromTransactions', () => {
  it('recomputa quantidade e preço médio sobre todas as transações', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ quantity: 10, price: 20, total: 200 }),
      tx({ quantity: 10, price: 30, total: 300 }),
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: userId,
      assetId: 'asset-1',
      stockId: null,
      portfolioId,
    });

    expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
      where: { id: portfolioId },
      data: expect.objectContaining({
        quantity: 20,
        avgPrice: 25,
        totalInvested: 500,
      }),
    });
  });

  it('venda remove custo proporcional (não a receita)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ type: 'compra', quantity: 10, price: 20, total: 200 }),
      tx({ type: 'venda', quantity: 5, price: 40, total: 200 }), // vende metade
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: userId,
      assetId: 'asset-1',
      stockId: null,
      portfolioId,
    });

    const updateCall = mockPrisma.portfolio.update.mock.calls[0]?.[0];
    expect(updateCall?.data.quantity).toBe(5);
    expect(updateCall?.data.avgPrice).toBe(20); // preserva avg, não usa preço de venda
    expect(updateCall?.data.totalInvested).toBe(100);
  });

  it('deleta Portfolio + FixedIncomeAsset quando todas as transações somem', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    await recalculatePortfolioFromTransactions({
      targetUserId: userId,
      assetId: 'asset-1',
      stockId: null,
      portfolioId,
    });

    expect(mockPrisma.fixedIncomeAsset.deleteMany).toHaveBeenCalledWith({
      where: { userId, assetId: 'asset-1' },
    });
    expect(mockPrisma.portfolio.delete).toHaveBeenCalledWith({ where: { id: portfolioId } });
  });

  // Part B: eventos corporativos não dependem mais do cron — o recálculo
  // garante os dados on-demand e aplica o fator no ato.
  it('sincroniza eventos corporativos on-demand e aplica o fator (split 2:1)', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({ symbol: 'MGLU3', type: 'stock' });
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      { date: new Date('2024-04-01'), type: 'DESDOBRAMENTO', factor: 2 },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ quantity: 10, price: 30, total: 300, date: new Date('2024-01-15') }),
    ]);

    await recalculatePortfolioFromTransactions({
      targetUserId: userId,
      assetId: 'asset-1',
      portfolioId,
    });

    // fetch on-demand disparado com (symbol, type)
    expect(mockEnsureCA).toHaveBeenCalledWith('MGLU3', 'stock');
    // split 2:1 aplicado: 10 -> 20 cotas, custo preservado, avg cai pela metade
    const updateCall = mockPrisma.portfolio.update.mock.calls[0]?.[0];
    expect(updateCall?.data.quantity).toBe(20);
    expect(updateCall?.data.totalInvested).toBe(300);
    expect(updateCall?.data.avgPrice).toBe(15);
  });

  it('não dispara sync de eventos quando o ativo não tem symbol (renda-fixa)', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue({ symbol: null, type: 'tesouro-direto' });

    await recalculatePortfolioFromTransactions({
      targetUserId: userId,
      assetId: 'asset-1',
      portfolioId,
    });

    expect(mockEnsureCA).not.toHaveBeenCalled();
  });

  // Bug #02: invalidação de snapshots/cache na edição
  describe('Bug #02 — invalidação de snapshots após edição', () => {
    it('não toca em snapshots quando recomputeSnapshotsFrom não é passado', async () => {
      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
      });

      expect(mockPrisma.portfolioDailySnapshot.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.portfolioPerformance.deleteMany).not.toHaveBeenCalled();
      expect(mockDeleteTtlCache).not.toHaveBeenCalled();
    });

    it('apaga snapshots e performance >= cutoff quando recomputeSnapshotsFrom passa', async () => {
      const cutoff = new Date('2025-06-15T14:00:00Z');

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
        recomputeSnapshotsFrom: cutoff,
      });

      expect(mockPrisma.portfolioDailySnapshot.deleteMany).toHaveBeenCalledWith({
        where: { userId, date: { gte: expect.any(Date) } },
      });
      expect(mockPrisma.portfolioPerformance.deleteMany).toHaveBeenCalledWith({
        where: { userId, date: { gte: expect.any(Date) } },
      });
      // cutoff é normalizado para UTC midnight do dia da edição
      const snapshotArg = mockPrisma.portfolioDailySnapshot.deleteMany.mock.calls[0]?.[0];
      const gteDate = snapshotArg?.where?.date?.gte as Date;
      expect(gteDate.getUTCHours()).toBe(0);
      expect(gteDate.getUTCMinutes()).toBe(0);
      expect(gteDate.toISOString().slice(0, 10)).toBe('2025-06-15');
    });

    it('invalida cache TTL carteiraResumo do usuário', async () => {
      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
        recomputeSnapshotsFrom: new Date('2025-06-15'),
      });

      expect(mockDeleteTtlCache).toHaveBeenCalledWith('carteiraResumo', `${userId}:`);
    });

    it('invalida snapshots mesmo quando carteira esvazia (todas transações removidas)', async () => {
      mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
        recomputeSnapshotsFrom: new Date('2025-06-15'),
      });

      expect(mockPrisma.portfolioDailySnapshot.deleteMany).toHaveBeenCalled();
      expect(mockDeleteTtlCache).toHaveBeenCalledWith('carteiraResumo', `${userId}:`);
    });
  });

  // Bug #04: sincronia de FixedIncomeAsset.startDate e Asset.name com a primeira compra
  describe('Bug #04 — sincronia de RF startDate e Asset.name', () => {
    it('atualiza FixedIncomeAsset.startDate com a data da primeira compra', async () => {
      const novaData = new Date('2022-05-02');
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        tx({ date: novaData, quantity: 1, price: 5000, total: 5000 }),
      ]);

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
      });

      expect(mockPrisma.fixedIncomeAsset.updateMany).toHaveBeenCalledWith({
        where: { userId, assetId: 'asset-1' },
        data: expect.objectContaining({ startDate: novaData, investedAmount: 5000 }),
      });
    });

    it('regenera Asset.name quando casa o template "X - R$ Y - dd/mm/aaaa"', async () => {
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        tx({ date: new Date('2022-05-02'), quantity: 1, price: 5000, total: 5000 }),
      ]);
      mockPrisma.asset.findUnique.mockResolvedValue({
        name: 'CDB Reserva de Emergência - R$ 1.000 - 01/05/2019',
      });

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
      });

      expect(mockPrisma.asset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { name: expect.stringContaining('CDB Reserva de Emergência') },
      });
      const updateCall = mockPrisma.asset.update.mock.calls[0]?.[0];
      const novoNome = updateCall?.data?.name as string;
      expect(novoNome).toMatch(/02\/05\/2022/);
      // Intl.NumberFormat usa NBSP ( ) entre "R$" e o valor
      expect(novoNome).toMatch(/R\$\s5\.000/);
      expect(novoNome).not.toMatch(/01\/05\/2019/);
    });

    it('NÃO modifica Asset.name customizado (fora do padrão template)', async () => {
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        tx({ date: new Date('2022-05-02'), quantity: 1, price: 5000, total: 5000 }),
      ]);
      mockPrisma.asset.findUnique.mockResolvedValue({
        name: 'Meu CDB favorito',
      });

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
      });

      expect(mockPrisma.asset.update).not.toHaveBeenCalled();
    });

    it('não toca em Asset.name quando não há ativo (asset.findUnique=null)', async () => {
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        tx({ date: new Date('2022-05-02') }),
      ]);
      mockPrisma.asset.findUnique.mockResolvedValue(null);

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
      });

      expect(mockPrisma.asset.update).not.toHaveBeenCalled();
    });

    it('quando só há vendas (sem compra), não tenta sincronizar startDate', async () => {
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        tx({ type: 'venda', date: new Date('2022-05-02') }),
      ]);

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        stockId: null,
        portfolioId,
      });

      // Deve usar fallback que NÃO inclui startDate (só investedAmount)
      expect(mockPrisma.fixedIncomeAsset.updateMany).toHaveBeenCalledWith({
        where: { userId, assetId: 'asset-1' },
        data: { investedAmount: 0 },
      });
    });
  });

  describe('eventos corporativos (ciente de fator)', () => {
    beforeEach(() => {
      mockPrisma.asset.findUnique.mockResolvedValue({ symbol: 'PETR4' });
    });

    it('split 2:1 dobra a quantidade e divide o preço médio (custo intacto)', async () => {
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        tx({ type: 'compra', quantity: 100, price: 28, total: 2800, date: new Date('2024-01-10') }),
      ]);
      mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
        { date: new Date('2024-06-01'), type: 'DESDOBRAMENTO', factor: 2 },
      ]);

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        portfolioId,
      });

      const data = mockPrisma.portfolio.update.mock.calls[0][0].data;
      expect(data.quantity).toBeCloseTo(200, 6);
      expect(data.avgPrice).toBeCloseTo(14, 6);
      expect(data.totalInvested).toBeCloseTo(2800, 6);
    });

    it('é robusto a edição: editar a compra 100→200 com split 2:1 dá 400 (não 300)', async () => {
      // Reproduz o bug do delta congelado. Mesmo havendo uma linha de auditoria
      // antiga (+100), ela é ignorada e o fator é reaplicado sobre 200.
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        tx({ type: 'compra', quantity: 200, price: 28, total: 5600, date: new Date('2024-01-10') }),
        {
          type: 'compra',
          quantity: 100, // delta congelado antigo
          price: 0,
          total: 0,
          date: new Date('2024-06-01'),
          notes: '{"operation":{"action":"ajuste-corporativo"},"corporateActionId":"ca-1"}',
        },
      ]);
      mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
        { date: new Date('2024-06-01'), type: 'DESDOBRAMENTO', factor: 2 },
      ]);

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        portfolioId,
      });

      const data = mockPrisma.portfolio.update.mock.calls[0][0].data;
      expect(data.quantity).toBeCloseTo(400, 6);
      expect(data.avgPrice).toBeCloseTo(14, 6);
    });

    it('não aplica evento anterior à compra (papel comprado já ajustado)', async () => {
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        tx({ type: 'compra', quantity: 100, price: 14, total: 1400, date: new Date('2025-01-10') }),
      ]);
      mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
        { date: new Date('2024-06-01'), type: 'DESDOBRAMENTO', factor: 2 }, // antes da compra
      ]);

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        portfolioId,
      });

      const data = mockPrisma.portfolio.update.mock.calls[0][0].data;
      expect(data.quantity).toBeCloseTo(100, 6);
      expect(data.avgPrice).toBeCloseTo(14, 6);
    });

    it('deleta o portfolio quando só restam linhas de auditoria (sem transação real)', async () => {
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        {
          type: 'compra',
          quantity: 100,
          price: 0,
          total: 0,
          date: new Date('2024-06-01'),
          notes: '{"corporateActionId":"ca-1"}',
        },
      ]);

      await recalculatePortfolioFromTransactions({
        targetUserId: userId,
        assetId: 'asset-1',
        portfolioId,
      });

      expect(mockPrisma.stockTransaction.deleteMany).toHaveBeenCalledWith({
        where: { userId, assetId: 'asset-1' },
      });
      expect(mockPrisma.portfolio.delete).toHaveBeenCalledWith({ where: { id: portfolioId } });
    });
  });
});

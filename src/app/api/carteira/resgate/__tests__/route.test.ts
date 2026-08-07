import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const mockPrisma = vi.hoisted(() => {
  const base = {
    // Histórico de alterações (recordChange importa prisma como default export).
    userChangeLog: { create: vi.fn() },
    portfolio: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    stockTransaction: { create: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    fixedIncomeAsset: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    // rota usa $transaction interativo — no mock, roda o callback com o próprio mock
    $transaction: vi.fn(),
  };
  base.$transaction.mockImplementation((fn: (tx: typeof base) => unknown) => fn(base));
  return base;
});

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));

const mockRecalc = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  invalidatePortfolioSnapshots: vi.fn().mockResolvedValue(undefined),
  recalculatePortfolioFromTransactions: mockRecalc,
}));

const mockSyncSonho = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: mockSyncSonho,
}));

const createRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/resgate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('POST /api/carteira/resgate', () => {
  const mockPortfolioAcao = {
    id: 'port-1',
    userId: 'user-123',
    quantity: 100,
    totalInvested: 1000,
    avgPrice: 10,
    stockId: 'stock-1',
    assetId: null,
    stock: { ticker: 'PETR4', companyName: 'Petrobras' },
    asset: null,
  };

  const mockPortfolioCrypto = {
    id: 'port-crypto',
    userId: 'user-123',
    quantity: 0.5,
    totalInvested: 50000,
    avgPrice: 100000,
    stockId: null,
    assetId: 'asset-btc',
    stock: null,
    asset: { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', currency: 'USD' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioAcao);
    mockPrisma.portfolio.update.mockResolvedValue({});
    mockPrisma.portfolio.delete.mockResolvedValue({});
    mockPrisma.stockTransaction.create.mockImplementation((args: { data: object }) =>
      Promise.resolve({ id: 'tx-1', ...args.data } as object),
    );
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);
  });

  describe('Validações obrigatórias', () => {
    it('retorna 400 quando portfolioId está ausente', async () => {
      const response = await POST(
        createRequest({
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('portfolioId');
    });

    it('retorna 400 quando dataResgate está ausente', async () => {
      const response = await POST(
        createRequest({
          portfolioId: 'port-1',
          metodoResgate: 'quantidade',
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('dataResgate');
    });

    it('retorna 400 quando metodoResgate está ausente', async () => {
      const response = await POST(
        createRequest({
          portfolioId: 'port-1',
          dataResgate: '2024-01-15',
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('metodoResgate');
    });

    it('retorna 404 quando portfolio não existe', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(null);
      const response = await POST(
        createRequest({
          portfolioId: 'port-inexistente',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.error).toContain('não encontrado');
    });
  });

  describe('Resgate por quantidade', () => {
    it('realiza resgate por quantidade com sucesso (ações)', async () => {
      const response = await POST(
        createRequest({
          portfolioId: 'port-1',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.transacao).toBeDefined();
      expect(data.transacao.type).toBe('venda');
      expect(data.transacao.quantity).toBe(10);
      expect(data.transacao.price).toBe(32.5);
      expect(mockPrisma.portfolio.update).toHaveBeenCalled();
    });

    it('retorna 400 quando quantidade é maior que disponível', async () => {
      const response = await POST(
        createRequest({
          portfolioId: 'port-1',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 150,
          cotacaoUnitaria: 32.5,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('Quantidade maior');
    });

    it('retorna 400 quando cotação unitária é inválida', async () => {
      const response = await POST(
        createRequest({
          portfolioId: 'port-1',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 10,
          cotacaoUnitaria: 0,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('Cotação');
    });
  });

  describe('Resgate por valor', () => {
    it('realiza resgate por valor com sucesso (quantidade 1)', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        ...mockPortfolioAcao,
        quantity: 1,
        totalInvested: 1000,
        avgPrice: 1000,
      });

      const response = await POST(
        createRequest({
          portfolioId: 'port-1',
          dataResgate: '2024-01-15',
          metodoResgate: 'valor',
          valorResgate: 1000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.transacao.quantity).toBe(1);
      expect(data.transacao.price).toBe(1000);
    });

    it('permite resgate por valor ACIMA do custo (rendimento) e encerra a posição', async () => {
      // Auditoria 2026-08-06 achado #10: o teto era o CUSTO (totalInvested) —
      // um CDB de 10k que rendeu para 12,4k não podia ser resgatado integralmente.
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        ...mockPortfolioAcao,
        id: 'port-cdb',
        assetId: 'asset-cdb',
        asset: { symbol: 'RENDA-FIXA-1', name: 'CDB', type: 'bond' },
        quantity: 1,
        totalInvested: 10000,
        avgPrice: 10000,
      });
      const response = await POST(
        createRequest({
          portfolioId: 'port-cdb',
          dataResgate: '2024-01-15',
          metodoResgate: 'valor',
          valorResgate: 12400,
        }),
      );
      expect(response.status).toBe(201);
      // consome a base toda → posição encerrada
      expect(mockPrisma.portfolio.delete).toHaveBeenCalledWith({ where: { id: 'port-cdb' } });
    });

    it('retorna 400 quando resgate por valor com quantidade fracionária (< 1)', async () => {
      // Auditoria 2026-08-06 achado #2: com qty 0,5 o guard antigo (> 1) passava,
      // quantityResgate virava 1, novaQuantidade ficava negativa e a rota caía no
      // ramo de resgate TOTAL — resgatar R$100 deletava a posição inteira.
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioCrypto);
      const response = await POST(
        createRequest({
          portfolioId: 'port-crypto',
          dataResgate: '2024-01-15',
          metodoResgate: 'valor',
          valorResgate: 100,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('quantidade 1');
      expect(mockPrisma.portfolio.delete).not.toHaveBeenCalled();
    });

    it('retorna 400 quando resgate por valor com quantidade > 1', async () => {
      const response = await POST(
        createRequest({
          portfolioId: 'port-1',
          dataResgate: '2024-01-15',
          metodoResgate: 'valor',
          valorResgate: 500,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('quantidade 1');
    });
  });

  describe('Vínculo com sonho (auditoria 2026-08-06, achado #8)', () => {
    it('resgate TOTAL de ativo vinculado sincroniza o sonho pelo objetivoId capturado antes do delete', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        ...mockPortfolioCrypto,
        planejamentoObjetivoId: 'obj-sonho-1',
      });
      const response = await POST(
        createRequest({
          portfolioId: 'port-crypto',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 0.5, // tudo → delete do Portfolio (onde mora o vínculo)
          cotacaoUnitaria: 100000,
        }),
      );
      expect(response.status).toBe(201);
      expect(mockPrisma.portfolio.delete).toHaveBeenCalled();
      // resolver por assetId pós-delete faria early-return silencioso
      expect(mockSyncSonho).toHaveBeenCalledWith('user-123', { objetivoId: 'obj-sonho-1' });
    });

    it('sem vínculo, sincroniza por assetId como antes', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioCrypto);
      await POST(
        createRequest({
          portfolioId: 'port-crypto',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 0.1,
          cotacaoUnitaria: 100000,
        }),
      );
      expect(mockSyncSonho).toHaveBeenCalledWith('user-123', { assetId: 'asset-btc' });
    });
  });

  describe('Validação de data (auditoria 2026-08-06, achado #7)', () => {
    it('rejeita data futura', async () => {
      const response = await POST(
        createRequest({
          portfolioId: 'port-1',
          dataResgate: '2099-01-01',
          metodoResgate: 'quantidade',
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('futura');
    });

    it('rejeita data anterior à primeira compra do ativo', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        ...mockPortfolioCrypto,
        quantity: 2,
        totalInvested: 200000,
      });
      // findFirst do stockTransaction: 1ª chamada = primeira compra (asc)
      mockPrisma.stockTransaction.findFirst.mockResolvedValue({
        date: new Date('2024-06-01T00:00:00Z'),
      });
      const response = await POST(
        createRequest({
          portfolioId: 'port-crypto',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 1,
          cotacaoUnitaria: 100000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('anterior à primeira compra');
      expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('Resgate de criptoativos', () => {
    // Auditoria 2026-08-06 achado #3: cripto/fundos/moedas/opções são share-based —
    // a venda parcial recalcula pela source of truth (custo proporcional), não pelo
    // cálculo inline que subtraía a RECEITA da venda do custo (2 BTC custo 200k,
    // vende 1 por 300k → totalInvested 0, avgPrice 0).
    it('venda parcial de crypto roteia pelo recalc (não usa cálculo inline)', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        ...mockPortfolioCrypto,
        quantity: 2,
        totalInvested: 200000,
      });
      const response = await POST(
        createRequest({
          portfolioId: 'port-crypto',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 1,
          cotacaoUnitaria: 300000,
        }),
      );
      expect(response.status).toBe(201);
      expect(mockRecalc).toHaveBeenCalledWith(
        expect.objectContaining({ targetUserId: 'user-123', assetId: 'asset-btc' }),
      );
      expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    });

    it('venda parcial de fundo CVM com cotas também roteia pelo recalc', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        id: 'port-fundo',
        userId: 'user-123',
        quantity: 812.5,
        totalInvested: 5000,
        avgPrice: 6.1538,
        stockId: null,
        assetId: 'asset-fundo',
        stock: null,
        asset: { symbol: '12.345.678/0001-00', name: 'Fundo Multi', type: 'fia' },
      });
      const response = await POST(
        createRequest({
          portfolioId: 'port-fundo',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 100,
          cotacaoUnitaria: 8,
        }),
      );
      expect(response.status).toBe(201);
      expect(mockRecalc).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'asset-fundo' }));
      expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    });

    it('realiza resgate por quantidade de crypto com sucesso', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioCrypto);

      const response = await POST(
        createRequest({
          portfolioId: 'port-crypto',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 0.1,
          cotacaoUnitaria: 100000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.transacao.type).toBe('venda');
      expect(data.transacao.quantity).toBe(0.1);
      expect(data.transacao.price).toBe(100000);
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assetId: 'asset-btc',
            type: 'venda',
            quantity: 0.1,
            price: 100000,
          }),
        }),
      );
    });

    it('exclui portfolio quando resgate total de crypto', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioCrypto);

      const response = await POST(
        createRequest({
          portfolioId: 'port-crypto',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 0.5,
          cotacaoUnitaria: 100000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.portfolio.delete).toHaveBeenCalledWith({
        where: { id: 'port-crypto' },
      });
    });
  });

  // Opção 3 / eventos corporativos: venda parcial de ação share-based recalcula
  // pela source of truth (aplica eventos e custo proporcional correto).
  describe('Ativo share-based (ação) recalcula na venda', () => {
    const mockPortfolioStock = {
      id: 'port-stk',
      userId: 'user-123',
      quantity: 100,
      totalInvested: 1000,
      avgPrice: 10,
      stockId: null,
      assetId: 'asset-stk',
      stock: null,
      asset: { symbol: 'PETR4', name: 'Petrobras', type: 'stock' },
    };

    it('venda parcial roteia pelo recalc (não usa cálculo inline)', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioStock);
      const response = await POST(
        createRequest({
          portfolioId: 'port-stk',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 40,
          cotacaoUnitaria: 30,
        }),
      );
      expect(response.status).toBe(201);
      expect(mockRecalc).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: 'user-123',
          assetId: 'asset-stk',
          portfolioId: 'port-stk',
        }),
      );
      expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    });

    it('venda total deleta a posição (sem recalc)', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioStock);
      const response = await POST(
        createRequest({
          portfolioId: 'port-stk',
          dataResgate: '2024-01-15',
          metodoResgate: 'quantidade',
          quantidade: 100,
          cotacaoUnitaria: 30,
        }),
      );
      expect(response.status).toBe(201);
      expect(mockPrisma.portfolio.delete).toHaveBeenCalledWith({ where: { id: 'port-stk' } });
      expect(mockRecalc).not.toHaveBeenCalled();
    });
  });
});

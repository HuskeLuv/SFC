import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  institution: { findFirst: vi.fn(), findUnique: vi.fn() },
  asset: { findUnique: vi.fn(), create: vi.fn() },
  stock: { findUnique: vi.fn() },
  stockTransaction: { create: vi.fn() },
  portfolio: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  fixedIncomeAsset: { create: vi.fn() },
  tesouroDiretoPrice: { findFirst: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
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
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));

const createRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/operacao', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('POST /api/carteira/operacao', () => {
  const mockUser = { id: 'user-123', email: 'test@test.com', name: 'Test' };
  const mockInstitution = { id: 'inst-1', codigo: '001', nome: 'Banco Test' };
  const mockAsset = {
    id: 'asset-1',
    symbol: 'RESERVA-EMERG-1',
    name: 'Reserva',
    type: 'emergency',
  };
  const mockStock = { id: 'stock-1', ticker: 'PETR4', companyName: 'Petrobras' };
  const mockTransaction = { id: 'tx-1', type: 'compra', quantity: 1, total: 1000 };
  const mockPortfolio = { id: 'port-1', quantity: 1, totalInvested: 1000 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.institution.findFirst.mockResolvedValue(mockInstitution);
    mockPrisma.institution.findUnique.mockResolvedValue(mockInstitution);
    mockPrisma.asset.create.mockResolvedValue(mockAsset);
    mockPrisma.asset.findUnique.mockResolvedValue(mockAsset);
    mockPrisma.stock.findUnique.mockResolvedValue(mockStock);
    mockPrisma.stockTransaction.create.mockResolvedValue(mockTransaction);
    mockPrisma.portfolio.create.mockResolvedValue(mockPortfolio);
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    mockPrisma.fixedIncomeAsset.create.mockResolvedValue({});
    mockPrisma.tesouroDiretoPrice.findFirst.mockResolvedValue(null);
  });

  describe('Autenticação', () => {
    it('retorna 401 quando não autorizado', async () => {
      mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
      const response = await POST(
        createRequest({
          tipoAtivo: 'emergency',
          instituicaoId: 'inst-1',
          dataCompra: '2024-01-15',
          valorInvestido: 1000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(401);
      expect(data.error).toContain('Não autorizado');
    });
  });

  describe('Validações obrigatórias', () => {
    it('retorna 400 quando tipoAtivo está ausente', async () => {
      const response = await POST(
        createRequest({
          instituicaoId: 'inst-1',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('tipoAtivo');
    });

    it('retorna 400 quando instituicaoId está ausente', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'reserva-emergencia',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('instituicaoId');
    });

    it('retorna 400 quando tipoAtivo é desconhecido', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'tipo-desconhecido',
          instituicaoId: 'inst-1',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('Tipo de ativo inválido');
      expect(data.error).toContain('tipo desconhecido');
    });

    it('retorna 404 quando usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const response = await POST(
        createRequest({
          tipoAtivo: 'emergency',
          instituicaoId: 'inst-1',
          dataCompra: '2024-01-15',
          valorInvestido: 1000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.error).toContain('Usuário não encontrado');
    });

    it('retorna 400 quando assetId ausente para tipo que requer assetId', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'acao',
          instituicaoId: 'inst-1',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('assetId');
    });
  });

  describe('Reserva de Emergência', () => {
    it('adiciona reserva de emergência com sucesso', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'emergency',
          instituicaoId: 'inst-1',
          ativo: 'CDB XP 105% CDI',
          dataCompra: '2024-01-15',
          valorInvestido: 1000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.message).toContain('sucesso');
      expect(mockPrisma.asset.create).toHaveBeenCalled();
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando dataCompra ausente para reserva', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'emergency',
          instituicaoId: 'inst-1',
          ativo: 'CDB XP',
          valorInvestido: 1000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('dataCompra');
    });

    it('retorna 400 quando valorInvestido ausente para reserva', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'emergency',
          instituicaoId: 'inst-1',
          ativo: 'CDB XP',
          dataCompra: '2024-01-15',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('valorInvestido');
    });

    it('retorna 400 quando nome do ativo ausente para reserva de emergência', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'emergency',
          instituicaoId: 'inst-1',
          dataCompra: '2024-01-15',
          valorInvestido: 1000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('Nome do ativo');
    });
  });

  describe('Reserva de Oportunidade', () => {
    it('adiciona reserva de oportunidade com sucesso', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'opportunity',
          instituicaoId: 'inst-1',
          ativo: 'Tesouro Selic 2029',
          dataCompra: '2024-01-15',
          valorInvestido: 5000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.create).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });
  });

  describe('Personalizado', () => {
    it('adiciona ativo personalizado com sucesso', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'personalizado',
          instituicaoId: 'inst-1',
          dataInicio: '2024-01-15',
          nomePersonalizado: 'Meu Investimento',
          quantidade: 10,
          precoUnitario: 100,
          metodo: 'valor',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.create).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando nomePersonalizado ausente', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'personalizado',
          instituicaoId: 'inst-1',
          dataInicio: '2024-01-15',
          quantidade: 10,
          precoUnitario: 100,
          metodo: 'valor',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('nomePersonalizado');
    });

    it('retorna 400 quando metodo inválido', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'personalizado',
          instituicaoId: 'inst-1',
          dataInicio: '2024-01-15',
          nomePersonalizado: 'Test',
          quantidade: 10,
          precoUnitario: 100,
          metodo: 'invalido',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('Método');
    });
  });

  describe('Ações', () => {
    it('adiciona ação com sucesso', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'acao',
          instituicaoId: 'inst-1',
          assetId: 'stock-1',
          dataCompra: '2024-01-15',
          quantidade: 100,
          cotacaoUnitaria: 10,
          estrategia: 'value',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.stock.findUnique).toHaveBeenCalledWith({ where: { id: 'stock-1' } });
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando estratégia ausente para ação', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'acao',
          instituicaoId: 'inst-1',
          assetId: 'stock-1',
          dataCompra: '2024-01-15',
          quantidade: 100,
          cotacaoUnitaria: 10,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('estrategia');
    });

    it('retorna 400 quando estratégia inválida', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'acao',
          instituicaoId: 'inst-1',
          assetId: 'stock-1',
          dataCompra: '2024-01-15',
          quantidade: 100,
          cotacaoUnitaria: 10,
          estrategia: 'invalida',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('Estratégia');
    });

    it('retorna 404 quando stock não encontrado', async () => {
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      const response = await POST(
        createRequest({
          tipoAtivo: 'acao',
          instituicaoId: 'inst-1',
          assetId: 'stock-inexistente',
          dataCompra: '2024-01-15',
          quantidade: 100,
          cotacaoUnitaria: 10,
          estrategia: 'value',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.error).toContain('não encontrado');
    });

    it('retorna 404 quando instituição não encontrada', async () => {
      mockPrisma.institution.findUnique.mockResolvedValue(null);
      const response = await POST(
        createRequest({
          tipoAtivo: 'acao',
          instituicaoId: 'inst-inexistente',
          assetId: 'stock-1',
          dataCompra: '2024-01-15',
          quantidade: 100,
          cotacaoUnitaria: 10,
          estrategia: 'value',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.error).toContain('Instituição');
    });
  });

  describe('FII', () => {
    it('adiciona FII com sucesso', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'fii',
          instituicaoId: 'inst-1',
          assetId: 'stock-1',
          dataCompra: '2024-01-15',
          quantidade: 50,
          cotacaoUnitaria: 20,
          tipoFii: 'tijolo',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.stock.findUnique).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando tipoFii ausente', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'fii',
          instituicaoId: 'inst-1',
          assetId: 'stock-1',
          dataCompra: '2024-01-15',
          quantidade: 50,
          cotacaoUnitaria: 20,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('FII');
    });
  });

  describe('Renda Fixa', () => {
    it('adiciona renda fixa pré-fixada com sucesso', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'renda-fixa',
          instituicaoId: 'inst-1',
          rendaFixaTipo: 'CDB_PRE',
          dataInicio: '2024-01-15',
          dataVencimento: '2025-01-15',
          valorAplicado: 10000,
          descricao: 'CDB Banco X',
          taxaJurosAnual: 12.5,
          rendaFixaIndexer: 'PRE',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.create).toHaveBeenCalled();
      expect(mockPrisma.fixedIncomeAsset.create).toHaveBeenCalled();
    });

    it('retorna 400 quando data de início >= data de vencimento', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'renda-fixa',
          instituicaoId: 'inst-1',
          rendaFixaTipo: 'CDB_PRE',
          dataInicio: '2025-01-15',
          dataVencimento: '2024-01-15',
          valorAplicado: 10000,
          descricao: 'CDB',
          taxaJurosAnual: 12.5,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('anterior');
    });
  });

  describe('Conta Corrente', () => {
    it('retorna 400 quando contaCorrenteDestino ausente', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'conta-corrente',
          instituicaoId: 'inst-1',
          dataInicio: '2024-01-15',
          valorAplicado: 5000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('contaCorrenteDestino');
    });

    it('retorna 400 quando contaCorrenteDestino inválido', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'conta-corrente',
          instituicaoId: 'inst-1',
          dataInicio: '2024-01-15',
          valorAplicado: 5000,
          contaCorrenteDestino: 'invalido',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('reserva-emergencia ou reserva-oportunidade');
    });
  });

  describe('Stocks (ações US)', () => {
    it('adiciona stock com sucesso', async () => {
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-1',
        symbol: 'AAPL',
        name: 'Apple',
        type: 'stock',
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'stock',
          instituicaoId: 'inst-1',
          assetId: 'asset-1',
          dataCompra: '2024-01-15',
          quantidade: 10,
          cotacaoUnitaria: 150,
          moeda: 'USD',
          cotacaoMoeda: 5.2,
          estrategia: 'growth',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({ where: { id: 'asset-1' } });
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando moeda ausente para stock', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'stock',
          instituicaoId: 'inst-1',
          assetId: 'asset-1',
          dataCompra: '2024-01-15',
          quantidade: 10,
          cotacaoUnitaria: 150,
          cotacaoMoeda: 5.2,
          estrategia: 'growth',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('moeda');
    });

    it('retorna 400 quando cotacaoMoeda inválida (<= 0)', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'stock',
          instituicaoId: 'inst-1',
          assetId: 'asset-1',
          dataCompra: '2024-01-15',
          quantidade: 10,
          cotacaoUnitaria: 150,
          moeda: 'USD',
          cotacaoMoeda: -1,
          estrategia: 'growth',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('maiores que zero');
    });
  });

  describe('Criptoativos', () => {
    it('adiciona criptoativo com sucesso', async () => {
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-btc',
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'criptoativo',
          instituicaoId: 'inst-1',
          assetId: 'asset-btc',
          dataCompra: '2024-01-15',
          quantidade: 0.5,
          cotacaoCompra: 40000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({ where: { id: 'asset-btc' } });
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando cotacaoCompra ausente', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'criptoativo',
          instituicaoId: 'inst-1',
          assetId: 'asset-btc',
          dataCompra: '2024-01-15',
          quantidade: 0.5,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('cotacaoCompra');
    });

    it('retorna 400 quando assetId ausente para criptoativo', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'criptoativo',
          instituicaoId: 'inst-1',
          dataCompra: '2024-01-15',
          quantidade: 0.5,
          cotacaoCompra: 40000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('assetId');
      expect(mockPrisma.portfolio.create).not.toHaveBeenCalled();
    });

    it('retorna 400 quando quantidade ou cotacaoCompra <= 0', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'criptoativo',
          instituicaoId: 'inst-1',
          assetId: 'asset-btc',
          dataCompra: '2024-01-15',
          quantidade: -0.5,
          cotacaoCompra: 40000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('maiores que zero');
    });
  });

  describe('Moedas', () => {
    it('adiciona moeda com sucesso', async () => {
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-usd',
        symbol: 'USD',
        name: 'Dólar',
        type: 'currency',
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'moeda',
          instituicaoId: 'inst-1',
          assetId: 'asset-usd',
          dataCompra: '2024-01-15',
          quantidade: 1000,
          cotacaoCompra: 5.2,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({ where: { id: 'asset-usd' } });
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando assetId ausente para moeda', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'moeda',
          instituicaoId: 'inst-1',
          dataCompra: '2024-01-15',
          quantidade: 1000,
          cotacaoCompra: 5.2,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('assetId');
    });
  });

  describe('BDR e ETF', () => {
    it('adiciona BDR com sucesso', async () => {
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-bdr',
        symbol: 'AAPL34',
        name: 'Apple BDR',
        type: 'bdr',
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'bdr',
          instituicaoId: 'inst-1',
          assetId: 'asset-bdr',
          dataCompra: '2024-01-15',
          quantidade: 20,
          cotacaoUnitaria: 25,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({ where: { id: 'asset-bdr' } });
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('adiciona ETF com sucesso', async () => {
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-etf',
        symbol: 'BOVA11',
        name: 'iShares Ibovespa',
        type: 'etf',
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'etf',
          instituicaoId: 'inst-1',
          assetId: 'asset-etf',
          dataCompra: '2024-01-15',
          quantidade: 100,
          cotacaoUnitaria: 12.5,
          regiaoEtf: 'brasil',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.findUnique).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando quantidade ou cotacaoUnitaria <= 0 para BDR', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'bdr',
          instituicaoId: 'inst-1',
          assetId: 'asset-bdr',
          dataCompra: '2024-01-15',
          quantidade: -1,
          cotacaoUnitaria: 25,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('maiores que zero');
    });
  });

  describe('REIT', () => {
    it('adiciona REIT com assetId com sucesso', async () => {
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-reit',
        symbol: 'O',
        name: 'Realty Income',
        type: 'reit',
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'reit',
          instituicaoId: 'inst-1',
          assetId: 'asset-reit',
          dataCompra: '2024-01-15',
          quantidade: 50,
          cotacaoUnitaria: 20,
          cotacaoMoeda: 5.2,
          estrategiaReit: 'value',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({ where: { id: 'asset-reit' } });
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('adiciona REIT manual com sucesso', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'reit',
          instituicaoId: 'inst-1',
          assetId: 'REIT-MANUAL',
          ativo: 'O',
          dataCompra: '2024-01-15',
          quantidade: 30,
          cotacaoUnitaria: 55,
          cotacaoMoeda: 5.2,
          estrategiaReit: 'growth',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.create).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando estrategiaReit ausente para REIT', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'reit',
          instituicaoId: 'inst-1',
          assetId: 'asset-reit',
          dataCompra: '2024-01-15',
          quantidade: 50,
          cotacaoUnitaria: 20,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('estrategiaReit');
    });

    it('retorna 400 quando nome ausente para REIT manual', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'reit',
          instituicaoId: 'inst-1',
          assetId: 'REIT-MANUAL',
          ativo: '',
          dataCompra: '2024-01-15',
          quantidade: 30,
          cotacaoUnitaria: 55,
          cotacaoMoeda: 5.2,
          estrategiaReit: 'growth',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('REIT');
    });
  });

  describe('Debênture', () => {
    it('adiciona debênture manual com sucesso', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'debenture',
          instituicaoId: 'inst-1',
          assetId: 'DEBENTURE-MANUAL',
          ativo: 'Debênture XYZ',
          dataCompra: '2024-01-15',
          quantidade: 100,
          cotacaoUnitaria: 10,
          metodo: 'cotas',
          tipoDebenture: 'prefixada',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.create).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando tipoDebenture ausente', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'debenture',
          instituicaoId: 'inst-1',
          assetId: 'asset-deb',
          dataCompra: '2024-01-15',
          valorInvestido: 10000,
          metodo: 'valor',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('debênture');
    });

    it('retorna 400 quando tipoDebenture inválido', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'debenture',
          instituicaoId: 'inst-1',
          assetId: 'asset-deb',
          dataCompra: '2024-01-15',
          valorInvestido: 10000,
          metodo: 'valor',
          tipoDebenture: 'invalido',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('Pré-fixada');
    });
  });

  describe('Fundo', () => {
    it('adiciona fundo manual com sucesso', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'fundo',
          instituicaoId: 'inst-1',
          assetId: 'FUNDO-MANUAL',
          ativo: 'Fundo XYZ Multimercado',
          dataCompra: '2024-01-15',
          quantidade: 100,
          cotacaoUnitaria: 15,
          metodo: 'cotas',
          fundoDestino: 'fim',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.create).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('retorna 400 quando fundoDestino ausente', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'fundo',
          instituicaoId: 'inst-1',
          assetId: 'FUNDO-MANUAL',
          ativo: 'Fundo XYZ',
          dataCompra: '2024-01-15',
          valorInvestido: 5000,
          metodo: 'valor',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('fundo deve aparecer');
    });

    it('retorna 400 quando nome do fundo ausente para manual', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'fundo',
          instituicaoId: 'inst-1',
          assetId: 'FUNDO-MANUAL',
          ativo: '   ',
          dataCompra: '2024-01-15',
          valorInvestido: 5000,
          metodo: 'valor',
          fundoDestino: 'fim',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('Nome do fundo');
    });
  });

  describe('Tesouro Direto e Previdência', () => {
    it('adiciona tesouro direto por valor com sucesso', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'tesouro-direto',
          instituicaoId: 'inst-1',
          assetId: 'asset-td',
          dataCompra: '2024-01-15',
          valorInvestido: 5000,
          metodo: 'valor',
          tesouroDestino: 'reserva-emergencia',
          cotizacaoResgate: 'D+1',
          liquidacaoResgate: 'D+1',
          vencimento: '2029-01-01',
          benchmark: 'Selic',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.asset.findUnique).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });

    it('popula tesouroBondType e tesouroMaturity quando tesouro do catálogo vai para renda fixa', async () => {
      const exactMaturity = new Date('2029-03-01');
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-td-cat',
        symbol: 'TD-TESOURO-SELIC-2029',
        name: 'Tesouro Selic 2029',
        type: 'tesouro-direto',
      });
      mockPrisma.tesouroDiretoPrice.findFirst.mockResolvedValueOnce({
        maturityDate: exactMaturity,
      });

      const response = await POST(
        createRequest({
          tipoAtivo: 'tesouro-direto',
          instituicaoId: 'inst-1',
          assetId: 'asset-td-cat',
          dataCompra: '2024-01-15',
          valorInvestido: 5000,
          metodo: 'valor',
          tesouroDestino: 'renda-fixa-posfixada',
          dataInicio: '2024-01-15',
          dataVencimento: '2029-03-01',
          taxaJurosAnual: 100,
          rendaFixaIndexer: 'CDI',
          rendaFixaIndexerPercent: 100,
          descricao: 'Tesouro Selic 2029',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.tesouroDiretoPrice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ bondType: 'Tesouro Selic' }),
        }),
      );
      expect(mockPrisma.fixedIncomeAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tesouroBondType: 'Tesouro Selic',
            tesouroMaturity: exactMaturity,
          }),
        }),
      );
    });

    it('não popula tesouroBondType para tesouro destinado a reserva', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'tesouro-direto',
          instituicaoId: 'inst-1',
          assetId: 'asset-td',
          dataCompra: '2024-01-15',
          valorInvestido: 5000,
          metodo: 'valor',
          tesouroDestino: 'reserva-emergencia',
          cotizacaoResgate: 'D+1',
          liquidacaoResgate: 'D+1',
          vencimento: '2029-01-01',
          benchmark: 'Selic',
        }),
      );
      expect(response.status).toBe(201);
      // Reservas don't go through the FixedIncomeAsset.create path at all
      expect(mockPrisma.fixedIncomeAsset.create).not.toHaveBeenCalled();
      expect(mockPrisma.tesouroDiretoPrice.findFirst).not.toHaveBeenCalled();
    });

    it('adiciona previdência por cotas com sucesso', async () => {
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-prev',
        symbol: 'PREV-XP',
        name: 'XP Previdência',
        type: 'previdencia',
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'previdencia',
          instituicaoId: 'inst-1',
          assetId: 'asset-prev',
          dataCompra: '2024-01-15',
          quantidade: 50,
          cotacaoUnitaria: 100,
          metodo: 'cotas',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.portfolio.create).toHaveBeenCalled();
    });
  });

  describe('Poupança', () => {
    it('retorna 400 quando dataInicio ou valorAplicado ausentes', async () => {
      const response = await POST(
        createRequest({
          tipoAtivo: 'poupanca',
          instituicaoId: 'inst-1',
          assetId: 'asset-poupanca',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain('dataInicio');
    });
  });

  describe('Asset não encontrado', () => {
    it('retorna 404 quando asset não existe para criptoativo', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);
      const response = await POST(
        createRequest({
          tipoAtivo: 'criptoativo',
          instituicaoId: 'inst-1',
          assetId: 'asset-inexistente',
          dataCompra: '2024-01-15',
          quantidade: 0.5,
          cotacaoCompra: 40000,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.error).toContain('não encontrado');
    });
  });

  describe('Defensive type validation (phase B)', () => {
    // Regression: before Phase B, a catalog asset whose type drifted from
    // what the category GET filter expects could be added to the Portfolio
    // successfully, but would never appear in its table.
    it('retorna 400 quando ETF aponta para asset com type errado', async () => {
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-wrong',
        symbol: 'FOO',
        name: 'Foo',
        type: 'insurance',
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'etf',
          instituicaoId: 'inst-1',
          assetId: 'asset-wrong',
          dataCompra: '2024-01-15',
          quantidade: 10,
          cotacaoUnitaria: 100,
          regiaoEtf: 'brasil',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error.toLowerCase()).toContain('tipo');
      expect(mockPrisma.portfolio.create).not.toHaveBeenCalled();
    });

    it('retorna 400 quando previdencia aponta para asset com type legado insurance', async () => {
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-legacy',
        symbol: 'PREV-LEG',
        name: 'Previdência Legado',
        type: 'insurance',
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'previdencia',
          instituicaoId: 'inst-1',
          assetId: 'asset-legacy',
          dataCompra: '2024-01-15',
          quantidade: 10,
          cotacaoUnitaria: 100,
          metodo: 'cotas',
        }),
      );
      expect(response.status).toBe(400);
      expect(mockPrisma.portfolio.create).not.toHaveBeenCalled();
    });

    it('permite criptoativo com type=currency (aceita família crypto/currency/metal/commodity)', async () => {
      mockPrisma.asset.findUnique.mockResolvedValueOnce({
        id: 'asset-stable',
        symbol: 'USDC',
        name: 'USD Coin',
        type: 'currency',
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'criptoativo',
          instituicaoId: 'inst-1',
          assetId: 'asset-stable',
          dataCompra: '2024-01-15',
          quantidade: 100,
          cotacaoCompra: 5,
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    });
  });

  describe('Atualização de portfolio existente', () => {
    it('atualiza portfolio existente ao adicionar mais ação', async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        id: 'port-1',
        quantity: 50,
        totalInvested: 500,
        avgPrice: 10,
      });
      const response = await POST(
        createRequest({
          tipoAtivo: 'acao',
          instituicaoId: 'inst-1',
          assetId: 'stock-1',
          dataCompra: '2024-01-15',
          quantidade: 50,
          cotacaoUnitaria: 12,
          estrategia: 'value',
        }),
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.portfolio.update).toHaveBeenCalled();
      expect(mockPrisma.portfolio.create).not.toHaveBeenCalled();
    });
  });
});

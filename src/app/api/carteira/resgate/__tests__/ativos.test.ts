import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../ativos/route';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-123' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const createRequest = (params: Record<string, string>) => {
  const url = new URL('http://localhost/api/carteira/resgate/ativos');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
};

describe('GET /api/carteira/resgate/ativos', () => {
  const mockPortfolioAcao = {
    id: 'port-1',
    stockId: 'stock-1',
    assetId: null,
    stock: { ticker: 'PETR4', companyName: 'Petrobras' },
    asset: null,
  };

  const mockPortfolioCrypto = {
    id: 'port-crypto',
    stockId: null,
    assetId: 'asset-btc',
    stock: null,
    asset: { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', currency: 'USD' },
    quantity: 0.5,
    avgPrice: 100000,
    totalInvested: 50000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  });

  it('retorna 400 quando tipo ou instituicaoId estão ausentes', async () => {
    const response = await GET(createRequest({ tipo: 'criptoativo' }));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('obrigatórios');
  });

  it('retorna ativos de criptoativos corretamente (apenas assetId)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { ...mockPortfolioCrypto, userId: 'user-123' },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        assetId: 'asset-btc',
        stockId: null,
        type: 'compra',
        notes: JSON.stringify({ operation: { instituicaoId: 'inst-1' } }),
      },
    ]);

    const response = await GET(
      createRequest({
        tipo: 'criptoativo',
        instituicaoId: 'inst-1',
        search: '',
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.assets).toBeDefined();
    expect(Array.isArray(data.assets)).toBe(true);
  });

  // Auditoria 2026-08-06 achado #1: a cópia inline do mapper mapeava bond →
  // 'renda-fixa-prefixada' e o filtro era igualdade estrita — RF nunca aparecia
  // no Step3 do resgate (nem no aporte, que usa a mesma rota).
  describe('renda fixa (bond) — regressão do mapper divergente', () => {
    const mockPortfolioBond = {
      id: 'port-cdb',
      userId: 'user-123',
      stockId: null,
      assetId: 'asset-cdb',
      stock: null,
      asset: { symbol: 'RENDA-FIXA-1', name: 'CDB Banco X', type: 'bond', currency: 'BRL' },
      quantity: 1,
      avgPrice: 10000,
      totalInvested: 10000,
    };

    const compraComInstituicao = {
      id: 'tx-1',
      assetId: 'asset-cdb',
      type: 'compra',
      notes: JSON.stringify({ operation: { instituicaoId: 'inst-1' } }),
    };

    it('aparece com tipo=renda-fixa (o que o /resgate/tipos emite)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([mockPortfolioBond]);
      mockPrisma.stockTransaction.findMany.mockResolvedValue([compraComInstituicao]);

      const response = await GET(createRequest({ tipo: 'renda-fixa', instituicaoId: 'inst-1' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.assets).toHaveLength(1);
      expect(data.assets[0].assetId).toBe('asset-cdb');
    });

    it('aceita a família renda-fixa-* (matchesTipo tolerante)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([mockPortfolioBond]);
      mockPrisma.stockTransaction.findMany.mockResolvedValue([compraComInstituicao]);

      const response = await GET(
        createRequest({ tipo: 'renda-fixa-prefixada', instituicaoId: 'inst-1' }),
      );
      const data = await response.json();
      expect(data.assets).toHaveLength(1);
    });
  });

  it('filtra portfolios legados sem assetId (POST rejeitaria com 400)', async () => {
    // Rodada 3 (achado #12): a listagem oferecia posições que o resgate não
    // consegue processar — o Step3 deixava selecionar e o POST criava venda órfã.
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { ...mockPortfolioAcao, userId: 'user-123', quantity: 10, avgPrice: 5, totalInvested: 50 },
    ]);

    const response = await GET(createRequest({ tipo: 'personalizado', instituicaoId: 'unknown' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.assets).toHaveLength(0);
  });

  describe('Tesouro comprado para reserva (bug ago/2026)', () => {
    const mockPortfolioTesouroReserva = {
      id: 'port-td',
      userId: 'user-123',
      stockId: null,
      assetId: 'asset-td',
      stock: null,
      asset: {
        symbol: 'TD-TESOURO-SELIC-2031',
        name: 'Tesouro Selic 2031',
        type: 'tesouro-direto',
        currency: 'BRL',
      },
      quantity: 2.68,
      avgPrice: 19058,
      totalInvested: 51082.52,
    };
    const txComDestino = {
      id: 'tx-td',
      assetId: 'asset-td',
      stockId: null,
      type: 'compra',
      notes: JSON.stringify({
        tesouroDestino: 'reserva-emergencia',
        operation: { instituicaoId: 'inst-1' },
      }),
    };

    it('aparece em reserva-emergencia quando a compra marcou tesouroDestino', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([mockPortfolioTesouroReserva]);
      mockPrisma.stockTransaction.findMany.mockResolvedValue([txComDestino]);

      const response = await GET(
        createRequest({ tipo: 'reserva-emergencia', instituicaoId: 'inst-1', search: '' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.assets).toHaveLength(1);
      expect(data.assets[0].symbol).toBe('TD-TESOURO-SELIC-2031');
    });

    it('NÃO aparece mais em renda-fixa quando destinado à reserva', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([mockPortfolioTesouroReserva]);
      mockPrisma.stockTransaction.findMany.mockResolvedValue([txComDestino]);

      const response = await GET(
        createRequest({ tipo: 'renda-fixa', instituicaoId: 'inst-1', search: '' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.assets).toHaveLength(0);
    });

    it('Tesouro SEM destino segue em renda-fixa (regressão)', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([mockPortfolioTesouroReserva]);
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        { ...txComDestino, notes: JSON.stringify({ operation: { instituicaoId: 'inst-1' } }) },
      ]);

      const response = await GET(
        createRequest({ tipo: 'renda-fixa', instituicaoId: 'inst-1', search: '' }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.assets).toHaveLength(1);
    });
  });

  it('retorna ativos de ações corretamente (apenas stockId)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([{ ...mockPortfolioAcao, userId: 'user-123' }]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        stockId: 'stock-1',
        assetId: null,
        type: 'compra',
        notes: JSON.stringify({ operation: { instituicaoId: 'inst-1' } }),
      },
    ]);

    const response = await GET(
      createRequest({
        tipo: 'acao',
        instituicaoId: 'inst-1',
        search: '',
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.assets).toBeDefined();
  });
});

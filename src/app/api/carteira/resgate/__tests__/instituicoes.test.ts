import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../instituicoes/route';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  institution: { findMany: vi.fn() },
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
  const url = new URL('http://localhost/api/carteira/resgate/instituicoes');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
};

describe('GET /api/carteira/resgate/instituicoes', () => {
  const mockPortfolioCrypto = {
    id: 'port-crypto',
    stockId: null,
    assetId: 'asset-btc',
    stock: null,
    asset: { symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.institution.findMany.mockResolvedValue([]);
  });

  it('retorna 400 quando tipo está ausente', async () => {
    const response = await GET(createRequest({}));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('obrigatório');
  });

  it('retorna instituições para criptoativos (apenas assetIds, sem stockIds)', async () => {
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
    mockPrisma.institution.findMany.mockResolvedValue([
      { id: 'inst-1', nome: 'Binance', codigo: 'BIN', status: 'ATIVA' },
    ]);

    const response = await GET(createRequest({ tipo: 'criptoativo', search: '' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.instituicoes).toBeDefined();
    expect(Array.isArray(data.instituicoes)).toBe(true);
  });

  it('não cria o balde "não informada" para portfolio legado sem assetId', async () => {
    // Rodada 3 (achado #12): posições sem vínculo de Asset não são resgatáveis
    // (POST rejeita com 400) — não devem produzir a opção 'unknown' no Step2.
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { id: 'port-legacy', userId: 'user-123', stockId: 'stock-1', assetId: null, asset: null },
    ]);

    const response = await GET(createRequest({ tipo: 'personalizado', search: '' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.instituicoes).toHaveLength(0);
  });

  it("retorna 'Instituição não informada' quando crypto não tem instituição nas transações", async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { ...mockPortfolioCrypto, userId: 'user-123' },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const response = await GET(createRequest({ tipo: 'criptoativo', search: '' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.instituicoes).toContainEqual({
      value: 'unknown',
      label: 'Instituição não informada',
    });
  });

  it("mantém a opção 'unknown' quando o search é o próprio label selecionado", async () => {
    // Rodada 3 (achado #15): ao selecionar a opção, o InstitutionPicker refaz
    // o fetch com search="instituição não informada" — o match antigo era só
    // contra "não informada" e a opção sumia do dropdown.
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { ...mockPortfolioCrypto, userId: 'user-123' },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const response = await GET(
      createRequest({ tipo: 'criptoativo', search: 'Instituição não informada' }),
    );
    const data = await response.json();

    expect(data.instituicoes).toContainEqual({
      value: 'unknown',
      label: 'Instituição não informada',
    });
  });

  it("segue casando prefixos parciais como 'não inf'", async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { ...mockPortfolioCrypto, userId: 'user-123' },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const response = await GET(createRequest({ tipo: 'criptoativo', search: 'não inf' }));
    const data = await response.json();

    expect(data.instituicoes).toContainEqual({
      value: 'unknown',
      label: 'Instituição não informada',
    });
  });
});

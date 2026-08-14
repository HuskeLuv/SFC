import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  fixedIncomeAsset: { findMany: vi.fn().mockResolvedValue([]) },
  economicIndex: { findMany: vi.fn().mockResolvedValue([]) },
  tesouroDiretoPrice: { findMany: vi.fn().mockResolvedValue([]) },
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

import { GET } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/reserva-emergencia', {
    method: 'GET',
  });

describe('GET /api/carteira/reserva-emergencia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('retorna dados da reserva de emergência', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    // First findMany: allUserPortfolio (filtered for emergency)
    // Second findMany: allPortfolio (for totals)
    mockPrisma.portfolio.findMany
      .mockResolvedValueOnce([
        {
          id: 'port-1',
          userId: 'user-1',
          quantity: 1,
          avgPrice: 10000,
          totalInvested: 10000,
          assetId: 'asset-1',
          asset: {
            id: 'asset-1',
            name: 'Reserva CDB',
            type: 'emergency',
            symbol: 'RESERVA-EMERG-1',
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'port-1',
          userId: 'user-1',
          quantity: 1,
          avgPrice: 10000,
          totalInvested: 10000,
          assetId: 'asset-1',
          asset: {
            id: 'asset-1',
            name: 'Reserva CDB',
            type: 'emergency',
            symbol: 'RESERVA-EMERG-1',
          },
          stock: null,
        },
      ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.ativos).toBeDefined();
    expect(data.ativos.length).toBe(1);
    expect(data.saldoInicioMes).toBeDefined();
    expect(data.rendimento).toBeDefined();
    expect(data.rentabilidade).toBeDefined();
  });

  it('rentabilidade desconta o RESGATE da base (report 14/08 — CDB com resgate mostrava −32%)', async () => {
    // Números reais do print: inicial 4.185,00, resgate 1.341,31, atual
    // 2.843,69. Fórmula canônica: atual / (inicial + aportes − resgates) − 1
    // = 2.843,69 / 2.843,69 − 1 = 0%. A fórmula antiga dava −32,05%.
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    const item = {
      id: 'port-cdb',
      userId: 'user-1',
      quantity: 1,
      avgPrice: 2843.69,
      totalInvested: 2843.69,
      assetId: 'asset-cdb',
      asset: {
        id: 'asset-cdb',
        name: 'CDB 100% CDI',
        type: 'emergency',
        symbol: 'RESERVA-EMERG-CDB',
      },
    };
    mockPrisma.portfolio.findMany
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([{ ...item, stock: null }]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { id: 'tx-c', assetId: 'asset-cdb', type: 'compra', total: 4185, notes: null },
      { id: 'tx-v', assetId: 'asset-cdb', type: 'venda', total: 1341.31, notes: null },
    ]);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ativos[0].valorInicial).toBe(4185);
    expect(data.ativos[0].resgate).toBeCloseTo(1341.31, 2);
    expect(data.ativos[0].rentabilidade).toBe(0);
    // Totais (card + linha TOTAL GERAL) usam a mesma base com fluxos.
    expect(data.rendimento).toBeCloseTo(0, 2);
    expect(data.rentabilidade).toBeCloseTo(0, 6);
  });

  it('retorna lista vazia quando não há reservas', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.portfolio.findMany
      .mockResolvedValueOnce([]) // allUserPortfolio
      .mockResolvedValueOnce([]); // allPortfolio
    // No transactions queried when assetIds is empty

    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.ativos).toEqual([]);
    expect(data.saldoInicioMes).toBe(0);
  });

  it('retorna 404 quando usuário não encontrado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toContain('Usuário não encontrado');
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('inclui Tesouro Direto do catálogo quando destino é reserva-emergencia', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    const tesouroPortfolioItem = {
      id: 'port-tesouro',
      userId: 'user-1',
      quantity: 1,
      avgPrice: 15000,
      totalInvested: 15000,
      assetId: 'asset-tesouro',
      asset: {
        id: 'asset-tesouro',
        name: 'Tesouro Selic 2029',
        type: 'tesouro-direto',
        symbol: 'TESOURO-SELIC-2029',
      },
    };
    mockPrisma.portfolio.findMany
      .mockResolvedValueOnce([tesouroPortfolioItem])
      .mockResolvedValueOnce([{ ...tesouroPortfolioItem, stock: null }]);
    mockPrisma.stockTransaction.findMany
      .mockResolvedValueOnce([
        {
          assetId: 'asset-tesouro',
          notes: JSON.stringify({
            tesouroDestino: 'reserva-emergencia',
            benchmark: 'SELIC',
          }),
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ativos).toHaveLength(1);
    expect(data.ativos[0].nome).toBe('Tesouro Selic 2029');
  });
});

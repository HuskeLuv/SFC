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
  new NextRequest('http://localhost/api/carteira/reserva-oportunidade', {
    method: 'GET',
  });

describe('GET /api/carteira/reserva-oportunidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('retorna dados da reserva de oportunidade', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.portfolio.findMany
      .mockResolvedValueOnce([
        {
          id: 'port-1',
          userId: 'user-1',
          quantity: 1,
          avgPrice: 5000,
          totalInvested: 5000,
          assetId: 'asset-1',
          asset: {
            id: 'asset-1',
            name: 'Reserva Oportunidade CDB',
            type: 'opportunity',
            symbol: 'RESERVA-OPORT-1',
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'port-1',
          userId: 'user-1',
          quantity: 1,
          avgPrice: 5000,
          totalInvested: 5000,
          assetId: 'asset-1',
          asset: {
            id: 'asset-1',
            name: 'Reserva Oportunidade CDB',
            type: 'opportunity',
            symbol: 'RESERVA-OPORT-1',
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

  it('retorna lista vazia quando não há reservas de oportunidade', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.portfolio.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

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

  it('inclui Tesouro Direto do catálogo quando destino é reserva-oportunidade', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    const tesouroPortfolioItem = {
      id: 'port-tesouro',
      userId: 'user-1',
      quantity: 1,
      avgPrice: 10000,
      totalInvested: 10000,
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
            tesouroDestino: 'reserva-oportunidade',
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

  it('não inclui Tesouro Direto cujo destino é renda-fixa', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    const tesouroPortfolioItem = {
      id: 'port-tesouro',
      userId: 'user-1',
      quantity: 1,
      avgPrice: 10000,
      totalInvested: 10000,
      assetId: 'asset-tesouro',
      asset: {
        id: 'asset-tesouro',
        name: 'Tesouro Prefixado 2027',
        type: 'tesouro-direto',
        symbol: 'TESOURO-PRE-2027',
      },
    };
    mockPrisma.portfolio.findMany
      .mockResolvedValueOnce([tesouroPortfolioItem])
      .mockResolvedValueOnce([{ ...tesouroPortfolioItem, stock: null }]);
    mockPrisma.stockTransaction.findMany
      .mockResolvedValueOnce([
        {
          assetId: 'asset-tesouro',
          notes: JSON.stringify({ tesouroDestino: 'renda-fixa-prefixada' }),
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(createGetRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ativos).toHaveLength(0);
  });
});
